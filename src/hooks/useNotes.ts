/**
 * Les notes du compte courant, chargées quand un compte existe et oubliées
 * quand il s'en va. Tout écran qui montre une note passe par ici : c'est ce
 * qui fait qu'une note écrite sur une fiche apparaît aussitôt sur l'écran
 * Notes, sans rechargement.
 */
import { useEffect } from 'react';
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
      if (notes === null && !loading) void load();
    } else if (account === null && notes !== null) {
      reset();
    }
  }, [available, account, notes, loading, load, reset]);

  return { account, available, notes, loading, error };
}
