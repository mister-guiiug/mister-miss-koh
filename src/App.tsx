import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  ArrowLeft,
  Coffee,
  ExternalLink,
  Flame,
  Monitor,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { ThemeProvider } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { IconsProvider } from '@mister-guiiug/dev-pwa-config/react/icons-context';
import { lucideIconSet } from '@mister-guiiug/dev-pwa-config/react/icons-lucide';
import { LabelsProvider } from '@mister-guiiug/dev-pwa-config/react/labels';
import { ErrorBoundary } from '@mister-guiiug/dev-pwa-config/react/error-boundary';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { THEME_COLOR, THEME_STORAGE_KEY } from './theme';
import { useAppStore } from './store/useAppStore';
import { usePhotosStore } from './store/usePhotosStore';
import { Layout } from './components/Layout';
import { AppAnimation } from './animations/AppAnimation';
import { useMotionLevel } from './animations/motion';
import { HomeScreen } from './features/home/HomeScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { ContestantsScreen } from './features/contestants/ContestantsScreen';
import { ContestantDetailScreen } from './features/contestants/ContestantDetailScreen';
import { EpisodesScreen } from './features/episodes/EpisodesScreen';
import { NotesScreen } from './features/notes/NotesScreen';

import { AccountScreen } from './features/account/AccountScreen';
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

/**
 * Les deux écrans où l'on n'ARRIVE QUE PAR UN LIEN — le partage d'une note, le
 * profil de quelqu'un — quittent le bundle d'entrée.
 *
 * Personne ne les atteint en naviguant : ni la barre basse, ni l'accueil n'y
 * mènent. Les faire payer à chaque première visite, c'est facturer à tout le
 * monde ce que presque personne n'ouvre — et le chunk d'entrée est précisément
 * ce que `bundleBudget.mainChunkKb` borne.
 */
const SharedNotesScreen = lazy(async () => ({
  default: (await import('./features/share/SharedNotesScreen'))
    .SharedNotesScreen,
}));
const PublicProfileScreen = lazy(async () => ({
  default: (await import('./features/profile/PublicProfileScreen'))
    .PublicProfileScreen,
}));
const SharedPhotoScreen = lazy(async () => ({
  default: (await import('./features/share/SharedPhotoScreen'))
    .SharedPhotoScreen,
}));

/**
 * La coquille reste à l'écran pendant le chargement : la frontière `Suspense`
 * est POSÉE SUR L'ÉLÉMENT de la route, pas autour des routes — sinon l'en-tête
 * et la barre basse disparaîtraient le temps d'un aller-retour réseau.
 */
function ALaDemande({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="stack">
          <SkeletonGroup label="Chargement de la page" lines={3} />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

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
          <Route path="/notes" element={<NotesScreen />} />
          {/* Ouvert à tous, sans session : c'est le serveur qui décide, à
              partir du jeton seul. La portée est dans l'adresse parce qu'un
              jeton ne dit pas laquelle des deux fonctions l'ouvre. */}
          <Route
            path="/partage/:kind/:token"
            element={
              <ALaDemande>
                <SharedNotesScreen />
              </ALaDemande>
            }
          />
          {/* Une photo confiée pour un jour. L'ARRIVÉE NE CONSOMME RIEN :
              l'écran propose, un geste prend — sans quoi l'aperçu de lien
              d'une messagerie brûlerait la photo avant son destinataire. */}
          <Route
            path="/photo/:token"
            element={
              <ALaDemande>
                <SharedPhotoScreen />
              </ALaDemande>
            }
          />
          {/* Le profil de quelqu'un, à son identifiant public. Ouvert à tous
              parce que la RLS le décide, pas parce que la route l'autorise. */}
          <Route
            path="/profil/:handle"
            element={
              <ALaDemande>
                <PublicProfileScreen />
              </ALaDemande>
            }
          />
          <Route path="/compte" element={<AccountScreen />} />
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
  const referential = useAppStore(s => s.referential);
  // `data-motion` sur <html>, avant la première peinture : les deux réglages
  // pilotent enfin ce qui bouge, écran d'attente compris.
  useMotionLevel();

  // Les portraits vivent dans IndexedDB : une seule lecture, en parallèle du
  // référentiel, et les vignettes sont prêtes avant le premier écran.
  const loadPhotos = usePhotosStore(s => s.load);

  useEffect(() => {
    void init();
    void loadPhotos();
  }, [init, loadPhotos]);

  return (
    <ThemeProvider
      storageKey={THEME_STORAGE_KEY}
      defaultTheme="system"
      themeColor={THEME_COLOR}
      paint={false}
    >
      <LabelsProvider locale="fr">
        <IconsProvider icons={ICONS}>
          <ToastProvider>
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
                <div className="loading">
                  {/* La flamme est le REPLI du rôle de chargement : le jour où
                      un `.riv` le porte, Rive la remplace. En attendant, elle
                      vacille en CSS, et le squelette esquisse la forme du
                      contenu à venir — c'est lui qui annonce l'attente. */}
                  <AppAnimation
                    name="referential-loading"
                    fallback={<Flame className="flame" size={44} aria-hidden />}
                  />
                  <SkeletonGroup label="Chargement du référentiel" lines={3} />
                </div>
              ) : error && !referential ? (
                /* Le PREMIER chargement a échoué : rien à montrer, l'écran
                   bloque. Un rechargement en échec ne passe jamais ici — la
                   lecture précédente reste en place, et l'échec se dit
                   (toast de useRefreshReferential, avis des Réglages). */
                <EmptyState title="Référentiel illisible" description={error} />
              ) : (
                <RoutedApp />
              )}
            </ErrorBoundary>
          </ToastProvider>
        </IconsProvider>
      </LabelsProvider>
    </ThemeProvider>
  );
}
