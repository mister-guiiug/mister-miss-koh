import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProfileRepository, mapProfile } from './profile';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  pseudonym: 'Tarzan',
  public_handle: 'tarzan',
  bio: null,
  visibility: 'private',
  show_notes: false,
  updated_at: '2026-09-06T10:00:00.000Z',
  ...over,
});

interface Answers {
  row?: unknown;
  rpc?: unknown;
  /** Ce que rend `personal_notes` — la lecture du profil public. */
  notes?: unknown[];
}

/**
 * Un client de fantaisie qui note ce qu'on lui écrit ET SUR QUELLE TABLE : la
 * lecture d'un profil public en interroge deux, dans un ordre qui compte.
 */
function fakeClient(log: unknown[], answers: Answers) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
    },
    from(table: string) {
      log.push({ table });
      const result: unknown =
        table === 'personal_notes'
          ? (answers.notes ?? [])
          : (answers.row ?? null);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
      chain.upsert = (payload: unknown) => {
        log.push(payload);
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve({ data: result, error: null });
      chain.single = () => Promise.resolve({ data: result, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: result, error: null }).then(resolve);
      return chain;
    },
    rpc: (fn: string, args: unknown) => {
      log.push({ fn, args });
      return Promise.resolve({ data: answers.rpc, error: null });
    },
  };
}

function repository(log: unknown[], answers: Answers = {}) {
  return createProfileRepository(() =>
    Promise.resolve(fakeClient(log, answers) as unknown as SupabaseClient)
  );
}

/** Ce qui a été ÉCRIT ou appelé — les entrées de table mises à part. */
const payload = (log: unknown[]) =>
  log.find(e => typeof e === 'object' && e !== null && !('table' in e));

/** Les tables interrogées, dans l'ordre. */
const tables = (log: unknown[]) =>
  log
    .filter(
      (e): e is { table: string } =>
        typeof e === 'object' && e !== null && 'table' in e
    )
    .map(e => e.table);

describe('lire son profil', () => {
  it('rend `null` quand il n’y en a pas — ce n’est pas une panne', () => {
    // Rien ne peuple `profiles` : l'absence est l'état NORMAL d'un compte neuf.
    return expect(repository([]).load()).resolves.toBeNull();
  });

  it('traduit les colonnes du schéma', async () => {
    expect(await repository([], { row: row() }).load()).toEqual({
      id: 'u-1',
      pseudonym: 'Tarzan',
      handle: 'tarzan',
      bio: null,
      visibility: 'private',
      showNotes: false,
      updatedAt: '2026-09-06T10:00:00.000Z',
    });
    expect(mapProfile(row({ public_handle: null })).handle).toBeNull();
  });
});

describe('enregistrer son profil', () => {
  it('écrit l’identifiant du compte, jamais celui du formulaire', async () => {
    // La politique `profils_creation` exige `id = auth.uid()` : un client qui
    // enverrait un autre identifiant serait refusé, autant ne pas le tenter.
    const log: unknown[] = [];
    await repository(log, { row: row() }).save({
      pseudonym: 'Tarzan',
      handle: 'tarzan',
      bio: null,
      visibility: 'public',
      showNotes: true,
    });

    expect(payload(log)).toEqual({
      id: 'u-1',
      pseudonym: 'Tarzan',
      public_handle: 'tarzan',
      bio: null,
      visibility: 'public',
      show_notes: true,
    });
  });

  it('range `null` et non une chaîne vide quand on ne veut pas d’adresse', async () => {
    // `public_handle` est `unique` : deux chaînes vides s'y heurteraient, et
    // le second profil sans identifiant serait refusé.
    const log: unknown[] = [];
    await repository(log, { row: row({ public_handle: null }) }).save({
      pseudonym: 'Tarzan',
      handle: '',
      bio: '',
      visibility: 'private',
      showNotes: false,
    });

    expect(payload(log)).toMatchObject({ public_handle: null });
  });
});

describe('le profil public de quelqu’un', () => {
  const publicRow = (over: Record<string, unknown> = {}) => ({
    id: 'u-9',
    pseudonym: 'Tarzan',
    public_handle: 'tarzan',
    bio: 'Je note tout.',
    show_notes: true,
    ...over,
  });

  it('rend `null` quand l’adresse n’ouvre rien, sans interroger les notes', async () => {
    // Identifiant inexistant ou profil redevenu privé : le serveur rend zéro
    // ligne dans les deux cas, et on n'essaie pas de les distinguer.
    const log: unknown[] = [];
    expect(await repository(log).loadPublic('inconnu')).toBeNull();
    expect(tables(log)).toEqual(['profiles']);
  });

  it('ne lit PAS les notes quand la personne ne les montre pas', async () => {
    const log: unknown[] = [];
    const view = await repository(log, {
      row: publicRow({ show_notes: false }),
      notes: [{ id: 'ne-devrait-pas-etre-lu' }],
    }).loadPublic('tarzan');

    expect(view?.notes).toEqual([]);
    expect(tables(log)).toEqual(['profiles']);
  });

  it('lit les notes publiques quand elle les montre', async () => {
    const log: unknown[] = [];
    const view = await repository(log, {
      row: publicRow(),
      notes: [
        {
          id: 'n-1',
          title: 'Un titre',
          body: 'un texte',
          rating: null,
          is_draft: false,
          is_pinned: false,
          visibility: 'public',
          updated_at: '2026-09-06T10:00:00.000Z',
          season_id: null,
          season_contestant_id: 'c-1',
          episode_id: null,
          team_id: null,
          challenge_id: null,
          council_id: null,
          departure_id: null,
        },
      ],
    }).loadPublic('tarzan');

    expect(tables(log)).toEqual(['profiles', 'personal_notes']);
    expect(view?.profile).toEqual({
      pseudonym: 'Tarzan',
      handle: 'tarzan',
      bio: 'Je note tout.',
      showNotes: true,
    });
    // L'identifiant de compte sert de filtre et ne ressort pas.
    expect(view?.profile).not.toHaveProperty('id');
    expect(view?.notes[0]?.target).toBe('season_contestant');
  });
});

describe('la disponibilité d’un identifiant', () => {
  it('se demande au SERVEUR, qui seul voit les profils des autres', async () => {
    const log: unknown[] = [];
    const libre = await repository(log, { rpc: true }).handleAvailable(
      'tarzan'
    );

    expect(payload(log)).toEqual({
      fn: 'handle_is_available',
      args: { candidate: 'tarzan' },
    });
    expect(libre).toBe(true);
  });

  it('une réponse qui n’est pas franchement `true` vaut « pris »', async () => {
    // La fonction rend un booléen ; `null` ne peut venir que d'un appel
    // dégradé, et affirmer « libre » sur cette base ferait échouer la saisie
    // plus tard, à la contrainte.
    expect(await repository([], { rpc: null }).handleAvailable('x')).toBe(
      false
    );
  });
});
