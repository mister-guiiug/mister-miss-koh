/**
 * Réglage du thème, en un seul endroit — lu par `ThemeProvider` (App.tsx) ET
 * par le script anti-FOUC d'`index.html`, qui ne se voient pas l'un l'autre.
 * Un désaccord ne casse rien au build : il affiche le premier écran dans le
 * mauvais thème, puis bascule.
 */
export const THEME_STORAGE_KEY = 'dwc_theme';

/** Couleur de la barre du navigateur, par schéma. */
export const THEME_COLOR = { light: '#c2410c', dark: '#12201c' };
