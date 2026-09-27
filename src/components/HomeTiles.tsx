/**
 * L'accueil en tuiles : des chiffres, pas des raccourcis.
 *
 * CHAQUE TUILE PORTE UN CHIFFRE, sans quoi elle ne serait qu'un raccourci vers
 * un écran que la barre basse atteint déjà. Le tableau de bord a son onglet
 * (« Suivi ») : le poser ici en fausse mesure (« → ») le mêlait aux comptes.
 *
 * LA TUILE ENTIÈRE EST CLIQUABLE, et c'est un `<Link>` qui l'englobe.
 *
 * LES NOTES NE DÉCLENCHENT AUCUNE LECTURE. La tuile lit le magasin partagé
 * s'il est déjà rempli, et se tait sinon.
 */
import { Link } from 'react-router-dom';
import { NotebookPen, Star, Tv, Users } from 'lucide-react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../store/useAppStore';
import { useNotesStore } from '../store/useNotesStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';
import { homeFigures } from '../domain/summary';

interface Tile {
  readonly to: string;
  readonly icon: React.ReactNode;
  readonly value: string;
  readonly label: string;
  readonly detail: string;
}

export function HomeTiles() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const watched = useAppStore(s => s.watched);
  const spoiler = useAppStore(s => s.spoiler);
  const setSpoiler = useAppStore(s => s.setSpoiler);
  const notes = useNotesStore(s => s.notes);
  const limit = useSpoilerLimit();

  if (!referential) return null;
  const f = homeFigures(referential, favorites, watched, limit);

  const tiles: Tile[] = [
    {
      to: '/candidats',
      icon: <Users size={20} aria-hidden />,
      value: String(f.inGame),
      label: 'en jeu',
      detail: `sur ${f.contestants} candidats`,
    },
    {
      to: '/episodes',
      icon: <Tv size={20} aria-hidden />,
      value: `${f.watched}/${f.aired}`,
      label: 'épisodes vus',
      detail:
        f.aired === 0
          ? 'aucun diffusé'
          : `${f.aired} diffusé${f.aired > 1 ? 's' : ''}`,
    },
    {
      to: '/candidats',
      icon: <Star size={20} aria-hidden />,
      value: String(f.favorites),
      label: f.favorites > 1 ? 'favoris' : 'favori',
      detail: f.favorites === 0 ? 'aucun pour l’instant' : 'que vous suivez',
    },
  ];

  if (notes !== null) {
    tiles.push({
      to: '/notes',
      icon: <NotebookPen size={20} aria-hidden />,
      value: String(notes.length),
      label: notes.length > 1 ? 'notes' : 'note',
      detail: notes.length === 0 ? 'la première s’écrit là' : 'sur ce compte',
    });
  }

  return (
    <>
      <ul className="tiles">
        {tiles.map(tile => (
          <li key={`${tile.to}-${tile.label}`}>
            <Link to={tile.to} className="tile">
              <span className="tile-icon">{tile.icon}</span>
              <strong className="tile-value">{tile.value}</strong>
              <span className="tile-label">{tile.label}</span>
              <small className="muted">{tile.detail}</small>
            </Link>
          </li>
        ))}
      </ul>
      {/* Le chiffre « en jeu » s'arrête à la limite anti-spoiler : le dire
          évite de faire passer une précaution pour une erreur de compte. */}
      {f.upTo < f.aired && (
        <div className="catch-up">
          <p>
            Vous en êtes à l’épisode {f.upTo}, {f.aired}{' '}
            {f.aired > 1 ? 'sont diffusés' : 'est diffusé'}. Les comptes
            ci-dessus s’arrêtent là : c’est votre réglage anti-spoiler, pas la
            fin de la saison.
          </p>
          <div className="catch-up-actions">
            <Link to="/episodes" className="catch-up-primary">
              Rattraper les épisodes
            </Link>
            {spoiler !== 'hide_future' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSpoiler('hide_future')}
              >
                Suivre la saison diffusée, sans le prochain épisode
              </Button>
            )}
          </div>
        </div>
      )}
      {referential.provenance.kind === 'wikipedia' &&
        referential.provenance.fetchedAt && (
          <p className="muted tiles-note">
            Wikipédia, lu le {formatDate(referential.provenance.fetchedAt)}
            {referential.provenance.pendingRevision &&
              referential.provenance.pendingRevision !==
                referential.provenance.revision &&
              ' — une révision plus récente est en attente de publication'}
            {readingIsLate(referential.provenance.fetchedAt) &&
              referential.season.status === 'airing' &&
              !referential.provenance.pendingRevision &&
              ' — cette lecture a plus d’un jour, la page a pu bouger'}
            .
          </p>
        )}
    </>
  );
}

/** Plus d’un jour depuis la lecture : le cron du soir n’a pas encore repris. */
function readingIsLate(fetchedAt: string): boolean {
  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) return false;
  return Date.now() - then > 36 * 60 * 60 * 1000;
}
