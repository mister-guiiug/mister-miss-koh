/**
 * « Vu sur le téléphone, vu sur la tablette » — vu du client.
 *
 * `supabase/tests/personnel.test.sql` prouve la moitié serveur : les deux
 * tables sont étanches, et deux sessions du même compte y lisent la même
 * chose. Ce fichier prouve l'autre moitié, celle qui manquait vraiment :
 * l'appareil et le compte sont RÉUNIS au lieu de s'écraser, et rien de tout
 * cela n'est exigé pour que l'application marche.
 *
 * TROIS CHOSES QUI DOIVENT RESTER VRAIES :
 *
 *  1. la fusion est une UNION. Un « dernier écrivain gagne » effacerait en
 *     silence les épisodes vus de l'autre appareil — la perte exacte que ce
 *     chantier supprime ;
 *  2. la démonstration ne parle à personne. Ses identifiants (`c-ael`, `e1`)
 *     ne sont pas des uuid : les envoyer ferait échouer chaque insertion, et
 *     publierait un suivi qui ne veut rien dire ;
 *  3. un serveur qui refuse ne change RIEN à ce que l'écran affiche. Le
 *     magasin local reste la référence de l'appareil.
 *
 * Le magasin est le vrai (`useAppStore`), seul le dépôt est de fantaisie :
 * remplacer le magasin aurait testé le test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { DEMO_REFERENTIAL } from '../backend/demo';
import {
  EMPTY_SNAPSHOT,
  type PersonalRepository,
  type PersonalSnapshot,
} from '../backend/personal';
import { useAppStore } from '../store/useAppStore';

const session = vi.hoisted(() => ({
  value: {
    account: { id: 'u-1', email: 'a@exemple.test' } as {
      id: string;
      email: string;
    } | null,
    available: true,
  },
}));

vi.mock('./useSession', () => ({ useSession: () => session.value }));

const { usePersonalSync } = await import('./usePersonalSync');

/** Un dépôt qui garde ce qu'on lui envoie, comme le ferait la base. */
function repositoryWith(server: PersonalSnapshot) {
  const pushed: PersonalSnapshot[] = [];
  const gestures: string[] = [];
  return {
    pushed,
    gestures,
    repository: {
      pull: () => Promise.resolve(server),
      push: (snapshot: PersonalSnapshot) => {
        pushed.push(snapshot);
        return Promise.resolve();
      },
      setFavorite: (id: string, on: boolean) => {
        gestures.push(`favori ${id} ${on ? 'on' : 'off'}`);
        return Promise.resolve();
      },
      setWatched: (id: string, on: boolean) => {
        gestures.push(`vu ${id} ${on ? 'on' : 'off'}`);
        return Promise.resolve();
      },
    } satisfies PersonalRepository,
  };
}

function Harness({ repository }: { repository: PersonalRepository }) {
  usePersonalSync(repository);
  return null;
}

function mount(repository: PersonalRepository) {
  return render(
    <ToastProvider>
      <Harness repository={repository} />
    </ToastProvider>
  );
}

/**
 * Laisse tourner ce qui est déjà planifié.
 *
 * Les deux tests qui prouvent une ABSENCE d'appel ne peuvent pas l'attendre :
 * un `waitFor` sur une assertion déjà vraie n'attend rien et passerait même si
 * l'appel partait un tour plus tard. On vide donc la file des promesses, puis
 * on constate.
 */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  session.value = {
    account: { id: 'u-1', email: 'a@exemple.test' },
    available: true,
  };
  useAppStore.setState({
    referential: DEMO_REFERENTIAL,
    origin: 'server',
    ready: true,
    watched: [],
    favorites: [],
  });
});

describe('usePersonalSync — le suivi qui suit le compte', () => {
  it('réunit l’appareil et le compte, sans effacer ni l’un ni l’autre', async () => {
    // L'appareil a vu l'épisode 1 ; le compte, l'épisode 2 — parce qu'une
    // autre tablette l'y avait mis. Aucun des deux ne doit disparaître.
    useAppStore.setState({ watched: [1], favorites: ['c-ael'] });
    const { repository, pushed } = repositoryWith({
      favorites: ['c-bastien'],
      watchedEpisodeIds: ['e2'],
    });

    mount(repository);

    await waitFor(() => {
      expect(useAppStore.getState().watched).toEqual([1, 2]);
    });
    expect([...useAppStore.getState().favorites].sort()).toEqual([
      'c-ael',
      'c-bastien',
    ]);
    // Et ce qui manquait au compte est parti — seulement ce qui manquait.
    expect(pushed).toEqual([
      { favorites: ['c-ael'], watchedEpisodeIds: ['e1'] },
    ]);
  });

  it('une fois branché, chaque geste part au serveur avec son sens', async () => {
    const { repository, gestures } = repositoryWith(EMPTY_SNAPSHOT);
    mount(repository);
    // Le relais est branché AVANT la fusion, justement pour qu'un geste posé
    // pendant qu'elle tourne parte quand même ; on laisse la fusion finir pour
    // que la lecture des gestes ne dépende pas de l'ordre.
    await flush();

    useAppStore.getState().toggleWatched(3);
    useAppStore.getState().toggleFavorite('c-celeste');
    useAppStore.getState().toggleWatched(3);

    // Décocher n'est pas « ne rien envoyer » : la ligne est retirée côté
    // serveur, sinon l'autre appareil remettrait l'épisode au prochain accord.
    expect(gestures).toEqual(['vu e3 on', 'favori c-celeste on', 'vu e3 off']);
  });

  it('sur la démonstration, personne n’est appelé', async () => {
    // `c-ael` et `e1` ne sont pas des uuid : les envoyer ferait échouer chaque
    // insertion, et publierait un suivi de fantaisie.
    useAppStore.setState({ origin: 'demo', watched: [1] });
    const pull = vi.fn(() => Promise.resolve(EMPTY_SNAPSHOT));
    const { repository, gestures } = repositoryWith(EMPTY_SNAPSHOT);

    mount({ ...repository, pull });
    await flush();

    useAppStore.getState().toggleWatched(2);
    await flush();

    // L'application marche : la case est cochée en local. Simplement, rien
    // n'est parti.
    expect(useAppStore.getState().watched).toEqual([1, 2]);
    expect(pull).not.toHaveBeenCalled();
    expect(gestures).toEqual([]);
  });

  it('sans compte, le magasin local fait tout le travail', async () => {
    session.value = { account: null, available: true };
    const pull = vi.fn(() => Promise.resolve(EMPTY_SNAPSHOT));
    const { repository, gestures } = repositoryWith(EMPTY_SNAPSHOT);

    mount({ ...repository, pull });
    await flush();

    useAppStore.getState().toggleFavorite('c-dimitri');
    await flush();

    expect(useAppStore.getState().favorites).toEqual(['c-dimitri']);
    expect(pull).not.toHaveBeenCalled();
    expect(gestures).toEqual([]);
  });

  it('un serveur qui refuse le dit, et ne retire rien de l’écran', async () => {
    useAppStore.setState({ watched: [1], favorites: ['c-ael'] });
    const { repository } = repositoryWith(EMPTY_SNAPSHOT);

    mount({
      ...repository,
      pull: () => Promise.reject(new Error('injoignable')),
    });

    // On attend la NOTIFICATION, pas l'état : « le suivi n'a pas bougé » est
    // déjà vrai au montage, et l'attendre n'attendrait rien. C'est la
    // notification qui prouve que le rattrapage d'erreur a bien tourné —
    // ensuite seulement, constater que rien n'a été retiré a un sens.
    expect(
      await screen.findByText('Votre suivi n’a pas pu être synchronisé.')
    ).toBeInTheDocument();
    expect(useAppStore.getState().watched).toEqual([1]);
    expect(useAppStore.getState().favorites).toEqual(['c-ael']);
  });
});
