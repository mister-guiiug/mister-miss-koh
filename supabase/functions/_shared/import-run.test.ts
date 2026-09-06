/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * L'orchestrateur se teste SANS BASE : le port est de fantaisie et enregistre
 * ce qu'on lui demande, `fetch` rend les fixtures de la vraie page. Ce qui est
 * vérifié n'est donc pas « ça compile », mais les DÉCISIONS — s'arrêter,
 * refuser, ne rien écrire.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import {
  EXTRACTOR_VERSION,
  type ImportPolicy,
  type ImportPort,
  runImport,
  type SourceDocument,
} from "./import-run.ts";
import type { Difference, IncomingRecord, StoredRecord } from "./diff.ts";

const UA = "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";
const DOC: SourceDocument = {
  id: "doc-1",
  title: "Koh-Lanta All Stars",
  apiUrl: "https://fr.wikipedia.org/w/api.php",
  seasonSlug: "all-stars-2026",
};

const read = (name: string) =>
  Deno.readTextFile(new URL(`./fixtures/${name}-section.html`, import.meta.url));

const CANDIDATS = await read("candidats");
const DEROULEMENT = await read("deroulement");
const VOTES = await read("votes");
const INTRODUCTION = await read("introduction");

/** Port de fantaisie : garde trace de tout, n'écrit nulle part. */
function fakePort(overrides: Partial<ImportPort> & {
  lastRevision?: string | null;
  lastVersion?: string | null;
  lastHash?: string | null;
  published?: StoredRecord[];
  policy?: ImportPolicy;
} = {}) {
  const calls = {
    runs: [] as string[],
    finished: [] as { runId: string; patch: Record<string, unknown> }[],
    records: [] as IncomingRecord[],
    differences: [] as Difference[],
    autoValidated: [] as string[],
    logs: [] as { action: string; summary: string }[],
  };

  const port: ImportPort = {
    loadDocument: () => Promise.resolve(DOC),
    lastImportedRevision: () => Promise.resolve(overrides.lastRevision ?? null),
    // Par défaut la version COURANTE : un test qui pose `lastRevision` veut
    // éprouver l'arrêt « inchangé », pas le rejeu par changement d'extraction.
    lastExtractorVersion: () =>
      Promise.resolve(
        overrides.lastVersion === undefined ? EXTRACTOR_VERSION : overrides.lastVersion,
      ),
    lastExtractHash: () => Promise.resolve(overrides.lastHash ?? null),
    createRun: () => {
      const id = `run-${calls.runs.length + 1}`;
      calls.runs.push(id);
      return Promise.resolve(id);
    },
    finishRun: (runId, patch) => {
      calls.finished.push({ runId, patch });
      return Promise.resolve();
    },
    saveRecords: (_runId, records) => {
      calls.records.push(...records);
      return Promise.resolve();
    },
    loadPublished: () => Promise.resolve(overrides.published ?? []),
    saveDifferences: (_runId, differences) => {
      calls.differences.push(...differences);
      return Promise.resolve();
    },
    autoValidateDifferences: (_runId, keys) => {
      calls.autoValidated.push(...keys);
      return Promise.resolve();
    },
    loadPolicy: () =>
      Promise.resolve(
        overrides.policy ?? { autoValidateUnambiguous: false, maxAutoChanges: 20 },
      ),
    log: (action, summary) => {
      calls.logs.push({ action, summary });
      return Promise.resolve();
    },
    ...overrides,
  };

  return { port, calls };
}

/** `fetch` de fantaisie : répond comme l'API MediaWiki, sans réseau. */
function fakeFetch(options: {
  revId?: string;
  sections?: { index: string; line: string }[];
  html?: Record<string, string>;
} = {}): typeof fetch {
  const sections = options.sections ?? [
    { index: "4", line: "Candidats" },
    { index: "5", line: "Déroulement" },
    { index: "7", line: "Détails des votes" },
  ];
  const html = options.html ??
    { "0": INTRODUCTION, "4": CANDIDATS, "5": DEROULEMENT, "7": VOTES };

  return (input) => {
    const url = new URL(String(input));
    const action = url.searchParams.get("action");
    const prop = url.searchParams.get("prop");
    let body: unknown;

    if (action === "query" && prop === "coordinates") {
      // La page du lieu, telle que l'API la géolocalise (relevé du 06/09/2026).
      body = {
        query: {
          pages: [{
            pageid: 4637074,
            title: url.searchParams.get("titles"),
            coordinates: [{
              lat: 8.33333333,
              lon: -79.11666667,
              primary: true,
              globe: "earth",
            }],
          }],
        },
      };
    } else if (action === "query") {
      body = {
        query: {
          pages: [{
            pageid: 17479409,
            title: DOC.title,
            revisions: [{
              revid: Number(options.revId ?? "239179934"),
              timestamp: "2026-09-03T01:34:31Z",
              size: 22668,
            }],
          }],
        },
      };
    } else if (prop === "sections") {
      body = { parse: { sections: sections.map((s) => ({ ...s, number: s.index })) } };
    } else {
      const index = url.searchParams.get("section") ?? "";
      body = { parse: { text: html[index] ?? "" } };
    }

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

const baseOptions = {
  documentId: DOC.id,
  trigger: "manual" as const,
  actorId: "user-1",
  userAgent: UA,
};

// ══════════════════════════════════════════════════════════════════════════

Deno.test("première exécution : les différences sont proposées, aucune n'est appliquée", async () => {
  const { port, calls } = fakePort();
  const outcome = await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });

  assertEquals(outcome.status, "diffed");
  assertEquals(outcome.revision, "239179934");
  assert(calls.records.length > 50, `enregistrements : ${calls.records.length}`);
  assert(calls.differences.length > 0);
  // Sans politique explicite, RIEN n'est validé automatiquement.
  assertEquals(calls.autoValidated, []);
});

Deno.test("révision déjà traitée : on s'arrête sans rien lire de plus", async () => {
  const { port, calls } = fakePort({ lastRevision: "239179934" });
  const outcome = await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });

  assertEquals(outcome.status, "unchanged");
  assertEquals(calls.records, [], "aucune extraction");
  assertEquals(calls.differences, [], "aucune différence");
  assertEquals(calls.finished[0].patch.status, "unchanged");
});

Deno.test("`force` relit malgré une révision connue", async () => {
  const { port, calls } = fakePort({ lastRevision: "239179934" });
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch(),
    force: true,
  });
  assertEquals(outcome.status, "diffed");
  assert(calls.records.length > 0);
});

Deno.test("nouvelle révision sans changement utile : arrêt sur l'empreinte", async () => {
  // Deux passes : la première note l'empreinte, la seconde arrive avec une
  // révision différente mais le même contenu.
  const first = fakePort();
  await runImport(first.port, { ...baseOptions, fetchImpl: fakeFetch() });
  const hash = first.calls.finished[0].patch.extractHash as string;
  assert(hash, "l'empreinte doit être enregistrée");

  const { port, calls } = fakePort({ lastRevision: "1", lastHash: hash });
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({ revId: "999999999" }),
  });

  assertEquals(outcome.status, "unchanged");
  assert(outcome.message.includes("aucun changement utile"));
  assertEquals(calls.differences, [], "rien ne part en relecture");
});

Deno.test("SECTION DISPARUE : arrêt, et AUCUNE différence proposée", async () => {
  // Le dégât qu'on empêche : sans cet arrêt, l'extraction rendrait zéro
  // enregistrement et le diff proposerait d'effacer le référentiel entier.
  const { port, calls } = fakePort({ published: [] });
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({
      sections: [{ index: "4", line: "Candidats" }],
    }),
  });

  assertEquals(outcome.status, "failed");
  assert(outcome.message.includes("Déroulement"));
  assertEquals(calls.differences, []);
  assertEquals(calls.records, []);
  assertEquals(calls.logs[0].action, "import.failed");
});

Deno.test("STRUCTURE INCOMPRISE : arrêt avant le diff, référentiel intact", async () => {
  const published: StoredRecord[] = [
    {
      entity: "episode",
      naturalKey: "all-stars-2026:e1",
      payload: { number: 1 },
      published: true,
    },
    {
      entity: "episode",
      naturalKey: "all-stars-2026:e2",
      payload: { number: 2 },
      published: true,
    },
  ];
  const { port, calls } = fakePort({ published });
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({
      // Le tableau des candidats est remplacé par un tableau méconnaissable.
      html: {
        "4":
          "<table><tr><th>Nom</th><th>Autre</th></tr><tr><td>X</td><td>Y</td></tr></table>",
        "5": DEROULEMENT,
        "7": VOTES,
      },
    }),
  });

  assertEquals(outcome.status, "failed");
  assert(outcome.message.includes("structure incomprise"));
  assertEquals(calls.differences, [], "aucune suppression n'est même proposée");
});

Deno.test("un tableau absent de la page arrête aussi l'exécution", async () => {
  const { port, calls } = fakePort();
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({
      html: { "4": CANDIDATS, "5": DEROULEMENT, "7": "<p>rien</p>" },
    }),
  });
  assertEquals(outcome.status, "failed");
  assertEquals(calls.differences, []);
});

Deno.test("une panne réseau termine l'exécution en échec, proprement", async () => {
  const { port, calls } = fakePort();
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: () => Promise.reject(new Error("réseau indisponible")),
  });

  assertEquals(outcome.status, "failed");
  assertEquals(outcome.message, "réseau indisponible");
  // L'exécution est TOUJOURS clôturée : une ligne restée « running » ferait
  // croire à un import en cours et bloquerait le suivant.
  assertEquals(calls.finished.length, 1);
  assertEquals(calls.finished[0].patch.status, "failed");
});

Deno.test("le PREMIER import, massif, ne se valide jamais tout seul", async () => {
  // Cinquante-deux voix d'un coup dépassent le plafond de changements par
  // entité : le lot bascule en suspect, et rien n'est validé — même avec une
  // politique permissive et un plafond de validation très haut. C'est voulu :
  // la première ingestion d'une saison mérite un regard humain, et c'est la
  // seule qui soit aussi volumineuse.
  const { port, calls } = fakePort({
    policy: { autoValidateUnambiguous: true, maxAutoChanges: 1000 },
  });
  await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });

  assertEquals(calls.autoValidated, []);
  assert(
    calls.differences.some((d) => d.class === "suspicious"),
    "le volume doit être signalé",
  );
});

Deno.test("un import de ROUTINE, sous plafond, se valide automatiquement", async () => {
  // Le cas hebdomadaire : presque tout est déjà publié, seules quelques
  // lignes s'ajoutent. C'est là que la validation automatique a un sens.
  const first = fakePort();
  await runImport(first.port, { ...baseOptions, fetchImpl: fakeFetch() });

  const published: StoredRecord[] = first.calls.records
    .filter((r) => !r.naturalKey.endsWith(":Yassin"))
    .map((r) => ({
      entity: r.entity,
      naturalKey: r.naturalKey,
      payload: r.payload,
      published: true,
    }));

  const { port, calls } = fakePort({
    published,
    lastRevision: "1",
    policy: { autoValidateUnambiguous: true, maxAutoChanges: 20 },
  });
  await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });

  assert(calls.autoValidated.length > 0, "les quelques ajouts sont validables");
  // Rien de rétroactif : ce qui existait déjà n'a pas changé.
  assertEquals(calls.differences.filter((d) => d.class === "retroactive"), []);
  assertEquals(calls.differences.filter((d) => d.operation === "delete"), []);
});

Deno.test("au-delà du plafond, la politique ne valide plus rien", async () => {
  const { port, calls } = fakePort({
    policy: { autoValidateUnambiguous: true, maxAutoChanges: 3 },
  });
  await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });
  assertEquals(calls.autoValidated, []);
});

Deno.test("les anomalies sont rattachées au fait qu'elles concernent", async () => {
  const { port, calls } = fakePort();
  await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({
      html: {
        "4": CANDIDATS.replace("32 ans", "une trentaine"),
        "5": DEROULEMENT,
        "7": VOTES,
      },
    }),
  });

  const camille = calls.records.find((r) => r.naturalKey.endsWith(":Camille"));
  assert(camille, "Camille doit être extraite malgré son âge illisible");
  assertEquals(camille.anomalies, ["age_illisible"]);

  // Et la différence correspondante devient ambiguë, sans intervention.
  const diff = calls.differences.find((d) => d.naturalKey.endsWith(":Camille"));
  assertEquals(diff?.class, "ambiguous");
});

Deno.test("une extraction ENRICHIE rejoue une page qui n'a pas bougé", async () => {
  // Le piège du 05/09/2026 : la page All Stars n'avait pas changé, l'import
  // répondait `unchanged`, et l'ajout des tribus n'atteignait jamais la base.
  const { port, calls } = fakePort({
    lastRevision: "239179934",
    lastVersion: "1",
  });
  const outcome = await runImport(port, {
    ...baseOptions,
    trigger: "scheduled",
    fetchImpl: fakeFetch(),
  });

  assertEquals(outcome.status, "diffed", "la version d'extraction a changé : on relit");
  assertEquals(
    calls.finished.at(-1)?.patch.extractorVersion,
    EXTRACTOR_VERSION,
    "l'exécution retient la version qui l'a produite",
  );
});

Deno.test("même révision ET même version d'extraction : on s'arrête", async () => {
  const { port, calls } = fakePort({
    lastRevision: "239179934",
    lastVersion: EXTRACTOR_VERSION,
  });
  const outcome = await runImport(port, {
    ...baseOptions,
    trigger: "scheduled",
    fetchImpl: fakeFetch(),
  });

  assertEquals(outcome.status, "unchanged");
  assertEquals(calls.records.length, 0, "rien n'est lu au-delà de la révision");
});

Deno.test("le lieu de tournage entre dans le modèle, avec ses coordonnées", async () => {
  const { port, calls } = fakePort();
  await runImport(port, { ...baseOptions, fetchImpl: fakeFetch() });

  const season = calls.records.filter((r) => r.entity === "season");
  assertEquals(season.length, 1, "une saison, une ligne");
  assertEquals(season[0].naturalKey, DOC.seasonSlug);
  assertEquals(season[0].payload, {
    locationName: "Archipel des Perles (Panama)",
    locationPageTitle: "Archipel des Perles",
    locationLat: 8.33333333,
    locationLon: -79.11666667,
  });
  assert(
    calls.differences.some((d) => d.entity === "season" && d.operation === "insert"),
    "et il est PROPOSÉ, comme le reste — jamais écrit en douce",
  );
});

Deno.test("une page sans infobox : la saison reste, sans lieu, et l'anomalie le dit", async () => {
  const { port, calls } = fakePort();
  const outcome = await runImport(port, {
    ...baseOptions,
    fetchImpl: fakeFetch({
      html: {
        "0": "<p>Pas d'infobox ici.</p>",
        "4": CANDIDATS,
        "5": DEROULEMENT,
        "7": VOTES,
      },
    }),
  });

  assertEquals(outcome.status, "diffed", "un lieu absent n'arrête rien");
  const season = calls.records.find((r) => r.entity === "season");
  assertEquals(season?.payload, {
    locationName: null,
    locationPageTitle: null,
    locationLat: null,
    locationLon: null,
  });
  assertEquals(season?.anomalies, ["lieu_absent"]);
  assert(outcome.anomalies?.some((a) => a.code === "lieu_absent"));
});

Deno.test("une page de lieu sans coordonnées : le nom reste, le point manque, et c'est dit", async () => {
  const { port, calls } = fakePort();
  const withoutPoint: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.searchParams.get("prop") === "coordinates") {
      return Promise.resolve(
        new Response(JSON.stringify({ query: { pages: [{ pageid: 1, title: "X" }] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return fakeFetch()(input, init);
  };
  await runImport(port, { ...baseOptions, fetchImpl: withoutPoint });

  const season = calls.records.find((r) => r.entity === "season");
  assertEquals(season?.payload.locationName, "Archipel des Perles (Panama)");
  assertEquals(season?.payload.locationLat, null);
  assertEquals(season?.anomalies, ["lieu_sans_coordonnees"]);
});
