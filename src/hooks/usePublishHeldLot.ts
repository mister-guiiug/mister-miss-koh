/**
 * Publier le lot en attente, puis recharger l'écran.
 *
 * Réservé au compte relecteur, comme « Relire Wikipédia ». Ne relance pas
 * l'import : reprend le run `diffed` déjà posé.
 */
import { useCallback, useState } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  annoncePublication,
  publishHeldLot,
  type PublishHeld,
} from '../backend/publishHeldLot';
import { useAppStore } from '../store/useAppStore';

export function usePublishHeldLot(): {
  publish: () => Promise<void>;
  publishing: boolean;
} {
  const reload = useAppStore(s => s.reload);
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  const publish = useCallback(async () => {
    setPublishing(true);
    useAppStore.setState({ error: null });
    let resultat: PublishHeld;
    try {
      resultat = await publishHeldLot(useAppStore.getState().season);
    } catch (cause) {
      resultat = {
        kind: 'failed',
        message:
          cause instanceof Error
            ? cause.message
            : 'La publication du lot en attente a échoué.',
      };
    }
    try {
      await reload({ manual: true });
    } finally {
      setPublishing(false);
    }
    const { error } = useAppStore.getState();
    const annonce = annoncePublication(resultat, error);
    if (annonce?.tone === 'success') toast.success(annonce.text);
    else if (annonce?.tone === 'info') toast.info(annonce.text);
    else if (annonce?.tone === 'error') toast.error(annonce.text);
  }, [reload, toast]);

  return { publish, publishing };
}
