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
import {
  type ShareLink,
  type SharingRepository,
  sharingRepository,
} from '../backend/sharing';

export interface NotesState {
  /** `null` = pas encore chargées (ou personne de connecté). */
  notes: Note[] | null;
  /** Les liens de partage vivants ; `null` tant qu'ils n'ont pas été lus. */
  links: ShareLink[] | null;
  loading: boolean;
  error: string | null;
  load(): Promise<void>;
  loadLinks(): Promise<void>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: string, patch: Partial<NoteDraft>): Promise<Note>;
  remove(id: string): Promise<void>;
  /** Défait une suppression. La note revient à sa place dans la liste. */
  restore(id: string): Promise<Note>;
  /** Ouvre une note à la lecture par lien, et range le lien obtenu. */
  shareNote(noteId: string): Promise<ShareLink>;
  /** Un lien pour toutes les notes déjà ouvertes. Réutilise celui qui existe. */
  shareCollection(label: string): Promise<ShareLink>;
  /** Révoque, et referme la visibilité de la note concernée. */
  revokeLink(link: ShareLink): Promise<void>;
  /** Ouvre ou referme une note SANS créer de lien : elle entre dans la collection. */
  setShareable(noteId: string, shareable: boolean): Promise<void>;
  /** À la déconnexion : la liste du compte précédent ne doit pas survivre. */
  reset(): void;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * L'ordre du serveur : épinglées d'abord, puis la plus récemment modifiée.
 *
 * Une note restaurée ne se remet pas là où elle était : le déclencheur
 * `personal_notes_touch` a rafraîchi `updated_at` en même temps que
 * `deleted_at`. La replacer à sa place d'avant ferait mentir la liste jusqu'au
 * prochain rechargement, qui la déplacerait sous les yeux de l'utilisateur.
 */
function ordered(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function createNotesStore(
  repository: NotesRepository,
  sharing: SharingRepository = sharingRepository
) {
  /** La visibilité d'une note, mise à jour sur place après une écriture. */
  const withVisibility = (
    notes: Note[] | null,
    id: string,
    visibility: Note['visibility']
  ) => (notes ?? []).map(n => (n.id === id ? { ...n, visibility } : n));

  return create<NotesState>((set, get) => ({
    notes: null,
    links: null,
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

    /**
     * La note rendue par le serveur, pas celle qu'on avait gardée : afficher
     * une copie locale ferait passer pour restaurée une note que la base a pu
     * refuser de rendre.
     */
    async restore(id) {
      const note = await repository.restore(id);
      const others = (get().notes ?? []).filter(n => n.id !== id);
      set({ notes: ordered([note, ...others]), error: null });
      return note;
    },

    async loadLinks() {
      const links = await sharing.list();
      set({ links, error: null });
    },

    async shareNote(noteId) {
      const link = await sharing.shareNote(noteId, null);
      set({
        // La note est ouverte à la lecture : l'écran doit le montrer AVANT
        // que quiconque ouvre le lien, sinon il promet moins qu'il ne fait.
        notes: withVisibility(get().notes, noteId, 'link'),
        links: [link, ...(get().links ?? [])],
        error: null,
      });
      return link;
    },

    async shareCollection(label) {
      // UN SEUL LIEN DE COLLECTION SUFFIT : il nomme une règle, pas une liste.
      // En créer un second donnerait deux adresses pour la même chose, à
      // révoquer toutes les deux — et le serveur n'en tolère que vingt par
      // heure.
      const existing = (get().links ?? []).find(
        l => l.scope === 'note_collection'
      );
      if (existing) return existing;
      const link = await sharing.shareCollection(label);
      set({ links: [link, ...(get().links ?? [])], error: null });
      return link;
    },

    async revokeLink(link) {
      await sharing.revoke(link);
      set({
        links: (get().links ?? []).filter(l => l.id !== link.id),
        notes:
          link.scope === 'note' && link.noteId
            ? withVisibility(get().notes, link.noteId, 'private')
            : get().notes,
        error: null,
      });
    },

    async setShareable(noteId, shareable) {
      await sharing.setShareable(noteId, shareable);
      set({
        notes: withVisibility(
          get().notes,
          noteId,
          shareable ? 'link' : 'private'
        ),
        error: null,
      });
    },

    reset() {
      set({ notes: null, links: null, loading: false, error: null });
    },
  }));
}

export const useNotesStore = createNotesStore(notesRepository);
