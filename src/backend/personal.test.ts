/**
 * Le suivi qui suit le compte, côté client.
 *
 * DEUX MOITIÉS, COMME AILLEURS : la fusion est PURE et se teste sans serveur ;
 * le dépôt est du câblage, vérifié avec un client de fantaisie qui enregistre
 * ce qu'on lui demande. Ce que ces tests ne prouvent PAS — qu'un compte ne
 * lise pas le suivi d'un autre — se prouve en base, dans
 * `supabase/tests/personnel.test.sql` : un contrôle écrit ici serait un second
 * endroit où se tromper, et le premier à être contourné.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPersonalRepository,
  isEmpty,
  mergeSnapshots,
  missingFrom,
} from './personal';

const snapshot = (favorites: string[], watchedEpisodeIds: string[]) => ({
  favorites,
  watchedEpisodeIds,
});

describe('mergeSnapshots', () => {
  it('réunit l’appareil et le compte, sans doublon', () => {
    const union = mergeSnapshots(
      snapshot(['sc-a'], ['e-1', 'e-2']),
      snapshot(['sc-a', 'sc-b'], ['e-2', 'e-3'])
    );
    expect([...union.favorites].sort()).toEqual(['sc-a', 'sc-b']);
    expect([...union.watchedEpisodeIds].sort()).toEqual(['e-1', 'e-2', 'e-3']);
  });

  it('n’efface RIEN, dans aucun sens', () => {
    // C'est tout l'intérêt de l'union : un « dernier écrivain gagne »
    // supprimerait en silence les épisodes vus de l'autre appareil — la perte
    // exacte que ce chantier répare.
    const union = mergeSnapshots(snapshot([], ['e-1']), snapshot(['sc-a'], []));
    expect(union.watchedEpisodeIds).toEqual(['e-1']);
    expect(union.favorites).toEqual(['sc-a']);
  });
});

describe('missingFrom', () => {
  it('ne garde que ce que l’appareil a en plus — on ne renvoie pas ce qui y est déjà', () => {
    const delta = missingFrom(
      snapshot(['sc-a'], ['e-1']),
      snapshot(['sc-a', 'sc-b'], ['e-1', 'e-2'])
    );
    expect(delta).toEqual(snapshot(['sc-b'], ['e-2']));
  });

  it('rien à pousser quand le compte sait déjà tout', () => {
    expect(
      isEmpty(missingFrom(snapshot(['sc-a'], ['e-1']), snapshot(['sc-a'], [])))
    ).toBe(true);
  });
});

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
  filters: [string, unknown][];
}

/** Client de fantaisie : enregistre ce qu'on lui demande, ne parle à personne. */
function fakeClient(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];

  const chain = (result: { data: unknown; error: null }) => {
    const call = calls[calls.length - 1];
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.eq = (column: string, value: unknown) => {
      call?.filters.push([column, value]);
      return self;
    };
    self.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return self;
  };

  const client = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
    },
    from(table: string) {
      const start = (op: string, payload?: unknown, options?: unknown) => {
        calls.push({ table, op, payload, options, filters: [] });
        return chain({ data: rows[table] ?? [], error: null });
      };
      return {
        select: () => start('select'),
        upsert: (payload: unknown, options: unknown) =>
          start('upsert', payload, options),
        delete: () => start('delete'),
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe('createPersonalRepository', () => {
  it('lit MES lignes, pas « tout ce que le serveur veut bien rendre »', async () => {
    // Une seule politique de lecture existe aujourd'hui sur ces tables, et
    // `supabase/tests/personnel.test.sql` le fige. Le filtre reste : le jour
    // où une deuxième politique arrive, elle se combinerait par OU, et un
    // écran « Mes favoris » afficherait ceux d'un inconnu.
    const { client, calls } = fakeClient();
    const repo = createPersonalRepository(() => Promise.resolve(client));
    await repo.pull();

    expect(calls.map(c => [c.table, c.op])).toEqual([
      ['user_favorites', 'select'],
      ['watched_episodes', 'select'],
    ]);
    for (const call of calls) {
      expect(call.filters).toContainEqual(['user_id', 'u-1']);
    }
  });

  it('rend les identifiants du serveur, validés un par un', async () => {
    const { client } = fakeClient({
      user_favorites: [{ season_contestant_id: 'sc-a' }],
      watched_episodes: [{ episode_id: 'e-1' }, { episode_id: 'e-2' }],
    });
    const repo = createPersonalRepository(() => Promise.resolve(client));
    expect(await repo.pull()).toEqual(snapshot(['sc-a'], ['e-1', 'e-2']));
  });

  it('l’envoi de fusion attache tout à l’utilisateur courant, et tolère l’existant', async () => {
    const { client, calls } = fakeClient();
    const repo = createPersonalRepository(() => Promise.resolve(client));
    await repo.push(snapshot(['sc-a'], ['e-1']));

    const favorites = calls.find(c => c.table === 'user_favorites');
    expect(favorites?.payload).toEqual([
      { user_id: 'u-1', season_contestant_id: 'sc-a' },
    ]);
    // Une ligne déjà présente n'est PAS une erreur : c'est le résultat attendu
    // d'une reprise après coupure ou d'un second onglet.
    expect(favorites?.options).toMatchObject({ ignoreDuplicates: true });
  });

  it('un envoi vide ne parle même pas au serveur', async () => {
    const { client, calls } = fakeClient();
    const repo = createPersonalRepository(() => Promise.resolve(client));
    await repo.push(snapshot([], []));
    expect(calls).toEqual([]);
  });

  it('décocher SUPPRIME la ligne, et seulement la sienne', async () => {
    const { client, calls } = fakeClient();
    const repo = createPersonalRepository(() => Promise.resolve(client));
    await repo.setWatched('e-1', false);

    const call = calls.find(c => c.op === 'delete');
    expect(call?.table).toBe('watched_episodes');
    expect(call?.filters).toEqual([
      ['user_id', 'u-1'],
      ['episode_id', 'e-1'],
    ]);
  });

  it('cocher AJOUTE, sans écraser une ligne déjà là', async () => {
    const { client, calls } = fakeClient();
    const repo = createPersonalRepository(() => Promise.resolve(client));
    await repo.setFavorite('sc-b', true);

    const call = calls.find(c => c.op === 'upsert');
    expect(call?.table).toBe('user_favorites');
    expect(call?.payload).toEqual({
      user_id: 'u-1',
      season_contestant_id: 'sc-b',
    });
  });

  it('sans session, on ne devine pas d’identifiant : on refuse', async () => {
    const { client } = fakeClient();
    const sansSession = {
      ...client,
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    } as unknown as SupabaseClient;
    const repo = createPersonalRepository(() => Promise.resolve(sansSession));
    await expect(repo.pull()).rejects.toThrow(/aucune session/);
  });
});
