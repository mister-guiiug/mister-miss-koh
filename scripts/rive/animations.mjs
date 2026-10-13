/**
 * Les deux animations Rive de l'application, écrites par du code :
 *
 *  - `lever`  — le soleil qui se lève sur l'eau (emblème de l'accueil, rôle
 *               `app-start`) ;
 *  - `braise` — la flamme qui s'éteint, la fumée qui monte, la braise qui
 *               rougeoit puis faiblit (un départ, rôle `torch-out`).
 *
 * LA GÉOMÉTRIE EST CELLE DES MARQUES SVG (`src/animations/marks.tsx`), au
 * double : un artboard de 96 × 96 pour une grille de 48. Le repli statique et
 * l'animation dessinent donc la même chose — seul le mouvement change.
 *
 * UN FICHIER PAR THÈME. Une couleur est figée dans un `.riv` ; les marques,
 * elles, lisent `currentColor`. Les deux variantes reprennent les jetons
 * `--primary`, `--accent` et `--danger` de `src/styles.css`, et
 * `AppAnimation` choisit selon le thème résolu.
 *
 *   npm run animations:rive   → public/animations/{lever,braise}-{clair,sombre}.riv
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  adoucir,
  argb,
  Artboard,
  EASE_IN_OUT,
  EASE_OUT,
  encoder,
  LOOP,
  T,
} from './riv.mjs';

export const THEMES = {
  clair: { primary: '#b03a0b', accent: '#0d6660', danger: '#b91c1c' },
  sombre: { primary: '#fb923c', accent: '#5eead4', danger: '#f87171' },
};

const QUART = 0.5523 * 20; // poignée d'un quart de cercle de rayon 20
const HAUT = -Math.PI / 2;
const BAS = Math.PI / 2;
const TRAIT = 5; // 2,5 sur la grille de 48

/** Le soleil qui se lève : demi-disque, cinq rayons, deux traits d'eau. */
export function lever(theme) {
  const c = THEMES[theme];
  const ab = new Artboard({ name: 'lever', width: 96, height: 96 });

  // L'ORDRE DE DESSIN EST L'INVERSE DU SVG : dans un `.riv`, le premier
  // composant de l'artboard est dessiné DEVANT (vérifié dans le runtime le
  // 13/10/2026 : deux disques qui se chevauchent, le premier recouvre). Les
  // traits d'eau viennent donc d'abord, pour passer devant le soleil.
  const eau2 = ab.forme('eau-2', { x: 48, y: 82, opacity: 0 });
  ab.trait(eau2, -20, 0, 20, 0);
  ab.contour(eau2, argb(c.accent), TRAIT);

  const eau1 = ab.forme('eau-1', { x: 48, y: 68, opacity: 0 });
  ab.trait(eau1, -32, 0, 32, 0);
  ab.contour(eau1, argb(c.accent), TRAIT);

  // Le demi-disque, centré sur le milieu de sa base.
  const soleil = ab.forme('soleil', { x: 48, y: 72, opacity: 0 });
  ab.chemin(soleil, [
    {
      type: 'libre',
      x: -20,
      y: 0,
      sortie: { rotation: HAUT, distance: QUART },
    },
    { type: 'miroir', x: 0, y: -20, rotation: 0, distance: QUART },
    { type: 'libre', x: 20, y: 0, entree: { rotation: HAUT, distance: QUART } },
  ]);
  ab.remplir(soleil, argb(c.primary));

  // Les rayons : un nœud qui les fait APPARAÎTRE une fois (animation
  // `lever`), et dessous une forme qui RESPIRE en boucle (animation
  // `rayons`). Deux animations ne doivent pas piloter la même propriété du
  // même objet : l'une écraserait l'autre.
  const halo = ab.ajouter(2, { name: 'halo', x: 48, y: 56, opacity: 0 });
  const rayons = ab.forme('rayons', { parent: halo, opacity: 0.55 });
  ab.trait(rayons, 0, -44, 0, -36);
  ab.trait(rayons, -27, -33, -21.4, -27.4);
  ab.trait(rayons, 27, -33, 21.4, -27.4);
  ab.trait(rayons, -40, -6, -32, -6);
  ab.trait(rayons, 40, -6, 32, -6);
  ab.contour(rayons, argb(c.primary), TRAIT);

  // Le lever : une fois, 0,9 s. Le soleil monte de 16 (8 sur la grille de 48,
  // comme `koh-monte`), l'eau paraît juste après, les rayons en dernier.
  ab.animer('lever', {
    duree: 60,
    pistes: [
      { objet: soleil, propriete: 'y', cles: adoucir(0, 54, 72, 56, EASE_OUT) },
      {
        objet: soleil,
        propriete: 'opacity',
        cles: adoucir(0, 30, 0, 1, EASE_OUT, 3),
      },
      {
        objet: eau1,
        propriete: 'opacity',
        cles: [[0, 0], ...adoucir(7, 30, 0, 1, EASE_OUT, 3)],
      },
      {
        objet: eau2,
        propriete: 'opacity',
        cles: [[0, 0], ...adoucir(12, 36, 0, 0.7, EASE_OUT, 3)],
      },
      {
        objet: halo,
        propriete: 'opacity',
        cles: [[0, 0], ...adoucir(34, 60, 0, 1, EASE_OUT, 3)],
      },
    ],
  });

  // La respiration des rayons : 3,2 s en boucle, comme `koh-respire`.
  const respire = (de, a) => [
    ...adoucir(0, 96, de, a, EASE_IN_OUT, 8),
    ...adoucir(96, 192, a, de, EASE_IN_OUT, 8).slice(1),
  ];
  ab.animer('rayons', {
    duree: 192,
    boucle: LOOP.loop,
    pistes: [
      { objet: rayons, propriete: 'opacity', cles: respire(0.55, 1) },
      { objet: rayons, propriete: 'scaleX', cles: respire(1, 1.06) },
      { objet: rayons, propriete: 'scaleY', cles: respire(1, 1.06) },
    ],
  });
  ab.machine('main', ['lever', 'rayons']);
  return ab;
}

/** La flamme qui s'éteint : elle vacille, se couche, fume ; la braise reste. */
export function braise(theme) {
  const c = THEMES[theme];
  const ab = new Artboard({ name: 'braise', width: 96, height: 96 });

  // Le premier composant est DEVANT (voir `lever`) : la flamme, la fumée,
  // la braise, puis le support qu'elle recouvre.
  // La flamme : une goutte, origine au bas de sa courbe — c'est vers ce point
  // qu'elle se couche, comme `koh-steint` (transform-origin 24px 26px).
  const flamme = ab.forme('flamme', { x: 48, y: 52 });
  const angle = (dx, dy) => Math.atan2(dy, dx);
  const longueur = (dx, dy) => Math.hypot(dx, dy);
  ab.chemin(flamme, [
    {
      type: 'libre',
      x: 0,
      y: -28,
      entree: { rotation: angle(-3, 8), distance: longueur(-3, 8) },
      sortie: { rotation: angle(3, 8), distance: longueur(3, 8) },
    },
    {
      type: 'libre',
      x: 10,
      y: -10,
      entree: { rotation: HAUT, distance: 7 },
      sortie: { rotation: BAS, distance: 5.523 },
    },
    { type: 'miroir', x: 0, y: 0, rotation: Math.PI, distance: 5.523 },
    {
      type: 'libre',
      x: -10,
      y: -10,
      entree: { rotation: BAS, distance: 5.523 },
      sortie: { rotation: HAUT, distance: 7 },
    },
  ]);
  ab.remplir(flamme, argb(c.primary));

  // La fumée : le trait courbe de la marque, qui monte en s'effaçant.
  const fumee = ab.forme('fumee', { x: 48, y: 48, opacity: 0 });
  ab.chemin(
    fumee,
    [
      { type: 'libre', x: 0, y: 0, sortie: { rotation: HAUT, distance: 8 } },
      { type: 'libre', x: 8, y: -18, entree: { rotation: BAS, distance: 8 } },
    ],
    { ferme: false }
  );
  ab.contour(fumee, argb(c.primary), TRAIT);

  // La braise, au sommet du support : invisible tant que la flamme brûle.
  const point = ab.forme('point', { x: 48, y: 60, opacity: 0 });
  ab.ajouter(T.ellipse, { pathWidth: 9, pathHeight: 9 }, point);
  ab.remplir(point, argb(c.danger));

  const support = ab.forme('support', { x: 48, y: 74, opacity: 0.55 });
  ab.trait(support, 0, 14, 0, -14);
  ab.contour(support, argb(c.primary), TRAIT);

  // 2 s : 0,4 s où la flamme vit encore (elle vacille), puis elle se couche
  // et s'efface en 1,2 s ; la fumée part au milieu, la braise rougeoit au
  // moment où la flamme la découvre, puis faiblit sans disparaître.
  ab.animer('eteint', {
    duree: 120,
    pistes: [
      {
        objet: flamme,
        propriete: 'scaleX',
        cles: [
          [0, 1],
          [8, 0.9],
          [16, 1.06],
          [24, 0.95],
          [32, 1],
          [96, 0.7],
        ],
      },
      {
        objet: flamme,
        propriete: 'scaleY',
        cles: [
          [0, 1],
          [8, 1.06],
          [16, 0.94],
          [24, 1.03],
          ...adoucir(32, 96, 1, 0.1, EASE_OUT, 8),
        ],
      },
      {
        objet: flamme,
        propriete: 'y',
        cles: [[0, 52], ...adoucir(32, 96, 52, 70, EASE_OUT, 6)],
      },
      {
        objet: flamme,
        propriete: 'opacity',
        cles: [
          [0, 1],
          [32, 1],
          [76, 0.5],
          [96, 0],
        ],
      },
      {
        objet: point,
        propriete: 'opacity',
        cles: [
          [0, 0],
          [60, 0],
          [84, 1],
          [120, 0.45],
        ],
      },
      {
        objet: fumee,
        propriete: 'opacity',
        cles: [
          [0, 0],
          [56, 0],
          [86, 0.6],
          [120, 0],
        ],
      },
      {
        objet: fumee,
        propriete: 'y',
        cles: [
          [0, 56],
          [56, 56],
          ...adoucir(56, 120, 56, 32, EASE_OUT, 6).slice(1),
        ],
      },
    ],
  });
  ab.machine('main', ['eteint']);
  return ab;
}

/** Les quatre fichiers, rendus en octets (le test les relit sans écrire). */
export function fichiers() {
  const out = {};
  for (const theme of Object.keys(THEMES)) {
    out[`lever-${theme}.riv`] = encoder(lever(theme));
    out[`braise-${theme}.riv`] = encoder(braise(theme));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dossier = new URL('../../public/animations/', import.meta.url);
  mkdirSync(dossier, { recursive: true });
  for (const [nom, octets] of Object.entries(fichiers())) {
    writeFileSync(new URL(nom, dossier), octets);
    console.log(`${nom} : ${octets.length} octets`);
  }
}
