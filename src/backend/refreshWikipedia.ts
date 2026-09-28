/**
 * Relecture manuelle de la page Wikipédia de la saison affichée.
 *
 * Le bouton « Relire Wikipédia » demande à la fonction d'import de relire la
 * page (`force`), puis publie le lot si toutes les différences sont sans
 * ambiguïté. Le secret de planification ne quitte pas le serveur : seul le
 * jeton du compte relecteur ouvre cette porte, et la fonction le revérifie.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND } from './config';
import { supabaseFactory } from './supabaseReferential';

export type WikipediaRefresh =
  | { kind: 'absent' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'unchanged' }
  | { kind: 'published' }
  | { kind: 'held' }
  | { kind: 'failed'; message: string };

interface ImportOutcome {
  status?: string;
  runId?: string;
  message?: string;
  counts?: Record<string, number>;
}

/**
 * Ce qu'un lot relu autorise. On ne publie que lorsque tout ce qui a changé
 * est sans ambiguïté et a été validé pour ce clic. Le reste attend.
 */
export function suiteDuLot(
  outcome: ImportOutcome
): 'publish' | 'unchanged' | 'held' | 'failed' {
  if (outcome.status === 'unchanged') return 'unchanged';
  if (outcome.status !== 'diffed' || !outcome.runId) return 'failed';
  const counts = outcome.counts ?? {};
  const auto = counts.autoValidated ?? 0;
  const reste =
    (counts.ambiguous ?? 0) +
    (counts.retroactive ?? 0) +
    (counts.conflicting ?? 0) +
    (counts.suspicious ?? 0);
  if (auto > 0 && reste === 0) return 'publish';
  if (auto === 0 && reste === 0) return 'unchanged';
  return 'held';
}

interface RefreshDeps {
  configured: boolean;
  getClient: () => Promise<SupabaseClient>;
}

const defaut: RefreshDeps = {
  configured: BACKEND === 'supabase' && supabaseFactory.isConfigured(),
  getClient: () => supabaseFactory.getClient(),
};

async function httpStatus(error: {
  context?: unknown;
}): Promise<number | null> {
  const context = error.context;
  if (context instanceof Response) return context.status;
  return null;
}

export async function refreshWikipedia(
  seasonSlug: string,
  deps: RefreshDeps = defaut
): Promise<WikipediaRefresh> {
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

  const { data, error } = await client.functions.invoke('import-wikipedia', {
    body: { documentId: season.source_document_id, force: true },
  });
  if (error) {
    const status = await httpStatus(error);
    if (status === 401) return { kind: 'anonymous' };
    if (status === 403) return { kind: 'forbidden' };
    return {
      kind: 'failed',
      message: 'La relecture de Wikipédia n’a pas abouti.',
    };
  }

  const outcome = (data ?? {}) as ImportOutcome;
  const suite = suiteDuLot(outcome);
  if (suite === 'failed' || (suite === 'publish' && !outcome.runId)) {
    return {
      kind: 'failed',
      message: outcome.message ?? 'La relecture de Wikipédia n’a pas abouti.',
    };
  }
  if (suite !== 'publish') return { kind: suite };

  const { error: publication } = await client.rpc('publish_run', {
    p_run_id: outcome.runId,
    p_notes: 'relecture manuelle',
  });
  if (publication) {
    return {
      kind: 'failed',
      message: 'La relecture est faite, la publication a été refusée.',
    };
  }
  return { kind: 'published' };
}
