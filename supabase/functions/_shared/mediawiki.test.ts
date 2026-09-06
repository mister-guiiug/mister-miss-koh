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
  fetchRevision,
  fetchSectionHtml,
  findSection,
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

function config(fetchImpl: typeof fetch): WikiConfig {
  return { apiUrl: "https://fr.wikipedia.org/w/api.php", userAgent: UA, fetchImpl };
}

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
});

Deno.test("une page absente échoue clairement", async () => {
  const { impl } = stubFetch({ query: { pages: [{ title: "X", missing: true }] } });
  await assertRejects(() => fetchRevision(config(impl), "X"), WikiError, "introuvable");
});

Deno.test("une erreur MediaWiki en HTTP 200 n'est pas prise pour un succès", async () => {
  // Le piège : l'API répond 200 avec un objet `error`. Sans contrôle, l'import
  // conclurait « rien à changer » et le référentiel gèlerait en silence.
  const { impl } = stubFetch({
    error: { code: "nosuchsection", info: "Section introuvable" },
  });
  await assertRejects(
    () => fetchSectionHtml(config(impl), "Page", "99"),
    WikiError,
    "Section introuvable",
  );
});

Deno.test("un HTTP 429 remonte avec son statut", async () => {
  const { impl } = stubFetch({}, { status: 429 });
  const error = await assertRejects(
    () => fetchRevision(config(impl), "Page"),
    WikiError,
  );
  assertEquals((error as WikiError).status, 429);
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
