import { describe, expect, it, vi } from 'vitest';
import { createProfileStore } from './useProfileStore';
import type { Profile, ProfileRepository } from '../backend/profile';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'u-1',
  pseudonym: 'Tarzan',
  handle: 'tarzan',
  updatedAt: '2026-09-06T10:00:00.000Z',
  ...over,
});

function fakeRepository(over: Partial<ProfileRepository> = {}) {
  return {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(profile()),
    handleAvailable: () => Promise.resolve(true),
    ...over,
  } satisfies ProfileRepository;
}

describe('les trois états du profil', () => {
  it('`undefined` avant lecture, `null` après une lecture sans profil', async () => {
    const store = createProfileStore(fakeRepository());
    expect(store.getState().profile).toBeUndefined();

    await store.getState().load();

    expect(store.getState().profile).toBeNull();
  });

  it('une lecture EN ÉCHEC laisse `undefined`, pas `null`', async () => {
    // Dire « il n'y en a pas » après une panne inviterait à en créer un
    // second, que la clé primaire refuserait.
    const store = createProfileStore(
      fakeRepository({ load: () => Promise.reject(new Error('réseau')) })
    );

    await store.getState().load();

    expect(store.getState().profile).toBeUndefined();
    expect(store.getState().error).toBe('réseau');
  });

  it('deux lectures simultanées n’en font qu’une', async () => {
    const load = vi.fn(() => Promise.resolve(profile()));
    const store = createProfileStore(fakeRepository({ load }));

    await Promise.all([store.getState().load(), store.getState().load()]);

    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('enregistrer', () => {
  it('remplace le profil en mémoire par celui que le serveur rend', async () => {
    // Le serveur peut normaliser : c'est SA version qui fait foi, pas le
    // brouillon envoyé.
    const store = createProfileStore(
      fakeRepository({
        save: () => Promise.resolve(profile({ pseudonym: 'Jane' })),
      })
    );

    await store.getState().save({ pseudonym: 'Tarzan', handle: 'tarzan' });

    expect(store.getState().profile?.pseudonym).toBe('Jane');
  });

  it('laisse l’échec remonter à l’écran, qui a un formulaire à ne pas vider', async () => {
    const store = createProfileStore(
      fakeRepository({
        save: () => Promise.reject(new Error('identifiant déjà pris')),
      })
    );

    await expect(
      store.getState().save({ pseudonym: 'Tarzan', handle: 'tarzan' })
    ).rejects.toThrow(/déjà pris/);
  });
});

describe('la déconnexion', () => {
  it('rend le profil INCONNU, pas absent', async () => {
    const store = createProfileStore(
      fakeRepository({ load: () => Promise.resolve(profile()) })
    );
    await store.getState().load();

    store.getState().reset();

    expect(store.getState().profile).toBeUndefined();
  });
});
