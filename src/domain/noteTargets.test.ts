import { describe, expect, it } from 'vitest';
import { findChoice, labelOf, noteChoices } from './noteTargets';
import { DEMO_REFERENTIAL } from '../backend/demo';

describe('les cibles qu’une note peut viser', () => {
  it('sans référentiel, il n’y a rien à proposer', () => {
    expect(noteChoices(null)).toEqual([]);
  });

  it('la saison, les candidats, les épisodes — et rien d’autre', () => {
    // Le schéma en accepte sept ; les quatre autres n'ont pas d'écran, et une
    // note qui les viserait ne serait rejoignable par aucun lien.
    const groups = new Set(noteChoices(DEMO_REFERENTIAL).map(c => c.group));
    expect(groups).toEqual(new Set(['Saison', 'Candidats', 'Épisodes']));
  });

  it('chaque cible sait où l’on va pour voir la chose', () => {
    const choices = noteChoices(DEMO_REFERENTIAL);
    expect(findChoice(choices, 'season_contestant', 'c-ael')).toMatchObject({
      label: 'Aël',
      href: '/candidats/c-ael',
    });
  });
});

describe('nommer la cible d’une note', () => {
  it('rend le nom quand le référentiel la connaît', () => {
    const choices = noteChoices(DEMO_REFERENTIAL);
    expect(labelOf(choices, 'season_contestant', 'c-ael')).toBe('Aël');
  });

  it('le dit plutôt que d’inventer quand il ne la connaît pas', () => {
    // Le cas réel : un lecteur ouvre un partage alors que l'application tourne
    // sur la démonstration, dont les identifiants ne sont pas ceux du serveur.
    const choices = noteChoices(DEMO_REFERENTIAL);
    expect(labelOf(choices, 'season_contestant', 'inconnu')).toBe(
      'Cible inconnue'
    );
    expect(findChoice(choices, 'episode', 'c-ael')).toBeNull();
  });
});
