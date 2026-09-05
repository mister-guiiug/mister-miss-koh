import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { useAppStore } from '../../store/useAppStore';
import { SpoilerGuard } from '../../components/SpoilerGuard';
import { contestantById } from '../../domain/referential';

type Ref = NonNullable<ReturnType<typeof useAppStore.getState>['referential']>;

/**
 * Les vainqueurs d'une épreuve : des candidats, des tribus, ou les deux.
 *
 * Une tribu ne se déplie pas en ses membres — il faudrait savoir qui en
 * faisait partie CE SOIR-LÀ, et le référentiel date les appartenances en
 * jours quand les épisodes ne le sont pas. Elle se nomme donc telle quelle.
 */
function winners(
  ref: Ref,
  contestantIds: readonly string[],
  teamIds: readonly string[]
) {
  const parts = [
    ...teamIds.map(id => ref.teams.find(t => t.id === id)?.name ?? '?'),
    ...contestantIds.map(id => contestantById(ref, id)?.displayName ?? '?'),
  ];
  return parts.length === 0 ? '—' : parts.join(' et ');
}

export function EpisodesScreen() {
  const referential = useAppStore(s => s.referential);
  const watched = useAppStore(s => s.watched);
  const toggleWatched = useAppStore(s => s.toggleWatched);
  if (!referential) return null;

  return (
    <div className="stack">
      <h2>Épisodes</h2>
      <p className="muted">
        Cochez les épisodes vus : l’anti-spoiler masque ce qui vient après.
      </p>
      {referential.episodes.map(e => {
        const rounds = referential.rounds.filter(
          r => r.episodeNumber === e.number
        );
        const seen = watched.includes(e.number);
        return (
          <Card key={e.id} as="article">
            <CardHeader
              title={`Épisode ${e.number}`}
              subtitle={
                e.airDate
                  ? new Date(`${e.airDate}T00:00:00`).toLocaleDateString(
                      'fr-FR',
                      {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }
                    )
                  : undefined
              }
              action={
                e.aired ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={seen}
                      onChange={() => toggleWatched(e.number)}
                    />
                    <span>Vu</span>
                  </label>
                ) : (
                  <Badge tone="muted">à venir</Badge>
                )
              }
            />
            {e.aired && (
              <SpoilerGuard episodeNumber={e.number}>
                <dl className="stats">
                  <dt>Confort</dt>
                  <dd>
                    {winners(
                      referential,
                      e.comfortWinnerIds,
                      e.comfortWinnerTeamIds
                    )}
                  </dd>
                  <dt>Immunité</dt>
                  <dd>
                    {winners(
                      referential,
                      e.immunityWinnerIds,
                      e.immunityWinnerTeamIds
                    )}
                  </dd>
                  <dt>Conseil</dt>
                  <dd>
                    {rounds.length === 0
                      ? '—'
                      : rounds.map(r => (
                          <div key={r.id}>
                            {r.kind === 'annulled' && (
                              <Badge tone="muted" size="xs">
                                égalité, tour annulé
                              </Badge>
                            )}
                            {r.kind === 'vote' && (
                              <>
                                {contestantById(referential, r.eliminatedId)
                                  ?.displayName ?? '?'}{' '}
                                éliminé·e
                                {r.reportedVotesFor !== null && (
                                  <>
                                    {' '}
                                    ({r.reportedVotesFor}
                                    {r.reportedVotesTotal !== null &&
                                      `/${r.reportedVotesTotal}`}{' '}
                                    voix)
                                  </>
                                )}
                              </>
                            )}
                            {r.kind === 'linked' && (
                              <>
                                {contestantById(referential, r.eliminatedId)
                                  ?.displayName ?? '?'}{' '}
                                part avec son binôme{' '}
                                <Badge tone="muted" size="xs">
                                  0 voix
                                </Badge>
                              </>
                            )}
                          </div>
                        ))}
                  </dd>
                </dl>
              </SpoilerGuard>
            )}
          </Card>
        );
      })}
    </div>
  );
}
