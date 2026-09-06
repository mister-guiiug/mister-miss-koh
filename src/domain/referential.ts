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

export const SeasonLocationSchema = z.object({
  /** « Archipel des Perles (Panama) » */
  name: z.string(),
  /** La page géolocalisée — l'archipel, pas le pays. */
  pageTitle: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
});

export const SeasonSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  editionLabel: z.string().nullable(),
  /**
   * `unknown` existe depuis que le catalogue se découvre par l'API : une page
   * qui y entre donne un titre, pas une date de diffusion. Le schéma doit
   * accepter ce que la base peut contenir, sinon la première saison découverte
   * puis publiée serait REFUSÉE à la frontière — et l'écran montrerait une
   * erreur au lieu d'une saison.
   */
  status: z.enum(['announced', 'airing', 'completed', 'unknown']),
  rules: z.array(SeasonRuleSchema),
  /**
   * Le lieu de tournage, tel que la source l'écrit, et le point de la page de
   * lieu qu'elle cite (API MediaWiki). `null` tant que rien n'est publié — et
   * par défaut, pour qu'un référentiel mis en cache avant cette colonne passe
   * encore la frontière.
   */
  location: SeasonLocationSchema.nullable().default(null),
});

export const ContestantSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  gender: z.enum(['f', 'm', 'other']).nullable(),
  age: z.number().int().positive().nullable(),
  previousSeasons: z.array(z.string()),
  teamId: z.string().nullable(),
  pairId: z.string().nullable(),
  /** Membre du jury final, quand la source le dit ; `null` = pas encore. */
  finalJury: z.boolean().nullable().default(null),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  colour: z.string().nullable(),
});

export const PairSchema = z.object({
  id: z.string(),
  memberIds: z.tuple([z.string(), z.string()]),
  /**
   * L'épisode qui a RÉVÉLÉ le duo.
   *
   * La source ne liste les duos nulle part : on n'en connaît un que lorsqu'un
   * départ lié le nomme. Cet épisode est donc à la fois le moment où le duo
   * devient connaissable et celui à partir duquel l'afficher ne divulgâche
   * plus rien.
   */
  revealEpisodeNumber: z.number().int().positive().nullable(),
});

export const EpisodeSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  airDate: z.string().nullable(), // ISO `AAAA-MM-JJ`
  aired: z.boolean(),
  comfortWinnerIds: z.array(z.string()),
  immunityWinnerIds: z.array(z.string()),
  /**
   * Une épreuve se gagne aussi en TRIBU. La source écrit un nom sans dire
   * lequel des deux c'est ; le référentiel, lui, l'a tranché. Les deux listes
   * coexistent parce qu'une soirée peut mêler les deux.
   */
  comfortWinnerTeamIds: z.array(z.string()).default([]),
  immunityWinnerTeamIds: z.array(z.string()).default([]),
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

export const AdvantageSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'immunity_necklace',
    'vote_advantage',
    'comfort_advantage',
    'other',
  ]),
  /** Où il a été trouvé, tel que la source l'écrit : « Camp réunifié ». */
  label: z.string().nullable(),
  status: z.enum(['used', 'not_used', 'undiscovered', 'unknown']),
  /** Jour de jeu. La source ne donne pas d'épisode pour la découverte. */
  foundDay: z.number().int().positive().nullable(),
  playedEpisodeNumber: z.number().int().positive().nullable(),
  /**
   * L'épisode à partir duquel l'existence de cet avantage cesse d'être un
   * spoiler.
   *
   * S'il a été JOUÉ, c'est l'épisode où il l'a été — la source le dit. Sinon,
   * la source ne date sa découverte qu'en JOURS, et rien ne permet de traduire
   * un jour en épisode : on retient alors le dernier épisode diffusé, ce qui
   * ne révèle rien à qui n'est pas déjà à jour. Prudent plutôt que deviné.
   */
  revealEpisodeNumber: z.number().int().positive().nullable(),
  holderIds: z.array(z.string()),
});

export const ProvenanceSchema = z.object({
  kind: z.enum(['demo', 'wikipedia']),
  label: z.string(),
  /** Titre de la page source (« Koh-Lanta All Stars »), quand la source en a un. */
  title: z.string().nullable().default(null),
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
  advantages: z.array(AdvantageSchema).default([]),
  provenance: ProvenanceSchema,
});

export type SeasonRule = z.infer<typeof SeasonRuleSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type Contestant = z.infer<typeof ContestantSchema>;
export type Advantage = z.infer<typeof AdvantageSchema>;
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
