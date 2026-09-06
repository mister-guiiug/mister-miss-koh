import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { PairBlock } from './PairBlock';
import { useAppStore } from '../store/useAppStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

const AEL = DEMO_REFERENTIAL.contestants.find(c => c.id === 'c-ael')!;

function renderBlock() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <PairBlock contestant={AEL} />
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('PairBlock', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      // Rien de vu : aucun duo de la source n'est visible, tout est à supposer.
      spoiler: 'hide_unwatched',
      watched: [],
      pairGuesses: [],
    });
  });

  it('supposer un binôme, puis le retirer', async () => {
    const user = userEvent.setup();
    renderBlock();

    const picker = screen.getByLabelText(/Supposer un binôme/);
    // La liste propose les sept autres — y compris ceux dont le duo est
    // révélé plus tard, sans quoi leur absence le divulguerait.
    expect(screen.getAllByRole('option')).toHaveLength(8); // « Choisir… » + 7
    expect(
      screen.getByRole('button', { name: 'Supposer ce duo' })
    ).toBeDisabled();

    await user.selectOptions(picker, 'c-celeste');
    await user.click(screen.getByRole('button', { name: 'Supposer ce duo' }));

    expect(useAppStore.getState().pairGuesses).toEqual([
      { memberIds: ['c-ael', 'c-celeste'] },
    ]);
    expect(screen.getByText(/Binôme supposé/)).toBeInTheDocument();
    expect(screen.getByText('supposé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Céleste' })).toHaveAttribute(
      'href',
      '/candidats/c-celeste'
    );
    // Le formulaire s'efface : la question est réglée.
    expect(screen.queryByLabelText(/Supposer un binôme/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(useAppStore.getState().pairGuesses).toEqual([]);
    expect(screen.getByLabelText(/Supposer un binôme/)).toBeInTheDocument();
  });

  it('la source finit par trancher : la supposition est dite contredite, jamais effacée en silence', async () => {
    const user = userEvent.setup();
    renderBlock();

    await user.selectOptions(
      screen.getByLabelText(/Supposer un binôme/),
      'c-celeste'
    );
    await user.click(screen.getByRole('button', { name: 'Supposer ce duo' }));
    expect(screen.getByText(/Binôme supposé/)).toBeInTheDocument();

    // L'épisode 2 révèle que Céleste est en duo avec Dimitri.
    act(() => useAppStore.getState().toggleWatched(2));

    expect(screen.queryByText(/Binôme supposé/)).toBeNull();
    expect(screen.getByText(/Vous aviez supposé/)).toBeInTheDocument();
    // La supposition reste dans le magasin tant qu'on ne la retire pas.
    expect(useAppStore.getState().pairGuesses).toHaveLength(1);
    // Et l'on peut en proposer une autre.
    expect(screen.getByLabelText(/Supposer un binôme/)).toBeInTheDocument();
  });

  it('quand la source a nommé le binôme, elle seule s’affiche', () => {
    useAppStore.setState({
      spoiler: 'reveal_all',
      pairGuesses: [{ memberIds: ['c-ael', 'c-celeste'] }],
    });
    renderBlock();

    // Aël est en duo avec Bastien : c'est ce que dit la source.
    expect(screen.getByRole('link', { name: 'Bastien' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Supposer un binôme/)).toBeNull();
    expect(screen.getByText(/Vous aviez supposé/)).toBeInTheDocument();
  });
});
