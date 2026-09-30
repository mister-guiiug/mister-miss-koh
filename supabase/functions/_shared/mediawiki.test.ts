/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * AUCUN APPEL RÉSEAU. `fetch` est injecté : les tests décrivent ce que l'API
 * renvoie, y compris ses façons de mal répondre. Un test qui appellerait
 * Wikipédia serait lent, dépendant du réseau, et surtout impoli — il ferait
 * une requête à chaque exécution, sans que personne n'en ait besoin.
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import {
  extractHash,
  fetchCoordinates,
  fetchEdits,
  fetchRevision,
  fetchRevisionHistory,
  fetchSectionHtml,
  fetchSections,
  fetchUserGroups,
  findSection,
  MAX_RETRIES,
  MAX_WAIT_MS,
  MAXLAG,
  stableStringify,
  type WikiConfig,
  WikiError,
} from "./mediawiki.ts";

const UA = "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";

function stubFetch(body: unknown, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl: typeof fetch = (input, options) => {
    calls.push(new Request(String(input), options as RequestInit));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { impl, calls };
}

/**
 * Des réponses rendues dans l'ordre, une par appel : le serveur qui dit
 * « plus tard » puis répond. `headers` porte `Retry-After` quand il le faut.
 */
function scriptedFetch(
  script: Array<{ body?: unknown; status?: number; headers?: Record<string, string> }>,
) {
  const calls: Request[] = [];
  const impl: typeof fetch = (input, options) => {
    calls.push(new Request(String(input), options as RequestInit));
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify(step.body ?? {}), {
        status: step.status ?? 200,
        headers: { "content-type": "application/json", ...step.headers },
      }),
    );
  };
  return { impl, calls };
}

/** Une attente qui n'attend pas : elle note seulement ce qui a été demandé. */
function recordedSleep() {
  const waits: number[] = [];
  const sleep = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { sleep, waits };
}

function config(fetchImpl: typeof fetch, extra: Partial<WikiConfig> = {}): WikiConfig {
  return {
    apiUrl: "https://fr.wikipedia.org/w/api.php",
    userAgent: UA,
    fetchImpl,
    ...extra,
  };
}

const REVISION_OK = {
  query: {
    pages: [{
      pageid: 17479409,
      title: "Koh-Lanta All Stars",
      revisions: [{ revid: 239179934, timestamp: "2026-09-03T01:34:31Z", size: 22668 }],
    }],
  },
};

Deno.test("un User-Agent anonyme est refusé AVANT tout appel", async () => {
  const { impl, calls } = stubFetch({});
  await assertRejects(
    () =>
      fetchRevision(
        {
          apiUrl: "https://fr.wikipedia.org/w/api.php",
          userAgent: "bot",
          fetchImpl: impl,
        },
        "Page",
      ),
    WikiError,
  );
  assertEquals(calls.length, 0, "rien ne doit partir sur le réseau");
});

Deno.test("l'appel porte le User-Agent et le format attendu", async () => {
  const { impl, calls } = stubFetch({
    query: {
      pages: [{
        pageid: 17479409,
        title: "Koh-Lanta All Stars",
        revisions: [{ revid: 239179934, timestamp: "2026-09-03T01:34:31Z", size: 22668 }],
      }],
    },
  });
  const info = await fetchRevision(config(impl), "Koh-Lanta All Stars");

  assertEquals(info.pageId, 17479409);
  assertEquals(info.revId, "239179934");
  assertEquals(info.sizeBytes, 22668);

  const url = new URL(calls[0].url);
  assertEquals(url.searchParams.get("formatversion"), "2");
  assertEquals(calls[0].headers.get("User-Agent"), UA);
  // Une tâche automatique déclare le retard qu'elle tolère : au-delà, l'API
  // refuse et demande d'attendre, au lieu de charger des serveurs en retard.
  assertEquals(url.searchParams.get("maxlag"), String(MAXLAG));
});

Deno.test("la page se désigne par son pageid, le titre ne sert qu'en repli", async () => {
  const parId = stubFetch(REVISION_OK);
  await fetchRevision(config(parId.impl), {
    title: "Ancien titre",
    pageId: "17479409",
  });
  const url = new URL(parId.calls[0].url);
  assertEquals(url.searchParams.get("pageids"), "17479409");
  assertEquals(url.searchParams.get("titles"), null, "le titre ne désigne rien");

  // Sans `pageid`, le titre, et la redirection suivie jusqu'à la page réelle.
  const parTitre = stubFetch(REVISION_OK);
  await fetchRevision(config(parTitre.impl), { title: "Koh-Lanta All Stars" });
  const repli = new URL(parTitre.calls[0].url);
  assertEquals(repli.searchParams.get("titles"), "Koh-Lanta All Stars");
  assertEquals(repli.searchParams.get("redirects"), "1");
});

Deno.test("l'historique : les dernières révisions, en un appel, sans contenu", async () => {
  const { impl, calls } = stubFetch({
    query: {
      pages: [{
        pageid: 17479409,
        title: "Koh-Lanta All Stars",
        revisions: [
          { revid: 239179936, timestamp: "2026-09-29T21:28:00Z", size: 22700 },
          { revid: 239179935, timestamp: "2026-09-29T21:25:00Z", size: 22690 },
        ],
      }],
    },
  });
  const history = await fetchRevisionHistory(config(impl), {
    title: "Koh-Lanta All Stars",
    pageId: "17479409",
  }, 20);

  assertEquals(history.revisions.map((r) => r.revId), ["239179936", "239179935"]);
  assertEquals(history.revisions[0].revisedAt, "2026-09-29T21:28:00Z");
  const url = new URL(calls[0].url);
  assertEquals(url.searchParams.get("rvlimit"), "20");
  assertEquals(url.searchParams.get("rvprop"), "ids|timestamp|size");
  assertEquals(calls.length, 1);

  // La dernière révision seule : le même appel, limité à une.
  const une = stubFetch(REVISION_OK);
  await fetchRevision(config(une.impl), { title: "X", pageId: "17479409" });
  assertEquals(new URL(une.calls[0].url).searchParams.get("rvlimit"), "1");
});

Deno.test("les modifications, depuis une révision vers le passé, avec leurs balises", async () => {
  const { impl, calls } = stubFetch({
    continue: { rvcontinue: "20260929212000|239179930", continue: "||" },
    query: {
      pages: [{
        pageid: 17479409,
        title: "Koh-Lanta All Stars",
        revisions: [
          {
            revid: 239179936,
            timestamp: "2026-09-29T21:28:00Z",
            tags: [],
            user: "Cocojean29",
          },
          {
            revid: 239179935,
            timestamp: "2026-09-29T21:25:00Z",
            tags: ["mw-reverted", "visualeditor"],
            user: "192.0.2.7",
            anon: true,
          },
        ],
      }],
    },
  });
  const window = await fetchEdits(
    config(impl),
    { title: "Koh-Lanta All Stars", pageId: "17479409" },
    "239179936",
    2,
  );

  assertEquals(window.edits.map((e) => e.revId), ["239179936", "239179935"]);
  assertEquals(window.edits[1].tags, ["mw-reverted", "visualeditor"]);
  assertEquals(
    window.edits.map((e) => e.user),
    ["Cocojean29", null],
    "une IP n'a pas de compte",
  );
  assertEquals(window.more, true, "l'API a d'autres modifications, plus anciennes");
  const url = new URL(calls[0].url);
  assertEquals(url.searchParams.get("pageids"), "17479409");
  assertEquals(url.searchParams.get("rvstartid"), "239179936");
  assertEquals(url.searchParams.get("rvprop"), "ids|timestamp|tags|user");
  assertEquals(url.searchParams.get("rvlimit"), "2");
});

Deno.test("les groupes des comptes, en un appel ; un nom inconnu n'a aucun groupe", async () => {
  const { impl, calls } = stubFetch({
    query: {
      users: [
        { userid: 1, name: "Cocojean29", groups: ["*", "user", "autoconfirmed"] },
        { name: "Fantôme", missing: true },
      ],
    },
  });
  const groups = await fetchUserGroups(config(impl), ["Cocojean29", "Fantôme"]);

  assertEquals(groups.get("Cocojean29"), ["*", "user", "autoconfirmed"]);
  assertEquals(groups.get("Fantôme"), []);
  const url = new URL(calls[0].url);
  assertEquals(url.searchParams.get("list"), "users");
  assertEquals(url.searchParams.get("ususers"), "Cocojean29|Fantôme");
  assertEquals(url.searchParams.get("usprop"), "groups");

  // Rien à demander : aucun appel.
  const vide = stubFetch({});
  assertEquals((await fetchUserGroups(config(vide.impl), [])).size, 0);
  assertEquals(vide.calls.length, 0);
});

Deno.test("le titre rendu est celui d'aujourd'hui : un renommage se voit", async () => {
  const { impl } = stubFetch({
    query: {
      pages: [{
        pageid: 17479409,
        title: "Koh-Lanta All Stars (2026)",
        revisions: [{ revid: 239179934, timestamp: "2026-09-03T01:34:31Z", size: 1 }],
      }],
    },
  });
  const info = await fetchRevision(config(impl), {
    title: "Koh-Lanta All Stars",
    pageId: 17479409,
  });
  assertEquals(info.title, "Koh-Lanta All Stars (2026)");
});

Deno.test("sections et HTML se lisent sur LA révision vérifiée, jamais par le titre", async () => {
  const sections = stubFetch({
    parse: {
      revid: 239179934,
      tocdata: {
        sections: [{ index: "4", number: "3", line: "Candidats" }],
      },
    },
  });
  const lues = await fetchSections(config(sections.impl), { revId: "239179934" });
  assertEquals(lues, [{ index: "4", number: "3", line: "Candidats" }]);
  const urlSections = new URL(sections.calls[0].url);
  assertEquals(urlSections.searchParams.get("oldid"), "239179934");
  assertEquals(urlSections.searchParams.get("page"), null);
  // `prop=sections` est déprécié (réponse de l'API au 30/09/2026).
  assertEquals(urlSections.searchParams.get("prop"), "tocdata");

  const html = stubFetch({ parse: { revid: 239179934, text: "<table></table>" } });
  assertEquals(
    await fetchSectionHtml(config(html.impl), { revId: "239179934" }, "4"),
    "<table></table>",
  );
  const urlHtml = new URL(html.calls[0].url);
  assertEquals(urlHtml.searchParams.get("oldid"), "239179934");
  assertEquals(urlHtml.searchParams.get("section"), "4");
  assertEquals(urlHtml.searchParams.get("page"), null);
});

Deno.test("les sections se lisent encore dans l'ancienne forme, en repli", async () => {
  const { impl } = stubFetch({
    parse: { sections: [{ index: "7", number: "4.2", line: "Détails des votes" }] },
  });
  assertEquals(await fetchSections(config(impl), { revId: "1" }), [
    { index: "7", number: "4.2", line: "Détails des votes" },
  ]);
});

Deno.test("une réponse qui a lu une autre révision est refusée", async () => {
  const { impl } = stubFetch({ parse: { revid: 239999999, text: "<p>autre</p>" } });
  await assertRejects(
    () => fetchSectionHtml(config(impl), { revId: "239179934" }, "4"),
    WikiError,
    "au lieu de 239179934",
  );
});

Deno.test("une page absente échoue clairement", async () => {
  const { impl } = stubFetch({ query: { pages: [{ title: "X", missing: true }] } });
  await assertRejects(() => fetchRevision(config(impl), "X"), WikiError, "introuvable");
});

Deno.test("une erreur MediaWiki en HTTP 200 n'est pas prise pour un succès", async () => {
  // Le piège : l'API répond 200 avec un objet `error`. Sans contrôle, l'import
  // conclurait « rien à changer » et le référentiel gèlerait en silence.
  const { impl, calls } = stubFetch({
    error: { code: "nosuchsection", info: "Section introuvable" },
  });
  const error = await assertRejects(
    () => fetchSectionHtml(config(impl), { revId: "1" }, "99"),
    WikiError,
    "Section introuvable",
  );
  assertEquals((error as WikiError).code, "nosuchsection");
  assertEquals(calls.length, 1, "une erreur de la requête ne se reprend pas");
});

Deno.test("un 429 est repris après l'attente que le serveur demande", async () => {
  const { impl, calls } = scriptedFetch([
    { status: 429, headers: { "Retry-After": "3" } },
    { body: REVISION_OK },
  ]);
  const { sleep, waits } = recordedSleep();
  const info = await fetchRevision(config(impl, { sleep }), "Koh-Lanta All Stars");

  assertEquals(info.revId, "239179934");
  assertEquals(calls.length, 2);
  assertEquals(waits, [3000], "Retry-After est en secondes");
});

Deno.test("un 429 qui dure remonte avec son statut, après deux reprises", async () => {
  const { impl, calls } = scriptedFetch([{ status: 429 }]);
  const { sleep, waits } = recordedSleep();
  const error = await assertRejects(
    () => fetchRevision(config(impl, { sleep }), "Page"),
    WikiError,
  );
  assertEquals((error as WikiError).status, 429);
  assertEquals(calls.length, MAX_RETRIES + 1);
  // Sans Retry-After : une seconde, puis deux.
  assertEquals(waits, [1000, 2000]);
});

Deno.test("un 503 se reprend comme un 429, l'attente plafonnée", async () => {
  const { impl, calls } = scriptedFetch([
    { status: 503, headers: { "Retry-After": "120" } },
    { body: REVISION_OK },
  ]);
  const { sleep, waits } = recordedSleep();
  await fetchRevision(config(impl, { sleep }), "Page");
  assertEquals(calls.length, 2);
  assertEquals(waits, [MAX_WAIT_MS], "deux minutes attendront la planification suivante");
});

Deno.test("maxlag arrive en HTTP 200 : c'est une demande d'attendre, reprise", async () => {
  const { impl, calls } = scriptedFetch([
    {
      body: { error: { code: "maxlag", info: "Waiting for a database server" } },
      headers: { "Retry-After": "5" },
    },
    { body: REVISION_OK },
  ]);
  const { sleep, waits } = recordedSleep();
  const info = await fetchRevision(config(impl, { sleep }), "Page");
  assertEquals(info.revId, "239179934");
  assertEquals(calls.length, 2);
  assertEquals(waits, [5000]);
});

Deno.test("un 404 ne se reprend pas", async () => {
  const { impl, calls } = scriptedFetch([{ status: 404 }]);
  const { sleep, waits } = recordedSleep();
  const error = await assertRejects(
    () => fetchRevision(config(impl, { sleep }), "Page"),
    WikiError,
  );
  assertEquals((error as WikiError).status, 404);
  assertEquals(calls.length, 1);
  assertEquals(waits, []);
});

Deno.test("les avertissements de l'API remontent, sans l'invitation générique", async () => {
  const { impl } = stubFetch({
    warnings: {
      main: {
        warnings:
          "Subscribe to the mediawiki-api-announce mailing list at <https://lists.wikimedia.org/> for notice of API deprecations and breaking changes.",
      },
      parse: { warnings: '"prop=sections" has been deprecated.' },
    },
    parse: { revid: 1, sections: [] },
  });
  const recus: string[] = [];
  await fetchSections(config(impl, { onWarning: (w) => recus.push(w) }), {
    revId: "1",
  });
  assertEquals(recus, ['parse : "prop=sections" has been deprecated.']);
});

Deno.test("les coordonnées d'une page de lieu, ou rien", async () => {
  const { impl, calls } = stubFetch({
    query: {
      pages: [{
        pageid: 4637074,
        title: "Archipel des Perles",
        coordinates: [{
          lat: 8.33333333,
          lon: -79.11666667,
          primary: true,
          globe: "earth",
        }],
      }],
    },
  });
  assertEquals(await fetchCoordinates(config(impl), "Archipel des Perles"), {
    lat: 8.33333333,
    lon: -79.11666667,
  });
  const url = new URL(calls[0].url);
  assertEquals(url.searchParams.get("prop"), "coordinates");
  assertEquals(url.searchParams.get("titles"), "Archipel des Perles");

  // Une page sans coordonnées, une page absente : rien, sans erreur — un lieu
  // sans point reste un lieu.
  const none = stubFetch({ query: { pages: [{ pageid: 1, title: "Sans lieu" }] } });
  assertEquals(await fetchCoordinates(config(none.impl), "Sans lieu"), null);
  const missing = stubFetch({ query: { pages: [{ title: "X", missing: true }] } });
  assertEquals(await fetchCoordinates(config(missing.impl), "X"), null);
});

Deno.test("une section se cherche par son TITRE, jamais par son rang", () => {
  // Relevé du 05/09/2026 : l'index 3 rend « Nouveautés » quand le numéro 3
  // désigne « Candidats ». Confondre les deux fait lire la mauvaise section.
  const sections = [
    { index: "3", number: "2", line: "Nouveautés" },
    { index: "4", number: "3", line: "Candidats" },
    { index: "7", number: "4.2", line: "Détails des votes" },
  ];
  assertEquals(findSection(sections, "Candidats")?.index, "4");
  assertEquals(findSection(sections, "détails des votes")?.index, "7");
  assertEquals(findSection(sections, "Audiences"), null);
});

Deno.test("plusieurs titres pour un même tableau : le premier trouvé gagne", () => {
  // « Détails des votes » sur dix saisons, « Détail des votes » sur une,
  // « Détail des éliminations » sur quatre anciennes — et strictement le même
  // tableau dessous (relevé du 11/09/2026 sur les dix-huit pages).
  const anciennes = [
    { index: "3", number: "2", line: "Candidats" },
    { index: "6", number: "4.3", line: "Détail des éliminations" },
  ];
  assertEquals(
    findSection(anciennes, "Détails des votes", "Détail des éliminations")?.index,
    "6",
  );
  assertEquals(
    findSection(anciennes, "Détails des votes"),
    null,
    "sans le synonyme, la section reste introuvable",
  );

  // L'ORDRE COMPTE : une page qui porterait les deux titres donne le premier
  // de la liste, pas le premier de la page.
  const lesDeux = [
    { index: "6", number: "4.2", line: "Détail des éliminations" },
    { index: "8", number: "4.4", line: "Détails des votes" },
  ];
  assertEquals(
    findSection(lesDeux, "Détails des votes", "Détail des éliminations")?.index,
    "8",
  );
});

Deno.test("l'empreinte ignore l'ordre des clés", async () => {
  const a = await extractHash({ b: 2, a: [1, { y: 1, x: 0 }] });
  const b = await extractHash({ a: [1, { x: 0, y: 1 }], b: 2 });
  assertEquals(a, b, "deux extractions équivalentes ont la même empreinte");
});

Deno.test("l'empreinte change quand une valeur change", async () => {
  const a = await extractHash({ votes: 11 });
  const b = await extractHash({ votes: 12 });
  assert(a !== b);
});

Deno.test("la sérialisation stable écarte les valeurs absentes", () => {
  assertEquals(stableStringify({ a: 1, b: undefined }), '{"a":1}');
});
