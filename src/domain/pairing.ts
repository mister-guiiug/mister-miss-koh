/**
 * Les duos SUPPOSÉS — ce que le spectateur croit savoir, à côté de ce que la
 * source dit.
 *
 * POURQUOI ILS NE VONT PAS DANS LE RÉFÉRENTIEL. Un duo écrit à la main n'est
 * pas un fait relevé : c'est une hypothèse. Le référentiel n'a aucune
 * politique d'écriture pour un utilisateur, et ce n'est pas une limite à
 * contourner — c'est ce qui garantit que tout ce qu'il contient porte une
 * page, une révision et une date. Une supposition rejoint donc les données
 * PERSONNELLES (favoris, épisodes vus) : elle vit sur l'appareil, et elle
 * s'affiche partout comme une supposition.
 *
 * TROIS RÈGLES, ET ELLES TIENNENT ENSEMBLE :
 *
 *  1. **la source prime.** Dès qu'un départ nomme un duo et que l'anti-spoiler
 *     le laisse voir, c'est lui qui s'affiche. La supposition n'est pas
 *     effacée pour autant — elle est dite confirmée ou contredite ;
 *  2. **l'anti-spoiler s'applique d'abord.** Un duo révélé mais masqué ne
 *     compte pour rien : ni pour afficher, ni pour contredire, ni pour retirer
 *     quelqu'un de la liste des binômes possibles. Sans cette règle, la seule
 *     absence d'un nom dans la liste divulguerait le duo caché ;
 *  3. **un candidat appartient à un duo au plus.** Supposer deux fois pour la
 *     même personne se refuse, avec sa raison.
 */
import { z } from 'zod';
import {
  contestantById,
  type Contestant,
  type Referential,
} from './referential';
import { groupingOf, type Grouping } from './rules';
import { isSpoiler } from './spoiler';

export const PairGuessSchema = z.object({
  memberIds: z.tuple([z.string(), z.string()]),
});

export type PairGuess = z.infer<typeof PairGuessSchema>;

/**
 * Deux identifiants, toujours dans le même ordre : un duo est UNE valeur, quel
 * que soit le candidat depuis lequel on l'a supposé.
 */
export function orderedMembers(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function sameMembers(
  x: readonly [string, string],
  y: readonly [string, string]
): boolean {
  return x[0] === y[0] && x[1] === y[1];
}

/** Les duos que la source nomme ET que l'anti-spoiler laisse voir. */
export function visibleSourcePairs(ref: Referential, limit: number) {
  return ref.pairs.filter(p => !isSpoiler(p.revealEpisodeNumber, limit));
}

export type GuessRefusal =
  'meme-personne' | 'candidat-inconnu' | 'deja-un-binome' | 'deja-suppose';

/**
 * Ce qui empêche de supposer ce duo, ou `null` s'il est recevable.
 *
 * « Déjà pris » se lit sur les duos EFFECTIFS, jamais sur la liste brute des
 * suppositions : une supposition que la source a contredite ne tient plus
 * personne. Sans cette nuance, s'être trompé une fois interdirait à jamais de
 * reformer ces deux-là — avec qui que ce soit.
 */
export function refuseGuess(
  ref: Referential,
  guesses: readonly PairGuess[],
  limit: number,
  a: string,
  b: string
): GuessRefusal | null {
  if (a === b) return 'meme-personne';
  if (!contestantById(ref, a) || !contestantById(ref, b))
    return 'candidat-inconnu';

  const held = effectivePairs(ref, guesses, limit).find(
    p => p.memberIds.includes(a) || p.memberIds.includes(b)
  );
  if (!held) return null;
  return held.origin === 'source' ? 'deja-un-binome' : 'deja-suppose';
}

/**
 * Les candidats qu'on peut encore proposer comme binôme.
 *
 * La liste se calcule à la limite anti-spoiler courante : quelqu'un dont le
 * duo est révélé PLUS TARD reste proposable. Le retirer reviendrait à dire
 * « celui-là a déjà un binôme », donc à divulguer ce que l'écran masque.
 */
export function eligiblePartners(
  ref: Referential,
  guesses: readonly PairGuess[],
  limit: number,
  contestantId: string
): Contestant[] {
  const pairs = effectivePairs(ref, guesses, limit);
  if (pairs.some(p => p.memberIds.includes(contestantId))) return [];
  const held = new Set(pairs.flatMap(p => [...p.memberIds]));
  return ref.contestants.filter(c => c.id !== contestantId && !held.has(c.id));
}

export type PairOrigin = 'source' | 'guess';

export interface EffectivePair {
  readonly key: string;
  readonly memberIds: readonly [string, string];
  readonly origin: PairOrigin;
}

/**
 * Les duos à afficher : ceux de la source d'abord, les suppositions ensuite —
 * et jamais deux fois la même personne.
 */
export function effectivePairs(
  ref: Referential,
  guesses: readonly PairGuess[],
  limit: number
): EffectivePair[] {
  const pairs: EffectivePair[] = [];
  const placed = new Set<string>();

  for (const pair of visibleSourcePairs(ref, limit)) {
    const members = orderedMembers(pair.memberIds[0], pair.memberIds[1]);
    pairs.push({ key: pair.id, memberIds: members, origin: 'source' });
    for (const id of members) placed.add(id);
  }

  for (const guess of guesses) {
    const members = orderedMembers(guess.memberIds[0], guess.memberIds[1]);
    // La source a parlé pour l'un des deux : sa supposition ne s'affiche plus,
    // mais elle n'est pas effacée — `partnerView` dira qu'elle est contredite.
    if (members.some(id => placed.has(id))) continue;
    if (!members.every(id => contestantById(ref, id))) continue;
    pairs.push({
      key: `guess:${members[0]}:${members[1]}`,
      memberIds: members,
      origin: 'guess',
    });
    for (const id of members) placed.add(id);
  }

  return pairs;
}

export interface PartnerView {
  /** Le binôme retenu — de la source, ou supposé. */
  readonly partner: Contestant | null;
  readonly origin: PairOrigin | null;
  /** La supposition disait juste : la source l'a confirmée. */
  readonly confirmed: boolean;
  /** La supposition disait autre chose : voici qui elle nommait. */
  readonly contradicted: Contestant | null;
}

/** Ce qu'il faut dire du binôme d'un candidat, et de ce qu'on en avait supposé. */
export function partnerView(
  ref: Referential,
  guesses: readonly PairGuess[],
  limit: number,
  contestantId: string
): PartnerView {
  const kept =
    effectivePairs(ref, guesses, limit).find(p =>
      p.memberIds.includes(contestantId)
    ) ?? null;
  const partnerId = kept
    ? (kept.memberIds.find(id => id !== contestantId) ?? null)
    : null;

  // La DERNIÈRE qui le nomme : le magasin n'en garde qu'une, mais cette
  // fonction est pure et ne suppose pas ce que son appelant a fait.
  const guess =
    guesses.findLast(g => g.memberIds.includes(contestantId)) ?? null;
  const guessedId = guess
    ? (guess.memberIds.find(id => id !== contestantId) ?? null)
    : null;

  const guessKept =
    guess !== null &&
    kept !== null &&
    sameMembers(
      kept.memberIds as [string, string],
      orderedMembers(guess.memberIds[0], guess.memberIds[1])
    );

  return {
    partner: contestantById(ref, partnerId),
    origin: kept?.origin ?? null,
    confirmed: guessKept && kept?.origin === 'source',
    contradicted:
      guess !== null && !guessKept ? contestantById(ref, guessedId) : null,
  };
}

/**
 * Regrouper par duo, ou par tribu ?
 *
 * `groupingOf` répond pour l'ÉDITION, d'après les données de la source seule —
 * et c'est ce qu'on veut lui demander. Mais une saison dont aucun duo n'a
 * encore été révélé retomberait sur ses tribus, et les suppositions n'auraient
 * nulle part où s'afficher. Supposer un duo est donc traité comme ce que c'est :
 * l'affirmation que cette édition en a.
 */
export function groupingWithGuesses(
  ref: Referential,
  guesses: readonly PairGuess[]
): Grouping {
  return guesses.length > 0 ? 'pair' : groupingOf(ref);
}
