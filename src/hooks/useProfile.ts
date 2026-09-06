/**
 * Le profil du compte courant, chargé quand un compte existe et oublié quand
 * il s'en va — exactement comme `useNotes` pour les notes.
 */
import { useEffect } from 'react';
import { useSession } from './useSession';
import { useProfileStore } from '../store/useProfileStore';

export function useProfile() {
  const { account, available } = useSession();
  const profile = useProfileStore(s => s.profile);
  const loading = useProfileStore(s => s.loading);
  const error = useProfileStore(s => s.error);
  const load = useProfileStore(s => s.load);
  const reset = useProfileStore(s => s.reset);

  useEffect(() => {
    if (!available) return;
    if (account) {
      if (profile === undefined && !loading) void load();
    } else if (account === null && profile !== undefined) {
      reset();
    }
  }, [available, account, profile, loading, load, reset]);

  return { account, available, profile, loading, error };
}
