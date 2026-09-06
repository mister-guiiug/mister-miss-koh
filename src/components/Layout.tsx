import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Flame,
  Home,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  Tv,
  Users,
} from 'lucide-react';
import { AppHeader } from '@mister-guiiug/dev-pwa-config/react/app-header';
import { BottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { PageContainer } from '@mister-guiiug/dev-pwa-config/react/page-container';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { usePersonalSync } from '../hooks/usePersonalSync';
import { REPO_URL } from '../links';

const NAV = [
  { href: '/', label: 'Accueil', icon: <Home size={20} aria-hidden /> },
  {
    href: '/candidats',
    label: 'Candidats',
    icon: <Users size={20} aria-hidden />,
  },
  { href: '/episodes', label: 'Épisodes', icon: <Tv size={20} aria-hidden /> },
  {
    href: '/notes',
    label: 'Notes',
    icon: <NotebookPen size={20} aria-hidden />,
  },
  {
    href: '/reglages',
    label: 'Réglages',
    icon: <Settings size={20} aria-hidden />,
  },
];

function ThemeButton() {
  const theme = useThemeContext();
  if (!theme) return null;
  const dark = theme.resolved === 'dark';
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={theme.toggle}
    >
      {dark ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </Button>
  );
}

export function Layout() {
  const online = useOnline();
  const { pathname } = useLocation();

  // La coque est le seul endroit monté sur TOUS les écrans : le suivi se
  // synchronise donc une fois par session, quel que soit l'écran d'arrivée —
  // et notamment celui qu'un lien de connexion ramène.
  usePersonalSync();

  // Un écran qui entre commence en haut : sans cela, son entrée partirait du
  // milieu d'une page que l'écran précédent avait laissée défilée.
  useEffect(() => {
    document.documentElement.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-shell">
      <AppHeader
        title="Mister & miss Koh"
        leading={
          <Flame size={22} aria-hidden style={{ color: 'var(--primary)' }} />
        }
        actions={<ThemeButton />}
        linkComponent={Link}
        hrefProp="to"
      >
        {!online && (
          <p role="status" className="offline-banner">
            Hors connexion — vous consultez la dernière version enregistrée.
          </p>
        )}
      </AppHeader>
      <PageContainer as="main" width="md" reserve="bottom-nav">
        {/* La clé est le chemin : chaque écran se remonte et fait son entrée
            (`.screen`, image-clé `dwc-rise` du socle). Le pied de page, lui,
            reste en place d'un écran à l'autre. */}
        <div key={pathname} className="screen">
          <Outlet />
        </div>
        <AppFooter issues repoUrl={REPO_URL} version />
      </PageContainer>
      <BottomNav
        placement="fixed"
        items={NAV}
        currentPath={pathname}
        linkComponent={Link}
        hrefProp="to"
      />
    </div>
  );
}
