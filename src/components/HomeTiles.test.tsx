import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeTiles } from './HomeTiles';
import { useAppStore } from '../store/useAppStore';
import { useNotesStore } from '../store/useNotesStore';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { lastAiredEpisode } from '../domain/stats';
import type { SessionState } from '../hooks/useSession';

// La session, sans client Supabase : personne par défaut, un compte quand un
// test le demande.
const session = vi.hoisted(() => ({
  state: { account: null, available: false } as SessionState,
}));
vi.mock('../hooks/useSession', () => ({ useSession: () => session.state }));

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
  useNotesStore.setState({ notes: null, loading: false });
  session.state = { account: null, available: false };
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

  it('sans compte, ne parlent pas des notes et ne les demandent pas', () => {
    // Un visiteur n'a pas de notes : rien à annoncer, rien à lire.
    const load = vi.fn(() => Promise.resolve());
    useNotesStore.setState({ load });
    renderTiles();

    expect(
      screen.getAllByRole('link').some(a => a.getAttribute('href') === '/notes')
    ).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('un compte connecté voit ses notes dès l’accueil, sans passer par l’écran Notes', async () => {
    // Relevé du 30/09/2026 : la tuile lisait le magasin sans le remplir, et
    // n'apparaissait donc jamais à l'ouverture de l'application.
    session.state = {
      account: { id: 'u-1', email: 'a@exemple.test' },
      available: true,
    } as SessionState;
    const load = vi.fn(() => {
      useNotesStore.setState({ notes: [] });
      return Promise.resolve();
    });
    useNotesStore.setState({ load });
    renderTiles();

    expect(load).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(tuile('/notes').getByText('0')).toBeInTheDocument()
    );
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
