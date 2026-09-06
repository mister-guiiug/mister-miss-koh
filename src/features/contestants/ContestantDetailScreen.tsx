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
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { contestantById } from '../../domain/referential';
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
      departure:
        referential.departures.find(d => d.contestantId === id) ?? null,
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
        action={<Link to="/candidats">Retour à la liste</Link>}
      />
    );
  }

  const { contestant, departure, advantages } = view;
  const favorite = favorites.includes(contestant.id);
  const cause = contestantById(referential, departure?.causedById ?? null);
  const team = referential.teams.find(t => t.id === contestant.teamId) ?? null;
  const source = referential.provenance;

  return (
    <div className="stack">
      <Link to="/candidats">← Candidats</Link>
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
          <Avatar contestant={contestant} size="lg" />
          <div className="identity-main">
            <ContestantTraits contestant={contestant} size="md" />
            <p className="chips-row">
              <Badge tone={view.stillIn ? 'success' : 'muted'}>
                {view.stillIn ? 'en jeu' : 'sorti·e'}
              </Badge>
              {team && <Badge tone="info">{team.name}</Badge>}
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
