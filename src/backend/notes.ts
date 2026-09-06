/**
 * Les notes personnelles — la seule chose que l'utilisateur ÉCRIT.
 *
 * DEUX MOITIÉS, COMME L'ADAPTATEUR DU RÉFÉRENTIEL : `mapNote` est une fonction
 * pure, testée avec des lignes de fantaisie ; le reste est du câblage qui ne
 * décide rien. Ce qui protège une note n'est pas ce fichier mais les
 * politiques RLS, éprouvées par pgTAP — un utilisateur ne voit et n'écrit que
 * les siennes, même en nommant l'identifiant d'une autre.
 *
 * UNE NOTE VISE EXACTEMENT UNE CHOSE. Le schéma le garantit par une contrainte
 * de cardinalité sur sept clés étrangères nullables ; ce module traduit cette
 * forme en une cible lisible, et refuse d'en inventer une seconde.
 *
 * LA SUPPRESSION EST LOGIQUE. `deleted_at` fait cesser la lecture
 * immédiatement, y compris pour une note partagée : attendre une purge
 * laisserait un lien vivant après que son auteur l'a retirée.
 *
 * ET ELLE SE DÉFAIT — MAIS PAS PAR UN `update`. Ce module a longtemps posé et
 * retiré `deleted_at` directement, en croyant que la politique de mise à jour
 * suffisait puisqu'elle ne filtre pas sur `deleted_at`. C'était faux, et
 * personne n'a JAMAIS pu supprimer une note : la ligne issue d'un `update`
 * doit rester visible sous une politique de SELECT, et les deux politiques de
 * lecture portent `deleted_at is null`. Le serveur répondait « new row
 * violates row-level security policy » ; l'autre moitié — restaurer — ne
 * trouvait tout simplement aucune ligne, sans rien dire. Les deux passent
 * désormais par `delete_note` et `restore_note` (migration 0023), deux
 * fonctions `security definer` qui vérifient elles-mêmes à qui elles ouvrent.
 *
 * C'est aussi pourquoi il n'y a toujours pas de corbeille : lister ses notes
 * supprimées demanderait une politique de lecture de plus — et sur ce dépôt,
 * une politique permissive de plus se combine par OU avec les autres, ce qui
 * est exactement le piège documenté dans `docs/politiques-rls.md`.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';

/** Ce qu'une note peut viser, dans l'ordre du schéma. */
export const NOTE_TARGETS = [
  'season',
  'season_contestant',
  'episode',
  'team',
  'challenge',
  'council',
  'departure',
] as const;

export type NoteTarget = (typeof NOTE_TARGETS)[number];

const COLUMN_OF: Record<NoteTarget, string> = {
  season: 'season_id',
  season_contestant: 'season_contestant_id',
  episode: 'episode_id',
  team: 'team_id',
  challenge: 'challenge_id',
  council: 'council_id',
  departure: 'departure_id',
};

const NoteRow = z.object({
  id: z.string(),
  title: z.string().nullable(),
  body: z.string(),
  rating: z.number().nullable(),
  is_draft: z.boolean(),
  is_pinned: z.boolean(),
  visibility: z.string(),
  updated_at: z.string(),
  season_id: z.string().nullable(),
  season_contestant_id: z.string().nullable(),
  episode_id: z.string().nullable(),
  team_id: z.string().nullable(),
  challenge_id: z.string().nullable(),
  council_id: z.string().nullable(),
  departure_id: z.string().nullable(),
});

export type NoteRowInput = z.input<typeof NoteRow>;

export interface Note {
  readonly id: string;
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
  readonly isDraft: boolean;
  readonly isPinned: boolean;
  readonly visibility: 'private' | 'link' | 'public';
  readonly updatedAt: string;
  readonly target: NoteTarget;
  readonly targetId: string;
}

/**
 * Les colonnes d'une note. Exportées parce que le profil public en lit aussi
 * (les notes `public` de quelqu'un) : deux listes divergeraient.
 *
 * `user_id` n'en fait PAS partie — il n'est utile qu'en clause `where`.
 */
export const NOTE_COLUMNS =
  'id, title, body, rating, is_draft, is_pinned, visibility, updated_at, ' +
  'season_id, season_contestant_id, episode_id, team_id, challenge_id, ' +
  'council_id, departure_id';

/**
 * Une ligne → une note, ou une erreur claire.
 *
 * La cible se DÉDUIT de la seule colonne renseignée. Si aucune ne l'est — ce
 * que la contrainte du schéma interdit —, on refuse plutôt que de ranger la
 * note sous une cible arbitraire : une note attachée au mauvais objet est pire
 * qu'une note absente.
 */
export function mapNote(input: unknown): Note {
  const row = NoteRow.parse(input);
  const found = NOTE_TARGETS.map(target => ({
    target,
    id: row[COLUMN_OF[target] as keyof typeof row] as string | null,
  })).filter(t => t.id !== null);

  const only = found[0];
  if (found.length !== 1 || !only?.id) {
    throw new Error(
      `note ${row.id} : ${found.length} cible(s) au lieu d'une — la contrainte du schéma a été contournée`
    );
  }

  const visibility =
    row.visibility === 'link' || row.visibility === 'public'
      ? row.visibility
      : 'private';

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    rating: row.rating,
    isDraft: row.is_draft,
    isPinned: row.is_pinned,
    visibility,
    updatedAt: row.updated_at,
    target: only.target,
    targetId: only.id,
  };
}

export interface NoteDraft {
  readonly target: NoteTarget;
  readonly targetId: string;
  readonly title: string | null;
  readonly body: string;
  readonly rating: number | null;
}

export interface NotesRepository {
  list(): Promise<Note[]>;
  create(draft: NoteDraft): Promise<Note>;
  update(id: string, patch: Partial<NoteDraft>): Promise<Note>;
  /** Suppression LOGIQUE : la lecture cesse, la ligne reste. */
  remove(id: string): Promise<void>;
  /** Annule la suppression : la ligne n'avait pas bougé, elle redevient lisible. */
  restore(id: string): Promise<Note>;
}

/** Injectable : les tests passent un client de fantaisie. */
export function createNotesRepository(
  getClient: () => Promise<SupabaseClient>
): NotesRepository {
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

  return {
    /**
     * MES notes, et le filtre sur `user_id` n'est pas décoratif.
     *
     * Les politiques RLS sont PERMISSIVES et s'additionnent : à côté de « je
     * vois les miennes » vit « tout le monde voit les notes publiques ». Une
     * lecture sans filtre rendrait donc aussi les notes publiques des autres,
     * mélangées aux miennes dans un écran qui promet l'inverse. Le serveur a
     * raison — une note publique EST publique ; c'est à cette requête de dire
     * ce qu'elle cherche.
     */
    async list() {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'lecture des notes');
      const { data, error } = await supabase
        .from('personal_notes')
        .select(NOTE_COLUMNS)
        .eq('user_id', userId)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) fail('lecture des notes', error.message);
      return (data ?? []).map(mapNote);
    },

    async create(draft) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'création');

      const { data, error } = await supabase
        .from('personal_notes')
        .insert({
          user_id: userId,
          [COLUMN_OF[draft.target]]: draft.targetId,
          title: draft.title,
          body: draft.body,
          rating: draft.rating,
        })
        .select(NOTE_COLUMNS)
        .single();
      if (error) fail('création', error.message);
      return mapNote(data);
    },

    async update(id, patch) {
      const supabase = await getClient();
      const { data, error } = await supabase
        .from('personal_notes')
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(NOTE_COLUMNS)
        .single();
      if (error) fail('mise à jour', error.message);
      return mapNote(data);
    },

    async remove(id) {
      const supabase = await getClient();
      const { error } = await supabase.rpc('delete_note', { note_id: id });
      if (error) fail('suppression', error.message);
    },

    /**
     * La note revient AVEC son contenu, parce qu'il n'est jamais parti : rien
     * n'a été effacé, seule une date avait été posée. C'est le retour de la
     * fonction qui le prouve — la ligne rendue est celle du serveur, pas une
     * copie gardée à l'écran, et l'appelant ne peut donc pas afficher une
     * restauration qui n'aurait pas eu lieu.
     *
     * `restore_note` rend une TABLE : une ligne quand elle a restauré, et elle
     * lève plutôt que de rendre zéro. On prend donc la première, et son
     * absence est une erreur — pas une note vide.
     */
    async restore(id) {
      const supabase = await getClient();
      const { data, error } = await supabase.rpc('restore_note', {
        note_id: id,
      });
      if (error) fail('restauration', error.message);
      const [row] = (data as unknown[] | null | undefined) ?? [];
      if (row === undefined) fail('restauration', 'note introuvable');
      return mapNote(row);
    },
  };
}

export const notesRepository = createNotesRepository(() =>
  supabaseFactory.getClient()
);
