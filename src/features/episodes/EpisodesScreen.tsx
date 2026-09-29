import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
import { TribeName } from '../../components/TribeName';
import { isWatched, lastWatched } from '../../domain/spoiler';
import { lastAiredEpisode } from '../../domain/referential';
import { councilView } from '../../domain/council';
import { useUndo } from '../../hooks/useUndo';
import { SpoilerStatusChip } from '../../components/SpoilerStatusChip';
import { CouncilDetail } from '../../components/CouncilDetail';

/** Ce que le garde d'un épisode dessine quand il le cache : toujours pareil. */
const EPISODE_ROWS = ['Confort', 'Immunité', 'Conseil'] as const;

/**
 * La vague d'une cascade de coches : l'épisode touché, et l'étendue qui a
 * changé avec lui. Au-delà de douze épisodes, la vague n'attend plus — elle
 * doit rester un geste, pas une attente.
 */
interface Wave {
  readonly from: number;
  readonly low: number;
  readonly high: number;
}
const WAVE_MAX_STEPS = 12;
const WAVE_CLEAR_MS = 1200;

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
    ...teamIds.map(id => {
      const team = data.teams.find(t => t.id === id);
      return team ? (
        <TribeName key={`t-${id}`} team={team} />
      ) : (
        <span key={`t-${id}`}>?</span>
      );
    }),
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
  const spoiler = useAppStore(s => s.spoiler);
  const toggleWatched = useAppStore(s => s.toggleWatched);
  const restoreWatched = useAppStore(s => s.restoreWatched);
  const haptics = useHaptics();
  const askUndo = useUndo();
  const [wave, setWave] = useState<Wave | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  const seenUpTo = lastWatched(watched);
  const aired = referential ? lastAiredEpisode(referential) : 0;
  const showMarker = seenUpTo >= 1 && seenUpTo < aired;

  // L'ÉCRAN S'OUVRE LÀ OÙ VOUS EN ÊTES. Une fois par visite, et seulement
  // quand la limite est assez bas pour que la chercher coûte un défilement.
  // Sans `smooth` : un saut à l'arrivée ne se lit pas comme un mouvement.
  useEffect(() => {
    if (scrolled.current || !showMarker || seenUpTo < 3) return;
    scrolled.current = true;
    marker.current?.scrollIntoView?.({ block: 'center' });
  }, [showMarker, seenUpTo]);

  // La vague s'efface une fois passée : un délai de transition resté posé
  // retarderait le geste suivant sur la même carte.
  useEffect(() => {
    if (!wave) return;
    const id = window.setTimeout(() => setWave(null), WAVE_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [wave]);

  if (!referential) return null;

  const onToggle = (episodeNumber: number, seen: boolean) => {
    const before = useAppStore.getState().watched;
    const from = lastWatched(before);
    if (!seen) haptics('seen');
    toggleWatched(episodeNumber);
    const to = lastWatched(useAppStore.getState().watched);
    setWave({
      from: episodeNumber,
      low: Math.min(from, to) + 1,
      high: Math.max(from, to),
    });
    // COCHER LE 8, C'EST COCHER DU 3 AU 8 ; décocher le 3 retire tout ce qui
    // suit. Un seul épisode qui change se voit ; plusieurs d'un coup, c'est
    // la règle qui agit à la place du geste — on le dit, et on offre de
    // revenir en arrière. Le suivi entier est remis tel quel.
    if (Math.abs(to - from) > 1) {
      askUndo({
        key: 'suivi',
        message:
          to > from
            ? `Épisodes ${from + 1} à ${to} marqués vus.`
            : `Épisodes ${to + 1} à ${from} retirés des vus.`,
        undo: async () => restoreWatched(before),
        undone: 'Suivi rétabli.',
      });
    }
  };

  const waveOf = (n: number): CSSProperties | undefined =>
    wave && n >= wave.low && n <= wave.high
      ? ({
          '--wave': Math.min(Math.abs(n - wave.from), WAVE_MAX_STEPS),
        } as CSSProperties)
      : undefined;

  return (
    <div className="stack">
      <PullToRefresh />
      <div className="screen-head">
        <h2>Épisodes</h2>
        <SpoilerStatusChip />
      </div>
      <p className="muted">
        Cochez les épisodes vus : l’anti-spoiler masque ce qui vient après.
      </p>
      {/* Une enveloppe, et rien d'autre : elle met les cartes en grille quand
          la fenêtre le permet. Sans elle, elles sont sœurs du titre d'écran et
          la grille l'emporterait avec elles. */}
      <div className="grid-cards">
        {referential.episodes.map(e => {
          // L'ORDRE DE LA SOIRÉE, dit par le rang et non par celui où les
          // lignes arrivent : la base ne promet aucun ordre, et l'arène
          // d'All Stars passait derrière le conseil qu'elle précède.
          const rounds = referential.rounds
            .filter(r => r.episodeNumber === e.number)
            .sort((a, b) => a.roundNumber - b.roundNumber);
          // « Vu » suit la même règle que l'anti-spoiler : en être au 5,
          // c'est avoir vu les quatre premiers.
          const seen = isWatched(e.number, watched);
          const style = waveOf(e.number);
          return (
            <Fragment key={e.id}>
              <Card
                as="article"
                data-seen={seen ? '' : undefined}
                className={style ? 'wave' : undefined}
                style={style}
              >
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
                          onChange={() => onToggle(e.number, seen)}
                        />
                        <span>Vu</span>
                      </label>
                    ) : (
                      <Badge tone="muted">à venir</Badge>
                    )
                  }
                />
                {e.aired && (
                  <SpoilerGuard episodeNumber={e.number} rows={EPISODE_ROWS}>
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
                          : rounds.map(r => {
                              const view = councilView(referential, r);
                              return (
                                <div key={r.id} className="council-round">
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
                                  {/* Zéro voix, et rien ne la cause : abandon,
                                  évacuation, arène — la source ne dit pas
                                  lequel, l'écran ne l'invente pas. */}
                                  {r.kind === 'departure' && (
                                    <>
                                      <ContestantLink
                                        data={referential}
                                        id={r.eliminatedId}
                                      />{' '}
                                      quitte l’aventure{' '}
                                      <Badge tone="muted" size="xs">
                                        sans vote
                                      </Badge>
                                    </>
                                  )}
                                  {view && (
                                    <details className="council">
                                      <summary>Détail des voix</summary>
                                      <CouncilDetail
                                        referential={referential}
                                        view={view}
                                      />
                                    </details>
                                  )}
                                </div>
                              );
                            })}
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
              {/* VOUS EN ÊTES LÀ. Le filet intérieur des cartes vues disait
                déjà « vu », carte par carte ; rien ne disait où s'arrête ce
                qu'on a vu. Un repère pleine largeur, entre le dernier épisode
                vu et le suivant — la limite anti-spoiler rendue visible. */}
              {showMarker && e.number === seenUpTo && (
                <div className="limit-marker" ref={marker} key={seenUpTo}>
                  <span className="limit-badge">
                    Vous en êtes là · épisode {seenUpTo}
                  </span>
                  {spoiler === 'hide_unwatched' && (
                    <span className="limit-note">la suite reste masquée</span>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
