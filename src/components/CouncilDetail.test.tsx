import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CouncilDetail } from './CouncilDetail';
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
