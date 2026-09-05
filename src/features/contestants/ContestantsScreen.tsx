import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { useAppStore } from '../../store/useAppStore';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { inGame, lastAiredEpisode } from '../../domain/stats';
import { groupingOf } from '../../domain/rules';
import { isSpoiler } from '../../domain/spoiler';
import type { Contestant, Referential } from '../../domain/referential';

type Status = 'tous' | 'en-jeu' | 'sorti';

interface Row extends Contestant {
  inGame: boolean;
  favorite: boolean;
}

interface Group {
  key: string;
  label: string;
  rows: Row[];
}

/**
 * Les groupes de l'édition suivie.
 *
 * PAR DUO OU PAR TRIBU, selon ce que la saison est — `groupingOf` le lit dans
 * les données. Un duo n'apparaît que s'il a été RÉVÉLÉ par un départ, et pas
 * avant l'épisode qui l'a révélé : la source ne liste les duos nulle part, on
 * ne les connaît qu'a posteriori, et les afficher plus tôt divulgâcherait ce
 * départ. Les autres se rangent sous « Duo non révélé », qui n'est pas un aveu
 * de manque mais l'état réel de ce qu'on sait.
 */
function groupsOf(ref: Referential, rows: Row[], limit: number): Group[] {
  const byId = new Map(rows.map(r => [r.id, r]));

  if (groupingOf(ref) === 'pair') {
    const groups: Group[] = [];
    const placed = new Set<string>();

    for (const pair of ref.pairs) {
      if (isSpoiler(pair.revealEpisodeNumber, limit)) continue;
      const members = pair.memberIds
        .map(id => byId.get(id))
        .filter((r): r is Row => r !== undefined);
      if (members.length === 0) continue;
      for (const m of members) placed.add(m.id);
      groups.push({
        key: pair.id,
        label: pair.memberIds
          .map(id => ref.contestants.find(c => c.id === id)?.displayName ?? '?')
          .join(' et '),
        rows: members,
      });
    }

    const rest = rows.filter(r => !placed.has(r.id));
    if (rest.length > 0) {
      groups.push({ key: 'duo-inconnu', label: 'Duo non révélé', rows: rest });
    }
    return groups;
  }

  const groups: Group[] = [];
  for (const team of ref.teams) {
    const members = rows.filter(r => r.teamId === team.id);
    if (members.length > 0) {
      groups.push({ key: team.id, label: team.name, rows: members });
    }
  }
  const rest = rows.filter(r => !r.teamId);
  if (rest.length > 0) {
    groups.push({ key: 'sans-tribu', label: 'Sans tribu', rows: rest });
  }
  return groups;
}

export function ContestantsScreen() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const limit = useSpoilerLimit();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('tous');

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
      .filter(
        c => status === 'tous' || (status === 'en-jeu' ? c.inGame : !c.inGame)
      );
    return groupsOf(referential, rows, limit);
  }, [referential, favorites, limit, query, status]);

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
        <label className="field">
          <span>Statut</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as Status)}
          >
            <option value="tous">Tous</option>
            <option value="en-jeu">En jeu</option>
            <option value="sorti">Sorti·e</option>
          </select>
        </label>
      </div>
      {total === 0 ? (
        <EmptyState
          title="Aucun candidat"
          description="Aucun nom ne correspond à ce filtre."
        />
      ) : (
        groups.map(group => (
          <section key={group.key}>
            {showHeadings && <h3 className="group-title">{group.label}</h3>}
            <ul className="list">
              {group.rows.map(c => (
                <li key={c.id} className="row">
                  <Link to={`/candidats/${c.id}`}>{c.displayName}</Link>
                  <Badge tone={c.inGame ? 'success' : 'muted'} size="xs">
                    {c.inGame ? 'en jeu' : 'sorti·e'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label={
                      c.favorite
                        ? `Retirer ${c.displayName} des favoris`
                        : `Ajouter ${c.displayName} aux favoris`
                    }
                    aria-pressed={c.favorite}
                    onClick={() => toggleFavorite(c.id)}
                  >
                    <Star
                      size={18}
                      aria-hidden
                      fill={c.favorite ? 'currentColor' : 'none'}
                    />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
