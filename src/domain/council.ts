/**
 * Le détail d'un tour de conseil : qui a reçu combien de voix, et qui a voté
 * pour qui.
 *
 * LE RÉFÉRENTIEL PORTAIT DÉJÀ CHAQUE BULLETIN, et seules les fiches s'en
 * servaient, pour des totaux. L'épisode, lui, ne disait que « X éliminé·e
 * (5/7 voix) » : le cœur de la soirée tenait en une ligne.
 *
 * UNE VOIX BARRÉE NE COMPTE PAS, mais elle se montre. C'est ce que la source
 * écrit quand un collier ou une égalité annule un bulletin ; la taire ferait
 * passer un 4-4 annulé pour un tour sans vote. Elle se compte à part.
 *
 * INCOMPLET SE DIT. Quand la source ne détaille pas toutes les voix
 * (`votesComplete` faux), les comptes sont des minimums, et l'écran l'écrit
 * « ≥ » — la même règle que la fiche d'un candidat.
 *
 * UN BULLETIN N'EST PAS TOUJOURS UNE VOIX. Un vote double (« Camille (x2) »)
 * compte deux fois : les voix se comptent au poids, et le bulletin le dit.
 */
import type { Referential, Round } from './referential';

export interface CouncilTally {
  /** `null` = un bulletin sans cible lisible dans la source. */
  readonly targetId: string | null;
  /** Voix qui comptent. */
  readonly votes: number;
  /** Voix barrées, montrées à part. */
  readonly struck: number;
}

export interface CouncilBallot {
  readonly voterId: string;
  readonly targetId: string | null;
  readonly struck: boolean;
  /** Les voix que porte le bulletin : 2 pour un vote double. */
  readonly weight: number;
}

export interface CouncilView {
  readonly tallies: readonly CouncilTally[];
  readonly ballots: readonly CouncilBallot[];
  /** Le plus grand nombre de voix (comptées ou barrées) : l'échelle des barres. */
  readonly max: number;
  readonly complete: boolean;
}

/** Le détail d'un tour, ou `null` quand la source n'en donne aucun bulletin. */
export function councilView(
  referential: Referential,
  round: Round
): CouncilView | null {
  const ballots = referential.votes
    .filter(v => v.roundId === round.id)
    .map(v => ({
      voterId: v.voterId,
      targetId: v.targetId,
      struck: v.struck,
      weight: v.weight,
    }));
  if (ballots.length === 0) return null;

  const byTarget = new Map<string | null, { votes: number; struck: number }>();
  for (const b of ballots) {
    const t = byTarget.get(b.targetId) ?? { votes: 0, struck: 0 };
    if (b.struck) t.struck += b.weight;
    else t.votes += b.weight;
    byTarget.set(b.targetId, t);
  }
  const tallies = [...byTarget.entries()]
    .map(([targetId, t]) => ({ targetId, ...t }))
    // Le plus visé d'abord ; à égalité, l'ordre de la source, qui est stable.
    .sort((a, b) => b.votes - a.votes || b.struck - a.struck);
  const max = Math.max(...tallies.map(t => t.votes + t.struck));

  return { tallies, ballots, max, complete: round.votesComplete };
}
