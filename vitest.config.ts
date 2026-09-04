import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { baseTestOptions } from '@mister-guiiug/dev-wpa-config/vitest-base';

export default defineConfig({
  plugins: [react()],
  test: {
    ...baseTestOptions,
    // `supabase/functions` est du Deno, testé par `npm run test:edge`.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/supabase/**'],
  },
});
