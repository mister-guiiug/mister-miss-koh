/**
 * Le contrat du magasin face au port du référentiel quand la lecture ÉCHOUE :
 * au premier chargement, il n'y a rien à montrer ; à un rechargement, la
 * lecture précédente reste en place — référentiel, origine et avis compris.
 * Le port est remplacé par `vi.spyOn`, comme le ferait un serveur injoignable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from '../backend/referentialRepository';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { useAppStore } from './useAppStore';

const VIERGE = {
  ready: false,
  loading: false,
  error: null,
  referential: null,
  origin: null,
  notice: null,
} as const;

const LECTURE_EN_CACHE = {
  referential: DEMO_REFERENTIAL,
  origin: 'cache',
  notice: 'Dernière version enregistrée.',
} as const;

// Le magasin est un module : chaque test repart d'un référentiel non chargé.
beforeEach(() => useAppStore.setState(VIERGE));
afterEach(() => vi.restoreAllMocks());

describe('useAppStore — chargement du référentiel', () => {
  it('le premier chargement en échec : prêt, en erreur, et rien à montrer', async () => {
    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce(
      new Error('serveur injoignable')
    );

    await useAppStore.getState().init();

    expect(useAppStore.getState()).toMatchObject({
      ready: true,
      loading: false,
      error: 'serveur injoignable',
      referential: null,
      origin: null,
      notice: null,
    });
  });

  it('un rechargement en échec garde la lecture précédente — référentiel, origine et avis', async () => {
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockResolvedValueOnce(LECTURE_EN_CACHE)
      .mockRejectedValueOnce(new Error('serveur injoignable'));

    await useAppStore.getState().init();
    expect(useAppStore.getState().referential).toBe(DEMO_REFERENTIAL);

    await useAppStore.getState().reload();

    expect(load).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState()).toMatchObject({
      ready: true,
      loading: false,
      error: 'serveur injoignable',
      origin: 'cache',
      notice: 'Dernière version enregistrée.',
    });
    // La même lecture, pas une copie : rien n'a été reconstruit.
    expect(useAppStore.getState().referential).toBe(DEMO_REFERENTIAL);
  });

  it('un rechargement réussi efface l’erreur du précédent', async () => {
    vi.spyOn(backend.referential, 'load')
      .mockResolvedValueOnce(LECTURE_EN_CACHE)
      .mockRejectedValueOnce(new Error('serveur injoignable'))
      .mockResolvedValueOnce({
        referential: DEMO_REFERENTIAL,
        origin: 'server',
      });

    await useAppStore.getState().init();
    await useAppStore.getState().reload();
    await useAppStore.getState().reload();

    expect(useAppStore.getState()).toMatchObject({
      error: null,
      origin: 'server',
      notice: null,
    });
  });

  it('init() ne recharge pas une fois prêt, même après un échec', async () => {
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockRejectedValueOnce(new Error('serveur injoignable'));

    await useAppStore.getState().init();
    await useAppStore.getState().init();

    expect(load).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().error).toBe('serveur injoignable');
  });

  it('un rejet qui n’est pas une Error garde un libellé lisible', async () => {
    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce('panne');

    await useAppStore.getState().reload();

    expect(useAppStore.getState().error).toBe('référentiel illisible');
  });
});
