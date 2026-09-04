/**
 * Sélection du backend, par le socle. `local` (défaut) : 100 % navigateur,
 * référentiel de démonstration, idéal GitHub Pages et hors ligne. `supabase` :
 * référentiel publié, comptes, notes synchronisées — retenu SEULEMENT si l'URL
 * et la clé anon sont toutes deux présentes, sinon repli propre sur `local`.
 * Le jugement est celui du socle : une variable vide ou blanche est absente.
 */
import {
  supabaseConfig,
  SUPABASE_ENV_KEYS,
} from '@mister-guiiug/dev-wpa-config/supabase-client';
import { resolveBackendKind } from '@mister-guiiug/dev-wpa-config/backend';

export type BackendKind = 'local' | 'supabase';

export const BACKEND: BackendKind = resolveBackendKind(import.meta.env, {
  kinds: { local: [], supabase: SUPABASE_ENV_KEYS },
  fallback: 'local',
}) as BackendKind;

/** Ce qui manque pour `supabase` — affiché tel quel dans les réglages. */
export const MISSING_FOR_SUPABASE: readonly string[] = supabaseConfig(
  import.meta.env
).missing;

export const IS_SUPABASE = BACKEND === 'supabase';
export const IS_LOCAL = BACKEND === 'local';
