/**
 * Le moteur Rive de l'application : la version ALLÉGÉE, servie par le site
 * lui-même.
 *
 * LA VERSION ALLÉGÉE. `@rive-app/canvas` embarque un WebAssembly de 1,99 Mo
 * (824 Ko compressés) ; `canvas-lite` en pèse 772 Ko (316 Ko compressés), au
 * prix du texte, de la mise en page et du son — dont un lever de soleil et une
 * braise n'ont pas besoin.
 *
 * SERVI PAR LE SITE. Par défaut, le moteur va chercher son WASM sur unpkg ou
 * jsdelivr : la CSP de l'application (`connect-src` = soi et Supabase) le
 * refuse, et ce serait un tiers de plus à qui chaque visite se signale. Le
 * fichier est donc émis avec le build (`?url`), et le repli vers un CDN est
 * coupé.
 *
 * Le signal de chargement, lui, est celui du socle depuis la 6.27.0 :
 * `RiveAnimation` construit son composant sur le `useRive` de ce module et
 * rend `onLoad` / `onError`.
 */

/** Le `loader` passé au composant du socle. */
export async function chargerRive(): Promise<Record<string, unknown>> {
  const [mod, wasm] = await Promise.all([
    import('@rive-app/react-canvas-lite'),
    import('@rive-app/canvas-lite/rive.wasm?url'),
  ]);
  // Paquet CommonJS : selon le bundler, l'export nommé ou celui du défaut.
  const m = mod as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const RuntimeLoader = (m.RuntimeLoader ?? m.default?.RuntimeLoader) as {
    setWasmUrl: (url: string) => void;
    setWasmFallbackUrl: (url: string | null) => void;
  };
  RuntimeLoader.setWasmUrl(wasm.default);
  RuntimeLoader.setWasmFallbackUrl(null);
  return m;
}
