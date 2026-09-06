import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicProfileScreen } from './PublicProfileScreen';
import { profileRepository } from '../../backend/profile';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';
import type { Note } from '../../backend/notes';

vi.mock('../../backend/profile', async importOriginal => {
  const actual = await importOriginal<typeof import('../../backend/profile')>();
  return { ...actual, profileRepository: { loadPublic: vi.fn() } };
});

const repo = vi.mocked(profileRepository);

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n-1',
  title: 'Sacrée poigne',
  body: 'Elle a tenu le poteau.',
  rating: 4,
  isDraft: false,
  isPinned: false,
  visibility: 'public',
  updatedAt: '2026-09-06T10:00:00.000Z',
  target: 'season_contestant',
  targetId: 'c-ael',
  ...over,
});

function open(path = '/profil/tarzan') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profil/:handle" element={<PublicProfileScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
});

describe('ouvrir un profil public', () => {
  it('montre le pseudonyme, l’adresse et les quelques mots', async () => {
    repo.loadPublic.mockResolvedValue({
      profile: {
        pseudonym: 'Tarzan',
        handle: 'tarzan',
        bio: 'Je note tout.',
        showNotes: false,
      },
      notes: [],
    });
    open();

    expect(await screen.findByText('Tarzan')).toBeInTheDocument();
    expect(screen.getByText('@tarzan')).toBeInTheDocument();
    expect(screen.getByText('Je note tout.')).toBeInTheDocument();
    expect(repo.loadPublic).toHaveBeenCalledWith('tarzan');
  });

  it('ne montre AUCUNE note quand la personne ne les montre pas', async () => {
    // Pas même le bloc « aucune note » : ne rien montrer et ne rien avoir ne
    // se disent pas pareil.
    repo.loadPublic.mockResolvedValue({
      profile: {
        pseudonym: 'Tarzan',
        handle: 'tarzan',
        bio: null,
        showNotes: false,
      },
      notes: [note()],
    });
    open();

    await screen.findByText('Tarzan');
    expect(screen.queryByText('Sacrée poigne')).toBeNull();
    expect(screen.queryByText('Aucune note publique')).toBeNull();
  });

  it('nomme la cible de chaque note depuis le référentiel', async () => {
    repo.loadPublic.mockResolvedValue({
      profile: {
        pseudonym: 'Tarzan',
        handle: 'tarzan',
        bio: null,
        showNotes: true,
      },
      notes: [note()],
    });
    open();

    expect(await screen.findByText('Aël')).toBeInTheDocument();
    expect(screen.getByText('Sacrée poigne')).toBeInTheDocument();
  });

  it('dit qu’il n’y en a aucune quand la personne les montre sans en avoir', async () => {
    repo.loadPublic.mockResolvedValue({
      profile: {
        pseudonym: 'Tarzan',
        handle: 'tarzan',
        bio: null,
        showNotes: true,
      },
      notes: [],
    });
    open();

    expect(await screen.findByText('Aucune note publique')).toBeInTheDocument();
  });
});

describe('ce qui n’ouvre rien', () => {
  it('dit la même chose pour une adresse inconnue et un profil privé', async () => {
    // Les distinguer dirait à un curieux qu'une adresse a été prise.
    repo.loadPublic.mockResolvedValue(null);
    open('/profil/personne');

    expect(
      await screen.findByText('Aucun profil à cette adresse')
    ).toBeInTheDocument();
  });

  it('dit la même chose encore quand la lecture échoue', async () => {
    repo.loadPublic.mockRejectedValue(new Error('réseau'));
    open();

    expect(
      await screen.findByText('Aucun profil à cette adresse')
    ).toBeInTheDocument();
    // Le détail technique n'aiderait pas un visiteur de passage.
    expect(screen.queryByText(/réseau/)).toBeNull();
  });
});
