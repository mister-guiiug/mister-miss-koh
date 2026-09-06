/**
 * Un retour au doigt, quand l'appareil sait le donner (Android ; jamais iOS,
 * et le socle le vérifie avant de vibrer). Sans son : une app de suivi n'a
 * rien à dire à voix haute.
 *
 * Branché sur le réglage « Animations » : qui coupe les ornements coupe aussi
 * la vibration — c'est le même geste, ressenti au lieu d'être vu.
 */
import {
  useFeedback,
  type FeedbackSpec,
} from '@mister-guiiug/dev-pwa-config/react/use-feedback';
import { useAppStore } from '../store/useAppStore';

const EVENTS = {
  /** Un épisode marqué vu. */
  seen: { vibration: 'tap' },
  /** Un candidat ajouté aux favoris. */
  favorite: { vibration: 'confirm' },
  /** Le référentiel rechargé d'un tirer-pour-rafraîchir. */
  refreshed: { vibration: 'success' },
} as const satisfies Record<string, FeedbackSpec>;

export type HapticEvent = keyof typeof EVENTS;

export function useHaptics(): (event: HapticEvent) => void {
  const animations = useAppStore(s => s.animations);
  return useFeedback<HapticEvent>(EVENTS, {
    sound: false,
    haptic: animations,
  });
}
