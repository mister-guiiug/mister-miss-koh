import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { SharedPhotoScreen } from './SharedPhotoScreen';
import { photoShareRepository } from '../../backend/photoShare';

vi.mock('../../backend/photoShare', () => ({
  photoShareRepository: { consume: vi.fn() },
}));

const consume = vi.mocked(photoShareRepository.consume);

function renderAt(route: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/photo/:token" element={<SharedPhotoScreen />} />
          <Route path="/photo" element={<SharedPhotoScreen />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom n'a pas d'URL d'objet : c'est le navigateur qui les fabrique.
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

describe('arriver sur un lien de photo', () => {
  it('N’OUVRE RIEN tant que personne ne le demande', async () => {
    // LE TEST QUI TIENT TOUTE LA CONCEPTION. Les messageries préchargent les
    // liens qu'on leur confie : si le montage consommait, l'aperçu d'une
    // conversation brûlerait la photo avant son destinataire.
    renderAt('/photo/jeton');

    expect(
      await screen.findByRole('button', {
        name: 'Voir la photo, une seule fois',
      })
    ).toBeInTheDocument();
    expect(consume).not.toHaveBeenCalled();
  });

  it('l’annonce AVANT le clic : une seule ouverture', () => {
    renderAt('/photo/jeton');

    expect(screen.getByText(/pour une seule ouverture/)).toBeInTheDocument();
    expect(
      screen.getByText(/L’afficher l’efface du serveur/)
    ).toBeInTheDocument();
  });

  it('un geste, et seulement lui, consomme le lien', async () => {
    consume.mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
      label: 'Portrait de Laure',
    });
    const user = userEvent.setup();
    renderAt('/photo/jeton');

    await user.click(
      screen.getByRole('button', { name: 'Voir la photo, une seule fois' })
    );

    expect(consume).toHaveBeenCalledExactlyOnceWith('jeton');
    const image = await screen.findByRole('img', {
      name: 'Portrait de Laure',
    });
    expect(image).toHaveAttribute('src', 'blob:photo');
    expect(screen.getByText(/Ce lien est éteint/)).toBeInTheDocument();
  });

  it('un lien déjà ouvert le dit sans prétendre savoir lequel des trois cas', async () => {
    consume.mockResolvedValue(null);
    const user = userEvent.setup();
    renderAt('/photo/jeton');

    await user.click(
      screen.getByRole('button', { name: 'Voir la photo, une seule fois' })
    );

    expect(
      await screen.findByText('Ce lien n’ouvre plus rien')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/déjà été ouvert, ou il a plus d’un jour/)
    ).toBeInTheDocument();
  });

  it('une panne réseau REND le bouton — elle ne condamne pas le lien', async () => {
    consume.mockRejectedValue(new Error('réseau indisponible'));
    const user = userEvent.setup();
    renderAt('/photo/jeton');

    await user.click(
      screen.getByRole('button', { name: 'Voir la photo, une seule fois' })
    );

    // Dire « éteint » ferait renoncer quelqu'un dont le lien est intact.
    expect(await screen.findByText('réseau indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Ce lien n’ouvre plus rien')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Voir la photo, une seule fois' })
    ).toBeEnabled();
  });
});
