import { describe, expect, it } from 'vitest';
import { annoncePublication } from './publishHeldLot';

describe('annoncePublication', () => {
  it('garde la publication lisible quand l’écran ne s’est pas rechargé', () => {
    expect(
      annoncePublication({ kind: 'published' }, 'serveur injoignable')
    ).toEqual({
      tone: 'success',
      text: 'Lot en attente publié. Le rechargement de l’écran a échoué : serveur injoignable.',
    });
  });

  it('dit qu’il n’y a rien à publier', () => {
    expect(annoncePublication({ kind: 'none' }, null)).toEqual({
      tone: 'info',
      text: 'Aucun lot en attente à publier.',
    });
  });

  it('refuse sans compte relecteur', () => {
    expect(annoncePublication({ kind: 'forbidden' }, null)?.text).toMatch(
      /compte relecteur/
    );
  });
});
