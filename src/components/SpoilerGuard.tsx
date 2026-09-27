/**
 * Masque ce qui dépasse la limite anti-spoiler, et le DIT.
 *
 * Un contenu masqué qui ne se signale pas passe pour absent. Le garde le dit,
 * SANS NOMMER L'ÉPISODE : « à l'épisode 5 » apprenait déjà qu'il s'était passé
 * quelque chose ce soir-là. Le bouton n'avance QUE D'UN ÉPISODE — marquer le 5
 * alors qu'on en est à 0 révélait tout d'un coup, parce que la limite est le
 * maximum des épisodes cochés.
 */
import { useState, type ReactNode } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { isSpoiler } from '../domain/spoiler';
import { lastAiredEpisode } from '../domain/referential';
import { useAppStore } from '../store/useAppStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';

interface Props {
  episodeNumber: number | null;
  children: ReactNode;
  /** Plusieurs faits masqués d'un coup : un seul bandeau, pas une pile. */
  count?: number;
}

export function SpoilerGuard({ episodeNumber, children, count = 1 }: Props) {
  const limit = useSpoilerLimit();
  const referential = useAppStore(s => s.referential);
  const toggleWatched = useAppStore(s => s.toggleWatched);
  const spoiler = isSpoiler(episodeNumber, limit);

  // Ce que le garde montrait AU RENDU PRÉCÉDENT. Un contenu qui vient d'être
  // démasqué entre en mouvement (`.reveal`) ; un contenu visible au montage
  // reste en place — l'écran, lui, a déjà fait son entrée, et il se remonte à
  // chaque navigation. Motif de la documentation React (« storing information
  // from previous renders ») : l'état est corrigé pendant le rendu, sous
  // condition, et React rejoue le rendu avant de peindre quoi que ce soit.
  const [previous, setPrevious] = useState({ spoiler, revealed: false });
  if (previous.spoiler !== spoiler) {
    setPrevious({ spoiler, revealed: previous.spoiler && !spoiler });
  }

  if (!spoiler) {
    return previous.revealed ? (
      <div className="reveal">{children}</div>
    ) : (
      <>{children}</>
    );
  }

  return (
    <div
      className="spoiler"
      role="group"
      aria-label="Contenu masqué (anti-spoiler)"
    >
      <p>
        {count > 1
          ? `Masqué : ${count} faits se passent après ce que vous avez vu.`
          : 'Masqué : cela se passe après ce que vous avez vu.'}
      </p>
      {referential &&
        Number.isFinite(limit) &&
        limit + 1 <= lastAiredEpisode(referential) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleWatched(limit + 1)}
          >
            Avancer d’un épisode
          </Button>
        )}
    </div>
  );
}
