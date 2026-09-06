import { describe, expect, it } from 'vitest';
import { DEMO_REFERENTIAL } from '../backend/demo';
import {
  effectivePairs,
  eligiblePartners,
  groupingWithGuesses,
  orderedMembers,
  partnerView,
  refuseGuess,
  visibleSourcePairs,
  type PairGuess,
} from './pairing';

const ref = DEMO_REFERENTIAL;

/**
 * La démonstration porte quatre duos : deux que rien ne révèle (`null`), un
 * révélé à l'épisode 1, un autre au 2. La limite anti-spoiler suffit donc à
 * choisir ce que la source « a déjà dit ».
 */
const RIEN = 0; // aucun duo visible
const APRES_E1 = 1; // Gaël et Hina seulement
const APRES_E2 = 2; // + Céleste et Dimitri
const TOUT = Number.POSITIVE_INFINITY;

const guess = (a: string, b: string): PairGuess => ({
  memberIds: orderedMembers(a, b),
});

describe('un duo est une valeur, pas un ordre', () => {
  it('les deux sens donnent le même duo', () => {
    expect(orderedMembers('c-bastien', 'c-ael')).toEqual(
      orderedMembers('c-ael', 'c-bastien')
    );
  });
});

describe('ce que la source laisse voir', () => {
  it('l’anti-spoiler décide, y compris pour un duo que rien ne révèle', () => {
    expect(visibleSourcePairs(ref, RIEN)).toHaveLength(0);
    expect(visibleSourcePairs(ref, APRES_E1).map(p => p.id)).toEqual(['p-4']);
    expect(visibleSourcePairs(ref, APRES_E2).map(p => p.id)).toEqual([
      'p-2',
      'p-4',
    ]);
    expect(visibleSourcePairs(ref, TOUT)).toHaveLength(4);
  });
});

describe('ce qu’on peut supposer', () => {
  it('refuse une personne avec elle-même, et un candidat inconnu', () => {
    expect(refuseGuess(ref, [], RIEN, 'c-ael', 'c-ael')).toBe('meme-personne');
    expect(refuseGuess(ref, [], RIEN, 'c-ael', 'c-fantome')).toBe(
      'candidat-inconnu'
    );
  });

  it('refuse quelqu’un dont la source a DÉJÀ nommé le binôme', () => {
    expect(refuseGuess(ref, [], APRES_E1, 'c-ael', 'c-gael')).toBe(
      'deja-un-binome'
    );
  });

  it('refuse une seconde supposition sur la même personne', () => {
    const guesses = [guess('c-ael', 'c-celeste')];
    expect(refuseGuess(ref, guesses, RIEN, 'c-ael', 'c-elouan')).toBe(
      'deja-suppose'
    );
    expect(refuseGuess(ref, guesses, RIEN, 'c-bastien', 'c-celeste')).toBe(
      'deja-suppose'
    );
    expect(refuseGuess(ref, guesses, RIEN, 'c-bastien', 'c-elouan')).toBeNull();
  });

  it('LAISSE proposer quelqu’un dont le duo est révélé PLUS TARD — sinon la liste divulgue', () => {
    // Gaël est en duo, révélé à l'épisode 1. Tant que l'utilisateur n'y est
    // pas, le retirer de la liste dirait « celui-là a déjà un binôme ».
    expect(refuseGuess(ref, [], RIEN, 'c-ael', 'c-gael')).toBeNull();
    const noms = eligiblePartners(ref, [], RIEN, 'c-ael').map(
      c => c.displayName
    );
    expect(noms).toContain('Gaël');
    expect(noms).not.toContain('Aël');
    expect(noms).toHaveLength(7);
  });

  it('une supposition CONTREDITE ne tient plus personne', () => {
    // Aël avait supposé Céleste ; l'épisode 2 donne Dimitri à Céleste. Ni Aël
    // ni Céleste ne doivent rester prisonniers d'une supposition périmée.
    const guesses = [guess('c-ael', 'c-celeste')];
    expect(
      refuseGuess(ref, guesses, APRES_E2, 'c-ael', 'c-bastien')
    ).toBeNull();
    expect(
      eligiblePartners(ref, guesses, APRES_E2, 'c-ael').map(c => c.displayName)
    ).toEqual(['Bastien', 'Elouan', 'Fanny']);
    // Céleste, elle, a bien un binôme — de la source, cette fois.
    expect(refuseGuess(ref, guesses, APRES_E2, 'c-celeste', 'c-bastien')).toBe(
      'deja-un-binome'
    );
  });

  it('la liste se réduit à mesure que la source parle', () => {
    expect(eligiblePartners(ref, [], APRES_E2, 'c-ael')).toHaveLength(3);
    expect(eligiblePartners(ref, [], TOUT, 'c-ael')).toHaveLength(0);
  });
});

describe('les duos affichés', () => {
  it('sans rien de visible ni de supposé, il n’y en a aucun', () => {
    expect(effectivePairs(ref, [], RIEN)).toEqual([]);
  });

  it('une supposition comble le silence de la source', () => {
    const pairs = effectivePairs(ref, [guess('c-ael', 'c-celeste')], RIEN);
    expect(pairs).toEqual([
      {
        key: 'guess:c-ael:c-celeste',
        memberIds: ['c-ael', 'c-celeste'],
        origin: 'guess',
      },
    ]);
  });

  it('la source PRIME sur une supposition qui la contredit', () => {
    const pairs = effectivePairs(ref, [guess('c-ael', 'c-celeste')], APRES_E2);
    expect(pairs.map(p => [p.origin, ...p.memberIds])).toEqual([
      ['source', 'c-celeste', 'c-dimitri'],
      ['source', 'c-gael', 'c-hina'],
    ]);
  });

  it('une supposition sur un candidat effacé du référentiel est ignorée', () => {
    expect(effectivePairs(ref, [guess('c-ael', 'c-fantome')], RIEN)).toEqual(
      []
    );
  });
});

describe('ce qu’on dit à un candidat de son binôme', () => {
  it('supposé : c’est le binôme retenu, et il est dit supposé', () => {
    const view = partnerView(ref, [guess('c-ael', 'c-celeste')], RIEN, 'c-ael');
    expect(view.partner?.displayName).toBe('Céleste');
    expect(view.origin).toBe('guess');
    expect(view.confirmed).toBe(false);
    expect(view.contradicted).toBeNull();
  });

  it('confirmé : la source dit la même chose', () => {
    const view = partnerView(
      ref,
      [guess('c-gael', 'c-hina')],
      APRES_E1,
      'c-gael'
    );
    expect(view.partner?.displayName).toBe('Hina');
    expect(view.origin).toBe('source');
    expect(view.confirmed).toBe(true);
    expect(view.contradicted).toBeNull();
  });

  it('contredit : la source nomme quelqu’un d’autre, et la supposition est dite, pas effacée', () => {
    const guesses = [guess('c-ael', 'c-celeste')];

    // Chez Céleste, la source a tranché : Dimitri.
    const celeste = partnerView(ref, guesses, APRES_E2, 'c-celeste');
    expect(celeste.partner?.displayName).toBe('Dimitri');
    expect(celeste.origin).toBe('source');
    expect(celeste.confirmed).toBe(false);
    expect(celeste.contradicted?.displayName).toBe('Aël');

    // Chez Aël, la source ne dit rien — mais sa supposition est prise.
    const ael = partnerView(ref, guesses, APRES_E2, 'c-ael');
    expect(ael.partner).toBeNull();
    expect(ael.origin).toBeNull();
    expect(ael.contradicted?.displayName).toBe('Céleste');
  });

  it('un duo révélé mais MASQUÉ ne contredit rien : l’écran n’utilise pas ce qu’il cache', () => {
    const view = partnerView(
      ref,
      [guess('c-ael', 'c-celeste')],
      APRES_E1,
      'c-ael'
    );
    expect(view.partner?.displayName).toBe('Céleste');
    expect(view.contradicted).toBeNull();
  });

  it('sans supposition ni source, il n’y a rien à dire', () => {
    const view = partnerView(ref, [], RIEN, 'c-ael');
    expect(view).toEqual({
      partner: null,
      origin: null,
      confirmed: false,
      contradicted: null,
    });
  });
});

describe('regrouper par duo', () => {
  it('supposer un duo affirme que l’édition en a', () => {
    const sansDuo = {
      ...ref,
      pairs: [],
      rounds: ref.rounds.filter(r => r.kind !== 'linked'),
    };
    expect(groupingWithGuesses(sansDuo, [])).toBe('team');
    expect(groupingWithGuesses(sansDuo, [guess('c-ael', 'c-celeste')])).toBe(
      'pair'
    );
    // Et une édition qui a ses duos n'attend personne pour le savoir.
    expect(groupingWithGuesses(ref, [])).toBe('pair');
  });
});
