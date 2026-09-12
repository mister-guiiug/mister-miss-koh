import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AppAnimation } from './AppAnimation';
import { MARKS } from './marks';
import { ANIMATIONS, type AnimationRole } from './registry';
import { useAppStore } from '../store/useAppStore';

beforeEach(() => {
  useAppStore.setState({ animations: true, reduceMotion: false });
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
    const { container } = render(
      <AppAnimation name="app-start" fallback={<span data-a-moi="" />} />
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
