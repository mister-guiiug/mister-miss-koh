/**
 * Ce que `useUndo` promet, et que le socle ne peut pas promettre à sa place.
 *
 * Le bouton « Annuler », sa durée de vie, la suspension du rebours et la
 * fermeture au clic sont au socle (`react/toast`, depuis la 4.5.0) et testés
 * chez lui. Ici : ce que l'app fait de l'action — annoncer le rétablissement
 * ou son échec — et le contrat des identifiants, que deux suppressions
 * successives donnent deux offres distinctes. Le geste complet sur l'écran
 * Notes est joué par `NotesScreen.undo.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { useUndo, type UndoRequest } from './useUndo';

function Harness({ requests }: { requests: readonly UndoRequest[] }) {
  const askUndo = useUndo();
  return (
    <button type="button" onClick={() => requests.forEach(r => askUndo(r))}>
      Supprimer
    </button>
  );
}

function renderWith(...requests: UndoRequest[]) {
  render(
    <ToastProvider>
      <Harness requests={requests} />
    </ToastProvider>
  );
  return userEvent.setup();
}

const request = (over: Partial<UndoRequest> = {}): UndoRequest => ({
  key: 'n-1',
  message: 'Note supprimée.',
  undone: 'Note rétablie.',
  undo: () => Promise.resolve(),
  ...over,
});

describe('useUndo — l’action du toast du socle', () => {
  it('annuler referme l’offre et annonce le rétablissement', async () => {
    const undo = vi.fn(() => Promise.resolve());
    const user = renderWith(request({ undo }));

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Note supprimée.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(undo).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Note rétablie.')).toBeInTheDocument();
    // L'offre est partie avec le geste : elle n'invite pas à cliquer deux fois.
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('un rétablissement qui échoue est dit, jamais avalé', async () => {
    const user = renderWith(
      request({ undo: () => Promise.reject(new Error('Le réseau a lâché.')) })
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(await screen.findByText('Le réseau a lâché.')).toBeInTheDocument();
    expect(screen.queryByText('Note rétablie.')).toBeNull();
  });

  it('un `undo` qui lève avant sa promesse est dit comme un rejet', async () => {
    const user = renderWith(
      request({
        undo: () => {
          throw new Error('Rien à restaurer.');
        },
      })
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(await screen.findByText('Rien à restaurer.')).toBeInTheDocument();
  });

  it('deux suppressions donnent deux offres ; la même clé, une seule', async () => {
    const user = renderWith(
      request({ key: 'n-1', message: 'Première supprimée.' }),
      request({ key: 'n-2', message: 'Seconde supprimée.' }),
      request({ key: 'n-2', message: 'Seconde supprimée, encore.' })
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(
      await screen.findAllByRole('button', { name: 'Annuler' })
    ).toHaveLength(2);
    expect(screen.getByText('Première supprimée.')).toBeInTheDocument();
    // Même clé : la seconde notification REMPLACE la première, elle ne
    // s'empile pas — c'est le contrat du `id` du socle.
    expect(screen.queryByText('Seconde supprimée.')).toBeNull();
    expect(screen.getByText('Seconde supprimée, encore.')).toBeInTheDocument();
  });
});
