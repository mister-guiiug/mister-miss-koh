import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OfflineScreen } from './OfflineScreen';

/**
 * L'ÉCRAN HORS CONNEXION NE PROMET QUE CE QUI EST VRAI.
 *
 * Il affirmait que les notes « se modifient normalement et seront
 * synchronisés au retour du réseau » : les notes vivent sur le serveur et
 * sont refusées hors connexion, et rien ne renvoie les favoris au retour du
 * réseau. Ces tests tiennent les deux affirmations qui comptent — les notes
 * demandent une connexion, et aucune synchronisation n'est promise.
 */
function renderScreen() {
  return render(
    <MemoryRouter>
      <OfflineScreen />
    </MemoryRouter>
  );
}

describe('écran hors connexion', () => {
  it('dit que les notes demandent une connexion', () => {
    renderScreen();
    expect(
      screen.getByText(/notes.*demandent une connexion/)
    ).toBeInTheDocument();
  });

  it('dit que favoris et épisodes vus sont gardés sur l’appareil', () => {
    renderScreen();
    expect(
      screen.getByText(/favoris.*épisodes vus.*gardés sur cet appareil/)
    ).toBeInTheDocument();
  });

  it('ne promet aucune synchronisation au retour du réseau', () => {
    renderScreen();
    expect(screen.queryByText(/synchronis/i)).toBeNull();
  });
});
