import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardScreen } from './DashboardScreen';
import { useAppStore } from '../../store/useAppStore';
import { SAISON_AUX_TRIBUS } from '../../test/saisonAuxTribus';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardScreen />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAppStore.setState({
    referential: SAISON_AUX_TRIBUS,
    ready: true,
    spoiler: 'reveal_all',
    watched: [],
    favorites: [],
  });
});

describe('le tableau de bord d’une saison où l’on revient', () => {
  it('compte des PERSONNES sorties, pas des sorties', () => {
    // Cinq sorties publiées, mais deux personnes seulement hors du jeu : le
    // revenu n'en fait plus partie, et qui sort deux fois ne compte qu'une.
    renderDashboard();
    const valeur = (label: string) =>
      screen
        .getByText(label)
        .closest('[data-dwc="stat"]')
        ?.querySelector('[data-dwc="stat-value"]')?.textContent;
    expect(valeur('Parti·e·s')).toBe('2');
    expect(valeur('Encore en jeu')).toBe('4');
  });

  it('la chronologie dit les retours, dans leur tribu', () => {
    const { container } = renderDashboard();
    const lignes = Array.from(container.querySelectorAll('.timeline li'), li =>
      li.textContent?.replace(/\s+/g, ' ').trim()
    );
    expect(lignes).toEqual([
      'Épisode 1 Maël éliminé·e au vote',
      'Épisode 3 Jonas éliminé·e au vote',
      'Épisode 3 Chloé départ lié au binôme — à la suite de Jonas',
      'Épisode 4 Maël retour — dans Sorako',
      'Épisode 4 Chloé retour — dans Kalima',
      'Épisode 4 Jonas sortie sans vote',
      'Épisode 5 Chloé éliminé·e au vote',
    ]);
  });

  it('dans une soirée, les sorties suivent leur rang, pas l’ordre des lignes', () => {
    // Ugo est éliminé au conseil (colonne 2) APRÈS l'arène de Jonas
    // (colonne 1), mais sa sortie arrive la première.
    useAppStore.setState({
      referential: {
        ...SAISON_AUX_TRIBUS,
        departures: [
          {
            contestantId: 'c-ugo',
            episodeNumber: 4,
            kind: 'vote',
            day: null,
            causedById: null,
            roundNumber: 2,
          },
          ...SAISON_AUX_TRIBUS.departures.map(d =>
            d.contestantId === 'c-jonas' && d.episodeNumber === 4
              ? { ...d, roundNumber: 1 }
              : d
          ),
        ],
      },
    });
    const { container } = renderDashboard();
    const soiree = Array.from(container.querySelectorAll('.timeline li'), li =>
      li.textContent?.replace(/\s+/g, ' ').trim()
    ).filter(ligne => ligne?.startsWith('Épisode 4'));
    expect(soiree).toEqual([
      'Épisode 4 Maël retour — dans Sorako',
      'Épisode 4 Chloé retour — dans Kalima',
      'Épisode 4 Jonas sortie sans vote',
      'Épisode 4 Ugo éliminé·e au vote',
    ]);
  });
});
