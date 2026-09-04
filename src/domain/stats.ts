/**
 * Statistiques — calculées, jamais stockées, et toujours honnêtes sur ce
 * qu'elles ne savent pas.
 *
 * ZÉRO N'EST PAS INCONNU. Chaque compte rend `{ value, complete }` :
 * `value` est ce qui est CONNU, `complete` dit si la source donnait tout.
 * Un candidat à `{ value: 0, complete: true }` n'a reçu aucune voix ; à
 * `{ value: 0, complete: false }`, on n'en sait rien. L'interface affiche
 * « 0 » dans le premier cas, « ≥ 0 » ou « inconnu » dans le second — jamais
 * la même chose pour les deux.
 *
 * TOUTES LES FONCTIONS PRENNENT UNE LIMITE D'ÉPISODE. Une statistique qui
 * lirait la saison entière trahirait l'anti-spoiler par la bande : « 3 voix
 * reçues » sur la fiche d'un candidat encore en jeu à l'épisode 2 dit qu'un
 * troisième conseil a eu lieu.
 */
import type { Referential, Round } from './referential';

export interface Counted {
  readonly value: number;
  readonly complete: boolean;
}

/** Les tours de scrutin RÉELS jusqu'à la limite : ni annulés, ni départs liés. */
function votingRounds(ref: Referential, upToEpisode: number): Round[] {
  return ref.rounds.filter(
    r => r.kind === 'vote' && r.episodeNumber <= upToEpisode
  );
}

/** Candidats sans départ connu jusqu'à la limite. */
export function inGame(ref: Referential, upToEpisode: number): string[] {
  const gone = new Set(
    ref.departures
      .filter(d => d.episodeNumber !== null && d.episodeNumber <= upToEpisode)
      .map(d => d.contestantId)
  );
  return ref.contestants.filter(c => !gone.has(c.id)).map(c => c.id);
}

/** Voix reçues, hors tours annulés et hors voix barrées. */
export function votesReceived(
  ref: Referential,
  contestantId: string,
  upToEpisode: number
): Counted {
  const rounds = votingRounds(ref, upToEpisode);
  const roundIds = new Set(rounds.map(r => r.id));
  const value = ref.votes.filter(
    v => roundIds.has(v.roundId) && v.targetId === contestantId && !v.struck
  ).length;
  return { value, complete: rounds.every(r => r.votesComplete) };
}

/** Voix exprimées par un candidat, hors tours annulés et voix barrées. */
export function votesCast(
  ref: Referential,
  contestantId: string,
  upToEpisode: number
): Counted {
  const rounds = votingRounds(ref, upToEpisode);
  const roundIds = new Set(rounds.map(r => r.id));
  const value = ref.votes.filter(
    v =>
      roundIds.has(v.roundId) &&
      v.voterId === contestantId &&
      !v.struck &&
      v.targetId
  ).length;
  return { value, complete: rounds.every(r => r.votesComplete) };
}

/** Épreuves gagnées, individuellement ou avec son binôme / son équipe. */
export function challengeWins(
  ref: Referential,
  contestantId: string,
  upToEpisode: number
): { comfort: number; immunity: number } {
  let comfort = 0;
  let immunity = 0;
  for (const e of ref.episodes) {
    if (e.number > upToEpisode || !e.aired) continue;
    if (e.comfortWinnerIds.includes(contestantId)) comfort += 1;
    if (e.immunityWinnerIds.includes(contestantId)) immunity += 1;
  }
  return { comfort, immunity };
}

/** Conseils auxquels un candidat a pris part, jusqu'à la limite. */
export function councilsAttended(
  ref: Referential,
  contestantId: string,
  upToEpisode: number
): number {
  const rounds = votingRounds(ref, upToEpisode);
  const episodes = new Set<number>();
  for (const r of rounds) {
    if (ref.votes.some(v => v.roundId === r.id && v.voterId === contestantId)) {
      episodes.add(r.episodeNumber);
    }
  }
  return episodes.size;
}

/** Dernier épisode diffusé, ou 0. */
export function lastAiredEpisode(ref: Referential): number {
  return ref.episodes.reduce(
    (max, e) => (e.aired && e.number > max ? e.number : max),
    0
  );
}
