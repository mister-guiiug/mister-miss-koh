/**
 * Les règles de saison sont des DONNÉES, lues ici — jamais présumées.
 *
 * « Si un membre du duo est éliminé au conseil, son binôme part aussi » est
 * vrai de l'édition suivie et faux des autres. Ce module ne sait rien de
 * cette édition : il lit `season.rules`, vérifie qu'une règle s'applique à
 * l'épisode concerné, et n'en déduit un départ lié que dans ce cas.
 */
import type { Departure, Referential, SeasonRule } from './referential';
import { partnerOf } from './referential';

/** La règle est-elle en vigueur à cet épisode ? Bornes nulles = toute la saison. */
export function ruleApplies(
  rule: SeasonRule,
  episodeNumber: number | null
): boolean {
  if (episodeNumber === null)
    return rule.fromEpisode === null && rule.toEpisode === null;
  if (rule.fromEpisode !== null && episodeNumber < rule.fromEpisode)
    return false;
  if (rule.toEpisode !== null && episodeNumber > rule.toEpisode) return false;
  return true;
}

/**
 * Les départs qu'un départ ENTRAÎNE, selon les règles de la saison.
 *
 * Rend un tableau vide quand aucune règle ne s'applique : c'est le cas de
 * toute saison ordinaire, et le moteur ne doit rien y ajouter.
 */
export function linkedDepartures(
  ref: Referential,
  departure: Departure
): Departure[] {
  const rule = ref.season.rules.find(
    r =>
      r.kind === 'linked_pair_departure' &&
      ruleApplies(r, departure.episodeNumber)
  );
  if (!rule) return [];
  // Seule une élimination AU VOTE entraîne le binôme ; un abandon, une
  // évacuation ou un départ lui-même lié ne se propagent pas.
  if (departure.kind !== 'vote') return [];

  const partner = partnerOf(ref, departure.contestantId);
  if (!partner) return [];
  // Un binôme déjà sorti ne repart pas une seconde fois.
  if (ref.departures.some(d => d.contestantId === partner.id)) return [];

  return [
    {
      contestantId: partner.id,
      episodeNumber: departure.episodeNumber,
      kind: 'linked_pair',
      day: departure.day,
      causedById: departure.contestantId,
    },
  ];
}
