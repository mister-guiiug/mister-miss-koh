import { afterEach, describe, expect, it, vi } from 'vitest';
import { avecTransition, transitionPermise } from './transitions';

// Le DOM de TypeScript déclare l'API ; jsdom ne l'a pas. Le test la pose et
// la retire à la main.
const doc = () => document as unknown as { startViewTransition?: unknown };

afterEach(() => {
  delete doc().startViewTransition;
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.vt;
});

/** Un `startViewTransition` de test : il appelle la mise à jour et rend la main. */
function simuler() {
  const appels: string[] = [];
  doc().startViewTransition = (maj: () => void) => {
    appels.push(document.documentElement.dataset.vt ?? '');
    maj();
    return { finished: Promise.resolve(), skipTransition: () => {} };
  };
  return appels;
}

describe('les transitions de vue', () => {
  it('sans l’API du navigateur, la mise à jour se fait, sans transition', () => {
    const maj = vi.fn();
    avecTransition('filtre', maj);
    expect(maj).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.vt).toBeUndefined();
  });

  it('au niveau « full », le TYPE est posé sur <html> pendant la transition', () => {
    const appels = simuler();
    const maj = vi.fn();
    avecTransition('filtre', maj);
    expect(maj).toHaveBeenCalledOnce();
    expect(appels).toEqual(['filtre']);
  });

  it('au niveau « essential », seules les transitions ESSENTIELLES jouent', () => {
    const appels = simuler();
    document.documentElement.dataset.motion = 'essential';
    expect(transitionPermise()).toBe(false);
    expect(transitionPermise(true)).toBe(true);
    avecTransition('filtre', () => {});
    avecTransition('limite', () => {}, { essentielle: true });
    expect(appels).toEqual(['limite']);
  });

  it('au niveau « none », rien ne joue', () => {
    simuler();
    document.documentElement.dataset.motion = 'none';
    expect(transitionPermise(true)).toBe(false);
  });
});
