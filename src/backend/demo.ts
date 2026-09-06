/**
 * ══════════════════════════════════════════════════════════════════════════
 *  DONNÉE FICTIVE DE DÉMONSTRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aucun de ces prénoms ne désigne une personne réelle ; aucune de ces soirées
 * n'a eu lieu. Ce référentiel existe pour que l'application DÉMARRE SANS
 * CONFIGURATION — hors ligne, sans compte, sur la page publique — et pour que
 * les tests du cœur métier aient de la matière.
 *
 * Il est construit pour exercer les cas difficiles que la vraie source
 * présente : une égalité suivie d'un second tour, un départ de binôme à zéro
 * voix, un épisode annoncé mais non diffusé. Rien ici n'est « officiel », et
 * l'interface l'affiche.
 */
import { type Referential, ReferentialSchema } from '../domain/referential';

const raw = {
  season: {
    id: 'demo-season',
    slug: 'demo',
    name: 'Saison de démonstration',
    editionLabel: 'Donnée fictive de démonstration',
    status: 'airing',
    rules: [
      {
        kind: 'linked_pair_departure',
        label: 'Destins liés : le binôme suit l’éliminé',
        fromEpisode: null,
        toEpisode: null,
      },
    ],
    // Un lieu inventé, posé au large pour que la carte ait quelque chose à
    // montrer sans désigner un endroit réel de tournage.
    location: {
      name: 'Île fictive (Océan imaginaire)',
      pageTitle: null,
      lat: -12.5,
      lon: 45.25,
    },
  },
  contestants: [
    {
      id: 'c-ael',
      displayName: 'Aël',
      gender: 'f',
      age: 31,
      previousSeasons: ['Saison fictive 3'],
      teamId: 't-unique',
      pairId: 'p-1',
    },
    {
      id: 'c-bastien',
      displayName: 'Bastien',
      gender: 'm',
      age: 35,
      previousSeasons: ['Saison fictive 3'],
      teamId: 't-unique',
      pairId: 'p-1',
    },
    {
      id: 'c-celeste',
      displayName: 'Céleste',
      gender: 'f',
      age: 28,
      previousSeasons: ['Saison fictive 7'],
      teamId: 't-unique',
      pairId: 'p-2',
    },
    {
      id: 'c-dimitri',
      displayName: 'Dimitri',
      gender: 'm',
      age: 42,
      previousSeasons: ['Saison fictive 7', 'Saison fictive 12'],
      teamId: 't-unique',
      pairId: 'p-2',
    },
    {
      id: 'c-elouan',
      displayName: 'Elouan',
      gender: 'm',
      age: 26,
      previousSeasons: ['Saison fictive 9'],
      teamId: 't-unique',
      pairId: 'p-3',
    },
    {
      id: 'c-fanny',
      displayName: 'Fanny',
      gender: 'f',
      age: 33,
      previousSeasons: ['Saison fictive 9'],
      teamId: 't-unique',
      pairId: 'p-3',
    },
    {
      id: 'c-gael',
      displayName: 'Gaël',
      gender: 'm',
      age: 39,
      previousSeasons: ['Saison fictive 5'],
      teamId: 't-unique',
      pairId: 'p-4',
    },
    {
      id: 'c-hina',
      displayName: 'Hina',
      gender: 'f',
      age: 30,
      previousSeasons: ['Saison fictive 5'],
      teamId: 't-unique',
      pairId: 'p-4',
    },
  ],
  teams: [{ id: 't-unique', name: 'Tribu unique', colour: null }],
  // Un duo n'est connu que lorsqu'un départ le révèle : les deux premiers
  // sont encore en jeu, donc rien à révéler.
  pairs: [
    { id: 'p-1', memberIds: ['c-ael', 'c-bastien'], revealEpisodeNumber: null },
    {
      id: 'p-2',
      memberIds: ['c-celeste', 'c-dimitri'],
      revealEpisodeNumber: 2,
    },
    {
      id: 'p-3',
      memberIds: ['c-elouan', 'c-fanny'],
      revealEpisodeNumber: null,
    },
    { id: 'p-4', memberIds: ['c-gael', 'c-hina'], revealEpisodeNumber: 1 },
  ],
  episodes: [
    {
      id: 'e1',
      number: 1,
      airDate: '2026-08-25',
      aired: true,
      comfortWinnerIds: ['c-ael', 'c-bastien'],
      immunityWinnerIds: ['c-celeste', 'c-dimitri'],
    },
    {
      id: 'e2',
      number: 2,
      airDate: '2026-09-01',
      aired: true,
      comfortWinnerIds: ['c-elouan', 'c-fanny'],
      immunityWinnerIds: ['c-ael', 'c-bastien'],
    },
    {
      id: 'e3',
      number: 3,
      airDate: '2026-09-08',
      aired: false,
      comfortWinnerIds: [],
      immunityWinnerIds: [],
    },
  ],
  rounds: [
    // Épisode 1 : égalité au premier tour (annulé), second tour, puis binôme.
    {
      id: 'r-e1-1',
      episodeNumber: 1,
      roundNumber: 1,
      kind: 'annulled',
      eliminatedId: null,
      reportedVotesFor: null,
      reportedVotesTotal: null,
      votesComplete: true,
    },
    {
      id: 'r-e1-2',
      episodeNumber: 1,
      roundNumber: 2,
      kind: 'vote',
      eliminatedId: 'c-gael',
      reportedVotesFor: 5,
      reportedVotesTotal: 7,
      votesComplete: true,
    },
    {
      id: 'r-e1-3',
      episodeNumber: 1,
      roundNumber: 3,
      kind: 'linked',
      eliminatedId: 'c-hina',
      reportedVotesFor: 0,
      reportedVotesTotal: null,
      votesComplete: true,
    },
    // Épisode 2 : un seul tour, puis binôme.
    {
      id: 'r-e2-1',
      episodeNumber: 2,
      roundNumber: 1,
      kind: 'vote',
      eliminatedId: 'c-dimitri',
      reportedVotesFor: 4,
      reportedVotesTotal: 5,
      votesComplete: true,
    },
    {
      id: 'r-e2-2',
      episodeNumber: 2,
      roundNumber: 2,
      kind: 'linked',
      eliminatedId: 'c-celeste',
      reportedVotesFor: 0,
      reportedVotesTotal: null,
      votesComplete: true,
    },
  ],
  votes: [
    // Tour annulé : 4-4 entre Gaël et Fanny — toutes les voix sont barrées.
    { roundId: 'r-e1-1', voterId: 'c-ael', targetId: 'c-gael', struck: true },
    {
      roundId: 'r-e1-1',
      voterId: 'c-bastien',
      targetId: 'c-gael',
      struck: true,
    },
    {
      roundId: 'r-e1-1',
      voterId: 'c-celeste',
      targetId: 'c-gael',
      struck: true,
    },
    {
      roundId: 'r-e1-1',
      voterId: 'c-dimitri',
      targetId: 'c-gael',
      struck: true,
    },
    {
      roundId: 'r-e1-1',
      voterId: 'c-elouan',
      targetId: 'c-fanny',
      struck: true,
    },
    { roundId: 'r-e1-1', voterId: 'c-fanny', targetId: 'c-gael', struck: true },
    { roundId: 'r-e1-1', voterId: 'c-gael', targetId: 'c-fanny', struck: true },
    { roundId: 'r-e1-1', voterId: 'c-hina', targetId: 'c-fanny', struck: true },
    // Second tour : Gaël 5, Fanny 2 (les deux ex æquo ne votent pas).
    { roundId: 'r-e1-2', voterId: 'c-ael', targetId: 'c-gael', struck: false },
    {
      roundId: 'r-e1-2',
      voterId: 'c-bastien',
      targetId: 'c-gael',
      struck: false,
    },
    {
      roundId: 'r-e1-2',
      voterId: 'c-celeste',
      targetId: 'c-gael',
      struck: false,
    },
    {
      roundId: 'r-e1-2',
      voterId: 'c-dimitri',
      targetId: 'c-gael',
      struck: false,
    },
    {
      roundId: 'r-e1-2',
      voterId: 'c-elouan',
      targetId: 'c-fanny',
      struck: false,
    },
    {
      roundId: 'r-e1-2',
      voterId: 'c-hina',
      targetId: 'c-fanny',
      struck: false,
    },
    {
      roundId: 'r-e1-2',
      voterId: 'c-fanny',
      targetId: 'c-gael',
      struck: false,
    },
    // Épisode 2 : Dimitri 4, Aël 1 (Aël et Bastien immunisés ne sont pas visés).
    {
      roundId: 'r-e2-1',
      voterId: 'c-ael',
      targetId: 'c-dimitri',
      struck: false,
    },
    {
      roundId: 'r-e2-1',
      voterId: 'c-bastien',
      targetId: 'c-dimitri',
      struck: false,
    },
    {
      roundId: 'r-e2-1',
      voterId: 'c-celeste',
      targetId: 'c-elouan',
      struck: false,
    },
    {
      roundId: 'r-e2-1',
      voterId: 'c-dimitri',
      targetId: 'c-elouan',
      struck: false,
    },
    {
      roundId: 'r-e2-1',
      voterId: 'c-elouan',
      targetId: 'c-dimitri',
      struck: false,
    },
    {
      roundId: 'r-e2-1',
      voterId: 'c-fanny',
      targetId: 'c-dimitri',
      struck: false,
    },
  ],
  departures: [
    {
      contestantId: 'c-gael',
      episodeNumber: 1,
      kind: 'vote',
      day: 3,
      causedById: null,
    },
    {
      contestantId: 'c-hina',
      episodeNumber: 1,
      kind: 'linked_pair',
      day: 3,
      causedById: 'c-gael',
    },
    {
      contestantId: 'c-dimitri',
      episodeNumber: 2,
      kind: 'vote',
      day: 6,
      causedById: null,
    },
    {
      contestantId: 'c-celeste',
      episodeNumber: 2,
      kind: 'linked_pair',
      day: 6,
      causedById: 'c-dimitri',
    },
  ],
  provenance: {
    kind: 'demo',
    label: 'Donnée fictive de démonstration',
    title: null,
    url: null,
    revision: null,
    fetchedAt: null,
    version: 0,
  },
};

/** Validé à la frontière, comme n'importe quelle autre source. */
export const DEMO_REFERENTIAL: Referential = ReferentialSchema.parse(raw);
