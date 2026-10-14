/**
 * Les transitions de vue : la CONTINUITÉ entre deux états de l'interface.
 *
 * Chaque écran faisait son entrée (`dwc-rise`), mais rien ne reliait l'écran
 * qu'on quitte à celui qui arrive : on passait de l'un à l'autre d'un coup. Le
 * navigateur sait photographier l'avant et l'après et animer le passage
 * (`document.startViewTransition`) — sans bibliothèque, donc sans un octet de
 * plus dans le chemin critique. Là où il ne le sait pas, le changement reste
 * instantané, comme avant.
 *
 * QUI DÉCIDE. Le niveau de mouvement (`data-motion`, voir `motion.ts`) et le
 * réglage système. Une transition qui DÉPLACE l'écran n'est jouée qu'en
 * `full` ; celles qui ne font que relier un état à son suivant (la limite
 * anti-spoiler qui avance) passent aussi en `essential`. Rien en `none`.
 *
 * LE TYPE de la transition est posé sur `<html>` (`data-vt`) pendant toute sa
 * durée : c'est lui que le CSS lit pour choisir le mouvement, et pour taire
 * l'entrée en cascade des écrans, qui ferait double emploi.
 */
import { flushSync } from 'react-dom';

export type TypeDeTransition =
  'onglet' | 'fiche' | 'retour' | 'ecran' | 'limite' | 'filtre' | 'etape';

interface Options {
  /** Joue aussi au niveau `essential` : un retour d'état, pas un ornement. */
  essentielle?: boolean;
  /** Sens du déplacement, pour les onglets et les étapes. */
  sens?: 'avant' | 'arriere';
}

type DocumentAvecTransitions = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
    /** Absente des plus vieux navigateurs : d'où le `?.` plus bas. */
    ready?: Promise<void>;
    skipTransition: () => void;
  };
};

let enCours: { skipTransition: () => void } | null = null;

/**
 * CE QUE L'ENTRÉE D'UN ÉCRAN ANIME, et que la transition fait taire (voir
 * `styles.css`, « L'entrée en cascade des écrans cède la place »).
 *
 * Taire ne suffisait pas. La règle tient à `html[data-vt]` : quand la
 * transition finit et que `data-vt` part, ces éléments RETROUVENT leur
 * animation d'entrée, et le navigateur la rejoue. Relevé le 14/10/2026 sur le
 * site, à chaque changement d'onglet : l'écran glissait, puis tout son contenu
 * s'effaçait et revenait une seconde fois, « comme s'il se rechargeait ». Ce
 * qui était à l'écran pendant la transition y est donc marqué ENTRÉ
 * (`data-entre`), et le reste. Un élément monté après garde son entrée.
 */
const ENTREES =
  '.screen, .screen > .stack > *, .list > li, .limit-marker, .limit-badge';

/** La transition peut-elle jouer ici, maintenant ? */
export function transitionPermise(essentielle = false): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as DocumentAvecTransitions;
  if (typeof doc.startViewTransition !== 'function') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  const niveau = document.documentElement.dataset.motion ?? 'full';
  return niveau === 'full' || (essentielle && niveau === 'essential');
}

/**
 * Lance la transition. `maj` change l'état et rend une promesse résolue quand
 * le nouvel état est PEINT (navigation) ou rien (mise à jour synchrone).
 */
function lancer(
  type: TypeDeTransition,
  maj: () => void | Promise<void>,
  { sens }: Options
) {
  const html = document.documentElement;
  // Une transition chasse la précédente : deux en vol se marcheraient dessus.
  enCours?.skipTransition();
  html.dataset.vt = type;
  if (sens) html.dataset.vtSens = sens;
  else delete html.dataset.vtSens;
  const t = (document as DocumentAvecTransitions).startViewTransition!(maj);
  enCours = t;
  // UNE TRANSITION ABANDONNÉE REJETTE `ready`. Chassée par la suivante (deux
  // onglets touchés vite), ou refusée par le navigateur (page masquée), elle
  // laissait une promesse rejetée que personne n'attendait : « Uncaught (in
  // promise) InvalidStateError », remontée à Sentry à chaque changement
  // d'écran. L'écran, lui, change quand même : il n'y a rien à rattraper.
  t.ready?.catch(() => undefined);
  const fin = () => {
    if (enCours !== t) return;
    enCours = null;
    document.querySelectorAll<HTMLElement>(ENTREES).forEach(el => {
      el.dataset.entre = '';
    });
    delete html.dataset.vt;
    delete html.dataset.vtSens;
  };
  t.finished.then(fin, fin);
  return t;
}

/**
 * Une mise à jour d'état React, enveloppée dans une transition quand c'est
 * permis. `flushSync` : le navigateur photographie l'après dès que `maj`
 * rend la main, le DOM doit donc être à jour à ce moment-là.
 */
export function avecTransition(
  type: TypeDeTransition,
  maj: () => void,
  options: Options = {}
): void {
  if (!transitionPermise(options.essentielle)) {
    maj();
    return;
  }
  lancer(type, () => flushSync(maj), options);
}

/* ── La navigation ──────────────────────────────────────────────────────────
   `HashRouter` met à jour l'écran dans une transition React (`startTransition`),
   que `flushSync` ne force pas. La photo de l'après attend donc que la coquille
   SIGNALE le rendu du nouvel écran (`signalerRendu`, dans un `useLayoutEffect`
   sur le chemin) ; un délai de garde la libère si le signal ne vient pas. */

let rendu: (() => void) | null = null;
let avantPhoto: (() => void) | null = null;
let retenues = 0;
const GARDE_MS = 600;

/** Libère la photo de l'après, quoi qu'il reste à venir. */
function photographier(): void {
  const r = rendu;
  rendu = null;
  avantPhoto?.();
  avantPhoto = null;
  r?.();
}

/** À appeler quand le nouvel écran est dans le DOM, avant qu'il soit peint. */
export function signalerRendu(): void {
  if (retenues > 0) return;
  photographier();
}

/**
 * UN ÉCRAN CHARGÉ À LA DEMANDE RETIENT LA PHOTO. À sa première visite,
 * Réglages, Notes, Compte… rendent d'abord le squelette de leur `Suspense`.
 * La coquille signalait le rendu à ce moment-là : la transition faisait glisser
 * le squelette, puis la page arrivait par-dessus, et l'écran semblait se
 * recharger. Tant qu'un squelette est monté (`retenirRendu`), le signal
 * attend qu'il cède la place (`libererRendu`) ; le délai de garde, lui,
 * libère quoi qu'il arrive : un réseau lent ne fige pas l'écran.
 */
export function retenirRendu(): void {
  retenues += 1;
}

export function libererRendu(): void {
  retenues = Math.max(0, retenues - 1);
  if (retenues === 0) photographier();
}

export function naviguerAvecTransition(
  type: TypeDeTransition,
  naviguer: () => void,
  options: Options & {
    /** Juste avant la photo de l'AVANT : nommer ce qui doit voyager. */
    avant?: () => void;
    /** Le nouvel écran rendu, juste avant la photo de l'APRÈS. */
    apres?: () => void;
    /** Une fois la transition finie : effacer les noms posés. */
    fin?: () => void;
  } = {}
): void {
  if (!transitionPermise(options.essentielle)) {
    naviguer();
    return;
  }
  options.avant?.();
  const t = lancer(
    type,
    () =>
      new Promise<void>(resolve => {
        avantPhoto = options.apres ?? null;
        rendu = resolve;
        naviguer();
        window.setTimeout(() => {
          if (rendu === resolve) photographier();
        }, GARDE_MS);
      }),
    options
  );
  const fin = () => options.fin?.();
  t.finished.then(fin, fin);
}

/* ── Les éléments qui voyagent d'un écran à l'autre ────────────────────────
   Un `view-transition-name` permanent sur chaque rangée ferait de chacune un
   groupe à part dans TOUTES les transitions (un changement d'onglet verrait
   dix-huit avatars s'effacer sur place pendant que l'écran glisse). Les noms
   ne sont donc posés que le temps du passage qui les concerne, et retirés
   aussitôt après. */

export function nommer(elements: Iterable<Element | null>, noms: string[]) {
  let i = 0;
  for (const el of elements) {
    const nom = noms[i++];
    if (el instanceof HTMLElement && nom) el.style.viewTransitionName = nom;
  }
}

export function denommer(selecteur: string) {
  document.querySelectorAll<HTMLElement>(selecteur).forEach(el => {
    el.style.viewTransitionName = '';
  });
}
