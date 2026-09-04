/**
 * La limite anti-spoiler courante, dérivée de l'état — dans son propre
 * fichier pour que `SpoilerGuard.tsx` n'exporte qu'un composant (Fast Refresh
 * ne recharge à chaud qu'un module de composants purs).
 */
import { useMemo } from 'react';
import { spoilerLimit } from '../domain/spoiler';
import { useAppStore } from '../store/useAppStore';

export function useSpoilerLimit(): number {
  const spoiler = useAppStore(s => s.spoiler);
  const watched = useAppStore(s => s.watched);
  const referential = useAppStore(s => s.referential);
  return useMemo(
    () =>
      spoilerLimit({
        mode: spoiler,
        watched: new Set(watched),
        today: new Date().toISOString().slice(0, 10),
        episodes: referential?.episodes ?? [],
      }),
    [spoiler, watched, referential]
  );
}
