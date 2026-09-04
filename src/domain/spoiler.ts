/**
 * L'anti-spoiler est une RÈGLE, pas un filtre d'affichage bricolé écran par
 * écran. La saison est en cours : montrer l'éliminé du dernier épisode à
 * quelqu'un qui n'a vu que le deuxième est le défaut le plus facile à
 * commettre et le moins pardonné. Une seule fonction décide de la limite ;
 * tous les écrans lui obéissent.
 */
import type { Episode } from './referential';

export type SpoilerMode = 'reveal_all' | 'hide_unwatched' | 'hide_future';

export interface SpoilerContext {
  readonly mode: SpoilerMode;
  /** Numéros d'épisodes que l'utilisateur a marqués comme vus. */
  readonly watched: ReadonlySet<number>;
  /** Date du jour, ISO `AAAA-MM-JJ`. */
  readonly today: string;
  readonly episodes: readonly Episode[];
}

/**
 * Le plus grand numéro d'épisode dont les événements peuvent s'afficher.
 * `Infinity` = tout ; `0` = rien de ce qui s'est passé en jeu.
 */
export function spoilerLimit(ctx: SpoilerContext): number {
  switch (ctx.mode) {
    case 'reveal_all':
      return Number.POSITIVE_INFINITY;
    case 'hide_unwatched': {
      let max = 0;
      for (const n of ctx.watched) if (n > max) max = n;
      return max;
    }
    case 'hide_future': {
      // Un épisode diffusé AUJOURD'HUI est encore un spoiler pour la moitié
      // des spectateurs : la limite s'arrête à la veille.
      let max = 0;
      for (const e of ctx.episodes) {
        if (e.aired && e.airDate && e.airDate < ctx.today && e.number > max)
          max = e.number;
      }
      return max;
    }
  }
}

/**
 * Un événement rattaché à un épisode inconnu est MASQUÉ dès que la limite est
 * finie : ne pas savoir quand une chose s'est produite n'autorise pas à la
 * montrer à quelqu'un qui n'en est pas là.
 */
export function isSpoiler(
  episodeNumber: number | null,
  limit: number
): boolean {
  if (!Number.isFinite(limit)) return false;
  if (episodeNumber === null) return true;
  return episodeNumber > limit;
}
