import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { useAppStore } from '../../store/useAppStore';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { inGame, lastAiredEpisode } from '../../domain/stats';
import { contestantById } from '../../domain/referential';

export function DashboardScreen() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const limit = useSpoilerLimit();

  const view = useMemo(() => {
    if (!referential) return null;
    // La limite borne TOUT : ce tableau ne révèle rien au-delà du dernier
    // épisode que l'utilisateur accepte de voir.
    const upTo = Math.min(limit, lastAiredEpisode(referential));
    const still = new Set(inGame(referential, upTo));
    const out = referential.departures
      .filter(d => d.episodeNumber !== null && d.episodeNumber <= upTo)
      .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
    return {
      upTo,
      inGame: [...still],
      departures: out,
      favoritesInGame: favorites.filter(id => still.has(id)),
      hidden: Number.isFinite(limit) && lastAiredEpisode(referential) > limit,
    };
  }, [referential, favorites, limit]);

  if (!referential || !view) return null;

  return (
    <div className="stack">
      <h2>Tableau de bord</h2>
      <Card>
        <CardHeader title="Où en est la saison" />
        <p>
          Épisode {view.upTo} sur {referential.episodes.length} ·{' '}
          <strong>{view.inGame.length}</strong> encore en jeu ·{' '}
          <strong>{view.departures.length}</strong> parti
          {view.departures.length > 1 ? 's' : ''}
        </p>
        {view.hidden && (
          <p className="muted">
            Des événements plus récents sont masqués par votre réglage
            anti-spoiler.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Vos favoris"
          subtitle={favorites.length === 0 ? 'Aucun pour l’instant' : undefined}
        />
        {favorites.length > 0 && (
          <ul className="chips">
            {favorites.map(id => {
              const c = contestantById(referential, id);
              if (!c) return null;
              const still = view.favoritesInGame.includes(id);
              return (
                <li key={id}>
                  <Link to={`/candidats/${id}`}>{c.displayName}</Link>{' '}
                  <Badge tone={still ? 'success' : 'muted'} size="xs">
                    {still ? 'en jeu' : 'sorti·e'}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Chronologie des départs" />
        {view.departures.length === 0 ? (
          <p className="muted">Aucun départ visible.</p>
        ) : (
          <ol className="timeline">
            {view.departures.map(d => {
              const c = contestantById(referential, d.contestantId);
              const cause = contestantById(referential, d.causedById);
              return (
                <li key={d.contestantId}>
                  <span>Épisode {d.episodeNumber}</span>{' '}
                  <Link to={`/candidats/${d.contestantId}`}>
                    {c?.displayName ?? '?'}
                  </Link>{' '}
                  <Badge
                    tone={d.kind === 'vote' ? 'danger' : 'muted'}
                    size="xs"
                  >
                    {kindLabel(d.kind)}
                  </Badge>
                  {cause && (
                    <span className="muted">
                      {' '}
                      — à la suite de {cause.displayName}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'vote':
      return 'éliminé·e au vote';
    case 'linked_pair':
      return 'départ lié au binôme';
    case 'quit':
      return 'abandon';
    case 'medical':
      return 'évacuation';
    case 'banned':
      return 'bannissement';
    default:
      return kind;
  }
}
