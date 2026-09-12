/**
 * Les marques de l'application : un petit dessin par RÔLE d'animation.
 *
 * POURQUOI ELLES EXISTENT. Le registre déclare quinze rôles et `AppAnimation`
 * sait déjà les servir ; mais tous ont `src: null`, aucun fichier `.riv`
 * n'existe, et le repli rendait donc un `<span>` vide. L'application affichait
 * littéralement rien à l'endroit où elle avait prévu de montrer quelque chose :
 * un état vide sans dessin, une panne sans signe, un accueil sans rien.
 *
 * CE SONT DES REPLIS, PAS UN REMPLACEMENT DE RIVE. Le jour où un `.riv`
 * arrive, on renseigne son `src` dans le registre et il prend la place sans
 * qu'aucun écran ne change. En attendant, ces marques coûtent ce que pèsent
 * quelques chemins SVG — là où le seul runtime de Rive pèse 58 ko gzip, qu'il
 * faudrait alors télécharger.
 *
 * ELLES SONT ORIGINALES, et il le faut : rien de l'émission n'est reproduit,
 * ni totem, ni logo, ni silhouette. Ce sont des formes géométriques tirées de
 * la palette — un soleil sur l'eau, des arcs, une coche, une braise qui
 * s'éteint.
 *
 * ELLES SONT DÉCORATIVES. `aria-hidden` sans exception : le sens est porté par
 * le texte que `AppAnimation` rend à côté (`fallbackText` du registre) ou par
 * le titre de l'état vide qui les entoure. Un dessin qui répéterait ce mot
 * ferait dire deux fois la même chose.
 *
 * LE MOUVEMENT EST EN CSS, dans `styles.css`, et obéit donc aux trois niveaux
 * de `data-motion` comme le reste. Aucune animation n'est écrite ici : ce
 * fichier ne fournit que la géométrie et les classes.
 *
 * CE FICHIER N'EXPORTE AUCUN COMPOSANT, ET C'EST VOULU. Une enveloppe `<Mark>`
 * aurait été plus jolie à lire, mais elle aurait fait de ce module un mélange
 * de composant et de données — ce que Fast Refresh refuse de recharger
 * proprement, et ESLint le signale. `marque()` est une fabrique : elle rend un
 * élément, elle n'est jamais montée.
 */
import type { ReactElement, ReactNode } from 'react';
import type { AnimationRole } from './registry';

/** Tout le monde partage la même grille et le même contrat d'accessibilité. */
const marque = (className: string, children: ReactNode): ReactElement => (
  <svg
    className={`mark ${className}`}
    viewBox="0 0 48 48"
    width="48"
    height="48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

/**
 * Le lever — l'écran d'accueil, et le démarrage.
 *
 * Un demi-disque plein qui monte derrière deux traits d'eau, et cinq rayons
 * qui respirent. C'est la même grammaire que la marque de l'application : une
 * masse chaude et des traits froids.
 */
const LEVER = marque(
  'mark-lever',
  <>
    <g className="mark-rayons">
      <path d="M24 6v4" />
      <path d="M10.5 11.5l2.8 2.8" />
      <path d="M37.5 11.5l-2.8 2.8" />
      <path d="M4 25h4" />
      <path d="M44 25h-4" />
    </g>
    <path
      className="mark-soleil"
      d="M14 28a10 10 0 0 1 20 0z"
      fill="currentColor"
      stroke="none"
    />
    <path className="mark-eau mark-eau-1" d="M8 34h32" />
    <path className="mark-eau mark-eau-2" d="M14 41h20" />
  </>
);

/**
 * Le lien rompu — hors connexion.
 *
 * Deux arcs et un point, barrés d'une oblique qui se TRACE : c'est le trait
 * qui bouge, pas l'ensemble, parce que c'est lui qui porte la nouvelle.
 * `pathLength={1}` normalise le chemin : le CSS écrit un tiret de 1 sans avoir
 * à connaître sa géométrie.
 */
const ROMPU = marque(
  'mark-rompu',
  <>
    <path d="M13 27a15 15 0 0 1 22 0" opacity=".45" />
    <path d="M19 34a7 7 0 0 1 10 0" />
    <circle cx="24" cy="40" r="1.5" fill="currentColor" stroke="none" />
    <path className="mark-barre" pathLength={1} d="M11 11l26 26" />
  </>
);

/** Le lien rétabli — les mêmes arcs, qui reviennent l'un après l'autre. */
const RETABLI = marque(
  'mark-retabli',
  <>
    <path
      className="mark-arc mark-arc-1"
      pathLength={1}
      d="M13 27a15 15 0 0 1 22 0"
    />
    <path
      className="mark-arc mark-arc-2"
      pathLength={1}
      d="M19 34a7 7 0 0 1 10 0"
    />
    <circle
      className="mark-point"
      cx="24"
      cy="40"
      r="1.5"
      fill="currentColor"
      stroke="none"
    />
  </>
);

/**
 * L'accroc — une erreur dont on se relève.
 *
 * Un triangle aux angles ronds qui penche à peine, deux fois, puis s'arrête.
 */
const ACCROC = marque(
  'mark-accroc',
  <>
    <path d="M24 9L42 38H6z" />
    <path d="M24 20v8" />
    <circle cx="24" cy="33" r="1.5" fill="currentColor" stroke="none" />
  </>
);

/**
 * Le vide — il n'y a rien, et ce n'est pas une panne.
 *
 * Un anneau pointillé qui tourne lentement autour d'un horizon : la place est
 * prête, elle attend son contenu.
 */
const VIDE = marque(
  'mark-vide',
  <>
    <circle
      className="mark-anneau"
      cx="24"
      cy="24"
      r="16"
      strokeDasharray="4 6"
      opacity=".55"
    />
    <path d="M16 27h16" opacity=".8" />
  </>
);

/** C'est passé — la coche se DESSINE, elle n'apparaît pas. */
const COCHE = marque(
  'mark-coche',
  <>
    <circle cx="24" cy="24" r="16" opacity=".35" />
    <path className="mark-trait" pathLength={1} d="M16 24.5l5.5 5.5L33 18.5" />
  </>
);

/** Ça n'est pas passé — les deux traits se croisent, l'un après l'autre. */
const CROIX = marque(
  'mark-croix',
  <>
    <circle cx="24" cy="24" r="16" opacity=".35" />
    <path className="mark-trait mark-trait-1" pathLength={1} d="M18 18l12 12" />
    <path className="mark-trait mark-trait-2" pathLength={1} d="M30 18L18 30" />
  </>
);

/**
 * La braise qui s'éteint — un départ.
 *
 * LA FLAMME A LE DROIT D'ÊTRE ICI. Elle a quitté la marque de l'application
 * parce qu'elle n'y faisait que signer ; elle garde sa place partout où elle
 * veut dire « ceci s'éteint », et c'est exactement ce que ce rôle raconte.
 * Rien n'est repris d'un objet de l'émission : un support, une braise, une
 * fumée.
 */
const BRAISE = marque(
  'mark-braise',
  <>
    <path d="M24 44V30" opacity=".55" />
    <path className="mark-fumee" d="M24 20c0-4 4-5 4-9" opacity=".6" />
    <path
      className="mark-lueur"
      d="M24 12c1.5 4 5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 3.5-5 5-9z"
      fill="currentColor"
      stroke="none"
    />
  </>
);

/** La victoire — un éclat qui s'ouvre depuis son centre. */
const ECLAT = marque(
  'mark-eclat',
  <>
    <g className="mark-branches">
      <path d="M24 5v9" />
      <path d="M24 34v9" />
      <path d="M5 24h9" />
      <path d="M34 24h9" />
      <path d="M11 11l6 6" />
      <path d="M37 37l-6-6" />
      <path d="M37 11l-6 6" />
      <path d="M11 37l6-6" />
    </g>
    <circle
      className="mark-coeur"
      cx="24"
      cy="24"
      r="6"
      fill="currentColor"
      stroke="none"
    />
  </>
);

/**
 * Le rôle → son dessin. Les rôles absents n'en ont pas et gardent le repli
 * textuel : `note-shared`, `share-revoked`, `favorite-added` et `reveal` sont
 * déjà portés par un mouvement de l'interface elle-même (l'étoile qui éclate,
 * le contenu qui se démasque), et un dessin de plus y ferait doublon.
 */
export const MARKS: Partial<Record<AnimationRole, ReactElement>> = {
  'app-start': LEVER,
  'went-offline': ROMPU,
  'back-online': RETABLI,
  'recoverable-error': ACCROC,
  empty: VIDE,
  'sync-success': COCHE,
  'sync-failed': CROIX,
  'torch-out': BRAISE,
  victory: ECLAT,
};
