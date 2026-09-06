/**
 * Masque ce qui dépasse la limite anti-spoiler, et le DIT.
 *
 * Un contenu masqué qui ne se signale pas passe pour absent ; l'utilisateur
 * ne sait pas qu'il y a quelque chose à découvrir, ni comment. Le garde rend
 * donc un bouton qui nomme l'épisode et propose de le marquer vu.
 */
import { useState, type ReactNode } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { isSpoiler } from '../domain/spoiler';
import { useAppStore } from '../store/useAppStore';
import { useSpoilerLimit } from '../hooks/useSpoilerLimit';

interface Props {
  episodeNumber: number | null;
  children: ReactNode;
  /** Ce que le bouton propose : « Marquer l'épisode 3 comme vu » par défaut. */
  label?: string;
}

export function SpoilerGuard({ episodeNumber, children, label }: Props) {
  const limit = useSpoilerLimit();
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
        {episodeNumber === null
          ? 'Masqué : cet événement dépasse ce que vous avez marqué comme vu.'
          : `Masqué : cet événement a lieu à l’épisode ${episodeNumber}.`}
      </p>
      {episodeNumber !== null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleWatched(episodeNumber)}
        >
          {label ?? `Marquer l’épisode ${episodeNumber} comme vu`}
        </Button>
      )}
    </div>
  );
}
