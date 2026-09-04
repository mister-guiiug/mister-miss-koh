import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

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
});
