import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CouncilDetail, PAS_VOIX_MS } from './CouncilDetail';
import { councilView } from '../domain/council';
import { DEMO_REFERENTIAL } from '../backend/demo';

// Donnée fictive de démonstration : aucun de ces noms n'est réel.
describe('le détail d’un conseil', () => {
  it('un vote double compte deux voix, et le bulletin le dit', () => {
    const tour = DEMO_REFERENTIAL.rounds.find(r => r.id === 'r-e1-2')!;
    const premier = DEMO_REFERENTIAL.votes.find(v => v.roundId === tour.id)!;
    const referential = {
      ...DEMO_REFERENTIAL,
      votes: DEMO_REFERENTIAL.votes.map(v =>
        v === premier ? { ...v, weight: 2 } : v
      ),
    };
    const view = councilView(referential, tour)!;

    render(
      <MemoryRouter>
        <CouncilDetail referential={referential} view={view} />
      </MemoryRouter>
    );

    // 5 voix dans la démonstration, une de plus par le vote double.
    expect(screen.getByText('6 voix')).toBeInTheDocument();
    const bulletins = screen
      .getAllByRole('listitem')
      .filter(li => li.textContent?.includes('a voté contre'));
    expect(
      bulletins.filter(li => li.textContent?.includes('(2 voix)'))
    ).toHaveLength(1);
  });
});

describe('le dépouillement', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.motion;
  });

  const tour = DEMO_REFERENTIAL.rounds.find(r => r.id === 'r-e1-2')!;
  const view = councilView(DEMO_REFERENTIAL, tour)!;
  const [premier] = view.tallies;
  const sortant = premier!.targetId;

  const ouvrir = (ouvert: boolean) =>
    render(
      <MemoryRouter>
        <CouncilDetail
          referential={DEMO_REFERENTIAL}
          view={view}
          eliminatedId={sortant}
          ouvert={ouvert}
          ouverture={1}
        />
      </MemoryRouter>
    );

  it('la plus votée se remplit en DERNIER', () => {
    const { container } = ouvrir(true);
    const rangs = [
      ...container.querySelectorAll<HTMLElement>('.council-bars > li'),
    ].map(li => Number(li.style.getPropertyValue('--rang')));
    // La liste va de la plus votée à la moins votée : rangs décroissants,
    // le dernier à zéro, le premier au plus haut.
    expect(rangs).toEqual([...rangs].sort((a, b) => b - a));
    expect(rangs.at(-1)).toBe(0);
    expect(container.querySelector('li[data-sortant]')).toBe(
      container.querySelector('.council-bars > li')
    );
  });

  it('la braise s’éteint après la dernière barre, et pas avant', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.motion = 'full';
    const { container } = ouvrir(true);
    expect(container.querySelector('.council-braise')).toBeNull();
    act(() => {
      vi.advanceTimersByTime((view.tallies.length - 1) * PAS_VOIX_MS + 400);
    });
    expect(container.querySelector('.council-braise')).not.toBeNull();
  });

  it('rien ne s’éteint tant que le détail est fermé', () => {
    vi.useFakeTimers();
    const { container } = ouvrir(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector('.council-braise')).toBeNull();
  });
});
