/**
 * Le référentiel tel que l'application le lit — INDÉPENDANT de React et de
 * Supabase. Les écrans consomment ces types ; les adaptateurs les produisent.
 *
 * Les schémas zod valident À LA FRONTIÈRE : ce qui vient du réseau, du cache
 * IndexedDB ou d'un fichier de démonstration passe par `ReferentialSchema`
 * avant d'atteindre un composant. Une donnée qui ne se valide pas est
 * refusée, pas « réparée ».
 */
import { z } from 'zod';

export const SeasonRuleSchema = z.object({
  kind: z.enum([
    'linked_pair_departure',
    'pair_composition',
    'council_without_host',
    'comfort_island',
    'other',
  ]),
  label: z.string(),
  fromEpisode: z.number().int().positive().nullable(),
  toEpisode: z.number().int().positive().nullable(),
});

export const SeasonSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  editionLabel: z.string().nullable(),
  status: z.enum(['announced', 'airing', 'completed']),
  rules: z.array(SeasonRuleSchema),
});

export const ContestantSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  gender: z.enum(['f', 'm', 'other']).nullable(),
  age: z.number().int().positive().nullable(),
  previousSeasons: z.array(z.string()),
  teamId: z.string().nullable(),
  pairId: z.string().nullable(),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string().nullable(),
});

export const PairSchema = z.object({
  id: z.string(),
  memberIds: z.tuple([z.string(), z.string()]),
});

export const EpisodeSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  airDate: z.string().nullable(), // ISO `AAAA-MM-JJ`
  aired: z.boolean(),
  comfortWinnerIds: z.array(z.string()),
  immunityWinnerIds: z.array(z.string()),
});

export const RoundKindSchema = z.enum([
  'vote',
  'annulled',
  'linked',
  'unknown',
]);

export const RoundSchema = z.object({
  id: z.string(),
  episodeNumber: z.number().int().positive(),
  roundNumber: z.number().int().positive(),
  kind: RoundKindSchema,
  eliminatedId: z.string().nullable(),
  /** `null` = la source ne le dit pas. `0` est une valeur. */
  reportedVotesFor: z.number().int().nonnegative().nullable(),
  reportedVotesTotal: z.number().int().nonnegative().nullable(),
  /** Faux = le détail individuel des voix est partiel. */
  votesComplete: z.boolean(),
});

export const VoteSchema = z.object({
  roundId: z.string(),
  voterId: z.string(),
  targetId: z.string().nullable(),
  struck: z.boolean(),
});

export const DepartureKindSchema = z.enum([
  'vote',
  'linked_pair',
  'quit',
  'medical',
  'banned',
  'jury_exit',
  'final_ranking',
  'other',
]);

export const DepartureSchema = z.object({
  contestantId: z.string(),
  episodeNumber: z.number().int().positive().nullable(),
  kind: DepartureKindSchema,
  day: z.number().int().positive().nullable(),
  causedById: z.string().nullable(),
});

export const ProvenanceSchema = z.object({
  kind: z.enum(['demo', 'wikipedia']),
  label: z.string(),
  url: z.string().nullable(),
  revision: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  version: z.number().int().nonnegative(),
});

export const ReferentialSchema = z.object({
  season: SeasonSchema,
  contestants: z.array(ContestantSchema),
  teams: z.array(TeamSchema),
  pairs: z.array(PairSchema),
  episodes: z.array(EpisodeSchema),
  rounds: z.array(RoundSchema),
  votes: z.array(VoteSchema),
  departures: z.array(DepartureSchema),
  provenance: ProvenanceSchema,
});

export type SeasonRule = z.infer<typeof SeasonRuleSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type Contestant = z.infer<typeof ContestantSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Pair = z.infer<typeof PairSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type Departure = z.infer<typeof DepartureSchema>;
export type DepartureKind = z.infer<typeof DepartureKindSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Referential = z.infer<typeof ReferentialSchema>;

/** Le binôme d'un candidat, s'il en a un. */
export function partnerOf(
  ref: Referential,
  contestantId: string
): Contestant | null {
  const pair = ref.pairs.find(p => p.memberIds.includes(contestantId));
  if (!pair) return null;
  const otherId =
    pair.memberIds[0] === contestantId ? pair.memberIds[1] : pair.memberIds[0];
  return ref.contestants.find(c => c.id === otherId) ?? null;
}

export function contestantById(
  ref: Referential,
  id: string | null
): Contestant | null {
  if (!id) return null;
  return ref.contestants.find(c => c.id === id) ?? null;
}
