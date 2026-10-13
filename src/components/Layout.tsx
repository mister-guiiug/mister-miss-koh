import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
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
import { useAppBadge } from '../hooks/useAppBadge';
import {
  denommer,
  naviguerAvecTransition,
  nommer,
  signalerRendu,
  transitionPermise,
} from '../animations/transitions';

const NAV = [
  { href: '/', label: 'Accueil', icon: <Home size={20} aria-hidden /> },
  {
    href: '/candidats',
    label: 'Candidats',
    icon: <Users size={20} aria-hidden />,
  },
  { href: '/episodes', label: 'Épisodes', icon: <Tv size={20} aria-hidden /> },
  {
    href: '/tableau-de-bord',
    label: 'Suivi',
    icon: <BarChart3 size={20} aria-hidden />,
  },
  {
    href: '/reglages',
    label: 'Réglages',
    icon: <Settings size={20} aria-hidden />,
  },
];

/**
 * Le rang de l'onglet auquel appartient un chemin, ou -1. Une fiche de
 * candidat appartient aux Candidats : la barre reste sur leur onglet.
 */
function rangOnglet(chemin: string): number {
  return NAV.findIndex(n =>
    n.href === '/'
      ? chemin === '/'
      : chemin === n.href || chemin.startsWith(`${n.href}/`)
  );
}

const FICHE = /^\/candidats\/[^/]+$/;
const NOMS_FICHE = ['vt-avatar', 'vt-nom'];

/** L'avatar et le nom d'une rangée de la liste des candidats. */
function rangee(id: string): [Element | null, Element | null] {
  const lien = document.querySelector(
    `.list a[href="#/candidats/${CSS.escape(id)}"]`
  );
  return [lien?.closest('li')?.querySelector('.avatar') ?? null, lien];
}

/** L'avatar et le nom en tête d'une fiche. */
function enTeteDeFiche(): [Element | null, Element | null] {
  return [
    document.querySelector('.identity-card .identity .avatar'),
    document.querySelector('.identity-card [data-dwc="card-title"]'),
  ];
}

/**
 * LES LIENS INTERNES PASSENT PAR UNE TRANSITION DE VUE.
 *
 * `HashRouter` (mode déclaratif) ignore l'option `viewTransition` de React
 * Router, réservée aux routeurs « data ». Plutôt que de basculer tout le
 * routage, un seul écouteur, en capture sur le document, reprend les clics sur
 * les liens `#/…` quand une transition est permise — et les laisse au routeur
 * sinon. Aucun `<Link>` de l'app ne porte `replace` ni `state` : rien n'est
 * perdu à naviguer à sa place.
 *
 * Le type dit le mouvement : `onglet` glisse dans le sens de la barre basse,
 * `fiche` et `retour` font VOYAGER l'avatar et le nom entre la liste et la
 * fiche, `ecran` fond l'un dans l'autre.
 */
function useTransitionsDeNavigation(pathname: string) {
  const navigate = useNavigate();
  const ici = useRef(pathname);
  useLayoutEffect(() => {
    ici.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target || a.hasAttribute('download')) return;
      if (!transitionPermise()) return;
      const vers = a.getAttribute('href')!.slice(1);
      const depuis = ici.current;
      if (vers === depuis) return;
      e.preventDefault();
      e.stopPropagation();
      const aller = () => navigate(vers);
      const fin = () => denommer('[style*="view-transition-name"]');

      if (FICHE.test(vers)) {
        // De la liste (avatar + nom) ou d'un nom ailleurs (le nom seul).
        const depart = a.closest('.list li')
          ? [a.closest('li')?.querySelector('.avatar') ?? null, a]
          : [null, a];
        naviguerAvecTransition('fiche', aller, {
          avant: () => nommer(depart, NOMS_FICHE),
          apres: () => nommer(enTeteDeFiche(), NOMS_FICHE),
          fin,
        });
        return;
      }
      if (FICHE.test(depuis) && vers === '/candidats') {
        const id = depuis.slice('/candidats/'.length);
        naviguerAvecTransition('retour', aller, {
          avant: () => nommer(enTeteDeFiche(), NOMS_FICHE),
          apres: () => nommer(rangee(id), NOMS_FICHE),
          fin,
        });
        return;
      }
      const de = rangOnglet(depuis);
      const a2 = rangOnglet(vers);
      if (de >= 0 && a2 >= 0 && de !== a2) {
        naviguerAvecTransition('onglet', aller, {
          sens: a2 > de ? 'avant' : 'arriere',
        });
        return;
      }
      naviguerAvecTransition('ecran', aller);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
}

/**
 * Les notes ne sont pas un onglet : six destinations ouvraient un « Plus » et
 * cachaient la barre. Ici elles restent à un geste, sur chaque écran.
 */
function NotesLink() {
  const { pathname } = useLocation();
  const here = pathname === '/notes' || pathname.startsWith('/notes/');
  return (
    <Link
      to="/notes"
      data-dwc="button"
      data-variant="ghost"
      data-size="sm"
      data-icon-only=""
      aria-label="Notes"
      aria-current={here ? 'page' : undefined}
    >
      <NotebookPen size={20} aria-hidden />
    </Link>
  );
}

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

  useAppBadge();

  useTransitionsDeNavigation(pathname);

  // Un écran qui entre commence en haut : sans cela, son entrée partirait du
  // milieu d'une page que l'écran précédent avait laissée défilée.
  // `useLayoutEffect`, et AVANT le signal : une transition de vue photographie
  // l'écran d'arrivée dès qu'on le lui signale — il doit déjà être en haut.
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    signalerRendu();
  }, [pathname]);

  // L'onglet courant, pour le trait qui glisse sous la barre basse.
  const onglet = rangOnglet(pathname);

  return (
    <div
      className="app-shell"
      data-onglet={onglet}
      style={
        {
          '--onglet': Math.max(onglet, 0),
          '--onglets': NAV.length,
        } as CSSProperties
      }
    >
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
        actions={
          <>
            <NotesLink />
            <ThemeButton />
          </>
        }
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
        {/* `fixed` : le bandeau flotte AU-DESSUS de la barre basse. Dans le
            flux, il finissait sous elle — les boutons Accepter et Refuser
            n'étaient plus atteignables en bas de fiche. */}
        <ConsentBanner
          placement="fixed"
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
