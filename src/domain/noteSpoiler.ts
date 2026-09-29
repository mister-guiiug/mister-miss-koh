/**
 * Jusqu'où une note peut-elle parler ? La question de CELUI QUI LA LIT.
 *
 * Pour son auteur, une note n'est jamais un spoiler : il sait ce qu'il y a
 * écrit, et l'écran Notes la laisse hors du garde. Pour un ami qui ouvre le
 * lien du partage, ou pour le visiteur d'un profil public, c'est l'inverse :
 * « T'as vu ?! Elle est éliminée !! » est exactement le message que
 * l'application promet de tenir à distance, et il arrivait par elle.
 *
 * UNE NOTE PEUT PARLER DE TOUT CE QUI ÉTAIT DIFFUSÉ QUAND ELLE A ÉTÉ ÉCRITE.
 * Sa cible ne suffit pas : une note sur l'épisode 3, modifiée après le 6,
 * peut raconter le retour d'un candidat au 6. On prend donc le plus grand des
 * deux — l'épisode visé, et le dernier diffusé à la date de modification.
 * C'est prudent, pas exact : une note sur un candidat écrite après le 8 sera
 * masquée à qui en est au 7, même si elle ne parle que de son sourire. Le
 * lecteur peut l'afficher quand même ; il ne peut pas « désapprendre ».
 */
import type { NoteTarget } from '../backend/notes';
import type { Referential } from './referential';
import { airedBy } from './spoiler';

export interface NoteDating {
  readonly target: NoteTarget;
  readonly targetId: string;
  /** Horodatage ISO de la dernière modification. */
  readonly updatedAt: string;
}

/**
 * Le plus grand épisode dont la note peut parler ; `null` quand on ne sait
 * pas le dire (pas de référentiel) — le garde masque alors, par prudence.
 */
export function noteRevealEpisode(
  referential: Referential | null,
  note: NoteDating
): number | null {
  if (!referential) return null;
  // La date UTC suffit : une diffusion de soirée en France tombe le même jour
  // en UTC, et une journée d'avance ne ferait que masquer davantage.
  const written = airedBy(referential.episodes, note.updatedAt.slice(0, 10));
  if (note.target !== 'episode') return written;
  const episode = referential.episodes.find(e => e.id === note.targetId);
  return Math.max(written, episode?.number ?? 0);
}
