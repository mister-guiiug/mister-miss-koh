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
import { useReducedMotion } from '@mister-guiiug/dev-pwa-config/react/use-media-query';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { useAppStore } from '../store/useAppStore';
import { ANIMATIONS, type AnimationRole } from './registry';
import { MARKS } from './marks';
import { attendre } from './riveSignal';

/** Le moteur et son chargeur, à la première animation seulement. */
const chargerRive = () => import('./riveLite').then(m => m.chargerRive());

/**
 * Le temps laissé à Rive pour arriver. Au-delà, la marque prend la place pour
 * cette fois ; le moteur, lui, finit de se charger et reste en cache — la
 * visite suivante l'aura tout de suite.
 */
const DELAI_RIVE_MS = 1500;

/** L'utilisateur a demandé d'économiser les données : pas de moteur Rive. */
function economieDeDonnees(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return c?.saveData === true;
}

const RiveAnimation = lazy(() =>
  import('@mister-guiiug/dev-pwa-config/react/rive').then(m => ({
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

  /**
   * LE REPLI MONTRE QUELQUE CHOSE, désormais.
   *
   * Il rendait un `<span>` vide pour tout rôle sans texte : l'application
   * réservait la place d'un dessin et n'en affichait aucun, puisque aucun
   * `.riv` n'existe. Une marque maison (`./marks`) occupe cette place, et le
   * texte du registre reste à côté pour le lecteur d'écran — le dessin, lui,
   * est `aria-hidden`, sans quoi le sens serait annoncé deux fois.
   */
  const mark = MARKS[name];
  const staticFallback = fallback ?? (
    <>
      {mark}
      {spec.fallbackText && (
        <span className="sr-only">{spec.fallbackText}</span>
      )}
    </>
  );

  // Un fichier par thème : les couleurs d'un `.riv` sont figées.
  const theme = useThemeContext()?.resolved === 'light' ? 'clair' : 'sombre';
  const src = spec.src
    ? `${import.meta.env.BASE_URL}${spec.src.replace('{theme}', theme)}`
    : null;

  // Rive prêt, en retard, ou en échec : seul ce dernier rend la marque.
  const [etat, setEtat] = useState<'attente' | 'pret' | 'echec'>('attente');
  const wantsMotion =
    animations && !reduceMotion && !systemReduced && !economieDeDonnees();
  const avecRive = src !== null && wantsMotion;

  // Le délai court à partir du moment où l'animation est VISIBLE : c'est là
  // que le moteur commence à charger.
  useEffect(() => {
    if (!avecRive || !src || !visible) return;
    const fin = attendre(src, pret =>
      setEtat(e => (e === 'attente' ? (pret ? 'pret' : 'echec') : e))
    );
    const garde = window.setTimeout(
      () => setEtat(e => (e === 'attente' ? 'echec' : e)),
      DELAI_RIVE_MS
    );
    return () => {
      fin();
      window.clearTimeout(garde);
    };
  }, [avecRive, src, visible]);

  // Rien à animer, personne ne veut d'animation, ou Rive n'est pas venu : le
  // repli, sans runtime.
  if (!avecRive || etat === 'echec') {
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

  /**
   * PENDANT QUE RIVE ARRIVE, UNE PLACE VIDE — pas la marque. La marque a son
   * propre lever ; la montrer puis la remplacer ferait se lever le soleil deux
   * fois. La place garde la taille du dessin : rien ne bouge autour.
   */
  const attente = <span className="anim-attente" aria-hidden="true" />;

  return (
    <div ref={ref} className={className} data-animation={name} data-rive={etat}>
      {visible ? (
        <Suspense fallback={attente}>
          {/* `key` : un changement de thème change de fichier, et le
              composant Rive ne recharge pas un `src` qui change. */}
          <RiveAnimation
            key={src}
            src={src}
            stateMachines={spec.stateMachine}
            ariaLabel={spec.ariaLabel ?? undefined}
            fallback={attente}
            loader={chargerRive}
            onError={() => setEtat('echec')}
          />
        </Suspense>
      ) : (
        attente
      )}
      {spec.fallbackText && (
        <span className="sr-only">{spec.fallbackText}</span>
      )}
    </div>
  );
}
