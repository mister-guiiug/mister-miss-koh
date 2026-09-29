import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeTiles } from './HomeTiles';
import { useAppStore } from '../store/useAppStore';
import { useNotesStore } from '../store/useNotesStore';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { lastAiredEpisode } from '../domain/stats';

const AIRED = lastAiredEpisode(DEMO_REFERENTIAL);

function renderTiles() {
  return render(
    <MemoryRouter>
      <HomeTiles />
    </MemoryRouter>
  );
}

/** La tuile qui mène à `href`, quel que soit l'ordre d'affichage. */
const tuile = (href: string) => {
  const lien = screen
    .getAllByRole('link')
    .find(a => a.getAttribute('href') === href);
  if (!lien) throw new Error(`aucune tuile vers ${href}`);
  return within(lien);
};

beforeEach(() => {
  useAppStore.setState({
    referential: DEMO_REFERENTIAL,
    ready: true,
    spoiler: 'reveal_all',
    watched: [],
    favorites: [],
  });
  useNotesStore.setState({ notes: null });
});

describe('les tuiles de l’accueil', () => {
  it('portent un CHIFFRE, sinon elles ne vaudraient pas mieux que la barre basse', () => {
    renderTiles();

    expect(tuile('/candidats').getByText('en jeu')).toBeInTheDocument();
    expect(tuile('/episodes').getByText(`0/${AIRED}`)).toBeInTheDocument();
  });

  it('ne mêlent pas le tableau de bord aux comptes', () => {
    // Il a son onglet. Une tuile « → » n'était pas un chiffre.
    renderTiles();
    expect(
      screen
        .getAllByRole('link')
        .some(a => a.getAttribute('href') === '/tableau-de-bord')
    ).toBe(false);
  });

  it('comptent les épisodes vus parmi les diffusés', () => {
    useAppStore.setState({ watched: [1] });
    renderTiles();

    expect(tuile('/episodes').getByText(`1/${AIRED}`)).toBeInTheDocument();
  });

  it('ne parlent des notes QUE si le magasin en a déjà', () => {
    // L'accueil n'ouvre pas de session et n'interroge pas le serveur : sans
    // notes chargées, la tuile n'a rien à annoncer.
    renderTiles();
    expect(
      screen.getAllByRole('link').some(a => a.getAttribute('href') === '/notes')
    ).toBe(false);
  });

  it('affichent le compte des notes quand elles sont chargées', () => {
    useNotesStore.setState({ notes: [] });
    renderTiles();

    expect(tuile('/notes').getByText('0')).toBeInTheDocument();
    expect(tuile('/notes').getByText('note')).toBeInTheDocument();
  });

  it('disent que le compte s’arrête à la limite anti-spoiler', () => {
    // Sinon une précaution passe pour une erreur de compte.
    useAppStore.setState({ spoiler: 'hide_unwatched', watched: [] });
    renderTiles();

    expect(screen.getByText(/vous en êtes à l’épisode/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /rattraper les épisodes/i })
    ).toBeInTheDocument();
  });

  it('se taisent quand rien n’est masqué', () => {
    renderTiles();
    expect(screen.queryByText(/réglage\s+anti-spoiler/)).toBeNull();
  });
});

describe('le rattrapage, en compte à rebours', () => {
  it('compte les épisodes à rattraper, et la barre dit où l’on en est', () => {
    useAppStore.setState({ spoiler: 'hide_unwatched', watched: [] });
    renderTiles();

    expect(screen.getByText('épisodes à rattraper')).toBeInTheDocument();
    const barre = screen.getByRole('progressbar', {
      name: 'Épisodes rattrapés',
    });
    expect(barre).toHaveAttribute('aria-valuenow', '0');
    expect(barre).toHaveAttribute('aria-valuemax', String(AIRED));
  });

  it('au singulier quand il n’en reste qu’un', () => {
    useAppStore.setState({ spoiler: 'hide_unwatched', watched: [1] });
    renderTiles();

    expect(screen.getByText('épisode à rattraper')).toBeInTheDocument();
  });

  it('tombé à zéro, il le dit — sur le suivi coché, pas sur la limite', () => {
    useAppStore.setState({ spoiler: 'hide_unwatched', watched: [1, 2] });
    const { unmount } = renderTiles();
    expect(
      screen.getByText('À jour : zéro épisode de retard.')
    ).toBeInTheDocument();
    unmount();

    // « Tout voir » sans rien avoir coché n'est pas « à jour ».
    useAppStore.setState({ spoiler: 'reveal_all', watched: [] });
    renderTiles();
    expect(screen.queryByText('À jour : zéro épisode de retard.')).toBeNull();
  });
});
