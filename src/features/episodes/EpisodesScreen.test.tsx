import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('la soirée se lit dans l’ordre de la source, pas dans celui des lignes', () => {
    // L'arène (colonne 1) PRÉCÈDE le conseil (colonne 2) ; les tours arrivent
    // pourtant à l'envers, comme la base peut les rendre.
    const soiree: Referential = {
      ...SAISON_AUX_TRIBUS,
      rounds: [
        {
          id: 'conseil:ugo',
          episodeNumber: 4,
          roundNumber: 2,
          kind: 'vote',
          eliminatedId: 'c-ugo',
          reportedVotesFor: 4,
          reportedVotesTotal: 7,
          votesComplete: true,
        },
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

    const texte =
      screen.getByText('Épisode 4').closest('article')?.textContent ?? '';
    const arene = texte.indexOf('Jonas quitte l’aventure');
    const conseil = texte.indexOf('Ugo éliminé·e');
    expect(arene).toBeGreaterThanOrEqual(0);
    expect(conseil).toBeGreaterThan(arene);
  });
});

describe('l’anti-spoiler rendu visible', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      spoiler: 'hide_unwatched',
      watched: [],
    });
  });

  it('marque la limite entre le dernier épisode vu et le suivant', () => {
    useAppStore.setState({ watched: [1] });
    renderScreen();

    expect(screen.getByText('Vous en êtes là · épisode 1')).toBeInTheDocument();
    expect(screen.getByText('la suite reste masquée')).toBeInTheDocument();
  });

  it('ne marque rien quand tout ce qui est diffusé est vu, ni quand rien ne l’est', () => {
    useAppStore.setState({ watched: [1, 2] });
    const { unmount } = renderScreen();
    expect(screen.queryByText(/^Vous en êtes là/)).toBeNull();
    unmount();

    useAppStore.setState({ watched: [] });
    renderScreen();
    expect(screen.queryByText(/^Vous en êtes là/)).toBeNull();
  });

  it('une cascade de coches se dit, part en vague, et s’annule', async () => {
    const user = userEvent.setup();
    renderScreen();
    const [, second] = screen.getAllByRole('checkbox', { name: 'Vu' });
    if (!second) throw new Error('deux cases attendues');

    await user.click(second);

    expect(useAppStore.getState().watched).toEqual([1, 2]);
    // La vague part de l'épisode touché : le 2 d'abord, le 1 ensuite.
    const cartes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dwc="card"].wave')
    );
    expect(cartes.map(c => c.style.getPropertyValue('--wave'))).toEqual([
      '1',
      '0',
    ]);
    expect(
      await screen.findByText('Épisodes 1 à 2 marqués vus.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(useAppStore.getState().watched).toEqual([]);
    expect(await screen.findByText('Suivi rétabli.')).toBeInTheDocument();
  });

  it('un seul épisode qui change ne demande rien', async () => {
    const user = userEvent.setup();
    renderScreen();
    const [first] = screen.getAllByRole('checkbox', { name: 'Vu' });
    if (!first) throw new Error('une case attendue');

    await user.click(first);

    expect(useAppStore.getState().watched).toEqual([1]);
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('un épisode masqué a la même silhouette que tous les autres', () => {
    renderScreen();

    const gardes = Array.from(document.querySelectorAll('.spoiler'));
    expect(gardes).toHaveLength(2);
    // Mêmes libellés, mêmes largeurs de givre : la forme ne dit rien du
    // contenu — ni un conseil absent, ni deux départs.
    const silhouettes = gardes.map(g =>
      Array.from(g.querySelectorAll<HTMLElement>('.frost'), f =>
        f.style.getPropertyValue('--frost')
      ).join(' ')
    );
    expect(silhouettes[0]).toBe(silhouettes[1]);
    expect(gardes[0]?.querySelector('dl')).toHaveAttribute('aria-hidden');
    // Et aucun prénom de la soirée n'est dans la page, même flouté.
    expect(screen.queryByText('Gaël')).toBeNull();
    expect(screen.queryByText('Dimitri')).toBeNull();
  });

  it('le conseil se détaille, voix par voix, derrière le garde', () => {
    useAppStore.setState({ watched: [1, 2] });
    renderScreen();

    // Trois tours ont des bulletins : l'annulé et le second tour du 1, le 2.
    expect(screen.getAllByText('Détail des voix')).toHaveLength(3);
    expect(screen.getByText('5 voix')).toBeInTheDocument();
    expect(screen.getByText('0 voix, 5 barrées')).toBeInTheDocument();
    expect(screen.getAllByText('Qui a voté contre qui')).toHaveLength(3);
  });

  it('la pastille dit l’état, et s’ouvre sur les trois réglages', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: 'Anti-spoiler · rien de vu' })
    );
    const feuille = await screen.findByRole('dialog', { name: 'Anti-spoiler' });
    await user.click(within(feuille).getByRole('radio', { name: 'Tout voir' }));

    expect(useAppStore.getState().spoiler).toBe('reveal_all');
    expect(
      screen.getByRole('button', { name: 'Tout voir · aucun masquage' })
    ).toHaveAttribute('data-tone', 'warning');
  });
});
