import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { EpisodesScreen } from './EpisodesScreen';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';
import { SAISON_AUX_TRIBUS } from '../../test/saisonAuxTribus';
import type { Referential } from '../../domain/referential';

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

describe('une soirée de la saison aux tribus', () => {
  it('la tribu gagnante porte sa pastille, et l’arène se dit « sans vote »', () => {
    const soiree: Referential = {
      ...SAISON_AUX_TRIBUS,
      episodes: SAISON_AUX_TRIBUS.episodes.map(e =>
        e.number === 4
          ? {
              ...e,
              comfortWinnerTeamIds: ['t-rouge'],
              immunityWinnerTeamIds: ['t-rouge'],
            }
          : e
      ),
      rounds: [
        {
          id: 'depart:jonas',
          episodeNumber: 4,
          roundNumber: 1,
          kind: 'departure',
          eliminatedId: 'c-jonas',
          reportedVotesFor: 0,
          reportedVotesTotal: null,
          votesComplete: true,
        },
      ],
    };
    useAppStore.setState({
      referential: soiree,
      spoiler: 'reveal_all',
      watched: [],
    });
    renderScreen();

    const carte = screen.getByText('Épisode 4').closest('article');
    expect(carte).toHaveTextContent('Jonas quitte l’aventure sans vote');
    // UNE sortie sans cause n'est PAS un départ de binôme.
    expect(carte).not.toHaveTextContent('binôme');
    const pastilles = carte!.querySelectorAll('.tribe-swatch');
    expect(pastilles).toHaveLength(2);
    expect(pastilles[0]).toHaveStyle({ background: '#fc5d5d' });
  });
});
