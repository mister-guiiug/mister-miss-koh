import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProfileRepository, mapProfile } from './profile';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  pseudonym: 'Tarzan',
  public_handle: 'tarzan',
  updated_at: '2026-09-06T10:00:00.000Z',
  ...over,
});

/** Un client de fantaisie qui note ce qu'on lui écrit. */
function fakeClient(log: unknown[], answers: { row?: unknown; rpc?: unknown }) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
    },
    from() {
      const result: unknown = answers.row ?? null;
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = () => chain;
      chain.upsert = (payload: unknown) => {
        log.push(payload);
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve({ data: result, error: null });
      chain.single = () => Promise.resolve({ data: result, error: null });
      return chain;
    },
    rpc: (fn: string, args: unknown) => {
      log.push({ fn, args });
      return Promise.resolve({ data: answers.rpc, error: null });
    },
  };
}

function repository(
  log: unknown[],
  answers: { row?: unknown; rpc?: unknown } = {}
) {
  return createProfileRepository(() =>
    Promise.resolve(fakeClient(log, answers) as unknown as SupabaseClient)
  );
}

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
    });

    expect(log[0]).toEqual({
      id: 'u-1',
      pseudonym: 'Tarzan',
      public_handle: 'tarzan',
    });
  });

  it('range `null` et non une chaîne vide quand on ne veut pas d’adresse', async () => {
    // `public_handle` est `unique` : deux chaînes vides s'y heurteraient, et
    // le second profil sans identifiant serait refusé.
    const log: unknown[] = [];
    await repository(log, { row: row({ public_handle: null }) }).save({
      pseudonym: 'Tarzan',
      handle: '',
    });

    expect(log[0]).toMatchObject({ public_handle: null });
  });
});

describe('la disponibilité d’un identifiant', () => {
  it('se demande au SERVEUR, qui seul voit les profils des autres', async () => {
    const log: unknown[] = [];
    const libre = await repository(log, { rpc: true }).handleAvailable(
      'tarzan'
    );

    expect(log[0]).toEqual({
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
