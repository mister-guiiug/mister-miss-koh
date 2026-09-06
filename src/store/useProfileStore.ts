/**
 * Le profil du compte courant, en un seul endroit.
 *
 * TROIS ÉTATS, PAS DEUX. `undefined` = on n'a pas encore regardé ; `null` =
 * regardé, et il n'y en a pas. Les confondre ferait clignoter « vous n'avez pas
 * de pseudonyme » sur l'écran de quelqu'un qui en a un, le temps d'une lecture.
 * C'est la convention de `useSession` pour le compte lui-même.
 *
 * Le dépôt est INJECTABLE : les tests passent un dépôt de fantaisie sans jamais
 * toucher au client Supabase.
 */
import { create } from 'zustand';
import {
  type Profile,
  type ProfileDraft,
  type ProfileRepository,
  profileRepository,
} from '../backend/profile';

export interface ProfileState {
  /** `undefined` = pas encore lu. `null` = lu, et il n'y en a pas. */
  profile: Profile | null | undefined;
  loading: boolean;
  error: string | null;
  load(): Promise<void>;
  save(draft: ProfileDraft): Promise<Profile>;
  /** `false` si l'identifiant est pris, réservé, ou mal formé. */
  isHandleFree(candidate: string): Promise<boolean>;
  /** À la déconnexion : le profil du compte précédent ne doit pas survivre. */
  reset(): void;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function createProfileStore(repository: ProfileRepository) {
  return create<ProfileState>((set, get) => ({
    profile: undefined,
    loading: false,
    error: null,

    async load() {
      if (get().loading) return;
      set({ loading: true });
      try {
        set({ profile: await repository.load(), error: null });
      } catch (cause) {
        // Le profil reste `undefined` : on n'a RIEN appris, et prétendre qu'il
        // n'y en a pas inviterait à en créer un second.
        set({ error: message(cause) });
      } finally {
        set({ loading: false });
      }
    },

    async save(draft) {
      const profile = await repository.save(draft);
      set({ profile, error: null });
      return profile;
    },

    isHandleFree(candidate) {
      return repository.handleAvailable(candidate);
    },

    reset() {
      set({ profile: undefined, loading: false, error: null });
    },
  }));
}

export const useProfileStore = createProfileStore(profileRepository);
