import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-wpa-config/react/badge';
import { Button } from '@mister-guiiug/dev-wpa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-wpa-config/react/empty-state';
import { useAppStore } from '../../store/useAppStore';
import { useSpoilerLimit } from '../../hooks/useSpoilerLimit';
import { inGame, lastAiredEpisode } from '../../domain/stats';

export function ContestantsScreen() {
  const referential = useAppStore(s => s.referential);
  const favorites = useAppStore(s => s.favorites);
  const toggleFavorite = useAppStore(s => s.toggleFavorite);
  const limit = useSpoilerLimit();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    if (!referential) return [];
    const upTo = Math.min(limit, lastAiredEpisode(referential));
    const still = new Set(inGame(referential, upTo));
    const q = query.trim().toLowerCase();
    return referential.contestants
      .filter(c => !q || c.displayName.toLowerCase().includes(q))
      .map(c => ({
        ...c,
        inGame: still.has(c.id),
        favorite: favorites.includes(c.id),
      }));
  }, [referential, favorites, limit, query]);

  if (!referential) return null;

  return (
    <div className="stack">
      <h2>Candidats</h2>
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
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun candidat"
          description="Aucun nom ne correspond."
        />
      ) : (
        <ul className="list">
          {rows.map(c => (
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
      )}
    </div>
  );
}
