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
    // UN QR PAR IMAGE, ET CHACUN DIT LEQUEL. Les boutons s'appelaient tous
    // « QR code du lien » : cinq lignes ici, plus celui de « Partager
    // l'application » sur le même écran, faisaient six boutons du même nom
    // ouvrant six choses différentes.
    expect(
      screen.getByRole('button', {
        name: `QR code du lien vers le portrait de ${premier}, une seule fois`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `QR code du lien vers le portrait de ${second}, une seule fois`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Éteindre le lien du portrait de ${premier}`,
      })
    ).toBeInTheDocument();
  });

  it('chaque rangée se DONNE d’un clic, et tient sur une ligne', async () => {
    // Ce qu'on est venu faire est envoyer le lien : il était caché dans le
    // panneau du QR. Et « QR code du lien » écrit cinq fois faisait passer
    // chaque rangée sur deux lignes — l'icône seule garde son nom accessible.
    depot.list.mockResolvedValue([vivant(ids[0]!)]);
    rendre();

    const premier = DEMO_REFERENTIAL.contestants[0]!.displayName;
    const partager = await screen.findByRole('button', {
      name: 'Partager le lien',
    });
    const rangee = [...partager.parentElement!.querySelectorAll('button')];
    expect(rangee.map(b => b.textContent)).toEqual([
      'Partager le lien',
      'Éteindre',
      // L'icône ne porte aucun texte : c'est `aria-label` qui la nomme.
      '',
    ]);
    expect(rangee[2]).toHaveAccessibleName(
      `QR code du lien vers le portrait de ${premier}, une seule fois`
    );
  });

  it('montre la VIGNETTE du portrait qu’on est en train de confier', async () => {
    // Un nom ne dit pas quelle image part : on a pu remplacer le portrait, ou
    // viser la mauvaise fiche. C'est avant de donner le lien qu'on veut voir.
    depot.list.mockResolvedValue([vivant(ids[0]!)]);
    const { container } = rendre();

    await screen.findByText(DEMO_REFERENTIAL.contestants[0]!.displayName);
    const vignette = container.querySelector<HTMLImageElement>(
      '.queue-row .queue-vignette'
    );
    expect(vignette?.getAttribute('src')).toBe(`blob:${ids[0]!}`);
    // Décorative : le nom est juste à côté et porte déjà l'information.
    expect(vignette).toHaveAttribute('alt', '');
  });

  it('« Tout éteindre » rend TOUT et vide la file', async () => {
    // Se dédire coûtait cinq clics — et à chaque place libérée, la file
    // poussait aussitôt un remplaçant.
    // Cinq vivants : aucune place libre, donc la file attend vraiment — c'est
    // le seul état où l'on a à la fois des liens en ligne et une file.
    useAppStore.setState({ portraitQueue: [ids[7]!, ids[8]!] });
    depot.list.mockResolvedValue(ids.slice(0, 5).map(vivant));
    depot.revoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    rendre();

    await user.click(
      await screen.findByRole('button', {
        name: 'Tout éteindre et vider la file',
      })
    );

    await waitFor(() => expect(depot.revoke).toHaveBeenCalledTimes(5));
    expect(useAppStore.getState().portraitQueue).toEqual([]);
    // Et surtout : aucun remplaçant n'est parti pour les places libérées.
    expect(depot.share).not.toHaveBeenCalled();
  });

  it('une pompe en ÉCHEC ne s’annonce pas comme un succès', async () => {
    // `void pomper().finally(succès)` disait « 5 liens en cours » quoi qu'il
    // arrive, et le rejet ne rencontrait aucun `catch` : promesse non gérée.
    depot.list.mockResolvedValue([]);
    depot.share.mockRejectedValue(new Error('partage : serveur muet'));
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getByRole('button', { name: 'Lancer la tournée' }));

    expect(await screen.findByText(/serveur muet/)).toBeInTheDocument();
    expect(screen.queryByText(/liens? en cours\.$/)).toBeNull();
  });
});
