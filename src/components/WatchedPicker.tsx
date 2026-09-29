/**
 * « Où en êtes-vous ? » en un geste : l'épisode jusqu'où l'on a regardé.
 *
 * DES NUMÉROS ET DES DATES, RIEN D'AUTRE. Ce choix s'offre à qui n'a encore
 * rien coché — un nouveau venu, le lecteur d'une note partagée — donc à qui
 * n'a encore aucune limite : il ne doit rien apprendre en choisissant.
 */
import { formatDate } from '@mister-guiiug/dev-pwa-config/format';
import { useAppStore } from '../store/useAppStore';
import { lastWatched } from '../domain/spoiler';

export function WatchedPicker({ label }: { label: string }) {
  const referential = useAppStore(s => s.referential);
  const watched = useAppStore(s => s.watched);
  const setWatchedUpTo = useAppStore(s => s.setWatchedUpTo);
  if (!referential) return null;

  const aired = referential.episodes
    .filter(e => e.aired)
    .sort((a, b) => a.number - b.number);

  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={lastWatched(watched)}
        onChange={e => setWatchedUpTo(Number(e.target.value))}
      >
        <option value={0}>Je n’ai encore rien vu</option>
        {aired.map(e => (
          <option key={e.id} value={e.number}>
            {`Épisode ${e.number}`}
            {e.airDate ? ` — ${formatDate(`${e.airDate}T00:00:00`)}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
