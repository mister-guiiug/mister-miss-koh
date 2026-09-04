import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  ArrowLeft,
  Coffee,
  ExternalLink,
  Monitor,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { ThemeProvider } from '@mister-guiiug/dev-wpa-config/react/theme-provider';
import { IconsProvider } from '@mister-guiiug/dev-wpa-config/react/icons-context';
import { lucideIconSet } from '@mister-guiiug/dev-wpa-config/react/icons-lucide';
import { LabelsProvider } from '@mister-guiiug/dev-wpa-config/react/labels';
import { ErrorBoundary } from '@mister-guiiug/dev-wpa-config/react/error-boundary';
import { EmptyState } from '@mister-guiiug/dev-wpa-config/react/empty-state';
import { THEME_COLOR, THEME_STORAGE_KEY } from './theme';
import { useAppStore } from './store/useAppStore';
import { Layout } from './components/Layout';
import { AppAnimation } from './animations/AppAnimation';
import { HomeScreen } from './features/home/HomeScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { ContestantsScreen } from './features/contestants/ContestantsScreen';
import { ContestantDetailScreen } from './features/contestants/ContestantDetailScreen';
import { EpisodesScreen } from './features/episodes/EpisodesScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { OfflineScreen } from './features/offline/OfflineScreen';

// Le socle demande un RÔLE d'icône, l'app fournit le dessin (lucide, règle
// famille). Les rôles non fournis gardent le SVG maison du socle.
const ICONS = lucideIconSet({
  close: X,
  light: Sun,
  dark: Moon,
  system: Monitor,
  back: ArrowLeft,
  sponsor: Coffee,
  external: ExternalLink,
});

function RoutedApp() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/tableau-de-bord" element={<DashboardScreen />} />
          <Route path="/candidats" element={<ContestantsScreen />} />
          <Route path="/candidats/:id" element={<ContestantDetailScreen />} />
          <Route path="/episodes" element={<EpisodesScreen />} />
          <Route path="/reglages" element={<SettingsScreen />} />
          <Route path="/hors-connexion" element={<OfflineScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export function App() {
  const init = useAppStore(s => s.init);
  const ready = useAppStore(s => s.ready);
  const error = useAppStore(s => s.error);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <ThemeProvider
      storageKey={THEME_STORAGE_KEY}
      defaultTheme="system"
      themeColor={THEME_COLOR}
      paint={false}
    >
      <LabelsProvider locale="fr">
        <IconsProvider icons={ICONS}>
          <ErrorBoundary
            fallback={
              <EmptyState
                icon={<AppAnimation name="recoverable-error" />}
                title="Quelque chose s’est mal passé"
                description="Rechargez la page. Vos données locales sont conservées."
              />
            }
          >
            {!ready ? (
              <div className="loading" role="status">
                <AppAnimation name="referential-loading" />
                <span>Chargement du référentiel…</span>
              </div>
            ) : error ? (
              <EmptyState title="Référentiel illisible" description={error} />
            ) : (
              <RoutedApp />
            )}
          </ErrorBoundary>
        </IconsProvider>
      </LabelsProvider>
    </ThemeProvider>
  );
}
