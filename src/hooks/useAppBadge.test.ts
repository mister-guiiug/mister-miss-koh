import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppBadge } from './useAppBadge';
import { useAppStore } from '../store/useAppStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

const unsupported = () => {
  Reflect.deleteProperty(navigator, 'setAppBadge');
  Reflect.deleteProperty(navigator, 'clearAppBadge');
};

describe('la pastille de l’icône', () => {
  let setAppBadge: ReturnType<typeof vi.fn>;
  let clearAppBadge: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setAppBadge = vi.fn(() => Promise.resolve());
    clearAppBadge = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'setAppBadge', {
      value: setAppBadge,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: clearAppBadge,
      configurable: true,
    });
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      watched: [],
      appBadge: true,
    });
  });

  afterEach(() => {
    unsupported();
  });

  it('porte le nombre d’épisodes diffusés non cochés — un nombre, rien d’autre', () => {
    renderHook(() => useAppBadge());
    expect(setAppBadge).toHaveBeenLastCalledWith(2);

    act(() => useAppStore.setState({ watched: [1] }));
    expect(setAppBadge).toHaveBeenLastCalledWith(1);

    act(() => useAppStore.setState({ watched: [1, 2] }));
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('s’efface quand on la décoche dans les Réglages', () => {
    renderHook(() => useAppBadge());
    act(() => useAppStore.setState({ appBadge: false }));

    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('ne fait rien là où le système ne la propose pas', () => {
    unsupported();

    expect(() => renderHook(() => useAppBadge())).not.toThrow();
  });

  it('avale un refus du système : ce n’est pas une panne de l’application', async () => {
    setAppBadge.mockRejectedValueOnce(new Error('NotAllowedError'));

    renderHook(() => useAppBadge());
    // Le rejet est absorbé ; aucune erreur non gérée ne remonte.
    await Promise.resolve();
    expect(setAppBadge).toHaveBeenCalledWith(2);
  });
});
