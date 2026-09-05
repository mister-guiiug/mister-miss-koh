/**
 * Les colliers d'immunité — quatrième tableau de la page.
 *
 * DEUX LIGNES D'EN-TÊTE, comme le déroulement : « Utilisation » chapeaute
 * « Statut », « Jour », « Épisode » et « Votes annulés ». La seconde ligne
 * porte TOUS les libellés (les colonnes de gauche s'y répètent par `rowspan`),
 * c'est donc elle qu'on interroge — une seule recherche au lieu de paires.
 *
 * SIX FORMES D'EN-TÊTE sur les neuf pages qui ont ce tableau, relevées le
 * 05/09/2026. Elles diffèrent par des synonymes (« Localisation » ou
 * « Localisation ou circonstance », « Propriétaire d'origine » ou
 * « Détenteur ») et par des colonnes en plus. D'où : chaque colonne se cherche
 * par une LISTE de libellés acceptés, et une seule est structurellement
 * requise — celle du détenteur, sans laquelle il n'y a rien à dire.
 *
 * UNE CELLULE QUI DIT « NON DÉCOUVERT » N'EST PAS UN NOM. Le tableau
 * pré-dimensionne ses lignes : un collier repéré mais jamais trouvé occupe une
 * ligne entière remplie de « Non découvert ». Le prendre pour un détenteur
 * inventerait un aventurier de ce nom, exactement comme « Banni » inventait
 * une tribu.
 */
import type { Grid } from "./html-table.ts";
import type { Anomaly } from "./extract-votes.ts";
import { fold, parseDayRange, splitNames } from "./parse-fr.ts";

export type AdvantageStatus = "used" | "not_used" | "undiscovered" | "unknown";

export interface AdvantageHolder {
  readonly name: string;
  readonly fromDay: number | null;
  readonly toDay: number | null;
  /** Vrai pour la colonne « Propriétaire d'origine », faux pour les suivants. */
  readonly original: boolean;
}

export interface ExtractedAdvantage {
  readonly naturalKey: string;
  /** Où il a été trouvé, tel que la source l'écrit : « Camp réunifié ». */
  readonly location: string | null;
  readonly holders: readonly AdvantageHolder[];
  readonly status: AdvantageStatus;
  readonly foundDay: number | null;
  readonly playedEpisodeNumber: number | null;
  readonly playedDay: number | null;
  readonly annulledVotes: number | null;
  readonly annulledVotesTotal: number | null;
}

export interface AdvantagesExtraction {
  readonly advantages: readonly ExtractedAdvantage[];
  readonly anomalies: readonly Anomaly[];
}

/** Mots qui remplissent une cellule au lieu d'y mettre une valeur. */
const PLACEHOLDERS = new Set([
  "non decouvert",
  "non decouverte",
  "non utilise",
  "non utilisee",
  "aucun",
  "aucune",
  "-",
  "—",
  "",
]);

const STATUSES: Record<string, AdvantageStatus> = {
  "utilise": "used",
  "utilisee": "used",
  "non utilise": "not_used",
  "non utilisee": "not_used",
  "non decouvert": "undiscovered",
  "non decouverte": "undiscovered",
  "trouve": "not_used",
  "trouvee": "not_used",
};

function columnIn(grid: Grid, row: number, ...labels: string[]): number {
  const wanted = labels.map(fold);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    if (wanted.includes(fold(grid[row][c]?.text ?? ""))) return c;
  }
  return -1;
}

/** Colonne dont le libellé COMMENCE par ce préfixe (« Votes annulés… »). */
function columnStarting(grid: Grid, row: number, prefix: string): number {
  const wanted = fold(prefix);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    if (fold(grid[row][c]?.text ?? "").startsWith(wanted)) return c;
  }
  return -1;
}

const isPlaceholder = (raw: string) => PLACEHOLDERS.has(fold(raw));

/** Un entier seul, ou rien. « 12 » → 12 ; « Non utilisé » → null. */
function parseCount(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number.parseInt(text, 10);
  return value >= 0 && value < 1000 ? value : null;
}

/** « 3/9 » → trois voix annulées sur neuf. */
function parseAnnulled(raw: string): { votes: number; total: number } | null {
  const match = raw.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const votes = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  return total >= votes ? { votes, total } : null;
}

/**
 * « Dorian et Lola (jour 6) » → deux détenteurs, à partir du jour 6.
 * « Cynthia (jour 30 – 31) » → une détentrice, sur un intervalle fermé.
 */
function readHolders(raw: string, original: boolean): AdvantageHolder[] {
  if (isPlaceholder(raw)) return [];
  const range = parseDayRange(raw);
  const names = splitNames(raw.replace(/\s*\([^)]*\)\s*$/, "").trim());
  return names.map((name) => ({
    name,
    fromDay: range?.fromDay ?? null,
    toDay: range?.toDay ?? null,
    original,
  }));
}

export function extractAdvantages(
  grid: Grid,
  seasonSlug: string,
): AdvantagesExtraction {
  const anomalies: Anomaly[] = [];
  // La seconde ligne d'en-tête porte tous les libellés.
  const header = 1;

  const colHolder = columnIn(
    grid,
    header,
    "Propriétaire d'origine",
    "Propriétaire(s) d'origine",
    "Détenteur",
    "Détenteur(s)",
  );
  if (colHolder === -1) {
    return {
      advantages: [],
      anomalies: [{
        code: "structure_inconnue",
        message:
          "en-tête « Propriétaire d'origine » introuvable — le tableau des colliers a changé",
      }],
    };
  }

  const colLocation = columnIn(
    grid,
    header,
    "Localisation",
    "Localisation ou circonstance",
  );
  const colOthers = columnIn(grid, header, "Autre(s) propriétaire(s)");
  const colStatus = columnIn(grid, header, "Statut");
  const colEpisode = columnIn(grid, header, "Épisode");
  const colDay = columnIn(grid, header, "Jour");
  const colAnnulled = columnStarting(grid, header, "Votes annulés");

  const cell = (r: number, c: number) => (c >= 0 ? (grid[r][c]?.text.trim() ?? "") : "");

  const advantages: ExtractedAdvantage[] = [];
  for (let r = header + 1; r < grid.length; r += 1) {
    const rawHolder = cell(r, colHolder);
    const location = cell(r, colLocation);
    if (!rawHolder && !location) continue;

    const rawStatus = cell(r, colStatus);
    let status: AdvantageStatus = STATUSES[fold(rawStatus)] ?? "unknown";
    if (status === "unknown" && rawStatus !== "") {
      anomalies.push({
        code: "statut_collier_inconnu",
        message: `collier ${advantages.length + 1} : statut « ${rawStatus} » non reconnu`,
      });
    }
    // Une ligne entièrement « Non découvert » se lit comme telle même si la
    // colonne « Statut » n'existe pas sur cette page.
    if (status === "unknown" && isPlaceholder(rawHolder) && fold(rawHolder) !== "aucun") {
      status = "undiscovered";
    }

    const holders = [
      ...readHolders(rawHolder, true),
      ...readHolders(cell(r, colOthers), false),
    ];

    const annulled = parseAnnulled(cell(r, colAnnulled));

    advantages.push({
      naturalKey: `${seasonSlug}:collier:${advantages.length + 1}`,
      location: location && !isPlaceholder(location) ? location : null,
      holders,
      status,
      foundDay: holders.find((h) => h.original)?.fromDay ?? null,
      playedEpisodeNumber: parseCount(cell(r, colEpisode)),
      playedDay: parseCount(cell(r, colDay)),
      annulledVotes: annulled?.votes ?? null,
      annulledVotesTotal: annulled?.total ?? null,
    });
  }

  return { advantages, anomalies };
}
