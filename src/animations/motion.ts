/**
 * Le NIVEAU de mouvement de l'interface, dérivé des deux réglages de l'app.
 *
 * Les deux cases des Réglages ne pilotaient que le composant Rive — et aucun
 * fichier `.riv` n'existe : elles ne changeaient rien de visible. Le mouvement
 * de l'interface est en CSS ; il lui faut un point d'appui dans le DOM. UN SEUL
 * attribut, `data-motion` sur `<html>`, et chaque règle CSS s'y réfère :
 *
 *  - `full`      : tout — entrées d'écran, éclat de l'étoile, flamme, retours
 *                  d'état ;
 *  - `essential` : « Animations » décochée — plus rien de décoratif, mais une
 *                  case qui se coche et un bouton qui s'enfonce répondent
 *                  encore : c'est un retour d'état, pas un ornement ;
 *  - `none`      : « Réduire les mouvements » cochée — aucun déplacement, même
 *                  bref.
 *
 * Le réglage SYSTÈME (`prefers-reduced-motion`) n'entre pas ici : il garde sa
 * règle propre en CSS et gagne toujours, même sur `full`.
 */
import { useLayoutEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export type MotionLevel = 'full' | 'essential' | 'none';

export function motionLevel(
  animations: boolean,
  reduceMotion: boolean
): MotionLevel {
  if (reduceMotion) return 'none';
  return animations ? 'full' : 'essential';
}

/**
 * Pose `data-motion` sur `<html>` et le suit. `useLayoutEffect` : avant la
 * première peinture, sinon l'écran d'attente ferait son entrée en mouvement
 * chez quelqu'un qui a demandé l'inverse.
 */
export function useMotionLevel(): MotionLevel {
  const animations = useAppStore(s => s.animations);
  const reduceMotion = useAppStore(s => s.reduceMotion);
  const level = motionLevel(animations, reduceMotion);

  useLayoutEffect(() => {
    document.documentElement.dataset.motion = level;
  }, [level]);

  return level;
}
