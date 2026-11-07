import { defineConfig, devices } from '@playwright/test';
import { definePwaPlaywrightConfig } from '@mister-guiiug/dev-pwa-config/playwright-base';

/**
 * La fabrique du socle fournit la matrice de navigateurs, les reporters, le
 * gabarit de captures, `reducedMotion` et le serveur de test.
 *
 * `preview: true` : les e2e passent sur un BUILD de production, jamais sur le
 * serveur de développement. C'est le seul moyen d'exercer ce qui n'existe qu'à
 * la fin — service worker, minification, manifeste, CSP.
 *
 * `VITE_BASE_PATH=/` neutralise le chemin GitHub Pages le temps du test, et le
 * port 4173 évite la collision avec le serveur de développement (5236).
 *
 * AUCUNE VARIABLE SUPABASE n'est posée, et c'est voulu : sans elles,
 * `src/backend/config.ts` retombe sur le backend `local`, qui sert le
 * référentiel de DÉMONSTRATION (`src/backend/demo.ts`, prénoms fictifs). La
 * suite tourne donc sans base, sans réseau et sans secret — en local comme en
 * CI. `vite build` et non `npm run build` : le budget de poids et `tsc -b`
 * ont leur propre job, et ne doivent pas faire tomber le serveur de test.
 */
export default defineConfig(
  definePwaPlaywrightConfig({
    devices,
    testMatch: /.*\.spec\.ts$/,
    preview: true,
    port: 4173,
    command:
      'node scripts/with-env.mjs VITE_BASE_PATH=/ -- vite build && node scripts/with-env.mjs VITE_BASE_PATH=/ -- vite preview --port 4173 --strictPort',
    // La langue du navigateur est FIXÉE : les dates et les nombres passent
    // par `Intl`, qui suit la locale du contexte — `en-US` par défaut dans
    // Playwright. `overrides.use` est FUSIONNÉ par la fabrique (socle 6.x) :
    // le `baseURL` qu'elle calcule survit.
    overrides: { use: { locale: 'fr-FR' } },
  })
);
