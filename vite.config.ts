import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'node:fs';
import { pwaSeoPlugin } from '@mister-guiiug/dev-pwa-config/vite-pwa-base';
import { cspPlugin } from '@mister-guiiug/dev-pwa-config/vite-csp';
import { versionPlugin } from '@mister-guiiug/dev-pwa-config/vite-version';

const analyze = process.env.ANALYZE === '1';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string;
};

/**
 * La version RÉELLEMENT INSTALLÉE d'une dépendance — celle du disque, pas la
 * portée souhaitée du `package.json`. C'est la différence qui compte quand on
 * cherche pourquoi un build se comporte autrement qu'un autre : `^4.5.0` ne
 * dit pas si l'on tourne sur la 4.5.0 ou la 4.9.2.
 *
 * Lecture DIRECTE du fichier plutôt que `require.resolve` : beaucoup de
 * paquets n'exposent pas `./package.json` dans leur carte d'`exports`, et la
 * résolution échouerait sur eux seuls. Une dépendance introuvable rend une
 * chaîne vide et disparaît de la liste — on ne fabrique pas un numéro.
 */
function installedVersion(name: string): string {
  try {
    const raw = readFileSync(`./node_modules/${name}/package.json`, 'utf-8');
    return (JSON.parse(raw) as { version?: string }).version ?? '';
  } catch {
    return '';
  }
}

/** Ce dont l'application est faite, dans l'ordre où on le cherche. */
const DEPENDENCIES = [
  '@mister-guiiug/dev-pwa-config',
  'react',
  'react-router-dom',
  '@supabase/supabase-js',
  'zustand',
  'zod',
  'vite',
] as const;

const deps = DEPENDENCIES.map(name => [name, installedVersion(name)] as const)
  .filter(([, v]) => v !== '')
  .map(([name, v]) => ({ name, version: v }));

// Dépôt GitHub Pages : https://mister-guiiug.github.io/mister-miss-koh/
export default defineConfig(({ command }) => {
  const buildId =
    process.env.DEPLOY_ID ||
    process.env.GITHUB_RUN_ID ||
    process.env.GITHUB_SHA?.slice(0, 7) ||
    (command === 'build' ? String(Date.now()) : 'dev');

  // `VITE_BASE_PATH` prioritaire (déploiement famille, et CI Lighthouse qui
  // sert depuis « / » — un chemin codé en dur y rend la page blanche).
  let basePath = '/';
  if (process.env.VITE_BASE_PATH) {
    basePath = process.env.VITE_BASE_PATH;
  } else if (command === 'build') {
    basePath = '/mister-miss-koh/';
  }

  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
      // Le commit et l'heure du build, pour que « Version installée » dise
      // QUEL build tourne — un numéro de version seul ne distingue pas deux
      // déploiements du même jour.
      __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? ''),
      __APP_BUILT_AT__: JSON.stringify(
        command === 'build' ? new Date().toISOString() : ''
      ),
      __APP_DEPS__: JSON.stringify(deps),
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            const norm = id.replace(/\\/g, '/');
            if (
              norm.includes('/vite-plugin-pwa/') ||
              norm.includes('/workbox-')
            )
              return 'pwa';
            if (norm.includes('/@supabase/')) return 'supabase';
            // Le runtime Rive (~100 ko + WASM) reste hors du bundle initial :
            // `react/rive` du socle l'importe à la demande, il ne doit pas
            // être forcé dans un chunk chargé au démarrage.
            if (norm.includes('/@rive-app/')) return;
            // Même raison pour `qrcode` (~50 ko) : le module `/qr` du socle
            // l'importe dynamiquement, à la première ouverture d'un QR code.
            // `dijkstrajs` est SA dépendance — nommé « vendor », il partirait
            // dans le bundle initial sans que personne l'y attende.
            if (norm.includes('/qrcode/') || norm.includes('/dijkstrajs/'))
              return;
            // Même raison pour l'encodeur d'images du socle : seul le dépôt
            // d'un portrait l'appelle (`store/usePhotosStore`), et il est
            // importé à la demande. Le ranger dans un chunk du démarrage le
            // ferait payer à toutes les visites qui n'y touchent jamais.
            if (norm.includes('/dev-pwa-config/image.js')) return;
            if (
              norm.includes('/react-dom/') ||
              norm.includes('/node_modules/react/') ||
              norm.includes('/scheduler/')
            )
              return 'react-vendor';
            if (norm.includes('/react-router/')) return 'router';
            if (norm.includes('/zustand/')) return 'zustand';
            if (norm.includes('/zod/')) return 'zod';
            if (norm.includes('/lucide-react/')) return 'icons';
            if (
              norm.includes('/tailwindcss/') ||
              norm.includes('/@tailwindcss/')
            )
              return 'tailwind';
            return 'vendor';
          },
        },
      },
    },
    plugins: [
      // AVANT cspPlugin : il pose un script inline dans le <head>, que la
      // CSP doit hacher après coup ; et il écrit version.json au build.
      versionPlugin({ manifest: true, define: false }),
      react(),
      tailwindcss(),
      pwaSeoPlugin({
        basePath,
        logoPath: '/icon-512.png',
        themeColor: { light: '#f4efe4', dark: '#12201c' },
      }),
      // CSP par hash (socle). connect-src : Supabase seulement — le
      // référentiel ne se lit jamais depuis Wikipédia côté navigateur, c'est
      // la fonction Edge qui s'en charge. img-src : les tuiles OpenStreetMap
      // de la carte du lieu de tournage (LocationMap), seul hôte externe.
      cspPlugin({
        dev: command === 'serve',
        connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
      }),
      VitePWA({
        // `prompt`, pas `autoUpdate` : un déploiement ne recharge pas la page
        // pendant la rédaction d'une note ; le bandeau du socle laisse choisir.
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'robots.txt'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
          // Les fichiers Rive sont volumineux et facultatifs : mis en cache à
          // la première lecture, jamais préchargés.
          runtimeCaching: [
            {
              urlPattern: /\.riv$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'animations',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
          navigateFallbackDenylist: [/^\/auth/, /supabase\.co/],
        },
        manifest: {
          id: basePath,
          name: 'Mister & miss Koh',
          short_name: 'Mister & miss',
          description:
            'Suivez une saison d’aventure : candidats, épisodes, épreuves, conseils et votes — avec vos notes privées et vos favoris. Non officiel.',
          theme_color: '#c2410c',
          background_color: '#f4efe4',
          display: 'standalone',
          orientation: 'portrait',
          scope: basePath,
          start_url: basePath,
          lang: 'fr',
          dir: 'ltr',
          categories: ['entertainment', 'lifestyle'],
          // De VRAIES captures, prises par Playwright sur l'application qui lit
          // la base hébergée (`captures.mjs`). Une illustration dessinée ferait
          // une belle fiche d'installation et une promesse fausse.
          screenshots: [
            {
              src: 'screenshots/etroit.png',
              sizes: '390x844',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'La soirée d’un épisode : épreuves, conseil et départs',
            },
            {
              src: 'screenshots/large.png',
              sizes: '1280x800',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Les candidats de la saison, et qui est encore en jeu',
            },
          ],
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icon-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
      }),
      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              gzipSize: true,
              brotliSize: true,
              open: !process.env.CI,
            }) as PluginOption,
          ]
        : []),
    ],
  };
});
