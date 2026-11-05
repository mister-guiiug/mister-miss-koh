/**
 * Les notes demandent le réseau — et l'écran doit le DIRE avant le geste.
 *
 * Une note vit sur le serveur et nulle part ailleurs (voir `NotesScreen`) :
 * hors connexion, l'écrire, la corriger, la supprimer ou la partager échoue
 * forcément. Avant ce garde, le geste partait quand même et l'échec revenait
 * en notification brute — « création : aucune session » quand la session ne
 * pouvait pas être relue, le texte d'une exception de navigateur sinon. Ni
 * l'un ni l'autre ne dit au lecteur ce qui se passe.
 *
 * LE GARDE DU SOCLE (`useActionGuard`) bloque le bouton en le laissant
 * focusable (`aria-disabled`) et rend le motif à afficher, comme sur les
 * autres écrans du parc qui exigent le réseau.
 *
 * PAS DE FILE D'ATTENTE ICI. Mettre les notes en file est un autre chantier
 * (audit hors ligne du 05/11/2026, recommandation 9) ; en attendant, dire la
 * vérité vaut mieux que promettre un envoi qui n'aura pas lieu.
 */
import { useActionGuard } from '@mister-guiiug/dev-pwa-config/react/use-action-guard';

/** Le motif affiché partout où une note ne peut pas partir. */
export const NOTES_OFFLINE = 'Les notes demandent une connexion.';

/**
 * Les messages d'un `fetch` qui n'a pas trouvé le réseau, selon le moteur :
 * Chrome, Firefox, Safari, React Native. Volontairement ÉTROIT : un refus du
 * serveur (quota de liens, session expirée) n'est pas une coupure, et doit
 * garder son propre message.
 */
const NO_NETWORK =
  /failed to fetch|networkerror|load failed|network request failed/i;

export function useNotesGuard() {
  return useActionGuard({ online: true, offlineMessage: NOTES_OFFLINE });
}

/**
 * Le message d'un geste sur une note qui a échoué.
 *
 * Le garde ne couvre pas tout : le réseau peut tomber PENDANT l'envoi, et
 * `navigator.onLine` reste vrai derrière un portail captif. Dans les deux cas
 * l'échec est une coupure, et il se dit avec les mêmes mots que le garde ;
 * tout autre refus garde le message du serveur.
 */
export function notesFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const offline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline || NO_NETWORK.test(message) ? NOTES_OFFLINE : message;
}
