import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { baseTestOptions } from '@mister-guiiug/dev-pwa-config/vitest-base';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  // Les constantes de `vite.config.ts` : sans elles, un écran qui affiche la
  // version (Réglages) tombe en `ReferenceError` dès qu'un test le rend.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD_ID__: JSON.stringify('test'),
    __APP_COMMIT__: JSON.stringify(''),
    __APP_BUILT_AT__: JSON.stringify(''),
    // Deux dépendances suffisent à éprouver l'affichage ; la liste réelle est
    // lue du disque par `vite.config.ts` et n'a pas à être rejouée ici.
    __APP_DEPS__: JSON.stringify([
      { name: '@mister-guiiug/dev-pwa-config', version: '4.5.0' },
      { name: 'react', version: '19.2.0' },
    ]),
  },
  test: {
    ...baseTestOptions,
    // `supabase/functions` est du Deno, testé par `npm run test:edge`.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/supabase/**'],
  },
});
