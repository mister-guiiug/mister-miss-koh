import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { downloadText } from '@mister-guiiug/dev-pwa-config/download';
import { NotesScreen } from './NotesScreen';
import { useAppStore } from '../../store/useAppStore';
import { useNotesStore } from '../../store/useNotesStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';
import type { Note } from '../../backend/notes';

/** Les notes viennent du hook ; l'écran n'en connaît pas d'autre source. */
const held = vi.hoisted(() => ({ notes: [] as unknown[] }));

vi.mock('../../hooks/useNotes', () => ({
  useNotes: () => ({
    account: { id: 'u-1', email: 'a@exemple.test' },
    available: true,
    notes: held.notes,
    loading: false,
    error: null,
  }),
}));
vi.mock('@mister-guiiug/dev-pwa-config/download', () => ({
  downloadText: vi.fn(() => true),
}));
vi.mock('@mister-guiiug/dev-pwa-config/qr', () => ({
  qrToDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,QR')),
}));

const note = (
  id: string,
  targetId: string,
  over: Partial<Note> = {}
): Note => ({
  id,
  title: null,
  body: 'Elle a tenu le poteau.',
  rating: null,
  isDraft: false,
  isPinned: false,
  visibility: 'private',
  updatedAt: '2026-09-06T10:00:00.000Z',
  target: 'season_contestant',
  targetId,
  ...over,
});

const setVisibility = vi.fn(() => Promise.resolve());
const shareCollection = vi.fn(() => Promise.resolve({} as never));

/** La barre d'actions : « Enregistrer » existe aussi dans l'éditeur. */
const bar = () =>
  within(screen.getByRole('group', { name: 'Notes sélectionnées' }));

function renderScreen() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <NotesScreen />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  held.notes = [note('n-1', 'c-ael'), note('n-2', 'c-celeste')];
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
  // `links` non nul : sans quoi l'écran irait les chercher sur le serveur.
  useNotesStore.setState({ links: [], setVisibility, shareCollection });
});

describe('la sélection', () => {
  it('n’apparaît qu’une fois quelque chose de coché', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(
      screen.queryByRole('group', { name: 'Notes sélectionnées' })
    ).toBeNull();

    await user.click(screen.getByLabelText('Sélectionner la note sur Aël'));

    expect(
      screen.getByRole('group', { name: 'Notes sélectionnées' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 note sélectionnée')).toBeInTheDocument();
  });

  it('enregistre un document Markdown qui nomme la saison et les cibles', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByLabelText('Sélectionner la note sur Aël'));
    await user.click(screen.getByLabelText('Sélectionner la note sur Céleste'));
    await user.click(bar().getByRole('button', { name: 'Enregistrer' }));

    const [texte, nom, type] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(nom).toBe('notes-mes-notes-saison-de-demonstration.md');
    expect(type).toBe('text/markdown');
    expect(texte).toContain('## Aël');
    expect(texte).toContain('## Céleste');
  });
});

describe('publier une sélection par un lien', () => {
  it('demande confirmation en disant COMBIEN de notes', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByLabelText('Sélectionner la note sur Aël'));
    await user.click(screen.getByLabelText('Sélectionner la note sur Céleste'));
    await user.click(
      bar().getByRole('button', { name: 'Partager par un lien' })
    );

    expect(
      screen.getByText('Partager 2 notes par un lien ?')
    ).toBeInTheDocument();
    // Rien n'est publié tant qu'on n'a pas confirmé.
    expect(setVisibility).not.toHaveBeenCalled();
    expect(shareCollection).not.toHaveBeenCalled();
  });

  it('n’ouvre que ce qui était fermé, et ne crée qu’un lien', async () => {
    held.notes = [
      note('n-1', 'c-ael'),
      note('n-2', 'c-celeste', { visibility: 'link' }),
    ];
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByLabelText('Sélectionner la note sur Aël'));
    await user.click(screen.getByLabelText('Sélectionner la note sur Céleste'));
    await user.click(
      bar().getByRole('button', { name: 'Partager par un lien' })
    );
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    // Céleste est déjà ouverte : la ré-ouvrir écraserait son `shared_at` pour
    // rien, et compterait dans le quota d'écritures.
    expect(setVisibility.mock.calls).toEqual([['n-1', 'link']]);
    expect(shareCollection).toHaveBeenCalledTimes(1);
  });
});

describe('modifier une note', () => {
  it('la ligne cède la place au formulaire, corbeille comprise', async () => {
    // Le formulaire était rendu dans la colonne du milieu, coincé entre la
    // case à cocher et la corbeille : une commande destructrice à portée de
    // pouce d'un champ de saisie, et une largeur de saisie amputée.
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: 'Modifier la note sur Aël' })
    );

    expect(screen.queryByLabelText('Sélectionner la note sur Aël')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Supprimer la note sur Aël' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Partager la note sur Aël' })
    ).toBeNull();
    // Les autres notes, elles, gardent les leurs.
    expect(
      screen.getByRole('button', { name: 'Supprimer la note sur Céleste' })
    ).toBeInTheDocument();
  });
});

describe('une note déjà ouverte à la lecture', () => {
  it('le dit dans la liste, sans attendre qu’on déplie quoi que ce soit', () => {
    held.notes = [note('n-1', 'c-ael', { visibility: 'link' })];
    renderScreen();

    expect(screen.getByText('par lien')).toBeInTheDocument();
  });
});
