/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'local' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_ID__: string;
/** SHA du commit compilé, `''` hors CI. */
declare const __APP_COMMIT__: string;
/** Date ISO de compilation, `''` en développement (il n'y a pas de build). */
declare const __APP_BUILT_AT__: string;
/** Les versions RÉELLEMENT installées des bibliothèques qui font l'app. */
declare const __APP_DEPS__: readonly { name: string; version: string }[];
