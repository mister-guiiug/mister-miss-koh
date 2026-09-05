import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'node:fs';
import { pwaSeoPlugin } from '@mister-guiiug/dev-pwa-config/vite-pwa-base';
import { cspPlugin } from '@mister-guiiug/dev-pwa-config/vite-csp';

const analyze = process.env.ANALYZE === '1';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string;
};

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
      react(),
      tailwindcss(),
      pwaSeoPlugin({
        basePath,
        logoPath: '/icon-512.png',
        themeColor: { light: '#f4efe4', dark: '#12201c' },
      }),
      // CSP par hash (socle). connect-src : Supabase seulement — le
      // référentiel ne se lit jamais depuis Wikipédia côté navigateur, c'est
      // la fonction Edge qui s'en charge.
      cspPlugin({
        dev: command === 'serve',
        connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
        imgSrc: ["'self'", 'data:', 'blob:'],
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
