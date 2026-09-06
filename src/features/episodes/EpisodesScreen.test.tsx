import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { EpisodesScreen } from './EpisodesScreen';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

function renderScreen() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <EpisodesScreen />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('EpisodesScreen', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      spoiler: 'hide_unwatched',
      watched: [],
    });
  });

  it('« Vu » reste une vraie case à cocher, et cocher révèle l’épisode en mouvement', async () => {
    const user = userEvent.setup();
    renderScreen();

    // Les épisodes diffusés portent une case ; celui à venir, non. Le script
    // de captures (`scripts/captures.mjs`) cherche `input[type=checkbox]` :
    // la pastille redessinée reste un élément natif.
    const [first, second, ...others] = screen.getAllByRole('checkbox', {
      name: 'Vu',
    });
    if (!first || !second) throw new Error('deux cases « Vu » attendues');
    expect(others).toHaveLength(0);
    expect(screen.getAllByText(/^Masqué/)).toHaveLength(2);
    expect(document.querySelector('.reveal')).toBeNull();

    await user.click(first);

    expect(first).toBeChecked();
    expect(useAppStore.getState().watched).toEqual([1]);
    // L'épisode 1 entre en mouvement ; l'épisode 2 reste masqué.
    expect(document.querySelectorAll('.reveal')).toHaveLength(1);
    expect(screen.getAllByText(/^Masqué/)).toHaveLength(1);
    // Les prénoms révélés mènent à la fiche du candidat.
    const links = Array.from(
      document.querySelectorAll('.reveal a'),
      a => a.getAttribute('href') ?? ''
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links.every(href => href.startsWith('/candidats/'))).toBe(true);
    // Et sa carte se marque « vue », lisible d'un coup d'œil dans la liste.
    expect(first.closest('[data-dwc="card"]')).toHaveAttribute('data-seen');
    expect(second.closest('[data-dwc="card"]')).not.toHaveAttribute(
      'data-seen'
    );
  });

  it('un contenu visible au montage n’entre pas en mouvement', () => {
    useAppStore.setState({ watched: [1, 2] });
    renderScreen();

    expect(screen.queryByText(/^Masqué/)).toBeNull();
    expect(document.querySelector('.reveal')).toBeNull();
  });
});
