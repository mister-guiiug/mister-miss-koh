import { describe, expect, it } from 'vitest';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { groupingOf, linkedDepartures, ruleApplies } from './rules';
import type { Departure, Referential } from './referential';

// Donnée fictive de démonstration.
const ref = DEMO_REFERENTIAL;
const id = (name: string) => {
  const c = ref.contestants.find(x => x.displayName === name);
  if (!c) throw new Error(name);
  return c.id;
};

/** Le même référentiel, sans aucun départ déjà enregistré. */
const fresh: Referential = { ...ref, departures: [] };

const voteOut = (name: string, episodeNumber: number): Departure => ({
  contestantId: id(name),
  episodeNumber,
  kind: 'vote',
  day: 3,
  causedById: null,
});

describe('ruleApplies', () => {
  it('sans bornes, la règle vaut pour toute la saison', () => {
    const rule = {
      kind: 'other' as const,
      label: '',
      fromEpisode: null,
      toEpisode: null,
    };
    expect(ruleApplies(rule, 1)).toBe(true);
    expect(ruleApplies(rule, 40)).toBe(true);
  });

  it('les bornes sont inclusives', () => {
    const rule = {
      kind: 'other' as const,
      label: '',
      fromEpisode: 2,
      toEpisode: 4,
    };
    expect(ruleApplies(rule, 1)).toBe(false);
    expect(ruleApplies(rule, 2)).toBe(true);
    expect(ruleApplies(rule, 4)).toBe(true);
    expect(ruleApplies(rule, 5)).toBe(false);
  });
});

describe('linkedDepartures — la règle est lue, jamais présumée', () => {
  it('une élimination au vote entraîne le binôme, avec la cause', () => {
    const [linked] = linkedDepartures(fresh, voteOut('Gaël', 1));
    expect(linked).toEqual({
      contestantId: id('Hina'),
      episodeNumber: 1,
      kind: 'linked_pair',
      day: 3,
      causedById: id('Gaël'),
    });
  });

  it('un abandon ne se propage pas', () => {
    expect(
      linkedDepartures(fresh, { ...voteOut('Gaël', 1), kind: 'quit' })
    ).toEqual([]);
  });

  it('SANS la règle dans la saison, rien n’est déduit', () => {
    const ordinary: Referential = {
      ...fresh,
      season: { ...fresh.season, rules: [] },
    };
    expect(linkedDepartures(ordinary, voteOut('Gaël', 1))).toEqual([]);
  });

  it('une règle bornée ne s’applique pas hors de ses bornes', () => {
    const bounded: Referential = {
      ...fresh,
      season: {
        ...fresh.season,
        rules: [
          {
            kind: 'linked_pair_departure',
            label: 'Destins liés',
            fromEpisode: 1,
            toEpisode: 3,
          },
        ],
      },
    };
    expect(linkedDepartures(bounded, voteOut('Gaël', 2))).toHaveLength(1);
    expect(linkedDepartures(bounded, voteOut('Gaël', 4))).toEqual([]);
  });

  it('un binôme déjà sorti ne repart pas une seconde fois', () => {
    // Dans le référentiel de démonstration, Hina est déjà partie à l'épisode 1.
    expect(linkedDepartures(ref, voteOut('Gaël', 1))).toEqual([]);
  });
});

describe('groupingOf', () => {
  it('une saison à destins liés se regroupe par DUO', () => {
    // Le tour `linked` n'existe que là où le binôme suit l'éliminé : c'est la
    // donnée qui tranche, pas le nom de la saison.
    expect(groupingOf(DEMO_REFERENTIAL)).toBe('pair');
  });

  it('sans destin lié ni duo, on retombe sur les tribus', () => {
    const ordinaire = {
      ...DEMO_REFERENTIAL,
      pairs: [],
      rounds: DEMO_REFERENTIAL.rounds.filter(r => r.kind !== 'linked'),
    };
    expect(groupingOf(ordinaire)).toBe('team');
  });
});
