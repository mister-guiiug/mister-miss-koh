/**
 * ══════════════════════════════════════════════════════════════════════════
 *  DONNÉE FICTIVE — une saison bâtie sur la FORME d'All Stars (23/09/2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aucun de ces prénoms ne désigne une personne réelle. La forme, elle, est
 * celle de la vraie page : des duos dans une tribu unique jusqu'au jour 9, puis
 * deux tribus — une jaune, une rouge —, un éliminé qui revient par l'arène, une
 * éliminée qui revient puis ressort, un banni battu à l'arène.
 *
 *   épisode :    1     2     3     4     5     6
 *   conseil :  j. 3  j. 6  j. 8  j. 11 j. 14  (à venir)
 *
 *   Aurore   Tribu unique (1 – 9), Jaune (9 – )             en jeu
 *   Victor   Tribu unique (1 – ),  Jaune (9 – )             en jeu, deux séjours ouverts
 *   Maël     Tribu unique (1 – 3), Rouge (9 – )             sorti ép. 1, REVENU ép. 4
 *   Chloé    Tribu unique (1 – 8), Jaune (9 – 14)           sortie ép. 3, revenue ép. 4, RESSORTIE ép. 5
 *   Jonas    Tribu unique (1 – 8)                           sorti ép. 3, battu à l'arène ép. 4
 *   Ugo      Tribu unique (1 – 9), Rouge (9 – )             en jeu
 */
import { type Referential, ReferentialSchema } from '../domain/referential';

const stint = (
  teamId: string,
  fromDay: number,
  toDay: number | null = null
) => ({
  teamId,
  fromDay,
  toDay,
});

const contestant = (
  id: string,
  displayName: string,
  gender: 'f' | 'm',
  teamStints: ReturnType<typeof stint>[],
  pairId: string | null = null
) => ({
  id,
  displayName,
  gender,
  age: 30,
  previousSeasons: [],
  teamStints,
  pairId,
});

const episode = (number: number, councilDay: number | null, aired = true) => ({
  id: `e${number}`,
  number,
  airDate: `2026-09-${String(number).padStart(2, '0')}`,
  aired,
  councilDay,
  comfortWinnerIds: [],
  immunityWinnerIds: [],
});

export const SAISON_AUX_TRIBUS: Referential = ReferentialSchema.parse({
  season: {
    id: 'saison-tribus',
    slug: 'saison-tribus',
    name: 'Saison fictive aux deux tribus',
    editionLabel: 'Donnée fictive',
    status: 'airing',
    rules: [
      {
        kind: 'linked_pair_departure',
        label: 'Destins liés',
        fromEpisode: null,
        toEpisode: null,
      },
    ],
  },
  contestants: [
    contestant('c-aurore', 'Aurore', 'f', [
      stint('t-unique', 1, 9),
      stint('t-jaune', 9),
    ]),
    contestant('c-victor', 'Victor', 'm', [
      stint('t-unique', 1),
      stint('t-jaune', 9),
    ]),
    contestant('c-mael', 'Maël', 'm', [
      stint('t-unique', 1, 3),
      stint('t-rouge', 9),
    ]),
    contestant(
      'c-chloe',
      'Chloé',
      'f',
      [stint('t-unique', 1, 8), stint('t-jaune', 9, 14)],
      'p-1'
    ),
    contestant('c-jonas', 'Jonas', 'm', [stint('t-unique', 1, 8)], 'p-1'),
    contestant('c-ugo', 'Ugo', 'm', [
      stint('t-unique', 1, 9),
      stint('t-rouge', 9),
    ]),
  ],
  teams: [
    { id: 't-unique', name: 'Tribu unique', colour: '#ffffff' },
    { id: 't-jaune', name: 'Kalima', colour: '#fee347' },
    { id: 't-rouge', name: 'Sorako', colour: '#fc5d5d' },
  ],
  pairs: [
    { id: 'p-1', memberIds: ['c-chloe', 'c-jonas'], revealEpisodeNumber: 3 },
  ],
  episodes: [
    episode(1, 3),
    episode(2, 6),
    episode(3, 8),
    episode(4, 11),
    episode(5, 14),
    episode(6, null, false),
  ],
  rounds: [],
  votes: [],
  departures: [
    {
      contestantId: 'c-mael',
      episodeNumber: 1,
      kind: 'vote',
      day: null,
      causedById: null,
    },
    {
      contestantId: 'c-jonas',
      episodeNumber: 3,
      kind: 'vote',
      day: null,
      causedById: null,
    },
    {
      contestantId: 'c-chloe',
      episodeNumber: 3,
      kind: 'linked_pair',
      day: null,
      causedById: 'c-jonas',
    },
    // L'arène : zéro voix, et rien ne la cause.
    {
      contestantId: 'c-jonas',
      episodeNumber: 4,
      kind: 'other',
      day: null,
      causedById: null,
    },
    {
      contestantId: 'c-chloe',
      episodeNumber: 5,
      kind: 'vote',
      day: null,
      causedById: null,
    },
  ],
  provenance: {
    kind: 'demo',
    label: 'Donnée fictive',
    title: null,
    url: null,
    revision: null,
    fetchedAt: null,
    version: 0,
  },
});
