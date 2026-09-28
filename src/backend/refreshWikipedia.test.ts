import { describe, expect, it } from 'vitest';
import {
  annonceRelecture,
  decrireLot,
  messageEchecImport,
  suiteDuLot,
} from './refreshWikipedia';

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

  it('ne rappelle pas la publication quand la fonction l’a déjà faite', () => {
    expect(
      suiteDuLot({
        status: 'diffed',
        runId: 'run-1',
        published: true,
        counts: { autoValidated: 3, unambiguous: 3 },
      })
    ).toBe('published');
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

describe('decrireLot', () => {
  it('cite les classes présentes, au singulier comme au pluriel', () => {
    expect(decrireLot({ autoValidated: 1, ambiguous: 2, suspicious: 0 })).toBe(
      '1 changement certain, 2 ambigus'
    );
  });
});

describe('annonceRelecture', () => {
  it('garde la publication lisible quand l’écran ne s’est pas rechargé', () => {
    expect(
      annonceRelecture(
        { kind: 'published', detail: '3 changements certains' },
        'serveur injoignable'
      )
    ).toEqual({
      tone: 'success',
      text: 'Wikipédia relu et publié. 3 changements certains. Le rechargement de l’écran a échoué : serveur injoignable.',
    });
  });

  it('dit pourquoi un lot reste en attente', () => {
    expect(
      annonceRelecture(
        { kind: 'held', detail: '2 changements certains, 1 ambigu' },
        null
      )
    ).toEqual({
      tone: 'info',
      text: 'Wikipédia relu. 2 changements certains, 1 ambigu. Le lot attend une publication.',
    });
  });
});

describe('messageEchecImport', () => {
  it('relit le motif écrit par la fonction', async () => {
    await expect(
      messageEchecImport({
        context: new Response(JSON.stringify({ message: 'aucun tableau' }), {
          status: 422,
        }),
      })
    ).resolves.toEqual({ status: 422, message: 'aucun tableau' });
  });
});
