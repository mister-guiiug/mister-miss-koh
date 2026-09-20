/**
 * CE QUE CES TESTS TIENNENT : l'application ne reste pas coincée sur un repli.
 *
 * Signalé le 20/09/2026 — « au premier chargement de mister-miss-koh, j'ai le
 * message : Serveur injoignable : dernière version enregistrée. » Le message
 * est juste, et il l'était pour de bonnes raisons : `supabaseReferential`
 * retombe sur la dernière version enregistrée si `navigator.onLine` est faux à
 * l'instant de la lecture, ou si le serveur reste muet cinq secondes. Le défaut
 * n'était pas là. Il était qu'ensuite, PLUS RIEN ne revenait sur cette
 * décision : `init()` sort d'emblée si le magasin est `ready`, même prêt sur un
 * repli, et rien n'écoutait le retour de la connexion — alors que
 * `usePersonalSync` le fait pour les notes depuis toujours.
 *
 * On éprouve donc le CONTRAT du rattrapage, pas sa mise en forme : ce qui est
 * repris, ce qui ne l'est pas, et le fait qu'il ne s'emballe jamais.
 *
 * Le magasin est le VRAI : seul le port du référentiel est remplacé, comme le
 * ferait un serveur injoignable. Remplacer le magasin aurait testé le test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { backend } from '../backend/referentialRepository';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { useAppStore } from '../store/useAppStore';

const reseau = vi.hoisted(() => ({ online: true }));

vi.mock('@mister-guiiug/dev-pwa-config/react/use-online', () => ({
  useOnline: () => reseau.online,
}));

const { useReferentialRetry } = await import('./useReferentialRetry');

/** Le hook seul, sans écran autour : c'est lui qu'on éprouve. */
function Sonde() {
  // Sans répit : le délai protège le premier chargement d'un embouteillage,
  // il n'a rien à prouver ici.
  useReferentialRetry(0);
  return null;
}

/** L'état du magasin au sortir d'une lecture, quelle que soit son origine. */
type EtatPartiel = Partial<ReturnType<typeof useAppStore.getState>>;

function poseLEtat(etat: EtatPartiel) {
  useAppStore.setState({
    ready: true,
    loading: false,
    error: null,
    referential: DEMO_REFERENTIAL,
    notice: null,
    ...etat,
  });
}

beforeEach(() => {
  reseau.online = true;
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('reprendre le référentiel quand on est sur un repli', () => {
  it('redemande quand l’écran montre la dernière version enregistrée', async () => {
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockResolvedValue({ referential: DEMO_REFERENTIAL, origin: 'server' });

    poseLEtat({
      origin: 'cache',
      notice: 'Serveur injoignable : dernière version enregistrée.',
    });
    render(<Sonde />);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    // Et l'avis s'efface de lui-même : c'est le seul message utile, le
    // visiteur n'ayant rien demandé.
    await waitFor(() => expect(useAppStore.getState().notice).toBeNull());
  });

  it('rattrape aussi l’impasse d’un premier chargement sans rien derrière lui', async () => {
    // « Référentiel illisible » est un cul-de-sac : l'écran n'offre même pas
    // de bouton pour réessayer.
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockResolvedValue({ referential: DEMO_REFERENTIAL, origin: 'server' });

    poseLEtat({
      origin: null,
      referential: null,
      error: 'serveur injoignable',
    });
    render(<Sonde />);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  it('ne redemande rien quand la lecture vient du serveur', async () => {
    const load = vi.spyOn(backend.referential, 'load');

    poseLEtat({ origin: 'server' });
    render(<Sonde />);

    await new Promise(r => setTimeout(r, 20));
    expect(load).not.toHaveBeenCalled();
  });

  it('ne redemande rien sur la démonstration : le serveur A répondu', async () => {
    // « Le serveur ne publie encore aucune saison » n'est pas une panne, c'est
    // une réponse. La redemander en boucle ne changerait rien.
    const load = vi.spyOn(backend.referential, 'load');

    poseLEtat({ origin: 'demo', notice: 'aucune saison' });
    render(<Sonde />);

    await new Promise(r => setTimeout(r, 20));
    expect(load).not.toHaveBeenCalled();
  });

  it('attend hors ligne, et reprend au retour du réseau', async () => {
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockResolvedValue({ referential: DEMO_REFERENTIAL, origin: 'server' });

    reseau.online = false;
    poseLEtat({ origin: 'cache' });
    const { rerender } = render(<Sonde />);

    await new Promise(r => setTimeout(r, 20));
    // Redemander sans réseau, c'est ajouter une panne à une panne.
    expect(load).not.toHaveBeenCalled();

    reseau.online = true;
    rerender(<Sonde />);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  it('ne s’emballe pas quand le serveur répond « cache » à chaque fois', async () => {
    // LE RISQUE DE CE GENRE DE RATTRAPAGE : une boucle. Le serveur reste muet,
    // l'origine reste `cache`, et un rattrapage non gardé redemanderait sans
    // fin — sur la connexion même qui ne répond pas.
    const load = vi.spyOn(backend.referential, 'load').mockResolvedValue({
      referential: DEMO_REFERENTIAL,
      origin: 'cache',
      notice: 'Serveur injoignable : dernière version enregistrée.',
    });

    poseLEtat({ origin: 'cache' });
    render(<Sonde />);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 60));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
