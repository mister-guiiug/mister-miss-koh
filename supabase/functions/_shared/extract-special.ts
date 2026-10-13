/**
 * Les épreuves spéciales — tableau apparu sur la page All Stars le 13/10/2026.
 *
 * CE TABLEAU A REPRIS UNE INFORMATION QUE PORTAIT LA MATRICE DES VOTES. Jusqu'à
 * la révision 239943413 (30/09/2026), l'élimination DÉFINITIVE de quatre
 * bannis à l'arène de l'épisode 4 — Joana, Moussa, Naoil, Jacques — y occupait
 * quatre colonnes à zéro voix, avant le vote contre Lola. La révision
 * 240344480 les a retirées de la matrice et les a écrites ici, avec un second
 * affrontement à l'épisode 7 :
 *
 *   | Épreuve              | Épisodes | Gagnant(s) | Gain | Perdant(s)          | Perte                     |
 *   | 1er affrontement…    | 4e       | Maxime et… | …    | Joana, Moussa, …    | Élimination définitive …  |
 *   | 2e affrontement…     | 7e       | Lola       | …    | Charlotte et Tania  | Élimination définitive …  |
 *
 * ON N'EN LIT QU'UNE CHOSE : QUI SORT DÉFINITIVEMENT, ET À QUEL ÉPISODE. Le
 * reste (gains, privations, avantages) n'a pas de place au référentiel, et
 * l'inventer serait pire que l'omettre. La matrice des votes reçoit ces
 * sorties sous la forme qu'elle leur donnait elle-même — voir `extractVotes`.
 *
 * UNE LIGNE PEUT S'ÉTENDRE PAR `rowspan` : le second affrontement occupe deux
 * lignes (Lola, puis Nicolas, qui reviennent) dont les cellules « Épisodes »,
 * « Perdant(s) » et « Perte » sont partagées. La grille développée répète donc
 * la même cellule : une sortie n'est retenue qu'une fois par (épisode, nom).
 */
import type { Grid } from "./html-table.ts";
import type { Anomaly } from "./extract-votes.ts";
import { fold, parseEpisodeNumber, splitNames } from "./parse-fr.ts";

export interface DefinitiveExit {
  readonly episodeNumber: number;
  readonly name: string;
}

export interface SpecialExtraction {
  readonly exits: readonly DefinitiveExit[];
  readonly anomalies: readonly Anomaly[];
}

/** La perte qui fait sortir : « Élimination définitive de l'aventure ». */
const DEFINITIVE = /^elimination definitive/;

function columnStarting(grid: Grid, row: number, ...prefixes: string[]): number {
  const wanted = prefixes.map(fold);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    const label = fold(grid[row][c]?.text ?? "");
    if (wanted.some((w) => label.startsWith(w))) return c;
  }
  return -1;
}

function headerRow(grid: Grid): number {
  for (let r = 0; r < grid.length; r += 1) {
    if (
      columnStarting(grid, r, "Perdant") !== -1 &&
      columnStarting(grid, r, "Perte") !== -1
    ) {
      return r;
    }
  }
  return -1;
}

/** Ce tableau est-il celui des épreuves spéciales ? */
export function looksLikeSpecial(grid: Grid): boolean {
  return headerRow(grid) !== -1;
}

/**
 * @param roster Les noms du tableau des candidats : un perdant qui n'y figure
 *   pas n'est pas une sortie, c'est une anomalie à relire.
 */
export function extractSpecial(
  grid: Grid,
  roster?: readonly string[],
): SpecialExtraction {
  const anomalies: Anomaly[] = [];
  const header = headerRow(grid);
  const colEpisode = header === -1 ? -1 : columnStarting(grid, header, "Episode");
  const colLosers = header === -1 ? -1 : columnStarting(grid, header, "Perdant");
  const colLoss = header === -1 ? -1 : columnStarting(grid, header, "Perte");

  if (header === -1 || colEpisode === -1) {
    return {
      exits: [],
      anomalies: [{
        code: "structure_inconnue",
        message:
          "épreuves spéciales : en-têtes « Épisodes », « Perdant(s) » ou « Perte » introuvables — tableau ignoré",
      }],
    };
  }

  const inscrits = new Map((roster ?? []).map((n) => [fold(n), n]));
  const exits: DefinitiveExit[] = [];
  const vues = new Set<string>();

  for (let r = header + 1; r < grid.length; r += 1) {
    const loss = grid[r][colLoss]?.text ?? "";
    if (!DEFINITIVE.test(fold(loss))) continue;

    const episodeText = grid[r][colEpisode]?.text ?? "";
    const episodeNumber = parseEpisodeNumber(episodeText);
    if (episodeNumber === null) {
      anomalies.push({
        code: "episode_illisible",
        message:
          `épreuves spéciales, ligne ${r} : épisode illisible « ${episodeText} » — sortie définitive ignorée`,
      });
      continue;
    }

    for (const brut of splitNames(grid[r][colLosers]?.text ?? "")) {
      const name = inscrits.size > 0 ? inscrits.get(fold(brut)) : brut;
      if (!name) {
        anomalies.push({
          code: "perdant_inconnu",
          message:
            `épreuves spéciales, épisode ${episodeNumber} : « ${brut} » n'est pas au tableau des candidats`,
          row: `e${episodeNumber}`,
        });
        continue;
      }
      const cle = `${episodeNumber}:${fold(name)}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      exits.push({ episodeNumber, name });
    }
  }

  return { exits, anomalies };
}
