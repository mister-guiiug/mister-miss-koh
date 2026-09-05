import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import './styles.css';
import { App } from './App';

const el = document.getElementById('app');
if (el) {
  createRoot(el).render(
    <StrictMode>
      {/* Mise à jour en `prompt` (vite.config.ts) : la nouvelle version se
          télécharge en fond, le bandeau du socle propose de recharger, et
          l'utilisateur choisit le moment — jamais en pleine rédaction d'une
          note. En développement, `registerSW` vaut `undefined` : aucun worker. */}
      <AppUpdates registerSW={import.meta.env.PROD ? registerSW : undefined}>
        <App />
      </AppUpdates>
    </StrictMode>
  );
}
