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

/**
 * Libellés qui occupent la case « Épisode » à la place d'un numéro.
 *
 * Relevé sur les dix-huit pages du corpus le 13/09/2026 : six d'entre elles
 * terminent leur tableau par deux colonnes ainsi intitulées — Fidji, L'Île des
 * héros, La Guerre des chefs, La Revanche des héros, Le Combat des héros,
 * Malaisie — et aucune autre colonne du corpus ne porte un épisode non
 * numérique. La liste vaut donc ce que vaut ce relevé, et rien de plus : un
 * libellé inconnu retombe sur `episode_illisible`, qui écarte la colonne de la
 * même façon mais ne prétend pas savoir ce qu'elle est.
 */
const LIBELLES_FINALE = new Set(["finaliste", "vainqueur"]);

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

const LABEL_EPISODE = "Épisode";
const LABEL_ELIMINATED = "Éliminé";
const LABEL_VOTES = "Votes";
const LABEL_CONTESTANTS = "Candidats";

/**
 * Le libellé, débarrassé de ce qui n'est pas une donnée.
 *
 * LE MARQUEUR ET SON ESPACE NE SONT PAS DU CONTENU. Les quinze pages qui
 * portent cette matrice écrivent le même en-tête de six façons — « ► Épisode »
 * et « ►Épisode », « ► Éliminé », « ► Éliminés », « ► Éliminé ou abandon » et
 * « ►Éliminéou abandon », cette dernière née d'un `<br>` aplati. Comparer la
 * chaîne entière, c'était faire dépendre la lecture d'une espace : quatre
 * saisons sur dix-huit tombaient là-dessus.
 */
function labelOf(text: string): string {
  return fold(text.replace(/^[►▼]\s*/u, ""));
}

/**
 * Repère une ligne d'en-tête par son libellé de première colonne.
 *
 * Le PRÉFIXE suffit : « Éliminé ou abandon » désigne la même ligne
 * qu'« Éliminé ». Aucun nom de candidat ne commence par « épisode », « votes »
 * ou « candidats » — le risque de confusion est nul, et une correspondance
 * exacte perdrait un tiers des pages.
 */
function findRow(grid: Grid, label: string): number {
  const wanted = fold(label);
  for (let r = 0; r < grid.length; r += 1) {
    if (labelOf(grid[r][0]?.text ?? "").startsWith(wanted)) return r;
  }
  return -1;
}

/**
 * Cette grille est-elle la matrice des votes ?
 *
 * Sert à CHOISIR le bon tableau dans une section qui en porte plusieurs, au
 * lieu de prendre le premier venu. Deux lignes suffisent à la reconnaître sans
 * l'extraire.
 */
export function looksLikeVotes(grid: Grid): boolean {
  return findRow(grid, LABEL_EPISODE) !== -1 && findRow(grid, LABEL_CONTESTANTS) !== -1;
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

/**
 * @param roster Les noms du TABLEAU DES CANDIDATS, quand on les a.
 *
 * POURQUOI LA MATRICE NE SUFFIT PAS À ELLE-MÊME. Sous « ▼ Candidats », la
 * colonne de gauche ne porte pas que des aventuriers : « La Guerre des chefs »
 * y met une ligne « Pénalité », « Fidji » une ligne « Vote noir ». Prises pour
 * des votants, elles produisent des voix qu'aucune publication ne peut
 * rattacher — « votant « Pénalité » inconnu de la saison », relevé le
 * 13/09/2026. La liste des candidats est la seule autorité sur qui existe ;
 * sans elle (tests unitaires, appel direct), on garde l'ancien comportement.
 */
export function extractVotes(
  grid: Grid,
  seasonSlug: string,
  roster?: readonly string[],
): VotesExtraction {
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
  // LE TABLEAU DES CANDIDATS FAIT AUTORITÉ SUR L'ORTHOGRAPHE, pas seulement sur
  // l'existence. « La Revanche des héros » écrit « Teheiura » dans sa liste et
  // « Téheiura » dans sa matrice : l'accent seul suffisait à faire refuser la
  // voix à la publication — « votant « Téheiura » inconnu de la saison ». On
  // reconnaît sans les accents, puis on RETIENT la graphie de la liste.
  const parNom = new Map<string, string>();
  for (const nom of roster ?? []) parNom.set(fold(nom), nom);
  const inscrits = parNom.size > 0 ? parNom : null;
  const canonique = (valeur: string) => inscrits?.get(fold(valeur)) ?? valeur;
  for (let r = rowContestants + 1; r < grid.length; r += 1) {
    const name = grid[r][0]?.text ?? "";
    if (!name) continue;
    if (inscrits && !inscrits.has(fold(name))) {
      // ON NE DEVINE PAS CE QUE C'EST. Une ligne qui n'est pas au tableau des
      // candidats n'est pas un votant : on l'écarte, on le DIT, et le relecteur
      // tranche. La taire ferait entrer des voix fantômes.
      anomalies.push({
        code: "ligne_hors_liste",
        message:
          `« ${name} » a une ligne dans la matrice des votes mais ne figure pas au tableau des candidats : ligne ignorée`,
        row: name,
      });
      continue;
    }
    contestantRows.push(r);
    contestants.push(canonique(name));
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

    // SANS NUMÉRO D'ÉPISODE, LA COLONNE NE PRODUIT RIEN. Elle produisait un
    // tour de clé `…:e?:rN`, et ce tour ne pouvait PAS être publié : un
    // `council_rounds` pend à un `councils`, dont `episode_id` est `not null`.
    // La publication s'arrêtait donc sur « tour … : épisode <NULL> absent du
    // référentiel » — un message juste, mais rendu très loin de la cause, et
    // qui emportait avec lui la publication de toute la saison (11/09/2026,
    // « La Guerre des chefs »).
    //
    // Relevé sur les DIX-HUIT pages du corpus le 13/09/2026 : douze colonnes
    // sont dans ce cas, exactement deux sur six pages, toujours les deux
    // dernières, et le libellé n'est jamais un numéro abîmé — c'est
    // « Finaliste » ou « Vainqueur ». Ce sont les deux colonnes du JURY FINAL,
    // dont le décompte se lit « 6/13 » (voix sur jurés) et non « 6 ».
    //
    // ON NE LES RATTACHE PAS AU DERNIER ÉPISODE, et ce n'est pas par prudence :
    // dans la colonne « Vainqueur », la ligne « éliminé » nomme le VAINQUEUR.
    // Les importer comme des conseils inscrirait le gagnant parmi les éliminés
    // — une donnée fausse ayant l'air d'avoir réussi, ce que ce module refuse
    // ailleurs. Le jury final demande son propre modèle ; tant qu'il n'existe
    // pas, la colonne est nommée et laissée de côté.
    const episodeNumber = Number.parseInt(episodeText, 10);
    if (!Number.isFinite(episodeNumber)) {
      anomalies.push(
        LIBELLES_FINALE.has(fold(episodeText))
          ? {
            code: "jury_final_non_importe",
            message:
              `colonne ${c} « ${episodeText} » : le jury final n'entre pas au référentiel`,
            columnIndex: c,
          }
          : {
            code: "episode_illisible",
            message: `numéro d'épisode illisible en colonne ${c} : « ${episodeText} »`,
            columnIndex: c,
          },
      );
      continue;
    }
    const episodeKey = String(episodeNumber);

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
        target: canonique(value),
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
