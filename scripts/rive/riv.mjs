/**
 * Un encodeur du format binaire `.riv` de Rive, réduit à ce dont les
 * animations de l'application ont besoin : formes, chemins, remplissages,
 * contours, et animations linéaires à images-clés.
 *
 * POURQUOI ÉCRIRE LE FICHIER PAR DU CODE. Un `.riv` se fabrique d'ordinaire
 * dans l'éditeur de Rive, et rien de ce qu'on y dessine ne se relit dans une
 * revue de code. Ici le dessin EST le code : la géométrie reprend celle des
 * marques SVG (`src/animations/marks.tsx`), les couleurs celles des thèmes,
 * et le fichier se régénère à l'identique (`npm run animations:rive`).
 *
 * LE FORMAT, tel que le runtime le lit (rive-runtime, `src/file.cpp`,
 * `include/rive/runtime_header.hpp`, `include/rive/generated/**`) :
 *
 *  - l'en-tête : « RIVE », la version majeure (7) et mineure en varuint, un
 *    identifiant de fichier, puis la table des propriétés INCONNUES du runtime
 *    (vide ici : toutes celles qu'on écrit, il les connaît) ;
 *  - puis des objets à la suite : la clé de type en varuint, des couples
 *    (clé de propriété, valeur), et un 0 qui ferme l'objet ;
 *  - les valeurs : varuint pour les entiers, float32 petit-boutiste pour les
 *    nombres, uint32 ARGB pour les couleurs, longueur + UTF-8 pour les
 *    chaînes, un octet pour les booléens ;
 *  - l'ordre fait la structure : le Backboard d'abord, puis l'artboard, ses
 *    composants (le parent toujours avant l'enfant, `parentId` = rang dans
 *    l'artboard, qui est lui-même le rang 0), enfin ses animations, chacune
 *    suivie de ses objets animés, de leurs propriétés et de leurs images-clés.
 *
 * Les clés ci-dessous sont celles des en-têtes générés du runtime ; elles ne
 * changent jamais d'une version à l'autre (le format n'ajoute que des clés).
 */

/** Clés de type. */
export const T = {
  backboard: 23,
  artboard: 1,
  shape: 3,
  ellipse: 4,
  pointsPath: 16,
  straightVertex: 5,
  cubicMirroredVertex: 35,
  cubicDetachedVertex: 6,
  fill: 20,
  stroke: 24,
  solidColor: 18,
  linearAnimation: 31,
  keyedObject: 25,
  keyedProperty: 26,
  keyFrameDouble: 30,
  stateMachine: 53,
  stateMachineLayer: 57,
  entryState: 63,
  anyState: 62,
  exitState: 64,
  animationState: 61,
  stateTransition: 65,
};

/** Clés de propriété, et le type de leur valeur. */
export const P = {
  name: [4, 'string'],
  parentId: [5, 'uint'],
  // Artboard (LayoutComponent)
  width: [7, 'double'],
  height: [8, 'double'],
  clip: [196, 'bool'],
  // Node / TransformComponent / WorldTransformComponent
  x: [13, 'double'],
  y: [14, 'double'],
  rotation: [15, 'double'],
  scaleX: [16, 'double'],
  scaleY: [17, 'double'],
  opacity: [18, 'double'],
  // ParametricPath
  pathWidth: [20, 'double'],
  pathHeight: [21, 'double'],
  // PointsPath
  isClosed: [32, 'bool'],
  // Vertex
  vx: [24, 'double'],
  vy: [25, 'double'],
  // CubicMirroredVertex
  mRotation: [82, 'double'],
  mDistance: [83, 'double'],
  // CubicDetachedVertex
  inRotation: [84, 'double'],
  inDistance: [85, 'double'],
  outRotation: [86, 'double'],
  outDistance: [87, 'double'],
  // Stroke
  thickness: [47, 'double'],
  cap: [48, 'uint'],
  join: [49, 'uint'],
  // SolidColor
  colorValue: [37, 'color'],
  // LinearAnimation
  animName: [55, 'string'],
  fps: [56, 'uint'],
  duration: [57, 'uint'],
  loopValue: [59, 'uint'],
  // KeyedObject / KeyedProperty / KeyFrame
  objectId: [51, 'uint'],
  propertyKey: [53, 'uint'],
  frame: [67, 'uint'],
  interpolationType: [68, 'uint'],
  value: [70, 'double'],
  // StateMachineComponent / AnimationState / StateTransition
  smName: [138, 'string'],
  animationId: [149, 'uint'],
  stateToId: [151, 'uint'],
};

export const LOOP = { oneShot: 0, loop: 1, pingPong: 2 };
export const CAP = { butt: 0, round: 1, square: 2 };
export const JOIN = { miter: 0, round: 1, bevel: 2 };
const LINEAR = 1;

class Ecrivain {
  octets = [];
  varuint(n) {
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`varuint invalide : ${n}`);
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      this.octets.push(b);
    } while (n > 0);
  }
  float32(x) {
    const v = new DataView(new ArrayBuffer(4));
    v.setFloat32(0, x, true);
    for (let i = 0; i < 4; i++) this.octets.push(v.getUint8(i));
  }
  uint32(x) {
    const v = new DataView(new ArrayBuffer(4));
    v.setUint32(0, x >>> 0, true);
    for (let i = 0; i < 4; i++) this.octets.push(v.getUint8(i));
  }
  chaine(s) {
    const b = new TextEncoder().encode(s);
    this.varuint(b.length);
    this.octets.push(...b);
  }
  valeur(type, v) {
    if (type === 'uint') this.varuint(v);
    else if (type === 'double') this.float32(v);
    else if (type === 'color') this.uint32(v);
    else if (type === 'string') this.chaine(v);
    else if (type === 'bool') this.octets.push(v ? 1 : 0);
    else throw new Error(`type inconnu : ${type}`);
  }
  objet(typeKey, props) {
    this.varuint(typeKey);
    for (const [nom, v] of Object.entries(props)) {
      if (v === undefined) continue;
      const def = P[nom];
      if (!def) throw new Error(`propriété inconnue : ${nom}`);
      this.varuint(def[0]);
      this.valeur(def[1], v);
    }
    this.varuint(0);
  }
}

/** `#rrggbb` (et une opacité 0..1) → uint32 ARGB. */
export function argb(hex, alpha = 1) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`couleur invalide : ${hex}`);
  return ((Math.round(alpha * 255) << 24) | parseInt(m[1], 16)) >>> 0;
}

/**
 * Un artboard en construction. Chaque `ajouter` rend le RANG de l'objet, que
 * ses enfants citent comme `parentId` et ses animations comme `objectId`.
 */
export class Artboard {
  constructor({ name, width, height }) {
    this.props = { name, width, height, clip: true };
    this.composants = [];
    this.animations = [];
  }
  ajouter(typeKey, props, parent = 0) {
    this.composants.push({ typeKey, props: { ...props, parentId: parent } });
    return this.composants.length;
  }
  forme(nom, { x = 0, y = 0, opacity, parent = 0 } = {}) {
    return this.ajouter(T.shape, { name: nom, x, y, opacity }, parent);
  }
  /** Un chemin à sommets ; `sommets` : `{ x, y, type, … }`. */
  chemin(forme, sommets, { ferme = true } = {}) {
    const chemin = this.ajouter(T.pointsPath, { isClosed: ferme }, forme);
    for (const s of sommets) {
      if (s.type === 'droit') {
        this.ajouter(T.straightVertex, { vx: s.x, vy: s.y }, chemin);
      } else if (s.type === 'miroir') {
        this.ajouter(
          T.cubicMirroredVertex,
          { vx: s.x, vy: s.y, mRotation: s.rotation, mDistance: s.distance },
          chemin
        );
      } else if (s.type === 'libre') {
        this.ajouter(
          T.cubicDetachedVertex,
          {
            vx: s.x,
            vy: s.y,
            inRotation: s.entree?.rotation ?? 0,
            inDistance: s.entree?.distance ?? 0,
            outRotation: s.sortie?.rotation ?? 0,
            outDistance: s.sortie?.distance ?? 0,
          },
          chemin
        );
      } else throw new Error(`sommet inconnu : ${s.type}`);
    }
    return chemin;
  }
  /** Un trait droit, de (x1, y1) à (x2, y2), relatif à la forme. */
  trait(forme, x1, y1, x2, y2) {
    return this.chemin(
      forme,
      [
        { type: 'droit', x: x1, y: y1 },
        { type: 'droit', x: x2, y: y2 },
      ],
      { ferme: false }
    );
  }
  remplir(forme, couleur) {
    const fill = this.ajouter(T.fill, {}, forme);
    this.ajouter(T.solidColor, { colorValue: couleur }, fill);
  }
  contour(forme, couleur, epaisseur) {
    const stroke = this.ajouter(
      T.stroke,
      { thickness: epaisseur, cap: CAP.round, join: JOIN.round },
      forme
    );
    this.ajouter(T.solidColor, { colorValue: couleur }, stroke);
  }
  /**
   * Une animation : `pistes` = [{ objet, propriete, cles: [[image, valeur]] }].
   * Interpolation linéaire entre les clés : les courbes d'accélération sont
   * échantillonnées par `adoucir`, plutôt que portées par un interpolateur.
   */
  animer(nom, { duree, boucle = LOOP.oneShot, fps = 60, pistes }) {
    this.animations.push({ nom, duree, boucle, fps, pistes });
  }
  /**
   * Une state machine : une couche par animation, chacune entrée → animation.
   * Les couches jouent EN PARALLÈLE — c'est ainsi qu'un lever unique et une
   * respiration en boucle tournent ensemble. Le runtime a déprécié la lecture
   * de plusieurs animations par leurs noms au profit d'une state machine.
   */
  machine(nom, animations) {
    this.machines = [...(this.machines ?? []), { nom, animations }];
  }
}

/**
 * Les clés d'une courbe `cubic-bezier(x1, y1, x2, y2)`, de `de` à `a`, entre
 * deux images : assez de points pour que l'interpolation linéaire entre eux
 * ne se voie pas à cette taille.
 */
export function adoucir(debut, fin, de, a, [x1, y1, x2, y2], pas = 6) {
  const bez = (t, p1, p2) =>
    3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  const progres = x => {
    // Le t de la courbe dont l'abscisse vaut x, par dichotomie.
    let bas = 0;
    let haut = 1;
    for (let i = 0; i < 30; i++) {
      const m = (bas + haut) / 2;
      if (bez(m, x1, x2) < x) bas = m;
      else haut = m;
    }
    return bez((bas + haut) / 2, y1, y2);
  };
  const cles = [];
  const n = Math.max(2, Math.min(pas, fin - debut));
  for (let i = 0; i <= n; i++) {
    const image = Math.round(debut + ((fin - debut) * i) / n);
    if (cles.length && cles.at(-1)[0] === image) continue;
    cles.push([image, de + (a - de) * progres(i / n)]);
  }
  return cles;
}

export const EASE_OUT = [0.22, 1, 0.36, 1];
export const EASE_IN_OUT = [0.45, 0, 0.55, 1];

/** Le fichier : en-tête, Backboard, artboard, composants, animations. */
export function encoder(artboard, { mineure = 4 } = {}) {
  const e = new Ecrivain();
  for (const c of 'RIVE') e.octets.push(c.charCodeAt(0));
  e.varuint(7);
  e.varuint(mineure);
  e.varuint(0); // identifiant de fichier
  e.varuint(0); // table des propriétés inconnues : vide
  e.objet(T.backboard, {});
  e.objet(T.artboard, artboard.props);
  for (const c of artboard.composants) e.objet(c.typeKey, c.props);
  for (const a of artboard.animations) {
    e.objet(T.linearAnimation, {
      animName: a.nom,
      fps: a.fps,
      duration: a.duree,
      loopValue: a.boucle,
    });
    // Une piste par (objet, propriété), regroupées par objet.
    const parObjet = new Map();
    for (const p of a.pistes) {
      if (!parObjet.has(p.objet)) parObjet.set(p.objet, []);
      parObjet.get(p.objet).push(p);
    }
    for (const [objet, pistes] of parObjet) {
      e.objet(T.keyedObject, { objectId: objet });
      for (const p of pistes) {
        e.objet(T.keyedProperty, { propertyKey: P[p.propriete][0] });
        for (const [image, valeur] of p.cles) {
          e.objet(T.keyFrameDouble, {
            frame: image,
            interpolationType: LINEAR,
            value: valeur,
          });
        }
      }
    }
  }
  for (const m of artboard.machines ?? []) {
    e.objet(T.stateMachine, { animName: m.nom });
    for (const nomAnimation of m.animations) {
      const rang = artboard.animations.findIndex(a => a.nom === nomAnimation);
      if (rang < 0) throw new Error(`animation inconnue : ${nomAnimation}`);
      e.objet(T.stateMachineLayer, { smName: nomAnimation });
      // Les états dans l'ordre : entrée (0), n'importe lequel (1), sortie (2),
      // l'animation (3). La transition suit l'état d'où elle part, et vise
      // l'animation par son RANG dans la couche.
      e.objet(T.entryState, {});
      e.objet(T.stateTransition, { stateToId: 3 });
      e.objet(T.anyState, {});
      e.objet(T.exitState, {});
      e.objet(T.animationState, { animationId: rang });
    }
  }
  return Uint8Array.from(e.octets);
}
