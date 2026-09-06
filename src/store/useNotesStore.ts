/**
 * Les notes de la personne connectée, en un seul endroit.
 *
 * L'écran Notes gardait sa liste pour lui. Dès qu'une note se lit AUSSI sur
 * la fiche d'un candidat ou sous un épisode, trois écrans demanderaient trois
 * fois la même liste au serveur, et une note écrite ici n'apparaîtrait pas
 * là. Le magasin la charge une fois par session et la partage ; les écrans
 * la dérivent (`useMemo`, jamais dans un sélecteur — voir useAppStore).
 *
 * Le dépôt est INJECTABLE : les tests passent un dépôt de fantaisie sans
 * jamais toucher au client Supabase.
 */
import { create } from 'zustand';
import {
  type Note,
  type NoteDraft,
  type NotesRepository,
  notesRepository,
} from '../backend/notes';

export interface NotesState {
  /** `null` = pas encore chargées (ou personne de connecté). */
  notes: Note[] | null;
  loading: boolean;
  error: string | null;
  load(): Promise<void>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: string, patch: Partial<NoteDraft>): Promise<Note>;
  remove(id: string): Promise<void>;
  /** À la déconnexion : la liste du compte précédent ne doit pas survivre. */
  reset(): void;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

export function createNotesStore(repository: NotesRepository) {
  return create<NotesState>((set, get) => ({
    notes: null,
    loading: false,
    error: null,

    async load() {
      if (get().loading) return;
      set({ loading: true });
      try {
        const notes = await repository.list();
        set({ notes, error: null });
      } catch (cause) {
        set({ error: message(cause) });
      } finally {
        set({ loading: false });
      }
    },

    async create(draft) {
      const note = await repository.create(draft);
      // Les plus récentes d'abord, comme le serveur les rend.
      set({ notes: [note, ...(get().notes ?? [])], error: null });
      return note;
    },

    async update(id, patch) {
      const note = await repository.update(id, patch);
      set({
        notes: (get().notes ?? []).map(n => (n.id === id ? note : n)),
        error: null,
      });
      return note;
    },

    async remove(id) {
      await repository.remove(id);
      set({ notes: (get().notes ?? []).filter(n => n.id !== id), error: null });
    },

    reset() {
      set({ notes: null, loading: false, error: null });
    },
  }));
}

export const useNotesStore = createNotesStore(notesRepository);
