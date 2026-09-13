/**
 * L'orchestrateur : dix-huit étapes, et deux arrêts d'urgence.
 *
 * IL NE PARLE PAS À SUPABASE. Tout ce qui lit ou écrit passe par le port
 * `ImportPort`, injecté. C'est ce qui rend l'enchaînement testable sans base :
 * les décisions — s'arrêter, refuser, classer, valider — se prouvent avec un
 * port de fantaisie, et il ne reste au vrai port qu'à traduire en SQL.
 *
 * DEUX ARRÊTS D'URGENCE, avant tout diff :
 *
 *  1. **révision inchangée** — la page n'a pas bougé depuis le dernier import
 *     réussi : on s'arrête en `unchanged`, sans rien lire de plus. C'est aussi
 *     ce qui rend une planification fréquente inoffensive ;
 *  2. **structure incomprise** — un en-tête a disparu, un tableau est absent.
 *     On s'arrête en `failed` SANS produire de différences. C'est le garde le
 *     plus important du pipeline : une extraction vide, passée au diff,
 *     proposerait de supprimer tout le référentiel. Le diff a bien sa règle de
 *     couverture, mais un deuxième verrou en amont coûte trois lignes et ferme
 *     la porte plus tôt.
 *
 * ET UN TROISIÈME, plus discret : l'empreinte du modèle intermédiaire. Une
 * nouvelle révision qui n'a rien changé d'utile — un lien corrigé, une
 * catégorie ajoutée — se termine aussi en `unchanged`, et n'encombre pas la
 * file de relecture.
 */
import {
  type Coordinates,
  extractHash,
  fetchCoordinates,
  fetchRevision,
  fetchSectionHtml,
  fetchSections,
  findSection,
  type WikiConfig,
} from "./mediawiki.ts";
import { type Grid, type ParsedTable, parseTables } from "./html-table.ts";
import { extractVotes, looksLikeVotes } from "./extract-votes.ts";
import {
  extractContestants,
  extractProgress,
  looksLikeContestants,
  looksLikeProgress,
} from "./extract-season.ts";
import { extractAdvantages } from "./extract-advantages.ts";
import { extractLocation, findInfobox, type SeasonLocation } from "./extract-location.ts";
import { crossCheck } from "./cross-check.ts";
import {
  autoValidatable,
  type Difference,
  diffRecords,
  type IncomingRecord,
  type Json,
  type StoredRecord,
} from "./diff.ts";
import type { Anomaly } from "./extract-votes.ts";

export type RunStatus = "unchanged" | "diffed" | "failed";

/**
 * VERSION DE L'EXTRACTION, à incrémenter dès qu'elle produit un modèle
 * intermédiaire différent de la fois d'avant.
 *
 * Sans elle, l'arrêt « révision déjà traitée » ment : une extraction corrigée
 * ou enrichie ne serait jamais rejouée sur une page qui ne bouge plus, et la
 * correction n'atteindrait jamais le référentiel. C'est arrivé le 05/09/2026
 * en ajoutant les tribus et les épreuves — la page All Stars n'avait pas
 * changé, et l'import répondait `unchanged` en boucle.
 *
 * Ce n'est pas une version de code : c'est une version de SORTIE. Un
 * remaniement qui ne change pas le modèle intermédiaire ne l'incrémente pas.
 *
 *  1 — candidats, épisodes, tours, voix
 *  2 — + séjours en tribu (bornes en jours), motif de départ, vainqueurs
 *      d'épreuve recoupés
 *  3 — + colliers d'immunité (détenteurs datés, statut, voix annulées)
 *  4 — + la cause d'un départ lié (`causedBy`), qui nomme le duo
 *  5 — + le lieu de tournage (infobox de l'introduction) et ses coordonnées
 *  6 — les ordinaux gardent leur exposant (« 33e jour », et non plus
 *      « 33 jour ») : seuls les appels de note sortent des cellules
 *  7 — les saisons anciennes entrent : titres de section synonymes, tableau
 *      choisi par sa forme et non par son rang, marqueur « ► » ignoré dans
 *      les en-têtes. Neuf pages qui échouaient produisent désormais un modèle
 *  8 — une colonne sans numéro d'épisode ne produit plus de tour. Douze
 *      colonnes du corpus — le jury final de six saisons — fabriquaient un
 *      `…:e?:rN` qu'aucune publication ne pouvait résoudre
 */
export const EXTRACTOR_VERSION = "8";

export interface SourceDocument {
  readonly id: string;
  readonly title: string;
  readonly apiUrl: string;
  readonly seasonSlug: string;
}

export interface ImportPolicy {
  readonly autoValidateUnambiguous: boolean;
  readonly maxAutoChanges: number;
}

/** Tout l'accès à la base passe par là. Rien d'autre n'écrit. */
export interface ImportPort {
  loadDocument(documentId: string): Promise<SourceDocument | null>;
  /** Révision du dernier import qui a abouti, pour l'arrêt « inchangé ». */
  lastImportedRevision(documentId: string): Promise<string | null>;
  /** Version d'extraction du dernier import abouti, `null` si inconnue. */
  lastExtractorVersion(documentId: string): Promise<string | null>;
  lastExtractHash(documentId: string): Promise<string | null>;
  createRun(input: {
    documentId: string;
    trigger: "manual" | "scheduled";
    actorId: string | null;
  }): Promise<string>;
  finishRun(runId: string, patch: {
    status: RunStatus;
    revision?: string;
    revisedAt?: string;
    extractorVersion?: string;
    extractHash?: string;
    error?: string;
    differencesTotal?: number;
    differencesAmbiguous?: number;
  }): Promise<void>;
  saveRecords(
    runId: string,
    records: readonly IncomingRecord[],
    anomaliesByKey: Readonly<Record<string, readonly string[]>>,
  ): Promise<void>;
  loadPublished(
    documentId: string,
    entities: readonly string[],
  ): Promise<readonly StoredRecord[]>;
  saveDifferences(runId: string, differences: readonly Difference[]): Promise<void>;
  autoValidateDifferences(runId: string, keys: readonly string[]): Promise<void>;
  loadPolicy(documentId: string): Promise<ImportPolicy>;
  log(action: string, summary: string, targetId?: string): Promise<void>;
}

export interface RunOptions {
  readonly documentId: string;
  readonly trigger: "manual" | "scheduled";
  readonly actorId: string | null;
  readonly userAgent: string;
  readonly fetchImpl?: typeof fetch;
  /** Forcer la relecture même si la révision n'a pas changé. */
  readonly force?: boolean;
}

export interface RunOutcome {
  readonly runId: string;
  readonly status: RunStatus;
  readonly revision?: string;
  readonly message: string;
  readonly counts?: Readonly<Record<string, number>>;
  readonly anomalies?: readonly Anomaly[];
}

const ENTITIES = [
  "season",
  "season_contestant",
  "episode",
  "council_round",
  "council_vote",
  "advantage",
] as const;

/**
 * Les titres qui désignent chaque tableau, par ordre de préférence.
 *
 * UN MÊME CONTENU, PLUSIEURS TITRES. Relevé du 11/09/2026 sur les dix-huit
 * pages : la matrice des votes s'appelle « Détails des votes » sur dix
 * saisons, « Détail des votes » sur une, et « Détail des éliminations » sur
 * quatre anciennes — pour un tableau rigoureusement identique. Exiger un seul
 * libellé écartait donc cinq saisons sans qu'aucune donnée ne manque.
 */
const SECTIONS = {
  contestants: ["Candidats", "Candidat"],
  progress: ["Déroulement"],
  votes: [
    "Détails des votes",
    "Détail des votes",
    "Détails des éliminations",
    "Détail des éliminations",
  ],
} as const;

/**
 * Ce que chaque section facultative alimente dans le référentiel.
 *
 * Sert à répondre à UNE question, au moment où une section manque : est-ce que
 * la page ne l'a jamais eue, ou est-ce qu'elle vient de la perdre ?
 */
const ENTITIES_BY_SECTION = {
  progress: ["episode"],
  votes: ["council_round", "council_vote"],
} as const;

/**
 * Le tableau de la section qui a la FORME attendue.
 *
 * Prendre le premier tableau venu était une hypothèse tacite, vraie sur les
 * saisons récentes et fausse ailleurs : « Les 4 Terres » ouvre son
 * « Déroulement » par un récapitulatif des épreuves, et le vrai tableau vient
 * en second. Demander sa forme plutôt que son rang lit les deux sans rien
 * coder de particulier à une saison.
 */
function pickTable(
  tables: readonly ParsedTable[],
  looksRight: (grid: Grid) => boolean,
): ParsedTable | null {
  return tables.find((t) => looksRight(t.grid)) ?? null;
}

/** Facultative : 9 pages de saison sur 18 la portent (relevé du 05/09/2026). */
const SECTION_ADVANTAGES = "Colliers d'immunité";

/** Anomalies qui interdisent d'aller plus loin. */
function isFatal(anomaly: Anomaly): boolean {
  return anomaly.code === "structure_inconnue" || anomaly.code === "aucun_candidat";
}

/**
 * Les clés `entité:clé_naturelle` que le lot répète.
 *
 * POURQUOI CE CONTRÔLE EXISTE. `import_records` porte
 * `unique (run_id, entity, natural_key)`. Tous les enregistrements d'une
 * exécution partagent `run_id` : une paire répétée DANS le lot est donc la
 * seule façon de violer la contrainte, et elle fait échouer l'insertion des
 * N enregistrements, pas seulement du doublon.
 *
 * Le 11/09/2026, quatre saisons — Les Reliques du destin, Les Armes secrètes,
 * Le Feu sacré, L'Île des héros — ont ainsi terminé leur exécution en
 * `diffed`, avec zéro enregistrement écrit. L'erreur d'insertion n'était pas
 * regardée, et la panne ne se manifestait qu'à la PUBLICATION, très loin
 * d'ici, sous la forme « tour absent du référentiel ».
 *
 * On nomme les clés plutôt que de rendre le `23505` de PostgreSQL, qui n'en
 * cite qu'une : ce qu'il faut corriger est dans l'extraction, et il en faut la
 * liste.
 */
export function duplicateRecordKeys(
  records: readonly IncomingRecord[],
): readonly string[] {
  const vus = new Set<string>();
  const doubles = new Set<string>();
  for (const r of records) {
    const cle = `${r.entity}:${r.naturalKey}`;
    if (vus.has(cle)) doubles.add(cle);
    else vus.add(cle);
  }
  return [...doubles];
}

export async function runImport(
  port: ImportPort,
  options: RunOptions,
): Promise<RunOutcome> {
  const document = await port.loadDocument(options.documentId);
  if (!document) {
    throw new Error(`document source introuvable : ${options.documentId}`);
  }

  const runId = await port.createRun({
    documentId: document.id,
    trigger: options.trigger,
    actorId: options.actorId,
  });

  const wiki: WikiConfig = {
    apiUrl: document.apiUrl,
    userAgent: options.userAgent,
    fetchImpl: options.fetchImpl,
  };

  // Toute sortie en échec passe par là : l'exécution est clôturée, le motif
  // journalisé, et AUCUNE différence n'est proposée. Répéter ces cinq lignes à
  // chaque garde, c'était risquer d'en oublier une le jour où l'on en ajoute.
  let revisionId: string | undefined;
  const stop = async (message: string): Promise<RunOutcome> => {
    await port.finishRun(runId, {
      status: "failed",
      revision: revisionId,
      error: message,
    });
    await port.log("import.failed", message, runId);
    return { runId, status: "failed", revision: revisionId, message };
  };

  try {
    // ── 1. Révision ───────────────────────────────────────────────────────
    const revision = await fetchRevision(wiki, document.title);
    revisionId = revision.revId;
    const known = await port.lastImportedRevision(document.id);
    // « Déjà traitée » suppose que c'est le MÊME traitement. Une extraction
    // enrichie doit rejouer une page qui n'a pas bougé, sinon la correction
    // n'atteint jamais le référentiel.
    const knownVersion = await port.lastExtractorVersion(document.id);
    if (
      !options.force && known === revision.revId &&
      knownVersion === EXTRACTOR_VERSION
    ) {
      await port.finishRun(runId, {
        status: "unchanged",
        revision: revision.revId,
        revisedAt: revision.revisedAt,
        extractorVersion: EXTRACTOR_VERSION,
      });
      return {
        runId,
        status: "unchanged",
        revision: revision.revId,
        message: `révision ${revision.revId} déjà traitée`,
      };
    }

    // ── 2. Sections, par leur titre ───────────────────────────────────────
    //
    // UNE SEULE EST INDISPENSABLE : celle des candidats. Le déroulement et la
    // matrice des votes manquent pour de bon sur plusieurs saisons anciennes —
    // « Malaisie » n'a aucun tableau épisode par épisode, « Le Retour des
    // héros » n'a que sa liste de candidats. Les exiger toutes les trois
    // revenait à jeter ce que la page A, faute de ce qu'elle n'a pas : cinq
    // saisons perdues pour une absence que Wikipédia assume.
    const sections = await fetchSections(wiki, document.title);
    const section = {
      contestants: findSection(sections, ...SECTIONS.contestants),
      progress: findSection(sections, ...SECTIONS.progress),
      votes: findSection(sections, ...SECTIONS.votes),
    };

    if (!section.contestants) {
      const message = `section « ${
        SECTIONS.contestants[0]
      } » introuvable — la page ne porte aucune donnée exploitable`;
      return await stop(message);
    }

    // ── 3. Extraction ─────────────────────────────────────────────────────
    const [contestantsHtml, progressHtml, votesHtml, introductionHtml] = await Promise
      .all([
        fetchSectionHtml(wiki, document.title, section.contestants.index),
        section.progress
          ? fetchSectionHtml(wiki, document.title, section.progress.index)
          : Promise.resolve(""),
        section.votes
          ? fetchSectionHtml(wiki, document.title, section.votes.index)
          : Promise.resolve(""),
        // La section 0 est l'introduction : elle porte l'infobox, donc le lieu.
        fetchSectionHtml(wiki, document.title, "0"),
      ]);

    // Par leur FORME, pas par leur rang — voir `pickTable`.
    //
    // POUR LES CANDIDATS, LE REPLI EST LE PREMIER TABLEAU. Aucun ne
    // correspond, mais la section en porte un : c'est une structure qui a
    // changé, pas une donnée qui manque. Le laisser passer à l'extracteur rend
    // au relecteur le message précis — « en-tête Candidat introuvable » — au
    // lieu d'un « absent » qui l'enverrait chercher une section pourtant là.
    const contestantsTables = parseTables(contestantsHtml);
    const contestantsTable = pickTable(contestantsTables, looksLikeContestants) ??
      contestantsTables[0];
    const progressTable = pickTable(parseTables(progressHtml), looksLikeProgress);
    const votesTable = pickTable(parseTables(votesHtml), looksLikeVotes);

    if (!contestantsTable) {
      return await stop("la section des candidats ne porte aucun tableau");
    }

    // UNE ABSENCE N'EST PAS L'AUTRE, et c'est toute la question.
    //
    // « Malaisie » n'a jamais eu de tableau épisode par épisode : n'extraire
    // que ses candidats est exactement ce qu'il faut faire. Mais si la page de
    // « Fidji » perdait demain sa matrice des votes, la même extraction
    // partielle proposerait d'effacer tous les conseils déjà publiés — le
    // dégât que ce garde existe pour empêcher.
    //
    // Ce qui sépare les deux cas n'est pas sur la page : c'est ce que le
    // référentiel tient déjà. Rien de publié, l'absence est de naissance et on
    // continue ; quelque chose de publié, la page a REGRESSÉ et on s'arrête
    // sans rien proposer. La règle de couverture du diff, en aval, ne fait que
    // signaler la suppression — ici, elle n'est même pas formulée.
    let publishedCache: readonly StoredRecord[] | null = null;
    const publishedRecords = async (): Promise<readonly StoredRecord[]> => {
      publishedCache ??= await port.loadPublished(document.id, ENTITIES);
      return publishedCache;
    };
    const dejaPublie = async (key: keyof typeof ENTITIES_BY_SECTION) => {
      const entities: readonly string[] = ENTITIES_BY_SECTION[key];
      return (await publishedRecords()).some(
        (r) => r.published && entities.includes(r.entity),
      );
    };
    const regression = async (key: keyof typeof ENTITIES_BY_SECTION, quoi: string) => {
      if (!await dejaPublie(key)) return null;
      return `${quoi} — or le référentiel en tient déjà de publiés : arrêt avant toute suppression`;
    };

    const absences: Anomaly[] = [];
    const contestants = extractContestants(contestantsTable.grid, document.seasonSlug);

    let progress: ReturnType<typeof extractProgress> = { episodes: [], anomalies: [] };
    if (progressTable) {
      progress = extractProgress(progressTable.grid, document.seasonSlug);
    } else {
      const quoi = section.progress
        ? "la section « Déroulement » ne porte aucun tableau épisode par épisode"
        : "la page n'a pas de section « Déroulement »";
      const perdu = await regression("progress", quoi);
      if (perdu) return await stop(perdu);
      absences.push({
        code: "section_absente",
        message: `${quoi} : aucun épisode extrait`,
      });
    }

    let votes: ReturnType<typeof extractVotes> = {
      rounds: [],
      votes: [],
      statuses: [],
      contestants: [],
      anomalies: [],
    };
    if (votesTable) {
      votes = extractVotes(votesTable.grid, document.seasonSlug);
    } else {
      const quoi = "aucune matrice des votes sur cette page";
      const perdu = await regression("votes", quoi);
      if (perdu) return await stop(perdu);
      absences.push({
        code: "section_absente",
        message: `${quoi} : aucun conseil extrait`,
      });
    }

    // ── Les colliers, s'il y en a ────────────────────────────────────────
    //
    // Cette section est FACULTATIVE : neuf pages de saison sur dix-huit la
    // portent. Son absence n'est donc pas une structure incomprise — c'est
    // une saison sans colliers, ou une page qui n'en parle pas.
    const advantagesSection = findSection(sections, SECTION_ADVANTAGES);
    let advantages: ReturnType<typeof extractAdvantages> = {
      advantages: [],
      anomalies: [],
    };
    if (advantagesSection) {
      const advantagesHtml = await fetchSectionHtml(
        wiki,
        document.title,
        advantagesSection.index,
      );
      const advantagesTable = parseTables(advantagesHtml)[0];
      if (advantagesTable) {
        advantages = extractAdvantages(advantagesTable.grid, document.seasonSlug);
      }
    }

    const anomalies: Anomaly[] = [
      ...absences,
      ...contestants.anomalies,
      ...progress.anomalies,
      ...votes.anomalies,
      ...advantages.anomalies,
      ...crossCheck(contestants, progress, votes),
    ];

    // Les lignes irrégulières du tableau relèvent du LECTEUR, pas de
    // l'extraction : elles se récupèrent ici pour ne pas être perdues.
    for (
      const [name, table] of Object.entries({
        contestants: contestantsTable,
        progress: progressTable,
        votes: votesTable,
      })
    ) {
      for (const row of table?.raggedRows ?? []) {
        anomalies.push({
          code: "ligne_irreguliere",
          message:
            `tableau « ${name} » : la ligne ${row} n'a pas le même nombre de cellules que les autres`,
        });
      }
    }

    // ── 4. ARRÊT si la structure n'a pas été comprise ─────────────────────
    const fatal = anomalies.filter(isFatal);
    if (fatal.length > 0) {
      const message = `structure incomprise : ${fatal.map((a) => a.message).join(" ; ")}`;
      return { ...await stop(message), anomalies };
    }

    // ── 4 bis. Le lieu de tournage, et ses coordonnées ────────────────────
    //
    // Facultatif de bout en bout : une infobox sans lieu, un lieu sans page,
    // une page sans coordonnées ou une API qui ne répond pas laissent la
    // saison sans lieu — et le disent par une anomalie, sans arrêter le lot.
    const infobox = findInfobox(parseTables(introductionHtml));
    const located = infobox ? extractLocation(infobox.grid) : {
      location: null,
      anomalies: [{
        code: "lieu_absent",
        message: "aucune infobox dans l'introduction de la page",
      }],
    };
    const seasonCodes = located.anomalies.map((a) => a.code);
    anomalies.push(...located.anomalies);

    let coordinates: Coordinates | null = null;
    const placeTitle = located.location?.pageTitle ?? null;
    if (placeTitle !== null) {
      try {
        coordinates = await fetchCoordinates(wiki, placeTitle);
        if (coordinates === null) {
          seasonCodes.push("lieu_sans_coordonnees");
          anomalies.push({
            code: "lieu_sans_coordonnees",
            message: `la page « ${placeTitle} » ne déclare aucune coordonnée`,
          });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        seasonCodes.push("lieu_sans_coordonnees");
        anomalies.push({
          code: "lieu_sans_coordonnees",
          message: `coordonnées de « ${placeTitle} » injoignables : ${reason}`,
        });
      }
    }

    // ── 5. Modèle intermédiaire, et son empreinte ─────────────────────────
    const { records, anomaliesByKey } = buildRecords(
      contestants,
      progress,
      votes,
      advantages,
      anomalies,
      {
        slug: document.seasonSlug,
        location: located.location,
        coordinates,
        anomalyCodes: seasonCodes,
      },
    );
    const hash = await extractHash(records);
    const previousHash = await port.lastExtractHash(document.id);
    if (!options.force && previousHash === hash) {
      await port.finishRun(runId, {
        status: "unchanged",
        revision: revision.revId,
        revisedAt: revision.revisedAt,
        extractorVersion: EXTRACTOR_VERSION,
        extractHash: hash,
      });
      return {
        runId,
        status: "unchanged",
        revision: revision.revId,
        message: "nouvelle révision, mais aucun changement utile",
      };
    }

    // Le contrôle est ICI, avant d'écrire, et non dans l'adaptateur : ce qui
    // se décide — « une clé répétée arrête l'exécution, et on la nomme » — est
    // une règle du domaine, et elle se prouve sans base.
    const doublons = duplicateRecordKeys(records);
    if (doublons.length > 0) {
      throw new Error(
        `${doublons.length} clé(s) répétée(s), aucun enregistrement écrit : ${
          doublons.slice(0, 8).join(", ")
        }${doublons.length > 8 ? "…" : ""}`,
      );
    }

    await port.saveRecords(runId, records, anomaliesByKey);

    // ── 6. Diff contre le publié ──────────────────────────────────────────
    // `publishedRecords` peut avoir déjà lu : une section absente pose la
    // question plus tôt, et la réponse se garde.
    const published = await publishedRecords();
    const result = diffRecords(published, records);
    await port.saveDifferences(runId, result.differences);

    // ── 7. Validation automatique, si et seulement si elle est autorisée ──
    const policy = await port.loadPolicy(document.id);
    const auto = autoValidatable(result, {
      enabled: policy.autoValidateUnambiguous,
      maxAutoChanges: policy.maxAutoChanges,
    });
    if (auto.length > 0) {
      await port.autoValidateDifferences(
        runId,
        auto.map((d) => `${d.entity}:${d.naturalKey}`),
      );
    }

    const ambiguous = result.differences.length - auto.length;
    await port.finishRun(runId, {
      status: "diffed",
      revision: revision.revId,
      revisedAt: revision.revisedAt,
      extractorVersion: EXTRACTOR_VERSION,
      extractHash: hash,
      differencesTotal: result.differences.length,
      differencesAmbiguous: ambiguous,
    });
    await port.log(
      "import.diffed",
      `${result.differences.length} différence(s), dont ${auto.length} validée(s) automatiquement`,
      runId,
    );

    return {
      runId,
      status: "diffed",
      revision: revision.revId,
      message: `${result.differences.length} différence(s) proposée(s)`,
      counts: { ...result.summary, autoValidated: auto.length },
      anomalies,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await port.finishRun(runId, { status: "failed", error: message });
    await port.log("import.failed", message, runId);
    return { runId, status: "failed", message };
  }
}

/**
 * Assemble le modèle intermédiaire, et rattache chaque anomalie au fait
 * qu'elle concerne.
 *
 * UNE ANOMALIE SANS ADRESSE NE SERT À RIEN. « décompte incohérent » perdu dans
 * une liste globale oblige le relecteur à chercher lequel ; rattachée à la
 * clé, elle rend la différence correspondante `ambiguous` toute seule.
 */
/** Ce que l'introduction dit de la saison elle-même. */
export interface SeasonFacts {
  readonly slug: string;
  readonly location: SeasonLocation | null;
  readonly coordinates: Coordinates | null;
  /** Codes d'anomalie à rattacher à la différence `season`. */
  readonly anomalyCodes: readonly string[];
}

export function buildRecords(
  contestants: ReturnType<typeof extractContestants>,
  progress: ReturnType<typeof extractProgress>,
  votes: ReturnType<typeof extractVotes>,
  advantages: ReturnType<typeof extractAdvantages>,
  anomalies: readonly Anomaly[],
  season: SeasonFacts,
): {
  records: IncomingRecord[];
  anomaliesByKey: Record<string, string[]>;
} {
  const byRow = new Map<string, string[]>();
  const byColumn = new Map<number, string[]>();
  for (const a of anomalies) {
    if (a.row) byRow.set(a.row, [...(byRow.get(a.row) ?? []), a.code]);
    if (a.columnIndex !== undefined) {
      byColumn.set(a.columnIndex, [...(byColumn.get(a.columnIndex) ?? []), a.code]);
    }
  }

  const records: IncomingRecord[] = [];
  const anomaliesByKey: Record<string, string[]> = {};
  const push = (
    entity: string,
    naturalKey: string,
    payload: Record<string, Json>,
    codes: string[],
  ) => {
    records.push({ entity, naturalKey, payload, anomalies: codes });
    if (codes.length > 0) anomaliesByKey[`${entity}:${naturalKey}`] = codes;
  };

  // La saison elle-même : une seule ligne, dont le lieu de tournage. Un lieu
  // absent s'écrit `null` — une valeur, pas un oubli — pour que le diff voie
  // sa disparition si la page l'efface un jour.
  push("season", season.slug, {
    locationName: season.location?.name ?? null,
    locationPageTitle: season.location?.pageTitle ?? null,
    locationLat: season.coordinates?.lat ?? null,
    locationLon: season.coordinates?.lon ?? null,
  }, [...season.anomalyCodes]);

  for (const c of contestants.contestants) {
    push("season_contestant", c.naturalKey, {
      displayName: c.displayName,
      gender: c.gender,
      age: c.age,
      previousSeasons: [...c.previousSeasons],
      // Les séjours en tribu, avec leurs bornes de JOURS — la source ne parle
      // pas en épisodes ici, et les convertir serait inventer.
      teams: c.teams.map((t) => ({
        name: t.name,
        fromDay: t.fromDay,
        toDay: t.toDay,
      })),
      finalJury: c.finalJury,
      departure: c.departure,
    }, byRow.get(c.displayName) ?? []);
  }

  for (const e of progress.episodes) {
    push("episode", e.naturalKey, {
      number: e.number,
      airDate: e.airDate,
      comfortWinners: [...e.comfortWinners],
      immunityWinners: [...e.immunityWinners],
      eliminated: [...e.eliminated],
      rawTally: e.rawTally,
      departureDay: e.departureDay,
      aired: e.aired,
      // Les anomalies d'épisode sont adressées par `e<numéro>` : c'est ce qui
      // rend une différence ambiguë toute seule quand un vainqueur d'épreuve
      // n'a pas été reconnu.
    }, byRow.get(`e${e.number}`) ?? []);
  }

  for (const r of votes.rounds) {
    push("council_round", r.naturalKey, {
      episodeNumber: r.episodeNumber,
      roundNumber: r.roundNumber,
      kind: r.kind,
      eliminated: r.eliminated,
      causedBy: r.causedBy,
      reportedVotesFor: r.reportedVotesFor,
      reportedVotesTotal: r.reportedVotesTotal,
      rawTally: r.rawTally,
    }, byColumn.get(r.columnIndex) ?? []);
  }

  for (const a of advantages.advantages) {
    push("advantage", a.naturalKey, {
      kind: "immunity_necklace",
      location: a.location,
      status: a.status,
      foundDay: a.foundDay,
      playedEpisodeNumber: a.playedEpisodeNumber,
      playedDay: a.playedDay,
      annulledVotes: a.annulledVotes,
      annulledVotesTotal: a.annulledVotesTotal,
      holders: a.holders.map((h) => ({
        name: h.name,
        fromDay: h.fromDay,
        toDay: h.toDay,
        original: h.original,
      })),
    }, []);
  }

  for (const v of votes.votes) {
    push("council_vote", v.naturalKey, {
      voter: v.voter,
      target: v.target,
      struck: v.struck,
    }, byRow.get(v.voter) ?? []);
  }

  return { records, anomaliesByKey };
}
