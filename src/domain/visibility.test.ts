import { describe, expect, it } from 'vitest';
import {
  NOTE_VISIBILITIES,
  PROFILE_VISIBILITIES,
  canBePublic,
  visibilityLabel,
} from './visibility';

describe('les niveaux offerts', () => {
  it('une note en a trois — confier n’est pas publier', () => {
    expect(NOTE_VISIBILITIES.map(o => o.value)).toEqual([
      'private',
      'link',
      'public',
    ]);
  });

  it('un profil n’en a que deux : son adresse EST son identifiant', () => {
    // Le serveur sait faire un profil « par lien » (`get_shared_profile`) ;
    // l'application ne s'en sert pas, et n'affiche donc pas le choix.
    expect(PROFILE_VISIBILITIES.map(o => o.value)).toEqual([
      'private',
      'public',
    ]);
  });

  it('chaque choix dit ce qu’il engage', () => {
    for (const option of [...NOTE_VISIBILITIES, ...PROFILE_VISIBILITIES]) {
      expect(option.hint.length).toBeGreaterThan(20);
    }
  });
});

describe('nommer un niveau', () => {
  it('rend le libellé, et la valeur brute pour l’inattendu', () => {
    expect(visibilityLabel(NOTE_VISIBILITIES, 'public')).toBe('Tout le monde');
    expect(visibilityLabel(PROFILE_VISIBILITIES, 'link')).toBe('link');
  });
});

describe('un profil public a besoin d’une adresse', () => {
  it('sans identifiant, il n’y a pas de page à ouvrir', () => {
    // `#/profil/<identifiant>` : sans identifiant, « public » désignerait une
    // page que personne ne peut atteindre.
    expect(canBePublic(null)).toBe(false);
    expect(canBePublic('')).toBe(false);
    expect(canBePublic('tarzan')).toBe(true);
  });
});
