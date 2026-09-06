import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { SharedPhotoScreen } from './SharedPhotoScreen';
import { photoShareRepository } from '../../backend/photoShare';
import { useAppStore } from '../../store/useAppStore';
import { usePhotosStore } from '../../store/usePhotosStore';
import { DEMO_REFERENTIAL } from '../../backend/demo';

vi.mock('../../backend/photoShare', () => ({
  photoShareRepository: { consume: vi.fn() },
}));

const consume = vi.mocked(photoShareRepository.consume);

/** Le premier candidat du référentiel de démonstration : une vraie cible. */
const candidat = DEMO_REFERENTIAL.contestants[0]!;

const recue = (
  over: Partial<{ label: string | null; contestantId: string | null }> = {}
) => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
  label: 'Portrait de Laure',
  contestantId: null as string | null,
  ...over,
});

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
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
  usePhotosStore.setState({ attach: vi.fn(() => Promise.resolve()) });
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
    consume.mockResolvedValue(recue());
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

describe('poser la photo reçue sur la bonne fiche', () => {
  const ouvrir = async () => {
    const user = userEvent.setup();
    renderAt('/photo/jeton');
    await user.click(
      screen.getByRole('button', { name: 'Voir la photo, une seule fois' })
    );
    return user;
  };

  it('propose la fiche NOMMÉE, sans passer par les fichiers', async () => {
    // Le partage sait déjà qui il montre : faire enregistrer puis redéposer à
    // la main, c'était deux gestes pour une information que le serveur avait.
    consume.mockResolvedValue(recue({ contestantId: candidat.id }));
    const user = await ouvrir();

    const bouton = await screen.findByRole('button', {
      name: `Mettre sur la fiche de ${candidat.displayName}`,
    });
    await user.click(bouton);

    const attach = vi.mocked(usePhotosStore.getState().attach);
    const [id, fichier] = attach.mock.calls[0] ?? [];
    expect(id).toBe(candidat.id);
    expect(fichier).toBeInstanceOf(File);
    // Posée, la proposition disparaît — et l'écran mène à la fiche.
    expect(
      await screen.findByRole('link', { name: 'Voir sa fiche' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Mettre sur la fiche/ })
    ).toBeNull();
  });

  it('se tait quand le partage ne vise personne', async () => {
    consume.mockResolvedValue(recue({ contestantId: null }));
    await ouvrir();

    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Mettre sur la fiche/ })
    ).toBeNull();
  });

  it('se tait aussi quand le référentiel chargé ignore ce candidat', async () => {
    // Un partage créé contre le serveur, ouvert sur la démonstration : nommer
    // un inconnu vaudrait moins que de ne rien proposer.
    consume.mockResolvedValue(
      recue({ contestantId: 'inconnu-du-referentiel' })
    );
    await ouvrir();

    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Mettre sur la fiche/ })
    ).toBeNull();
    // L'enregistrement, lui, reste offert : c'est le repli.
    expect(
      screen.getByRole('button', { name: 'Enregistrer l’image' })
    ).toBeInTheDocument();
  });
});
