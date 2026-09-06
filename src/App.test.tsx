import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { backend } from './backend/referentialRepository';
import { useAppStore } from './store/useAppStore';

// Le magasin est un module : chaque test repart d'un référentiel non chargé,
// sinon `init()` — qui ne recharge pas une fois prêt — ne ferait rien.
beforeEach(() => {
  useAppStore.setState({
    ready: false,
    loading: false,
    error: null,
    referential: null,
    origin: null,
    notice: null,
  });
  window.location.hash = '';
});
afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('démarre sans configuration, sur la démonstration, et le dit', async () => {
    render(<App />);
    expect(
      await screen.findByText('Saison de démonstration')
    ).toBeInTheDocument();
    // LA FICTION SE DIT DÈS L'ACCUEIL. Le pavé de provenance a quitté cet
    // écran pour les Réglages, où on le consulte ; ce qui ne devait pas
    // partir avec lui, c'est l'aveu — porté par le sous-titre de la saison.
    expect(
      screen.getByText('Donnée fictive de démonstration')
    ).toBeInTheDocument();
    // Et l'app se déclare non officielle.
    expect(screen.getByText(/non officielle/i)).toBeInTheDocument();
  });

  it('l’en-tête porte la MARQUE, pas une icône qui lui ressemble', async () => {
    // L'en-tête affichait une flamme de `lucide` : un contour générique, sans
    // la vague ni la pastille — trois logos différents selon qu'on regardait
    // le site, l'onglet ou l'application installée. Ce test tient la source
    // unique : le fichier servi ici est CELUI dont `npm run icons` tire les
    // PNG du manifeste.
    const { container } = render(<App />);
    await screen.findByText('Saison de démonstration');

    const marque = container.querySelector('.brand-mark');
    expect(marque).toHaveAttribute(
      'src',
      expect.stringContaining('favicon.svg')
    );
    // Décorative : le titre la suit et la dit déjà.
    expect(marque).toHaveAttribute('alt', '');
    expect(container.querySelector('.lucide-flame')).toBeNull();
  });

  it('le titre ramène à l’accueil, depuis n’importe quel écran', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reglages';
    render(<App />);
    expect(await screen.findByText('Source de vérité')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Mister & miss Koh' }));

    expect(
      await screen.findByText('Saison de démonstration')
    ).toBeInTheDocument();
    expect(screen.queryByText('Source de vérité')).not.toBeInTheDocument();
  });

  it('le pied de page ne répète plus la version', async () => {
    // Elle a sa carte « Version installée » dans les Réglages, et le
    // paragraphe « À propos » la porte aussi : trois fois, c'était deux de
    // trop, et celle du bas ne menait à rien.
    const { container } = render(<App />);
    await screen.findByText('Saison de démonstration');

    const pied = container.querySelector('[data-dwc="app-footer"]');
    expect(pied).not.toBeNull();
    expect(pied!.textContent).not.toMatch(/\d+\.\d+\.\d+/);
    expect(pied!.textContent).toContain('Code source');
  });

  it('la provenance a suivi jusqu’aux Réglages, elle n’a pas disparu', async () => {
    // Retirer un pavé d'un écran ne doit pas retirer la traçabilité de
    // l'application : c'est la promesse du README, et elle se vérifie là où
    // le pavé vit désormais.
    window.location.hash = '#/reglages';
    render(<App />);

    expect(await screen.findByText('Source de vérité')).toBeInTheDocument();
    // Sur la démonstration, le pavé de provenance dit la fiction et pourquoi.
    expect(
      screen.getByText(/Aucun de ces noms n’est réel/)
    ).toBeInTheDocument();
  });

  it('le référentiel de démonstration passe la validation à la frontière', async () => {
    const { DEMO_REFERENTIAL } = await import('./backend/demo');
    expect(DEMO_REFERENTIAL.provenance.kind).toBe('demo');
    expect(DEMO_REFERENTIAL.contestants.length).toBeGreaterThan(0);
  });

  it('le premier chargement en échec bloque l’écran : il n’y a rien à montrer', async () => {
    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce(
      new Error('serveur injoignable')
    );

    render(<App />);

    expect(
      await screen.findByText('Référentiel illisible')
    ).toBeInTheDocument();
    expect(screen.getByText('serveur injoignable')).toBeInTheDocument();
    expect(
      screen.queryByText('Saison de démonstration')
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'Réglages' })).toHaveLength(0);
  });

  it('un rechargement en échec laisse l’application affichée, sur la lecture précédente', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reglages';
    render(<App />);
    const button = await screen.findByRole('button', {
      name: 'Actualiser les données',
    });
    const before = useAppStore.getState().referential;
    expect(before).not.toBeNull();

    vi.spyOn(backend.referential, 'load').mockRejectedValueOnce(
      new Error('serveur injoignable')
    );
    await user.click(button);

    // L'échec est dit — toast, puis avis des Réglages — et l'écran reste.
    expect(await screen.findByText('serveur injoignable')).toBeInTheDocument();
    expect(screen.getByText(/Le rechargement a échoué/)).toBeInTheDocument();
    expect(screen.queryByText('Référentiel illisible')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Réglages' })
    ).toBeInTheDocument();
    expect(useAppStore.getState().referential).toBe(before);
    expect(useAppStore.getState().error).toBe('serveur injoignable');
  });
});

/**
 * Les deux écrans où l'on n'arrive QUE par un lien sont chargés à la demande,
 * pour qu'ils ne pèsent pas sur le premier écran de tout le monde. Ce qui se
 * vérifie ici n'est pas le découpage — c'est qu'un lien reçu ouvre encore
 * quelque chose : une frontière `Suspense` mal posée ou un chemin d'import
 * faux ne se voient qu'à l'exécution, et jamais dans un diff.
 */
describe('les écrans chargés à la demande', () => {
  it('un lien de partage ouvre son écran', async () => {
    window.location.hash = '#/partage/note/jeton-invente';
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Notes partagées' })
    ).toBeInTheDocument();
  });

  it('l’adresse d’un profil ouvre le sien', async () => {
    window.location.hash = '#/profil/personne';
    render(<App />);

    // Sans backend configuré, la lecture échoue : l'écran dit alors ce qu'il
    // dit pour une adresse inconnue — et c'est bien LUI qui est monté.
    expect(
      await screen.findByText('Aucun profil à cette adresse')
    ).toBeInTheDocument();
  });
});
