import { describe, expect, it } from 'vitest';
import { councilView } from './council';
import { DEMO_REFERENTIAL } from '../backend/demo';

const round = (id: string) => {
  const r = DEMO_REFERENTIAL.rounds.find(x => x.id === id);
  if (!r) throw new Error(`tour ${id} absent de la démonstration`);
  return r;
};

describe('councilView — le détail d’un tour', () => {
  it('compte les voix par cible, la plus visée d’abord', () => {
    const view = councilView(DEMO_REFERENTIAL, round('r-e1-2'));
    expect(view?.tallies).toEqual([
      { targetId: 'c-gael', votes: 5, struck: 0 },
      { targetId: 'c-fanny', votes: 2, struck: 0 },
    ]);
    expect(view?.max).toBe(5);
    expect(view?.ballots).toHaveLength(7);
    expect(view?.complete).toBe(true);
  });

  it('un tour annulé montre ses voix barrées, qui ne comptent pas', () => {
    const view = councilView(DEMO_REFERENTIAL, round('r-e1-1'));
    expect(view?.tallies.every(t => t.votes === 0)).toBe(true);
    expect(view?.tallies.map(t => t.struck)).toEqual([5, 3]);
    // L'échelle suit les voix barrées : sans elles, les barres seraient vides.
    expect(view?.max).toBe(5);
  });

  it('un départ lié n’a aucun bulletin : pas de détail', () => {
    expect(councilView(DEMO_REFERENTIAL, round('r-e1-3'))).toBeNull();
  });

  it('dit quand la source ne détaille pas toutes les voix', () => {
    const view = councilView(DEMO_REFERENTIAL, {
      ...round('r-e2-1'),
      votesComplete: false,
    });
    expect(view?.complete).toBe(false);
  });
});
