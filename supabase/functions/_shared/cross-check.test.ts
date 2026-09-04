/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Le test le plus utile du lot est le premier : sur la page RÉELLE, les trois
 * tableaux doivent s'accorder. S'ils cessent de s'accorder un jour, c'est
 * qu'un contributeur a corrigé l'un sans l'autre — et le pipeline doit le
 * dire au lieu de publier deux versions de la même soirée.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractVotes } from "./extract-votes.ts";
import { extractContestants, extractProgress } from "./extract-season.ts";
import { crossCheck } from "./cross-check.ts";

const SEASON = "all-stars-2026";

const read = (name: string) =>
  Deno.readTextFile(new URL(`./fixtures/${name}-section.html`, import.meta.url));

const contestants = extractContestants(
  parseTables(await read("candidats"))[0].grid,
  SEASON,
);
const progress = extractProgress(
  parseTables(await read("deroulement"))[0].grid,
  SEASON,
);
const votes = extractVotes(parseTables(await read("votes"))[0].grid, SEASON);

Deno.test("fixture : les trois tableaux de la page s'accordent", () => {
  const anomalies = crossCheck(contestants, progress, votes);
  assertEquals(
    anomalies.map((a) => `${a.code} — ${a.message}`),
    [],
    "aucune contradiction attendue le 05/09/2026",
  );
});

Deno.test("un candidat présent d'un seul côté est signalé, des deux sens", () => {
  const amputes = {
    ...contestants,
    contestants: contestants.contestants.filter((c) => c.displayName !== "Camille"),
  };
  const found = crossCheck(amputes, progress, votes);
  assert(found.some((a) => a.code === "candidat_absent_de_la_liste"));

  const enTrop = {
    ...contestants,
    contestants: [
      ...contestants.contestants,
      { ...contestants.contestants[0], displayName: "Inconnu", naturalKey: "x" },
    ],
  };
  assert(
    crossCheck(enTrop, progress, votes).some((a) =>
      a.code === "candidat_absent_des_votes"
    ),
  );
});

Deno.test("un éliminé annoncé d'un côté seulement est signalé", () => {
  const truque = {
    ...progress,
    episodes: progress.episodes.map((e) =>
      e.number === 1 ? { ...e, eliminated: ["Maxime", "Vincent"] } : e
    ),
  };
  const found = crossCheck(contestants, truque, votes);
  assert(
    found.some((a) => a.code === "elimine_discordant" && a.message.includes("Vincent")),
  );
  // Les deux sens sont couverts, et chacun cite l'orthographe de la source.
  assert(
    found.some((a) => a.code === "elimine_discordant" && a.message.includes("Joana")),
  );
});

Deno.test("un décompte corrigé d'un seul côté est signalé", () => {
  const truque = {
    ...progress,
    episodes: progress.episodes.map((e) =>
      e.number === 1
        ? {
          ...e,
          tallyRounds: [{ counts: [9, 9], total: 18 }, { counts: [13, 5], total: 18 }],
        }
        : e
    ),
  };
  const found = crossCheck(contestants, truque, votes);
  assert(
    found.some((a) => a.code === "decompte_discordant" && a.message.includes("13")),
    "13 voix d'un côté, 11 de l'autre : la contradiction doit être nommée",
  );
});

Deno.test("une égalité oubliée d'un côté est signalée", () => {
  // Le déroulement ne déclarerait plus qu'un tour là où les votes en montrent
  // deux : c'est exactement ce qui arrive quand quelqu'un « simplifie » une
  // cellule sans toucher au tableau détaillé.
  const truque = {
    ...progress,
    episodes: progress.episodes.map((e) =>
      e.number === 1 ? { ...e, tallyRounds: [{ counts: [11, 7], total: 18 }] } : e
    ),
  };
  assert(
    crossCheck(contestants, truque, votes).some((a) => a.code === "tours_discordants"),
  );
});

Deno.test("un épisode non diffusé n'est jamais recoupé", () => {
  const futurs = progress.episodes.filter((e) => !e.aired).map((e) => e.number);
  assert(futurs.length > 0);
  const anomalies = crossCheck(contestants, progress, votes);
  for (const n of futurs) {
    assert(
      !anomalies.some((a) => a.message.includes(`épisode ${n} `)),
      `l'épisode ${n}, non diffusé, ne doit produire aucune anomalie`,
    );
  }
});
