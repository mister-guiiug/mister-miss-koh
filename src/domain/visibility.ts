/**
 * Qui peut lire quoi — le vocabulaire, en un seul endroit.
 *
 * UNE SEULE ÉCHELLE POUR DEUX OBJETS. Le schéma range les notes ET les profils
 * sur le même type `visibility_level` : `private`, `link`, `public`. Les libellés
 * suivent donc la même échelle, et ce module est le seul endroit où l'on
 * traduit une valeur de la base en une phrase pour l'écran.
 *
 * MAIS LES DEUX N'OFFRENT PAS LES MÊMES CHOIX. Une note se donne à une personne
 * (« par lien ») ou au monde. Un profil, lui, n'a pas de niveau intermédiaire
 * ici : son adresse EST son identifiant public, et la partager ne demande aucun
 * jeton. Le serveur sait faire un profil « par lien » (`get_shared_profile`,
 * portée `profile` de `share_links`) ; l'application ne s'en sert pas, et le
 * README dit pourquoi plutôt que d'afficher un choix qui n'ajouterait rien.
 */

/** Les trois valeurs de `visibility_level`, dans l'ordre d'ouverture. */
export type Visibility = 'private' | 'link' | 'public';

export interface VisibilityOption {
  readonly value: Visibility;
  readonly label: string;
  /** Ce que ce choix engage, en une phrase. */
  readonly hint: string;
}

export const NOTE_VISIBILITIES: readonly VisibilityOption[] = [
  {
    value: 'private',
    label: 'Moi seul·e',
    hint: 'Personne d’autre ne la lit — pas même un administrateur.',
  },
  {
    value: 'link',
    label: 'Qui a le lien',
    hint: 'Lisible par qui obtient l’adresse, sans compte. Révocable à tout moment.',
  },
  {
    value: 'public',
    label: 'Tout le monde',
    hint: 'Lisible par n’importe qui, et affichée sur votre profil public.',
  },
];

export const PROFILE_VISIBILITIES: readonly VisibilityOption[] = [
  {
    value: 'private',
    label: 'Privé',
    hint: 'Votre pseudonyme ne signe que les notes que vous partagez.',
  },
  {
    value: 'public',
    label: 'Public',
    hint: 'Votre profil s’ouvre à son adresse, pour n’importe qui.',
  },
];

/** Le libellé d'une valeur, ou la valeur elle-même si elle est inattendue. */
export function visibilityLabel(
  options: readonly VisibilityOption[],
  value: Visibility
): string {
  return options.find(o => o.value === value)?.label ?? value;
}

/**
 * Un profil ne devient public qu'avec une ADRESSE.
 *
 * L'écran public se rejoint par `#/profil/<identifiant>` : sans identifiant, il
 * n'y a pas d'adresse, donc pas de page — un profil « public » injoignable
 * serait un réglage qui ment.
 */
export function canBePublic(handle: string | null): boolean {
  return handle !== null && handle !== '';
}
