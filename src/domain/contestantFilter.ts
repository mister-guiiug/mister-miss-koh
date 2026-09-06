/**
 * Le filtre de la liste des candidats — et pourquoi il vaut « En jeu ».
 *
 * SUR UNE SAISON QUI COURT, CE QU'ON VIENT VOIR C'EST QUI RESTE. « Tous »
 * mélangeait dix-huit noms dont la moitié sont sortis, et il fallait le
 * reprendre à chaque visite. Le défaut suit donc l'usage, et le choix est
 * RETENU : il vit dans les données personnelles, sur l'appareil, comme les
 * favoris et les épisodes vus.
 *
 * CE DÉFAUT NE RÉVÈLE RIEN. « En jeu » se calcule à la limite anti-spoiler,
 * pas à la fin de la saison : quelqu'un qui n'a vu qu'un épisode voit encore
 * tout le monde en jeu, et c'est bien ce qu'il doit voir.
 *
 * SUR UNE SAISON TERMINÉE, en revanche, ce défaut ne laisse que le vainqueur —
 * conséquence assumée du réglage demandé. L'écran vide le dit alors en nommant
 * le filtre, pour qu'on sache quoi toucher.
 */
export const CONTESTANT_FILTERS = ['tous', 'en-jeu', 'sorti'] as const;

export type ContestantFilter = (typeof CONTESTANT_FILTERS)[number];

/** Le défaut, appliqué aussi aux magasins écrits avant l'existence du champ. */
export const DEFAULT_CONTESTANT_FILTER: ContestantFilter = 'en-jeu';

export const CONTESTANT_FILTER_OPTIONS: readonly {
  value: ContestantFilter;
  label: string;
}[] = [
  { value: 'tous', label: 'Tous' },
  { value: 'en-jeu', label: 'En jeu' },
  { value: 'sorti', label: 'Sorti·e' },
];

/** Le libellé d'un filtre, pour le nommer dans une phrase. */
export function filterLabel(filter: ContestantFilter): string {
  return (
    CONTESTANT_FILTER_OPTIONS.find(o => o.value === filter)?.label ?? filter
  );
}

/** Ce candidat passe-t-il le filtre ? `inGame` se juge à la limite, pas à la fin. */
export function matchesFilter(
  filter: ContestantFilter,
  inGame: boolean
): boolean {
  if (filter === 'tous') return true;
  return filter === 'en-jeu' ? inGame : !inGame;
}
