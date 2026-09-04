/**
 * L'unique point d'entrée des animations dans l'interface.
 *
 * Le composant du socle (`react/rive`) fait déjà l'essentiel : chargement
 * paresseux du runtime, `prefers-reduced-motion`, repli garanti si le runtime
 * ou le fichier manque. Ce qui s'ajoute ici :
 *
 *  - le RÔLE remplace le chemin : un écran demande « torch-out », jamais un
 *    fichier ;
 *  - la préférence de l'app (« animations désactivées », « réduire les
 *    mouvements ») s'ajoute à celle du système — l'une OU l'autre suffit à
 *    rendre le repli ;
 *  - une animation hors écran n'est pas montée du tout : `IntersectionObserver`
 *    ne monte le canevas que lorsqu'il devient visible, ce qui borne le nombre
 *    de canevas actifs sans compter à la main.
 */
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useReducedMotion } from '@mister-guiiug/dev-wpa-config/react/use-media-query';
import { useAppStore } from '../store/useAppStore';
import { ANIMATIONS, type AnimationRole } from './registry';

const RiveAnimation = lazy(() =>
  import('@mister-guiiug/dev-wpa-config/react/rive').then(m => ({
    default: m.RiveAnimation,
  }))
);

interface Props {
  name: AnimationRole;
  /** Repli explicite ; sinon celui du registre, sinon rien. */
  fallback?: ReactNode;
  className?: string;
}

export function AppAnimation({ name, fallback, className }: Props) {
  const spec = ANIMATIONS[name];
  const systemReduced = useReducedMotion();
  const animations = useAppStore(s => s.animations);
  const reduceMotion = useAppStore(s => s.reduceMotion);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(e => e.isIntersecting));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const staticFallback = fallback ?? (
    <span className={spec.fallbackText ? 'sr-only' : undefined}>
      {spec.fallbackText}
    </span>
  );

  // Rien à animer, ou personne ne veut d'animation : le repli, sans runtime.
  const wantsMotion = animations && !reduceMotion && !systemReduced;
  if (!spec.src || !wantsMotion) {
    return (
      <div
        ref={ref}
        className={className}
        data-animation={name}
        data-fallback=""
      >
        {staticFallback}
      </div>
    );
  }

  return (
    <div ref={ref} className={className} data-animation={name}>
      {visible ? (
        <Suspense fallback={staticFallback}>
          <RiveAnimation
            src={spec.src}
            stateMachines={spec.stateMachine}
            ariaLabel={spec.ariaLabel ?? undefined}
            fallback={staticFallback}
          />
        </Suspense>
      ) : (
        staticFallback
      )}
    </div>
  );
}
