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
import { STATUS_WORDS } from "./extract-votes.ts";
import {
  fold,
  parseAge,
  parseDay,
  parseDayRange,
  parseEpisodeNumber,
  parseFrenchDate,
  parseGender,
  parseTallySequence,
  splitNames,
} from "./parse-fr.ts";

/**
 * Une ligne de la colonne « Tribu » → un séjour, un statut, ou rien.
 *
 * « BANNIE » N'EST PAS UNE TRIBU. La source range dans cette colonne, à la
 * suite des vraies tribus, l'état du candidat après sa sortie : sur les 639
 * lignes relevées le 05/09/2026, 46 sont des statuts (`Banni`, `Bannie`,
 * `Éliminé`, `Éliminée`). Les publier comme des tribus créerait une tribu
 * « Bannie » que personne n'a jamais rejointe, et lui donnerait des membres.
 */
export function readTeamLine(
  line: string,
): { kind: "team" | "status"; stint: TeamStint } | null {
  const range = parseDayRange(line);
  if (!range) return null;
  const name = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!name) return null;
  return {
    kind: STATUS_WORDS.has(fold(name)) ? "status" : "team",
    stint: { name, fromDay: range.fromDay, toDay: range.toDay },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Candidats
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un séjour dans une tribu : un nom, et l'intervalle de JOURS que la source
 * donne. Pas d'épisode : la colonne « Tribu » parle en jours, et convertir
 * serait inventer.
 */
export interface TeamStint {
  readonly name: string;
  readonly fromDay: number;
  readonly toDay: number | null;
}

export interface ExtractedContestant {
  readonly naturalKey: string;
  readonly displayName: string;
  readonly gender: "f" | "m" | null;
  readonly age: number | null;
  readonly previousSeasons: readonly string[];
  /** Séjours en tribu, dans l'ordre de la source. */
  readonly teams: readonly TeamStint[];
  /**
   * Ce que la colonne « Tribu » dit qui n'est PAS une tribu : « Banni (jour 3
   * – ) ». La source y range l'état du candidat après sa sortie.
   */
  readonly teamStatuses: readonly TeamStint[];
  readonly finalJury: boolean | null;
  readonly departure: string | null;
}

export interface ContestantsExtraction {
  readonly contestants: readonly ExtractedContestant[];
  readonly anomalies: readonly Anomaly[];
}

/** Index de la colonne dont l'en-tête correspond, sinon -1. */
function columnByHeader(grid: Grid, row: number, ...labels: string[]): number {
  const targets = labels.map(fold);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    if (targets.includes(fold(grid[row][c]?.text ?? ""))) return c;
  }
  return -1;
}

/**
 * Colonne dont l'en-tête COMMENCE par ce libellé.
 *
 * « Départ » s'écrit aussi « Départ et réf. » et « Départ et réfs. » selon les
 * saisons. Exiger l'égalité perdrait la colonne dans les deux tiers des cas ;
 * accepter n'importe quelle sous-chaîne ferait correspondre autre chose un
 * jour. Le préfixe est le compromis qui se justifie.
 */
function columnByPrefix(grid: Grid, row: number, prefix: string): number {
  const target = fold(prefix);
  for (let c = 0; c < (grid[row]?.length ?? 0); c += 1) {
    if (fold(grid[row][c]?.text ?? "").startsWith(target)) return c;
  }
  return -1;
}

/**
 * Étendue des colonnes coiffées par le même chapeau, à partir de `from`.
 * Rend [début, fin] inclus.
 */
function headerSpan(grid: Grid, row: number, from: number): [number, number] {
  const label = fold(grid[row]?.[from]?.text ?? "");
  let end = from;
  while (
    end + 1 < (grid[row]?.length ?? 0) && fold(grid[row][end + 1]?.text ?? "") === label
  ) {
    end += 1;
  }
  return [from, end];
}

/**
 * Cette grille est-elle le tableau des candidats ?
 *
 * Sert à CHOISIR parmi les tableaux d'une section. Sur « La Revanche des
 * héros », la section « Candidats » en porte deux : la liste, puis la matrice
 * des votes d'une sous-section. Prendre le premier venu marchait par chance.
 */
export function looksLikeContestants(grid: Grid): boolean {
  return columnByHeader(grid, 0, "Candidat", "Candidats") !== -1;
}

export function extractContestants(
  grid: Grid,
  seasonSlug: string,
): ContestantsExtraction {
  const anomalies: Anomaly[] = [];
  const header = 0;

  // LE SEUL ANCRAGE STRUCTUREL EST LE CHAPEAU « CANDIDAT ».
  //
  // La première version exigeait « Âge » ET « Saisons précédentes », et
  // déduisait le nom de `colÂge - 1`. Les deux hypothèses sont propres aux
  // éditions de retour : sur les 11 pages de saison exploitables du
  // 05/09/2026, « Saisons précédentes » n'existe que sur 3, et une colonne
  // « Profession » s'intercale ailleurs entre le nom et l'âge — `colÂge - 1`
  // lisait donc « Étudiante en STAPS » comme un nom, et le nom comme un
  // symbole de genre. C'était exactement l'erreur que le besoin interdit :
  // une règle d'UNE saison codée comme universelle.
  const colCandidate = columnByHeader(grid, header, "Candidat", "Candidats");
  if (colCandidate === -1) {
    return {
      contestants: [],
      anomalies: [{
        code: "structure_inconnue",
        message: "en-tête « Candidat » introuvable — le tableau des candidats a changé",
      }],
    };
  }

  // Le chapeau couvre deux colonnes : le symbole de genre, puis le nom.
  const [colGender, colName] = headerSpan(grid, header, colCandidate);

  const colAge = columnByHeader(grid, header, "Âge");
  const colPrevious = columnByHeader(grid, header, "Saisons précédentes");
  const colTeam = columnByHeader(grid, header, "Tribu");
  const colJury = columnByHeader(grid, header, "Jury final");
  const colDeparture = columnByPrefix(grid, header, "Départ");

  const contestants: ExtractedContestant[] = [];
  for (let r = header + 1; r < grid.length; r += 1) {
    const name = grid[r][colName]?.text.trim() ?? "";
    if (!name) continue;

    const rawAge = colAge >= 0 ? (grid[r][colAge]?.text ?? "") : "";
    const age = parseAge(rawAge);
    if (rawAge && age === null) {
      anomalies.push({
        code: "age_illisible",
        message: `âge illisible pour ${name} : « ${rawAge} »`,
        row: name,
      });
    }

    // Le symbole n'existe que si le chapeau couvre bien deux colonnes.
    const rawGender = colGender < colName ? (grid[r][colGender]?.text ?? "") : "";
    const gender = parseGender(rawGender);
    if (rawGender && gender === null) {
      anomalies.push({
        code: "genre_illisible",
        message: `symbole de genre non reconnu pour ${name} : « ${rawGender} »`,
        row: name,
      });
    }

    const jury = colJury >= 0 ? (grid[r][colJury]?.text.trim() ?? "") : "";

    // La cellule « Tribu » empile un séjour par ligne. Une ligne illisible
    // devient une anomalie : on ne devine pas un intervalle.
    const teams: TeamStint[] = [];
    const teamStatuses: TeamStint[] = [];
    if (colTeam >= 0) {
      for (const line of cellLines(grid[r][colTeam]?.html ?? "")) {
        if (!line.trim()) continue;
        const read = readTeamLine(line);
        if (!read) {
          anomalies.push({
            code: "tribu_illisible",
            message: `séjour en tribu illisible pour ${name} : « ${line} »`,
            row: name,
          });
          continue;
        }
        (read.kind === "team" ? teams : teamStatuses).push(read.stint);
      }
    }

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
      teams,
      teamStatuses,
      // Vide = la source ne dit rien, PAS « non ». La saison est en cours.
      finalJury: jury === "" ? null : fold(jury) !== "non",
      // Le motif du départ, TEL QUE la source l'écrit (« Abandon médical »,
      // « Éliminée »…). Vide sur une saison en cours : personne n'est encore
      // parti, et ce n'est pas une absence de donnée.
      departure: colDeparture >= 0 ? (grid[r][colDeparture]?.text.trim() || null) : null,
    });
  }

  if (contestants.length === 0) {
    anomalies.push({
      code: "aucun_candidat",
      message: "le tableau des candidats ne contient aucune ligne lisible",
    });
  }

  // ── DEUX AVENTURIERS, UN SEUL PRÉNOM ─────────────────────────────────────
  //
  // « La Tribu maudite » a deux Cécile (34 ans hôtesse de l'air, 41 ans
  // professeur de Pilates), « Les Chasseurs d'immunité » deux Léa, « La
  // Revanche des 4 Terres » deux Jérôme. La source ne donne que des prénoms :
  // la clé naturelle en portait donc deux fois la même, et l'insertion des
  // enregistrements échouait TOUT ENTIÈRE.
  //
  // On distingue par le RANG dans le tableau, seul repère que la source offre
  // sans interprétation — et on le DIT, parce qu'un rang n'est pas une
  // identité : si la page réordonne ses lignes, le second Cécile change de
  // clé. Le nom affiché, lui, ne bouge pas : inventer « Cécile (2) » à l'écran
  // serait écrire à la place de la source.
  // DEUX FOIS LE MÊME PRÉNOM N'EST PAS TOUJOURS DEUX PERSONNES. Une ligne
  // recopiée par erreur porte exactement les mêmes valeurs ; deux homonymes,
  // eux, diffèrent par l'âge, le métier ou la tribu. On compare donc la ligne
  // ENTIÈRE, et on ne traite comme deux personnes que ce qui se distingue.
  const signature = (c: ExtractedContestant) => JSON.stringify({ ...c, naturalKey: "" });
  const vus = new Map<string, number>();
  const signatures = new Set<string>();
  const uniques: ExtractedContestant[] = [];
  const repetees = new Set<string>();
  for (const c of contestants) {
    const sig = signature(c);
    if (signatures.has(sig)) {
      repetees.add(c.displayName);
      continue;
    }
    signatures.add(sig);
    const cle = fold(c.displayName);
    const rang = (vus.get(cle) ?? 0) + 1;
    vus.set(cle, rang);
    uniques.push(rang === 1 ? c : { ...c, naturalKey: `${c.naturalKey}~${rang}` });
  }

  for (const nom of repetees) {
    anomalies.push({
      code: "ligne_repetee",
      message:
        `la ligne de « ${nom} » figure deux fois à l'identique : une seule est retenue`,
      row: nom,
    });
  }

  // LE RANG N'EST PAS UNE IDENTITÉ, et il faut le dire : si la page réordonne
  // ses lignes, le second « Cécile » change de clé. Mais la source ne donne que
  // des prénoms — « La Tribu maudite » a deux Cécile, « Les Chasseurs
  // d'immunité » deux Léa, « La Revanche des 4 Terres » deux Jérôme — et le
  // rang est le seul repère qu'elle offre sans interprétation. Le nom AFFICHÉ,
  // lui, ne bouge pas : écrire « Cécile (2) » à l'écran serait écrire à la
  // place de la source.
  for (const [cle, total] of vus) {
    if (total < 2) continue;
    const nom = uniques.find((c) => fold(c.displayName) === cle)?.displayName ?? cle;
    anomalies.push({
      code: "homonymes",
      message:
        `${total} aventuriers s'appellent « ${nom} » : distingués par leur rang dans le tableau, et leurs voix ne sont pas attribuées`,
      row: nom,
    });
  }

  return { contestants: uniques, anomalies };
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

/**
 * Colonne dont la paire (chapeau, sous-titre) correspond. Plusieurs
 * sous-titres sont acceptés : la colonne des décomptes s'intitule « Votes »
 * sur les saisons récentes et « Vote » sur d'autres.
 */
function columnByPair(grid: Grid, top: string, ...subs: string[]): number {
  const wantTop = fold(top);
  const wantSubs = subs.map(fold);
  const width = Math.max(grid[0]?.length ?? 0, grid[1]?.length ?? 0);
  for (let c = 0; c < width; c += 1) {
    const t = fold(grid[0][c]?.text ?? "");
    const s = fold(grid[1]?.[c]?.text ?? "");
    if (t === wantTop && wantSubs.includes(s)) return c;
  }
  return -1;
}

/**
 * Les épisodes déduits de la matrice des votes, faute de mieux.
 *
 * POURQUOI FABRIQUER. « Malaisie », « La Légende » et « La Revanche des héros »
 * n'ont aucun tableau épisode par épisode — Wikipédia ne l'a jamais écrit. Leur
 * matrice des votes, elle, numérote ses colonnes par épisode et nomme les
 * éliminés. Sans épisode dans le référentiel, un conseil n'a rien à quoi
 * s'attacher et la publication s'arrête sur « épisode 1 absent du référentiel »
 * — les 147 à 175 voix de ces saisons restaient donc inaccessibles.
 *
 * CE QU'UN ÉPISODE FABRIQUÉ CONTIENT, ET RIEN DE PLUS : son numéro et ses
 * éliminés, les deux seuls faits que la matrice énonce. Pas de date, pas de
 * vainqueur d'épreuve, pas de décompte — inventer l'un d'eux serait écrire à la
 * place de la source. `aired` est vrai parce qu'un conseil s'y est tenu.
 *
 * Les éliminés viennent des tours, ce qui rend le recoupement muet PAR
 * CONSTRUCTION : comparer une déduction à sa propre source n'apprend rien, et
 * une contradiction fabriquée noierait les vraies.
 */
export function episodesFromRounds(
  rounds: readonly { episodeNumber: number | null; eliminated: string | null }[],
  seasonSlug: string,
): ExtractedEpisode[] {
  const parNumero = new Map<number, string[]>();
  for (const round of rounds) {
    if (round.episodeNumber === null) continue;
    const elimines = parNumero.get(round.episodeNumber) ?? [];
    if (round.eliminated) elimines.push(round.eliminated);
    parNumero.set(round.episodeNumber, elimines);
  }

  return [...parNumero.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, eliminated]) => ({
      naturalKey: `${seasonSlug}:e${number}`,
      number,
      airDate: null,
      comfortWinners: [],
      immunityWinners: [],
      eliminated,
      rawTally: "",
      tallyRounds: [],
      departureDay: null,
      aired: true,
    }));
}

/**
 * Cette grille est-elle le tableau du déroulement ?
 *
 * IL N'EST PAS TOUJOURS LE PREMIER DE SA SECTION. « Les 4 Terres » et « La
 * Revanche des 4 Terres » ouvrent leur « Déroulement » par un récapitulatif
 * des épreuves — mêmes colonnes « Épisode » et « Diffusion », aucun conseil —
 * et le vrai tableau vient ensuite. « Malaisie » et « La Légende », elles, n'en
 * ont aucun : leur « Déroulement » ne contient que la matrice des votes.
 *
 * La colonne du conseil est donc le seul discriminant fiable : c'est ce que le
 * déroulement apporte et que les autres tableaux n'ont pas.
 */
export function looksLikeProgress(grid: Grid): boolean {
  return columnByHeader(grid, 0, "Épisode") !== -1 &&
    columnByPair(grid, "Conseil", "Éliminé(s)") !== -1;
}

export function extractProgress(grid: Grid, seasonSlug: string): ProgressExtraction {
  const anomalies: Anomaly[] = [];

  const colEpisode = columnByHeader(grid, 0, "Épisode");
  const colAir = columnByHeader(grid, 0, "Diffusion");
  const colComfort = columnByPair(grid, "Épreuves", "Confort");
  const colImmunity = columnByPair(grid, "Épreuves", "Immunité");
  const colEliminated = columnByPair(grid, "Conseil", "Éliminé(s)");
  const colVotes = columnByPair(grid, "Conseil", "Votes", "Vote");
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

  // UN ÉPISODE PEUT OCCUPER PLUSIEURS LIGNES, et c'est courant : la cellule
  // « 4e épisode » des « 4 Terres » porte `rowspan=3` — un épisode, trois
  // conseils. La grille développe le `rowspan`, l'extraction voyait donc trois
  // épisodes de même numéro, et l'insertion des enregistrements échouait tout
  // entière sur `unique (run_id, entity, natural_key)`. On rassemble par
  // NUMÉRO : ce qui est propre au conseil s'ajoute, ce qui est propre à
  // l'épisode se garde une fois.
  const parNumero = new Map<number, ExtractedEpisode>();
  const fusionnes = new Set<number>();
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

    const ligne: ExtractedEpisode = {
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
    };

    const deja = parNumero.get(number);
    if (!deja) {
      parNumero.set(number, ligne);
      continue;
    }
    fusionnes.add(number);
    const unir = (
      a: readonly string[],
      b: readonly string[],
    ) => [...new Set([...a, ...b])];
    // Le décompte d'un conseil ne se confond pas avec celui d'un autre : les
    // valeurs distinctes s'enchaînent, dans l'ordre des lignes.
    const decomptes = [
      ...new Set([deja.rawTally, ligne.rawTally].filter((v) => v !== "")),
    ];
    parNumero.set(number, {
      ...deja,
      airDate: deja.airDate ?? ligne.airDate,
      comfortWinners: unir(deja.comfortWinners, ligne.comfortWinners),
      immunityWinners: unir(deja.immunityWinners, ligne.immunityWinners),
      eliminated: unir(deja.eliminated, ligne.eliminated),
      rawTally: decomptes.join(" / "),
      tallyRounds: [...deja.tallyRounds, ...ligne.tallyRounds],
      departureDay: deja.departureDay ?? ligne.departureDay,
      aired: deja.aired || ligne.aired,
    });
  }

  const episodes: ExtractedEpisode[] = [...parNumero.values()];
  const numbers = episodes.map((e) => e.number);

  // ── Contrôles de cohérence ────────────────────────────────────────────
  for (const n of fusionnes) {
    anomalies.push({
      code: "episode_plusieurs_lignes",
      message:
        `l'épisode ${n} occupe plusieurs lignes du tableau — conseils multiples, lignes rassemblées`,
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
