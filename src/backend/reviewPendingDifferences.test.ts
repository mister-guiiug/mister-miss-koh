import { describe, expect, it } from 'vitest';
import {
  annonceRevue,
  resumeDifference,
  type PendingDifference,
} from './reviewPendingDifferences';

const exemple: PendingDifference = {
  id: 'd1',
  entity: 'contestant',
  operation: 'update',
  naturalKey: 'jean-dupont',
  changedFields: ['display_name', 'birth_date'],
  class: 'ambiguous',
  afterValue: null,
};

describe('resumeDifference', () => {
  it('résume entité, geste et clé', () => {
    expect(resumeDifference(exemple)).toBe(
      'modification · candidat · jean-dupont (display_name, birth_date)'
    );
  });

  it('omet les champs quand la liste est vide', () => {
    expect(
      resumeDifference({ ...exemple, changedFields: [], operation: 'insert' })
    ).toBe('ajout · candidat · jean-dupont');
  });
});

describe('annonceRevue', () => {
  it('confirme une validation', () => {
    expect(annonceRevue({ kind: 'ok', decision: 'validated' })).toEqual({
      tone: 'success',
      text: 'Proposition validée.',
    });
  });

  it('confirme un rejet', () => {
    expect(annonceRevue({ kind: 'ok', decision: 'rejected' })?.text).toBe(
      'Proposition rejetée.'
    );
  });

  it('refuse sans compte relecteur', () => {
    expect(annonceRevue({ kind: 'forbidden' })?.text).toMatch(
      /compte relecteur/
    );
  });
});
