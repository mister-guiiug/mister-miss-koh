/**
 * Relecture manuelle de la page Wikipédia de la saison affichée.
 *
 * Le bouton « Relire Wikipédia » demande à la fonction d'import de relire la
 * page (`force`). La fonction publie elle-même un lot entièrement certain ;
 * le bouton ne rappelle la publication que si cette étape a échoué. Le secret
 * de planification ne quitte pas le serveur : seul le jeton du compte
 * relecteur ouvre cette porte, et la fonction le revérifie.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKEND } from './config';
import { supabaseFactory } from './supabaseReferential';

export type WikipediaRefresh =
  | { kind: 'absent' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'unchanged' }
  | { kind: 'published'; detail: string }
  | { kind: 'held'; detail: string }
  | { kind: 'failed'; message: string };

interface ImportOutcome {
  status?: string;
  runId?: string;
  message?: string;
  counts?: Record<string, number>;
  /** La fonction d'import a déjà publié ce lot. */
  published?: boolean;
}

/**
 * Ce qu'un lot relu autorise. On ne publie que lorsque tout ce qui a changé
 * est sans ambiguïté et a été validé pour ce clic. Le reste attend.
 */
export function suiteDuLot(
  outcome: ImportOutcome
): 'publish' | 'published' | 'unchanged' | 'held' | 'failed' {
  if (outcome.status === 'unchanged') return 'unchanged';
  if (outcome.status !== 'diffed' || !outcome.runId) return 'failed';
  if (outcome.published) return 'published';
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

/** Ce que le toast peut citer. Les classes à zéro ne s'affichent pas. */
export function decrireLot(counts: Record<string, number> | undefined): string {
  const morceau = (n: number, un: string, plusieurs: string) =>
    n > 0 ? `${n} ${n > 1 ? plusieurs : un}` : null;
  const c = counts ?? {};
  return [
    morceau(c.autoValidated ?? 0, 'changement certain', 'changements certains'),
    morceau(c.ambiguous ?? 0, 'ambigu', 'ambigus'),
    morceau(c.suspicious ?? 0, 'suspect', 'suspects'),
    morceau(c.retroactive ?? 0, 'rétroactif', 'rétroactifs'),
    morceau(c.conflicting ?? 0, 'conflit', 'conflits'),
  ]
    .filter(part => part !== null)
    .join(', ');
}

const ECHEC_RELECTURE = 'La relecture de Wikipédia n’a pas abouti.';

/**
 * Le toast de la relecture. Un rechargement d'écran raté s'ajoute à la phrase,
 * il ne la remplace pas : une publication réussie doit rester lisible.
 */
export function annonceRelecture(
  lecture: WikipediaRefresh,
  rechargement: string | null
): { tone: 'success' | 'info' | 'error'; text: string } | null {
  const suite =
    rechargement && lecture.kind !== 'absent'
      ? ` Le rechargement de l’écran a échoué : ${rechargement}.`
      : '';
  if (lecture.kind === 'published') {
    const detail = lecture.detail ? ` ${lecture.detail}.` : '';
    return {
      tone: 'success',
      text: `Wikipédia relu et publié.${detail}${suite}`,
    };
  }
  if (lecture.kind === 'held') {
    const corps = lecture.detail
      ? `${lecture.detail}. Le lot attend une publication.`
      : 'Une partie du changement attend une publication.';
    return {
      tone: 'info',
      text: `Wikipédia relu. ${corps}${suite}`,
    };
  }
  if (lecture.kind === 'unchanged') {
    return {
      tone: 'success',
      text: `Wikipédia n’a pas bougé depuis la dernière lecture.${suite}`,
    };
  }
  if (lecture.kind === 'anonymous' || lecture.kind === 'forbidden') {
    return {
      tone: 'info',
      text: `Relire Wikipédia demande un compte relecteur.${suite}`,
    };
  }
  if (lecture.kind === 'failed') {
    return { tone: 'error', text: `${lecture.message}${suite}` };
  }
  return null;
}

/** Le corps d'un échec HTTP de la fonction, quand elle en a écrit un. */
export async function messageEchecImport(error: {
  context?: unknown;
}): Promise<{ status: number | null; message: string }> {
  const context = error.context;
  if (!(context instanceof Response)) {
    return { status: null, message: ECHEC_RELECTURE };
  }
  let body: { message?: unknown; error?: unknown } = {};
  try {
    body = (await context.json()) as typeof body;
  } catch {
    return { status: context.status, message: ECHEC_RELECTURE };
  }
  const message =
    typeof body.message === 'string'
      ? body.message
      : typeof body.error === 'string'
        ? body.error
        : ECHEC_RELECTURE;
  return { status: context.status, message };
}

interface RefreshDeps {
  configured: boolean;
  getClient: () => Promise<SupabaseClient>;
}

const defaut: RefreshDeps = {
  configured: BACKEND === 'supabase' && supabaseFactory.isConfigured(),
  getClient: () => supabaseFactory.getClient(),
};

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
    const echec = await messageEchecImport(error);
    if (echec.status === 401) return { kind: 'anonymous' };
    if (echec.status === 403) return { kind: 'forbidden' };
    return { kind: 'failed', message: echec.message };
  }

  const outcome = (data ?? {}) as ImportOutcome;
  const suite = suiteDuLot(outcome);
  const detail = decrireLot(outcome.counts);
  if (suite === 'failed' || (suite === 'publish' && !outcome.runId)) {
    return {
      kind: 'failed',
      message: outcome.message ?? ECHEC_RELECTURE,
    };
  }
  if (suite === 'held') return { kind: 'held', detail };
  if (suite === 'published') return { kind: 'published', detail };
  if (suite !== 'publish') return { kind: 'unchanged' };

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
  return { kind: 'published', detail };
}
