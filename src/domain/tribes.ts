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
 * Est-il REVENU après la sortie de l'épisode `exit` ?
 *
 * Un retour n'a pas de ligne à lui : il se lit dans un séjour qui COMMENCE
 * après la sortie — « Sebako (jour 9 – ) » pour Maxime, sorti au conseil du
 * jour 3 — et qui dure encore à la limite. Charlotte revient dans Taboga
 * (jour 9 – 14) après sa sortie de l'épisode 3 : en jeu à l'épisode 4, plus à
 * l'épisode 5, dont le conseil du jour 14 referme son séjour.
 */
export function returnedAfter(
  ref: Referential,
  contestant: Contestant,
  exit: number,
  limit: number
): boolean {
  return contestant.teamStints.some(s => {
    const from = revealOfDay(ref, s.fromDay);
    if (from <= exit || from > limit) return false;
    if (s.toDay === null) return true;
    const end = episodeOfDay(ref, s.toDay);
    return end === null || end > limit;
  });
}

/** Un retour : l'épisode qui le montre, et la tribu où l'on revient. */
export interface Comeback {
  readonly episodeNumber: number;
  readonly team: Team | null;
  readonly fromDay: number | null;
}

/**
 * Les RETOURS d'un candidat, dans l'ordre : après chacune de ses sorties, le
 * premier séjour qui commence ensuite — et avant la sortie suivante.
 *
 * Ils ne dépendent pas de la limite : l'écran les montre chacun derrière sa
 * garde anti-spoiler, à l'épisode qui les révèle. Charlotte en a un (Taboga,
 * épisode 4), entre ses sorties des épisodes 3 et 5 ; Joana, battue à l'arène
 * après sa sortie, aucun.
 */
export function comebacksOf(
  ref: Referential,
  contestant: Contestant
): Comeback[] {
  const exits = [
    ...new Set(
      ref.departures
        .filter(d => d.contestantId === contestant.id)
        .map(d => d.episodeNumber)
        .filter((n): n is number => n !== null)
    ),
  ].sort((a, b) => a - b);
  const stints = contestant.teamStints.map(stint => ({
    stint,
    reveal: revealOfDay(ref, stint.fromDay),
  }));

  const comebacks: Comeback[] = [];
  exits.forEach((exit, index) => {
    const next = exits[index + 1] ?? Number.POSITIVE_INFINITY;
    const back = stints
      .filter(s => s.reveal > exit && s.reveal <= next)
      .sort(
        (a, b) =>
          a.reveal - b.reveal || (a.stint.fromDay ?? 0) - (b.stint.fromDay ?? 0)
      )[0];
    if (!back) return;
    const { teamId, fromDay } = back.stint;
    comebacks.push({
      episodeNumber: back.reveal,
      team: ref.teams.find(t => t.id === teamId) ?? null,
      fromDay,
    });
  });
  return comebacks;
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
