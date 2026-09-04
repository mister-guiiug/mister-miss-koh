/**
 * Candidats et déroulement — de deux tableaux vers le modèle intermédiaire.
 *
 * LES COLONNES SE CHERCHENT PAR LEUR EN-TÊTE, jamais par leur rang. Le
 * tableau du déroulement porte une colonne DÉCORATIVE — un `rowspan` de 37 sur
 * une cellule vide, posé pour dessiner un trait entre les épreuves et le
 * conseil. Elle occupe une position réelle dans la grille : compter les
 * colonnes ferait lire « Éliminé » là où il n'y a rien. Chercher par titre la
 * traverse sans la voir, et survit à son retrait.
 *
 * LE TABLEAU A DEUX LIGNES D'EN-TÊTE. « Épreuves » chapeaute « Confort » et
 * « Immunité » ; « Conseil » chapeaute « Éliminé(s) », « Votes » et
 * « Départ ». Les deux lignes sont donc lues ensemble, et une colonne se
 * désigne par sa paire (chapeau, sous-titre).
 */
import type { Grid } from "./html-table.ts";
import { cellLines } from "./html-table.ts";
import type { Anomaly } from "./extract-votes.ts";
import {
  fold,
  parseAge,
  parseDay,
  parseEpisodeNumber,
  parseFrenchDate,
  parseGender,
  parseTallySequence,
  splitNames,
} from "./parse-fr.ts";

// ════════════════════════════════════════════════════════════════════════════
// Candidats
// ════════════════════════════════════════════════════════════════════════════

export interface ExtractedContestant {
  readonly naturalKey: string;
  readonly displayName: string;
  readonly gender: "f" | "m" | null;
  readonly age: number | null;
  readonly previousSeasons: readonly string[];
  readonly team: string | null;
  readonly finalJury: boolean | null;
  readonly departure: string | null;
}

export interface ContestantsExtraction {
  readonly contestants: readonly ExtractedContestant[];
  readonly anomalies: readonly Anomaly[];
}

/** Index de la colonne dont l'en-tête correspond, sinon -1. */
function columnByHeader(grid: Grid, row: number, label: string): number {
  const target = fold(label);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    if (fold(grid[row][c]?.text ?? "") === target) return c;
  }
  return -1;
}

export function extractContestants(
  grid: Grid,
  seasonSlug: string,
): ContestantsExtraction {
  const anomalies: Anomaly[] = [];
  const header = 0;

  const colAge = columnByHeader(grid, header, "Âge");
  const colPrevious = columnByHeader(grid, header, "Saisons précédentes");
  const colTeam = columnByHeader(grid, header, "Tribu");
  const colJury = columnByHeader(grid, header, "Jury final");

  if (colAge === -1 || colPrevious === -1) {
    return {
      contestants: [],
      anomalies: [{
        code: "structure_inconnue",
        message:
          "en-têtes « Âge » ou « Saisons précédentes » introuvables — le tableau des candidats a changé",
      }],
    };
  }

  // « Candidat » couvre deux colonnes : le symbole, puis le nom. Le nom est
  // donc la colonne juste avant l'âge, quel que soit le nombre de colonnes
  // que le chapeau occupe.
  const colName = colAge - 1;
  const colGender = colAge - 2;

  const contestants: ExtractedContestant[] = [];
  for (let r = header + 1; r < grid.length; r += 1) {
    const name = grid[r][colName]?.text.trim() ?? "";
    if (!name) continue;

    const rawAge = grid[r][colAge]?.text ?? "";
    const age = parseAge(rawAge);
    if (rawAge && age === null) {
      anomalies.push({
        code: "age_illisible",
        message: `âge illisible pour ${name} : « ${rawAge} »`,
        row: name,
      });
    }

    const rawGender = colGender >= 0 ? (grid[r][colGender]?.text ?? "") : "";
    const gender = parseGender(rawGender);
    if (rawGender && gender === null) {
      anomalies.push({
        code: "genre_illisible",
        message: `symbole de genre non reconnu pour ${name} : « ${rawGender} »`,
        row: name,
      });
    }

    const jury = colJury >= 0 ? (grid[r][colJury]?.text.trim() ?? "") : "";

    contestants.push({
      naturalKey: `${seasonSlug}:${name}`,
      displayName: name,
      gender,
      age,
      // Une cellule empile plusieurs mentions séparées par des `<br>` : elles
      // se relisent en lignes, pas en une chaîne recollée.
      previousSeasons: colPrevious >= 0
        ? cellLines(grid[r][colPrevious]?.html ?? "")
        : [],
      team: colTeam >= 0 ? (grid[r][colTeam]?.text.trim() || null) : null,
      // Vide = la source ne dit rien, PAS « non ». La saison est en cours.
      finalJury: jury === "" ? null : fold(jury) !== "non",
      departure: null,
    });
  }

  if (contestants.length === 0) {
    anomalies.push({
      code: "aucun_candidat",
      message: "le tableau des candidats ne contient aucune ligne lisible",
    });
  }

  return { contestants, anomalies };
}

// ════════════════════════════════════════════════════════════════════════════
// Déroulement
// ════════════════════════════════════════════════════════════════════════════

export interface ExtractedEpisode {
  readonly naturalKey: string;
  readonly number: number;
  readonly airDate: string | null;
  readonly comfortWinners: readonly string[];
  readonly immunityWinners: readonly string[];
  readonly eliminated: readonly string[];
  readonly rawTally: string;
  readonly tallyRounds: readonly {
    readonly counts: readonly number[];
    readonly total: number;
  }[];
  readonly departureDay: number | null;
  /** Vrai quand la ligne n'a qu'un numéro et une date : pas encore diffusé. */
  readonly aired: boolean;
}

export interface ProgressExtraction {
  readonly episodes: readonly ExtractedEpisode[];
  readonly anomalies: readonly Anomaly[];
}

/** Colonne dont la paire (chapeau, sous-titre) correspond. */
function columnByPair(grid: Grid, top: string, sub: string): number {
  const wantTop = fold(top);
  const wantSub = fold(sub);
  const width = Math.max(grid[0]?.length ?? 0, grid[1]?.length ?? 0);
  for (let c = 0; c < width; c += 1) {
    const t = fold(grid[0][c]?.text ?? "");
    const s = fold(grid[1]?.[c]?.text ?? "");
    if (t === wantTop && s === wantSub) return c;
  }
  return -1;
}

export function extractProgress(grid: Grid, seasonSlug: string): ProgressExtraction {
  const anomalies: Anomaly[] = [];

  const colEpisode = columnByHeader(grid, 0, "Épisode");
  const colAir = columnByHeader(grid, 0, "Diffusion");
  const colComfort = columnByPair(grid, "Épreuves", "Confort");
  const colImmunity = columnByPair(grid, "Épreuves", "Immunité");
  const colEliminated = columnByPair(grid, "Conseil", "Éliminé(s)");
  const colVotes = columnByPair(grid, "Conseil", "Votes");
  const colDeparture = columnByPair(grid, "Conseil", "Départ");

  const missing: string[] = [];
  if (colEpisode === -1) missing.push("Épisode");
  if (colAir === -1) missing.push("Diffusion");
  if (colEliminated === -1) missing.push("Conseil / Éliminé(s)");
  if (missing.length > 0) {
    return {
      episodes: [],
      anomalies: [{
        code: "structure_inconnue",
        message: `colonnes introuvables : ${
          missing.join(", ")
        } — le tableau du déroulement a changé`,
      }],
    };
  }

  const cell = (r: number, c: number) => (c >= 0 ? (grid[r][c]?.text.trim() ?? "") : "");

  const episodes: ExtractedEpisode[] = [];
  // Les deux premières lignes sont l'en-tête à deux étages.
  for (let r = 2; r < grid.length; r += 1) {
    const rawEpisode = cell(r, colEpisode);
    if (!rawEpisode) continue;
    const number = parseEpisodeNumber(rawEpisode);
    if (number === null) {
      anomalies.push({
        code: "episode_illisible",
        message: `numéro d'épisode illisible : « ${rawEpisode} »`,
      });
      continue;
    }

    const rawAir = cell(r, colAir);
    const airDate = rawAir ? parseFrenchDate(rawAir) : null;
    if (rawAir && airDate === null) {
      anomalies.push({
        code: "date_illisible",
        message: `date de diffusion illisible pour l'épisode ${number} : « ${rawAir} »`,
      });
    }

    const eliminated = splitNames(cell(r, colEliminated));
    const rawTally = cell(r, colVotes);
    const tallyRounds = parseTallySequence(rawTally);
    if (rawTally && tallyRounds.length === 0) {
      anomalies.push({
        code: "decompte_illisible",
        message: `décompte de votes illisible à l'épisode ${number} : « ${rawTally} »`,
      });
    }

    // UN ÉPISODE NON DIFFUSÉ N'EST PAS UNE ANOMALIE. La saison est en cours :
    // le tableau porte déjà les lignes des épisodes à venir, numéro et date
    // seulement. Les compter comme des conseils vides produirait une fausse
    // alerte chaque semaine.
    const aired = eliminated.length > 0 || rawTally !== "" ||
      cell(r, colComfort) !== "" || cell(r, colImmunity) !== "";

    episodes.push({
      naturalKey: `${seasonSlug}:e${number}`,
      number,
      airDate,
      comfortWinners: splitNames(cell(r, colComfort)),
      immunityWinners: splitNames(cell(r, colImmunity)),
      eliminated,
      rawTally,
      tallyRounds,
      departureDay: parseDay(cell(r, colDeparture)),
      aired,
    });
  }

  // ── Contrôles de cohérence ────────────────────────────────────────────
  const numbers = episodes.map((e) => e.number);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  for (const n of new Set(duplicates)) {
    anomalies.push({
      code: "episode_duplique",
      message: `l'épisode ${n} apparaît plusieurs fois dans le tableau`,
    });
  }
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      anomalies.push({
        code: "episode_manquant",
        message: `saut de numérotation entre les épisodes ${numbers[i - 1]} et ${
          numbers[i]
        }`,
      });
    }
  }
  for (const episode of episodes) {
    if (!episode.aired) continue;
    if (
      episode.eliminated.length > 0 && episode.tallyRounds.length === 0 &&
      episode.rawTally
    ) {
      anomalies.push({
        code: "elimination_sans_decompte",
        message:
          `épisode ${episode.number} : un éliminé nommé, mais aucun décompte lisible`,
      });
    }
    if (episode.eliminated.length === 0 && episode.tallyRounds.length > 0) {
      anomalies.push({
        code: "decompte_sans_elimine",
        message: `épisode ${episode.number} : un décompte sans éliminé nommé`,
      });
    }
  }

  return { episodes, anomalies };
}
