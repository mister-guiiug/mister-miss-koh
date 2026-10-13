import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { AppAnimation } from './AppAnimation';
import { MARKS } from './marks';
import { ANIMATIONS, type AnimationRole } from './registry';
import { useAppStore } from '../store/useAppStore';

/**
 * Un faux moteur : le composant du socle construit le sien sur `useRive`, qui
 * reçoit `onLoad` / `onLoadError`. Celui-ci rend l'issue que le test choisit.
 */
const moteur = vi.hoisted(() => ({
  issue: 'attente' as 'attente' | 'pret' | 'echec',
}));
vi.mock('./riveLite', () => ({
  chargerRive: async () => ({
    useRive(params: {
      onLoad?: () => void;
      onLoadError?: (e: unknown) => void;
    }) {
      useEffect(() => {
        if (moteur.issue === 'pret') params.onLoad?.();
        if (moteur.issue === 'echec')
          params.onLoadError?.({ data: 'corrompu' });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return { RiveComponent: () => createElement('canvas') };
    },
  }),
}));

/**
 * L'observateur du socle (`vitest-setup`) ne signale jamais rien : l'animation
 * resterait hors écran, donc jamais montée. Celui-ci la dit visible tout de
 * suite.
 */
function visibleToutDeSuite() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private rappel: (entrees: { isIntersecting: boolean }[]) => void
      ) {}
      observe() {
        this.rappel([{ isIntersecting: true }]);
      }
      unobserve() {}
      disconnect() {}
    }
  );
}

beforeEach(() => {
  moteur.issue = 'attente';
  useAppStore.setState({ animations: true, reduceMotion: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('le repli d’une animation', () => {
  it('MONTRE une marque, là où il rendait un span vide', () => {
    // C'est le défaut que cette vague corrige : quinze rôles déclarés, aucun
    // fichier `.riv`, et donc un repli qui n'affichait rien du tout.
    const { container } = render(<AppAnimation name="empty" />);

    const mark = container.querySelector('svg.mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveClass('mark-vide');
  });

  it('la marque est DÉCORATIVE, le sens reste au texte', () => {
    // Sans cela, un lecteur d'écran annoncerait deux fois la même chose : le
    // dessin, puis le mot que le registre lui associe.
    const { container } = render(<AppAnimation name="went-offline" />);

    expect(container.querySelector('svg.mark')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(container.querySelector('.sr-only')?.textContent).toBe(
      'Hors connexion'
    );
  });

  it('un repli fourni par l’appelant GARDE la main', () => {
    // L'écran de chargement passe sa boussole ; la marque ne doit pas s'y
    // ajouter.
    // Un rôle SANS fichier `.riv` : c'est le repli qui s'affiche, et c'est
    // celui de l'appelant qui doit gagner sur la marque.
    const { container } = render(
      <AppAnimation name="went-offline" fallback={<span data-a-moi="" />} />
    );

    expect(container.querySelector('[data-a-moi]')).not.toBeNull();
    expect(container.querySelector('svg.mark')).toBeNull();
  });

  it('un rôle SANS marque ne rend pas de dessin vide', () => {
    // Quatre rôles n'en ont pas, parce que l'interface les porte déjà
    // autrement (l'étoile qui éclate, le contenu qui se démasque).
    const { container } = render(<AppAnimation name="favorite-added" />);
    expect(container.querySelector('svg.mark')).toBeNull();
  });

  it('toute marque déclarée correspond à un RÔLE du registre', () => {
    // Une clé mal orthographiée passerait inaperçue : le rôle rendrait le
    // repli vide d'avant, et personne ne verrait la différence.
    for (const role of Object.keys(MARKS) as AnimationRole[]) {
      expect(ANIMATIONS[role], `rôle inconnu : ${role}`).toBeDefined();
    }
  });

  it('aucune marque ne s’anime quand on a demandé l’inverse', () => {
    // Le composant rend le repli statique dès que l'un des trois réglages dit
    // non ; le CSS neutralise ensuite le mouvement du dessin lui-même.
    useAppStore.setState({ reduceMotion: true });
    const { container } = render(<AppAnimation name="victory" />);

    expect(container.querySelector('[data-fallback]')).not.toBeNull();
    expect(container.querySelector('svg.mark')).not.toBeNull();
  });
});

describe('les rôles qui ont un fichier Rive', () => {
  it('tiennent une place VIDE pendant le chargement, pas la marque', () => {
    // La marque a son propre lever : la montrer puis la remplacer par Rive
    // ferait se lever le soleil deux fois.
    const { container } = render(<AppAnimation name="app-start" />);
    expect(container.querySelector('[data-rive]')).not.toBeNull();
    expect(container.querySelector('.anim-attente')).not.toBeNull();
    expect(container.querySelector('svg.mark')).toBeNull();
  });

  it('passent à « prêt » sur le signal du moteur, transmis par le socle', async () => {
    moteur.issue = 'pret';
    visibleToutDeSuite();
    const { container } = render(<AppAnimation name="app-start" />);
    await waitFor(() =>
      expect(container.querySelector('[data-rive]')).toHaveAttribute(
        'data-rive',
        'pret'
      )
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('rendent la marque quand le fichier est refusé, sans attendre le délai', async () => {
    // Avant la 6.27.0, le socle ne transmettait pas `onLoadError` : seul le
    // délai de garde finissait par rendre la marque, 1,5 s plus tard.
    moteur.issue = 'echec';
    visibleToutDeSuite();
    const { container } = render(<AppAnimation name="torch-out" />);
    await waitFor(() =>
      expect(container.querySelector('svg.mark')).toHaveClass('mark-braise')
    );
    expect(container.querySelector('[data-rive]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('rendent la marque quand on a demandé moins de mouvement', () => {
    useAppStore.setState({ reduceMotion: true });
    const { container } = render(<AppAnimation name="torch-out" />);
    expect(container.querySelector('svg.mark')).toHaveClass('mark-braise');
    expect(container.querySelector('[data-rive]')).toBeNull();
  });

  it('rendent la marque quand le navigateur économise les données', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
    try {
      const { container } = render(<AppAnimation name="app-start" />);
      expect(container.querySelector('svg.mark')).toHaveClass('mark-lever');
    } finally {
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        configurable: true,
      });
    }
  });
});
