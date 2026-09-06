import { describe, expect, it } from 'vitest';
import {
  attribution,
  checkHandle,
  checkPseudonym,
  suggestHandle,
} from './profile';

describe('le pseudonyme', () => {
  it('accepte deux caractères, refuse un seul', () => {
    expect(checkPseudonym('Ta')).toBeNull();
    expect(checkPseudonym('T')).toMatch(/au moins 2/);
  });

  it('ignore les espaces de bord, qui ne comptent pas comme des caractères', () => {
    expect(checkPseudonym('  T  ')).toMatch(/au moins 2/);
    expect(checkPseudonym('  Tarzan  ')).toBeNull();
  });

  it('refuse au-delà de trente-deux, comme la contrainte du schéma', () => {
    expect(checkPseudonym('x'.repeat(32))).toBeNull();
    expect(checkPseudonym('x'.repeat(33))).toMatch(/au plus 32/);
  });
});

describe('l’identifiant public', () => {
  it('est FACULTATIF : vide veut dire « je n’en veux pas »', () => {
    expect(checkHandle('')).toBeNull();
    expect(checkHandle('   ')).toBeNull();
  });

  it('fait trois caractères au minimum — la contrainte l’impose', () => {
    // `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$` : un caractère, un à trente, un
    // caractère. Deux ne passent pas, et le dire avant évite un refus
    // technique de PostgreSQL après la saisie.
    expect(checkHandle('ab')).toMatch(/entre 3 et 32/);
    expect(checkHandle('abc')).toBeNull();
  });

  it('refuse un tiret au bord, et tout ce qui n’est pas minuscule', () => {
    expect(checkHandle('-elouan')).toMatch(/tiret au bord/);
    expect(checkHandle('elouan-')).toMatch(/tiret au bord/);
    expect(checkHandle('Elouan')).toMatch(/Minuscules/);
    expect(checkHandle('el ouan')).toMatch(/Minuscules/);
    expect(checkHandle('el-ou-an')).toBeNull();
  });
});

describe('la proposition d’identifiant', () => {
  it('découle du pseudonyme, sans accent ni majuscule', () => {
    expect(suggestHandle('Éloïse Da Silva')).toBe('eloise-da-silva');
  });

  it('ne propose RIEN quand il ne reste pas de quoi en faire une adresse', () => {
    // Mieux vaut ne rien proposer que proposer ce que le serveur refusera.
    expect(suggestHandle('«»')).toBe('');
    expect(suggestHandle('Ta')).toBe('');
  });

  it('coupe à trente-deux sans laisser un tiret au bord', () => {
    const proposition = suggestHandle('a'.repeat(30) + ' bcdef');
    expect(proposition.length).toBeLessThanOrEqual(32);
    expect(proposition.endsWith('-')).toBe(false);
    expect(checkHandle(proposition)).toBeNull();
  });
});

describe('signer un partage', () => {
  it('nomme la personne, et son adresse quand elle en a une', () => {
    expect(attribution('Tarzan', 'tarzan')).toBe('Tarzan (@tarzan)');
    expect(attribution('Tarzan', null)).toBe('Tarzan');
  });

  it('le dit plutôt que de faire semblant quand il n’y a pas de profil', () => {
    expect(attribution(null, null)).toBe(
      'quelqu’un qui n’a pas choisi de pseudonyme'
    );
    // Un identifiant sans pseudonyme ne peut pas exister (la colonne est
    // `not null`), mais s'il arrivait, il ne servirait pas de nom.
    expect(attribution(null, 'tarzan')).toBe(
      'quelqu’un qui n’a pas choisi de pseudonyme'
    );
  });
});
