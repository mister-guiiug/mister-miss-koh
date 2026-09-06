import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContestantTraits } from './ContestantTraits';
import { Avatar } from './Avatar';
import { initialsOf, tintOf } from './avatarInitials';
import type { Contestant } from '../domain/referential';

const candidat = (patch: Partial<Contestant> = {}): Contestant => ({
  id: 'c-1',
  displayName: 'Camille',
  gender: 'f',
  age: 32,
  previousSeasons: [],
  teamId: null,
  pairId: null,
  finalJury: null,
  ...patch,
});

describe('les initiales et la teinte', () => {
  it('une lettre, deux pour un nom composé, et jamais une demi-lettre', () => {
    expect(initialsOf('Camille')).toBe('C');
    expect(initialsOf('Jean-Luc')).toBe('JL');
    expect(initialsOf('Marie Claire Odile')).toBe('MC');
    expect(initialsOf('élodie')).toBe('É');
    expect(initialsOf('  ')).toBe('?');
  });

  it('la teinte est stable, et dans la palette', () => {
    expect(tintOf('c-1')).toBe(tintOf('c-1'));
    for (const id of ['a', 'c-ael', 'très-long-identifiant-uuid-ou-pas']) {
      expect(tintOf(id)).toBeGreaterThanOrEqual(0);
      expect(tintOf(id)).toBeLessThan(4);
    }
  });
});

describe('ContestantTraits', () => {
  it('dit le sexe au lecteur d’écran et l’âge à tout le monde', () => {
    render(<ContestantTraits contestant={candidat()} />);
    expect(screen.getByText('femme')).toBeInTheDocument();
    expect(screen.getByText('32 ans')).toBeInTheDocument();
  });

  it('ce que la source tait ne s’affiche pas, et n’est pas deviné', () => {
    const { container } = render(
      <ContestantTraits contestant={candidat({ gender: null, age: null })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('un âge sans sexe reste lisible', () => {
    render(<ContestantTraits contestant={candidat({ gender: null })} />);
    expect(screen.getByText('32 ans')).toBeInTheDocument();
    expect(screen.queryByText('femme')).toBeNull();
  });
});

describe('Avatar', () => {
  it('sans photo, une vignette d’initiales — décorative, le nom est à côté', () => {
    const { container } = render(<Avatar contestant={candidat()} />);
    const vignette = container.querySelector('.avatar-initials');
    expect(vignette).toHaveTextContent('C');
    expect(vignette).toHaveAttribute('aria-hidden', 'true');
    expect(vignette).toHaveAttribute('data-tint');
    // Aucune image n'est fournie avec l'application : rien ne doit être requis.
    expect(container.querySelector('img')).toBeNull();
  });
});
