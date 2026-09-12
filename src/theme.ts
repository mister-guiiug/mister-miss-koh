/**
 * Réglage du thème, en un seul endroit — lu par `ThemeProvider` (App.tsx) ET
 * par le script anti-FOUC d'`index.html`, qui ne se voient pas l'un l'autre.
 * Un désaccord ne casse rien au build : il affiche le premier écran dans le
 * mauvais thème, puis bascule.
 */
export const THEME_STORAGE_KEY = 'dwc_theme';

/**
 * Couleur de la barre du navigateur, par schéma — et LA SEULE SOURCE.
 *
 * Trois valeurs se disputaient cette barre : celle-ci, posée à l'exécution par
 * `ThemeProvider` ; celle des balises `<meta>` du document, écrites au build
 * par `pwaSeoPlugin` ; et le `theme_color` du manifeste, que le système lit
 * une fois l'application installée. Elles ne disaient pas la même chose : la
 * barre virait à l'orange dès que le JavaScript arrivait, alors que le
 * document promettait le crème. `vite.config.ts` importe désormais cette
 * constante pour les deux autres.
 *
 * LE FOND DE LA PAGE, PAS LA COULEUR D'ACCENT. Une barre orange au-dessus
 * d'une page crème dessine une frontière là où il n'y en a pas ; les deux
 * valeurs ci-dessous sont exactement `--bg` des deux thèmes.
 */
export const THEME_COLOR = { light: '#f4efe4', dark: '#12201c' };
