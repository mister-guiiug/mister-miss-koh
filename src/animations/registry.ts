/**
 * Le registre des animations : un RÔLE côté application, un fichier côté
 * assets — et rien qui les couple.
 *
 * DEUX RÔLES ONT LEUR FICHIER depuis le 13/10/2026 : `app-start` (le soleil
 * qui se lève) et `torch-out` (la braise qui s'éteint). Ils sont écrits par du
 * code (`scripts/rive/animations.mjs`), un par thème — `{theme}` dans `src`
 * vaut `clair` ou `sombre`. Les autres rôles déclarent `src: null`, et
 * `AppAnimation` rend le repli statique. Aucun écran ne connaît un nom de
 * fichier : il se renseigne ici et nulle part ailleurs.
 *
 * Les entrées de state machine attendues sont documentées par rôle, pour que
 * l'animateur sache quoi exposer. Elles sont indicatives tant qu'aucun asset
 * ne les porte — une entrée absente ne fait rien planter, le runtime l'ignore.
 */
export type AnimationRole =
  | 'app-start'
  | 'referential-loading'
  | 'sync-success'
  | 'sync-failed'
  | 'went-offline'
  | 'back-online'
  | 'favorite-added'
  | 'note-shared'
  | 'share-revoked'
  | 'season-progress'
  | 'reveal'
  | 'torch-out'
  | 'victory'
  | 'empty'
  | 'recoverable-error';

export interface AnimationSpec {
  /**
   * Chemin du `.riv` sous la base du site (`{theme}` → `clair` | `sombre`),
   * ou `null` tant que l'asset n'existe pas.
   */
  readonly src: string | null;
  readonly stateMachine: string;
  /** Entrées attendues — indicatives tant qu'aucun asset ne les porte. */
  readonly inputs: readonly string[];
  /** Décorative (`aria-hidden`) ou porteuse de sens (libellé lu). */
  readonly ariaLabel: string | null;
  /** Ce que le repli statique doit dire, quand il dit quelque chose. */
  readonly fallbackText: string | null;
}

const decorative = (inputs: readonly string[] = []): AnimationSpec => ({
  src: null,
  stateMachine: 'main',
  inputs,
  ariaLabel: null,
  fallbackText: null,
});

export const ANIMATIONS: Readonly<Record<AnimationRole, AnimationSpec>> = {
  'app-start': {
    ...decorative(['loading']),
    // State machine `main` : le lever (une fois) et la respiration des
    // rayons (en boucle), deux couches parallèles.
    src: 'animations/lever-{theme}.riv',
  },
  'referential-loading': decorative(['progress']),
  'sync-success': { ...decorative(['success']), fallbackText: 'Synchronisé' },
  'sync-failed': {
    ...decorative(['error']),
    fallbackText: 'Échec de la synchronisation',
  },
  'went-offline': {
    ...decorative(['offline']),
    fallbackText: 'Hors connexion',
  },
  'back-online': {
    ...decorative(['offline']),
    fallbackText: 'De retour en ligne',
  },
  'favorite-added': decorative(['selected']),
  'note-shared': decorative(['success']),
  'share-revoked': decorative(['success']),
  'season-progress': decorative(['progress']),
  reveal: decorative(['progress', 'reducedMotion']),
  // Création ORIGINALE attendue : une torche abstraite qui s'éteint. Elle ne
  // doit reproduire aucune animation de l'émission.
  'torch-out': {
    ...decorative(['progress', 'reducedMotion']),
    src: 'animations/braise-{theme}.riv',
    fallbackText: 'Départ',
  },
  victory: {
    ...decorative(['success', 'reducedMotion']),
    fallbackText: 'Victoire',
  },
  empty: decorative(),
  'recoverable-error': {
    ...decorative(['error']),
    fallbackText: 'Une erreur est survenue',
  },
};
