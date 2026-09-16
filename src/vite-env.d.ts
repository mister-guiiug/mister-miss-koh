/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Identifiant de mesure GA4 (`G-…`), propre à CETTE application. Absent, le
   * bandeau de consentement ne rend rien et rien n'est mesuré : c'est le seul
   * interrupteur, et une propriété par site est ce qui rend le suivi
   * indépendant.
   */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** DSN Sentry (optionnel) : vide = observabilité muette, sans bruit. */
  readonly VITE_SENTRY_DSN?: string;
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
