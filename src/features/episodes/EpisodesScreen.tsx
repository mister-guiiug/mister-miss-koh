import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { useAppStore } from '../../store/useAppStore';
import { SpoilerGuard } from '../../components/SpoilerGuard';
import { PullToRefresh } from '../../components/PullToRefresh';
import { TargetNotes } from '../../components/TargetNotes';
import { useHaptics } from '../../hooks/useHaptics';
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { contestantById } from '../../domain/referential';

type Ref = NonNullable<ReturnType<typeof useAppStore.getState>['referential']>;

/** Le prénom d'un candidat, cliquable vers sa fiche — ou « ? » s'il est inconnu. */
function ContestantLink({ data, id }: { data: Ref; id: string | null }) {
  const contestant = contestantById(data, id);
  if (!contestant) return <>?</>;
  return (
    <Link to={`/candidats/${contestant.id}`}>{contestant.displayName}</Link>
  );
}

/**
 * Les vainqueurs d'une épreuve : des candidats, des tribus, ou les deux.
 *
 * Une tribu ne se déplie pas en ses membres — il faudrait savoir qui en
 * faisait partie CE SOIR-LÀ, et le référentiel date les appartenances en
 * jours quand les épisodes ne le sont pas. Elle se nomme donc telle quelle ;
 * un candidat, lui, mène à sa fiche.
 */
function Winners({
  data,
  contestantIds,
  teamIds,
}: {
  data: Ref;
  contestantIds: readonly string[];
  teamIds: readonly string[];
}) {
  const parts: ReactNode[] = [
    ...teamIds.map(id => (
      <span key={`t-${id}`}>
        {data.teams.find(t => t.id === id)?.name ?? '?'}
      </span>
    )),
    ...contestantIds.map(id => (
      <ContestantLink key={`c-${id}`} data={data} id={id} />
    )),
  ];
  if (parts.length === 0) return <>—</>;
  return (
    <>
      {parts.flatMap((part, index) =>
        index === 0 ? [part] : [<span key={`et-${index}`}> et </span>, part]
      )}
    </>
  );
}

export function EpisodesScreen() {
  const referential = useAppStore(s => s.referential);
  const watched = useAppStore(s => s.watched);
  const toggleWatched = useAppStore(s => s.toggleWatched);
  const haptics = useHaptics();
  if (!referential) return null;

  return (
    <div className="stack">
      <PullToRefresh />
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
          <Card key={e.id} as="article" data-seen={seen ? '' : undefined}>
            <CardHeader
              title={`Épisode ${e.number}`}
              subtitle={
                e.airDate
                  ? formatDate(`${e.airDate}T00:00:00`, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : undefined
              }
              action={
                e.aired ? (
                  // Une pastille autour d'une VRAIE case : le clavier, le
                  // lecteur d'écran et le script de captures la trouvent.
                  <label className="seen">
                    <input
                      type="checkbox"
                      checked={seen}
                      onChange={() => {
                        if (!seen) haptics('seen');
                        toggleWatched(e.number);
                      }}
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
                    <Winners
                      data={referential}
                      contestantIds={e.comfortWinnerIds}
                      teamIds={e.comfortWinnerTeamIds}
                    />
                  </dd>
                  <dt>Immunité</dt>
                  <dd>
                    <Winners
                      data={referential}
                      contestantIds={e.immunityWinnerIds}
                      teamIds={e.immunityWinnerTeamIds}
                    />
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
                                <ContestantLink
                                  data={referential}
                                  id={r.eliminatedId}
                                />{' '}
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
                                <ContestantLink
                                  data={referential}
                                  id={r.eliminatedId}
                                />{' '}
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
            {/* Vos notes sur l'épisode : à vous, donc hors du garde
                anti-spoiler — vous savez ce que vous y avez écrit. */}
            {e.aired && (
              <TargetNotes
                target="episode"
                targetId={e.id}
                label={`l’épisode ${e.number}`}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
