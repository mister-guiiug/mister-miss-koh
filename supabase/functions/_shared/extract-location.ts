/**
 * Le lieu de tournage — une ligne de l'infobox, pas un tableau de faits.
 *
 * L'INFOBOX EST LE SEUL TABLEAU DE L'INTRODUCTION (la section 0), et sa ligne
 * « Lieu de tournage » porte deux choses : un texte lisible — « Archipel des
 * Perles (Panama) » — et, dans le HTML de la cellule, des liens vers les pages
 * des lieux. Le texte est ce qu'on affiche ; le PREMIER lien est ce qu'on
 * géolocalise, parce que c'est la page la plus précise que la source cite —
 * l'archipel, pas le pays. Les coordonnées ne sont pas dans la page : elles se
 * demandent à l'API (`prop=coordinates`) sur ce titre-là, par l'orchestrateur.
 *
 * CE QUI N'EST PAS UN LIEU. Un drapeau (`Fichier:…`), un lien rouge vers une
 * page inexistante (`class="new"`), un lien externe : ils précèdent parfois le
 * vrai lien, et les prendre géolocaliserait une image. Une page sans infobox,
 * ou une infobox sans cette ligne, ne rend rien — et le dit, sans arrêter
 * l'import : une saison sans lieu connu reste une saison.
 */
import type { Grid, ParsedTable } from "./html-table.ts";
import { decodeEntities } from "./html-table.ts";
import type { Anomaly } from "./extract-votes.ts";
import { fold } from "./parse-fr.ts";

export interface SeasonLocation {
  /** Tel que la source l'écrit : « Archipel des Perles (Panama) ». */
  readonly name: string;
  /** Titre de la première page de lieu liée — celle qu'on géolocalise. */
  readonly pageTitle: string | null;
}

export interface LocationExtraction {
  readonly location: SeasonLocation | null;
  readonly anomalies: readonly Anomaly[];
}

/** Libellés acceptés pour la ligne, une fois pliés (minuscules, sans accent). */
const LOCATION_LABELS = new Set([
  "lieu de tournage",
  "lieux de tournage",
  "lieu",
  "lieux",
]);

/** Espaces de noms dont une page n'est jamais un lieu. */
const SKIPPED_NAMESPACES =
  /^(fichier|file|image|categorie|category|modele|template|aide|help|wikipedia|special|portail|portal)\s*:/i;

/** L'infobox parmi les tableaux de l'introduction — à sa CLASSE, pas à son rang. */
export function findInfobox(tables: readonly ParsedTable[]): ParsedTable | null {
  return tables.find((t) => decodeEntities(t.classes).split(/\s+/).includes("infobox")) ??
    null;
}

/**
 * Titre du premier lien qui désigne une PAGE de lieu.
 *
 * Un lien interne se reconnaît à son `href` (`/wiki/…`) ; un lien rouge porte
 * `class="new"` ; une image, `class="mw-file-description"`. Le titre est lu
 * dans l'attribut `title`, qui est le titre canonique de la page — le texte du
 * lien, lui, peut être une abréviation.
 */
export function firstPlaceLink(html: string): string | null {
  const anchor = /<a\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const title = /\btitle="([^"]*)"/.exec(attrs)?.[1];
    if (!title) continue;
    const href = /\bhref="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const classes = /\bclass="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!href.startsWith("/wiki/")) continue;
    if (/\b(new|mw-file-description)\b/.test(classes)) continue;
    const decoded = decodeEntities(title).trim();
    if (decoded === "" || SKIPPED_NAMESPACES.test(fold(decoded))) continue;
    return decoded;
  }
  return null;
}

/** La ligne « Lieu de tournage » de la grille de l'infobox, ou rien. */
export function extractLocation(grid: Grid): LocationExtraction {
  for (const row of grid) {
    const label = row[0];
    const value = row[1];
    if (!label || !value || !label.header) continue;
    if (!LOCATION_LABELS.has(fold(label.text))) continue;

    const name = value.text.replace(/\s+/g, " ").trim();
    if (name === "") {
      return {
        location: null,
        anomalies: [{
          code: "lieu_vide",
          message: "l'infobox a une ligne « Lieu de tournage » sans contenu",
        }],
      };
    }

    const pageTitle = firstPlaceLink(value.html);
    return {
      location: { name, pageTitle },
      anomalies: pageTitle === null
        ? [{
          code: "lieu_sans_page",
          message:
            `le lieu « ${name} » ne cite aucune page : pas de coordonnées possibles`,
        }]
        : [],
    };
  }

  return {
    location: null,
    anomalies: [{
      code: "lieu_absent",
      message: "aucune ligne « Lieu de tournage » dans l'infobox de la page",
    }],
  };
}
