import { describe, expect, it } from 'vitest';
import { createPhotoStore, type PhotoDb } from './photos';

/** Une base de fantaisie : deux dictionnaires, aucune IndexedDB. */
function fakeDb() {
  const kv = new Map<string, unknown>();
  const blobs = new Map<string, Blob>();
  const db: PhotoDb = {
    get: <T>(key: string, fallback: T) =>
      Promise.resolve((kv.get(key) as T) ?? fallback),
    set: (key, value) => {
      kv.set(key, value);
      return Promise.resolve(true);
    },
    getBlob: key => Promise.resolve(blobs.get(key)),
    setBlob: (key, blob) => {
      blobs.set(key, blob);
      return Promise.resolve(true);
    },
    removeBlob: key => {
      blobs.delete(key);
      return Promise.resolve(true);
    },
  };
  return { db, kv, blobs };
}

const image = (nom: string) => new Blob([nom], { type: 'image/jpeg' });

describe('le rangement des portraits', () => {
  it('range, relit, et tient son index — le magasin ne sait pas énumérer les blobs', async () => {
    const { db, kv, blobs } = fakeDb();
    const store = createPhotoStore(db);

    expect(await store.loadAll()).toEqual({});

    await store.save('c-ael', image('ael'));
    await store.save('c-bastien', image('bastien'));

    expect(kv.get('photo-index')).toEqual(['c-ael', 'c-bastien']);
    expect([...blobs.keys()]).toEqual(['photo:c-ael', 'photo:c-bastien']);
    expect(Object.keys(await store.loadAll())).toEqual(['c-ael', 'c-bastien']);
  });

  it('remplacer un portrait n’ajoute pas une seconde entrée d’index', async () => {
    const { db, kv } = fakeDb();
    const store = createPhotoStore(db);

    const apres = image('après');
    await store.save('c-ael', image('avant'));
    await store.save('c-ael', apres);

    expect(kv.get('photo-index')).toEqual(['c-ael']);
    const photos = await store.loadAll();
    // C'est bien la SECONDE image qui est rangée sous cette clé.
    expect(photos['c-ael']).toBe(apres);
  });

  it('retirer efface le blob ET la ligne d’index', async () => {
    const { db, kv, blobs } = fakeDb();
    const store = createPhotoStore(db);

    await store.save('c-ael', image('ael'));
    await store.save('c-bastien', image('bastien'));
    await store.remove('c-ael');

    expect(kv.get('photo-index')).toEqual(['c-bastien']);
    expect(blobs.has('photo:c-ael')).toBe(false);
    expect(Object.keys(await store.loadAll())).toEqual(['c-bastien']);
  });

  it('un index qui nomme un blob absent rend ce qui existe, sans lever', async () => {
    // Une base vidée à moitié n'est pas une erreur à réparer : on affiche les
    // portraits qui restent.
    const { db, blobs } = fakeDb();
    const store = createPhotoStore(db);

    await store.save('c-ael', image('ael'));
    await store.save('c-bastien', image('bastien'));
    blobs.delete('photo:c-ael');

    expect(Object.keys(await store.loadAll())).toEqual(['c-bastien']);
  });
});
