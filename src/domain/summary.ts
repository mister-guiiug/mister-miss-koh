/**
 * Les chiffres de l'accueil.
 *
 * UNE TUILE QUI NE DIT QU'UN NOM EST UN BOUTON. Ce qui justifie une tuile,
 * c'est le chiffre qu'elle porte : « 12 en jeu sur 18 » apprend quelque chose,
 * « Candidats » non — et la barre basse mène déjà aux mêmes écrans. Cette
 * dérivation est donc le cœur de l'accueil, pas sa décoration, et elle vit ici
 * pour être éprouvée sans monter un écran.
 *
 * L'ANTI-SPOILER S'APPLIQUE ICI AUSSI, et c'est le seul endroit où l'oubli
 * serait invisible : l'accueil est la première chose qu'on voit. « 5 en jeu »
 * sur une saison qu'on n'a regardée que jusqu'à l'épisode 2 annoncerait treize
 * départs d'un coup. Le compte se fait donc à la limite, exactement comme la
 * liste des candidats — `Math.min(limite, dernier épisode diffusé)`.
 *
 * LES ÉPISODES VUS NE SONT PAS UN SPOILER : c'est l'utilisateur qui les a
 * cochés. Ils se comptent parmi les DIFFUSÉS, sinon un cochage erroné sur un
 * épisode à venir gonflerait le total.
 */
import type { Referential } from './referential';
import { inGame, lastAiredEpisode } from './stats';

export interface HomeFigures {
  /** Candidats de la saison, tous statuts confondus. */
  readonly contestants: number;
  /** Encore en jeu À LA LIMITE anti-spoiler. */
  readonly inGame: number;
  /** Favoris posés, parmi les candidats de cette saison. */
  readonly favorites: number;
  /** Épisodes déjà diffusés. */
  readonly aired: number;
  /** Épisodes diffusés et cochés « vu ». */
  readonly watched: number;
  /** L'épisode jusqu'auquel les comptes ci-dessus sont vrais. */
  readonly upTo: number;
}

export function homeFigures(
  referential: Referential | null,
  favorites: readonly string[],
  watched: readonly number[],
  limit: number
): HomeFigures {
  if (!referential) {
    return {
      contestants: 0,
      inGame: 0,
      favorites: 0,
      aired: 0,
      watched: 0,
      upTo: 0,
    };
  }

  const aired = lastAiredEpisode(referential);
  const upTo = Math.min(limit, aired);
  const known = new Set(referential.contestants.map(c => c.id));

  return {
    contestants: referential.contestants.length,
    inGame: inGame(referential, upTo).length,
    // Un favori posé sur une saison précédente ne compte pas ici : l'écran
    // annonce « sur N candidats », et le rapport doit tenir.
    favorites: favorites.filter(id => known.has(id)).length,
    aired,
    watched: watched.filter(n => n >= 1 && n <= aired).length,
    upTo,
  };
}
