import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { backend } from './backend/referentialRepository';
import { useAppStore } from './store/useAppStore';
import { shareOrCopy } from '@mister-guiiug/dev-pwa-config/share';

// `currentAppUrl` reste le vrai : c'est lui qu'on éprouve — il doit rendre la
// base du déploiement, sans le fragment de l'écran courant.
vi.mock('@mister-guiiug/dev-pwa-config/share', async importer => ({
  ...(await importer<typeof import('@mister-guiiug/dev-pwa-config/share')>()),
  shareOrCopy: vi.fn(() => Promise.resolve('shared')),
}));

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
    // la pastille — trois logos différents selon qu'on regardait le site,
    // l'onglet ou l'application installée. Ce test tient la source unique : le
    // fichier servi ici est CELUI dont `npm run icons` tire les PNG du
    // manifeste.
    const { container } = render(<App />);
    await screen.findByText('Saison de démonstration');

    const marque = container.querySelector('.brand-mark');
    expect(marque).toHaveAttribute(
      'src',
      expect.stringContaining('favicon.svg')
    );
    // Décorative : le titre la suit et la dit déjà.
    expect(marque).toHaveAttribute('alt', '');
    // ET PLUS AUCUNE FLAMME DE `lucide` NULLE PART DANS LA COQUE. La marque
    // était une flamme pleine en dégradé de braise dans une tuile arrondie —
    // celle de Tinder au dégradé près. En sortir suppose d'en sortir partout
    // où elle ne faisait que signer : l'en-tête, et le repli du chargement.
    // (Elle demeure là où elle veut dire « ceci s'éteint » : le partage d'un
    // jour, qui n'est pas rendu par cet écran.)
    expect(container.querySelector('.lucide-flame')).toBeNull();
  });

  it('le titre ramène à l’accueil, depuis n’importe quel écran', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/reglages';
    render(<App />);
    expect(await screen.findByText('Source de vérité')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Mister & Miss Koh' }));

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

  it('partager l’application donne la RACINE, pas l’écran où l’on se trouve', async () => {
    // Le piège de cette carte : elle vit dans les Réglages, et un lien qui
    // emporterait le fragment courant ferait atterrir le destinataire sur les
    // Réglages de quelqu'un d'autre.
    const user = userEvent.setup();
    window.location.hash = '#/reglages';
    render(<App />);
    await screen.findByText('Partager l’application');

    // `lead` : le partage est visible d'emblée, pas derrière le QR.
    await user.click(screen.getByRole('button', { name: 'Partager le lien' }));

    const [charge] = vi.mocked(shareOrCopy).mock.calls.at(-1) ?? [];
    expect(charge?.title).toBe('Mister & Miss Koh');
    expect(charge?.url).not.toContain('#');
    expect(charge?.url).toBe(`${window.location.origin}/`);
  });

  it('la carte de version dit QUEL build tourne, et de quoi il est fait', async () => {
    // Un numéro de version ne distingue pas deux déploiements du même jour.
    // Et « ^4.5.0 » dans un package.json ne dit pas sur quelle 4.x on tourne :
    // ce sont les versions DU DISQUE qui répondent, injectées au build.
    window.location.hash = '#/reglages';
    const { container } = render(<App />);
    await screen.findByText('Version installée');

    expect(screen.getByText('Application')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();

    const details = container.querySelector('details.version-details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details!.textContent).toContain('@mister-guiiug/dev-pwa-config');
    expect(details!.textContent).toContain('4.5.0');
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
