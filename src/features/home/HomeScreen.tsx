import { Suspense, lazy, useState } from 'react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { PwaInstallPrompt } from '@mister-guiiug/dev-pwa-config/react/pwa-install-prompt';
import { useAppStore } from '../../store/useAppStore';
import { PullToRefresh } from '../../components/PullToRefresh';
import { HomeTiles } from '../../components/HomeTiles';
import { AppAnimation } from '../../animations/AppAnimation';
import { REPO_URL } from '../../links';

// À LA DEMANDE : la première ouverture ne sert qu'une fois, et le morceau
// d'entrée n'a que quelques kilo-octets de marge sous sa borne.
const Onboarding = lazy(async () => ({
  default: (await import('../onboarding/Onboarding')).Onboarding,
}));

export function HomeScreen() {
  const referential = useAppStore(s => s.referential);
  const notice = useAppStore(s => s.notice);
  const onboarded = useAppStore(s => s.onboarded);
  // DÉCIDÉ À L'ARRIVÉE, pas à chaque rendu : répondre à la première question
  // coche des épisodes, et la présentation ne doit pas disparaître en plein
  // milieu pour autant. Elle ne s'offre qu'à qui n'a encore rien coché.
  const [welcome] = useState(
    () =>
      !useAppStore.getState().onboarded &&
      useAppStore.getState().watched.length === 0
  );
  if (!referential) return null;

  return (
    <div className="stack">
      <PullToRefresh />
      <AppAnimation name="app-start" className="hero-animation" />
      {welcome && !onboarded && (
        <Suspense fallback={null}>
          <Onboarding />
        </Suspense>
      )}
      {/* L'avis vient AVANT le contenu : quand ce qui s'affiche n'est pas le
          serveur, il faut le savoir avant de lire, pas après. */}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {/* UNE PWA QUI NE PROPOSAIT JAMAIS SON INSTALLATION. Tout était en place
          — manifeste, icônes, maskable, service worker, hors-ligne — et rien
          ne le disait : il fallait connaître le menu du navigateur. Le
          composant du socle ne s'affiche que lorsque le navigateur a vraiment
          proposé l'installation (`beforeinstallprompt`), et se tait
          définitivement dès qu'on l'écarte. Il vit sur l'accueil, où l'on
          arrive, et nulle part ailleurs : un bandeau rendu par la coquille
          interromprait la lecture d'une fiche ou l'écriture d'une note. */}
      <PwaInstallPrompt
        dismissKey="koh_install"
        title="Installer Mister & Miss Koh"
        description="Elle s’ouvre depuis l’écran d’accueil, démarre hors connexion et ne prend que la place de ses données."
        installLabel="Installer"
        dismissLabel="Pas maintenant"
      />
      <Card>
        <CardHeader
          as="h2"
          title={referential.season.name}
          subtitle={referential.season.editionLabel}
        />
        {/* Les tuiles remplacent la ligne de liens : chacune porte un chiffre,
            et c'est le chiffre qui fait la différence entre un tableau de bord
            et un menu redondant avec la barre basse. */}
        <HomeTiles />
      </Card>
      {/* LA PROVENANCE N'EST PLUS ICI, et la promesse tient quand même : elle
          occupe sa carte « Source de vérité » dans les Réglages, avec la page,
          la révision, la date de lecture et la version d'extraction. Sur
          l'accueil, ce pavé de métadonnées passait avant les chiffres et
          repoussait tout le reste — la traçabilité se consulte, elle ne
          s'impose pas à chaque ouverture. */}
      <p className="muted home-intro">
        Suivi indépendant de Koh-Lanta, sans lien avec TF1 ni la production.{' '}
        <a
          href={`${import.meta.env.BASE_URL}suivre-koh-lanta-sans-spoiler.html`}
        >
          Suivre la saison sans spoiler
        </a>
        {'. '}
        Vos notes, favoris et réglages restent sur cet appareil tant que vous ne
        créez pas de compte.
      </p>
      {/* Le pied de page vit ICI et sur les Réglages — deux écrans, pas la
          coquille : rendu partout, il transforme chaque bas de page en
          signature. C'est la règle que `pwa-doctor` 4.5.0 fait respecter. */}
      <AppFooter issues repoUrl={REPO_URL} />
    </div>
  );
}
