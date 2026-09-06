import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from './FavoriteButton';

function Harness({ labelled = false }: { labelled?: boolean }) {
  const [favorite, setFavorite] = useState(false);
  return (
    <FavoriteButton
      name="Camille"
      favorite={favorite}
      onToggle={() => setFavorite(f => !f)}
      labelled={labelled}
    />
  );
}

describe('FavoriteButton', () => {
  it('éclate à l’ajout, se range, et ne rejoue rien au retrait', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const button = screen.getByRole('button', {
      name: 'Ajouter Camille aux favoris',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('data-pop');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Retirer Camille des favoris');
    expect(button).toHaveAttribute('data-pop');

    // L'animation finie, l'attribut tombe : la prochaine étoile rejouera.
    fireEvent.animationEnd(button);
    expect(button).not.toHaveAttribute('data-pop');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('data-pop');
  });

  it('libellée, elle garde son texte visible pour nom', async () => {
    const user = userEvent.setup();
    render(<Harness labelled />);

    const button = screen.getByRole('button', { name: 'Ajouter aux favoris' });
    await user.click(button);
    expect(screen.getByRole('button', { name: 'Favori' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
