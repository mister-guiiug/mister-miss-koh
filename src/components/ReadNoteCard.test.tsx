import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReadNoteCard, type ReadableNote } from './ReadNoteCard';
import { ReaderLimitPrompt } from './ReaderLimitPrompt';
import { useAppStore } from '../store/useAppStore';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { noteChoices } from '../domain/noteTargets';

// Démonstration : épisode 1 le 25/08, épisode 2 le 01/09, le 3 à venir.
const note = (over: Partial<ReadableNote> = {}): ReadableNote => ({
  id: 'n-1',
  title: 'Quel conseil',
  body: 'Je ne l’avais pas vu venir.',
  rating: 2,
  target: 'season_contestant',
  targetId: 'c-ael',
  updatedAt: '2026-09-02T08:00:00.000Z',
  ...over,
});

function read(notes: readonly ReadableNote[]) {
  const choices = noteChoices(DEMO_REFERENTIAL);
  return render(
    <MemoryRouter>
      <ReaderLimitPrompt notes={notes} />
      {notes.map(n => (
        <ReadNoteCard key={n.id} note={n} choices={choices} />
      ))}
    </MemoryRouter>
  );
}

describe('une note lue par quelqu’un d’autre que son auteur', () => {
  beforeEach(() => {
    useAppStore.setState({
      referential: DEMO_REFERENTIAL,
      ready: true,
      spoiler: 'hide_unwatched',
      watched: [],
    });
  });

  it('se masque à qui n’a pas vu ce qui était diffusé quand elle a été écrite', () => {
    // Écrite le 02/09 : l'épisode 2 était diffusé. Le lecteur en est au 1.
    useAppStore.setState({ watched: [1] });
    read([note()]);

    expect(screen.queryByText('Je ne l’avais pas vu venir.')).toBeNull();
    expect(screen.queryByText('Quel conseil')).toBeNull();
    // Les étoiles aussi : une note de 2/5 sur un candidat en dit déjà long.
    expect(screen.queryByLabelText('2 sur 5')).toBeNull();
    // L'en-tête reste : il nomme la cible, sans rien raconter.
    expect(screen.getByText('Aël')).toBeInTheDocument();
    // Pas d'« Avancer d'un épisode » ici : le lecteur n'est pas sur ses
    // épisodes, il répond à la question posée plus haut.
    expect(
      screen.queryByRole('button', { name: 'Avancer d’un épisode' })
    ).toBeNull();
  });

  it('se lit à qui en est là', () => {
    useAppStore.setState({ watched: [1, 2] });
    read([note()]);

    expect(screen.getByText('Je ne l’avais pas vu venir.')).toBeInTheDocument();
    expect(screen.queryByText(/^Masqué/)).toBeNull();
    // Rien de masqué : aucune question à poser.
    expect(screen.queryByText('Où en êtes-vous de la saison ?')).toBeNull();
  });

  it('une note sur un épisode, modifiée plus tard, se juge à la date de modification', () => {
    // Elle vise l'épisode 1, mais date du 02/09 : elle peut parler du 2.
    useAppStore.setState({ watched: [1] });
    read([note({ target: 'episode', targetId: 'e1' })]);

    expect(screen.queryByText('Je ne l’avais pas vu venir.')).toBeNull();
  });

  it('« Afficher quand même » révèle CETTE note, sans toucher au suivi', async () => {
    const user = userEvent.setup();
    read([note(), note({ id: 'n-2', body: 'Une autre.' })]);

    const [first] = screen.getAllByRole('button', {
      name: 'Afficher quand même',
    });
    if (!first) throw new Error('bouton attendu');
    await user.click(first);

    expect(screen.getByText('Je ne l’avais pas vu venir.')).toBeInTheDocument();
    expect(screen.queryByText('Une autre.')).toBeNull();
    expect(useAppStore.getState().watched).toEqual([]);
  });

  it('répondre à « où en êtes-vous ? » fixe le suivi et révèle ce qui peut l’être', async () => {
    const user = userEvent.setup();
    read([note()]);

    expect(
      screen.getByText('Où en êtes-vous de la saison ?')
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'J’ai vu jusqu’à' }),
      '2'
    );

    expect(useAppStore.getState().watched).toEqual([1, 2]);
    expect(screen.getByText('Je ne l’avais pas vu venir.')).toBeInTheDocument();
    // La question s'efface d'elle-même : plus rien n'est masqué.
    expect(screen.queryByText('Où en êtes-vous de la saison ?')).toBeNull();
  });

  it('« Tout voir » ne masque rien', () => {
    useAppStore.setState({ spoiler: 'reveal_all' });
    read([note()]);

    expect(screen.getByText('Je ne l’avais pas vu venir.')).toBeInTheDocument();
  });
});
