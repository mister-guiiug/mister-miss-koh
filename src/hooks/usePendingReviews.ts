/**
 * File des propositions Wikipédia en attente de relecture.
 *
 * Réservé au compte relecteur. Après Valider / Rejeter, recharge le
 * référentiel pour que « Publier le lot en attente » voie l'état à jour.
 */
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@mister-guiiug/dev-pwa-config/react/toast';
import {
  annonceRevue,
  listPendingDifferences,
  refreshPendingPreview,
  reviewPendingDifference,
  resumeDifference,
  type PendingDifference,
  type ReviewPending,
} from '../backend/reviewPendingDifferences';
import { useAppStore } from '../store/useAppStore';

export function usePendingReviews(enabled: boolean): {
  items: PendingDifference[];
  loading: boolean;
  busyId: string | null;
  resume: typeof resumeDifference;
  decide: (id: string, decision: 'validated' | 'rejected') => Promise<void>;
  reload: () => Promise<void>;
} {
  const season = useAppStore(s => s.season);
  const reloadReferential = useAppStore(s => s.reload);
  const toast = useToast();
  const [items, setItems] = useState<PendingDifference[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const resultat = await listPendingDifferences(season);
      setItems(resultat.kind === 'ok' ? resultat.items : []);
    } finally {
      setLoading(false);
    }
  }, [enabled, season]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = useCallback(
    async (id: string, decision: 'validated' | 'rejected') => {
      setBusyId(id);
      let resultat: ReviewPending;
      try {
        resultat = await reviewPendingDifference(id, decision);
      } catch (cause) {
        resultat = {
          kind: 'failed',
          message:
            cause instanceof Error
              ? cause.message
              : 'La relecture de la proposition a échoué.',
        };
      }
      try {
        // AVANT de relire : la relecture propose l'aperçu s'il est prêt.
        if (resultat.kind === 'ok') await refreshPendingPreview(season);
        await reloadReferential({ manual: true });
        await reload();
      } finally {
        setBusyId(null);
      }
      const annonce = annonceRevue(resultat);
      if (annonce?.tone === 'success') toast.success(annonce.text);
      else if (annonce?.tone === 'info') toast.info(annonce.text);
      else if (annonce?.tone === 'error') toast.error(annonce.text);
    },
    [reload, reloadReferential, season, toast]
  );

  return {
    items,
    loading,
    busyId,
    resume: resumeDifference,
    decide,
    reload,
  };
}
