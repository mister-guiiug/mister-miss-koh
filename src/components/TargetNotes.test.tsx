import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { TargetNotes } from './TargetNotes';
import { useNotesStore } from '../store/useNotesStore';
import type { Note } from '../backend/notes';

const held = vi.hoisted(() => ({ notes: [] as unknown[] }));

vi.mock('../hooks/useNotes', () => ({
  useNotes: () => ({
    account: { id: 'u-1', email: 'a@exemple.test' },
    available: true,
    notes: held.notes,
    loading: false,
    error: null,
  }),
}));

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n-1',
  title: 'xcvb',
  body: 'xvbx',
  rating: null,
  isDraft: false,
  isPinned: false,
  visibility: 'private',
  updatedAt: '2026-09-06T10:00:00.000Z',
  target: 'season_contestant',
  targetId: 'c-laure',
  ...over,
});

function renderNotes() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TargetNotes
          target="season_contestant"
          targetId="c-laure"
          label="Laure"
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  held.notes = [note()];
  useNotesStore.setState({ links: [] });
});

describe('une note sur une fiche', () => {
  /**
   * LE DÉFAUT QUE CE TEST TIENT. `.note` est une COLONNE — elle accueille le
   * panneau de partage sous sa ligne. Un bouton `iconOnly` posé directement
   * dedans y est étiré à toute la largeur (`align-items: stretch`), et le
   * socle lui donne `aspect-ratio: 1` : le crayon et la corbeille devenaient
   * deux carrés de la largeur de la carte, séparés par des centaines de
   * pixels de vide. Rien ne le voyait, faute de test sur ce composant.
   */
  it('range ses commandes dans la LIGNE, pas dans la colonne', () => {
    const { container } = renderNotes();

    const row = container.querySelector('.note > .note-row');
    expect(row).not.toBeNull();
    for (const name of [
      'Modifier cette note sur Laure',
      'Supprimer cette note sur Laure',
    ]) {
      expect(row).toContainElement(screen.getByRole('button', { name }));
    }
  });

  it('en modification, le formulaire prend toute la place', async () => {
    const user = userEvent.setup();
    const { container } = renderNotes();

    await user.click(
      screen.getByRole('button', { name: 'Modifier cette note sur Laure' })
    );

    // Plus de corbeille à portée de pouce d'un champ de saisie, et plus de
    // ligne du tout : le formulaire est seul dans la colonne.
    expect(container.querySelector('.note > .note-editing')).not.toBeNull();
    expect(container.querySelector('.note-row')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Supprimer cette note sur Laure' })
    ).toBeNull();
  });

  it('la note qu’on efface le dit, le temps que le serveur réponde', async () => {
    // Une promesse qu'on ne dénoue pas : c'est l'instant d'attente qu'on veut
    // observer, pas son issue.
    const remove = vi.fn(() => new Promise<void>(() => {}));
    useNotesStore.setState({ remove });
    const user = userEvent.setup();
    const { container } = renderNotes();

    await user.click(
      screen.getByRole('button', { name: 'Supprimer cette note sur Laure' })
    );

    expect(screen.getByText('Suppression…')).toBeInTheDocument();
    expect(container.querySelector('.note[data-pending]')).not.toBeNull();
  });
});
