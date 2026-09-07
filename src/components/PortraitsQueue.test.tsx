import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { PortraitsQueue } from './PortraitsQueue';
import { useAppStore } from '../store/useAppStore';
import { usePhotosStore } from '../store/usePhotosStore';
import { photoShareRepository, type PhotoShare } from '../backend/photoShare';
import { DEMO_REFERENTIAL } from '../backend/demo';

const session = vi.hoisted(() => ({
  account: { id: 'u-1', email: 'a@exemple.test' } as unknown,
  available: true,
}));

vi.mock('../hooks/useSession', () => ({ useSession: () => session }));
vi.mock('../backend/photoShare', async importer => {
  const reel = await importer<typeof import('../backend/photoShare')>();
  return {
    ...reel,
    photoShareRepository: {
      list: vi.fn(),
      share: vi.fn(),
      revoke: vi.fn(),
      consume: vi.fn(),
    },
  };
});
vi.mock('@mister-guiiug/dev-pwa-config/qr', () => ({
  qrToDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,QR')),
}));

const depot = vi.mocked(photoShareRepository);
const ids = DEMO_REFERENTIAL.contestants.map(c => c.id);

const vivant = (contestantId: string): PhotoShare => ({
  id: `p-${contestantId}`,
  token: `jeton-${contestantId}`,
  label: 'Portrait',
  contestantId,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
});

const rendre = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <PortraitsQueue />
      </MemoryRouter>
    </ToastProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  session.account = { id: 'u-1', email: 'a@exemple.test' };
  session.available = true;
  useAppStore.setState({
    referential: DEMO_REFERENTIAL,
    ready: true,
    portraitQueue: [],
  });
  usePhotosStore.setState({
    urls: Object.fromEntries(ids.map(id => [id, `blob:${id}`])),
    read: () =>
      Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' })),
  });
  depot.list.mockResolvedValue([]);
  depot.share.mockImplementation((_b, _l, id) =>
    Promise.resolve(vivant(id ?? 'x'))
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('la tournée des portraits', () => {
  it('sans compte, elle invite à se connecter et ne demande RIEN au serveur', () => {
    session.account = null;
    rendre();

    expect(
      screen.getByRole('link', { name: 'Connectez-vous' })
    ).toBeInTheDocument();
    expect(depot.list).not.toHaveBeenCalled();
  });

  it('lancer la tournée enfile TOUT, mais n’en confie que cinq', async () => {
    // Le sixième lien n'est pas refusé par le serveur : il chasse le plus
    // ancien. En créer dix-huit tuerait treize liens déjà donnés, en silence.
    const user = userEvent.setup();
    rendre();
    await waitFor(() => expect(depot.list).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Lancer la tournée' }));

    await waitFor(() => expect(depot.share).toHaveBeenCalledTimes(5));
    // Le reste attend — dans le magasin, donc il survivra au rechargement.
    expect(useAppStore.getState().portraitQueue).toHaveLength(ids.length - 5);
    expect(
      await screen.findByText(new RegExp(`${ids.length - 5} .* attente`))
    ).toBeInTheDocument();
  });

  it('une place LIBÉRÉE fait partir le suivant', async () => {
    // C'est tout le principe : un partage disparaît de la table dès qu'il est
    // ouvert. Le serveur en rend quatre au lieu de cinq, donc une place s'est
    // libérée, donc le suivant part.
    useAppStore.setState({ portraitQueue: [ids[6]!, ids[7]!] });
    depot.list.mockResolvedValue(ids.slice(0, 4).map(vivant));

    rendre();

    await waitFor(() => expect(depot.share).toHaveBeenCalledTimes(1));
    expect(depot.share.mock.calls[0]![2]).toBe(ids[6]);
    // Et il ne part QUE lui : il n'y avait qu'une place.
    expect(useAppStore.getState().portraitQueue).toEqual([ids[7]!]);
  });

  it('le serveur PLEIN ne fait partir personne', async () => {
    useAppStore.setState({ portraitQueue: [ids[7]!] });
    depot.list.mockResolvedValue(ids.slice(0, 5).map(vivant));

    rendre();

    await waitFor(() => expect(depot.list).toHaveBeenCalled());
    expect(depot.share).not.toHaveBeenCalled();
    expect(useAppStore.getState().portraitQueue).toEqual([ids[7]!]);
  });

  it('un portrait dont l’image a disparu quitte la file sans la bloquer', async () => {
    // Sans cela, la place resterait prise à chaque relevé et la tournée
    // s'arrêterait sur ce trou.
    useAppStore.setState({ portraitQueue: [ids[0]!, ids[1]!] });
    usePhotosStore.setState({
      urls: { [ids[0]!]: 'blob:a', [ids[1]!]: 'blob:b' },
      read: id =>
        Promise.resolve(
          id === ids[0]
            ? undefined
            : new Blob([new Uint8Array([1])], { type: 'image/webp' })
        ),
    });

    rendre();

    await waitFor(() => expect(depot.share).toHaveBeenCalledTimes(1));
    expect(depot.share.mock.calls[0]![2]).toBe(ids[1]);
    expect(useAppStore.getState().portraitQueue).toEqual([]);
  });

  it('chaque lien vivant porte SON nom et SON QR', async () => {
    depot.list.mockResolvedValue([vivant(ids[0]!), vivant(ids[1]!)]);
    rendre();

    const premier = DEMO_REFERENTIAL.contestants[0]!.displayName;
    const second = DEMO_REFERENTIAL.contestants[1]!.displayName;
    expect(await screen.findByText(premier)).toBeInTheDocument();
    expect(screen.getByText(second)).toBeInTheDocument();
    // Un QR par image, donc un bouton par ligne — pas un pour l'ensemble.
    expect(
      screen.getAllByRole('button', { name: 'QR code du lien' })
    ).toHaveLength(2);
    expect(
      screen.getByRole('button', {
        name: `Éteindre le lien du portrait de ${premier}`,
      })
    ).toBeInTheDocument();
  });
});
