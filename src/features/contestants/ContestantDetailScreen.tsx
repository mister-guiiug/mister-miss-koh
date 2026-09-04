import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-wpa-config/react/card';
import { Badge } from '@mister-guiiug/dev-wpa-config/react/badge';
import { Button } from '@mister-guiiug/dev-wpa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-wpa-config/react/empty-state';
import { useAppStore } from '../../store/useAppStore';
import { SpoilerGuard } from '../../components/SpoilerGuard';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { contestantById, partnerOf } from '../../domain/referential';
import {
  challengeWins,
  councilsAttended,
  lastAiredEpisode,
  votesCast,
  votesReceived,
  type Counted,
} from '../../domain/stats';

/** « 3 » quand tout est connu, « ≥ 3 » sinon : jamais la même chose pour les deux. */
function counted(c: Counted): string {
  return c.complete ? String(c.value) : `≥ ${c.value}`;
}

export function ContestantDetailScreen() {
  const { id } = useParams();
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const limit = useSpoilerLimit();

  const view = useMemo(() => {
    if (!referential || !id) return null;
    const contestant = contestantById(referential, id);
    if (!contestant) return null;
    const upTo = Math.min(limit, lastAiredEpisode(referential));
    return {
      contestant,
      partner: partnerOf(referential, id),
      departure:
        referential.departures.find(d => d.contestantId === id) ?? null,
      received: votesReceived(referential, id, upTo),
      cast: votesCast(referential, id, upTo),
      councils: councilsAttended(referential, id, upTo),
      wins: challengeWins(referential, id, upTo),
      upTo,
    };
  }, [referential, id, limit]);

  if (!referential) return null;
  if (!view) {
    return (
      <EmptyState
        title="Candidat introuvable"
        action={<Link to="/candidats">Retour à la liste</Link>}
      />
    );
  }

  const { contestant, partner, departure } = view;
  const favorite = favorites.includes(contestant.id);
  const cause = contestantById(referential, departure?.causedById ?? null);

  return (
    <div className="stack">
      <Link to="/candidats">← Candidats</Link>
      <Card>
        <CardHeader
          as="h2"
          title={contestant.displayName}
          subtitle={[
            contestant.age ? `${contestant.age} ans` : null,
            contestant.previousSeasons.length
              ? contestant.previousSeasons.join(' · ')
              : null,
          ]
            .filter(Boolean)
            .join(' — ')}
          action={
            <Button
              variant={favorite ? 'primary' : 'outline'}
              size="sm"
              aria-pressed={favorite}
              onClick={() => toggleFavorite(contestant.id)}
            >
              {favorite ? 'Favori' : 'Ajouter aux favoris'}
            </Button>
          }
        />
        {partner && (
          <p>
            Binôme :{' '}
            <Link to={`/candidats/${partner.id}`}>{partner.displayName}</Link>
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Parcours"
          subtitle={`jusqu’à l’épisode ${view.upTo}`}
        />
        <dl className="stats">
          <dt>Voix reçues</dt>
          <dd>{counted(view.received)}</dd>
          <dt>Voix exprimées</dt>
          <dd>{counted(view.cast)}</dd>
          <dt>Conseils disputés</dt>
          <dd>{view.councils}</dd>
          <dt>Épreuves gagnées</dt>
          <dd>
            {view.wins.comfort} confort · {view.wins.immunity} immunité
          </dd>
        </dl>
        {!view.received.complete && (
          <p className="muted">
            « ≥ » : la source ne détaille pas toutes les voix — le compte est un
            minimum, pas un total.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Statut" />
        {departure ? (
          <SpoilerGuard episodeNumber={departure.episodeNumber}>
            <p>
              <Badge tone="danger">
                Sorti·e à l’épisode {departure.episodeNumber}
              </Badge>
              {departure.day && <> · jour {departure.day}</>}
              {cause && (
                <>
                  {' '}
                  — à la suite de{' '}
                  <Link to={`/candidats/${cause.id}`}>{cause.displayName}</Link>
                </>
              )}
            </p>
          </SpoilerGuard>
        ) : (
          <Badge tone="success">Encore en jeu</Badge>
        )}
      </Card>
    </div>
  );
}
