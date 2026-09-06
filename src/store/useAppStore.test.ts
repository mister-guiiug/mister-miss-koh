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

/**
 * Le suivi et le compte.
 *
 * CE QUI EST PROUVÉ ICI : que le magasin local reste la référence de
 * l'appareil. Sans relais — pas de compte, démonstration, backend absent —,
 * cocher un épisode marche exactement comme avant ; avec un relais, le geste
 * s'écrit d'abord ici, puis part. L'ordre importe : si le magasin attendait la
 * réponse du serveur, l'application cesserait de fonctionner hors ligne.
 */
describe('useAppStore — le suivi qui suit le compte', () => {
  beforeEach(() => {
    useAppStore.setState({ watched: [], favorites: [] });
    useAppStore.getState().attachPersonalRemote(null);
  });

  it('sans relais, cocher un épisode et un favori marche — c’est le repli local', () => {
    const store = useAppStore.getState();
    store.toggleWatched(2);
    store.toggleFavorite('c-ael');

    expect(useAppStore.getState().watched).toEqual([2]);
    expect(useAppStore.getState().favorites).toEqual(['c-ael']);

    // Et se décoche tout aussi bien : aucune de ces bascules ne dépend d'un
    // serveur, ni d'une promesse tenue.
    useAppStore.getState().toggleWatched(2);
    expect(useAppStore.getState().watched).toEqual([]);
  });

  it('avec un relais, chaque bascule part au compte — avec son sens', () => {
    const favorite = vi.fn();
    const watched = vi.fn();
    useAppStore.getState().attachPersonalRemote({ favorite, watched });

    useAppStore.getState().toggleWatched(3);
    useAppStore.getState().toggleWatched(3);
    useAppStore.getState().toggleFavorite('c-hina');

    // `true` puis `false` : le relais reçoit l'ÉTAT VOULU, pas « quelque chose
    // a changé ». Sans cela, un décochage se traduirait en ajout au serveur.
    expect(watched.mock.calls).toEqual([
      [3, true],
      [3, false],
    ]);
    expect(favorite.mock.calls).toEqual([['c-hina', true]]);
  });

  it('un relais détaché ne reçoit plus rien : la déconnexion rend l’appareil à lui-même', () => {
    const favorite = vi.fn();
    const watched = vi.fn();
    useAppStore.getState().attachPersonalRemote({ favorite, watched });
    useAppStore.getState().attachPersonalRemote(null);

    useAppStore.getState().toggleWatched(1);
    useAppStore.getState().toggleFavorite('c-ael');

    expect(watched).not.toHaveBeenCalled();
    expect(favorite).not.toHaveBeenCalled();
    // Et l'écran, lui, a bien changé.
    expect(useAppStore.getState().watched).toEqual([1]);
  });

  it('la fusion remplace le suivi, dans l’ordre, sans rien renvoyer au serveur', () => {
    const favorite = vi.fn();
    const watched = vi.fn();
    useAppStore.getState().attachPersonalRemote({ favorite, watched });

    useAppStore
      .getState()
      .setPersonal({ watched: [5, 1, 3], favorites: ['c-gael'] });

    expect(useAppStore.getState().watched).toEqual([1, 3, 5]);
    expect(useAppStore.getState().favorites).toEqual(['c-gael']);
    // La fusion VIENT du serveur : la lui repousser serait un aller-retour
    // pour rien, et une boucle si l'envoi déclenchait une relecture.
    expect(watched).not.toHaveBeenCalled();
    expect(favorite).not.toHaveBeenCalled();
  });
});
