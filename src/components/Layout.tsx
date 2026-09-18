import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
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
import { PageContainer } from '@mister-guiiug/dev-pwa-config/react/page-container';
import { ConsentBanner } from '@mister-guiiug/dev-pwa-config/react/consent-banner';
import { usePageViews } from '@mister-guiiug/dev-pwa-config/react/use-page-views';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { useThemeContext } from '@mister-guiiug/dev-pwa-config/react/theme-provider';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { usePersonalSync } from '../hooks/usePersonalSync';

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

  // Une vue de page par navigation — ni zéro, ni deux. `initAnalytics` pose
  // `capture_pageview: false` pour que toutes passent par ici, la première
  // comprise : laissé à lui-même, PostHog compterait chaque navigation deux
  // fois. Rien sans consentement.
  usePageViews(pathname);

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
        /* Le titre RAMÈNE À L'ACCUEIL. Le socle n'a pas de prop pour cela —
           son `backHref` rend une flèche de retour, ce qui n'est pas la même
           promesse — mais `title` accepte un nœud : un lien y tient. Il garde
           la couleur du titre (`.brand-link`), sinon la règle non layered
           `a { color: var(--primary) }` de l'app le peindrait en orange. */
        title={
          <Link className="brand-link" to="/">
            Mister &amp; Miss Koh
          </Link>
        }
        leading={
          /* LA MARQUE, PAS UNE ICÔNE QUI LUI RESSEMBLE. L'en-tête portait une
             flamme de `lucide` : un contour générique, sans la vague et sans
             la pastille — donc trois logos différents selon qu'on regardait le
             site, l'onglet ou l'application installée. C'est le MÊME FICHIER
             qui est servi ici, qui fait le favicon, et dont `npm run icons`
             tire les PNG du manifeste : aucune copie ne peut plus diverger.
             `alt=""` parce que le titre le suit et le dit déjà. */
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            width={28}
            height={28}
            alt=""
          />
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
      {/* `lg` ET NON `md`. Mesuré sur un écran de 1 280 px : le contenu tenait
          dans 576 px, avec 360 px de vide de chaque côté — un téléphone posé au
          milieu d'une page. 48 rem laissent respirer les listes et permettent
          aux tuiles et aux rangées de passer en colonnes. La lecture d'un
          paragraphe reste bornée par la carte qui le porte, pas par la
          fenêtre. */}
      <PageContainer as="main" width="lg" reserve="bottom-nav">
        {/* La clé est le chemin : chaque écran se remonte et fait son entrée
            (`.screen`, image-clé `dwc-rise` du socle).

            LE PIED DE PAGE N'EST PLUS ICI. Rendu par la coquille, il signait
            les dix-sept écrans ; le socle 4.5.0 en demande deux au plus, et il
            a raison — « Code source · M'offrir un café · Signaler un
            problème » sous une fiche de candidat est du bruit. Il vit
            désormais sur l'accueil et sur les Réglages, là où on le cherche. */}
        <div key={pathname} className="screen">
          <Outlet />
        </div>
        {/* Une `region`, pas une boîte modale : elle ne recouvre rien et ne
            piège pas le focus. Ne rend RIEN sans `VITE_POSTHOG_KEY`. */}
        <ConsentBanner
          posthogKey={import.meta.env.VITE_POSTHOG_KEY}
          loader={() => import('posthog-js/dist/module.slim.js')}
        />
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
