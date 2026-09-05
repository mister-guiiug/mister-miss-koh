/**
 * Du tableau « Détails des votes » vers le modèle intermédiaire.
 *
 * CE MODULE NE TOUCHE PAS À LA BASE. Il transforme une grille en
 * propositions, et signale ce qu'il ne comprend pas. La décision d'écrire quoi
 * que ce soit appartient au diff et à la publication — ici, on lit.
 *
 * LA COLONNE EST L'UNITÉ, PAS L'ÉPISODE. Le tableau source donne une colonne
 * par SCRUTIN, pas par épisode : l'épisode 1 en occupe trois — le tour annulé
 * d'une égalité, le second tour, puis le départ du binôme de l'éliminé. C'est
 * exactement le découpage de `council_rounds`, et c'est pourquoi le schéma a
 * ce niveau intermédiaire.
 *
 * TROIS SORTES DE COLONNES, ET IL FAUT LES DISTINGUER :
 *
 *  - `vote`     — un scrutin ordinaire, avec un décompte du type « 11/18 » ;
 *  - `annulled` — un tour annulé : les voix y sont BARRÉES dans la source ;
 *  - `linked`   — un départ sans scrutin : décompte « 0 », aucune voix
 *                 exprimée. Confondre ce zéro avec une absence de donnée
 *                 fausserait tous les « votes reçus ».
 *
 * ET DEUX SORTES DE VIDE. Une colonne vide en FIN de tableau est un épisode
 * à venir — la saison est en cours, la moitié du tableau l'attend. Une colonne
 * vide au MILIEU est une anomalie. Les traiter pareil produirait soit des
 * fausses alertes chaque semaine, soit un trou silencieux.
 */
import type { Grid } from "./html-table.ts";
import { footnoteRefs } from "./html-table.ts";

export type ColumnKind = "vote" | "annulled" | "linked" | "empty" | "unknown";

export interface ExtractedRound {
  readonly naturalKey: string;
  readonly columnIndex: number;
  readonly episodeNumber: number | null;
  readonly roundNumber: number;
  readonly kind: ColumnKind;
  readonly eliminated: string | null;
  /**
   * Pour un départ LIÉ : la personne dont l'élimination l'a entraîné.
   *
   * La colonne « départ lié » n'existe que parce qu'un vote a éliminé
   * quelqu'un dans le même épisode ; elle décrit la conséquence de ce vote.
   * Le lien est donc une lecture de la STRUCTURE du tableau, pas une
   * déduction — et il vaut mieux ici, dans le modèle intermédiaire qu'un
   * relecteur voit, que dans une requête SQL que personne ne relit.
   */
  readonly causedBy: string | null;
  /** Voix rapportées pour l'éliminé. `null` = la source ne le dit pas. */
  readonly reportedVotesFor: number | null;
  /** Votants rapportés. `null` = la source ne le dit pas. */
  readonly reportedVotesTotal: number | null;
  readonly rawTally: string;
  readonly footnotes: readonly string[];
}

export interface ExtractedVote {
  readonly naturalKey: string;
  readonly columnIndex: number;
  readonly voter: string;
  readonly target: string | null;
  readonly struck: boolean;
}

export interface Anomaly {
  readonly code: string;
  readonly message: string;
  readonly columnIndex?: number;
  readonly row?: string;
}

/**
 * Marqueur de statut trouvé dans la ligne d'un candidat déjà sorti.
 *
 * LA MÊME COLONNE PORTE DEUX CHOSES. Constat du 05/09/2026 sur la page :
 * `Maxime | Banni` en colonne 3 n'est PAS un vote de Maxime pour quelqu'un
 * nommé « Banni » — c'est son état, une fois sorti. Le tableau réemploie les
 * cellules de vote pour dire ce que devient chacun.
 *
 * Prendre ces cellules pour des voix, c'était inventer quinze votes pour des
 * candidats inexistants ; les jeter, c'était perdre l'information la plus
 * utile au recoupement — QUI est encore en jeu à chaque épisode.
 */
export interface ExtractedStatus {
  readonly columnIndex: number;
  readonly contestant: string;
  readonly label: string;
}

export interface VotesExtraction {
  readonly rounds: readonly ExtractedRound[];
  readonly votes: readonly ExtractedVote[];
  readonly statuses: readonly ExtractedStatus[];
  readonly contestants: readonly string[];
  readonly anomalies: readonly Anomaly[];
}

/** Insensible à la casse et aux accents : « Bannie » ≡ « bannie ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Vocabulaire des statuts RECONNUS. Volontairement court : tout ce qui n'est
 * ni un candidat ni l'un de ces mots devient une anomalie, à relire. Une liste
 * trop large avalerait en silence un nom mal orthographié.
 */
export const STATUS_WORDS = new Set([
  "banni",
  "bannie",
  "elimine",
  "eliminee",
  "jury",
  "abandon",
  "abandonne",
  "abandonnee",
  "evacue",
  "evacuee",
  "exclu",
  "exclue",
  "hors jeu",
  "-",
  // Relevés sur les saisons passées le 05/09/2026, par un parcours des 11
  // pages exploitables : 69 cellules refusées, cinq libellés seulement.
  // « jury » seul ne suffit pas — la cellule porte « Jury final ».
  "jury final",
  "exile",
  "exilee",
  "victoire",
  "defaite",
]);

const LABEL_EPISODE = "► Épisode";
const LABEL_ELIMINATED = "► Éliminé";
const LABEL_VOTES = "► Votes";
const LABEL_CONTESTANTS = "▼ Candidats";

/** Repère une ligne d'en-tête par son libellé de première colonne. */
function findRow(grid: Grid, label: string): number {
  for (let r = 0; r < grid.length; r += 1) {
    const first = grid[r][0]?.text ?? "";
    if (first.startsWith(label)) return r;
  }
  return -1;
}

/** « 11/18 » → { for: 11, total: 18 } ; « 0 » → { for: 0, total: null }. */
function parseTally(raw: string): { forCount: number | null; total: number | null } {
  const cleaned = raw.trim();
  if (!cleaned || cleaned === "/") return { forCount: null, total: null };
  const slash = cleaned.indexOf("/");
  if (slash === -1) {
    const only = Number.parseInt(cleaned, 10);
    return {
      forCount: Number.isFinite(only) ? only : null,
      total: null,
    };
  }
  const left = Number.parseInt(cleaned.slice(0, slash), 10);
  const right = Number.parseInt(cleaned.slice(slash + 1), 10);
  return {
    forCount: Number.isFinite(left) ? left : null,
    total: Number.isFinite(right) ? right : null,
  };
}

export function extractVotes(grid: Grid, seasonSlug: string): VotesExtraction {
  const anomalies: Anomaly[] = [];
  const rowEpisode = findRow(grid, LABEL_EPISODE);
  const rowEliminated = findRow(grid, LABEL_ELIMINATED);
  const rowTally = findRow(grid, LABEL_VOTES);
  const rowContestants = findRow(grid, LABEL_CONTESTANTS);

  // UNE LIGNE D'EN-TÊTE ABSENTE ARRÊTE TOUT. Extraire « au mieux » d'un
  // tableau dont on n'a pas compris la structure, c'est produire des données
  // fausses avec l'air d'avoir réussi.
  const missing: string[] = [];
  if (rowEpisode === -1) missing.push(LABEL_EPISODE);
  if (rowEliminated === -1) missing.push(LABEL_ELIMINATED);
  if (rowTally === -1) missing.push(LABEL_VOTES);
  if (rowContestants === -1) missing.push(LABEL_CONTESTANTS);
  if (missing.length > 0) {
    return {
      rounds: [],
      votes: [],
      statuses: [],
      contestants: [],
      anomalies: [
        {
          code: "structure_inconnue",
          message: `en-têtes introuvables : ${
            missing.join(", ")
          } — la structure du tableau a changé`,
        },
      ],
    };
  }

  const width = grid[rowEpisode].length;

  // ── Candidats ────────────────────────────────────────────────────────────
  const contestantRows: number[] = [];
  const contestants: string[] = [];
  for (let r = rowContestants + 1; r < grid.length; r += 1) {
    const name = grid[r][0]?.text ?? "";
    if (!name) continue;
    contestantRows.push(r);
    contestants.push(name);
  }
  if (contestants.length === 0) {
    anomalies.push({
      code: "aucun_candidat",
      message: "aucune ligne de candidat sous l'en-tête",
    });
  }

  // ── Classement des cellules : voix, statut, ou incompris ────────────────
  const known = new Set(contestants.map(fold));
  const statuses: ExtractedStatus[] = [];
  type CellKind = "vote" | "status" | "unknown" | "empty";
  const kindOf = (text: string): CellKind => {
    if (!text) return "empty";
    if (known.has(fold(text))) return "vote";
    if (STATUS_WORDS.has(fold(text))) return "status";
    return "unknown";
  };

  // PASSE DE CLASSEMENT, SUR TOUTES LES COLONNES.
  //
  // Les statuts se relèvent ici et non dans la boucle des tours : « Maxime est
  // banni » est un fait de la COLONNE, vrai même là où aucun conseil ne s'est
  // tenu. Le collecter seulement dans les colonnes de scrutin perdrait
  // justement ce qui dit qui est déjà sorti aux épisodes suivants.
  //
  // Une colonne compte comme scrutin si au moins une VOIX y est exprimée. Un
  // marqueur de statut ne suffit pas : les lignes des sortis en portent
  // jusqu'à la fin du tableau, et une colonne d'épisode non diffusé en serait
  // remplie — elle passerait pour un conseil qui n'a pas eu lieu.
  const columnHasVote: boolean[] = new Array(width).fill(false);
  for (let i = 0; i < contestantRows.length; i += 1) {
    for (let c = 1; c < width; c += 1) {
      const value = grid[contestantRows[i]][c]?.text ?? "";
      switch (kindOf(value)) {
        case "vote":
          columnHasVote[c] = true;
          break;
        case "status":
          statuses.push({
            columnIndex: c,
            contestant: contestants[i],
            label: value,
          });
          break;
        case "unknown":
          anomalies.push({
            code: "valeur_inconnue",
            message: `colonne ${c}, ligne ${
              contestants[i]
            } : « ${value} » n'est ni un candidat ni un statut reconnu`,
            columnIndex: c,
            row: contestants[i],
          });
          break;
      }
    }
  }

  // Dernière colonne qui porte quelque chose d'un scrutin : au-delà, l'avenir.
  let lastMeaningful = 0;
  for (let c = 1; c < width; c += 1) {
    const eliminated = grid[rowEliminated][c]?.text ?? "";
    const tally = grid[rowTally][c]?.text ?? "";
    if (eliminated || tally || columnHasVote[c]) lastMeaningful = c;
  }

  const rounds: ExtractedRound[] = [];
  const votes: ExtractedVote[] = [];
  const roundsPerEpisode = new Map<string, number>();

  for (let c = 1; c < width; c += 1) {
    const episodeText = grid[rowEpisode][c]?.text ?? "";
    const eliminated = grid[rowEliminated][c]?.text ?? "";
    const tallyCell = grid[rowTally][c];
    const rawTally = tallyCell?.text ?? "";
    const empty = !eliminated && !rawTally && !columnHasVote[c];

    if (empty) {
      // Après la dernière colonne utile : l'épisode n'a pas encore été diffusé.
      if (c > lastMeaningful) continue;
      anomalies.push({
        code: "colonne_vide_intercalee",
        message:
          `la colonne ${c} est vide alors que des colonnes suivantes sont remplies`,
        columnIndex: c,
      });
      continue;
    }

    const episodeNumber = Number.parseInt(episodeText, 10);
    const episodeKey = Number.isFinite(episodeNumber) ? String(episodeNumber) : "?";
    if (!Number.isFinite(episodeNumber)) {
      anomalies.push({
        code: "episode_illisible",
        message: `numéro d'épisode illisible en colonne ${c} : « ${episodeText} »`,
        columnIndex: c,
      });
    }

    const roundNumber = (roundsPerEpisode.get(episodeKey) ?? 0) + 1;
    roundsPerEpisode.set(episodeKey, roundNumber);

    // ── Voix de la colonne ────────────────────────────────────────────────
    let cast = 0;
    let struckCast = 0;
    for (let i = 0; i < contestantRows.length; i += 1) {
      const cell = grid[contestantRows[i]][c];
      const value = cell?.text ?? "";
      // Statuts et valeurs incomprises ont été traités à la passe de
      // classement ; il ne reste ici que les voix.
      if (kindOf(value) !== "vote") continue;

      cast += 1;
      if (cell?.struck) struckCast += 1;
      votes.push({
        naturalKey: `${seasonSlug}:e${episodeKey}:r${roundNumber}:${contestants[i]}`,
        columnIndex: c,
        voter: contestants[i],
        target: value,
        struck: cell?.struck ?? false,
      });
    }

    const { forCount, total } = parseTally(rawTally);

    // ── Nature de la colonne ──────────────────────────────────────────────
    let kind: ColumnKind;
    if (cast > 0 && struckCast === cast) {
      kind = "annulled";
    } else if (eliminated && forCount === 0 && cast === 0) {
      kind = "linked";
    } else if (cast > 0 || forCount !== null) {
      kind = "vote";
    } else {
      kind = "unknown";
      anomalies.push({
        code: "colonne_indeterminee",
        message: `colonne ${c} : un éliminé (« ${eliminated} ») sans décompte ni voix`,
        columnIndex: c,
      });
    }

    if (!eliminated && kind !== "annulled") {
      anomalies.push({
        code: "eliminé_absent",
        message: `colonne ${c} : des voix sont exprimées mais aucun éliminé n'est nommé`,
        columnIndex: c,
      });
    }
    if (forCount !== null && total !== null && forCount > total) {
      anomalies.push({
        code: "decompte_incoherent",
        message: `colonne ${c} : ${forCount} voix pour ${total} votants`,
        columnIndex: c,
      });
    }
    if (eliminated && !known.has(fold(eliminated))) {
      anomalies.push({
        code: "elimine_inconnu",
        message:
          `l'éliminé « ${eliminated} » ne figure pas parmi les candidats du tableau`,
        columnIndex: c,
      });
    }

    // Un départ lié suit l'élimination de sa propre soirée : on remonte aux
    // tours déjà lus du MÊME épisode, et on prend le dernier vote.
    const causedBy = kind === "linked"
      ? (rounds
        .filter((r) =>
          r.episodeNumber === episodeNumber && r.kind === "vote" && r.eliminated
        )
        .at(-1)?.eliminated ?? null)
      : null;

    rounds.push({
      naturalKey: `${seasonSlug}:e${episodeKey}:r${roundNumber}`,
      columnIndex: c,
      episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
      roundNumber,
      kind,
      eliminated: eliminated || null,
      causedBy,
      reportedVotesFor: forCount,
      reportedVotesTotal: total,
      rawTally,
      footnotes: tallyCell ? footnoteRefs(tallyCell.html) : [],
    });
  }

  return { rounds, votes, statuses, contestants, anomalies };
}
