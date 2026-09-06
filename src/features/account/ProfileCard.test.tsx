import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { ProfileCard } from './ProfileCard';
import { useProfileStore } from '../../store/useProfileStore';
import type { Profile } from '../../backend/profile';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'u-1',
  pseudonym: 'Tarzan',
  handle: 'tarzan',
  bio: null,
  visibility: 'private',
  showNotes: false,
  updatedAt: '2026-09-06T10:00:00.000Z',
  ...over,
});

const save = vi.fn(() => Promise.resolve(profile()));
const isHandleFree = vi.fn(() => Promise.resolve(true));

function renderCard(
  state: Partial<ReturnType<typeof useProfileStore.getState>>
) {
  useProfileStore.setState({ save, isHandleFree, error: null, ...state });
  return render(
    <ToastProvider>
      <ProfileCard />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('les trois états', () => {
  it('attend, plutôt que d’annoncer une absence qu’on ignore', () => {
    renderCard({ profile: undefined });
    expect(screen.getByText('Chargement du profil')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pseudonyme')).toBeNull();
  });

  it('propose d’en créer un quand il n’y en a pas', () => {
    renderCard({ profile: null });
    expect(
      screen.getByRole('button', { name: 'Créer mon profil' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Pseudonyme')).toHaveValue('');
  });

  it('reprend ce qui est enregistré quand il y en a un', () => {
    renderCard({ profile: profile() });
    expect(screen.getByLabelText('Pseudonyme')).toHaveValue('Tarzan');
    expect(screen.getByLabelText(/Identifiant public/)).toHaveValue('tarzan');
    expect(
      screen.getByRole('button', { name: 'Enregistrer' })
    ).toBeInTheDocument();
  });
});

describe('l’identifiant public', () => {
  it('se propose d’après le pseudonyme, sans s’imposer', async () => {
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText('Pseudonyme'), 'Éloïse');
    await user.click(screen.getByRole('button', { name: /Reprendre/ }));

    expect(screen.getByLabelText(/Identifiant public/)).toHaveValue('eloise');
  });

  it('est vérifié auprès du serveur à la sortie du champ', async () => {
    isHandleFree.mockResolvedValue(false);
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText(/Identifiant public/), 'admin');
    await user.tab();

    expect(isHandleFree).toHaveBeenCalledWith('admin');
    expect(
      await screen.findByText(/déjà pris, ou réservé/)
    ).toBeInTheDocument();
  });

  it('ne dérange pas le serveur pour celui qu’on détient déjà', async () => {
    const user = userEvent.setup();
    renderCard({ profile: profile() });

    await user.click(screen.getByLabelText(/Identifiant public/));
    await user.tab();

    expect(isHandleFree).not.toHaveBeenCalled();
  });

  it('refuse une forme invalide SANS appeler le serveur', async () => {
    // La contrainte du schéma le refuserait de toute façon ; le dire tout de
    // suite évite un aller-retour et un message technique.
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText('Pseudonyme'), 'Tarzan');
    await user.type(screen.getByLabelText(/Identifiant public/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Créer mon profil' }));

    expect(await screen.findByText(/entre 3 et 32/)).toBeInTheDocument();
    expect(isHandleFree).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('la visibilité du profil', () => {
  it('« Public » reste hors d’atteinte tant qu’il n’y a pas d’adresse', async () => {
    const user = userEvent.setup();
    renderCard({ profile: null });

    expect(screen.getByLabelText(/Public/)).toBeDisabled();
    expect(
      screen.getByText(/Choisissez d’abord un identifiant public/)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Identifiant public/), 'tarzan');

    expect(screen.getByLabelText(/Public/)).toBeEnabled();
  });

  it('retirer son identifiant referme le profil, sans laisser la case cochée', async () => {
    // Un profil « public » sans adresse désignerait une page injoignable.
    const user = userEvent.setup();
    renderCard({ profile: profile({ visibility: 'public' }) });

    await user.clear(screen.getByLabelText(/Identifiant public/));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ handle: null, visibility: 'private' })
    );
  });

  it('« Y montrer mes notes » n’apparaît qu’une fois le profil public', async () => {
    const user = userEvent.setup();
    renderCard({ profile: profile() });

    expect(screen.queryByLabelText(/montrer mes notes/)).toBeNull();

    await user.click(screen.getByLabelText(/Public/));

    expect(screen.getByLabelText(/montrer mes notes/)).toBeInTheDocument();
  });

  it('l’adresse du profil ne s’affiche que pour ce qui est ENREGISTRÉ', async () => {
    // Elle vient du profil en base, pas de ce qu'on est en train de taper :
    // l'annoncer avant d'enregistrer promettrait une page qui n'existe pas.
    const user = userEvent.setup();
    const { unmount } = renderCard({ profile: profile() });
    await user.click(screen.getByLabelText(/Public/));
    expect(screen.queryByText(/L’adresse de votre profil/)).toBeNull();
    unmount();

    renderCard({ profile: profile({ visibility: 'public' }) });
    expect(screen.getByText('L’adresse de votre profil')).toBeInTheDocument();
  });
});

describe('enregistrer', () => {
  it('range `null` quand on ne veut pas d’identifiant', async () => {
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText('Pseudonyme'), '  Tarzan  ');
    await user.click(screen.getByRole('button', { name: 'Créer mon profil' }));

    expect(save).toHaveBeenCalledWith({
      pseudonym: 'Tarzan',
      handle: null,
      bio: null,
      // Sans identifiant, « Public » n'est pas offert : la visibilité reste
      // celle d'un profil qu'on ne peut pas rejoindre.
      visibility: 'private',
      showNotes: false,
    });
  });

  it('revérifie au dernier moment — libre il y a trente secondes ne suffit pas', async () => {
    isHandleFree.mockResolvedValue(false);
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText('Pseudonyme'), 'Tarzan');
    await user.type(screen.getByLabelText(/Identifiant public/), 'tarzan');
    await user.click(screen.getByRole('button', { name: 'Créer mon profil' }));

    // Deux messages, deux choses : le champ dit « pris », l'alerte dit que
    // rien n'a été enregistré.
    expect(
      await screen.findByText(/le profil n’a pas été modifié/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cet identifiant est déjà pris, ou réservé.')
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('remonte le refus du serveur sans vider le formulaire', async () => {
    save.mockRejectedValueOnce(new Error('duplicate key value'));
    const user = userEvent.setup();
    renderCard({ profile: null });

    await user.type(screen.getByLabelText('Pseudonyme'), 'Tarzan');
    await user.click(screen.getByRole('button', { name: 'Créer mon profil' }));

    expect(await screen.findByText(/duplicate key/)).toBeInTheDocument();
    expect(screen.getByLabelText('Pseudonyme')).toHaveValue('Tarzan');
  });
});
