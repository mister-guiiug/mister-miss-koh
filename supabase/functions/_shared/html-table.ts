/**
 * Lecture de tableaux HTML — sans dépendance, et sans expression régulière
 * capable de s'emballer.
 *
 * POURQUOI PAS UN ANALYSEUR HTML DU REGISTRE. Ce code tourne dans une Edge
 * Function, sur du contenu tiers modifiable par n'importe qui : c'est le
 * chemin le plus exposé du projet. Une dépendance de plus y est une surface
 * d'attaque de plus, pour un besoin — lire des `<table>` bien formés produits
 * par MediaWiki — que deux cents lignes couvrent.
 *
 * POURQUOI PAS UNE EXPRESSION RÉGULIÈRE. Le motif naturel
 * (`/<td[^>]*>(.*?)<\/td>/gs`) se comporte mal sur une entrée construite pour
 * lui nuire : c'est le défaut « polynomial ReDoS » que CodeQL relève, et il
 * s'est déjà présenté dans le socle de la famille. Le balayage ci-dessous est
 * LINÉAIRE — un seul passage, `indexOf`, aucun retour en arrière.
 *
 * CE QUE LE MODULE GARANTIT :
 *
 *  - `rowspan` et `colspan` sont DÉVELOPPÉS. Le tableau des votes fait
 *    fusionner « Maxime » sur deux colonnes (une égalité, donc deux tours) :
 *    sans développement, la deuxième colonne serait décalée d'un cran et tous
 *    les votes suivants seraient attribués au mauvais épisode ;
 *  - les lignes trop courtes sont SIGNALÉES, pas complétées en silence. La
 *    source en contient une aujourd'hui même ;
 *  - rien n'est deviné : une cellule absente vaut `null`, pas la chaîne vide.
 */

/** Une cellule, telle que le tableau la déclare. */
export interface RawCell {
  readonly text: string;
  readonly html: string;
  readonly header: boolean;
  readonly colspan: number;
  readonly rowspan: number;
  /** Le contenu est barré (`<s>`) : un vote annulé, un décompte remplacé. */
  readonly struck: boolean;
}

/** Grille développée : `null` = cellule absente, jamais « vide ». */
export type Grid = readonly (readonly (RawCell | null)[])[];

export interface ParsedTable {
  readonly classes: string;
  readonly grid: Grid;
  /** Nombre de colonnes de la ligne la plus large. */
  readonly width: number;
  /** Index des lignes dont la largeur diffère de `width`. */
  readonly raggedRows: readonly number[];
}

const MAX_SPAN = 64; // garde-fou : `colspan="99999"` ne doit pas allouer

/** Décode les entités que MediaWiki produit réellement. Rien de plus. */
export function decodeEntities(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const amp = input.indexOf("&", i);
    if (amp === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, amp);
    const semi = input.indexOf(";", amp);
    // Une entité MediaWiki est courte ; au-delà, c'est une esperluette isolée.
    if (semi === -1 || semi - amp > 10) {
      out += "&";
      i = amp + 1;
      continue;
    }
    const body = input.slice(amp + 1, semi);
    out += entityValue(body) ?? input.slice(amp, semi + 1);
    i = semi + 1;
  }
  return out;
}

function entityValue(body: string): string | null {
  switch (body) {
    case "amp":
      return "&";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "quot":
      return '"';
    case "apos":
      return "'";
    case "nbsp":
      return " ";
  }
  if (body.startsWith("#x") || body.startsWith("#X")) {
    const code = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  if (body.startsWith("#")) {
    const code = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : null;
  }
  return null;
}

/**
 * Texte lisible d'une cellule.
 *
 * LES APPELS DE NOTE SONT RETIRÉS. Une cellule de vote vaut `0` suivi d'un
 * `<sup class="reference">[n° 2]</sup>` qui renvoie à « éliminée à la suite de
 * son binôme ». Garder l'appel donnerait la valeur `0[n° 2]`, qui n'est ni un
 * nombre ni un nom. La note elle-même n'est pas perdue : elle est relevée à
 * part par `footnoteRefs`, parce que c'est souvent elle qui explique la valeur.
 *
 * LES AUTRES EXPOSANTS RESTENT. Constat du 06/09/2026 en production : « Éliminé
 * le 33<sup>e</sup> jour de la saison 27 » se publiait « Éliminé le 33 jour de
 * la saison 27 », parce que TOUS les `<sup>` sortaient. L'ordinal est du texte,
 * et son exposant reste collé au nombre : « 33e ». Ce qui distingue un appel de
 * note est décrit sur `isFootnoteRef`.
 */
export function cellText(html: string): string {
  return cellLines(html).join(" ");
}

/**
 * Valeurs d'une cellule qui en contient PLUSIEURS.
 *
 * Constat du 05/09/2026 : la colonne « Saisons précédentes » empile deux à
 * trois mentions séparées par des `<br>`. En retirant les balises sans rien
 * mettre à la place, on obtenait « Vainqueur de la saison 9Éliminée le… » —
 * une chaîne que personne ne peut redécouper, et qui aurait été importée
 * telle quelle.
 *
 * Les frontières de bloc deviennent donc des séparations explicites, et
 * `cellText` se contente de les recoller par une espace quand une seule valeur
 * est attendue.
 */
export function cellLines(html: string): string[] {
  // `<style>` d'abord : MediaWiki insère des blocs CSS DANS les cellules (les
  // légendes colorées de la colonne « Tribu »). Sans ce retrait, le texte de
  // la cellule commençait par « .mw-parser-output .legende-bloc-ce… ».
  let cleaned = dropElements(html, "style");
  cleaned = dropElements(cleaned, "script");
  cleaned = dropFootnoteRefs(cleaned);
  return stripTags(cleaned)
    .split(BLOCK_MARKER)
    .map((part) => decodeEntities(part).replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);
}

/**
 * Identifiants des notes citées dans la cellule (`n° 2`, `12`…).
 *
 * Même tri que `cellLines` : un ordinal en exposant n'est pas une note, et la
 * virgule que MediaWiki intercale entre deux appels (`<sup class="reference
 * cite_virgule">,</sup>`) porte la classe sans porter de numéro.
 */
export function footnoteRefs(html: string): string[] {
  const refs: string[] = [];
  for (const sup of findSups(html)) {
    if (!isFootnoteRef(sup)) continue;
    const label = decodeEntities(stripTags(sup.inner))
      .replace(/[[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (/[\p{L}\p{N}]/u.test(label)) refs.push(label);
  }
  return refs;
}

/** Un `<sup>…</sup>` tel qu'il est écrit : ses attributs, son contenu, sa place. */
interface SupElement {
  readonly start: number;
  readonly end: number;
  readonly attrs: string;
  readonly inner: string;
}

/** Les `<sup>` d'un fragment, balayage linéaire. Une balise non fermée arrête. */
function findSups(html: string): SupElement[] {
  const open = "<sup";
  const close = "</sup>";
  const found: SupElement[] = [];
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf(open, i);
    if (start === -1) break;
    const headEnd = html.indexOf(">", start);
    if (headEnd === -1) break;
    const end = html.indexOf(close, headEnd);
    if (end === -1) break;
    found.push({
      start,
      end: end + close.length,
      attrs: html.slice(start + open.length, headEnd),
      inner: html.slice(headEnd + 1, end),
    });
    i = end + close.length;
  }
  return found;
}

/**
 * Un exposant est un APPEL DE NOTE s'il porte la classe `reference` — celle
 * que MediaWiki pose sur chaque appel, et sur la virgule entre deux appels —
 * ou si son texte est entre crochets : `[1]`, `[n° 2]`, et les balises de
 * maintenance comme `[source secondaire souhaitée]`.
 *
 * Tout autre exposant est du texte : l'ordinal de « 33<sup>e</sup> jour »,
 * de « 1<sup>er</sup> épisode ». Le retirer amputait la valeur.
 */
function isFootnoteRef(sup: SupElement): boolean {
  const classes = decodeEntities(attrValue(sup.attrs, "class")).split(/\s+/);
  if (classes.includes("reference")) return true;
  const text = decodeEntities(stripTags(sup.inner)).trim();
  return text.startsWith("[") && text.endsWith("]");
}

/** Retire les appels de note, et seulement eux : les autres `<sup>` restent. */
function dropFootnoteRefs(html: string): string {
  let out = "";
  let i = 0;
  for (const sup of findSups(html)) {
    if (!isFootnoteRef(sup)) continue;
    out += html.slice(i, sup.start);
    i = sup.end;
  }
  return out + html.slice(i);
}

/** Supprime un élément et son contenu, balayage linéaire. */
function dropElements(html: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let out = "";
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf(open, i);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const end = html.indexOf(close, start);
    if (end === -1) break; // balise non fermée : on jette la fin, sans boucler
    i = end + close.length;
  }
  return out;
}

/** Séparateur interne, jamais présent dans du contenu Wikipédia. */
const BLOCK_MARKER = "";

/** Balises qui séparent deux valeurs plutôt que de continuer une phrase. */
const BLOCK_TAGS = new Set([
  "br",
  "p",
  "div",
  "li",
  "ul",
  "ol",
  "dd",
  "dt",
  "dl",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

/** Retire les balises, garde le texte, et marque les frontières de bloc. */
function stripTags(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf(">", lt);
    if (gt === -1) break;
    const name = tagName(html.slice(lt + 1, gt));
    if (BLOCK_TAGS.has(name)) out += BLOCK_MARKER;
    i = gt + 1;
  }
  return out;
}

/** Nom de balise en minuscules, ouvrante ou fermante. */
function tagName(inner: string): string {
  let j = 0;
  if (inner[j] === "/") j += 1;
  let end = j;
  while (end < inner.length && /[a-zA-Z0-9]/.test(inner[end])) end += 1;
  return inner.slice(j, end).toLowerCase();
}

/** Valeur entière d'un attribut, bornée. */
function spanAttr(attrs: string, name: string): number {
  const marker = `${name}=`;
  const at = attrs.toLowerCase().indexOf(marker);
  if (at === -1) return 1;
  const j = at + marker.length;
  const quote = attrs[j];
  let raw: string;
  if (quote === '"' || quote === "'") {
    const end = attrs.indexOf(quote, j + 1);
    raw = end === -1 ? "" : attrs.slice(j + 1, end);
  } else {
    let end = j;
    while (end < attrs.length && !/\s/.test(attrs[end])) end += 1;
    raw = attrs.slice(j, end);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, MAX_SPAN);
}

function attrValue(attrs: string, name: string): string {
  const marker = `${name}=`;
  const at = attrs.toLowerCase().indexOf(marker);
  if (at === -1) return "";
  const j = at + marker.length;
  const quote = attrs[j];
  if (quote !== '"' && quote !== "'") return "";
  const end = attrs.indexOf(quote, j + 1);
  return end === -1 ? "" : attrs.slice(j + 1, end);
}

/** Lit les `<table>` de premier niveau et rend leurs grilles développées. */
export function parseTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf("<table", cursor);
    if (start === -1) break;
    const headEnd = html.indexOf(">", start);
    if (headEnd === -1) break;

    const end = matchingTableEnd(html, headEnd + 1);
    if (end === -1) break;

    const attrs = html.slice(start + 6, headEnd);
    const body = html.slice(headEnd + 1, end);
    tables.push(buildTable(attrValue(attrs, "class"), readRows(body)));
    cursor = end + "</table>".length;
  }

  return tables;
}

/** Fin du `</table>` correspondant, en tenant compte des tableaux imbriqués. */
function matchingTableEnd(html: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < html.length) {
    const open = html.indexOf("<table", i);
    const close = html.indexOf("</table>", i);
    if (close === -1) return -1;
    if (open !== -1 && open < close) {
      depth += 1;
      i = open + 6;
      continue;
    }
    depth -= 1;
    if (depth === 0) return close;
    i = close + 8;
  }
  return -1;
}

/**
 * Masque les tableaux IMBRIQUÉS par des espaces, à longueur identique.
 *
 * Sans lui, le premier `</tr>` rencontré dans un tableau interne fermerait la
 * ligne du tableau externe, et tout ce qui suit sur cette ligne serait perdu.
 * Le masque conserve les positions : on cherche dans le masque, on découpe
 * dans l'original — les index sont les mêmes.
 */
function maskNestedTables(body: string): string {
  const chars = body.split("");
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("<table", i);
    if (open === -1) break;
    const headEnd = body.indexOf(">", open);
    if (headEnd === -1) break;
    const end = matchingTableEnd(body, headEnd + 1);
    if (end === -1) break;
    const stop = end + "</table>".length;
    for (let k = open; k < stop && k < chars.length; k += 1) chars[k] = " ";
    i = stop;
  }
  return chars.join("");
}

function readRows(body: string): RawCell[][] {
  const mask = maskNestedTables(body);
  const rows: RawCell[][] = [];
  let i = 0;
  while (i < mask.length) {
    const trStart = mask.indexOf("<tr", i);
    if (trStart === -1) break;
    const trHead = mask.indexOf(">", trStart);
    if (trHead === -1) break;
    let trEnd = mask.indexOf("</tr>", trHead);
    if (trEnd === -1) trEnd = mask.length; // dernière ligne non fermée
    rows.push(
      readCells(body.slice(trHead + 1, trEnd), mask.slice(trHead + 1, trEnd)),
    );
    i = trEnd + 5;
  }
  return rows;
}

/** `rowHtml` porte le contenu, `mask` porte les positions cherchables. */
function readCells(rowHtml: string, mask: string): RawCell[] {
  const cells: RawCell[] = [];
  let i = 0;
  while (i < mask.length) {
    const th = mask.indexOf("<th", i);
    const td = mask.indexOf("<td", i);
    if (th === -1 && td === -1) break;
    const header = td === -1 || (th !== -1 && th < td);
    const start = header ? th : td;
    const headEnd = mask.indexOf(">", start);
    if (headEnd === -1) break;

    const attrs = rowHtml.slice(start + 3, headEnd);
    const closing = header ? "</th>" : "</td>";
    let close = mask.indexOf(closing, headEnd);
    // MediaWiki omet parfois la fermeture avant la cellule suivante.
    const nextTh = mask.indexOf("<th", headEnd);
    const nextTd = mask.indexOf("<td", headEnd);
    const nextCell = [nextTh, nextTd]
      .filter((n) => n !== -1)
      .sort((a, b) => a - b)[0];
    if (close === -1 || (nextCell !== undefined && nextCell < close)) {
      close = nextCell ?? mask.length;
    }

    const inner = rowHtml.slice(headEnd + 1, close);
    cells.push({
      html: inner,
      text: cellText(inner),
      header,
      colspan: spanAttr(attrs, "colspan"),
      rowspan: spanAttr(attrs, "rowspan"),
      struck: inner.includes("<s>") || inner.includes("<s "),
    });
    i = close + (close === mask.length ? 0 : closing.length);
    if (i >= mask.length) break;
  }
  return cells;
}

/** Développe les fusions en une grille rectangulaire, et note les écarts. */
function buildTable(classes: string, rows: RawCell[][]): ParsedTable {
  const grid: (RawCell | null)[][] = [];
  // Cellules qui débordent sur les lignes suivantes : colonne → { cell, reste }.
  const carried = new Map<number, { cell: RawCell; left: number }>();

  for (let r = 0; r < rows.length; r += 1) {
    const out: (RawCell | null)[] = [];
    let col = 0;

    const place = (cell: RawCell | null) => {
      while (out.length <= col) out.push(null);
      out[col] = cell;
      col += 1;
    };

    const drainCarried = () => {
      let carry = carried.get(col);
      while (carry) {
        for (let k = 0; k < carry.cell.colspan; k += 1) place(carry.cell);
        carry.left -= 1;
        if (carry.left <= 0) carried.delete(col - carry.cell.colspan);
        carry = carried.get(col);
      }
    };

    drainCarried();
    for (const cell of rows[r]) {
      drainCarried();
      const at = col;
      for (let k = 0; k < cell.colspan; k += 1) place(cell);
      if (cell.rowspan > 1) carried.set(at, { cell, left: cell.rowspan - 1 });
      drainCarried();
    }
    grid.push(out);
  }

  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const ragged: number[] = [];
  for (let r = 0; r < grid.length; r += 1) {
    if (grid[r].length !== width) ragged.push(r);
    while (grid[r].length < width) grid[r].push(null);
  }

  return { classes, grid, width, raggedRows: ragged };
}
