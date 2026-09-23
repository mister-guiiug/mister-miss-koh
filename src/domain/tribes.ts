/**
 * Les tribus À LA LIMITE ANTI-SPOILER.
 *
 * La source date les séjours en JOURS — « Taboga (jour 9 – ) » — quand
 * l'anti-spoiler raisonne en ÉPISODES. La passerelle est le jour du conseil de
 * chaque épisode (`councilDay`), que la colonne « Départ » du déroulement
 * donne : un jour de jeu se montre avec le premier épisode dont le conseil
 * tombe ce jour-là ou après. Taboga naît au jour 9 ; le conseil de l'épisode 3
 * se tient au jour 8, celui du 4 au jour 11 : c'est l'épisode 4 qui la montre.
 *
 * QUAND UN JOUR DE CONSEIL MANQUE, ON ATTEND. Un épisode au jour inconnu ne
 * peut que RETARDER une révélation, jamais l'avancer : on retient le premier
 * épisode CONNU qui convient, qui n'est jamais plus tôt que le vrai. Et si
 * aucun ne convient, le séjour attend le dernier épisode diffusé — la règle
 * déjà suivie pour les colliers que la source ne date qu'en jours : prudent
 * plutôt que deviné.
 *
 * Tout ici est pur : ni React, ni réseau, ni horloge.
 */
import type { Contestant, Referential, Team, TeamStint } from './referential';
import { lastAiredEpisode } from './referential';

/**
 * Le premier épisode qui montre ce jour de jeu, ou `null` si aucun jour de
 * conseil connu ne le couvre.
 */
export function episodeOfDay(ref: Referential, day: number): number | null {
  // Le premier jour s'ouvre avec le premier épisode, quoi qu'on sache du reste.
  if (day <= 1) return 1;
  let found: number | null = null;
  for (const e of ref.episodes) {
    if (e.councilDay === null || e.councilDay < day) continue;
    if (found === null || e.number < found) found = e.number;
  }
  return found;
}

/** L'épisode à partir duquel un jour peut se montrer, sans jamais deviner. */
function revealOfDay(ref: Referential, day: number | null): number {
  const fallback = Math.max(1, lastAiredEpisode(ref));
  if (day === null) return fallback;
  return episodeOfDay(ref, day) ?? fallback;
}

/** Les séjours qui peuvent se montrer à cette limite. */
export function visibleStints(
  ref: Referential,
  contestant: Contestant,
  limit: number
): TeamStint[] {
  return contestant.teamStints.filter(
    s => revealOfDay(ref, s.fromDay) <= limit
  );
}

/**
 * La tribu d'un candidat À CETTE LIMITE : celle de son dernier séjour visible.
 *
 * Pour qui est sorti, c'est la dernière tribu où on l'a vu — la liste le range
 * avec elle, marqué « sorti·e ». Vincent a deux séjours ouverts, « Tribu
 * unique (jour 1 – ) » et « Taboga (jour 9 – ) » : le plus tardif l'emporte.
 */
export function teamAt(
  ref: Referential,
  contestant: Contestant,
  limit: number
): Team | null {
  let latest: TeamStint | null = null;
  for (const s of visibleStints(ref, contestant, limit)) {
    if (latest === null || (s.fromDay ?? 0) >= (latest.fromDay ?? 0))
      latest = s;
  }
  if (!latest) return null;
  const { teamId } = latest;
  return ref.teams.find(t => t.id === teamId) ?? null;
}

/**
 * Les SORTIES DES TRIBUS d'un candidat, dans l'ordre des jours : chaque trou
 * entre deux séjours — il n'était plus dans aucune tribu —, puis la fin de son
 * dernier séjour s'il est refermé. Un trou se referme sur un RETOUR : le séjour
 * qui recommence après lui.
 *
 * Maxime : tribu unique (jour 1 – 3), puis Sebako (jour 9 – ) — un trou du
 * jour 3 au jour 9, refermé par Sebako. Charlotte : (1 – 8), (9 – 14) — un
 * trou refermé par Taboga, puis une fin. Lola : (1 – 9), (9 – 11) — pas de
 * trou, une fin.
 */
function exitsFromTribes(
  stints: readonly TeamStint[]
): { readonly back: TeamStint | null }[] {
  const dated = stints
    .filter((s): s is TeamStint & { fromDay: number } => s.fromDay !== null)
    .sort((a, b) => a.fromDay - b.fromDay);
  const exits: { back: TeamStint | null }[] = [];
  // Jusqu'où les séjours déjà lus le couvrent : `null` = un séjour ouvert,
  // qui le couvre pour de bon ; `undefined` = aucun séjour encore.
  let covered: number | null | undefined;
  for (const s of dated) {
    if (typeof covered === 'number' && s.fromDay > covered) {
      exits.push({ back: s });
    }
    covered =
      covered === null || s.toDay === null
        ? null
        : Math.max(covered ?? s.toDay, s.toDay);
  }
  if (typeof covered === 'number') exits.push({ back: null });
  return exits;
}

/** Les épisodes de ses sorties publiées, dans l'ordre. */
function exitEpisodes(ref: Referential, contestantId: string): number[] {
  return ref.departures
    .filter(d => d.contestantId === contestantId && d.episodeNumber !== null)
    .map(d => d.episodeNumber as number)
    .sort((a, b) => a - b);
}

/**
 * Les retours qu'on peut PROUVER : un par sortie publiée, dans l'ordre —
 * chaque sortie répond à une sortie des tribus, et celle-ci dit si l'on est
 * revenu.
 *
 * SANS CORRESPONDANCE EXACTE, ON NE DEVINE RIEN. Deux cas le rendent
 * nécessaire, tous deux mesurés en production le 23/09/2026 :
 *
 *  - dater le retour par le jour de conseil ne marche pas quand ce jour
 *    manque — c'est le cas de toute saison publiée avant 0028. Retardée par
 *    prudence, la date d'un séjour ordinaire passait APRÈS la sortie, et
 *    Fidji affichait quatorze candidats « en jeu » pour un seul resté ;
 *  - une base publiée avant 0028 n'a gardé qu'UNE sortie par candidat : Marvyn
 *    (Fidji) est sorti deux fois, la base n'en connaît qu'une, et ses deux
 *    sorties des tribus ne s'y apparient pas.
 *
 * Dans les deux cas, les sorties publiées font foi, comme avant les tribus.
 *
 * ET UNE SAISON SANS AUCUN JOUR DE CONSEIL N'INFÈRE AUCUN RETOUR. Ce sont les
 * saisons publiées avant 0028 : une sortie par candidat, et des séjours
 * « (jour 37) » lus comme ouverts alors qu'ils ne durent qu'un jour. Sur
 * « Malaisie », les deux défauts se compensaient exactement — une sortie
 * perdue, un séjour faussement ouvert — et Thierry, éliminé deux fois,
 * revenait en jeu jusqu'à la finale. Une saison republiée depuis 0028 porte
 * ses jours de conseil et ses sorties complètes : c'est là seulement que le
 * comptage est digne de confiance.
 */
function provenReturns(
  ref: Referential,
  contestant: Contestant
): { exit: number; back: TeamStint | null }[] | null {
  if (!ref.episodes.some(e => e.councilDay !== null)) return null;
  const exits = exitEpisodes(ref, contestant.id);
  const tribes = exitsFromTribes(contestant.teamStints);
  if (exits.length === 0 || tribes.length !== exits.length) return null;
  return exits.map((exit, index) => ({
    exit,
    back: tribes[index]?.back ?? null,
  }));
}

/**
 * En jeu à cette limite ?
 *
 * Personne n'est sorti : oui. Sinon, c'est la DERNIÈRE sortie avant la limite
 * qui décide — et un retour prouvé, déjà montré à la limite, remet en jeu.
 * Maxime, sorti à l'épisode 1, revient dans Sebako au jour 9 : en jeu à
 * partir de l'épisode 4. Charlotte revient dans Taboga, puis ressort à
 * l'épisode 5 : en jeu au 4, plus au 5.
 */
export function inGameAt(
  ref: Referential,
  contestant: Contestant,
  limit: number
): boolean {
  const past = exitEpisodes(ref, contestant.id).filter(e => e <= limit);
  if (past.length === 0) return true;
  const back = provenReturns(ref, contestant)?.[past.length - 1]?.back;
  return !!back && revealOfDay(ref, back.fromDay) <= limit;
}

/** Un retour : le jour où il a eu lieu, la tribu, et quand le montrer. */
export interface Comeback {
  /** L'épisode à partir duquel le montrer — prudent quand il est estimé. */
  readonly episodeNumber: number;
  /** Vrai si cet épisode vient d'un jour de conseil CONNU, pas d'un repli. */
  readonly episodeKnown: boolean;
  readonly team: Team | null;
  readonly fromDay: number | null;
}

/**
 * Les RETOURS prouvés d'un candidat, dans l'ordre.
 *
 * Ils ne dépendent pas de la limite : l'écran montre chacun derrière sa garde
 * anti-spoiler. Charlotte en a un (Taboga, jour 9), entre ses sorties des
 * épisodes 3 et 5 ; Joana, battue à l'arène après sa sortie, aucun.
 */
export function comebacksOf(
  ref: Referential,
  contestant: Contestant
): Comeback[] {
  return (provenReturns(ref, contestant) ?? []).flatMap(({ back }) => {
    if (!back) return [];
    const { teamId, fromDay } = back;
    const known = fromDay === null ? null : episodeOfDay(ref, fromDay);
    return [
      {
        episodeNumber: known ?? revealOfDay(ref, fromDay),
        episodeKnown: known !== null,
        team: ref.teams.find(t => t.id === teamId) ?? null,
        fromDay,
      },
    ];
  });
}

/**
 * Combien de tribus différentes se montrent à cette limite.
 *
 * Sert à dire quand une édition a changé de forme : All Stars joue en duos
 * dans une tribu unique jusqu'au jour 9, puis en deux tribus. Avant l'épisode
 * 4, on n'en voit qu'une ; à partir de lui, trois — la tribu unique des
 * premiers sortis, Taboga et Sebako.
 */
export function tribesSeenAt(ref: Referential, limit: number): number {
  const seen = new Set<string>();
  for (const c of ref.contestants) {
    for (const s of visibleStints(ref, c, limit)) seen.add(s.teamId);
  }
  return seen.size;
}

/**
 * Le nom de la couleur d'une tribu — « jaune », « rouge » —, ou `null`.
 *
 * CALCULÉ, PAS LU : la source donne la pastille (`#fee347`) et dit en prose,
 * sous son tableau, « la tribu jaune ». On ne lit pas la prose ; on nomme la
 * teinte, accordée à « tribu ». Un gris, un blanc ou un noir n'est pas une
 * couleur de tribu — c'est celle de la tribu réunifiée, ou d'un statut — et
 * ne reçoit pas de nom.
 */
export function colourName(hex: string | null): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/.test(hex)) return null;
  const channel = (at: number) =>
    Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return null;
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.25) return null;

  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;

  if (hue < 15 || hue >= 345) return 'rouge';
  if (hue < 40) return 'orange';
  if (hue < 70) return 'jaune';
  if (hue < 170) return 'verte';
  if (hue < 255) return 'bleue';
  if (hue < 290) return 'violette';
  return 'rose';
}
