// Config ESLint partagée de la famille (eslint-react + override e2e/**).
// `supabase/functions` est du Deno, relu par `deno lint` (voir deno.json).
import base from '@mister-guiiug/dev-wpa-config/eslint-react';

export default [
  { ignores: ['supabase/functions/**', 'dist/**', 'dev-dist/**'] },
  ...base,
];
