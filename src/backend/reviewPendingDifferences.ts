/**
 * Lister et trancher les différences Wikipédia encore en `pending_review`.
 *
 * « Relire » peut laisser un run `diffed` avec des propositions ambiguës :
 * `publish_run` n'applique que celles déjà `validated`. Ce module expose la
 * file et appelle `review_difference` — Valider / Rejeter — sans republier.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND } from './config';
import type { Database, Json } from './database.types';
import { supabaseFactory } from './supabaseReferential';

type Entity = Database['public']['Enums']['referential_entity'];
type Operation = Database['public']['Enums']['difference_operation'];
type Decision = 'validated' | 'rejected';

export interface PendingDifference {
  id: string;
  entity: Entity;
  operation: Operation;
  naturalKey: string;
  changedFields: string[];
  class: Database['public']['Enums']['difference_class'];
  afterValue: Json | null;
}

export type ListPending =
  | { kind: 'absent' }
  | { kind: 'anonymous' }
  | { kind: 'none' }
  | { kind: 'ok'; items: PendingDifference[] }
  | { kind: 'failed'; message: string };

export type ReviewPending =
  | { kind: 'absent' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'ok'; decision: Decision }
  | { kind: 'failed'; message: string };

interface ReviewDeps {
  configured: boolean;
  getClient: () => Promise<SupabaseClient<Database>>;
}

const defaut: ReviewDeps = {
  configured: BACKEND === 'supabase' && supabaseFactory.isConfigured(),
  getClient: () => supabaseFactory.getClient(),
};

const ECHEC_LISTE = 'La liste des propositions à relire est indisponible.';
const ECHEC_REVUE = 'La relecture de la proposition a échoué.';

const ENTITY_LABEL: Record<Entity, string> = {
  season: 'saison',
  season_rule: 'règle de saison',
  contestant: 'candidat',
  season_contestant: 'candidat de saison',
  team: 'équipe',
  team_membership: 'appartenance',
  pair: 'binôme',
  episode: 'épisode',
  challenge: 'épreuve',
  challenge_result: 'résultat d’épreuve',
  council: 'conseil',
  council_round: 'tour de conseil',
  council_vote: 'vote',
  departure: 'départ',
  reinstatement: 'retour',
  advantage: 'avantage',
};

const OPERATION_LABEL: Record<Operation, string> = {
  insert: 'ajout',
  update: 'modification',
  delete: 'suppression',
};

/** Libellé court pour une ligne de relecture. */
export function resumeDifference(item: PendingDifference): string {
  const entite = ENTITY_LABEL[item.entity] ?? item.entity;
  const geste = OPERATION_LABEL[item.operation] ?? item.operation;
  const champs =
    item.changedFields.length > 0
      ? ` (${item.changedFields.slice(0, 3).join(', ')})`
      : '';
  return `${geste} · ${entite} · ${item.naturalKey}${champs}`;
}

export async function listPendingDifferences(
  seasonSlug: string,
  deps: ReviewDeps = defaut
): Promise<ListPending> {
  if (!deps.configured) return { kind: 'absent' };
  const client = await deps.getClient();
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) return { kind: 'anonymous' };

  const { data: season, error: seasonError } = await client
    .from('seasons')
    .select('source_document_id')
    .eq('slug', seasonSlug)
    .maybeSingle();
  if (seasonError || !season?.source_document_id) {
    return {
      kind: 'failed',
      message: 'La saison affichée n’a pas de page Wikipédia à relire.',
    };
  }

  const { data: run, error: runError } = await client
    .from('import_runs')
    .select('id')
    .eq('source_document_id', season.source_document_id)
    .in('status', ['diffed', 'extracted'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) {
    return { kind: 'failed', message: runError.message || ECHEC_LISTE };
  }
  if (!run?.id) return { kind: 'none' };

  const { data: rows, error: diffError } = await client
    .from('import_differences')
    .select(
      'id, entity, operation, natural_key, changed_fields, class, after_value'
    )
    .eq('run_id', run.id)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });
  if (diffError) {
    return { kind: 'failed', message: diffError.message || ECHEC_LISTE };
  }
  if (!rows?.length) return { kind: 'none' };

  return {
    kind: 'ok',
    items: rows.map(row => ({
      id: row.id,
      entity: row.entity,
      operation: row.operation,
      naturalKey: row.natural_key,
      changedFields: row.changed_fields ?? [],
      class: row.class,
      afterValue: row.after_value,
    })),
  };
}

export async function reviewPendingDifference(
  differenceId: string,
  decision: Decision,
  deps: ReviewDeps = defaut
): Promise<ReviewPending> {
  if (!deps.configured) return { kind: 'absent' };
  const client = await deps.getClient();
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) return { kind: 'anonymous' };

  const { error } = await client.rpc('review_difference', {
    difference_id: differenceId,
    decision,
  });
  if (error) {
    const msg = error.message ?? '';
    if (/droits insuffisants|42501|permission|JWT/i.test(msg)) {
      return { kind: 'forbidden' };
    }
    return { kind: 'failed', message: msg || ECHEC_REVUE };
  }
  return { kind: 'ok', decision };
}

/** Toast après Valider / Rejeter. */
export function annonceRevue(
  resultat: ReviewPending
): { tone: 'success' | 'info' | 'error'; text: string } | null {
  if (resultat.kind === 'ok') {
    return {
      tone: 'success',
      text:
        resultat.decision === 'validated'
          ? 'Proposition validée.'
          : 'Proposition rejetée.',
    };
  }
  if (resultat.kind === 'anonymous' || resultat.kind === 'forbidden') {
    return {
      tone: 'info',
      text: 'Relire une proposition demande un compte relecteur.',
    };
  }
  if (resultat.kind === 'failed') {
    return { tone: 'error', text: resultat.message };
  }
  return null;
}
