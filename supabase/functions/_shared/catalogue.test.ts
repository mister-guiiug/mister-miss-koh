/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * AUCUN APPEL RÉSEAU : `fetch` est injecté. Les réponses reproduites ici sont
 * celles observées le 05/09/2026 sur `Catégorie:Saison de Koh-Lanta`.
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";
import {
  type CataloguePage,
  discoverSeasons,
  fetchSeasonCatalogue,
  pageUrl,
  slugify,
} from "./catalogue.ts";
import { type WikiConfig, WikiError } from "./mediawiki.ts";

const UA = "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";

/** Réponses successives, dans l'ordre : une par appel. */
function stubFetch(bodies: unknown[]) {
  const urls: string[] = [];
  const impl: typeof fetch = (input) => {
    urls.push(String(input));
    const body = bodies[urls.length - 1] ?? bodies[bodies.length - 1];
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { impl, urls };
}

function config(impl: typeof fetch): WikiConfig {
  return {
    apiUrl: "https://fr.wikipedia.org/w/api.php",
    userAgent: UA,
    fetchImpl: impl,
  };
}

const PAGE = (pageid: number, title: string) => ({ pageid, title });

// ── Dérivation du slug ────────────────────────────────────────────────────

Deno.test("slug : accents dépliés, ponctuation fondue, pas de tiret aux bouts", () => {
  assertEquals(slugify("Koh-Lanta All Stars"), "koh-lanta-all-stars");
  assertEquals(slugify("Koh-Lanta : L'Île des héros"), "koh-lanta-l-ile-des-heros");
  assertEquals(slugify("Koh-Lanta : Les 4 Terres"), "koh-lanta-les-4-terres");
  assertEquals(slugify("Les Aventuriers de Koh-Lanta"), "les-aventuriers-de-koh-lanta");
  assertEquals(slugify("  ---  "), "");
});

Deno.test("URL : le titre s'encode, l'espace devient souligné", () => {
  assertEquals(
    pageUrl("https://fr.wikipedia.org", "Koh-Lanta All Stars"),
    "https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars",
  );
  assert(
    pageUrl("https://fr.wikipedia.org/", "Koh-Lanta : Fidji").startsWith(
      "https://fr.wikipedia.org/wiki/",
    ),
    "une racine terminée par une barre ne doit pas doubler la barre",
  );
});

// ── Découverte ────────────────────────────────────────────────────────────

Deno.test("catalogue : les pages déclarées, triées, avec identifiant et slug", async () => {
  const { impl, urls } = stubFetch([
    {
      query: {
        categorymembers: [
          PAGE(17479409, "Koh-Lanta All Stars"),
          PAGE(10962643, "Koh-Lanta : Fidji"),
        ],
      },
    },
  ]);
  const { pages, duplicates } = await fetchSeasonCatalogue(config(impl));

  assertEquals(duplicates, []);
  // Ordre du français : la ponctuation ne pèse pas, « Fidji » précède « All
  // Stars » parce que le tri porte sur ce qui reste une fois les deux-points
  // écartés. C'est l'ordre d'un lecteur, pas celui des codets.
  assertEquals(pages.map((p) => p.title), [
    "Koh-Lanta : Fidji",
    "Koh-Lanta All Stars",
  ]);
  assertEquals(pages[1].externalId, "17479409", "l'identifiant est le pageid, en texte");
  assertEquals(pages[0].slug, "koh-lanta-fidji");
  assert(urls[0].includes("cmtype=page"), "ni sous-catégories ni fichiers");
  assert(urls[0].includes("list=categorymembers"));
});

Deno.test("catalogue : la pagination est suivie jusqu'au bout", async () => {
  const { impl, urls } = stubFetch([
    {
      query: { categorymembers: [PAGE(1, "Koh-Lanta : Pacifique")] },
      continue: { cmcontinue: "page|42" },
    },
    { query: { categorymembers: [PAGE(2, "Koh-Lanta : Malaisie")] } },
  ]);
  const { pages } = await fetchSeasonCatalogue(config(impl));

  assertEquals(pages.length, 2);
  assertEquals(urls.length, 2);
  assert(urls[1].includes("cmcontinue=page%7C42"), "le jeton de suite est renvoyé");
});

Deno.test("catalogue : une pagination sans fin s'arrête, elle ne tourne pas", async () => {
  const { impl } = stubFetch([
    { query: { categorymembers: [PAGE(1, "A")] }, continue: { cmcontinue: "toujours" } },
  ]);
  await assertRejects(
    () => fetchSeasonCatalogue(config(impl)),
    WikiError,
    "n'a pas fini de se paginer",
  );
});

Deno.test("catalogue : deux titres au même slug, le second est écarté et signalé", () => {
  // Sans ce garde, la deuxième page écraserait la première à l'enregistrement
  // — le slug est la clé publique d'une saison.
  const { impl } = stubFetch([
    {
      query: {
        categorymembers: [PAGE(1, "Koh-Lanta : Fidji"), PAGE(2, "Koh-Lanta — Fidji")],
      },
    },
  ]);
  return fetchSeasonCatalogue(config(impl)).then(({ pages, duplicates }) => {
    assertEquals(pages.length, 1);
    assertEquals(duplicates, ["Koh-Lanta — Fidji"]);
  });
});

// ── Enregistrement ────────────────────────────────────────────────────────

function fakePort(known: string[]) {
  const registered: CataloguePage[] = [];
  const logs: string[] = [];
  return {
    registered,
    logs,
    port: {
      knownExternalIds: () => Promise.resolve(known),
      registerSeason: (page: CataloguePage) => {
        registered.push(page);
        return Promise.resolve();
      },
      log: (_action: string, summary: string) => {
        logs.push(summary);
        return Promise.resolve();
      },
    },
  };
}

Deno.test("découverte : seules les pages inconnues sont enregistrées", async () => {
  const { impl } = stubFetch([
    {
      query: {
        categorymembers: [
          PAGE(17479409, "Koh-Lanta All Stars"),
          PAGE(10962643, "Koh-Lanta : Fidji"),
        ],
      },
    },
  ]);
  const { port, registered, logs } = fakePort(["17479409"]);
  const out = await discoverSeasons(port, config(impl));

  assertEquals(out.found, 2);
  assertEquals(out.added, 1);
  assertEquals(registered.map((p) => p.title), ["Koh-Lanta : Fidji"]);
  assertEquals(logs.length, 1);
});

Deno.test("découverte : une page retirée de la catégorie n'est PAS supprimée", async () => {
  // Une suppression effacerait en cascade des données publiées, sur la foi
  // d'une modification que n'importe qui peut faire.
  const { impl } = stubFetch([{
    query: { categorymembers: [PAGE(1, "Koh-Lanta : Fidji")] },
  }]);
  const { port, registered } = fakePort(["999", "1"]);
  const out = await discoverSeasons(port, config(impl));

  assertEquals(out.added, 0);
  assertEquals(registered, [], "rien n'est écrit, et surtout rien n'est retiré");
});

Deno.test("découverte : une catégorie vide n'enregistre rien et ne casse pas", async () => {
  const { impl } = stubFetch([{ query: { categorymembers: [] } }]);
  const { port, registered } = fakePort([]);
  const out = await discoverSeasons(port, config(impl));

  assertEquals(out.found, 0);
  assertEquals(out.added, 0);
  assertEquals(registered, []);
});
