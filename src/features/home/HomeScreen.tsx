import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-wpa-config/react/card';
import { useAppStore } from '../../store/useAppStore';
import { Provenance } from '../../components/Provenance';
import { AppAnimation } from '../../animations/AppAnimation';
import { lastAiredEpisode } from '../../domain/stats';

export function HomeScreen() {
  const referential = useAppStore(s => s.referential);
  const notice = useAppStore(s => s.notice);
  if (!referential) return null;

  const last = lastAiredEpisode(referential);

  return (
    <div className="stack">
      <AppAnimation name="app-start" className="hero-animation" />
      {/* L'avis vient AVANT le contenu : quand ce qui s'affiche n'est pas le
          serveur, il faut le savoir avant de lire, pas après. */}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader
          as="h2"
          title={referential.season.name}
          subtitle={referential.season.editionLabel}
        />
        <p>
          {referential.contestants.length} candidats ·{' '}
          {last === 0
            ? 'aucun épisode diffusé'
            : `${last} épisode${last > 1 ? 's' : ''} diffusé${last > 1 ? 's' : ''}`}
        </p>
        <p>
          <Link to="/tableau-de-bord">Tableau de bord</Link> ·{' '}
          <Link to="/candidats">Candidats</Link> ·{' '}
          <Link to="/episodes">Épisodes</Link>
        </p>
      </Card>
      <Provenance data={referential.provenance} />
      <p className="muted">
        Application non officielle, sans lien avec les ayants droit de
        l’émission. Vos notes, favoris et réglages restent sur cet appareil tant
        que vous ne créez pas de compte.
      </p>
    </div>
  );
}
