import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { PhotoEphemeralShare } from './PhotoEphemeralShare';
import { photoShareRepository, type PhotoShare } from '../backend/photoShare';

const session = vi.hoisted(() => ({
  account: { id: 'u-1', email: 'a@exemple.test' } as unknown,
  available: true,
}));

vi.mock('../hooks/useSession', () => ({
  useSession: () => session,
}));
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

const vivant = (over: Partial<PhotoShare> = {}): PhotoShare => ({
  id: 'p-1',
  token: 'jeton',
  label: 'Portrait de Laure',
  contestantId: 'c-laure',
  createdAt: new Date().toISOString(),
  // 20 h ET UNE MINUTE. L'arrondi se fait vers le bas : posée à 20 h pile,
  // l'échéance est déjà à 19 h 59 quelques millisecondes plus tard, et le
  // panneau afficherait « 19 h » — le comportement voulu, mais un test qui
  // dépend de la milliseconde de son exécution ne prouve rien.
  expiresAt: new Date(Date.now() + 20 * 3_600_000 + 60_000).toISOString(),
  ...over,
});

const fichier = () =>
  new File([new Uint8Array([1, 2, 3])], 'portrait.webp', {
    type: 'image/webp',
  });

function renderPanel() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <PhotoEphemeralShare
          file={fichier()}
          contestantId="c-laure"
          displayName="Laure"
        />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  session.account = { id: 'u-1', email: 'a@exemple.test' };
  session.available = true;
  depot.list.mockResolvedValue([]);
});

describe('confier un portrait pour un jour', () => {
  it('dit ce que ça publie, et les DEUX bornes, avant le clic', async () => {
    renderPanel();

    expect(await screen.findByText(/un jour au plus/)).toBeInTheDocument();
    expect(screen.getByText(/dès la première ouverture/)).toBeInTheDocument();
    // Le plafond glissant se dit aussi : un quota qui claque au visage sans
    // prévenir se lit comme une panne.
    expect(
      await screen.findByText(/0 lien en cours sur 5/)
    ).toBeInTheDocument();
  });

  it('au plafond, il annonce CE QUI VA SE PASSER, pas la règle', async () => {
    // « Au-delà de cinq, le plus ancien s'éteint » se lit comme une
    // éventualité lointaine, et le serveur ne refuse pas le sixième : il
    // chasse le plus ancien, en silence. On pouvait donc tuer un lien donné la
    // veille sans jamais apprendre qu'on était au plafond — alors que le
    // compte était DÉJÀ dans la réponse que ce panneau venait de lire.
    depot.list.mockResolvedValue([
      vivant({ id: 'p-1', contestantId: 'c-1' }),
      vivant({ id: 'p-2', contestantId: 'c-2' }),
      vivant({ id: 'p-3', contestantId: 'c-3' }),
      vivant({ id: 'p-4', contestantId: 'c-4' }),
      vivant({ id: 'p-5', contestantId: 'c-5' }),
    ]);
    renderPanel();

    const avis = await screen.findByText(/Les 5 places sont prises/);
    expect(avis).toHaveTextContent(/éteindra le plus ancien/);
    expect(avis).toHaveClass('ephemeral-quota-plein');
    // Aucun des cinq n'est celui de CE portrait : on peut toujours en créer un.
    expect(
      screen.getByRole('button', { name: 'Créer un lien d’un jour' })
    ).toBeInTheDocument();
  });

  it('un lien ouvert pendant qu’on était ailleurs le DIT au retour', async () => {
    // Un lien s'éteint à la première ouverture, donc pendant qu'on est dans la
    // messagerie où on vient de le coller. Le panneau ne relisait qu'au
    // montage : il montrait encore comme vivant un lien déjà consommé, et
    // « Éteindre » sur celui-là échouait.
    depot.list.mockResolvedValue([vivant()]);
    renderPanel();
    await screen.findByRole('button', { name: 'Éteindre maintenant' });

    depot.list.mockResolvedValue([]);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(
      await screen.findByText(/Le lien de ce portrait n’existe plus/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Éteindre maintenant' })
    ).toBeNull();
  });

  it('le lien qu’on vient de créer se DONNE, sans déplier le QR', async () => {
    // C'est ce qu'on est venu faire. « Partager le lien » était caché dans le
    // panneau du QR, et le premier bouton de la rangée était « Éteindre ».
    depot.list.mockResolvedValue([vivant()]);
    renderPanel();

    const rangee = await screen.findByRole('button', {
      name: 'Partager le lien',
    });
    const boutons = [...rangee.parentElement!.querySelectorAll('button')].map(
      b => b.textContent
    );
    expect(boutons[0]).toBe('Partager le lien');
    expect(boutons.at(-1)).toContain('QR code du lien');
  });

  it('sans compte, propose de se connecter — et ne demande RIEN au serveur', () => {
    session.account = null;
    renderPanel();

    expect(
      screen.getByRole('link', { name: 'Connectez-vous' })
    ).toBeInTheDocument();
    expect(depot.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Créer un lien/ })).toBeNull();
  });

  it('crée le lien avec le portrait en main, et le nomme', async () => {
    depot.share.mockResolvedValue(vivant());
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Créer un lien d’un jour' })
    );

    const [blob, label, contestant] = depot.share.mock.calls[0] ?? [];
    expect(blob).toBeInstanceOf(File);
    expect(label).toBe('Portrait de Laure');
    expect(contestant).toBe('c-laure');
  });

  it('un lien vivant montre ce qu’il lui reste, et de quoi l’éteindre', async () => {
    depot.list.mockResolvedValue([vivant()]);
    renderPanel();

    // Arrondi vers le bas : 20 h restantes se disent « 20 h ».
    expect(
      await screen.findByText(/de toute façon dans 20 h/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Éteindre maintenant' })
    ).toBeInTheDocument();
  });

  it('éteindre EFFACE — et le panneau repropose d’en créer un', async () => {
    depot.list.mockResolvedValue([vivant()]);
    depot.revoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Éteindre maintenant' })
    );

    expect(depot.revoke).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('button', { name: 'Créer un lien d’un jour' })
    ).toBeInTheDocument();
  });

  it('ignore un partage PÉRIMÉ que le serveur traînerait encore', async () => {
    // Le balayage passe au quart d'heure : entre-temps, une ligne morte peut
    // encore être rendue. L'afficher comme vivante donnerait un lien qui
    // n'ouvre rien.
    depot.list.mockResolvedValue([
      vivant({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    ]);
    renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Créer un lien d’un jour' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Éteindre maintenant' })
    ).toBeNull();
  });
});
