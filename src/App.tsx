import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import {
  ArrowLeft,
  Coffee,
  Compass,
  ExternalLink,
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
import { useIdlePrefetch } from '@mister-guiiug/dev-pwa-config/react/use-prefetch';
import { THEME_COLOR, THEME_STORAGE_KEY } from './theme';
import { useAppStore } from './store/useAppStore';
import { usePhotosStore } from './store/usePhotosStore';
import { useReferentialRetry } from './hooks/useReferentialRetry';
import { useReferentialWatch } from './hooks/useReferentialWatch';
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
 * LES RÉGLAGES AUSSI, depuis que l'anti-spoiler s'est rendu visible (limite,
 * vague de coches, détail des voix, pastille). Le chunk d'entrée pesait 115
 * Kio sous une borne de 117 ; ces ajouts le portaient à 121. Plutôt que de
 * relever la borne, on sort l'écran le moins visité — et avec lui ce que lui
 * seul importe : la file des portraits, l'export ZIP, la carte, la relecture
 * de Wikipédia. On y va pour régler, rarement ; on n'y arrive jamais.
 */
const loadSettings = () => import('./features/settings/SettingsScreen');
const SettingsScreen = lazy(async () => ({
  default: (await loadSettings()).SettingsScreen,
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
  // ON Y VA D'UN CLIC, depuis la barre basse : contrairement aux écrans de
  // partage, les Réglages se préchargent dès que le navigateur est au repos,
  // après la première peinture. Le clic ne paie pas l'aller-retour réseau.
  useIdlePrefetch(loadSettings);
  // ICI ET NON DANS `App` : le toast qui annonce une nouveauté vit sous le
  // `ToastProvider`, que `App` rend. Et il n'y a rien à suivre tant que le
  // référentiel n'est pas là.
  useReferentialWatch();
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
          <Route
            path="/reglages"
            element={
              <ALaDemande>
                <SettingsScreen />
              </ALaDemande>
            }
          />
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

  // `init()` ne lit qu'une fois. Si cette unique lecture est retombée sur un
  // repli — réseau pas encore prêt au démarrage, serveur muet cinq secondes —
  // c'est ce hook, et lui seul, qui y revient.
  useReferentialRetry();

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
                  {/* LA BOUSSOLE EST LE REPLI du rôle de chargement : le jour
                      où un `.riv` le porte, Rive la remplace. En attendant,
                      elle bat en CSS, et le squelette esquisse la forme du
                      contenu à venir — c'est lui qui annonce l'attente.

                      C'ÉTAIT UNE FLAMME, et c'est précisément l'image dont la
                      marque vient de se défaire : la laisser sur le premier
                      écran d'un démarrage à froid aurait gardé vivante
                      l'association qu'on voulait rompre. La flamme reste là où
                      elle veut dire quelque chose — un partage qui s'éteint —,
                      pas là où elle ne faisait que signer. */}
                  <AppAnimation
                    name="referential-loading"
                    fallback={
                      <Compass className="loading-mark" size={44} aria-hidden />
                    }
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
