/**
 * « Supprimer, annuler, la note est là avec son contenu. »
 *
 * C'est LE test du chantier « annuler plutôt que confirmer ». Il ne vérifie
 * pas qu'un bouton existe : il joue le geste complet — supprimer sans dialogue
 * de confirmation, voir la note quitter la liste, cliquer « Annuler » dans la
 * notification, et retrouver la note AVEC son texte.
 *
 * UN FICHIER À PART, ET C'EST VOULU. `NotesScreen.test.tsx` remplace le hook
 * `useNotes` pour poser une liste de notes figée : parfait pour la sélection
 * et le partage, inutilisable ici, où toute la démonstration est que la LISTE
 * bouge. Ce fichier laisse donc le magasin faire son vrai travail — retirer la
 * note, y remettre celle que le serveur rend — sur un dépôt de fantaisie qui
 * simule la suppression LOGIQUE : la ligne n'est jamais détruite, seule une
 * date est posée. C'est exactement ce que `supabase/tests/personnel.test.sql`
 * § 3 prouve côté base.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';

const BODY = 'Le second tour méritait un ralenti.';

/**
 * Une note, et son état de suppression — comme la base : la ligne reste, seule
 * `deleted_at` bouge. `vi.hoisted` parce que la fabrique de `vi.mock` est
 * remontée avant les imports.
 */
const fake = vi.hoisted(() => {
  const note = {
    id: 'n-1',
    title: 'À revoir',
    body: 'Le second tour méritait un ralenti.',
    rating: null,
    isDraft: false,
    isPinned: false,
    visibility: 'private' as const,
    updatedAt: '2026-09-05T10:00:00Z',
    target: 'episode' as const,
    targetId: 'e1',
  };
  const state = { deleted: false };
  return {
    note,
    state,
    repository: {
      list: () => Promise.resolve(state.deleted ? [] : [note]),
      create: () => Promise.reject(new Error('non utilisé ici')),
      update: () => Promise.reject(new Error('non utilisé ici')),
      remove: (id: string) => {
        if (id !== note.id) return Promise.reject(new Error('note inconnue'));
        state.deleted = true;
        return Promise.resolve();
      },
      restore: (id: string) => {
        if (id !== note.id || !state.deleted) {
          return Promise.reject(new Error('rien à restaurer'));
        }
        state.deleted = false;
        // Le déclencheur `personal_notes_touch` rafraîchit `updated_at` : la
        // note revient datée d'aujourd'hui, et son contenu n'a pas bougé.
        return Promise.resolve({ ...note, updatedAt: '2026-09-06T12:00:00Z' });
      },
    },
  };
});

vi.mock('../../backend/notes', async importOriginal => {
  const actual = await importOriginal<typeof import('../../backend/notes')>();
  return { ...actual, notesRepository: fake.repository };
});

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    account: { id: 'u-1', email: 'a@exemple.test' },
    available: true,
  }),
}));

vi.mock('@mister-guiiug/dev-pwa-config/qr', () => ({
  qrToDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,QR')),
}));

const { NotesScreen } = await import('./NotesScreen');
const { useNotesStore } = await import('../../store/useNotesStore');
const { useAppStore } = await import('../../store/useAppStore');
const { DEMO_REFERENTIAL } = await import('../../backend/demo');

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
  fake.state.deleted = false;
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
  // `links` non nul : sans quoi l'écran irait les chercher sur le serveur.
  useNotesStore.setState({
    notes: [fake.note],
    links: [],
    loading: false,
    error: null,
  });
});

describe('NotesScreen — annuler plutôt que confirmer', () => {
  it('supprimer, annuler : la note est là, avec son contenu', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByText(BODY)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Supprimer la note sur Épisode 1' })
    );

    // AUCUNE CONFIRMATION : la suppression a lieu tout de suite. C'est le
    // renversement du chantier — on ne demande plus « êtes-vous sûr ? », on
    // offre de revenir en arrière.
    const undo = await screen.findByRole('button', { name: 'Annuler' });
    expect(screen.queryByText(BODY)).toBeNull();
    expect(fake.state.deleted).toBe(true);

    await user.click(undo);

    expect(await screen.findByText(BODY)).toBeInTheDocument();
    expect(fake.state.deleted).toBe(false);
    // Et l'offre d'annuler a disparu avec le geste : elle n'invite pas à
    // cliquer deux fois.
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('la notification nomme ce qui a été supprimé, et le dit sans jargon', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: 'Supprimer la note sur Épisode 1' })
    );

    expect(
      await screen.findByText('Note sur « Épisode 1 » supprimée.')
    ).toBeInTheDocument();
  });

  it('sans clic, la note reste supprimée — l’annulation est une OFFRE, pas un report', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: 'Supprimer la note sur Épisode 1' })
    );
    await screen.findByRole('button', { name: 'Annuler' });

    // La suppression est partie au serveur immédiatement : annoncer
    // « supprimée » puis attendre huit secondes pour supprimer vraiment ferait
    // mentir la notification, et laisserait la note en place si l'onglet se
    // fermait entre-temps.
    expect(fake.state.deleted).toBe(true);
    expect(await fake.repository.list()).toEqual([]);
  });
});
