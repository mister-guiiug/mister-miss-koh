import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSharingRepository,
  mapLink,
  mapSharedNote,
  type ShareLink,
} from './sharing';

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  token: 'jeton',
  scope: 'note',
  note_id: 'n-1',
  label: null,
  view_count: 0,
  created_at: '2026-09-06T10:00:00.000Z',
  ...over,
});

const sharedRow = (over: Record<string, unknown> = {}) => ({
  note_id: 'n-1',
  title: 'Sacrée poigne',
  body: 'Elle a tenu.',
  rating: 4,
  target: 'season_contestant',
  target_id: 'c-joana',
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-06T10:00:00.000Z',
  author_pseudonym: null,
  author_handle: null,
  ...over,
});

/**
 * Un client de fantaisie qui NOTE ce qu'on lui demande, dans l'ordre. Ce
 * module ne calcule rien ; ce qu'il faut prouver, c'est la séquence.
 */
function fakeClient(
  log: string[],
  answers: { row?: unknown; rpc?: unknown[] }
) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
    },
    from(table: string) {
      let result: unknown = [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'order']) {
        chain[m] = () => chain;
      }
      chain.update = (patch: Record<string, unknown>) => {
        log.push(`update ${table} → ${Object.keys(patch).sort().join(',')}`);
        return chain;
      };
      chain.insert = (row: Record<string, unknown>) => {
        log.push(`insert ${table} → ${String(row.scope)}`);
        result = answers.row;
        return chain;
      };
      chain.single = () => Promise.resolve({ data: result, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: result, error: null }).then(resolve);
      return chain;
    },
    rpc: (fn: string) => {
      log.push(`rpc ${fn}`);
      return Promise.resolve({ data: answers.rpc ?? [], error: null });
    },
  };
}

function repository(
  log: string[],
  answers: { row?: unknown; rpc?: unknown[] } = {}
) {
  return createSharingRepository(() =>
    Promise.resolve(fakeClient(log, answers) as unknown as SupabaseClient)
  );
}

describe('lire une ligne de lien', () => {
  it('traduit les colonnes, et refuse une portée qu’on ne sait pas ouvrir', () => {
    expect(mapLink(linkRow())).toEqual({
      id: 'l-1',
      token: 'jeton',
      scope: 'note',
      noteId: 'n-1',
      label: null,
      viewCount: 0,
      createdAt: '2026-09-06T10:00:00.000Z',
    });
    // `share_scope` en compte cinq ; cette application en ouvre deux.
    expect(() => mapLink(linkRow({ scope: 'ranking' }))).toThrow(/portée/);
  });
});

describe('lire une note partagée', () => {
  it('garde un auteur ABSENT plutôt que de perdre la note', () => {
    // Aucun profil n'est créé par l'application : `author` est null pour tout
    // compte réel, et la note doit se lire quand même.
    expect(mapSharedNote(sharedRow()).author).toBeNull();
    expect(mapSharedNote(sharedRow({ author_pseudonym: 'Alpha' })).author).toBe(
      'Alpha'
    );
  });

  it('refuse une cible que le domaine ne connaît pas', () => {
    expect(() => mapSharedNote(sharedRow({ target: 'inventée' }))).toThrow(
      /cible/
    );
  });
});

describe('ouvrir une note à la lecture', () => {
  it('ouvre la VISIBILITÉ avant de créer le lien', async () => {
    // Un lien créé alors que la note est encore privée existe et n'ouvre
    // rien : `get_shared_note` exige `visibility in ('link','public')`.
    const log: string[] = [];
    await repository(log, { row: linkRow() }).shareNote('n-1', null, 'private');

    expect(log).toEqual([
      'update personal_notes → shared_at,visibility',
      'insert share_links → note',
    ]);
  });

  it('un lien de collection ne touche aucune note', async () => {
    const log: string[] = [];
    await repository(log, {
      row: linkRow({ scope: 'note_collection', note_id: null }),
    }).shareCollection('Mes notes');

    expect(log).toEqual(['insert share_links → note_collection']);
  });
});

describe('révoquer', () => {
  const link = (over: Partial<ShareLink> = {}): ShareLink => ({
    id: 'l-1',
    token: 'jeton',
    scope: 'note',
    noteId: 'n-1',
    label: null,
    viewCount: 0,
    createdAt: '2026-09-06T10:00:00.000Z',
    ...over,
  });

  it('éteint l’adresse ET referme la note', async () => {
    // Révoquer sans refermer laisserait la note « link » : elle entrerait
    // dans le lien de collection, que personne n'a révoqué.
    const log: string[] = [];
    await repository(log).revoke(link(), true);

    expect(log).toEqual([
      'update share_links → revoked_at',
      'update personal_notes → visibility',
    ]);
  });

  it('une collection ne désigne aucune note : rien d’autre à refermer', async () => {
    const log: string[] = [];
    await repository(log).revoke(
      link({ scope: 'note_collection', noteId: null }),
      false
    );

    expect(log).toEqual(['update share_links → revoked_at']);
  });
});

describe('retirer une note du partage', () => {
  it('n’estampille pas `shared_at` en refermant', async () => {
    // `shared_at` dit qu'une note est sortie une fois ; la refermer ne défait
    // pas ce fait.
    const log: string[] = [];
    await repository(log).setVisibility('n-1', 'private');

    expect(log).toEqual(['update personal_notes → visibility']);
  });
});

describe('la lecture publique', () => {
  it('appelle le lecteur de sa portée, et traduit ce qu’il rend', async () => {
    const log: string[] = [];
    const repo = repository(log, { rpc: [sharedRow()] });

    const one = await repo.readNote('jeton');
    const many = await repo.readCollection('jeton');

    expect(log).toEqual(['rpc get_shared_note', 'rpc get_shared_notes']);
    expect(one[0]?.target).toBe('season_contestant');
    expect(many[0]?.id).toBe('n-1');
  });

  it('un jeton qui n’ouvre rien rend une liste vide, pas une exception', async () => {
    // Le refus du serveur lève ; une note redevenue privée, elle, rend zéro
    // ligne — et l'écran doit pouvoir le dire.
    const repo = repository([], { rpc: [] });
    expect(await repo.readNote('jeton')).toEqual([]);
  });
});
