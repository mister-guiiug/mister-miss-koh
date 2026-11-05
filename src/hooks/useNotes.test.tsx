import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotes } from './useNotes';
import { useNotesStore } from '../store/useNotesStore';

/**
 * UNE LECTURE QUI ÉCHOUE NE SE RELANCE PAS EN BOUCLE.
 *
 * Hors connexion, la lecture des notes échoue. Le hook la relançait dès que
 * `loading` retombait — c'est-à-dire aussitôt : une requête après l'autre,
 * sans fin, et l'écran Notes qui clignotait entre le squelette et rien. En
 * ligne, un refus durable du serveur aurait été martelé de la même façon.
 * Elle repart désormais au retour du réseau, une fois.
 */
vi.mock('./useSession', () => ({
  useSession: () => ({
    account: { id: 'u-1', email: 'a@exemple.test' },
    available: true,
  }),
}));

const real = useNotesStore.getState();
const FAILED = 'lecture des notes : TypeError: Failed to fetch';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

/** Le contrat de `load` du magasin, sur un serveur injoignable. */
const failingLoad = vi.fn(async () => {
  if (useNotesStore.getState().loading) return;
  useNotesStore.setState({ loading: true });
  await Promise.resolve();
  useNotesStore.setState({ error: FAILED, loading: false });
});

beforeEach(() => {
  failingLoad.mockClear();
  useNotesStore.setState({
    notes: null,
    loading: false,
    error: null,
    load: failingLoad,
  });
});

afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
  useNotesStore.setState({ load: real.load });
  real.reset();
});

describe('lecture des notes en échec', () => {
  it('ne se relance pas en boucle', async () => {
    setOnline(false);
    renderHook(() => useNotes());

    // Laisser plusieurs tours de micro-tâches : la boucle, s'il y en a une,
    // a largement le temps de tourner.
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(failingLoad).toHaveBeenCalledTimes(1);
    expect(useNotesStore.getState().error).toBe(FAILED);
  });

  it('repart au retour du réseau', async () => {
    vi.useFakeTimers();
    setOnline(false);
    renderHook(() => useNotes());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(failingLoad).toHaveBeenCalledTimes(1);

    setOnline(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(failingLoad).toHaveBeenCalledTimes(2);
  });
});
