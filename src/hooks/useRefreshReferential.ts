/**
 * Recharger le référentiel ET LE DIRE.
 *
 * Le bouton des Réglages tournait son spinner puis se taisait. D'où vient la
 * lecture obtenue — le serveur, la dernière version enregistrée, la
 * démonstration — est pourtant la seule chose qu'on veut savoir après avoir
 * demandé une actualisation ; le magasin la connaît déjà (`origin`, `notice`),
 * il ne restait qu'à la montrer.
 */
import { useCallback } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useAppStore } from '../store/useAppStore';

export function useRefreshReferential(): () => Promise<void> {
  const reload = useAppStore(s => s.reload);
  const toast = useToast();

  return useCallback(async () => {
    await reload();
    const { origin, notice, error } = useAppStore.getState();
    if (error) {
      toast.error(error);
    } else if (origin === 'server') {
      toast.success('Référentiel à jour.');
    } else {
      toast.info(notice ?? 'Référentiel rechargé.');
    }
  }, [reload, toast]);
}
