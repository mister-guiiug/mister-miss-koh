import { describe, expect, it } from 'vitest';
import {
  CONTESTANT_FILTERS,
  CONTESTANT_FILTER_OPTIONS,
  DEFAULT_CONTESTANT_FILTER,
  filterLabel,
  matchesFilter,
} from './contestantFilter';

describe('le filtre de la liste des candidats', () => {
  it('vaut « En jeu » par défaut — sur une saison qui court, c’est ce qu’on vient voir', () => {
    expect(DEFAULT_CONTESTANT_FILTER).toBe('en-jeu');
  });

  it('laisse tout passer, ou exactement un camp', () => {
    expect(matchesFilter('tous', true)).toBe(true);
    expect(matchesFilter('tous', false)).toBe(true);
    expect(matchesFilter('en-jeu', true)).toBe(true);
    expect(matchesFilter('en-jeu', false)).toBe(false);
    expect(matchesFilter('sorti', false)).toBe(true);
    expect(matchesFilter('sorti', true)).toBe(false);
  });

  it('nomme chaque valeur — l’écran vide cite le filtre qui le vide', () => {
    expect(filterLabel('tous')).toBe('Tous');
    expect(filterLabel('en-jeu')).toBe('En jeu');
    expect(filterLabel('sorti')).toBe('Sorti·e');
  });

  it('les options couvrent EXACTEMENT les valeurs acceptées', () => {
    // Le magasin valide contre `CONTESTANT_FILTERS` : une option de plus, et
    // l'écran proposerait un choix que la persistance refuserait.
    expect(CONTESTANT_FILTER_OPTIONS.map(o => o.value)).toEqual([
      ...CONTESTANT_FILTERS,
    ]);
  });
});
