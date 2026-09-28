import { describe, expect, it } from 'vitest';
import { suiteDuLot } from './refreshWikipedia';

describe('suiteDuLot', () => {
  it('publie un lot dont tout le changement est sans ambiguïté', () => {
    expect(
      suiteDuLot({
        status: 'diffed',
        runId: 'run-1',
        counts: { autoValidated: 3, unambiguous: 3 },
      })
    ).toBe('publish');
  });

  it('retient un lot qui mélange du certain et de l’ambigu', () => {
    expect(
      suiteDuLot({
        status: 'diffed',
        runId: 'run-1',
        counts: { autoValidated: 2, ambiguous: 1 },
      })
    ).toBe('held');
  });

  it('ne publie pas une révision déjà traitée', () => {
    expect(suiteDuLot({ status: 'unchanged', runId: 'run-1' })).toBe(
      'unchanged'
    );
  });

  it('échoue sans identifiant d’exécution', () => {
    expect(suiteDuLot({ status: 'diffed', counts: { autoValidated: 1 } })).toBe(
      'failed'
    );
  });
});
