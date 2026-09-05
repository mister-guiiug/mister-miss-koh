/**
 * Point d'entrée HTTP de l'import.
 *
 * CE FICHIER NE DÉCIDE RIEN. Il authentifie, il traduit le port en SQL, il
 * rend une réponse. Toutes les décisions — s'arrêter sur une révision connue,
 * refuser une structure incomprise, classer une différence, valider ou non —
 * vivent dans `_shared/import-run.ts`, qui se teste sans base. Ce qui reste
 * ici est du câblage, et le câblage se relit ; il ne se prouve pas par un test
 * unitaire.
 *
 * DEUX PORTES D'ENTRÉE, ET AUCUNE AUTRE :
 *
 *  1. un utilisateur authentifié qui porte le rôle `admin` ou `validator`.
 *     Le rôle est vérifié CÔTÉ SERVEUR, en interrogeant `user_roles` avec la
 *     clé de service : une revendication de rôle placée dans un jeton par un
 *     client ne prouve rien ;
 *  2. la planification, qui présente `IMPORT_CRON_SECRET`. Comparé à temps
 *     constant, parce qu'une comparaison naïve laisse mesurer le secret.
 *
 * LA CLÉ `service_role` NE SORT JAMAIS D'ICI. Elle est lue dans
 * l'environnement de la fonction, n'apparaît dans aucune réponse et dans aucun
 * journal.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type ImportPolicy,
  type ImportPort,
  runImport,
  type SourceDocument,
} from "../_shared/import-run.ts";
import type { Difference, IncomingRecord, StoredRecord } from "../_shared/diff.ts";
import {
  type CataloguePage,
  type CataloguePort,
  discoverSeasons,
} from "../_shared/catalogue.ts";
import type { WikiConfig } from "../_shared/mediawiki.ts";

const USER_AGENT = Deno.env.get("IMPORT_USER_AGENT") ??
  "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";

/** Comparaison à temps constant : la durée ne doit rien apprendre. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Traduit le port en SQL. Aucune décision ici. */
function makePort(admin: SupabaseClient): ImportPort {
  return {
    async loadDocument(documentId) {
      const { data } = await admin
        .from("source_documents")
        .select("id, title, url, reference_sources(api_url), seasons(slug)")
        .eq("id", documentId)
        .maybeSingle();
      if (!data) return null;
      const source = data as unknown as {
        id: string;
        title: string;
        reference_sources: { api_url: string | null } | null;
        // Relation INVERSE (c'est `seasons` qui référence `source_documents`) :
        // PostgREST rend un tableau, jamais un objet. Le premier `.slug`
        // lu comme un objet aurait valu `undefined`, et la saison « ».
        seasons: { slug: string }[] | null;
      };
      const apiUrl = source.reference_sources?.api_url;
      if (!apiUrl) return null;
      return {
        id: source.id,
        title: source.title,
        apiUrl,
        seasonSlug: source.seasons?.[0]?.slug ?? "",
      } satisfies SourceDocument;
    },

    async lastImportedRevision(documentId) {
      const { data } = await admin
        .from("import_runs")
        .select("source_revision")
        .eq("source_document_id", documentId)
        .in("status", ["diffed", "published", "unchanged"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.source_revision ?? null;
    },

    async lastExtractorVersion(documentId) {
      const { data } = await admin
        .from("import_runs")
        .select("extractor_version")
        .eq("source_document_id", documentId)
        .in("status", ["diffed", "published", "unchanged"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.extractor_version ?? null;
    },

    async lastExtractHash(documentId) {
      const { data } = await admin
        .from("import_runs")
        .select("extract_hash")
        .eq("source_document_id", documentId)
        .not("extract_hash", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.extract_hash ?? null;
    },

    async createRun({ documentId, trigger, actorId }) {
      const { data, error } = await admin
        .from("import_runs")
        .insert({
          source_document_id: documentId,
          trigger,
          triggered_by: actorId,
          status: "running",
        })
        .select("id")
        .single();
      if (error) throw new Error(`création de l'exécution impossible : ${error.message}`);
      return data.id as string;
    },

    async finishRun(runId, patch) {
      await admin
        .from("import_runs")
        .update({
          status: patch.status,
          finished_at: new Date().toISOString(),
          source_revision: patch.revision ?? null,
          source_revision_at: patch.revisedAt ?? null,
          extractor_version: patch.extractorVersion ?? null,
          extract_hash: patch.extractHash ?? null,
          error_message: patch.error ?? null,
          differences_total: patch.differencesTotal ?? 0,
          differences_ambiguous: patch.differencesAmbiguous ?? 0,
        })
        .eq("id", runId);
    },

    async saveRecords(runId, records: readonly IncomingRecord[]) {
      if (records.length === 0) return;
      await admin.from("import_records").insert(
        records.map((r) => ({
          run_id: runId,
          entity: r.entity,
          natural_key: r.naturalKey,
          payload: r.payload,
          anomalies: r.anomalies ?? [],
        })),
      );
    },

    async loadPublished(documentId, entities) {
      // ON COMPARE AU DERNIER MODÈLE PUBLIÉ, PAS AUX TABLES DU RÉFÉRENTIEL.
      //
      // Le diff raisonne sur le modèle intermédiaire ; les tables, elles, ont
      // une forme relationnelle. Reprojeter l'une vers l'autre serait une
      // traduction de plus à maintenir, et toute perte dans la traduction
      // produirait des différences fantômes à chaque import.
      //
      // Les `import_records` de la dernière exécution PUBLIÉE sont exactement
      // l'état publié, dans la forme où il a été comparé la fois précédente.
      const { data: lastPublished } = await admin
        .from("import_runs")
        .select("id")
        .eq("source_document_id", documentId)
        .eq("status", "published")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Aucune publication : tout est nouveau, et rien ne peut être supprimé.
      if (!lastPublished?.id) return [];

      const { data } = await admin
        .from("import_records")
        .select("entity, natural_key, payload")
        .eq("run_id", lastPublished.id)
        .in("entity", entities);

      return (data ?? []).map((row) => ({
        entity: row.entity,
        naturalKey: row.natural_key,
        payload: row.payload,
        published: true,
      })) as StoredRecord[];
    },

    async saveDifferences(runId, differences: readonly Difference[]) {
      if (differences.length === 0) return;
      await admin.from("import_differences").insert(
        differences.map((d) => ({
          run_id: runId,
          entity: d.entity,
          natural_key: d.naturalKey,
          operation: d.operation,
          class: d.class,
          before_value: d.beforeValue,
          after_value: d.afterValue,
          changed_fields: d.changedFields,
          status: "pending_review",
          review_comment: d.reasons.join(" ; "),
        })),
      );
    },

    async autoValidateDifferences(runId, keys) {
      for (const key of keys) {
        const [entity, ...rest] = key.split(":");
        await admin
          .from("import_differences")
          .update({ status: "validated", reviewed_at: new Date().toISOString() })
          .eq("run_id", runId)
          .eq("entity", entity)
          .eq("natural_key", rest.join(":"));
      }
    },

    async loadPolicy(documentId): Promise<ImportPolicy> {
      const { data } = await admin
        .from("import_policies")
        .select("auto_validate_unambiguous, max_auto_changes")
        .eq("source_document_id", documentId)
        .is("entity", null)
        .maybeSingle();
      // ABSENCE DE POLITIQUE = AUCUNE AUTOMATISATION. Le défaut ne doit pas
      // être permissif : une politique qui n'a jamais été écrite n'autorise
      // rien.
      return {
        autoValidateUnambiguous: data?.auto_validate_unambiguous ?? false,
        maxAutoChanges: data?.max_auto_changes ?? 0,
      };
    },

    async log(action, summary, targetId) {
      await admin.from("audit_events").insert({
        action,
        summary,
        target_type: "import_run",
        target_id: targetId ?? null,
      });
    },
  };
}

/**
 * Le port du catalogue : découvrir une page, c'est ajouter un DOCUMENT à
 * suivre et une SAISON en attente. Jamais un candidat, jamais un vote, jamais
 * une publication.
 */
function makeCataloguePort(admin: SupabaseClient, sourceId: string): CataloguePort {
  return {
    async knownExternalIds() {
      const { data } = await admin
        .from("source_documents")
        .select("external_id")
        .eq("source_id", sourceId);
      return (data ?? [])
        .map((row: { external_id: string | null }) => row.external_id)
        .filter((id): id is string => typeof id === "string");
    },

    async registerSeason(page: CataloguePage) {
      const { data, error } = await admin
        .from("source_documents")
        .insert({
          source_id: sourceId,
          external_id: page.externalId,
          title: page.title,
          url: page.url,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`document non enregistré : ${page.title}`);

      // `unknown` / `pending_review` : on sait qu'une page existe, pas ce
      // qu'elle contient. La clé `anon` ne verra rien tant qu'un import n'aura
      // pas été relu puis publié.
      const { error: seasonError } = await admin.from("seasons").insert({
        slug: page.slug,
        name: page.title,
        status: "unknown",
        source_document_id: data.id,
        validation_status: "pending_review",
      });
      if (seasonError) throw new Error(`saison non enregistrée : ${page.slug}`);

      await admin.from("import_policies").insert({
        source_document_id: data.id,
        entity: null,
        auto_validate_unambiguous: false,
        max_auto_changes: 0,
        auto_validate_retroactive: false,
      });
    },

    async log(action, summary) {
      await admin.from("audit_events").insert({
        action,
        summary,
        target_type: "catalogue",
        target_id: sourceId,
      });
    },
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "méthode non autorisée" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    // Nommer la variable manquante, jamais sa valeur.
    return json({ error: "configuration serveur incomplète" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Porte 1 : la planification ──────────────────────────────────────────
  const cronSecret = Deno.env.get("IMPORT_CRON_SECRET");
  const presented = request.headers.get("x-import-secret");
  let trigger: "manual" | "scheduled" = "manual";
  let actorId: string | null = null;

  if (presented && cronSecret && secretsMatch(presented, cronSecret)) {
    trigger = "scheduled";
  } else {
    // ── Porte 2 : un utilisateur habilité ────────────────────────────────
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "authentification requise" }, 401);

    const { data: userData, error } = await admin.auth.getUser(token);
    if (error || !userData?.user) return json({ error: "jeton invalide" }, 401);
    actorId = userData.user.id;

    // LE RÔLE SE VÉRIFIE EN BASE. Une revendication placée dans un jeton par
    // un client ne prouve rien : c'est `user_roles` qui fait foi, et cette
    // table n'a aucune politique d'écriture.
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .in("role", ["admin", "validator"]);
    if (!roles || roles.length === 0) {
      return json({ error: "droits insuffisants" }, 403);
    }
  }

  let body: {
    action?: "import" | "discover";
    documentId?: string;
    force?: boolean;
    category?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps de requête illisible" }, 400);
  }

  // ── Découverte du catalogue ────────────────────────────────────────────
  //
  // Elle n'a pas besoin d'un document : c'est elle qui en crée. Une saison
  // ajoutée sur Wikipédia arrive donc sans qu'une ligne du dépôt ait bougé.
  if (body.action === "discover") {
    const { data: source } = await admin
      .from("reference_sources")
      .select("id, api_url, base_url")
      .eq("id", "wikipedia_fr")
      .maybeSingle();
    if (!source?.api_url) {
      return json({ error: "source wikipedia_fr sans api_url" }, 500);
    }

    const wiki: WikiConfig = { apiUrl: source.api_url, userAgent: USER_AGENT };
    try {
      const outcome = await discoverSeasons(
        makeCataloguePort(admin, source.id),
        wiki,
        { category: body.category, baseUrl: source.base_url ?? undefined },
      );
      return json(outcome);
    } catch (error) {
      console.error("import-wikipedia/discover", error);
      return json({ error: "la découverte du catalogue a échoué" }, 500);
    }
  }

  if (!body.documentId) return json({ error: "documentId manquant" }, 400);

  // `force` est réservé au déclenchement manuel : une planification qui
  // pourrait forcer relirait la page à chaque tour, sans raison.
  const force = trigger === "manual" && body.force === true;

  try {
    const outcome = await runImport(makePort(admin), {
      documentId: body.documentId,
      trigger,
      actorId,
      userAgent: USER_AGENT,
      force,
    });
    return json(outcome, outcome.status === "failed" ? 422 : 200);
  } catch (error) {
    // Le message d'une exception peut contenir une URL ou un identifiant ; il
    // ne contient jamais de clé, mais on ne le renvoie pas au client pour
    // autant. Le détail vit dans `import_runs.error_message`.
    console.error("import-wikipedia", error);
    return json({ error: "l'import a échoué — voir le journal d'exécution" }, 500);
  }
});
