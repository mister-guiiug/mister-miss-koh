/**
 * Publier le lot Wikipédia encore en attente, sans relire la page.
 *
 * « Relire » peut laisser un run `diffed` avec `hold_reason = en_attente` :
 * la partie certaine est validée, le reste attend. Ce module reprend CE run
 * et appelle `publish_run` — ce que le toast « Le lot attend une publication »
 * annonçait sans offrir le geste.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND } from './config';
import { supabaseFactory } from './supabaseReferential';

export type PublishHeld =
  | { kind: 'absent' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'none' }
  | { kind: 'published' }
  | { kind: 'failed'; message: string };

interface PublishDeps {
  configured: boolean;
  getClient: () => Promise<SupabaseClient>;
}

const defaut: PublishDeps = {
  configured: BACKEND === 'supabase' && supabaseFactory.isConfigured(),
  getClient: () => supabaseFactory.getClient(),
};

const ECHEC = 'La publication du lot en attente a échoué.';

export async function publishHeldLot(
  seasonSlug: string,
  deps: PublishDeps = defaut
): Promise<PublishHeld> {
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
      message: 'La saison affichée n’a pas de page Wikipédia à publier.',
    };
  }

  const { data: run, error: runError } = await client
    .from('import_runs')
    .select('id')
    .eq('source_document_id', season.source_document_id)
    .eq('status', 'diffed')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) {
    return { kind: 'failed', message: runError.message || ECHEC };
  }
  if (!run?.id) return { kind: 'none' };

  const { error: publication } = await client.rpc('publish_run', {
    p_run_id: run.id,
    p_notes: 'publication manuelle du lot en attente',
  });
  if (publication) {
    const msg = publication.message ?? '';
    if (/réservée aux relecteurs|42501|permission|JWT/i.test(msg)) {
      return { kind: 'forbidden' };
    }
    return {
      kind: 'failed',
      message: msg || 'La publication a été refusée.',
    };
  }
  return { kind: 'published' };
}

/** Toast après publication manuelle. */
export function annoncePublication(
  resultat: PublishHeld,
  rechargement: string | null
): { tone: 'success' | 'info' | 'error'; text: string } | null {
  const suite =
    rechargement && resultat.kind !== 'absent'
      ? ` Le rechargement de l’écran a échoué : ${rechargement}.`
      : '';
  if (resultat.kind === 'published') {
    return {
      tone: 'success',
      text: `Lot en attente publié.${suite}`,
    };
  }
  if (resultat.kind === 'none') {
    return {
      tone: 'info',
      text: `Aucun lot en attente à publier.${suite}`,
    };
  }
  if (resultat.kind === 'anonymous' || resultat.kind === 'forbidden') {
    return {
      tone: 'info',
      text: `Publier un lot demande un compte relecteur.${suite}`,
    };
  }
  if (resultat.kind === 'failed') {
    return { tone: 'error', text: `${resultat.message}${suite}` };
  }
  return null;
}
