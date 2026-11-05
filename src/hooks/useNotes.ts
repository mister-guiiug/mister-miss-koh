/**
 * Les notes du compte courant, chargées quand un compte existe et oubliées
 * quand il s'en va. Tout écran qui montre une note passe par ici : c'est ce
 * qui fait qu'une note écrite sur une fiche apparaît aussitôt sur l'écran
 * Notes, sans rechargement.
 */
import { useEffect } from 'react';
import { useRetryWhenOnline } from '@mister-guiiug/dev-pwa-config/react/use-retry-when-online';
import { useSession } from './useSession';
import { useNotesStore } from '../store/useNotesStore';

export function useNotes() {
  const { account, available } = useSession();
  const notes = useNotesStore(s => s.notes);
  const loading = useNotesStore(s => s.loading);
  const error = useNotesStore(s => s.error);
  const load = useNotesStore(s => s.load);
  const reset = useNotesStore(s => s.reset);

  useEffect(() => {
    if (!available) return;
    if (account) {
      // PAS APRÈS UN ÉCHEC : `loading` retombe aussitôt la lecture ratée, et
      // cet effet la relançait sans fin — une requête après l'autre hors
      // connexion, l'écran Notes qui clignotait. Le rattrapage est plus bas.
      if (notes === null && !loading && error === null) void load();
    } else if (account === null && notes !== null) {
      reset();
    }
  }, [available, account, notes, loading, error, load, reset]);

  // Une lecture ratée repart au retour du réseau, une fois : le geste du
  // socle, promu depuis le `useReferentialRetry` de cette app.
  useRetryWhenOnline(
    available && Boolean(account) && notes === null && error !== null,
    load
  );

  return { account, available, notes, loading, error };
}
