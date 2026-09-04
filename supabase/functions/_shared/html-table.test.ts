/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 *
 * Les cas synthétiques figent le contrat ; le dernier bloc travaille sur la
 * VRAIE page, capturée le 05/09/2026 dans `fixtures/votes-section.html`. Une
 * fixture datée vaut mieux qu'un appel réseau dans un test : elle rend l'échec
 * reproductible, et elle documente la structure telle qu'elle était le jour où
 * l'extraction a été écrite.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import { cellText, decodeEntities, footnoteRefs, parseTables } from "./html-table.ts";

Deno.test("décodage : seulement ce que MediaWiki produit", () => {
  assertEquals(decodeEntities("a &amp; b"), "a & b");
  assertEquals(decodeEntities("&#91;n&#176; 2&#93;"), "[n° 2]");
  assertEquals(decodeEntities("&#x5B;"), "[");
  // Une esperluette isolée reste une esperluette : ne rien inventer.
  assertEquals(decodeEntities("100 % & fin"), "100 % & fin");
  // Une pseudo-entité trop longue n'en est pas une.
  assertEquals(decodeEntities("&pasuneentitedutout;"), "&pasuneentitedutout;");
});

Deno.test("texte de cellule : l'appel de note sort, la valeur reste", () => {
  const html = '0<sup id="cite_ref-2" class="reference"><a href="#x">[n° 2]</a></sup>';
  assertEquals(cellText(html), "0");
  assertEquals(footnoteRefs(html), ["n° 2"]);
});

Deno.test("texte de cellule : le barré est du texte comme un autre", () => {
  assertEquals(cellText("<s>Maxime</s>"), "Maxime");
});

Deno.test("colspan développé : deux colonnes portent la même cellule", () => {
  const html = '<table><tr><td colspan="2">Maxime</td><td>Joana</td></tr></table>';
  const [table] = parseTables(html);
  assertEquals(table.width, 3);
  assertEquals(table.grid[0].map((c) => c?.text), ["Maxime", "Maxime", "Joana"]);
});

Deno.test("rowspan développé : la cellule redescend sur la ligne suivante", () => {
  const html =
    '<table><tr><td rowspan="2">Épisode 1</td><td>a</td></tr><tr><td>b</td></tr></table>';
  const [table] = parseTables(html);
  assertEquals(table.grid[0].map((c) => c?.text), ["Épisode 1", "a"]);
  assertEquals(table.grid[1].map((c) => c?.text), ["Épisode 1", "b"]);
});

Deno.test("une valeur de span aberrante est bornée, pas honorée", () => {
  const [table] = parseTables('<table><tr><td colspan="99999">x</td></tr></table>');
  assert(table.width <= 64, `largeur ${table.width}`);
});

Deno.test("cellule absente vaut null, jamais chaîne vide", () => {
  const html = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>";
  const [table] = parseTables(html);
  assertEquals(table.grid[1][1], null);
  assertEquals(table.raggedRows, [1]);
});

Deno.test("un tableau imbriqué ne coupe pas le tableau parent", () => {
  const html =
    "<table><tr><td><table><tr><td>interne</td></tr></table></td><td>après</td></tr></table>";
  const [table] = parseTables(html);
  assertEquals(table.grid[0].length, 2);
  assertEquals(table.grid[0][1]?.text, "après");
});

Deno.test("entrée tronquée : on s'arrête, on ne boucle pas", () => {
  const tables = parseTables("<table><tr><td>a");
  assertEquals(tables.length, 0); // pas de </table> : rien n'est rendu
});

// ── La vraie page ─────────────────────────────────────────────────────────

const fixture = await Deno.readTextFile(
  new URL("./fixtures/votes-section.html", import.meta.url),
);

Deno.test("fixture : le tableau des votes est lu", () => {
  const tables = parseTables(fixture);
  assertEquals(tables.length, 1);
  assert(tables[0].classes.includes("wikitable"));
});

Deno.test("fixture : sept colonnes de scrutin, épisodes fusionnés développés", () => {
  const [table] = parseTables(fixture);
  // Ligne « ► Épisode » : 1 sur trois colonnes, 2 sur deux, 3 sur deux.
  const episodes = table.grid[1].slice(1).map((c) => c?.text);
  assertEquals(episodes, ["1", "1", "1", "2", "2", "3", "3"]);
});

Deno.test("fixture : l'élimination liée au binôme porte bien zéro vote", () => {
  const [table] = parseTables(fixture);
  const elimines = table.grid[2].slice(1).map((c) => c?.text);
  const votes = table.grid[3].slice(1).map((c) => c?.text);

  // Maxime occupe deux colonnes : l'égalité, puis le second vote.
  assertEquals(elimines.slice(0, 3), ["Maxime", "Maxime", "Joana"]);
  // « 0 » est une VALEUR — Joana part sans qu'aucune voix ne la vise.
  assertEquals(votes[2], "0");
  assertEquals(votes[1], "11/18");
  // La colonne du premier tour ne porte pas de décompte utilisable.
  assertEquals(votes[0], "/");
});

Deno.test("fixture : le premier tour d'une égalité est barré", () => {
  const [table] = parseTables(fixture);
  const camille = table.grid.find((row) => row[0]?.text === "Camille");
  assert(camille, "ligne Camille introuvable");
  assertEquals(camille[1]?.text, "Maxime");
  assertEquals(camille[1]?.struck, true, "le vote du tour annulé doit être barré");
  assertEquals(camille[2]?.struck, false, "le second tour n'est pas barré");
});

Deno.test("fixture : la ligne courte de la source est SIGNALÉE, pas rattrapée", () => {
  const [table] = parseTables(fixture);
  // Constat du 05/09/2026 : au moins une ligne de candidat compte moins de
  // cellules que les autres. Ce n'est pas un défaut de lecture — c'est le
  // tableau source qui est irrégulier, et le pipeline doit le dire.
  assert(
    table.raggedRows.length > 0,
    "l'irrégularité de la source doit être relevée",
  );
  for (const r of table.raggedRows) {
    // Les cellules manquantes sont comblées par `null`, jamais par du vide.
    assertEquals(table.grid[r].length, table.width);
  }
});
