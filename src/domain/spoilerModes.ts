/**
 * Les trois réglages anti-spoiler, dits une fois.
 *
 * Ils vivaient dans l'écran des Réglages. Ils se choisissent désormais aussi
 * depuis l'écran des Épisodes — là où l'on s'en sert — et depuis la première
 * ouverture : trois endroits, un seul texte.
 */
import type { SpoilerMode } from './spoiler';

export interface SpoilerOption {
  readonly value: SpoilerMode;
  readonly label: string;
  readonly hint: string;
}

export const SPOILER_OPTIONS: readonly SpoilerOption[] = [
  {
    value: 'hide_unwatched',
    label: 'Masquer ce que je n’ai pas vu',
    hint: 'Le plus sûr : seuls les épisodes cochés « vu » sont révélés.',
  },
  {
    value: 'hide_future',
    label: 'Masquer les épisodes du jour et à venir',
    hint: 'Tout ce qui est diffusé avant aujourd’hui est visible.',
  },
  { value: 'reveal_all', label: 'Tout voir', hint: 'Aucun masquage.' },
];

export interface SpoilerStatus {
  /** Ce que dit la pastille, d'un coup d'œil. */
  readonly label: string;
  /** `warning` : plus rien n'est protégé, et cela doit se voir. */
  readonly tone: 'info' | 'warning';
}

/** L'état de l'anti-spoiler en quelques mots, pour la pastille des Épisodes. */
export function spoilerStatus(
  mode: SpoilerMode,
  lastWatched: number
): SpoilerStatus {
  switch (mode) {
    case 'hide_unwatched':
      return {
        label:
          lastWatched === 0
            ? 'Anti-spoiler · rien de vu'
            : `Anti-spoiler · vu jusqu’à l’ép. ${lastWatched}`,
        tone: 'info',
      };
    case 'hide_future':
      return { label: 'Anti-spoiler · jusqu’à la veille', tone: 'info' };
    case 'reveal_all':
      return { label: 'Tout voir · aucun masquage', tone: 'warning' };
  }
}
