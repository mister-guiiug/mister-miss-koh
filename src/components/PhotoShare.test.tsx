import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { qrToDataUrl } from '@mister-guiiug/dev-pwa-config/qr';
import { downloadBlob } from '@mister-guiiug/dev-pwa-config/download';
import { PhotoShare } from './PhotoShare';
import { usePhotosStore } from '../store/usePhotosStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

/**
 * L'encodeur du socle passe par un canevas, que jsdom n'a pas — et le
 * télécharger vraiment n'apprendrait rien de plus que « il a été appelé ».
 */
vi.mock('@mister-guiiug/dev-pwa-config/qr', () => ({
  qrToDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,QR')),
}));
vi.mock('@mister-guiiug/dev-pwa-config/download', () => ({
  downloadBlob: vi.fn(() => true),
}));

const AEL = DEMO_REFERENTIAL.contestants.find(c => c.id === 'c-ael')!;

/** 4 096 octets : une taille que `formatBytes` rend en « 4 ko » tout rond. */
const PORTRAIT = new Blob(['x'.repeat(4096)], { type: 'image/jpeg' });

function renderShare() {
  return render(
    <ToastProvider>
      <PhotoShare contestant={AEL} />
    </ToastProvider>
  );
}

/** Pose `share`/`canShare` sur le navigateur de jsdom, qui n'en a pas. */
function stubNativeShare(
  canShare: boolean,
  share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve())
) {
  Object.defineProperty(navigator, 'share', {
    value: share,
    configurable: true,
  });
  Object.defineProperty(navigator, 'canShare', {
    value: () => canShare,
    configurable: true,
  });
  return share;
}

beforeEach(() => {
  vi.clearAllMocks();
  usePhotosStore.setState({
    urls: { 'c-ael': 'blob:portrait' },
    ready: true,
    read: () => Promise.resolve(PORTRAIT),
  });
});

afterEach(() => {
  // Sans cela, le navigateur gréé d'un test fuirait dans les suivants.
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

describe('partager un portrait', () => {
  it('ne propose rien tant qu’aucune photo n’a été déposée', () => {
    usePhotosStore.setState({ urls: {} });
    renderShare();
    expect(screen.queryByText('Partager ce portrait')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('enregistre l’image sous un nom qui dit qui c’est', async () => {
    const user = userEvent.setup();
    renderShare();

    const save = await screen.findByRole('button', {
      name: /Enregistrer l’image/,
    });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0] ?? [];
    expect(name).toBe('portrait-ael.jpg');
    expect(blob).toBeInstanceOf(File);
  });

  it('n’offre pas d’envoyer l’image là où la plateforme ne sait pas le faire', async () => {
    // jsdom n'a ni `share` ni `canShare` — comme un navigateur de bureau.
    renderShare();
    await screen.findByRole('button', { name: /Enregistrer l’image/ });
    expect(
      screen.queryByRole('button', { name: /Envoyer l’image/ })
    ).toBeNull();
  });

  it('envoie le FICHIER par la feuille du système quand elle l’accepte', async () => {
    const share = stubNativeShare(true);
    const user = userEvent.setup();
    renderShare();

    await user.click(
      await screen.findByRole('button', { name: /Envoyer l’image/ })
    );

    const payload = share.mock.calls[0]?.[0];
    expect(payload?.title).toBe('Portrait de Aël');
    expect(payload?.files?.[0]?.name).toBe('portrait-ael.jpg');
    // Pas d'URL dans la charge : ce qui part, c'est l'image, et plusieurs
    // plateformes refusent la somme des deux.
    expect(payload).not.toHaveProperty('url');
  });

  it('le bouton d’envoi disparaît si la plateforme refuse un fichier', async () => {
    stubNativeShare(false);
    renderShare();

    await screen.findByRole('button', { name: /Enregistrer l’image/ });
    expect(
      screen.queryByRole('button', { name: /Envoyer l’image/ })
    ).toBeNull();
  });
});

describe('le QR code', () => {
  it('n’est encodé qu’à la première ouverture, et porte le LIEN de la fiche', async () => {
    const user = userEvent.setup();
    renderShare();

    const toggle = screen.getByRole('button', { name: /QR code du lien/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Rien n'est encodé tant que le panneau est replié : c'est là toute la
    // raison du repli, `qrcode` pèse une cinquantaine de kilo-octets.
    expect(qrToDataUrl).not.toHaveBeenCalled();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(vi.mocked(qrToDataUrl).mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/#/candidats/c-ael'
    );
    expect(
      await screen.findByRole('img', { name: /QR code du lien vers la fiche/ })
    ).toHaveAttribute('src', 'data:image/png;base64,QR');
  });

  it('dit qu’il porte le lien et PAS l’image, les deux tailles à l’appui', async () => {
    const user = userEvent.setup();
    renderShare();

    await user.click(screen.getByRole('button', { name: /QR code du lien/ }));

    const note = await screen.findByText(/Il ne porte pas l’image/);
    // Le fait, pas l'affirmation : 2,9 ko de capacité contre 4 ko d'image.
    expect(note).toHaveTextContent('au plus 2,9 ko');
    expect(note).toHaveTextContent('en pèse 4 ko');
  });
});
