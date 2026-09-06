import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SharedNotesScreen } from './SharedNotesScreen';
import { sharingRepository, type SharedNote } from '../../backend/sharing';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

vi.mock('../../backend/sharing', async importOriginal => {
  const actual = await importOriginal<typeof import('../../backend/sharing')>();
  return {
    ...actual,
    sharingRepository: {
      readNote: vi.fn(),
      readCollection: vi.fn(),
    },
  };
});

const shared = (over: Partial<SharedNote> = {}): SharedNote => ({
  id: 'n-1',
  title: 'Sacrée poigne',
  body: 'Elle a tenu le poteau vingt minutes.',
  rating: 4,
  target: 'season_contestant',
  targetId: 'c-ael',
  updatedAt: '2026-09-06T10:00:00.000Z',
  author: null,
  ...over,
});

const repo = vi.mocked(sharingRepository);

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/partage/:kind/:token" element={<SharedNotesScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
});

describe('ouvrir un partage', () => {
  it('appelle le lecteur de la portée inscrite dans l’adresse', async () => {
    repo.readCollection.mockResolvedValue([shared(), shared({ id: 'n-2' })]);
    open('/partage/notes/jeton');

    expect(await screen.findAllByText('Aël')).toHaveLength(2);
    expect(repo.readCollection).toHaveBeenCalledWith('jeton');
    expect(repo.readNote).not.toHaveBeenCalled();
  });

  it('nomme la cible depuis le référentiel, et le dit quand il l’ignore', async () => {
    repo.readNote.mockResolvedValue([shared({ targetId: 'venu-du-serveur' })]);
    open('/partage/note/jeton');

    // Le référentiel de démonstration ne connaît pas cet identifiant : on
    // l'écrit plutôt que d'inventer un nom.
    expect(await screen.findByText('Cible inconnue')).toBeInTheDocument();
  });

  it('dit que l’auteur n’a pas de pseudonyme plutôt que de faire semblant', async () => {
    repo.readNote.mockResolvedValue([shared()]);
    open('/partage/note/jeton');

    expect(
      await screen.findByText(/n’a pas choisi de pseudonyme/)
    ).toBeInTheDocument();
  });

  it('nomme l’auteur quand il en a un', async () => {
    repo.readNote.mockResolvedValue([shared({ author: 'Alpha' })]);
    open('/partage/note/jeton');

    expect(await screen.findByText(/Partagé par Alpha/)).toBeInTheDocument();
  });
});

describe('ce qui n’ouvre rien', () => {
  it('une adresse qui n’est pas un partage ne demande rien au serveur', async () => {
    open('/partage/profil/jeton');

    expect(
      await screen.findByText(/n’est pas celle d’un partage/)
    ).toBeInTheDocument();
    expect(repo.readNote).not.toHaveBeenCalled();
    expect(repo.readCollection).not.toHaveBeenCalled();
  });

  it('répète le refus du serveur tel quel — il est le même pour trois causes', async () => {
    // Inexistant, révoqué, expiré : les distinguer dirait à un curieux qu'un
    // jeton a existé.
    repo.readNote.mockRejectedValue(
      new Error('lecture du partage : lien de partage introuvable ou expiré')
    );
    open('/partage/note/jeton');

    expect(
      await screen.findByText(/lien de partage introuvable ou expiré/)
    ).toBeInTheDocument();
  });

  it('un lien vivant dont plus rien n’est ouvert le dit, au lieu d’une page vide', async () => {
    repo.readCollection.mockResolvedValue([]);
    open('/partage/notes/jeton');

    expect(await screen.findByText('Rien à lire ici')).toBeInTheDocument();
  });
});
