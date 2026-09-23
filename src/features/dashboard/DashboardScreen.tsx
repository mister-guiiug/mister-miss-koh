import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Stat } from '@mister-guiiug/dev-pwa-config/react/stat';
import { BarChart } from '@mister-guiiug/dev-pwa-config/react/sparkline';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { useAppStore } from '../../store/useAppStore';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { inGame, lastAiredEpisode } from '../../domain/stats';
import { contestantById, type Departure } from '../../domain/referential';
import { comebacksOf } from '../../domain/tribes';
import { AppAnimation } from '../../animations/AppAnimation';
import { TribeName } from '../../components/TribeName';

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
    // DANS UNE SOIRÉE, L'ORDRE DE LA SOURCE : le rang de chaque sortie. Sans
    // lui, c'était l'ordre où la base rend ses lignes — juste par chance pour
    // l'arène d'All Stars, et à la merci de la moindre mise à jour. Une sortie
    // de rang inconnu passe après les autres.
    const rank = (d: Departure) => d.roundNumber ?? Number.MAX_SAFE_INTEGER;
    const out = referential.departures
      .filter(d => d.episodeNumber !== null && d.episodeNumber <= upTo)
      .sort(
        (a, b) =>
          (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) || rank(a) - rank(b)
      );
    // LES RETOURS AUSSI SONT DES ÉVÉNEMENTS. Maxime, sorti à l'épisode 1,
    // revient dans Sebako à l'épisode 4 : une chronologie qui ne montrerait
    // que sa sortie le laisserait dehors pour de bon.
    const backs = referential.contestants.flatMap(c =>
      comebacksOf(referential, c)
        .filter(b => b.episodeNumber <= upTo)
        .map(b => ({ ...b, contestantId: c.id }))
    );
    const timeline = [
      ...out.map(d => ({
        kind: 'exit' as const,
        episodeNumber: d.episodeNumber ?? 0,
        d,
      })),
      ...backs.map(b => ({
        kind: 'back' as const,
        episodeNumber: b.episodeNumber,
        b,
      })),
    ].sort(
      (x, y) =>
        x.episodeNumber - y.episodeNumber ||
        (x.kind === 'back' ? -1 : 1) - (y.kind === 'back' ? -1 : 1) ||
        (x.kind === 'exit' && y.kind === 'exit' ? rank(x.d) - rank(y.d) : 0)
    );
    // Un départ par épisode, de 1 à `upTo` : c'est le RYTHME des éliminations,
    // qu'aucun chiffre isolé ne raconte. Les épisodes sans départ valent zéro
    // et doivent rester dans la suite — un creux fait partie de la forme.
    const parEpisode = Array.from(
      { length: Math.max(0, upTo) },
      (_, i) => out.filter(d => d.episodeNumber === i + 1).length
    );
    return {
      upTo,
      inGame: [...still],
      departures: out,
      timeline,
      // DES PERSONNES, pas des sorties : on peut sortir deux fois, et revenir.
      outCount: referential.contestants.length - still.size,
      parEpisode,
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
        {/* TROIS CHIFFRES, PAS UNE PHRASE À DÉCHIFFRER. « Épisode 0 sur 3 · 18
            encore en jeu · 0 parti » demandait de lire une ligne pour en
            extraire trois valeurs. `Stat` vient du socle : il pose le chiffre
            au-dessus de son libellé, dans la taille qui convient à un tableau
            de bord. */}
        <div className="stat-row">
          <Stat
            label={`Épisode sur ${referential.episodes.length}`}
            value={view.upTo}
          />
          <Stat label="Encore en jeu" value={view.inGame.length} />
          <Stat
            label={view.outCount > 1 ? 'Parti·e·s' : 'Parti·e'}
            value={view.outCount}
          />
        </div>
        {/* LE RYTHME DES DÉPARTS, que trois chiffres ne disent pas : deux
            éliminations d'affilée puis un épisode sans conseil, ce n'est pas
            la même saison qu'un départ par semaine. Le graphique n'apparaît
            qu'à partir de deux épisodes révélés — sur un seul, il n'y a pas de
            rythme, juste une barre. */}
        {view.upTo >= 2 && (
          <BarChart
            values={view.parEpisode}
            className="departures-chart"
            aria-label={`Départs par épisode, de 1 à ${view.upTo}`}
          />
        )}
        {view.hidden && (
          <p className="muted">
            Des événements plus récents sont masqués par votre réglage
            anti-spoiler.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Vos favoris" />
        {favorites.length === 0 && (
          <EmptyState
            icon={<AppAnimation name="empty" />}
            title="Aucun favori"
            description="L’étoile d’une fiche de candidat les ajoute ici. Ils restent sur cet appareil."
            action={
              <Link
                data-dwc="button"
                data-variant="outline"
                data-size="sm"
                to="/candidats"
              >
                Parcourir les candidats
              </Link>
            }
          />
        )}
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
          /* LA BRAISE QUI S'ÉTEINT, ici et nulle part ailleurs : c'est
             exactement ce que cette carte compte. Le rôle `torch-out` attendait
             un `.riv` depuis le premier jour et n'affichait rien. */
          <EmptyState
            icon={<AppAnimation name="torch-out" />}
            title="Aucun départ"
            description={
              view.upTo === 0
                ? 'La saison n’a pas encore commencé — ou votre réglage anti-spoiler n’a encore rien révélé.'
                : 'Personne n’est parti sur les épisodes que vous avez vus.'
            }
          />
        ) : (
          <ol className="timeline">
            {view.timeline.map(event => {
              if (event.kind === 'back') {
                const { b } = event;
                const c = contestantById(referential, b.contestantId);
                return (
                  <li key={`back:${b.contestantId}:${b.episodeNumber}`}>
                    <span>
                      {b.episodeKnown
                        ? `Épisode ${b.episodeNumber}`
                        : `Jour ${b.fromDay ?? '?'}`}
                    </span>{' '}
                    <Link to={`/candidats/${b.contestantId}`}>
                      {c?.displayName ?? '?'}
                    </Link>{' '}
                    <Badge tone="success" size="xs">
                      retour
                    </Badge>
                    {b.team && (
                      <span className="muted">
                        {' '}
                        — dans <TribeName team={b.team} />
                      </span>
                    )}
                  </li>
                );
              }
              const { d } = event;
              const c = contestantById(referential, d.contestantId);
              const cause = contestantById(referential, d.causedById);
              return (
                <li key={`exit:${d.contestantId}:${d.episodeNumber}`}>
                  <span>Épisode {d.episodeNumber}</span>{' '}
                  <Link to={`/candidats/${d.contestantId}`}>
                    {c?.displayName ?? '?'}
                  </Link>{' '}
                  <Badge
                    tone={d.kind === 'vote' ? 'danger' : 'muted'}
                    size="xs"
                  >
                    {kindLabel(d)}
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

function kindLabel(departure: Departure): string {
  switch (departure.kind) {
    case 'vote':
      return 'éliminé·e au vote';
    case 'linked_pair':
      // Sans cause nommée, ce n'est pas un binôme : jusqu'à 0028, toute
      // sortie à zéro voix se publiait sous ce genre-là.
      return departure.causedById ? 'départ lié au binôme' : 'sortie sans vote';
    case 'other':
      return 'sortie sans vote';
    case 'quit':
      return 'abandon';
    case 'medical':
      return 'évacuation';
    case 'banned':
      return 'bannissement';
    default:
      return departure.kind;
  }
}
