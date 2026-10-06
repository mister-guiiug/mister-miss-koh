/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * La sonde se teste comme l'orchestrateur : sans base et sans réseau. L'horloge
 * est injectée, si bien que « trois minutes de calme » se prouvent sans
 * attendre trois minutes.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { ATTENTE_MAX_MS, CALME_MS, pendingSince, probe } from "./sonde.ts";
import { EXTRACTOR_VERSION, type ImportPort, type SourceDocument } from "./import-run.ts";
import type { RevisionInfo } from "./mediawiki.ts";

const UA = "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";
const DOC: SourceDocument = {
  id: "doc-1",
  title: "Koh-Lanta All Stars",
  apiUrl: "https://fr.wikipedia.org/w/api.php",
  seasonSlug: "all-stars-2026",
  pageId: "17479409",
};

const read = (name: string) =>
  Deno.readTextFile(new URL(`./fixtures/${name}-section.html`, import.meta.url));
const HTML: Record<string, string> = {
  "0": await read("introduction"),
  "4": await read("candidats"),
  "5": await read("deroulement"),
  "7": await read("votes"),
};

/** Un mardi soir, pendant l'émission. */
const T0 = Date.parse("2026-09-29T21:30:00Z");
const ilYa = (ms: number) => new Date(T0 - ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * L'API de fantaisie. `history` : les révisions de la page, de la plus récente
 * à la plus ancienne. Le contenu de chaque révision est celui des fixtures.
 */
function fakeWiki(history: Array<{ revid: number; at: string }>) {
  const urls: URL[] = [];
  const impl: typeof fetch = (input) => {
    const url = new URL(String(input));
    urls.push(url);
    const action = url.searchParams.get("action");
    const prop = url.searchParams.get("prop");
    let body: unknown;
    if (action === "query" && prop === "revisions") {
      const limit = Number(url.searchParams.get("rvlimit") ?? "1");
      body = {
        query: {
          pages: [{
            pageid: 17479409,
            title: DOC.title,
            revisions: history.slice(0, limit).map((r) => ({
              revid: r.revid,
              timestamp: r.at,
              size: 22668,
            })),
          }],
        },
      };
    } else if (action === "query") {
      body = {
        query: {
          pages: [{
            pageid: 4637074,
            title: url.searchParams.get("titles"),
            coordinates: [{ lat: 8.33333333, lon: -79.11666667, globe: "earth" }],
          }],
        },
      };
    } else {
      const revid = Number(url.searchParams.get("oldid"));
      body = prop === "tocdata"
        ? {
          parse: {
            revid,
            tocdata: {
              sections: [
                { index: "4", number: "3", line: "Candidats" },
                { index: "5", number: "4", line: "Déroulement" },
                { index: "7", number: "4.2", line: "Détails des votes" },
              ],
            },
          },
        }
        : { parse: { revid, text: HTML[url.searchParams.get("section") ?? ""] ?? "" } };
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { impl, urls };
}

/** Port de fantaisie : ce qui a été lu, noté, créé. */
function fakePort(options: {
  known?: string | null;
  version?: string;
  replay?: boolean;
} = {}) {
  const calls = { runs: [] as string[], observed: [] as string[] };
  const port: ImportPort = {
    loadDocument: () => Promise.resolve(DOC),
    lastImportedRevision: () => Promise.resolve(options.known ?? null),
    lastExtractorVersion: () => Promise.resolve(options.version ?? EXTRACTOR_VERSION),
    lastExtractHash: () => Promise.resolve(null),
    createRun: () => {
      const id = `run-${calls.runs.length + 1}`;
      calls.runs.push(id);
      return Promise.resolve(id);
    },
    finishRun: () => Promise.resolve(),
    saveRecords: () => Promise.resolve(),
    loadPublished: () => Promise.resolve([]),
    saveDifferences: () => Promise.resolve(),
    autoValidateDifferences: () => Promise.resolve(),
    replayUnpublished: () => Promise.resolve(options.replay === true),
    publishRun: () => Promise.resolve(),
    holdRevision: () => Promise.resolve(),
    prepareApercu: () => Promise.resolve(),
    renameDocument: () => Promise.resolve(),
    noteObserved: (_documentId, revisionId) => {
      calls.observed.push(revisionId);
      return Promise.resolve();
    },
    loadPolicy: () =>
      Promise.resolve({ autoValidateUnambiguous: false, maxAutoChanges: 0 }),
    log: () => Promise.resolve(),
  };
  return { port, calls };
}

const options = (fetchImpl: typeof fetch) => ({
  documentId: DOC.id,
  trigger: "scheduled" as const,
  actorId: null,
  userAgent: UA,
  fetchImpl,
  now: () => T0,
});

const revisionsDemandees = (urls: URL[]) =>
  urls.filter((u) => u.searchParams.get("prop") === "revisions").length;

// ══════════════════════════════════════════════════════════════════════════

Deno.test("rien n'a bougé : un appel, aucune exécution, l'heure de lecture notée", async () => {
  const wiki = fakeWiki([{ revid: 239179934, at: ilYa(3_600_000) }]);
  const { port, calls } = fakePort({ known: "239179934" });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "inchangee");
  assertEquals(calls.runs, [], "aucune exécution en base");
  assertEquals(calls.observed, ["239179934"]);
  assertEquals(wiki.urls.length, 1, "une seule requête, sans contenu");
});

Deno.test("une page qui vient de bouger : on attend qu'elle se calme", async () => {
  const wiki = fakeWiki([
    { revid: 239179935, at: ilYa(60_000) },
    { revid: 239179934, at: ilYa(7_200_000) },
  ]);
  const { port, calls } = fakePort({ known: "239179934" });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "trop_recente");
  assertEquals(outcome.revision, "239179935");
  assertEquals(calls.runs, []);
  // La lecture d'attente ne se note pas : le site dirait qu'une révision plus
  // récente attend, pour trois minutes.
  assertEquals(calls.observed, []);
  assertEquals(wiki.urls.length, 1);
});

Deno.test("calmée depuis trois minutes : la révision est lue, et c'est elle qu'on lit", async () => {
  const wiki = fakeWiki([
    { revid: 239179935, at: ilYa(CALME_MS) },
    { revid: 239179934, at: ilYa(7_200_000) },
  ]);
  const { port, calls } = fakePort({ known: "239179934" });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "importee");
  assertEquals(outcome.run?.status, "diffed");
  assertEquals(outcome.run?.revision, "239179935");
  assertEquals(calls.runs.length, 1);
  assertEquals(revisionsDemandees(wiki.urls), 1, "l'import ne redemande pas la révision");
  for (const u of wiki.urls.filter((u) => u.searchParams.get("action") === "parse")) {
    assertEquals(u.searchParams.get("oldid"), "239179935");
  }
});

Deno.test("une page qui ne se calme jamais est lue au bout de quinze minutes", async () => {
  // Une rafale commencée il y a seize minutes, qui dure encore.
  const wiki = fakeWiki([
    { revid: 239179938, at: ilYa(30_000) },
    { revid: 239179937, at: ilYa(300_000) },
    { revid: 239179936, at: ilYa(ATTENTE_MAX_MS + 60_000) },
    { revid: 239179934, at: ilYa(7_200_000) },
  ]);
  const { port } = fakePort({ known: "239179934" });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "importee", "le site ne se fige pas");
  assertEquals(outcome.revision, "239179938");
});

Deno.test("même révision mais extraction nouvelle : lue sans attendre", async () => {
  // La page n'a pas bougé : rien à laisser se calmer.
  const wiki = fakeWiki([{ revid: 239179934, at: ilYa(10_000) }]);
  const { port } = fakePort({ known: "239179934", version: "12" });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "importee");
});

Deno.test("déjà lue, mais son lot certain n'est pas en ligne : rejouée", async () => {
  const wiki = fakeWiki([{ revid: 239179934, at: ilYa(3_600_000) }]);
  const { port, calls } = fakePort({ known: "239179934", replay: true });
  const outcome = await probe(port, options(wiki.impl));

  assertEquals(outcome.status, "importee");
  assertEquals(calls.observed, [], "le rejeu note sa lecture par son exécution");
});

Deno.test("depuis quand la page attend : la plus ancienne révision non lue", () => {
  const revs: RevisionInfo[] = [
    { pageId: 1, title: "P", revId: "30", revisedAt: "t30", sizeBytes: 0 },
    { pageId: 1, title: "P", revId: "20", revisedAt: "t20", sizeBytes: 0 },
    { pageId: 1, title: "P", revId: "10", revisedAt: "t10", sizeBytes: 0 },
  ];
  assertEquals(pendingSince(revs, "10"), "t20");
  assertEquals(pendingSince(revs, "20"), "t30");
  assertEquals(pendingSince(revs, "30"), null, "rien n'attend");
  assertEquals(pendingSince(revs, null), "t10", "sans révision connue, tout attend");
  // Une révision connue plus récente que tout l'historique : une annulation
  // a fait revenir la page en arrière, rien n'est « nouveau » à dater.
  assertEquals(pendingSince(revs, "40"), null);
});

Deno.test("les deux durées se tiennent : attendre le calme, jamais sans fin", () => {
  assert(CALME_MS < ATTENTE_MAX_MS);
  assertEquals(CALME_MS, 180_000);
  assertEquals(ATTENTE_MAX_MS, 900_000);
});
