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
    expect(
      tuile('/tableau-de-bord').getByText('Tableau de bord')
    ).toBeInTheDocument();
  });

  it('mènent au tableau de bord, seul écran sans onglet', () => {
    // La barre basse ne le propose pas : perdu dans une ligne de liens, il
    // devenait invisible.
    renderTiles();
    expect(
      screen
        .getAllByRole('link')
        .some(a => a.getAttribute('href') === '/tableau-de-bord')
    ).toBe(true);
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

    expect(
      screen.getByText(/c’est votre réglage\s+anti-spoiler/)
    ).toBeInTheDocument();
  });

  it('se taisent quand rien n’est masqué', () => {
    renderTiles();
    expect(screen.queryByText(/réglage\s+anti-spoiler/)).toBeNull();
  });
});
