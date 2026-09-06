import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotesRepository, mapNote, type NoteRowInput } from './notes';

// Donnée fictive de démonstration : aucun de ces textes n'est réel.
const row = (over: Partial<NoteRowInput> = {}): NoteRowInput => ({
  id: 'n-1',
  title: 'À revoir',
  body: 'Le second tour méritait un ralenti.',
  rating: 4,
  is_draft: false,
  is_pinned: false,
  visibility: 'private',
  updated_at: '2026-09-05T10:00:00Z',
  season_id: null,
  season_contestant_id: 'sc-a',
  episode_id: null,
  team_id: null,
  challenge_id: null,
  council_id: null,
  departure_id: null,
  ...over,
});

describe('mapNote', () => {
  it('déduit la cible de la seule colonne renseignée', () => {
    const note = mapNote(row());
    expect(note.target).toBe('season_contestant');
    expect(note.targetId).toBe('sc-a');
    expect(note.rating).toBe(4);
  });

  it('refuse une note SANS cible plutôt que d’en inventer une', () => {
    // La contrainte du schéma l'interdit ; si elle est contournée, la note
    // rangée au hasard serait pire qu'une erreur.
    expect(() => mapNote(row({ season_contestant_id: null }))).toThrow(
      /0 cible/
    );
  });

  it('refuse une note à DEUX cibles', () => {
    expect(() => mapNote(row({ episode_id: 'e-1' }))).toThrow(/2 cible/);
  });

  it('une visibilité inconnue retombe sur « privée », jamais sur « publique »', () => {
    // Le défaut le plus sûr : une valeur qu'on ne comprend pas ne doit pas
    // ouvrir une note au monde.
    expect(mapNote(row({ visibility: 'quelque-chose' })).visibility).toBe(
      'private'
    );
    expect(mapNote(row({ visibility: 'public' })).visibility).toBe('public');
  });

  it('valide à la frontière : une ligne mal formée est refusée, pas réparée', () => {
    expect(() => mapNote({ id: 'n-1' })).toThrow();
  });
});

/** Client de fantaisie : enregistre ce qu'on lui demande, ne parle à personne. */
function fakeClient(rows: NoteRowInput[]) {
  const calls: {
    table: string;
    op: string;
    payload?: unknown;
    filters: [string, unknown][];
  }[] = [];

  const chain = (result: { data: unknown; error: null }) => {
    const call = calls[calls.length - 1];
    const self: Record<string, unknown> = {};
    for (const method of ['select', 'order']) {
      self[method] = () => self;
    }
    self.eq = (column: string, value: unknown) => {
      call?.filters.push([column, value]);
      return self;
    };
    self.single = () => Promise.resolve(result);
    self.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return self;
  };

  const client = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
    },
    from(table: string) {
      return {
        select: () => {
          calls.push({ table, op: 'select', filters: [] });
          return chain({ data: rows, error: null });
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: 'insert', payload, filters: [] });
          return chain({ data: rows[0], error: null });
        },
        update: (payload: unknown) => {
          calls.push({ table, op: 'update', payload, filters: [] });
          return chain({ data: rows[0], error: null });
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe('createNotesRepository', () => {
  it('liste les notes en les validant une à une', async () => {
    const { client } = fakeClient([row(), row({ id: 'n-2' })]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    const notes = await repo.list();
    expect(notes.map(n => n.id)).toEqual(['n-1', 'n-2']);
  });

  it('la liste demande MES notes, pas « tout ce que le serveur veut bien rendre »', async () => {
    // Les politiques RLS s'additionnent : sans ce filtre, la lecture
    // rapporterait aussi les notes PUBLIQUES des autres comptes, dans un écran
    // intitulé « Notes ». Le serveur a raison ; c'est la requête qui doit dire
    // ce qu'elle cherche.
    const { client, calls } = fakeClient([row()]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    await repo.list();
    const select = calls.find(c => c.op === 'select');
    expect(select?.filters).toContainEqual(['user_id', 'u-1']);
  });

  it('la création attache la note à SA colonne, et à l’utilisateur courant', async () => {
    const { client, calls } = fakeClient([row()]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    await repo.create({
      target: 'episode',
      targetId: 'e-9',
      title: null,
      body: 'texte',
      rating: null,
    });
    const insert = calls.find(c => c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      episode_id: 'e-9',
      user_id: 'u-1',
    });
    // Une seule colonne de cible : les six autres restent absentes.
    expect(insert?.payload).not.toHaveProperty('season_contestant_id');
  });

  it('supprimer, c’est dater — la ligne reste, la lecture cesse', async () => {
    const { client, calls } = fakeClient([row()]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    await repo.remove('n-1');
    const update = calls.find(c => c.op === 'update');
    expect(update?.payload).toHaveProperty('deleted_at');
  });

  it('annuler, c’est retirer la date — et la note revient AVEC son contenu', async () => {
    // Rien n'avait été effacé : la restauration ne reconstruit pas une note, et
    // ne peut donc pas la rendre différente. Le serveur autorise cette écriture
    // parce que la politique de MISE À JOUR ne filtre pas sur `deleted_at`,
    // contrairement à celle de lecture — c'est ce qui rend l'annulation
    // possible sans toucher à la base (voir `useUndo`).
    const { client, calls } = fakeClient([
      row({ body: 'Le second tour méritait un ralenti.' }),
    ]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    const restored = await repo.restore('n-1');

    const update = calls.find(c => c.op === 'update');
    expect(update?.payload).toEqual({ deleted_at: null });
    expect(update?.filters).toContainEqual(['id', 'n-1']);
    expect(restored.body).toBe('Le second tour méritait un ralenti.');
  });

  it('une mise à jour ne touche QUE les champs fournis', async () => {
    const { client, calls } = fakeClient([row()]);
    const repo = createNotesRepository(() => Promise.resolve(client));
    await repo.update('n-1', { body: 'corrigé' });
    const update = calls.find(c => c.op === 'update');
    expect(update?.payload).toMatchObject({ body: 'corrigé' });
    expect(update?.payload).not.toHaveProperty('title');
    expect(update?.payload).not.toHaveProperty('rating');
  });
});
