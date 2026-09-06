/**
 * Le pseudonyme et l'identifiant public — deux choses, et le schéma le dit.
 *
 * LE PSEUDONYME EST UN LIBELLÉ. Deux personnes ont le droit de s'appeler
 * « Tarzan » : l'unicité globale sur un nom d'affichage transformerait chaque
 * inscription en course au nom. C'est l'IDENTIFIANT PUBLIC qui sert d'adresse —
 * unique, réservable, et d'une forme stricte parce qu'il finira dans une URL.
 *
 * CES RÈGLES SONT CELLES DE LA BASE, RECOPIÉES ICI POUR LE DIRE AVANT. Les
 * contraintes de `profiles` (0003) refusent déjà tout ce qui suit ; sans cette
 * copie, l'utilisateur l'apprendrait par un message technique de PostgreSQL
 * après avoir tout saisi. Toute divergence entre ces deux jeux de règles est un
 * défaut : la base reste l'arbitre, ce module n'est là que pour l'anticiper.
 *
 * `handle_is_available` du serveur répond, elle, à la question que ce module ne
 * PEUT pas trancher : « quelqu'un l'a-t-il déjà pris, ou est-il réservé ? »
 */
import { slugify } from '@mister-guiiug/dev-pwa-config/format';

export const PSEUDONYM_MIN = 2;
export const PSEUDONYM_MAX = 32;

/**
 * Trois à trente-deux caractères, minuscules, chiffres et tirets, ne commençant
 * ni ne finissant par un tiret. Recopiée telle quelle de la contrainte `check`
 * de `profiles.public_handle`.
 */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;

/** `profiles.bio` : deux cent quatre-vingts caractères, pas un de plus. */
export const BIO_MAX = 280;

/** Ce qui cloche, en une phrase — ou `null` si tout va bien. */
export function checkPseudonym(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < PSEUDONYM_MIN) {
    return `Un pseudonyme fait au moins ${PSEUDONYM_MIN} caractères.`;
  }
  if (trimmed.length > PSEUDONYM_MAX) {
    return `Un pseudonyme fait au plus ${PSEUDONYM_MAX} caractères.`;
  }
  return null;
}

/**
 * L'identifiant public est FACULTATIF : une chaîne vide veut dire « je n'en
 * veux pas », et non « celui-ci est invalide ».
 */
export function checkHandle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length < HANDLE_MIN || trimmed.length > HANDLE_MAX) {
    return `Un identifiant fait entre ${HANDLE_MIN} et ${HANDLE_MAX} caractères.`;
  }
  if (!HANDLE_PATTERN.test(trimmed)) {
    return 'Minuscules, chiffres et tirets seulement, et jamais un tiret au bord.';
  }
  return null;
}

/**
 * Une proposition d'identifiant à partir du pseudonyme.
 *
 * Proposée, jamais imposée : c'est une adresse, et on choisit son adresse.
 * Rend `''` quand il ne reste pas de quoi en faire une — mieux vaut ne rien
 * proposer que proposer quelque chose que le serveur refusera.
 */
export function suggestHandle(pseudonym: string): string {
  const slug = slugify(pseudonym).slice(0, HANDLE_MAX);
  // `slugify` peut laisser un tiret au bord, que la contrainte refuse.
  const trimmed = slug.replace(/^-+/, '').replace(/-+$/, '');
  return HANDLE_PATTERN.test(trimmed) ? trimmed : '';
}

/** Comment on nomme l'auteur d'un partage, quand on ne sait pas tout. */
export function attribution(
  pseudonym: string | null,
  handle: string | null
): string {
  if (!pseudonym) return 'quelqu’un qui n’a pas choisi de pseudonyme';
  return handle ? `${pseudonym} (@${handle})` : pseudonym;
}
