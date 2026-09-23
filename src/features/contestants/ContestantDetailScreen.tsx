import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { useAppStore } from '../../store/useAppStore';
import { SpoilerGuard } from '../../components/SpoilerGuard';
import { Avatar } from '../../components/Avatar';
import { ContestantTraits } from '../../components/ContestantTraits';
import { PhotoPicker } from '../../components/PhotoPicker';
import { PhotoShare } from '../../components/PhotoShare';
import { FavoriteButton } from '../../components/FavoriteButton';
import { PairBlock } from '../../components/PairBlock';
import { TargetNotes } from '../../components/TargetNotes';
import { TribeName } from '../../components/TribeName';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { contestantById, type Departure } from '../../domain/referential';
import { comebacksOf, teamAt, type Comeback } from '../../domain/tribes';
import {
  challengeWins,
  councilsAttended,
  inGame,
  lastAiredEpisode,
  votesCast,
  votesReceived,
  type Counted,
} from '../../domain/stats';

/** « 3 » quand tout est connu, « ≥ 3 » sinon : jamais la même chose pour les deux. */
function counted(c: Counted): string {
  return c.complete ? String(c.value) : `≥ ${c.value}`;
}

/**
 * L'ancre de la section des candidats sur la page source. MediaWiki nomme
 * une section par son titre ; « Candidats » est l'un des trois que le
 * pipeline exige, il existe donc sur toute page importée.
 */
const CANDIDATES_ANCHOR = '#Candidats';

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
      // Le binôme — source ou supposé — est tout entier dans `PairBlock` :
      // il dépend des suppositions, que cette dérivation n'a pas à connaître.
      //
      // ON SORT, ON REVIENT, ON RESSORT : Charlotte quitte l'aventure à
      // l'épisode 3, revient dans Taboga à l'épisode 4, et ressort au 5. Son
      // statut est une CHRONOLOGIE, chaque ligne derrière sa garde.
      events: chronology(
        referential.departures.filter(d => d.contestantId === id),
        comebacksOf(referential, contestant)
      ),
      // La tribu À LA LIMITE : celle que l'utilisateur a vue se former.
      team: teamAt(referential, contestant, upTo),
      // Les avantages qu'il ou elle a tenus, dans l'ordre du tableau source.
      advantages: referential.advantages.filter(a => a.holderIds.includes(id)),
      received: votesReceived(referential, id, upTo),
      cast: votesCast(referential, id, upTo),
      councils: councilsAttended(referential, id, upTo),
      wins: challengeWins(referential, id, upTo),
      // « En jeu » se dit à la limite anti-spoiler, comme sur la liste : la
      // fiche ne révèle pas plus que ce que l'utilisateur accepte de voir.
      stillIn: inGame(referential, upTo).includes(id),
      upTo,
    };
  }, [referential, id, limit]);

  if (!referential) return null;
  if (!view) {
    return (
      <EmptyState
        title="Candidat introuvable"
        action={
          <Link
            data-dwc="button"
            data-variant="outline"
            data-size="sm"
            to="/candidats"
          >
            Retour à la liste
          </Link>
        }
      />
    );
  }

  const { contestant, events, team, advantages } = view;
  const favorite = favorites.includes(contestant.id);
  const source = referential.provenance;

  return (
    <div className="stack">
      {/* LE RETOUR EST UNE COMMANDE, pas une ligne de texte. Mesuré à 24 px de
          haut sur toute la largeur de l'écran : une cible étroite là où c'est
          le geste le plus probable après avoir lu une fiche. En bouton fantôme,
          il rejoint la famille des autres actions et tient ses 44 px. */}
      <Link
        data-dwc="button"
        data-variant="ghost"
        data-size="sm"
        to="/candidats"
        className="back-link"
      >
        ← Candidats
      </Link>
      {/* `identity-card` porte le RYTHME VERTICAL de la fiche : ses blocs se
          suivaient sans respirer — trois écarts de 0 px d'affilée entre le
          dépôt d'une photo, le CV, le binôme et le lien source. Des blocs qui
          se touchent se lisent comme des blocs qui se chevauchent, et c'est
          bien ce qu'on voyait. Un rythme posé une fois vaut mieux qu'une
          marge ajoutée bloc par bloc. */}
      <Card className="identity-card">
        <CardHeader
          as="h2"
          title={contestant.displayName}
          action={
            <FavoriteButton
              name={contestant.displayName}
              favorite={favorite}
              onToggle={() => toggleFavorite(contestant.id)}
              labelled
            />
          }
        />
        <div className="identity">
          <Avatar contestant={contestant} size="lg" zoomable />
          <div className="identity-main">
            <ContestantTraits contestant={contestant} size="md" />
            <p className="chips-row">
              <Badge tone={view.stillIn ? 'success' : 'muted'}>
                {view.stillIn ? 'en jeu' : 'sorti·e'}
              </Badge>
              {team && (
                <Badge tone="info">
                  <TribeName team={team} describe />
                </Badge>
              )}
              {contestant.finalJury && <Badge tone="warning">Jury final</Badge>}
            </p>
          </div>
        </div>

        {/* Le CV : ce que la source dit de la personne AVANT cette saison,
            une ligne par participation, dans l'ordre où la page les cite. */}
        <dl className="stats">
          <dt>Saisons précédentes</dt>
          <dd>
            {contestant.previousSeasons.length === 0 ? (
              <span className="muted">
                aucune citée par la source : première participation
              </span>
            ) : (
              <ol className="cv-seasons">
                {contestant.previousSeasons.map((season, index) => (
                  <li key={index}>{season}</li>
                ))}
              </ol>
            )}
          </dd>
        </dl>

        {/* Le binôme de la source, la supposition qui la précède, et ce que
            l'une est devenue quand l'autre a parlé. */}
        <PairBlock contestant={contestant} />

        {source.kind === 'wikipedia' && source.url && (
          // Le lien va DIRECTEMENT à la section des candidats de la page
          // source : c'est là que chaque ligne de cette fiche a été lue. La
          // page ne lie pas les prénoms à des articles propres, il n'y a
          // donc rien de plus précis à offrir.
          <p>
            <a
              data-dwc="button"
              data-variant="outline"
              data-size="sm"
              href={`${source.url}${CANDIDATES_ANCHOR}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir sur Wikipédia <ExternalLink size={16} aria-hidden />
            </a>
          </p>
        )}

        {/* LES OUTILS PASSENT APRÈS CE QU'ON VIENT LIRE, ET REPLIÉS.
            Déposer une photo, la remplacer, la retirer, l'enregistrer, en
            confier une copie pour un jour : cinq boutons et deux paragraphes
            d'explication, qui occupaient le haut de la fiche et repoussaient
            plus bas les saisons précédentes, le binôme et la source — c'est-
            à-dire ce qu'on ouvre une fiche pour lire. Ils se déplient d'un
            clic quand on les cherche.

            `<details>` natif, pas un état : le clavier, le lecteur d'écran et
            la recherche du navigateur le connaissent déjà. */}
        <details className="photo-tools">
          <summary>Photo et partage</summary>
          <PhotoPicker contestant={contestant} />
          {/* Ne s'affiche qu'une fois un portrait déposé — il n'y a rien à
              partager avant, et l'annoncer serait promettre du vide. */}
          <PhotoShare contestant={contestant} />
        </details>

        <TargetNotes
          target="season_contestant"
          targetId={contestant.id}
          label={contestant.displayName}
          invite
        />
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
        {events.length === 0 ? (
          <Badge tone="success">Encore en jeu</Badge>
        ) : (
          events.map(event =>
            event.kind === 'exit' ? (
              <SpoilerGuard
                key={`exit-${event.episodeNumber}`}
                episodeNumber={event.episodeNumber}
              >
                <ExitLine
                  referential={referential}
                  departure={event.departure}
                />
              </SpoilerGuard>
            ) : (
              <SpoilerGuard
                key={`back-${event.episodeNumber}`}
                episodeNumber={event.episodeNumber}
              >
                <p>
                  {/* L'épisode ne s'écrit que s'il est SÛR : estimé, il n'est
                      qu'une garde anti-spoiler, pas une date à afficher. */}
                  <Badge tone="success">
                    {event.comeback.episodeKnown
                      ? `De retour à l’épisode ${event.episodeNumber}`
                      : 'De retour'}
                  </Badge>
                  {event.comeback.fromDay && (
                    <>
                      {event.comeback.episodeKnown ? ' · jour ' : ' au jour '}
                      {event.comeback.fromDay}
                    </>
                  )}
                  {event.comeback.team && (
                    <>
                      {' '}
                      — dans <TribeName team={event.comeback.team} describe />
                    </>
                  )}
                </p>
              </SpoilerGuard>
            )
          )
        )}
      </Card>

      {advantages.length > 0 && (
        <Card>
          <CardHeader title="Avantages" />
          {advantages.map(a => (
            <SpoilerGuard
              key={a.id}
              episodeNumber={a.revealEpisodeNumber}
              label="Révéler l’avantage"
            >
              <p>
                <Badge tone="info">Collier d’immunité</Badge>{' '}
                {a.label && <>trouvé au « {a.label} »</>}
                {a.foundDay && <> · jour {a.foundDay}</>}
                {' — '}
                {a.status === 'used' && a.playedEpisodeNumber
                  ? `joué à l’épisode ${a.playedEpisodeNumber}`
                  : a.status === 'used'
                    ? 'joué'
                    : a.status === 'not_used'
                      ? 'pas encore joué'
                      : 'la source ne dit pas ce qu’il est devenu'}
                {a.holderIds.length > 1 && <> · trouvé à deux</>}
              </p>
            </SpoilerGuard>
          ))}
        </Card>
      )}
    </div>
  );
}

type StatusEvent =
  | { kind: 'exit'; episodeNumber: number | null; departure: Departure }
  | { kind: 'back'; episodeNumber: number; comeback: Comeback };

/**
 * Sorties et retours, dans l'ordre des épisodes.
 *
 * À épisode égal, le retour d'abord : revenir et ressortir dans la même
 * soirée se raconte dans cet ordre. Une sortie sans épisode connu vient en
 * dernier — sa garde la masque de toute façon, faute de savoir quand.
 */
function chronology(
  departures: readonly Departure[],
  comebacks: readonly Comeback[]
): StatusEvent[] {
  const events: StatusEvent[] = [
    ...departures.map(d => ({
      kind: 'exit' as const,
      episodeNumber: d.episodeNumber,
      departure: d,
    })),
    ...comebacks.map(c => ({
      kind: 'back' as const,
      episodeNumber: c.episodeNumber,
      comeback: c,
    })),
  ];
  const rank = (e: StatusEvent) => e.episodeNumber ?? Number.POSITIVE_INFINITY;
  return events.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.kind === 'back' ? -1 : 1) - (b.kind === 'back' ? -1 : 1)
  );
}

/** Une sortie : l'épisode, le jour s'il est connu, et ce qui l'a causée. */
function ExitLine({
  referential,
  departure,
}: {
  referential: NonNullable<
    ReturnType<typeof useAppStore.getState>['referential']
  >;
  departure: Departure;
}) {
  const cause = contestantById(referential, departure.causedById);
  // Zéro voix, et rien ne la cause : un abandon, une évacuation, une
  // élimination à l'arène — la source ne dit pas lequel, l'écran non plus.
  const silent = departure.kind !== 'vote' && !cause;
  return (
    <p>
      <Badge tone="danger">Sorti·e à l’épisode {departure.episodeNumber}</Badge>
      {departure.day && <> · jour {departure.day}</>}
      {cause && (
        <>
          {' '}
          — à la suite de{' '}
          <Link to={`/candidats/${cause.id}`}>{cause.displayName}</Link>
        </>
      )}
      {silent && <> — sans vote</>}
    </p>
  );
}
