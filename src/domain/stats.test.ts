import { describe, expect, it } from 'vitest';
import { DEMO_REFERENTIAL } from '../backend/demo';
import {
  councilsAttended,
  inGame,
  lastAiredEpisode,
  votesCast,
  votesReceived,
} from './stats';
import type { Referential } from './referential';

// Donnée fictive de démonstration : aucun de ces noms n'est réel.
const ref = DEMO_REFERENTIAL;
const id = (name: string) => {
  const c = ref.contestants.find(x => x.displayName === name);
  if (!c) throw new Error(`candidat fictif introuvable : ${name}`);
  return c.id;
};

describe('inGame', () => {
  it('avant tout épisode, tout le monde est en jeu', () => {
    expect(inGame(ref, 0)).toHaveLength(ref.contestants.length);
  });

  it('après l’épisode 1, l’éliminé ET son binôme sont sortis', () => {
    const still = inGame(ref, 1);
    expect(still).not.toContain(id('Gaël'));
    expect(still).not.toContain(id('Hina'));
    expect(still).toHaveLength(ref.contestants.length - 2);
  });
});

describe('votesReceived — zéro n’est pas inconnu', () => {
  it('le tour annulé d’une égalité ne compte pas', () => {
    // Gaël est visé au tour 1 (annulé) ET au tour 2 : seules les voix du
    // second comptent.
    const gael = votesReceived(ref, id('Gaël'), 1);
    expect(gael.value).toBe(5);
    expect(gael.complete).toBe(true);
  });

  it('un départ de binôme vaut ZÉRO voix, et ce zéro est certain', () => {
    const hina = votesReceived(ref, id('Hina'), 1);
    expect(hina).toEqual({ value: 0, complete: true });
  });

  it('un détail partiel rend `complete: false`, sans inventer de zéro', () => {
    const partial: Referential = {
      ...ref,
      rounds: ref.rounds.map(r =>
        r.episodeNumber === 2 ? { ...r, votesComplete: false } : r
      ),
    };
    const dimitri = votesReceived(partial, id('Dimitri'), 2);
    expect(dimitri.complete).toBe(false);
    // Et jusqu'à l'épisode 1, où tout est connu, la certitude revient.
    expect(votesReceived(partial, id('Dimitri'), 1).complete).toBe(true);
  });

  it('la limite d’épisode borne le calcul : pas de spoiler par la statistique', () => {
    const dimitriAt1 = votesReceived(ref, id('Dimitri'), 1);
    const dimitriAt2 = votesReceived(ref, id('Dimitri'), 2);
    expect(dimitriAt1.value).toBe(0);
    expect(dimitriAt2.value).toBeGreaterThan(0);
  });
});

describe('votesCast et conseils', () => {
  it('une voix barrée n’est pas exprimée', () => {
    // Au tour annulé de l'épisode 1, toutes les voix sont barrées.
    expect(votesCast(ref, id('Aël'), 1).value).toBe(1);
  });

  it('un conseil à deux tours compte pour UN conseil', () => {
    expect(councilsAttended(ref, id('Aël'), 1)).toBe(1);
  });
});

describe('lastAiredEpisode', () => {
  it('ignore les épisodes annoncés mais non diffusés', () => {
    expect(lastAiredEpisode(ref)).toBe(2);
  });
});
