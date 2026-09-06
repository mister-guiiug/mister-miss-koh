import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhotosStore } from './usePhotosStore';
import type { PhotoStore } from '../backend/photos';

/**
 * `URL.createObjectURL` n'existe pas dans jsdom : on le remplace par un
 * compteur, ce qui permet EN PLUS de vérifier que chaque URL remplacée est
 * bien révoquée — le vrai risque de ce magasin.
 */
const revoked: string[] = [];
let compteur = 0;

beforeEach(() => {
  revoked.length = 0;
  compteur = 0;
  vi.stubGlobal('URL', {
    createObjectURL: () => `blob:${(compteur += 1)}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

function fakeStore(initial: Record<string, Blob> = {}) {
  const photos = { ...initial };
  const store: PhotoStore = {
    loadAll: () => Promise.resolve({ ...photos }),
    get: id => Promise.resolve(photos[id]),
    save: (id, blob) => {
      photos[id] = blob;
      return Promise.resolve();
    },
    remove: id => {
      delete photos[id];
      return Promise.resolve();
    },
  };
  return { store, photos };
}

const image = () => new Blob(['x'], { type: 'image/jpeg' });
const fichier = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
/** Le compresseur du socle a besoin d'un canevas : ici, un passe-plat. */
const passePlat = (file: File): Promise<Blob> => Promise.resolve(file);

describe('les portraits en mémoire', () => {
  it('charge une fois, et une seconde demande ne relit rien', async () => {
    const { store } = fakeStore({ 'c-ael': image() });
    const lecture = vi.spyOn(store, 'loadAll');
    const usePhotos = createPhotosStore(store, passePlat);

    await usePhotos.getState().load();
    expect(usePhotos.getState().urls).toEqual({ 'c-ael': 'blob:1' });
    expect(usePhotos.getState().ready).toBe(true);

    await usePhotos.getState().load();
    expect(lecture).toHaveBeenCalledTimes(1);
  });

  it('remplacer un portrait révoque l’URL précédente, jamais la nouvelle', async () => {
    const { store } = fakeStore({ 'c-ael': image() });
    const usePhotos = createPhotosStore(store, passePlat);
    await usePhotos.getState().load();

    await usePhotos.getState().attach('c-ael', fichier());

    expect(usePhotos.getState().urls['c-ael']).toBe('blob:2');
    expect(revoked).toEqual(['blob:1']);
  });

  it('retirer un portrait l’efface du magasin, de l’écran, et libère son URL', async () => {
    const { store, photos } = fakeStore({ 'c-ael': image() });
    const usePhotos = createPhotosStore(store, passePlat);
    await usePhotos.getState().load();

    await usePhotos.getState().detach('c-ael');

    expect(usePhotos.getState().urls).toEqual({});
    expect(photos['c-ael']).toBeUndefined();
    expect(revoked).toEqual(['blob:1']);
  });

  it('relit un blob depuis la base, pas depuis l’URL affichée', async () => {
    // Partager exige le BLOB, et l'URL d'objet ne se relit pas : `fetch` sur
    // une `blob:` tombe sous la directive `connect-src` de notre CSP.
    const original = image();
    const { store } = fakeStore({ 'c-ael': original });
    const usePhotos = createPhotosStore(store, passePlat);
    await usePhotos.getState().load();

    expect(await usePhotos.getState().read('c-ael')).toBe(original);
    expect(await usePhotos.getState().read('c-inconnu')).toBeUndefined();
  });

  it('un premier portrait ne révoque rien', async () => {
    const { store } = fakeStore();
    const usePhotos = createPhotosStore(store, passePlat);
    await usePhotos.getState().load();

    await usePhotos.getState().attach('c-ael', fichier());

    expect(usePhotos.getState().urls['c-ael']).toBe('blob:1');
    expect(revoked).toEqual([]);
  });
});
