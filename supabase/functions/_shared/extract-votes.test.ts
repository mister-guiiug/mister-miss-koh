/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Les cas limites que le besoin exige — égalité, binôme, cible inconnue,
 * décompte incohérent, colonne vide, structure changée — sont éprouvés sur des
 * grilles construites à la main, puis sur la VRAIE page du 05/09/2026.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractVotes } from "./extract-votes.ts";

const SEASON = "all-stars-2026";

/** Fabrique une grille de test à partir de lignes de texte simples. */
function gridOf(rows: (string | { t: string; s?: boolean })[][]) {
  return rows.map((row) =>
    row.map((cell) => {
      const text = typeof cell === "string" ? cell : cell.t;
      const struck = typeof cell === "string" ? false : (cell.s ?? false);
      return {
        text,
        html: text,
        header: false,
        colspan: 1,
        rowspan: 1,
        struck,
      };
    })
  );
}

Deno.test("un en-tête manquant arrête l'extraction au lieu de deviner", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["Camille", "Maxime"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 0);
  assertEquals(out.anomalies[0].code, "structure_inconnue");
  assert(out.anomalies[0].message.includes("► Éliminé"));
});

Deno.test("une colonne vide EN FIN de tableau n'est pas une anomalie", () => {
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", ""],
    ["► Votes", "5/10", ""],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Maxime", ""],
    ["Maxime", "Camille", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 1, "seule la colonne remplie produit un tour");
  assertEquals(out.anomalies, []);
});

Deno.test("un marqueur de statut n'est pas un vote, et suffit à ne pas créer de tour", () => {
  // La ligne d'un sorti porte son état jusqu'à la fin du tableau. Sans cette
  // distinction, l'épisode 2 — non diffusé — passerait pour un conseil tenu.
  const grid = gridOf([
    ["► Épisode", "1", "2"],
    ["► Éliminé", "Maxime", ""],
    ["► Votes", "5/10", ""],
    ["▼ Candidats", "Votes", ""],
    ["Camille", "Maxime", ""],
    ["Maxime", "Camille", "Banni"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.length, 1, "le statut ne crée pas de scrutin");
  assertEquals(out.votes.length, 2, "seules les deux vraies voix sont retenues");
  assertEquals(out.statuses, [
    { columnIndex: 2, contestant: "Maxime", label: "Banni" },
  ]);
  assertEquals(out.anomalies, []);
});

Deno.test("une colonne vide AU MILIEU est une anomalie", () => {
  const grid = gridOf([
    ["► Épisode", "1", "2", "3"],
    ["► Éliminé", "Maxime", "", "Naoil"],
    ["► Votes", "5/10", "", "6/9"],
    ["▼ Candidats", "Votes", "", ""],
    ["Camille", "Maxime", "", "Naoil"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(
    out.anomalies.some((a) => a.code === "colonne_vide_intercalee"),
    "le trou doit être signalé",
  );
});

Deno.test("une valeur ni candidat ni statut est signalée, et n'est PAS importée", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "1/2"],
    ["▼ Candidats", "Votes"],
    ["Camille", "Quelquun"],
    ["Maxime", "Camille"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(out.anomalies.some((a) => a.code === "valeur_inconnue"));
  // Le besoin l'exige : « ne pas importer une valeur lorsque son
  // interprétation est ambiguë ». Seule la voix lisible est retenue.
  assertEquals(out.votes.map((v) => v.voter), ["Maxime"]);
});

Deno.test("un décompte impossible est signalé", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Maxime"],
    ["► Votes", "12/8"],
    ["▼ Candidats", "Votes"],
    ["Maxime", "Camille"],
    ["Camille", "Maxime"],
  ]);
  const out = extractVotes(grid, SEASON);
  assert(out.anomalies.some((a) => a.code === "decompte_incoherent"));
});

Deno.test("deux tours du même épisode sont numérotés 1 puis 2", () => {
  const grid = gridOf([
    ["► Épisode", "1", "1"],
    ["► Éliminé", "Maxime", "Maxime"],
    ["► Votes", "/", "5/9"],
    ["▼ Candidats", "Votes", ""],
    ["Camille", { t: "Maxime", s: true }, "Maxime"],
    ["Maxime", { t: "Camille", s: true }, "Camille"],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds.map((r) => r.roundNumber), [1, 2]);
  assertEquals(out.rounds[0].kind, "annulled");
  assertEquals(out.rounds[1].kind, "vote");
  assertEquals(out.rounds[0].naturalKey, "all-stars-2026:e1:r1");
});

Deno.test("zéro voix et aucun vote exprimé : c'est un départ de binôme", () => {
  const grid = gridOf([
    ["► Épisode", "1"],
    ["► Éliminé", "Joana"],
    ["► Votes", "0"],
    ["▼ Candidats", "Votes"],
    ["Camille", ""],
  ]);
  const out = extractVotes(grid, SEASON);
  assertEquals(out.rounds[0].kind, "linked");
  // Le zéro est une VALEUR, pas une absence.
  assertEquals(out.rounds[0].reportedVotesFor, 0);
  assertEquals(out.rounds[0].reportedVotesTotal, null);
});

// ── La vraie page ─────────────────────────────────────────────────────────

const fixture = await Deno.readTextFile(
  new URL("./fixtures/votes-section.html", import.meta.url),
);
const [table] = parseTables(fixture);
const real = extractVotes(table.grid, SEASON);

Deno.test("fixture : les dix-huit candidats sont relevés", () => {
  assertEquals(real.contestants.length, 18);
  assert(real.contestants.includes("Camille"));
  assert(real.contestants.includes("Clémentine"));
});

Deno.test("fixture : cinq scrutins utiles, deux colonnes encore à venir", () => {
  // Sept colonnes au tableau, dont deux vides en fin : la saison est en cours.
  assertEquals(table.width - 1, 7);
  assertEquals(real.rounds.length, 5);
  assertEquals(real.rounds.map((r) => r.columnIndex), [1, 2, 3, 4, 5]);
});

Deno.test("fixture : l'épisode 1 a un tour annulé, un vote, puis un binôme", () => {
  const ep1 = real.rounds.filter((r) => r.episodeNumber === 1);
  assertEquals(ep1.map((r) => r.kind), ["annulled", "vote", "linked"]);
  assertEquals(ep1.map((r) => r.roundNumber), [1, 2, 3]);
  assertEquals(ep1[1].eliminated, "Maxime");
  assertEquals(ep1[1].reportedVotesFor, 11);
  assertEquals(ep1[1].reportedVotesTotal, 18);
  assertEquals(ep1[2].eliminated, "Joana");
  assertEquals(ep1[2].reportedVotesFor, 0);
});

Deno.test("fixture : la note qui explique le départ du binôme est conservée", () => {
  const linked = real.rounds.find((r) => r.kind === "linked");
  assert(linked, "aucune colonne de départ lié");
  assert(
    linked.footnotes.length > 0,
    "l'appel de note qui justifie le zéro doit être retenu",
  );
});

Deno.test("fixture : aucune voix n'est attribuée à la colonne d'un binôme", () => {
  const linked = real.rounds.filter((r) => r.kind === "linked");
  for (const round of linked) {
    const cast = real.votes.filter((v) => v.columnIndex === round.columnIndex);
    assertEquals(cast.length, 0, `colonne ${round.columnIndex}`);
  }
});

Deno.test("fixture : les voix du tour annulé sont toutes barrées", () => {
  const annulled = real.rounds.find((r) => r.kind === "annulled");
  assert(annulled);
  const cast = real.votes.filter((v) => v.columnIndex === annulled.columnIndex);
  assert(cast.length > 0);
  assert(cast.every((v) => v.struck), "un tour annulé n'a que des voix barrées");
});
