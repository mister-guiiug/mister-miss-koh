/**
 * Les liens de partage d'une note — créés, lus, révoqués.
 *
 * LE JETON EST LE SEUL CHEMIN. `share_links` n'est lisible que par son
 * propriétaire ; personne d'autre ne peut l'énumérer, et aucune politique
 * n'ouvre les notes « link ». Un lecteur passe donc par une fonction
 * `security definer` — `get_shared_note` ou `get_shared_notes` — qui valide le
 * jeton, refuse ce qui est révoqué ou expiré, et ne rend que des colonnes
 * choisies. Ce module ne fait qu'appeler ; ce qui protège est dans 0004 et
 * 0021, éprouvé par pgTAP.
 *
 * DEUX PORTÉES, DEUX RÈGLES.
 * - Une note : le lien désigne CETTE note.
 * - Une collection : le lien ne désigne aucune note, il nomme une règle — les
 *   notes du compte dont la visibilité est « link ». Rendre une note privée la
 *   retire du lien à la requête suivante, sans révoquer quoi que ce soit.
 *
 * PARTAGER DEMANDE DEUX ÉCRITURES, ET LES DEUX COMPTENT. Un lien seul n'ouvre
 * rien si la note est restée privée : la fonction exige `visibility in
 * ('link','public')`. C'est voulu — la visibilité est la vanne, le lien n'est
 * qu'une adresse — et c'est pour cela que `shareNote` fait les deux, et que
 * `revoke` referme la vanne EN PLUS d'éteindre l'adresse.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';
import { NOTE_TARGETS, type NoteTarget } from './notes';
import type { Visibility } from '../domain/visibility';

export type ShareScope = 'note' | 'note_collection';

const LinkRow = z.object({
  id: z.string(),
  token: z.string(),
  scope: z.string(),
  note_id: z.string().nullable(),
  label: z.string().nullable(),
  view_count: z.number(),
  created_at: z.string(),
});

export interface ShareLink {
  readonly id: string;
  readonly token: string;
  readonly scope: ShareScope;
  /** `null` pour une collection : elle ne désigne aucune note. */
  readonly noteId: string | null;
  readonly label: string | null;
  readonly viewCount: number;
  readonly createdAt: string;
}

const LINK_SELECT = 'id, token, scope, note_id, label, view_count, created_at';

/** Une ligne → un lien, ou une erreur claire. */
export function mapLink(input: unknown): ShareLink {
  const row = LinkRow.parse(input);
  if (row.scope !== 'note' && row.scope !== 'note_collection') {
    throw new Error(`lien ${row.id} : portée « ${row.scope} » inattendue`);
  }
  return {
    id: row.id,
    token: row.token,
    scope: row.scope,
    noteId: row.note_id,
    label: row.label,
    viewCount: row.view_count,
    createdAt: row.created_at,
  };
}

const SharedRow = z.object({
  note_id: z.string(),
  title: z.string().nullable(),
  body: z.string(),
  rating: z.number().nullable(),
  target: z.string(),
  target_id: z.string(),
  updated_at: z.string(),
  author_pseudonym: z.string().nullable(),
  author_handle: z.string().nullable(),
});

/**
 * Une note telle qu'un lecteur la reçoit — sans auteur obligatoire.
 *
 * `author` est `null` quand la personne n'a jamais choisi de pseudonyme, ce
 * qui est le cas de tout compte aujourd'hui : l'application n'écrit rien dans
 * `profiles`. Avant 0021 la jointure était interne et faisait disparaître la
 * note entière — un lien valide ouvrait une page vide, sans erreur.
 */
export interface SharedNote {
  readonly id: string;
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
  readonly target: NoteTarget;
  readonly targetId: string;
  readonly updatedAt: string;
  readonly author: string | null;
  /** L'adresse publique de l'auteur — unique, quand il s'en est choisi une. */
  readonly authorHandle: string | null;
}

export function mapSharedNote(input: unknown): SharedNote {
  const row = SharedRow.parse(input);
  const target = NOTE_TARGETS.find(t => t === row.target);
  if (!target) {
    throw new Error(
      `note partagée ${row.note_id} : cible « ${row.target} » inconnue`
    );
  }
  return {
    id: row.note_id,
    title: row.title,
    body: row.body,
    rating: row.rating,
    target,
    targetId: row.target_id,
    updatedAt: row.updated_at,
    author: row.author_pseudonym,
    authorHandle: row.author_handle,
  };
}

export interface SharingRepository {
  /** Les liens vivants du compte, les plus récents d'abord. */
  list(): Promise<ShareLink[]>;
  /**
   * Donne une adresse à une note. `current` dit où elle en est : privée, elle
   * s'ouvre « par lien » du même geste ; publique, elle le reste.
   */
  shareNote(
    noteId: string,
    label: string | null,
    current: Visibility
  ): Promise<ShareLink>;
  /** Un lien pour TOUTES les notes déjà ouvertes à la lecture par lien. */
  shareCollection(label: string | null): Promise<ShareLink>;
  /**
   * Éteint l'adresse. `closeNote` referme EN PLUS la note — l'appelant seul
   * sait si elle était ouverte par ce lien ou publique par ailleurs.
   */
  revoke(link: ShareLink, closeNote: boolean): Promise<void>;
  /** Déplace la visibilité d'une note, sans toucher à ses liens. */
  setVisibility(noteId: string, visibility: Visibility): Promise<void>;
  /** Lecture publique — aucune session requise. */
  readNote(token: string): Promise<SharedNote[]>;
  readCollection(token: string): Promise<SharedNote[]>;
}

/** Injectable : les tests passent un client de fantaisie. */
export function createSharingRepository(
  getClient: () => Promise<SupabaseClient>
): SharingRepository {
  const fail = (what: string, message: string): never => {
    throw new Error(`${what} : ${message}`);
  };

  const userOf = async (
    supabase: SupabaseClient,
    what: string
  ): Promise<string> => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? fail(what, 'aucune session');
  };

  const writeVisibility = async (
    supabase: SupabaseClient,
    noteId: string,
    visibility: Visibility,
    what: string
  ) => {
    const { error } = await supabase
      .from('personal_notes')
      .update({
        visibility,
        // Trace la PREMIÈRE ouverture, jamais effacée : elle dit que cette
        // note est sortie une fois, ce qu'un retour au privé ne défait pas.
        ...(visibility === 'private'
          ? {}
          : { shared_at: new Date().toISOString() }),
      })
      .eq('id', noteId);
    if (error) fail(what, error.message);
  };

  const insertLink = async (
    supabase: SupabaseClient,
    row: Record<string, unknown>,
    what: string
  ): Promise<ShareLink> => {
    const { data, error } = await supabase
      .from('share_links')
      .insert(row)
      .select(LINK_SELECT)
      .single();
    // Le quota du serveur (vingt liens par heure) remonte ici tel quel : mieux
    // vaut la phrase du serveur qu'une reformulation qui la trahirait.
    if (error) fail(what, error.message);
    return mapLink(data);
  };

  const readShared = async (
    fn: 'get_shared_note' | 'get_shared_notes',
    token: string
  ): Promise<SharedNote[]> => {
    const supabase = await getClient();
    const { data, error } = await supabase.rpc(fn, { share_token: token });
    if (error) fail('lecture du partage', error.message);
    return ((data as unknown[] | null | undefined) ?? []).map(mapSharedNote);
  };

  return {
    async list() {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'lecture des liens');
      const { data, error } = await supabase
        .from('share_links')
        .select(LINK_SELECT)
        .eq('owner_id', userId)
        .is('revoked_at', null)
        .in('scope', ['note', 'note_collection'])
        .order('created_at', { ascending: false });
      if (error) fail('lecture des liens', error.message);
      return (data ?? []).map(mapLink);
    },

    async shareNote(noteId, label, current) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'partage');
      // La visibilité D'ABORD : un lien créé alors que la note est encore
      // privée existe et n'ouvre rien — l'écran promettrait à tort. Une note
      // déjà PUBLIQUE, en revanche, ne redescend pas à « par lien » parce
      // qu'on lui fabrique une adresse : ce serait la refermer sans le dire.
      if (current === 'private') {
        await writeVisibility(supabase, noteId, 'link', 'partage');
      }
      return insertLink(
        supabase,
        { owner_id: userId, scope: 'note', note_id: noteId, label },
        'partage'
      );
    },

    async shareCollection(label) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'partage');
      return insertLink(
        supabase,
        { owner_id: userId, scope: 'note_collection', label },
        'partage'
      );
    },

    async revoke(link, closeNote) {
      const supabase = await getClient();
      const { error } = await supabase
        .from('share_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', link.id);
      if (error) fail('révocation', error.message);
      // `closeNote` vient de l'appelant, qui SAIT où en est la note : une
      // collection ne désigne rien à refermer, et une note devenue PUBLIQUE
      // n'a pas à redevenir privée parce qu'on éteint une vieille adresse.
      if (closeNote && link.noteId) {
        await writeVisibility(supabase, link.noteId, 'private', 'révocation');
      }
    },

    async setVisibility(noteId, visibility) {
      const supabase = await getClient();
      await writeVisibility(
        supabase,
        noteId,
        visibility,
        visibility === 'private' ? 'retrait du partage' : 'partage'
      );
    },

    readNote: token => readShared('get_shared_note', token),
    readCollection: token => readShared('get_shared_notes', token),
  };
}

export const sharingRepository = createSharingRepository(() =>
  supabaseFactory.getClient()
);
