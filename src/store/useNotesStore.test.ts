import { describe, expect, it, vi } from 'vitest';
import { createNotesStore } from './useNotesStore';
import type { Note, NotesRepository } from '../backend/notes';
import type { ShareLink, SharingRepository } from '../backend/sharing';

const note = (
  id: string,
  visibility: Note['visibility'] = 'private'
): Note => ({
  id,
  title: null,
  body: 'un texte',
  rating: null,
  isDraft: false,
  isPinned: false,
  visibility,
  updatedAt: '2026-09-06T10:00:00.000Z',
  target: 'season_contestant',
  targetId: `c-${id}`,
});

const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  id: 'l-1',
  token: 'jeton',
  scope: 'note',
  noteId: 'n-1',
  label: null,
  viewCount: 0,
  createdAt: '2026-09-06T10:00:00.000Z',
  ...over,
});

function fakeNotes(initial: Note[]): NotesRepository {
  return {
    list: () => Promise.resolve(initial),
    create: () => Promise.reject(new Error('non utilisé')),
    update: () => Promise.reject(new Error('non utilisé')),
    remove: () => Promise.resolve(),
  };
}

function fakeSharing(over: Partial<SharingRepository> = {}): SharingRepository {
  return {
    list: () => Promise.resolve([]),
    shareNote: () => Promise.resolve(link()),
    shareCollection: () =>
      Promise.resolve(
        link({ id: 'l-2', scope: 'note_collection', noteId: null })
      ),
    revoke: () => Promise.resolve(),
    setShareable: () => Promise.resolve(),
    readNote: () => Promise.resolve([]),
    readCollection: () => Promise.resolve([]),
    ...over,
  };
}

async function loaded(notes: Note[], sharing = fakeSharing()) {
  const store = createNotesStore(fakeNotes(notes), sharing);
  await store.getState().load();
  return store;
}

describe('partager une note', () => {
  it('la montre « partagée » AVANT que quiconque ouvre le lien', async () => {
    const store = await loaded([note('n-1')]);

    await store.getState().shareNote('n-1');

    expect(store.getState().notes?.[0]?.visibility).toBe('link');
    expect(store.getState().links?.[0]?.token).toBe('jeton');
  });

  it('révoquer retire le lien ET referme la note', async () => {
    const store = await loaded([note('n-1', 'link')]);
    store.setState({ links: [link()] });

    await store.getState().revokeLink(link());

    expect(store.getState().links).toEqual([]);
    expect(store.getState().notes?.[0]?.visibility).toBe('private');
  });
});

describe('le lien de collection', () => {
  it('n’en crée qu’UN : il nomme une règle, pas une liste', async () => {
    // Deux adresses pour la même chose seraient deux à révoquer — et le
    // serveur n'en tolère que vingt par heure.
    const shareCollection = vi.fn(() =>
      Promise.resolve(
        link({ id: 'l-2', scope: 'note_collection', noteId: null })
      )
    );
    const store = await loaded([note('n-1')], fakeSharing({ shareCollection }));

    const first = await store.getState().shareCollection('Mes notes');
    const second = await store.getState().shareCollection('Mes notes');

    expect(shareCollection).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(store.getState().links).toHaveLength(1);
  });

  it('le révoquer ne touche à aucune note', async () => {
    const collection = link({
      id: 'l-2',
      scope: 'note_collection',
      noteId: null,
    });
    const store = await loaded([note('n-1', 'link')]);
    store.setState({ links: [collection] });

    await store.getState().revokeLink(collection);

    expect(store.getState().links).toEqual([]);
    // La note reste ouverte : c'est l'adresse qu'on a éteinte, pas la vanne.
    expect(store.getState().notes?.[0]?.visibility).toBe('link');
  });
});

describe('entrer dans la collection, en sortir', () => {
  it('rend la note partageable, puis privée, sans créer de lien', async () => {
    const store = await loaded([note('n-1')]);

    await store.getState().setShareable('n-1', true);
    expect(store.getState().notes?.[0]?.visibility).toBe('link');
    expect(store.getState().links).toBeNull();

    await store.getState().setShareable('n-1', false);
    expect(store.getState().notes?.[0]?.visibility).toBe('private');
  });
});

describe('la déconnexion', () => {
  it('emporte les liens autant que les notes', async () => {
    const store = await loaded([note('n-1')]);
    store.setState({ links: [link()] });

    store.getState().reset();

    expect(store.getState().notes).toBeNull();
    expect(store.getState().links).toBeNull();
  });
});
