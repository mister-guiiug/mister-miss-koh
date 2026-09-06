import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { useAppStore } from '../../store/useAppStore';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { Avatar } from '../../components/Avatar';
import { ContestantTraits } from '../../components/ContestantTraits';
import { FavoriteButton } from '../../components/FavoriteButton';
import { inGame, lastAiredEpisode } from '../../domain/stats';
import {
  effectivePairs,
  groupingWithGuesses,
  membersInDisplayOrder,
  type PairGuess,
} from '../../domain/pairing';
import type { Contestant, Referential } from '../../domain/referential';
import {
  CONTESTANT_FILTER_OPTIONS,
  filterLabel,
  matchesFilter,
  type ContestantFilter,
} from '../../domain/contestantFilter';

interface Row extends Contestant {
  inGame: boolean;
  favorite: boolean;
}

interface Group {
  key: string;
  label: string;
  /** Le duo vient d'une supposition, pas de la source : ça se dit. */
  guessed: boolean;
  rows: Row[];
}

/**
 * Les groupes de l'édition suivie.
 *
 * PAR DUO OU PAR TRIBU, selon ce que la saison est — `groupingWithGuesses` le
 * lit dans les données, ou dans le fait qu'on ait supposé un duo. Un duo de la
 * SOURCE n'apparaît que s'il a été révélé par un départ, et pas avant
 * l'épisode qui l'a révélé : la source ne liste les duos nulle part, on ne les
 * connaît qu'a posteriori, et les afficher plus tôt divulgâcherait ce départ.
 * Un duo SUPPOSÉ, lui, s'affiche tout de suite — il est de vous — et porte sa
 * mention. Les autres se rangent sous « Duo non révélé », qui n'est pas un
 * aveu de manque mais l'état réel de ce qu'on sait.
 */
function groupsOf(
  ref: Referential,
  rows: Row[],
  guesses: readonly PairGuess[],
  limit: number
): Group[] {
  const byId = new Map(rows.map(r => [r.id, r]));

  if (groupingWithGuesses(ref, guesses) === 'pair') {
    const groups: Group[] = [];
    const placed = new Set<string>();

    for (const pair of effectivePairs(ref, guesses, limit)) {
      // LES DAMES D'ABORD, puis les hommes — un ordre d'AFFICHAGE seulement.
      // `pair.memberIds` reste rangé par identifiant : c'est ce qui fait qu'un
      // duo est une valeur, et que sa clé ne dépend pas d'un tri. Le titre du
      // groupe et ses lignes lisent la MÊME liste, sinon l'un annoncerait un
      // ordre que l'autre contredirait juste en dessous.
      const shown = membersInDisplayOrder(ref, pair.memberIds);
      const members = shown
        .map(id => byId.get(id))
        .filter((r): r is Row => r !== undefined);
      if (members.length === 0) continue;
      for (const m of members) placed.add(m.id);
      groups.push({
        key: pair.key,
        label: shown
          .map(id => ref.contestants.find(c => c.id === id)?.displayName ?? '?')
          .join(' et '),
        guessed: pair.origin === 'guess',
        rows: members,
      });
    }

    const rest = rows.filter(r => !placed.has(r.id));
    if (rest.length > 0) {
      groups.push({
        key: 'duo-inconnu',
        label: 'Duo non révélé',
        guessed: false,
        rows: rest,
      });
    }
    return groups;
  }

  const groups: Group[] = [];
  for (const team of ref.teams) {
    const members = rows.filter(r => r.teamId === team.id);
    if (members.length > 0) {
      groups.push({
        key: team.id,
        label: team.name,
        guessed: false,
        rows: members,
      });
    }
  }
  const rest = rows.filter(r => !r.teamId);
  if (rest.length > 0) {
    groups.push({
      key: 'sans-tribu',
      label: 'Sans tribu',
      guessed: false,
      rows: rest,
    });
  }
  return groups;
}

export function ContestantsScreen() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const limit = useSpoilerLimit();
  const [query, setQuery] = useState('');
  // Le filtre, lui, n'est PAS un état d'écran : il vit dans les données
  // personnelles, comme les favoris — le reprendre à chaque visite était le
  // geste de trop.
  const status = useAppStore(s => s.contestantFilter);
  const setStatus = useAppStore(s => s.setContestantFilter);

  const guesses = useAppStore(s => s.pairGuesses);

  const groups = useMemo(() => {
    if (!referential) return [];
    const upTo = Math.min(limit, lastAiredEpisode(referential));
    const still = new Set(inGame(referential, upTo));
    const q = query.trim().toLowerCase();
    const rows: Row[] = referential.contestants
      .map(c => ({
        ...c,
        inGame: still.has(c.id),
        favorite: favorites.includes(c.id),
      }))
      .filter(c => !q || c.displayName.toLowerCase().includes(q))
      .filter(c => matchesFilter(status, c.inGame));
    return groupsOf(referential, rows, guesses, limit);
  }, [referential, favorites, guesses, limit, query, status]);

  if (!referential) return null;

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  // Un seul groupe qui contient tout le monde n'apprend rien : on le tait.
  const showHeadings = groups.length > 1;

  return (
    <div className="stack">
      <h2>Candidats</h2>
      <div className="filters">
        <label className="field">
          <span>Filtrer</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Un prénom…"
            autoComplete="off"
          />
        </label>
        <div className="field">
          <span>Statut</span>
          <SegmentedControl
            ariaLabel="Statut"
            value={status}
            onChange={value => setStatus(value as ContestantFilter)}
            options={[...CONTESTANT_FILTER_OPTIONS]}
            fullWidth
          />
        </div>
      </div>
      {total === 0 ? (
        /* Le filtre est RETENU d'une visite à l'autre : arriver sur une liste
           vide sans savoir lequel est posé serait une énigme. On nomme donc
           celui qui vide, et on distingue le filtre de la recherche. */
        <EmptyState
          title="Aucun candidat"
          description={
            query.trim()
              ? `Aucun nom ne correspond à « ${query.trim()} », filtre « ${filterLabel(status)} ».`
              : `Le filtre « ${filterLabel(status)} » ne laisse personne.`
          }
        />
      ) : (
        groups.map(group => (
          <section key={group.key}>
            {showHeadings && (
              <h3 className="group-title">
                {group.label}{' '}
                {group.guessed && (
                  <Badge tone="warning" size="xs">
                    supposé
                  </Badge>
                )}
              </h3>
            )}
            {/* L'indice ne dépend PAS du titre : tant qu'aucun duo n'est
                connu, il n'y a qu'un groupe, son titre se tait — et c'est
                exactement le moment où l'on cherche où sont les duos. */}
            {group.key === 'duo-inconnu' && (
              <p className="muted group-hint">
                La source ne nomme un duo qu’au départ de l’un des deux. Depuis
                la fiche d’un candidat, vous pouvez supposer son binôme.
              </p>
            )}
            <ul className="list">
              {group.rows.map(c => (
                <li key={c.id} className="row">
                  <Avatar contestant={c} />
                  {/* Le lien ne porte QUE le nom : y enfermer l'âge et le sexe
                      allongerait son nom accessible sans rien y ajouter. */}
                  <span className="row-main">
                    <Link to={`/candidats/${c.id}`}>{c.displayName}</Link>
                    <ContestantTraits contestant={c} />
                  </span>
                  <Badge tone={c.inGame ? 'success' : 'muted'} size="xs">
                    {c.inGame ? 'en jeu' : 'sorti·e'}
                  </Badge>
                  <FavoriteButton
                    name={c.displayName}
                    favorite={c.favorite}
                    onToggle={() => toggleFavorite(c.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
