/**
 * Tirer vers le bas pour recharger le référentiel — sur l'écran qui le rend,
 * et lui seul : le crochet du socle n'écoute que tant que ce composant est
 * monté. Sans lui, la seule façon d'actualiser était un bouton enfoui dans
 * les Réglages.
 *
 * L'indicateur suit le doigt (`--pull`, de 0 à 1), puis tourne le temps du
 * rechargement. Seule l'actualisation en cours est ANNONCÉE : le tirage
 * lui-même est un geste, pas un état à lire.
 */
import type { CSSProperties } from 'react';
import { usePullToRefresh } from '@mister-guiiug/dev-pwa-config/react/use-pull-to-refresh';
import { useRefreshReferential } from '../hooks/useRefreshReferential';
import { useHaptics } from '../hooks/useHaptics';

export function PullToRefresh() {
  const refresh = useRefreshReferential();
  const haptics = useHaptics();
  const { pulling, progress, refreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
      haptics('refreshed');
    },
  });

  return (
    <div
      className="pull"
      data-active={pulling || refreshing ? '' : undefined}
      data-refreshing={refreshing ? '' : undefined}
      style={{ '--pull': refreshing ? 1 : progress } as CSSProperties}
    >
      <span className="pull-spinner" aria-hidden="true" />
      <span role="status">{refreshing ? 'Actualisation…' : ''}</span>
    </div>
  );
}
