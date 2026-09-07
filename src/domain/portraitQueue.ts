/**
 * Confier TOUS les portraits, cinq à la fois.
 *
 * LE SERVEUR N'EN TOLÈRE QUE CINQ ACTIFS, et il fait glisser : un sixième
 * n'est pas refusé, il chasse le plus ancien (migration 0022). C'est
 * exactement ce qu'il ne faut pas ici — chasser un lien qu'on vient de donner
 * à quelqu'un le rendrait mort sans prévenir. La file ne crée donc JAMAIS
 * au-delà de ce que le serveur peut porter : elle compte les liens vivants et
 * ne remplit que les places libres.
 *
 * CE QUI FAIT AVANCER LA FILE, C'EST LA CONSOMMATION. Un partage disparaît de
 * la table dès qu'il est ouvert — il n'est pas marqué, il est supprimé. Le
 * lien suivant part donc quand une place se libère, et une place ne se libère
 * que parce que quelqu'un a ouvert la photo précédente (ou qu'un jour a
 * passé). Rien à surveiller côté serveur : il suffit de recompter.
 *
 * TOUT EST PUR ICI. Le composant lit le serveur et écrit le magasin ; ce
 * module ne fait que décider.
 */
import type { Referential } from './referential';

/** Ce que le serveur porte au plus, par compte (migration 0022). */
export const PARALLELE_MAX = 5;

/**
 * Les candidats à mettre en file : ceux dont on a un portrait, dans l'ordre du
 * référentiel, moins ceux qui ont déjà un lien vivant.
 *
 * L'ORDRE DU RÉFÉRENTIEL, PAS CELUI DU DÉPÔT. Les portraits sont rangés dans
 * IndexedDB au fil des dépôts ; les proposer dans cet ordre-là donnerait une
 * suite qui n'a de sens pour personne.
 */
export function fileDesPortraits(
  ref: Referential,
  avecPortrait: readonly string[],
  dejaActifs: readonly string[]
): string[] {
  const disponibles = new Set(avecPortrait);
  const actifs = new Set(dejaActifs);
  return ref.contestants
    .map(c => c.id)
    .filter(id => disponibles.has(id) && !actifs.has(id));
}

/**
 * Combien de liens partir maintenant, et pour qui.
 *
 * Rend les identifiants dans l'ordre de la file, au plus le nombre de places
 * libres. Une file plus longue que les places attend — c'est le principe.
 */
export function prochainsAConfier(
  file: readonly string[],
  actifs: number,
  max = PARALLELE_MAX
): string[] {
  const libres = Math.max(0, max - actifs);
  return file.slice(0, libres);
}

/**
 * La file, débarrassée de ce qui a été confié ou n'a plus de portrait.
 *
 * Un portrait retiré de l'appareil pendant que sa place attendait ne doit pas
 * bloquer la file derrière lui.
 */
export function fileNettoyee(
  file: readonly string[],
  confies: readonly string[],
  avecPortrait: readonly string[]
): string[] {
  const partis = new Set(confies);
  const disponibles = new Set(avecPortrait);
  return file.filter(id => !partis.has(id) && disponibles.has(id));
}
