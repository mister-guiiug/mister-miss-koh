/**
 * Ce sur quoi une note peut porter, nommé et atteignable.
 *
 * DEUX ÉCRANS EN ONT BESOIN, ET PAS LES MÊMES DONNÉES. L'écran Notes propose
 * ces cibles dans un menu et nomme celles de ses notes ; l'écran d'un partage,
 * lui, reçoit des identifiants sans rien d'autre et doit les nommer aussi —
 * parfois depuis un référentiel de démonstration qui ne les contient pas. La
 * dérivation vivait dans l'écran Notes : elle vit ici, avec ses tests.
 *
 * UNE CIBLE INCONNUE N'EST PAS UNE ERREUR. Une note peut viser une ligne
 * retirée du référentiel entre-temps, ou un lecteur de passage peut ouvrir un
 * partage alors que l'application tourne sur la démonstration. On rend `null`,
 * et l'écran dit ce qu'il sait — jamais un nom inventé.
 */
import type { NoteTarget } from '../backend/notes';
import type { Referential } from './referential';

export const NOTE_GROUPS = ['Saison', 'Candidats', 'Épisodes'] as const;
export type NoteGroup = (typeof NOTE_GROUPS)[number];

export interface NoteChoice {
  readonly target: NoteTarget;
  readonly id: string;
  readonly label: string;
  readonly group: NoteGroup;
  /** Où va-t-on pour voir la chose elle-même. */
  readonly href: string;
}

/**
 * Les cibles qu'on sait proposer — trois natures sur les sept du schéma.
 *
 * Les quatre autres (tribu, épreuve, conseil, départ) sont écrivables par le
 * serveur mais n'ont pas d'écran à elles : les proposer mènerait à des notes
 * qu'aucun lien ne peut rejoindre.
 */
export function noteChoices(referential: Referential | null): NoteChoice[] {
  if (!referential) return [];
  return [
    {
      target: 'season',
      id: referential.season.id,
      label: referential.season.name,
      group: 'Saison',
      href: '/',
    },
    ...referential.contestants.map(c => ({
      target: 'season_contestant' as const,
      id: c.id,
      label: c.displayName,
      group: 'Candidats' as const,
      href: `/candidats/${c.id}`,
    })),
    ...referential.episodes.map(e => ({
      target: 'episode' as const,
      id: e.id,
      label: `Épisode ${e.number}`,
      group: 'Épisodes' as const,
      href: '/episodes',
    })),
  ];
}

/** La cible d'une note parmi les choix, ou `null` si le référentiel l'ignore. */
export function findChoice(
  choices: readonly NoteChoice[],
  target: NoteTarget,
  id: string
): NoteChoice | null {
  return choices.find(c => c.target === target && c.id === id) ?? null;
}

/** Un nom à afficher, toujours — même quand la cible est introuvable. */
export function labelOf(
  choices: readonly NoteChoice[],
  target: NoteTarget,
  id: string
): string {
  return findChoice(choices, target, id)?.label ?? 'Cible inconnue';
}
