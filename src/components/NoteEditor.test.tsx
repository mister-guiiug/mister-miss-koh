import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';

describe('NoteEditor', () => {
  it('n’enregistre qu’avec un texte, et Ctrl+Entrée enregistre les valeurs nettoyées', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NoteEditor onSubmit={onSubmit} />);

    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();

    await user.type(
      screen.getByLabelText('Titre (facultatif)'),
      '  Un titre  '
    );
    await user.type(
      screen.getByPlaceholderText(/Ce que vous voulez retenir/),
      'Un texte '
    );
    await user.click(screen.getByRole('radio', { name: '4 étoiles' }));
    expect(save).toBeEnabled();

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Un titre',
      body: 'Un texte',
      rating: 4,
    });
  });

  it('un titre vide devient null, « Sans note » vaut null, et le compteur suit le texte', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        onSubmit={onSubmit}
        initial={{ title: 'Ancien', body: 'Vieux texte', rating: 2 }}
        submitLabel="Corriger"
      />
    );

    await user.clear(screen.getByLabelText('Titre (facultatif)'));
    await user.click(screen.getByRole('radio', { name: 'Sans note' }));
    expect(document.querySelector('.note-count')?.textContent).toMatch(
      /^11\s*\/\s*20.000$/
    );

    await user.click(screen.getByRole('button', { name: 'Corriger' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: null,
      body: 'Vieux texte',
      rating: null,
    });
  });

  it('une condition de plus peut retenir l’enregistrement', async () => {
    const user = userEvent.setup();
    render(<NoteEditor onSubmit={vi.fn()} canSubmit={false} />);
    await user.type(
      screen.getByPlaceholderText(/Ce que vous voulez retenir/),
      'Un texte'
    );
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});
