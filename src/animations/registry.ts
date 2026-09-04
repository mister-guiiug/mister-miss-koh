/**
 * Le registre des animations : un RÔLE côté application, un fichier côté
 * assets — et rien qui les couple.
 *
 * AUCUN FICHIER `.riv` N'EST FOURNI À CE JOUR. Chaque entrée déclare donc
 * `src: null`, et `AppAnimation` rend le repli statique. Le jour où un fichier
 * arrive, on renseigne `src` ici et nulle part ailleurs ; aucun écran ne
 * connaît un nom de fichier.
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
  /** Chemin public du `.riv`, ou `null` tant que l'asset n'existe pas. */
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
  'app-start': decorative(['loading']),
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
