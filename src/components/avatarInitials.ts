/**
 * De quoi dessiner une vignette sans photo : les initiales d'un nom et une
 * teinte stable. Hors du fichier du composant — ce sont des fonctions pures,
 * ce sont elles qu'on teste, et Fast Refresh veut des modules de composants
 * purs.
 */

/** Quatre teintes de la palette maison : terre, feu, océan, jungle. */
export const TINTS = 4;

/** Toujours la même teinte pour le même candidat, sans table à maintenir. */
export function tintOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum = (sum + id.charCodeAt(i)) % 997;
  return sum % TINTS;
}

/**
 * Une lettre, deux si le nom en compte plusieurs (« Jean-Luc » → « JL »).
 *
 * Le découpage passe par `[...mot]` et non `mot[0]` : une lettre hors du plan
 * de base tient sur deux unités de code, et `[0]` en couperait la moitié.
 */
export function initialsOf(displayName: string): string {
  const parts = displayName.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map(p => [...p][0] ?? '')
    .join('')
    .toLocaleUpperCase('fr');
}
