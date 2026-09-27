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
/**
 * Encre lisible sur une couleur de tribu. Une teinte claire (jaune) prend
 * l'encre sombre ; une teinte foncée, le blanc.
 */
export function inkOn(colour: string): string {
  const hex = colour.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#1c1917';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? '#1c1917' : '#fffaf3';
}

export function initialsOf(displayName: string): string {
  const parts = displayName.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map(p => [...p][0] ?? '')
    .join('')
    .toLocaleUpperCase('fr');
}
