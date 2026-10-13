/**
 * Le moteur Rive de l'application : la version ALLÉGÉE, servie par le site
 * lui-même, et qui SIGNALE quand l'animation est prête.
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
 * LE SIGNAL. Le composant du socle (`react/rive`) ne dit ni quand le fichier
 * est chargé, ni s'il a échoué : un WASM refusé laisse un canevas vide, sans
 * erreur à attraper. Le `loader` qu'on lui passe rend donc un composant qui
 * appelle `useRive` lui-même, et prévient `AppAnimation` par `attendre`.
 */
import { createElement } from 'react';

import { signaler } from './riveSignal';

interface Props {
  src: string;
  stateMachines?: string | string[];
  autoplay?: boolean;
}

/** Le `loader` passé au composant du socle. */
export async function chargerRive() {
  const [mod, wasm] = await Promise.all([
    import('@rive-app/react-canvas-lite'),
    import('@rive-app/canvas-lite/rive.wasm?url'),
  ]);
  // Paquet CommonJS : selon le bundler, l'export nommé ou celui du défaut.
  const m = mod as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const pick = <T>(nom: string) => (m[nom] ?? m.default?.[nom]) as T;
  const RuntimeLoader = pick<{
    setWasmUrl: (url: string) => void;
    setWasmFallbackUrl: (url: string | null) => void;
  }>('RuntimeLoader');
  const useRive = pick<
    (params: Record<string, unknown>) => {
      RiveComponent: Parameters<typeof createElement>[0];
    }
  >('useRive');
  RuntimeLoader.setWasmUrl(wasm.default);
  RuntimeLoader.setWasmFallbackUrl(null);

  function RiveSignale({ src, stateMachines, autoplay = true }: Props) {
    const { RiveComponent } = useRive({
      src,
      // Le runtime a déprécié `stateMachines` (pluriel) : une seule machine
      // par fichier, nommée au singulier.
      stateMachine: Array.isArray(stateMachines)
        ? stateMachines[0]
        : stateMachines,
      autoplay,
      onLoad: () => signaler(src, true),
      onLoadError: () => signaler(src, false),
    });
    return createElement(RiveComponent);
  }
  return { Rive: RiveSignale };
}
