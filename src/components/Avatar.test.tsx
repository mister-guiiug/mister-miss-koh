import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Avatar } from './Avatar';
import { usePhotosStore } from '../store/usePhotosStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

const candidat = DEMO_REFERENTIAL.contestants[0]!;

beforeEach(() => {
  usePhotosStore.setState({ urls: {} });
});

const avecPhoto = () =>
  usePhotosStore.setState({ urls: { [candidat.id]: 'blob:portrait' } });

describe('la vignette d’un candidat', () => {
  it('sans photo, ce sont des initiales — et rien à agrandir', () => {
    const { container } = render(<Avatar contestant={candidat} zoomable />);

    expect(container.querySelector('.avatar-initials')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('avec photo mais SANS `zoomable`, c’est une image nue', () => {
    // Dans une liste, la vignette jouxte un lien vers la fiche : un second
    // geste à trois pixels de là ferait deux cibles pour deux destinations.
    avecPhoto();
    const { container } = render(<Avatar contestant={candidat} />);

    expect(container.querySelector('img.avatar')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('avec photo et `zoomable`, un clic l’ouvre en grand', async () => {
    avecPhoto();
    const user = userEvent.setup();
    render(<Avatar contestant={candidat} size="lg" zoomable />);

    await user.click(
      screen.getByRole('button', {
        name: `Voir la photo de ${candidat.displayName} en grand`,
      })
    );

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByText(`Photo de ${candidat.displayName}`)
    ).toBeInTheDocument();
    // L'image agrandie porte la même source que la vignette : c'est LA photo
    // rangée sur l'appareil, pas une seconde lecture du dépôt.
    expect(dialogue.querySelector('img.photo-zoom')?.getAttribute('src')).toBe(
      'blob:portrait'
    );
  });

  it('la feuille se referme, et rend la main', async () => {
    avecPhoto();
    const user = userEvent.setup();
    render(<Avatar contestant={candidat} size="lg" zoomable />);
    const ouvrir = screen.getByRole('button', {
      name: `Voir la photo de ${candidat.displayName} en grand`,
    });

    await user.click(ouvrir);
    await user.click(await screen.findByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ouvrir).toBeInTheDocument();
  });
});
