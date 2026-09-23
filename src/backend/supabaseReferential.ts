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
  type Advantage,
} from '../domain/referential';
import { DEMO_REFERENTIAL } from './demo';
import type {
  LoadResult,
  ReferentialRepository,
  SeasonOption,
} from './referentialRepository';

// ── Formes des lignes, telles que PostgREST les rend ────────────────────────

const RuleRow = z.object({
  kind: z.string(),
  label: z.string(),
  from_episode_number: z.number().nullable(),
  to_episode_number: z.number().nullable(),
});

const SeasonOptionRows = z.array(
  z.object({ slug: z.string(), name: z.string() })
);

const SeasonRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  edition_label: z.string().nullable(),
  status: z.enum(['announced', 'airing', 'completed', 'unknown']),
  source_document_id: z.string().nullable(),
  season_rules: z.array(RuleRow).default([]),
  // Le lieu de tournage (migration 0019) ; par défaut `null`, pour les lignes
  // lues avant la colonne.
  location_name: z.string().nullable().default(null),
  location_page_title: z.string().nullable().default(null),
  location_lat: z.number().nullable().default(null),
  location_lon: z.number().nullable().default(null),
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
        // La source date les appartenances en JOURS, jamais en épisodes.
        from_day: z.number().nullable(),
        // La fin du séjour : sans elle, un retour ne se distingue pas d'un
        // séjour qui n'a jamais cessé.
        to_day: z.number().nullable().default(null),
      })
    )
    .default([]),
});

const TeamRow = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string().nullable(),
});

/**
 * Une couleur publiable, ou rien. La base la contraint depuis 0028, mais une
 * valeur écrite avant la contrainte (`not valid`) ne doit pas faire refuser
 * tout le référentiel à la frontière : elle devient « pas de couleur ».
 */
function couleur(value: string | null): string | null {
  return value !== null && /^#[0-9a-f]{6}$/.test(value) ? value : null;
}

const PairRow = z.object({
  id: z.string(),
  member_a_id: z.string(),
  member_b_id: z.string(),
});

const ResultRow = z.object({
  season_contestant_id: z.string().nullable(),
  pair_id: z.string().nullable(),
  team_id: z.string().nullable(),
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
  // Le jour du conseil de la soirée (0028) ; nul avant, et pour les pages
  // qui ne le donnent pas.
  day_end: z.number().nullable().default(null),
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
  // 0029. Absent d'une base qui ne l'a pas encore : le rang est alors inconnu.
  round_number: z.number().int().positive().nullable().default(null),
});

const AdvantageRow = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  status: z.string().nullable(),
  found_day: z.number().nullable(),
  played_episode_id: z.string().nullable(),
  advantage_holders: z
    .array(z.object({ season_contestant_id: z.string(), ordinal: z.number() }))
    .default([]),
});

const ProvenanceRow = z.object({
  url: z.string(),
  title: z.string().nullable().default(null),
  last_seen_revision: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  reference_sources: z.object({ label: z.string() }).nullable(),
});

export const RowsSchema = z.object({
  season: SeasonRow,
  contestants: z.array(ContestantRow),
  teams: z.array(TeamRow),
  pairs: z.array(PairRow),
  episodes: z.array(EpisodeRow),
  departures: z.array(DepartureRow),
  advantages: z.array(AdvantageRow).default([]),
  version: z.number().int().nonnegative(),
  provenance: ProvenanceRow.nullable(),
});

/**
 * Les lignes telles que PostgREST les rend — AVANT les valeurs par défaut :
 * une colonne ajoutée après coup (`to_day`, `day_end`) peut manquer d'une
 * réponse mise en cache, et c'est la frontière qui la complète.
 */
export type Rows = z.input<typeof RowsSchema>;

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

const ADVANTAGE_KINDS = new Set([
  'immunity_necklace',
  'vote_advantage',
  'comfort_advantage',
  'other',
]);

const ADVANTAGE_STATUSES = new Set([
  'used',
  'not_used',
  'undiscovered',
  'unknown',
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

/**
 * Les tribus vainqueurs.
 *
 * ELLES NE SE DÉPLIENT PAS EN CANDIDATS. Il faudrait savoir qui était dans la
 * tribu CE SOIR-LÀ ; les appartenances sont datées en jours, les épisodes ne
 * le sont pas, et faute de correspondance on nommerait des membres au hasard.
 * La tribu se nomme donc telle quelle.
 */
function winningTeamsOf(
  results: readonly z.infer<typeof ResultRow>[]
): string[] {
  const ids = new Set<string>();
  for (const r of results) {
    if (r.is_winner && r.team_id) ids.add(r.team_id);
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
  // LA PREMIÈRE SORTIE de chacun : depuis 0028, on peut sortir deux fois, et
  // c'est la première qui a pu révéler un duo.
  const departureEpisodeOf = new Map<string, number>();
  for (const d of rows.departures) {
    const number = d.episode_id
      ? episodeNumberById.get(d.episode_id)
      : undefined;
    if (number === undefined) continue;
    const known = departureEpisodeOf.get(d.season_contestant_id);
    if (known === undefined || number < known)
      departureEpisodeOf.set(d.season_contestant_id, number);
  }
  const eliminatedByRound = new Map<string, string>();
  for (const d of rows.departures) {
    if (d.round_id && d.kind === 'vote')
      eliminatedByRound.set(d.round_id, d.season_contestant_id);
  }
  // LE RANG D'UNE SORTIE DANS SA SOIRÉE : la colonne que la source lui donne.
  // Celui de son tour quand il y a eu un vote ; sinon celui que la base garde
  // depuis 0029 — une sortie sans scrutin n'a pas de tour pour le porter.
  const roundNumberById = new Map<string, number>();
  for (const e of rows.episodes) {
    for (const c of e.councils) {
      for (const r of c.council_rounds)
        roundNumberById.set(r.id, r.round_number);
    }
  }
  const rankOf = (d: (typeof rows.departures)[number]): number | null =>
    (d.round_id ? roundNumberById.get(d.round_id) : undefined) ??
    d.round_number;

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
    // Une sortie sans vote n'est pas un scrutin en base — elle n'a ni voix
    // ni décompte. L'application, elle, la montre à sa place dans la
    // soirée : un tour synthétique, à ZÉRO voix, certain.
    //
    // SA PLACE EST SON RANG, pas « après le dernier conseil ». C'était juste
    // pour un départ de binôme, qui suit l'élimination qui le cause, et faux
    // pour tout le reste : l'arène d'All Stars (épisode 4) précède le conseil
    // de Lola, et 65 colonnes sans scrutin sur 102 précèdent un tour de leur
    // soirée (relevé du 24/09/2026). Seul un rang inconnu se range encore
    // après les autres.
    //
    // BINÔME SEULEMENT SI UNE CAUSE EST NOMMÉE. Jusqu'à 0028, toute sortie à
    // zéro voix se publiait en `linked_pair`, abandons et évacuations
    // compris : quinze saisons affichaient « part avec son binôme » sous des
    // gens qui n'en avaient pas. Sans cause, c'est une sortie, sans plus.
    const silent = rows.departures.filter(
      d => d.kind !== 'vote' && d.episode_id === e.id
    );
    for (const d of silent) maxRound = Math.max(maxRound, rankOf(d) ?? 0);
    for (const d of silent) {
      rounds.push({
        id: `linked:${d.id}`,
        episodeNumber: e.number,
        roundNumber: rankOf(d) ?? ++maxRound,
        kind:
          d.kind === 'linked_pair' && d.caused_by_departure_id !== null
            ? 'linked'
            : 'departure',
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

  // Le dernier épisode diffusé sert de garde pour un avantage que la source ne
  // date qu'en jours : personne ne le voit avant d'être à jour.
  const lastAired = rows.episodes
    .filter(e => e.councils.length > 0 || e.challenges.length > 0)
    .reduce((max, e) => Math.max(max, e.number), 0);

  const advantages: Advantage[] = rows.advantages.map(a => {
    const playedEpisodeNumber = a.played_episode_id
      ? (episodeNumberById.get(a.played_episode_id) ?? null)
      : null;
    return {
      id: a.id,
      kind: (ADVANTAGE_KINDS.has(a.kind)
        ? a.kind
        : 'other') as Advantage['kind'],
      label: a.label,
      status: (a.status && ADVANTAGE_STATUSES.has(a.status)
        ? a.status
        : 'unknown') as Advantage['status'],
      foundDay: a.found_day,
      playedEpisodeNumber,
      revealEpisodeNumber:
        playedEpisodeNumber ?? (lastAired > 0 ? lastAired : null),
      holderIds: [...a.advantage_holders]
        .sort((x, y) => x.ordinal - y.ordinal)
        .map(h => h.season_contestant_id),
    };
  });

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
    roundNumber: rankOf(d),
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
      // Un lieu sans nom n'existe pas ; un lieu sans point, si.
      location: rows.season.location_name
        ? {
            name: rows.season.location_name,
            pageTitle: rows.season.location_page_title,
            lat: rows.season.location_lat,
            lon: rows.season.location_lon,
          }
        : null,
    },
    contestants: rows.contestants.map(c => {
      // TOUS les séjours, dans l'ordre des jours : la tribu est un intervalle,
      // et « la » tribu d'un candidat ne se dit qu'à une limite anti-spoiler
      // (`teamAt`). Garder seulement la plus récente, c'était l'afficher à qui
      // n'en était pas là.
      const teamStints = [...c.team_memberships]
        .sort(
          (a, b) =>
            (a.from_day ?? 0) - (b.from_day ?? 0) ||
            (a.from_episode_number ?? 0) - (b.from_episode_number ?? 0)
        )
        .map(m => ({
          teamId: m.team_id,
          fromDay: m.from_day,
          toDay: m.to_day,
        }));
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
        teamStints,
        pairId: pairOf.get(c.id) ?? null,
        finalJury: c.final_jury,
      };
    }),
    teams: rows.teams.map(t => ({
      id: t.id,
      name: t.name,
      colour: couleur(t.colour),
    })),
    pairs: rows.pairs.map(p => ({
      id: p.id,
      memberIds: [p.member_a_id, p.member_b_id] as [string, string],
      // Le duo n'existe dans le référentiel que parce qu'un départ l'a
      // nommé : son épisode de révélation est le premier des deux départs.
      revealEpisodeNumber:
        [p.member_a_id, p.member_b_id]
          .map(id => departureEpisodeOf.get(id) ?? null)
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b)[0] ?? null,
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
        councilDay: e.day_end,
        comfortWinnerIds: winnersOf(
          comfort.flatMap(c => c.challenge_results),
          pairMembers
        ),
        immunityWinnerIds: winnersOf(
          immunity.flatMap(c => c.challenge_results),
          pairMembers
        ),
        comfortWinnerTeamIds: winningTeamsOf(
          comfort.flatMap(c => c.challenge_results)
        ),
        immunityWinnerTeamIds: winningTeamsOf(
          immunity.flatMap(c => c.challenge_results)
        ),
      };
    }),
    rounds,
    votes,
    departures,
    advantages,
    provenance: {
      kind: 'wikipedia',
      label: rows.provenance?.reference_sources?.label ?? 'Source externe',
      title: rows.provenance?.title ?? null,
      url: rows.provenance?.url ?? null,
      revision: rows.provenance?.last_seen_revision ?? null,
      fetchedAt: rows.provenance?.last_seen_at ?? null,
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

/**
 * Les saisons publiées, pour le choix de l'utilisateur.
 *
 * Une requête à part, et légère : trois colonnes. La charger avec le
 * référentiel ferait payer dix-huit lignes à chaque ouverture d'écran, pour
 * une liste qui ne sert qu'aux Réglages.
 */
export async function fetchSeasonOptions(
  client: SupabaseClient
): Promise<SeasonOption[]> {
  // ⚠️ `first_air_date` EST NUL SUR LES SEIZE SAISONS (relevé du 14/09/2026) :
  // la source ne le donne pas, et le pipeline ne l'invente pas. L'ordre
  // chronologique ne trie donc rien aujourd'hui — le nom, lui, rend une liste
  // prévisible. On garde les deux : le jour où la date sera remplie, elle
  // reprendra la main sans qu'on y revienne.
  const { data, error } = await client
    .from('seasons')
    .select('slug, name')
    .order('first_air_date', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) throw new Error(`saisons : ${error.message}`);
  return SeasonOptionRows.parse(data ?? []);
}

/**
 * Les lignes d'UNE saison.
 *
 * @param slug La saison voulue. Absente du serveur — dépubliée, renommée — on
 * retombe sur la plus récente plutôt que sur un écran vide : le choix de
 * l'utilisateur ne doit pas pouvoir casser l'application.
 */
export async function fetchRows(
  client: SupabaseClient,
  slug?: string
): Promise<unknown> {
  const colonnes =
    'id, slug, name, edition_label, status, source_document_id, location_name, location_page_title, location_lat, location_lon, season_rules(kind, label, from_episode_number, to_episode_number)';

  // La ligne entière repart telle quelle : `SeasonRow` la valide plus loin,
  // comme toutes les autres. Seuls les deux champs dont `fetchRows` se sert
  // lui-même sont nommés ici.
  type LigneSaison = {
    id: string;
    source_document_id: string | null;
  } & Record<string, unknown>;

  let season: LigneSaison | null = null;
  if (slug) {
    const { data, error } = await client
      .from('seasons')
      .select(colonnes)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`saisons : ${error.message}`);
    season = data as LigneSaison | null;
  }
  if (!season) {
    // LE REPLI EST ARBITRAIRE, et il faut le savoir : `first_air_date` est nul
    // partout, donc « la plus récente » rend en réalité la première venue.
    // C'est acceptable pour un repli — jamais pour un défaut, d'où
    // `DEFAULT_SEASON_SLUG` côté magasin.
    const { data, error } = await client
      .from('seasons')
      .select(colonnes)
      .order('first_air_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`saisons : ${error.message}`);
    season = data as LigneSaison | null;
  }
  if (!season) throw new NoPublishedSeason();

  const [contestants, teams, pairs, episodes, advantages, version, provenance] =
    await Promise.all([
      client
        .from('season_contestants')
        .select(
          'id, contestant_id, display_name, age_at_season, final_jury, contestants(gender), contestant_previous_seasons(label, ordinal), team_memberships(team_id, from_episode_number, from_day, to_day)'
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
          'id, number, air_date, day_end, challenges(kind, challenge_results(season_contestant_id, pair_id, team_id, is_winner)), councils(id, council_rounds(id, round_number, outcome, reported_votes_for, reported_votes_total, votes_complete, council_votes(voter_id, target_id, is_annulled)))'
        )
        .eq('season_id', season.id)
        .order('number'),
      client
        .from('advantages')
        .select(
          'id, kind, label, status, found_day, played_episode_id, advantage_holders(season_contestant_id, ordinal)'
        )
        .eq('season_id', season.id),
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
              'url, title, last_seen_revision, last_seen_at, reference_sources(label)'
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
    ['avantages', advantages],
    ['versions', version],
    ['provenance', provenance],
  ] as const) {
    if (r.error) throw new Error(`${label} : ${r.error.message}`);
  }

  const contestantIds = (contestants.data ?? []).map(c => c.id);
  // `*` ET NON UNE LISTE. Le site et la migration 0029 partent du même push,
  // par deux workflows que rien n'ordonne : nommer `round_number` avant que la
  // colonne existe ferait échouer TOUTE la lecture. Absente de `*`, elle se
  // complète à la frontière, et le rang reste inconnu le temps d'une minute.
  const departures = contestantIds.length
    ? await client
        .from('departures')
        .select('*')
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
    advantages: advantages.data ?? [],
    version: version.data?.id ?? 0,
    provenance: provenance.data ?? null,
  };
}

export interface SupabaseRepositoryDeps {
  /** Injectable : les tests passent un client de fantaisie. */
  getClient: () => Promise<SupabaseClient>;
  readCache: (seasonSlug?: string) => Referential | null;
  writeCache: (referential: Referential) => void;
  today?: () => string;
}

/**
 * COMBIEN DE TEMPS ON ACCEPTE D'ATTENDRE LE SERVEUR AVANT DE SERVIR LE CACHE.
 *
 * Le repli sur la dernière version enregistrée existait déjà, mais il
 * n'arrivait qu'après un ÉCHEC — et l'échec, lui, prenait son temps : la
 * première requête PostgREST demande le jeton d'accès, ce qui déclenche
 * `auth.getSession()`, lequel part RENOUVELER un jeton périmé contre le
 * réseau avec des reprises à intervalle croissant. Mesuré sur la production le
 * 2026-09-10 : **33 secondes de « Chargement du référentiel »** avant que
 * l'application n'apparaisse — sur des données qu'elle avait dès la première
 * milliseconde.
 */
const ATTENTE_SERVEUR_MS = 5_000;

/** Marqueur d'attente dépassée, distinct d'une erreur. */
const TROP_LONG = Symbol('attente dépassée');

/**
 * Le navigateur affirme-t-il être HORS LIGNE ?
 *
 * `=== false` et non `!onLine` : hors navigateur la propriété n'existe pas, et
 * `!undefined` ferait croire à une coupure permanente. L'inverse n'est pas
 * fiable non plus — `onLine` est vrai derrière un portail captif comme sur un
 * Wi-Fi qui ne route rien. D'où l'attente bornée, en plus de ce test.
 */
function horsLigne(): boolean {
  return globalThis.navigator?.onLine === false;
}

export function createSupabaseRepository(
  deps: SupabaseRepositoryDeps
): ReferentialRepository {
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));

  /** La dernière version enregistrée, annoncée comme telle. */
  const depuisLeCache = (seasonSlug?: string): LoadResult | null => {
    const cached = deps.readCache(seasonSlug);
    return cached
      ? {
          referential: cached,
          origin: 'cache',
          notice: 'Serveur injoignable : dernière version enregistrée.',
        }
      : null;
  };

  return {
    async listSeasons(): Promise<SeasonOption[]> {
      // Injoignable, hors ligne, RLS qui refuse : pas de liste, pas de choix.
      // L'écran retombe sur la seule saison qu'il a déjà — il ne s'excuse pas.
      if (horsLigne()) return [];
      try {
        return await fetchSeasonOptions(await deps.getClient());
      } catch {
        return [];
      }
    },

    async load(seasonSlug?: string): Promise<LoadResult> {
      // Hors ligne : ne rien tenter. Le serveur n'a que le réseau pour
      // répondre, et Supabase met une demi-minute à l'admettre.
      if (horsLigne()) {
        const cache = depuisLeCache(seasonSlug);
        if (cache) return cache;
      }
      let minuteur: ReturnType<typeof setTimeout> | undefined;
      try {
        const client = await deps.getClient();
        const issue = await Promise.race([
          fetchRows(client, seasonSlug),
          new Promise<typeof TROP_LONG>(resoudre => {
            minuteur = setTimeout(
              () => resoudre(TROP_LONG),
              ATTENTE_SERVEUR_MS
            );
          }),
        ]);
        if (issue === TROP_LONG) {
          // Réseau présent mais mort : le cache maintenant vaut mieux que le
          // serveur dans trente secondes.
          const cache = depuisLeCache(seasonSlug);
          if (cache) return cache;
          throw new Error('serveur injoignable');
        }
        const referential = mapReferential(issue, today());
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
        const cache = depuisLeCache(seasonSlug);
        if (cache) return cache;
        throw error;
      } finally {
        clearTimeout(minuteur);
      }
    },
  };
}

/**
 * La fabrique du socle : configuration lue tout de suite, client créé au
 * premier appel.
 *
 * `flowType: 'pkce'` N'EST PAS UN RÉGLAGE DE SÉCURITÉ ICI, C'EST UNE
 * NÉCESSITÉ DE ROUTAGE. Le flux implicite renvoie le jeton dans le FRAGMENT
 * (`#access_token=…`) — l'endroit exact où `HashRouter` lit la route. Le
 * routeur y verrait une adresse inconnue, la remplacerait par « / », et le
 * jeton disparaîtrait avant d'avoir servi ; la connexion échouerait sans
 * message, une fois sur deux, selon qui lit l'URL en premier. PKCE renvoie
 * `?code=…` dans la QUERY, que le routeur ne touche pas.
 */
export const supabaseFactory = createSupabaseClientFactory<SupabaseClient>({
  env: import.meta.env,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
  },
});
