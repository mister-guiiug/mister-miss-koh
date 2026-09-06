/**
 * Lancement : `deno test --allow-read supabase/functions/_shared/`
 */
import { assert, assertEquals } from "jsr:@std/assert@^1";
import type { Grid, RawCell } from "./html-table.ts";
import { parseTables } from "./html-table.ts";
import { extractLocation, findInfobox, firstPlaceLink } from "./extract-location.ts";

/** Introduction de la page « Koh-Lanta All Stars », lue le 06/09/2026. */
const INTRODUCTION = await Deno.readTextFile(
  new URL("./fixtures/introduction-section.html", import.meta.url),
);

function cell(text: string, header = false, html = text): RawCell {
  return { text, html, header, colspan: 1, rowspan: 1, struck: false };
}

Deno.test("la vraie page : l'archipel, géolocalisé sur l'archipel et non sur le pays", () => {
  const infobox = findInfobox(parseTables(INTRODUCTION));
  assert(infobox, "l'introduction porte une infobox");
  const { location, anomalies } = extractLocation(infobox.grid);
  assertEquals(location, {
    name: "Archipel des Perles (Panama)",
    pageTitle: "Archipel des Perles",
  });
  assertEquals(anomalies, []);
});

Deno.test("l'infobox se reconnaît à sa classe, pas à son rang", () => {
  const html = `<table class="wikitable"><tr><th>Lieu</th><td>Faux</td></tr></table>
    <table class="infobox&#95;v2 infobox"><tr><th scope="row">Lieu de tournage</th>
    <td><a href="/wiki/Corse" title="Corse">Corse</a></td></tr></table>`;
  const infobox = findInfobox(parseTables(html));
  assert(infobox);
  assertEquals(extractLocation(infobox.grid).location, {
    name: "Corse",
    pageTitle: "Corse",
  });
});

Deno.test("sans ligne de lieu : rien, et une anomalie qui le dit sans arrêter l'import", () => {
  const grid: Grid = [[cell("Genre", true), cell("Jeu télévisé")]];
  const { location, anomalies } = extractLocation(grid);
  assertEquals(location, null);
  assertEquals(anomalies.map((a) => a.code), ["lieu_absent"]);
});

Deno.test("une cellule sans lien garde son texte, sans page à géolocaliser", () => {
  const grid: Grid = [[cell("Lieu de tournage", true), cell("Quelque part en mer")]];
  const { location, anomalies } = extractLocation(grid);
  assertEquals(location, { name: "Quelque part en mer", pageTitle: null });
  assertEquals(anomalies.map((a) => a.code), ["lieu_sans_page"]);
});

Deno.test("une ligne de lieu vide ne rend pas un lieu vide", () => {
  const grid: Grid = [[cell("Lieu", true), cell("  ")]];
  const { location, anomalies } = extractLocation(grid);
  assertEquals(location, null);
  assertEquals(anomalies.map((a) => a.code), ["lieu_vide"]);
});

Deno.test("un drapeau, un lien rouge ou un lien externe ne sont pas le lieu", () => {
  const html =
    `<span class="flagicon"><a href="/wiki/Fichier:Flag_of_Fiji.svg" class="mw-file-description" title="Fidji"><img alt="" /></a></span>
    <a href="/w/index.php?title=Île_imaginaire&amp;action=edit" class="new" title="Île imaginaire (page inexistante)">Île imaginaire</a>
    <a href="https://exemple.test/" title="Site">site</a>
    <a href="/wiki/Fidji" title="Fidji">Fidji</a>`;
  assertEquals(firstPlaceLink(html), "Fidji");
  assertEquals(
    firstPlaceLink(
      '<a href="/wiki/Fichier:Carte.png" title="Fichier:Carte.png">carte</a>',
    ),
    null,
  );
  assertEquals(firstPlaceLink("aucun lien"), null);
});

Deno.test("le titre est lu dans l'attribut, pas dans le texte du lien", () => {
  assertEquals(
    firstPlaceLink(
      '<a href="/wiki/Antigua-et-Barbuda" title="Antigua &amp; Barbuda">Antigua</a>',
    ),
    "Antigua & Barbuda",
  );
});
