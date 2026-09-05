/**
 * L'adaptateur Supabase du référentiel.
 *
 * DEUX MOITIÉS, ET UNE SEULE EST TESTÉE : `mapReferential` est une fonction
 * PURE qui transforme des lignes telles que PostgREST les rend en un
 * `Referential` validé. Elle se teste avec des lignes de fantaisie. Le
 * dépôt (`createSupabaseRepository`) ne fait que lire et lui passer les
 * lignes ; c'est du câblage, il se relit.
 *
 * LES LIGNES SONT VALIDÉES À LA FRONTIÈRE par zod, comme la démonstration et
 * comme le cache : une colonne renommée côté serveur devient une erreur
 * lisible ici, pas un `undefined` qui traverse jusqu'à un écran.
 *
 * CE QUE LA RLS GARANTIT, ET QUE CE CODE NE REFAIT PAS : la clé `anon` ne lit
 * que les lignes `published`. Aucune requête ici ne filtre sur
 * `validation_status` — ce serait redire côté client ce que le serveur
 * impose, et laisser croire que le filtre client est une protection.
 *
 * TROIS ORIGINES POSSIBLES, ET L'ÉCRAN LES DISTINGUE : le serveur, le cache
 * (hors ligne, ou serveur injoignable), la démonstration (serveur configuré
 * mais aucune saison publiée). Confondre les trois ferait passer une donnée
 * fictive pour du référentiel.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClientFactory } from '@mister-guiiug/dev-pwa-config/supabase-client';
import {
  type Referential,
  ReferentialSchema,
  type Round,
  type Departure,
} from '../domain/referential';
import { DEMO_REFERENTIAL } from './demo';
import type {
  LoadResult,
  ReferentialRepository,
} from './referentialRepository';

// ── Formes des lignes, telles que PostgREST les rend ────────────────────────

const RuleRow = z.object({
  kind: z.string(),
  label: z.string(),
  from_episode_number: z.number().nullable(),
  to_episode_number: z.number().nullable(),
});

const SeasonRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  edition_label: z.string().nullable(),
  status: z.enum(['announced', 'airing', 'completed']),
  source_document_id: z.string().nullable(),
  season_rules: z.array(RuleRow).default([]),
});

const ContestantRow = z.object({
  id: z.string(),
  contestant_id: z.string(),
  display_name: z.string(),
  age_at_season: z.number().nullable(),
  final_jury: z.boolean().nullable(),
  contestants: z.object({ gender: z.string().nullable() }).nullable(),
  contestant_previous_seasons: z
    .array(z.object({ label: z.string(), ordinal: z.number() }))
    .default([]),
  team_memberships: z
    .array(
      z.object({
        team_id: z.string(),
        from_episode_number: z.number().nullable(),
      })
    )
    .default([]),
});

const TeamRow = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string().nullable(),
});
const PairRow = z.object({
  id: z.string(),
  member_a_id: z.string(),
  member_b_id: z.string(),
});

const ResultRow = z.object({
  season_contestant_id: z.string().nullable(),
  pair_id: z.string().nullable(),
  is_winner: z.boolean(),
});

const VoteRow = z.object({
  voter_id: z.string(),
  target_id: z.string().nullable(),
  is_annulled: z.boolean(),
});

const RoundRow = z.object({
  id: z.string(),
  round_number: z.number(),
  outcome: z.string(),
  reported_votes_for: z.number().nullable(),
  reported_votes_total: z.number().nullable(),
  votes_complete: z.boolean(),
  council_votes: z.array(VoteRow).default([]),
});

const EpisodeRow = z.object({
  id: z.string(),
  number: z.number(),
  air_date: z.string().nullable(),
  challenges: z
    .array(
      z.object({
        kind: z.string(),
        challenge_results: z.array(ResultRow).default([]),
      })
    )
    .default([]),
  councils: z
    .array(
      z.object({
        id: z.string(),
        council_rounds: z.array(RoundRow).default([]),
      })
    )
    .default([]),
});

const DepartureRow = z.object({
  id: z.string(),
  season_contestant_id: z.string(),
  episode_id: z.string().nullable(),
  round_id: z.string().nullable(),
  kind: z.string(),
  day: z.number().nullable(),
  caused_by_departure_id: z.string().nullable(),
});

const ProvenanceRow = z.object({
  url: z.string(),
  last_seen_revision: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  reference_sources: z
    .object({ label: z.string(), licence: z.string() })
    .nullable(),
});

export const RowsSchema = z.object({
  season: SeasonRow,
  contestants: z.array(ContestantRow),
  teams: z.array(TeamRow),
  pairs: z.array(PairRow),
  episodes: z.array(EpisodeRow),
  departures: z.array(DepartureRow),
  version: z.number().int().nonnegative(),
  provenance: ProvenanceRow.nullable(),
});

export type Rows = z.infer<typeof RowsSchema>;

// ── Mappage pur ─────────────────────────────────────────────────────────────

const ROUND_KIND: Record<string, Round['kind']> = {
  elimination: 'vote',
  no_elimination: 'vote',
  tie: 'annulled',
  annulled: 'annulled',
  unknown: 'unknown',
};

const RULE_KINDS = new Set([
  'linked_pair_departure',
  'pair_composition',
  'council_without_host',
  'comfort_island',
  'other',
]);

const DEPARTURE_KINDS = new Set([
  'vote',
  'linked_pair',
  'quit',
  'medical',
  'banned',
  'jury_exit',
  'final_ranking',
  'other',
]);

/** Les gagnants d'un résultat : un candidat, ou les deux membres d'un binôme. */
function winnersOf(
  results: readonly z.infer<typeof ResultRow>[],
  pairs: ReadonlyMap<string, readonly [string, string]>
): string[] {
  const ids = new Set<string>();
  for (const r of results) {
    if (!r.is_winner) continue;
    if (r.season_contestant_id) ids.add(r.season_contestant_id);
    if (r.pair_id) for (const id of pairs.get(r.pair_id) ?? []) ids.add(id);
  }
  return [...ids];
}

export function mapReferential(input: unknown, today: string): Referential {
  const rows = RowsSchema.parse(input);

  const pairMembers = new Map<string, readonly [string, string]>(
    rows.pairs.map(p => [p.id, [p.member_a_id, p.member_b_id] as const])
  );
  const pairOf = new Map<string, string>();
  for (const p of rows.pairs) {
    pairOf.set(p.member_a_id, p.id);
    pairOf.set(p.member_b_id, p.id);
  }

  const episodeNumberById = new Map(rows.episodes.map(e => [e.id, e.number]));
  const departureContestantById = new Map(
    rows.departures.map(d => [d.id, d.season_contestant_id])
  );
  const eliminatedByRound = new Map<string, string>();
  for (const d of rows.departures) {
    if (d.round_id && d.kind === 'vote')
      eliminatedByRound.set(d.round_id, d.season_contestant_id);
  }

  const rounds: Round[] = [];
  for (const e of rows.episodes) {
    let maxRound = 0;
    for (const c of e.councils) {
      for (const r of c.council_rounds) {
        maxRound = Math.max(maxRound, r.round_number);
        rounds.push({
          id: r.id,
          episodeNumber: e.number,
          roundNumber: r.round_number,
          kind: ROUND_KIND[r.outcome] ?? 'unknown',
          eliminatedId: eliminatedByRound.get(r.id) ?? null,
          reportedVotesFor: r.reported_votes_for,
          reportedVotesTotal: r.reported_votes_total,
          votesComplete: r.votes_complete,
        });
      }
    }
    // Un départ de binôme n'est pas un scrutin en base — il n'a ni voix ni
    // décompte. L'application, elle, le montre à sa place dans la soirée :
    // un tour synthétique, à ZÉRO voix, certain.
    const linked = rows.departures.filter(
      d => d.kind === 'linked_pair' && d.episode_id === e.id
    );
    for (const d of linked) {
      maxRound += 1;
      rounds.push({
        id: `linked:${d.id}`,
        episodeNumber: e.number,
        roundNumber: maxRound,
        kind: 'linked',
        eliminatedId: d.season_contestant_id,
        reportedVotesFor: 0,
        reportedVotesTotal: null,
        votesComplete: true,
      });
    }
  }

  const votes = rows.episodes.flatMap(e =>
    e.councils.flatMap(c =>
      c.council_rounds.flatMap(r =>
        r.council_votes.map(v => ({
          roundId: r.id,
          voterId: v.voter_id,
          targetId: v.target_id,
          struck: v.is_annulled,
        }))
      )
    )
  );

  const departures: Departure[] = rows.departures.map(d => ({
    contestantId: d.season_contestant_id,
    episodeNumber: d.episode_id
      ? (episodeNumberById.get(d.episode_id) ?? null)
      : null,
    kind: (DEPARTURE_KINDS.has(d.kind) ? d.kind : 'other') as Departure['kind'],
    day: d.day,
    causedById: d.caused_by_departure_id
      ? (departureContestantById.get(d.caused_by_departure_id) ?? null)
      : null,
  }));

  const referential: Referential = {
    season: {
      id: rows.season.id,
      slug: rows.season.slug,
      name: rows.season.name,
      editionLabel: rows.season.edition_label,
      status: rows.season.status,
      rules: rows.season.season_rules
        .filter(r => RULE_KINDS.has(r.kind))
        .map(r => ({
          kind: r.kind as Referential['season']['rules'][number]['kind'],
          label: r.label,
          fromEpisode: r.from_episode_number,
          toEpisode: r.to_episode_number,
        })),
    },
    contestants: rows.contestants.map(c => {
      // L'appartenance la plus récente : la tribu est un intervalle, pas
      // un attribut, et c'est la dernière qui décrit l'état courant.
      const membership = [...c.team_memberships].sort(
        (a, b) => (b.from_episode_number ?? 0) - (a.from_episode_number ?? 0)
      )[0];
      const gender = c.contestants?.gender;
      return {
        id: c.id,
        displayName: c.display_name,
        gender:
          gender === 'f' || gender === 'm' || gender === 'other'
            ? gender
            : null,
        age: c.age_at_season,
        previousSeasons: [...c.contestant_previous_seasons]
          .sort((a, b) => a.ordinal - b.ordinal)
          .map(s => s.label),
        teamId: membership?.team_id ?? null,
        pairId: pairOf.get(c.id) ?? null,
      };
    }),
    teams: rows.teams.map(t => ({ id: t.id, name: t.name, colour: t.colour })),
    pairs: rows.pairs.map(p => ({
      id: p.id,
      memberIds: [p.member_a_id, p.member_b_id],
    })),
    episodes: rows.episodes.map(e => {
      const comfort = e.challenges.filter(
        c => c.kind === 'comfort' || c.kind === 'combined'
      );
      const immunity = e.challenges.filter(
        c => c.kind === 'immunity' || c.kind === 'combined'
      );
      const hasData = e.councils.length > 0 || e.challenges.length > 0;
      return {
        id: e.id,
        number: e.number,
        airDate: e.air_date,
        // Diffusé = passé à la date du jour, OU déjà documenté. Une date
        // seule dans le futur ne suffit pas ; une soirée renseignée suffit.
        aired: hasData || (e.air_date !== null && e.air_date <= today),
        comfortWinnerIds: winnersOf(
          comfort.flatMap(c => c.challenge_results),
          pairMembers
        ),
        immunityWinnerIds: winnersOf(
          immunity.flatMap(c => c.challenge_results),
          pairMembers
        ),
      };
    }),
    rounds,
    votes,
    departures,
    provenance: {
      kind: 'wikipedia',
      label: rows.provenance?.reference_sources?.label ?? 'Source externe',
      url: rows.provenance?.url ?? null,
      revision: rows.provenance?.last_seen_revision ?? null,
      fetchedAt: rows.provenance?.last_seen_at ?? null,
      licence: rows.provenance?.reference_sources?.licence ?? null,
      version: rows.version,
    },
  };

  // Validé une seconde fois, dans la forme que les écrans consomment : le
  // mappage lui-même peut se tromper, et c'est ici qu'il doit le dire.
  return ReferentialSchema.parse(referential);
}

// ── Lecture ──────────────────────────────────────────────────────────────────

/** Ce qu'une saison publiée n'a pas : rien n'est à afficher, et on le dit. */
export class NoPublishedSeason extends Error {
  constructor() {
    super('aucune saison publiée sur le serveur');
    this.name = 'NoPublishedSeason';
  }
}

export async function fetchRows(client: SupabaseClient): Promise<unknown> {
  const { data: season, error: seasonError } = await client
    .from('seasons')
    .select(
      'id, slug, name, edition_label, status, source_document_id, season_rules(kind, label, from_episode_number, to_episode_number)'
    )
    .order('first_air_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (seasonError) throw new Error(`saisons : ${seasonError.message}`);
  if (!season) throw new NoPublishedSeason();

  const [contestants, teams, pairs, episodes, version, provenance] =
    await Promise.all([
      client
        .from('season_contestants')
        .select(
          'id, contestant_id, display_name, age_at_season, final_jury, contestants(gender), contestant_previous_seasons(label, ordinal), team_memberships(team_id, from_episode_number)'
        )
        .eq('season_id', season.id),
      client
        .from('teams')
        .select('id, name, colour')
        .eq('season_id', season.id),
      client
        .from('pairs')
        .select('id, member_a_id, member_b_id')
        .eq('season_id', season.id),
      client
        .from('episodes')
        .select(
          'id, number, air_date, challenges(kind, challenge_results(season_contestant_id, pair_id, is_winner)), councils(id, council_rounds(id, round_number, outcome, reported_votes_for, reported_votes_total, votes_complete, council_votes(voter_id, target_id, is_annulled)))'
        )
        .eq('season_id', season.id)
        .order('number'),
      client
        .from('referential_versions')
        .select('id')
        .eq('season_id', season.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      season.source_document_id
        ? client
            .from('source_documents')
            .select(
              'url, last_seen_revision, last_seen_at, reference_sources(label, licence)'
            )
            .eq('id', season.source_document_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  for (const [label, r] of [
    ['candidats', contestants],
    ['tribus', teams],
    ['binômes', pairs],
    ['épisodes', episodes],
    ['versions', version],
    ['provenance', provenance],
  ] as const) {
    if (r.error) throw new Error(`${label} : ${r.error.message}`);
  }

  const contestantIds = (contestants.data ?? []).map(c => c.id);
  const departures = contestantIds.length
    ? await client
        .from('departures')
        .select(
          'id, season_contestant_id, episode_id, round_id, kind, day, caused_by_departure_id'
        )
        .in('season_contestant_id', contestantIds)
    : { data: [], error: null };
  if (departures.error)
    throw new Error(`départs : ${departures.error.message}`);

  return {
    season,
    contestants: contestants.data ?? [],
    teams: teams.data ?? [],
    pairs: pairs.data ?? [],
    episodes: episodes.data ?? [],
    departures: departures.data ?? [],
    version: version.data?.id ?? 0,
    provenance: provenance.data ?? null,
  };
}

export interface SupabaseRepositoryDeps {
  /** Injectable : les tests passent un client de fantaisie. */
  getClient: () => Promise<SupabaseClient>;
  readCache: () => Referential | null;
  writeCache: (referential: Referential) => void;
  today?: () => string;
}

export function createSupabaseRepository(
  deps: SupabaseRepositoryDeps
): ReferentialRepository {
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  return {
    async load(): Promise<LoadResult> {
      try {
        const client = await deps.getClient();
        const referential = mapReferential(await fetchRows(client), today());
        deps.writeCache(referential);
        return { referential, origin: 'server' };
      } catch (error) {
        if (error instanceof NoPublishedSeason) {
          return {
            referential: DEMO_REFERENTIAL,
            origin: 'demo',
            notice:
              'Le serveur ne publie encore aucune saison : démonstration affichée.',
          };
        }
        // Réseau absent, serveur injoignable, RLS qui refuse : la dernière
        // version enregistrée vaut mieux qu'un écran vide — et elle est
        // annoncée comme telle.
        const cached = deps.readCache();
        if (cached) {
          return {
            referential: cached,
            origin: 'cache',
            notice: 'Serveur injoignable : dernière version enregistrée.',
          };
        }
        throw error;
      }
    },
  };
}

/** La fabrique du socle : configuration lue tout de suite, client créé au premier appel. */
export const supabaseFactory = createSupabaseClientFactory<SupabaseClient>({
  env: import.meta.env,
  auth: { persistSession: true, autoRefreshToken: true },
});
