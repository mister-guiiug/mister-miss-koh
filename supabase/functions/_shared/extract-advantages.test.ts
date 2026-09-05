/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Deux vraies pages, choisies pour ce qu'elles ont de différent : All Stars
 * n'a qu'un collier, à DEUX détenteurs et jamais utilisé ; Le Feu sacré en a
 * quatre, dont un jamais découvert et un trouvé lors d'une épreuve.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractAdvantages } from "./extract-advantages.ts";

const read = (name: string) =>
  Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url));

const allStars = extractAdvantages(
  parseTables(await read("colliers-section.html"))[0].grid,
  "all-stars-2026",
);
const feuSacre = extractAdvantages(
  parseTables(await read("feu-sacre-colliers-section.html"))[0].grid,
  "feu-sacre",
);

Deno.test("fixture : un collier, deux détenteurs, aucune anomalie", () => {
  assertEquals(allStars.anomalies, []);
  assertEquals(allStars.advantages.length, 1);

  const collier = allStars.advantages[0];
  assertEquals(collier.location, "Camp unique");
  assertEquals(collier.holders.map((h) => h.name), ["Dorian", "Lola"]);
  assertEquals(collier.status, "not_used");
  assertEquals(collier.foundDay, 6);
  assertEquals(collier.playedEpisodeNumber, null, "il n'a pas été joué");
  assertEquals(collier.annulledVotes, null);
});

Deno.test("fixture : les deux détenteurs sont d'ORIGINE, pas successifs", () => {
  // « Dorian et Lola (jour 6) » : un binôme trouve ensemble. Les distinguer en
  // « premier » et « suivant » inventerait une transmission.
  assert(allStars.advantages[0].holders.every((h) => h.original));
  assert(allStars.advantages[0].holders.every((h) => h.fromDay === 6));
});

Deno.test("fixture : un collier jamais découvert n'a pas de détenteur nommé", () => {
  // La ligne est pré-dimensionnée et remplie de « Non découvert ». Le prendre
  // pour un nom inventerait un aventurier — comme « Banni » inventait une tribu.
  const jamais = feuSacre.advantages.filter((a) => a.status === "undiscovered");
  assertEquals(jamais.length, 1);
  assertEquals(jamais[0].holders, []);
  assertEquals(jamais[0].location, "Camp des Paniman");
});

Deno.test("fixture : un collier joué porte son épisode et ses voix annulées", () => {
  const tania = feuSacre.advantages.find((a) =>
    a.holders.some((h) => h.name === "Tania")
  );
  assert(tania, "Tania introuvable");
  assertEquals(tania.status, "used");
  assertEquals(tania.playedEpisodeNumber, 15);
  assertEquals(tania.annulledVotes, 5);
  assertEquals(tania.annulledVotesTotal, 7);
  assertEquals(tania.holders[0].fromDay, 34);
  assertEquals(tania.holders[0].toDay, 38, "l'intervalle se ferme quand il est joué");
});

Deno.test("fixture : quatre colliers, dont un trouvé hors d'un camp", () => {
  assertEquals(feuSacre.advantages.length, 4);
  assertEquals(feuSacre.anomalies, []);
  assert(
    feuSacre.advantages.some((a) => a.location?.startsWith("Épreuve")),
    "un collier est trouvé lors d'une épreuve, pas dans un camp",
  );
});

// ── Structures dégradées ──────────────────────────────────────────────────

Deno.test("sans colonne de détenteur, l'extraction s'arrête", () => {
  const grid = parseTables(
    "<table><tr><th>Localisation</th><th>Autre chose</th></tr>" +
      "<tr><th>Localisation</th><th>Autre chose</th></tr>" +
      "<tr><td>Camp</td><td>x</td></tr></table>",
  )[0].grid;
  const out = extractAdvantages(grid, "s");
  assertEquals(out.advantages, []);
  assertEquals(out.anomalies[0].code, "structure_inconnue");
});

Deno.test("un statut hors vocabulaire est signalé, jamais deviné", () => {
  // Relevé sur « Les Chasseurs d'immunité » : « Utilisé (collier maudit) » et
  // « Finaliste ». Trois cellules sur 63 colliers — à relire, pas à ranger
  // d'office dans « utilisé ».
  const grid = parseTables(
    "<table><tr><th>Localisation</th><th>Détenteur</th><th>Statut</th></tr>" +
      "<tr><th>Localisation</th><th>Détenteur</th><th>Statut</th></tr>" +
      "<tr><td>Camp</td><td>Aël (jour 4)</td><td>Finaliste</td></tr></table>",
  )[0].grid;
  const out = extractAdvantages(grid, "s");
  assertEquals(out.advantages.length, 1);
  assertEquals(out.advantages[0].status, "unknown");
  assertEquals(out.anomalies[0].code, "statut_collier_inconnu");
});
