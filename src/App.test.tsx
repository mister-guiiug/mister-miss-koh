import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { backend } from './backend/referentialRepository';
import { useAppStore } from './store/useAppStore';

// Le magasin est un module : chaque test repart d'un référentiel non chargé,
// sinon `init()` — qui ne recharge pas une fois prêt — ne ferait rien.
beforeEach(() => {
  useAppStore.setState({
    ready: false,
    loading: false,
    error: null,
    referential: null,
    origin: null,
    notice: null,
  });
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('démarre sans configuration, sur la démonstration, et le dit', async () => {
    render(<App />);
    expect(
      await screen.findByText('Saison de démonstration')
    ).toBeInTheDocument();
    // La provenance est affichée : personne ne prend la fiction pour du réel.
    // Le libellé apparaît deux fois — sous-titre de la saison ET badge de
    // provenance — et c'est voulu : la fiction se dit partout où elle s'affiche.
    expect(
      screen.getAllByText('Donnée fictive de démonstration').length
    ).toBeGreaterThanOrEqual(2);
    // Et l'app se déclare non officielle.
    expect(screen.getByText(/non officielle/i)).toBeInTheDocument();
  });

  it('le référentiel de démonstration passe la validation à la frontière', async () => {
    const { DEMO_REFERENTIAL } = await import('./backend/demo');
    expect(DEMO_REFERENTIAL.provenance.kind).toBe('demo');
    expect(DEMO_REFERENTIAL.contestants.length).toBeGreaterThan(0);
  });

  it('le premier chargement en échec bloque l’écran : il n’y a rien à montrer', async () => {
    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce(
      new Error('serveur injoignable')
    );

    render(<App />);

    expect(
      await screen.findByText('Référentiel illisible')
    ).toBeInTheDocument();
    expect(screen.getByText('serveur injoignable')).toBeInTheDocument();
    expect(
      screen.queryByText('Saison de démonstration')
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'Réglages' })).toHaveLength(0);
  });

  it('un rechargement en échec laisse l’application affichée, sur la lecture précédente', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reglages';
    render(<App />);
    const button = await screen.findByRole('button', {
      name: 'Actualiser les données',
    });
    const before = useAppStore.getState().referential;
    expect(before).not.toBeNull();

    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce(
      new Error('serveur injoignable')
    );
    await user.click(button);

    // L'échec est dit — toast, puis avis des Réglages — et l'écran reste.
    expect(await screen.findByText('serveur injoignable')).toBeInTheDocument();
    expect(screen.getByText(/Le rechargement a échoué/)).toBeInTheDocument();
    expect(screen.queryByText('Référentiel illisible')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Réglages' })
    ).toBeInTheDocument();
    expect(useAppStore.getState().referential).toBe(before);
    expect(useAppStore.getState().error).toBe('serveur injoignable');
  });
});
