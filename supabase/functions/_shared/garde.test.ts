/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * AUCUN APPEL RÉSEAU. `fetch` est injecté et répond comme l'API MediaWiki :
 * l'historique de la page, puis les groupes des comptes. Ce qui est vérifié,
 * ce sont les DÉCISIONS : quand le lot peut se publier seul, et surtout quand
 * il doit attendre un humain.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { guardEdits, MAX_VERIFIEES, SURVIE_MS } from "./garde.ts";
import type { WikiConfig } from "./mediawiki.ts";

const UA = "mister-miss-koh/0.1 (https://github.com/mister-guiiug/mister-miss-koh)";
const PAGE = { title: "Koh-Lanta All Stars", pageId: "17479409" };
/** Le soir de l'épisode 6 : 23 h 30 à Paris. */
const NOW = Date.parse("2026-09-29T21:30:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

interface Edit {
  revid: number;
  timestamp: string;
  tags?: string[];
  user?: string;
  anon?: boolean;
  temp?: boolean;
  userhidden?: boolean;
}

/**
 * L'API MediaWiki : l'historique (`prop=revisions`) et les groupes des comptes
 * (`list=users`). Un compte absent de `groups` est inconnu de l'API.
 */
function api(options: {
  edits: Edit[];
  more?: boolean;
  groups?: Record<string, string[]>;
  usersStatus?: number;
}) {
  const userQueries: string[][] = [];
  const impl: typeof fetch = (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("list") === "users") {
      const names = (url.searchParams.get("ususers") ?? "").split("|");
      userQueries.push(names);
      if (options.usersStatus) {
        return Promise.resolve(new Response("{}", { status: options.usersStatus }));
      }
      return Promise.resolve(Response.json({
        query: {
          users: names.map((name) =>
            options.groups?.[name]
              ? { name, groups: options.groups[name] }
              : { name, missing: true }
          ),
        },
      }));
    }
    return Promise.resolve(Response.json({
      ...(options.more ? { continue: { rvcontinue: "x", continue: "||" } } : {}),
      query: {
        pages: [{ pageid: 17479409, title: PAGE.title, revisions: options.edits }],
      },
    }));
  };
  return { impl, userQueries };
}

const CONFIRME = ["*", "user", "autoconfirmed"];

function config(impl: typeof fetch): WikiConfig {
  return {
    apiUrl: "https://fr.wikipedia.org/w/api.php",
    userAgent: UA,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  };
}

Deno.test("des comptes confirmés depuis la révision en ligne : le lot peut se publier seul", async () => {
  const s = api({
    edits: [
      { revid: 105, timestamp: minutesAgo(5), user: "Cocojean29" },
      { revid: 104, timestamp: minutesAgo(12), user: "Continental66" },
      { revid: 103, timestamp: minutesAgo(20), user: "Cocojean29" },
      { revid: 100, timestamp: minutesAgo(60 * 24 * 6), anon: true },
    ],
    groups: { Cocojean29: CONFIRME, Continental66: [...CONFIRME, "autopatrolled"] },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, true);
  assertEquals(
    verdict.message,
    "garde anti-vandalisme : 3 modification(s) récente(s), toutes de comptes confirmés",
  );
  assertEquals(
    s.userQueries,
    [["Cocojean29", "Continental66"]],
    "un appel, chaque nom une fois",
  );
});

Deno.test("une adresse IP depuis la révision en ligne : le lot attend un humain", async () => {
  const s = api({
    edits: [
      { revid: 105, timestamp: minutesAgo(5), user: "Cocojean29" },
      { revid: 104, timestamp: minutesAgo(12), user: "192.0.2.7", anon: true },
    ],
    groups: { Cocojean29: CONFIRME },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, false);
  assertEquals(
    verdict.message,
    "garde anti-vandalisme : la révision 104 vient d'une adresse IP ou d'un compte temporaire : relecture humaine",
  );
  assert(!verdict.message.includes("192.0.2.7"), "l'adresse IP n'entre pas au journal");
  assertEquals(s.userQueries, [], "rien à demander : personne d'identifiable");
});

Deno.test("un compte temporaire ou un nom masqué valent une adresse IP", async () => {
  for (const edit of [{ temp: true, user: "~2026-12345-6" }, { userhidden: true }]) {
    const s = api({ edits: [{ revid: 105, timestamp: minutesAgo(5), ...edit }] });
    const verdict = await guardEdits(config(s.impl), PAGE, {
      published: "100",
      candidate: "105",
      now: NOW,
    });
    assertEquals(verdict.ok, false);
    assert(verdict.message.includes("la révision 105 vient d'une adresse IP"));
  }
});

Deno.test("un compte non confirmé : le lot attend, et la révision est nommée", async () => {
  const s = api({
    edits: [
      { revid: 105, timestamp: minutesAgo(5), user: "Cocojean29" },
      { revid: 104, timestamp: minutesAgo(12), user: "Canard919" },
    ],
    groups: { Cocojean29: CONFIRME, Canard919: ["*", "user"] },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, false);
  assertEquals(
    verdict.message,
    "garde anti-vandalisme : la révision 104 vient d'un compte non confirmé : relecture humaine",
  );
});

Deno.test("un compte que l'API ne connaît pas n'est pas confirmé", async () => {
  const s = api({ edits: [{ revid: 105, timestamp: minutesAgo(5), user: "Fantôme" }] });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });
  assertEquals(verdict.ok, false);
});

Deno.test("une modification déjà annulée ne compte pas : son effet a quitté la page", async () => {
  // Le vandalisme de 21 h 26, annulé à 21 h 28 : la page est revenue à la
  // version d'avant, et c'est elle que le lot a lue.
  const s = api({
    edits: [
      { revid: 106, timestamp: minutesAgo(2), user: "Cocojean29", tags: ["mw-rollback"] },
      { revid: 105, timestamp: minutesAgo(4), anon: true, tags: ["mw-reverted"] },
      { revid: 104, timestamp: minutesAgo(12), user: "Cocojean29" },
    ],
    groups: { Cocojean29: CONFIRME },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "106",
    now: NOW,
  });

  assertEquals(verdict.ok, true);
});

Deno.test("une modification restée en ligne un jour a survécu : elle ne compte plus", async () => {
  const s = api({
    edits: [
      { revid: 105, timestamp: minutesAgo(30), user: "Cocojean29" },
      {
        revid: 103,
        timestamp: new Date(NOW - SURVIE_MS - 60_000).toISOString(),
        anon: true,
      },
    ],
    groups: { Cocojean29: CONFIRME },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "90",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, true);
});

Deno.test("sans révision en ligne, seules les modifications du jour comptent", async () => {
  const s = api({
    edits: [
      { revid: 105, timestamp: minutesAgo(30), user: "Cocojean29" },
      { revid: 50, timestamp: new Date(NOW - 3 * SURVIE_MS).toISOString(), anon: true },
    ],
    groups: { Cocojean29: CONFIRME },
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: null,
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, true);
});

Deno.test("aucune modification depuis la révision en ligne : rien à vérifier", async () => {
  const s = api({ edits: [{ revid: 100, timestamp: minutesAgo(60), anon: true }] });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "100",
    now: NOW,
  });

  assertEquals(verdict, {
    ok: true,
    message: "garde anti-vandalisme : aucune modification récente",
  });
  assertEquals(s.userQueries, []);
});

Deno.test("l'historique lu n'atteint pas la révision en ligne : le lot attend", async () => {
  const edits = Array.from({ length: MAX_VERIFIEES }, (_, i) => ({
    revid: 200 - i,
    timestamp: minutesAgo(i + 1),
    user: "Cocojean29",
  }));
  const s = api({ edits, more: true, groups: { Cocojean29: CONFIRME } });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "200",
    now: NOW,
  });

  assertEquals(verdict.ok, false);
  assert(verdict.message.includes(`plus de ${MAX_VERIFIEES} modifications récentes`));
  assertEquals(s.userQueries, []);
});

Deno.test("DANS LE DOUTE, ON ATTEND : les comptes ne se lisent pas", async () => {
  const s = api({
    edits: [{ revid: 105, timestamp: minutesAgo(5), user: "Cocojean29" }],
    usersStatus: 500,
  });
  const verdict = await guardEdits(config(s.impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, false);
  assert(verdict.message.includes("comptes illisibles"));
});

Deno.test("DANS LE DOUTE, ON ATTEND : l'historique ne se lit pas", async () => {
  const impl: typeof fetch = () => Promise.resolve(new Response("{}", { status: 404 }));
  const verdict = await guardEdits(config(impl), PAGE, {
    published: "100",
    candidate: "105",
    now: NOW,
  });

  assertEquals(verdict.ok, false);
  assert(verdict.message.includes("historique de la page illisible"));
});
