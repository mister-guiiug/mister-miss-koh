import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import './styles.css';
import { App } from './App';
import { initSentry } from '@mister-guiiug/dev-pwa-config/react/observability';

/*
 * L'OBSERVABILITÉ, ET ELLE NE COÛTE RIEN TANT QU'AUCUN DSN N'EST POSÉ.
 *
 * `initSentry` sort sur `if (!dsn) return null` AVANT d'importer le SDK :
 * sans `VITE_SENTRY_DSN` sur le dépôt, `@sentry/react` n’est jamais
 * téléchargé. Le morceau est en plus tenu hors du précache du service
 * worker (cf. `globIgnores` dans vite.config.ts), sans quoi Workbox le
 * ferait descendre chez chaque visiteur — mesuré le 16/09/2026 sur deux
 * apps du parc, 345 et 463 KiB pour une observabilité éteinte.
 *
 * `Sentry.init` pose ses propres gestionnaires globaux : les erreurs non
 * rattrapées et les rejets de promesse partent sans autre câblage.
 */
void initSentry({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  // La version applicative, pour qu’une erreur soit rattachée à un build
  // précis : sans elle, toutes les traces se mélangent dans un seul tas.
  release: __APP_VERSION__,
  // `loader` rend l’import analysable par Vite, ce qui permet au
  // `manualChunks` de ranger le SDK dans son propre morceau.
  loader: () => import('@sentry/react'),
});

const el = document.getElementById('app');
if (el) {
  createRoot(el).render(
    <StrictMode>
      {/* Mise à jour en `prompt` (vite.config.ts) : la nouvelle version se
          télécharge en fond, le bandeau du socle propose de recharger, et
          l'utilisateur choisit le moment — jamais en pleine rédaction d'une
          note. En développement, `registerSW` vaut `undefined` : aucun worker. */}
      <AppUpdates
        checkEvery="1h"
        registerSW={import.meta.env.PROD ? registerSW : undefined}
      >
        <App />
      </AppUpdates>
    </StrictMode>
  );
}
