import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  avecTransition,
  libererRendu,
  naviguerAvecTransition,
  retenirRendu,
  signalerRendu,
  transitionPermise,
} from './transitions';

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

/* ── 14/10/2026 : « quand on change d'écran, l'écran clignote et se recharge » ──
   Relevé sur le site : la page arrivait vide dans la transition, puis tout son
   contenu rejouait son entrée une fois `data-vt` retiré. */

/** Une transition de test qui rend la main tout de suite, `ready` au choix. */
function simulerAvec(ready: Promise<void>) {
  doc().startViewTransition = (maj: () => void) => {
    maj();
    return { finished: Promise.resolve(), ready, skipTransition: () => {} };
  };
}

const microtaches = () => new Promise<void>(r => setTimeout(r, 0));

describe('après la transition, rien ne rejoue son entrée', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ce qui était à l’écran est marqué ENTRÉ ; ce qui arrive ensuite, non', async () => {
    document.body.innerHTML =
      '<div class="screen"><div class="stack"><h2>Titre</h2><ul class="list"><li>Aëlle</li></ul></div></div>';
    simulerAvec(Promise.resolve());

    avecTransition('filtre', () => {});
    await microtaches();

    expect(document.documentElement.dataset.vt).toBeUndefined();
    for (const sel of ['.screen', 'h2', '.list > li']) {
      expect(document.querySelector<HTMLElement>(sel)!.dataset.entre).toBe('');
    }
    // Une rangée montée APRÈS la transition fait son entrée, comme avant.
    const neuve = document.createElement('li');
    document.querySelector('.list')!.append(neuve);
    expect(neuve.dataset.entre).toBeUndefined();
  });

  it('une transition abandonnée ne laisse aucune promesse rejetée sans preneur', async () => {
    const ready = Promise.reject(
      new DOMException('Transition was aborted', 'InvalidStateError')
    );
    const attrape = vi.spyOn(ready, 'catch');
    simulerAvec(ready);

    avecTransition('filtre', () => {});
    await microtaches();

    expect(attrape).toHaveBeenCalledOnce();
  });
});

describe('un écran chargé à la demande retient la photo de l’après', () => {
  /** Les mises à jour lancées, et si chacune a rendu la main. */
  function simulerNavigation() {
    const rendues: boolean[] = [];
    doc().startViewTransition = (maj: () => void | Promise<void>) => {
      const i = rendues.push(false) - 1;
      const p = Promise.resolve(maj()).then(() => {
        rendues[i] = true;
      });
      return {
        finished: p,
        ready: Promise.resolve(),
        skipTransition: () => {},
      };
    };
    return rendues;
  }

  it('tant que le squelette est monté, le rendu signalé attend', async () => {
    const rendues = simulerNavigation();
    retenirRendu();
    naviguerAvecTransition('ecran', () => {});

    signalerRendu();
    await microtaches();
    expect(rendues).toEqual([false]);

    libererRendu();
    await microtaches();
    expect(rendues).toEqual([true]);
  });

  it('le délai de garde libère la photo, squelette ou non', async () => {
    vi.useFakeTimers();
    try {
      const rendues = simulerNavigation();
      retenirRendu();
      naviguerAvecTransition('ecran', () => {});
      vi.advanceTimersByTime(600);
      await vi.runAllTimersAsync();
      expect(rendues).toEqual([true]);
    } finally {
      libererRendu();
      vi.useRealTimers();
    }
  });

  it('sans squelette, le rendu signalé libère aussitôt', async () => {
    const rendues = simulerNavigation();
    naviguerAvecTransition('ecran', () => {});
    signalerRendu();
    await microtaches();
    expect(rendues).toEqual([true]);
  });
});
