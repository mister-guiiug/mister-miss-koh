/**
 * Relire la page, puis recharger ce qui a été publié.
 *
 * Le bouton des Réglages est réservé au compte relecteur. Le résultat du lot
 * décide du message : publié, inchangé, ou encore en attente. Le rechargement
 * qui suit attend le serveur, pour que l'écran montre ce que le clic vient
 * d'écrire.
 */
import { useCallback, useState } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  refreshWikipedia,
  type WikipediaRefresh,
} from '../backend/refreshWikipedia';
import { useAppStore } from '../store/useAppStore';

export function useRereadWikipedia(): {
  reread: () => Promise<void>;
  reading: boolean;
} {
  const reload = useAppStore(s => s.reload);
  const toast = useToast();
  const [reading, setReading] = useState(false);

  const reread = useCallback(async () => {
    setReading(true);
    useAppStore.setState({ error: null });
    let lecture: WikipediaRefresh;
    try {
      lecture = await refreshWikipedia(useAppStore.getState().season);
    } catch (cause) {
      lecture = {
        kind: 'failed',
        message:
          cause instanceof Error
            ? cause.message
            : 'La relecture de Wikipédia n’a pas abouti.',
      };
    }
    try {
      await reload({ manual: true });
    } finally {
      setReading(false);
    }
    const { error } = useAppStore.getState();
    if (error) {
      toast.error(error);
      return;
    }
    if (lecture.kind === 'published') {
      toast.success('Wikipédia relu et publié.');
      return;
    }
    if (lecture.kind === 'held') {
      toast.info(
        'Wikipédia relu. Une partie du changement attend une relecture avant publication.'
      );
      return;
    }
    if (lecture.kind === 'unchanged') {
      toast.success('Wikipédia n’a pas bougé depuis la dernière lecture.');
      return;
    }
    if (lecture.kind === 'anonymous' || lecture.kind === 'forbidden') {
      toast.info('Relire Wikipédia demande un compte relecteur.');
      return;
    }
    if (lecture.kind === 'failed') {
      toast.error(lecture.message);
    }
  }, [reload, toast]);

  return { reread, reading };
}
