/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Le tableau « Épreuves spéciales », apparu sur All Stars le 13/10/2026
 * (révision 240344480) : on n'en lit que les éliminations définitives.
 */
import { assertEquals } from "jsr:@std/assert@^1";
import { parseTables } from "./html-table.ts";
import { extractSpecial, looksLikeSpecial } from "./extract-special.ts";

const ROSTER = [
  "Camille",
  "Charlotte",
  "Christina",
  "Clémentine",
  "Dorian",
  "Freddy",
  "Jacques",
  "Joana",
  "Laure",
  "Lola",
  "Maxime",
  "Moussa",
  "Naoil",
  "Nicolas",
  "Tania",
  "Ugo",
  "Vincent",
  "Yassin",
];

const fixture = await Deno.readTextFile(
  new URL("./fixtures/all-stars-epreuves-speciales-2026-10-13.html", import.meta.url),
);
const table = parseTables(fixture).find((t) => looksLikeSpecial(t.grid))!;

Deno.test("13/10 : deux arènes, six sorties définitives, chacune une fois", () => {
  const out = extractSpecial(table.grid, ROSTER);
  assertEquals(out.anomalies, []);
  // Le second affrontement occupe deux lignes (Lola, puis Nicolas) qui
  // partagent « 7e », les perdants et la perte : Charlotte et Tania n'en
  // sortent qu'une fois.
  assertEquals(out.exits.map((x) => [x.episodeNumber, x.name]), [
    [4, "Joana"],
    [4, "Moussa"],
    [4, "Naoil"],
    [4, "Jacques"],
    [7, "Charlotte"],
    [7, "Tania"],
  ]);
});

Deno.test("une perte qui n'est pas une élimination définitive ne fait sortir personne", () => {
  // « Privé de dessert » (épisode 7, tribu Sebako) est une perte, pas une sortie.
  const out = extractSpecial(table.grid, ROSTER);
  assertEquals(
    out.exits.some((x) => x.name === "Sebako" || x.name === "Tribu Sebako"),
    false,
  );
});

function grille(lignes: string) {
  return parseTables(`<table>${lignes}</table>`)[0].grid;
}
const ENTETE =
  "<tr><th>Épreuve</th><th>Épisodes</th><th>Gagnant(s)</th><th>Gain</th><th>Perdant(s)</th><th>Perte</th></tr>";

Deno.test("un perdant absent du tableau des candidats est une anomalie, pas une sortie", () => {
  const out = extractSpecial(
    grille(
      `${ENTETE}<tr><td>Arène</td><td>9e</td><td>Lola</td><td>Retour</td><td>Lola et Personne</td><td>Élimination définitive de l'aventure</td></tr>`,
    ),
    ROSTER,
  );
  assertEquals(out.exits.map((x) => x.name), ["Lola"]);
  assertEquals(out.anomalies.map((a) => [a.code, a.row]), [["perdant_inconnu", "e9"]]);
});

Deno.test("un épisode illisible écarte la ligne, et le dit", () => {
  const out = extractSpecial(
    grille(
      `${ENTETE}<tr><td>Arène</td><td>bientôt</td><td>Lola</td><td>Retour</td><td>Tania</td><td>Élimination définitive</td></tr>`,
    ),
    ROSTER,
  );
  assertEquals(out.exits, []);
  assertEquals(out.anomalies.map((a) => a.code), ["episode_illisible"]);
});

Deno.test("un tableau d'une autre forme n'est pas celui des épreuves spéciales", () => {
  const autre = grille(
    "<tr><th>Collier</th><th>Détenteur</th></tr><tr><td>1</td><td>Lola</td></tr>",
  );
  assertEquals(looksLikeSpecial(autre), false);
  assertEquals(extractSpecial(autre, ROSTER).anomalies.map((a) => a.code), [
    "structure_inconnue",
  ]);
});
