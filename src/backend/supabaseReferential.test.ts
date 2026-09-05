import { describe, expect, it } from 'vitest';
import {
  createSupabaseRepository,
  mapReferential,
  NoPublishedSeason,
  type Rows,
} from './supabaseReferential';
import { DEMO_REFERENTIAL } from './demo';

// Lignes de fantaisie, dans la forme exacte que PostgREST rend — aucun nom
// réel. Elles reproduisent les cas difficiles : égalité puis second tour,
// départ de binôme, épisode futur, binôme vainqueur d'une épreuve.
const rows: Rows = {
  season: {
    id: 's1',
    slug: 'fictive',
    name: 'Saison fictive',
    edition_label: null,
    status: 'airing',
    source_document_id: 'doc1',
    season_rules: [
      {
        kind: 'linked_pair_departure',
        label: 'Destins liés',
        from_episode_number: null,
        to_episode_number: null,
      },
      {
        kind: 'quelque_chose_de_nouveau',
        label: 'inconnu',
        from_episode_number: null,
        to_episode_number: null,
      },
    ],
  },
  contestants: [
    {
      id: 'sc-a',
      contestant_id: 'p-a',
      display_name: 'Aël',
      age_at_season: 31,
      final_jury: null,
      contestants: { gender: 'f' },
      contestant_previous_seasons: [
        { label: 'Deuxième', ordinal: 1 },
        { label: 'Première', ordinal: 0 },
      ],
      team_memberships: [
        { team_id: 't-rouge', from_episode_number: 1, from_day: 1 },
        { team_id: 't-unique', from_episode_number: 5, from_day: 12 },
      ],
    },
    {
      id: 'sc-b',
      contestant_id: 'p-b',
      display_name: 'Bastien',
      age_at_season: null,
      final_jury: null,
      contestants: { gender: 'x' },
      contestant_previous_seasons: [],
      team_memberships: [],
    },
    {
      id: 'sc-c',
      contestant_id: 'p-c',
      display_name: 'Céleste',
      age_at_season: 28,
      final_jury: null,
      contestants: null,
      contestant_previous_seasons: [],
      team_memberships: [],
    },
    {
      id: 'sc-d',
      contestant_id: 'p-d',
      display_name: 'Dimitri',
      age_at_season: 42,
      final_jury: null,
      contestants: { gender: 'm' },
      contestant_previous_seasons: [],
      team_memberships: [],
    },
  ],
  teams: [
    { id: 't-rouge', name: 'Rouge', colour: '#c00' },
    { id: 't-unique', name: 'Tribu unique', colour: null },
  ],
  pairs: [
    { id: 'pair-1', member_a_id: 'sc-a', member_b_id: 'sc-b' },
    { id: 'pair-2', member_a_id: 'sc-c', member_b_id: 'sc-d' },
  ],
  episodes: [
    {
      id: 'e1',
      number: 1,
      air_date: '2026-08-25',
      challenges: [
        {
          kind: 'comfort',
          challenge_results: [
            {
              season_contestant_id: null,
              pair_id: 'pair-1',
              team_id: null,
              is_winner: true,
            },
          ],
        },
        {
          kind: 'immunity',
          challenge_results: [
            {
              season_contestant_id: 'sc-c',
              pair_id: null,
              team_id: null,
              is_winner: true,
            },
            {
              season_contestant_id: 'sc-d',
              pair_id: null,
              team_id: null,
              is_winner: false,
            },
            {
              season_contestant_id: null,
              pair_id: null,
              team_id: 't-rouge',
              is_winner: true,
            },
          ],
        },
      ],
      councils: [
        {
          id: 'c1',
          council_rounds: [
            {
              id: 'r1',
              round_number: 1,
              outcome: 'tie',
              reported_votes_for: null,
              reported_votes_total: null,
              votes_complete: true,
              council_votes: [
                { voter_id: 'sc-a', target_id: 'sc-d', is_annulled: true },
                { voter_id: 'sc-c', target_id: 'sc-b', is_annulled: true },
              ],
            },
            {
              id: 'r2',
              round_number: 2,
              outcome: 'elimination',
              reported_votes_for: 2,
              reported_votes_total: 3,
              votes_complete: false,
              council_votes: [
                { voter_id: 'sc-a', target_id: 'sc-d', is_annulled: false },
                { voter_id: 'sc-b', target_id: 'sc-d', is_annulled: false },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'e2',
      number: 2,
      air_date: '2099-01-01',
      challenges: [],
      councils: [],
    },
    { id: 'e3', number: 3, air_date: null, challenges: [], councils: [] },
  ],
  departures: [
    {
      id: 'd1',
      season_contestant_id: 'sc-d',
      episode_id: 'e1',
      round_id: 'r2',
      kind: 'vote',
      day: 3,
      caused_by_departure_id: null,
    },
    {
      id: 'd2',
      season_contestant_id: 'sc-c',
      episode_id: 'e1',
      round_id: null,
      kind: 'linked_pair',
      day: 3,
      caused_by_departure_id: 'd1',
    },
  ],
  advantages: [
    {
      id: 'adv-1',
      kind: 'immunity_necklace',
      label: 'Camp unique',
      status: 'not_used',
      found_day: 6,
      played_episode_id: null,
      advantage_holders: [
        { season_contestant_id: 'sc-b', ordinal: 1 },
        { season_contestant_id: 'sc-a', ordinal: 0 },
      ],
    },
    {
      id: 'adv-2',
      kind: 'immunity_necklace',
      label: 'Camp des Rouge',
      status: 'used',
      found_day: 2,
      played_episode_id: 'e1',
      advantage_holders: [{ season_contestant_id: 'sc-c', ordinal: 0 }],
    },
  ],
  version: 7,
  provenance: {
    url: 'https://exemple.test/page',
    last_seen_revision: '239179934',
    last_seen_at: '2026-09-05T08:00:00Z',
    reference_sources: { label: 'Wikipédia (fr)' },
  },
};

const TODAY = '2026-09-05';

describe('mapReferential', () => {
  const ref = mapReferential(rows, TODAY);

  it('valide les lignes à la frontière : une forme inattendue est refusée, pas réparée', () => {
    expect(() =>
      mapReferential({ ...rows, season: { id: 's1' } }, TODAY)
    ).toThrow();
  });

  it('ne garde que les règles connues, et les rend sous la forme de l’app', () => {
    expect(ref.season.rules).toEqual([
      {
        kind: 'linked_pair_departure',
        label: 'Destins liés',
        fromEpisode: null,
        toEpisode: null,
      },
    ]);
  });

  it('candidats : genre inconnu → null, saisons passées dans l’ordre, dernière tribu, binôme', () => {
    const ael = ref.contestants.find(c => c.id === 'sc-a');
    expect(ael?.gender).toBe('f');
    expect(ael?.previousSeasons).toEqual(['Première', 'Deuxième']);
    expect(ael?.teamId).toBe('t-unique');
    expect(ael?.pairId).toBe('pair-1');
    // « x » n'est pas un genre reconnu : null, pas une invention.
    expect(ref.contestants.find(c => c.id === 'sc-b')?.gender).toBeNull();
    expect(ref.contestants.find(c => c.id === 'sc-c')?.gender).toBeNull();
  });

  it('un binôme vainqueur d’une épreuve donne DEUX gagnants ; un perdant n’en donne aucun', () => {
    const e1 = ref.episodes[0];
    expect(new Set(e1?.comfortWinnerIds)).toEqual(new Set(['sc-a', 'sc-b']));
    expect(e1?.immunityWinnerIds).toEqual(['sc-c']);
  });

  it('un avantage porte ses détenteurs DANS L’ORDRE de la source', () => {
    const collier = ref.advantages.find(a => a.id === 'adv-1');
    expect(collier?.holderIds).toEqual(['sc-a', 'sc-b']);
    expect(collier?.foundDay).toBe(6);
    expect(collier?.status).toBe('not_used');
  });

  it('un avantage joué se révèle à SON épisode ; sinon au dernier diffusé', () => {
    // La source ne date la découverte qu'en jours, et rien ne traduit un jour
    // en épisode : garder le dernier diffusé ne révèle rien à qui n'est pas
    // déjà à jour.
    expect(
      ref.advantages.find(a => a.id === 'adv-2')?.playedEpisodeNumber
    ).toBe(1);
    expect(
      ref.advantages.find(a => a.id === 'adv-2')?.revealEpisodeNumber
    ).toBe(1);
    expect(
      ref.advantages.find(a => a.id === 'adv-1')?.playedEpisodeNumber
    ).toBeNull();
    expect(
      ref.advantages.find(a => a.id === 'adv-1')?.revealEpisodeNumber
    ).toBe(1);
  });

  it('une TRIBU vainqueur est nommée, jamais dépliée en ses membres', () => {
    // Déplier demanderait de savoir qui en faisait partie ce soir-là : les
    // appartenances sont datées en jours, les épisodes ne le sont pas.
    const e1 = ref.episodes[0];
    expect(e1?.immunityWinnerTeamIds).toEqual(['t-rouge']);
    expect(e1?.comfortWinnerTeamIds).toEqual([]);
    expect(e1?.immunityWinnerIds).not.toContain('sc-a');
  });

  it('la tribu courante est la plus récente EN JOURS, pas en épisodes', () => {
    // La source date la colonne « Tribu » en jours ; l'épisode y est nul.
    expect(ref.contestants.find(c => c.id === 'sc-a')?.teamId).toBe('t-unique');
  });

  it('diffusé = documenté, ou daté dans le passé ; jamais une date seule dans le futur', () => {
    expect(ref.episodes[0]?.aired).toBe(true);
    expect(ref.episodes[1]?.aired).toBe(false); // 2099, rien de renseigné
    expect(ref.episodes[2]?.aired).toBe(false); // sans date, rien de renseigné
  });

  it('égalité → tour annulé ; élimination → tour de vote avec son éliminé', () => {
    const r1 = ref.rounds.find(r => r.id === 'r1');
    const r2 = ref.rounds.find(r => r.id === 'r2');
    expect(r1?.kind).toBe('annulled');
    expect(r1?.eliminatedId).toBeNull();
    expect(r2?.kind).toBe('vote');
    expect(r2?.eliminatedId).toBe('sc-d');
    expect(r2?.votesComplete).toBe(false);
  });

  it('un départ de binôme devient un tour synthétique à ZÉRO voix, certain, numéroté après', () => {
    const linked = ref.rounds.find(r => r.kind === 'linked');
    expect(linked).toMatchObject({
      episodeNumber: 1,
      roundNumber: 3,
      eliminatedId: 'sc-c',
      reportedVotesFor: 0,
      reportedVotesTotal: null,
      votesComplete: true,
    });
  });

  it('les voix barrées viennent de `is_annulled`', () => {
    const struck = ref.votes.filter(v => v.struck);
    expect(struck).toHaveLength(2);
    expect(struck.every(v => v.roundId === 'r1')).toBe(true);
  });

  it('un départ lié pointe vers le CANDIDAT qui l’a causé, pas vers un identifiant de départ', () => {
    const celeste = ref.departures.find(d => d.contestantId === 'sc-c');
    expect(celeste).toEqual({
      contestantId: 'sc-c',
      episodeNumber: 1,
      kind: 'linked_pair',
      day: 3,
      causedById: 'sc-d',
    });
  });

  it('la provenance dit la source, la révision et la version — et rien sur une licence', () => {
    expect(ref.provenance).toEqual({
      kind: 'wikipedia',
      label: 'Wikipédia (fr)',
      url: 'https://exemple.test/page',
      revision: '239179934',
      fetchedAt: '2026-09-05T08:00:00Z',
      version: 7,
    });
  });
});

describe('createSupabaseRepository — les trois origines', () => {
  const noop = {
    readCache: () => null,
    writeCache: () => undefined,
    today: () => TODAY,
  };

  it('serveur : la donnée est mappée, mise en cache, et annoncée comme venant du serveur', async () => {
    const written: unknown[] = [];
    const repo = createSupabaseRepository({
      ...noop,
      getClient: () => Promise.resolve(fakeClient(rows) as never),
      writeCache: r => {
        written.push(r);
      },
    });
    const result = await repo.load();
    expect(result.origin).toBe('server');
    expect(result.notice).toBeUndefined();
    expect(written).toHaveLength(1);
  });

  it('aucune saison publiée : la démonstration, et un avis qui le dit', async () => {
    const repo = createSupabaseRepository({
      ...noop,
      getClient: () => Promise.reject(new NoPublishedSeason()),
    });
    const result = await repo.load();
    expect(result.origin).toBe('demo');
    expect(result.referential).toBe(DEMO_REFERENTIAL);
    expect(result.notice).toMatch(/aucune saison/);
  });

  it('serveur injoignable avec un cache : le cache, annoncé comme tel', async () => {
    const cached = mapReferential(rows, TODAY);
    const repo = createSupabaseRepository({
      ...noop,
      getClient: () => Promise.reject(new Error('réseau')),
      readCache: () => cached,
    });
    const result = await repo.load();
    expect(result.origin).toBe('cache');
    expect(result.referential).toBe(cached);
  });

  it('serveur injoignable SANS cache : l’erreur remonte, rien n’est inventé', async () => {
    const repo = createSupabaseRepository({
      ...noop,
      getClient: () => Promise.reject(new Error('réseau')),
    });
    await expect(repo.load()).rejects.toThrow('réseau');
  });
});

/**
 * Un client de fantaisie qui rend les lignes attendues quelle que soit la
 * table, en imitant le chaînage de PostgREST. Le test ne vérifie pas les
 * requêtes — c'est le mappage qui est sous test, et le réseau ne l'est pas.
 *
 * CHAQUE `from()` CAPTURE SA DONNÉE. La première version partageait une
 * variable entre les appels : `Promise.all` lance six requêtes AVANT d'en
 * attendre une seule, et toutes lisaient alors la valeur de la dernière.
 */
function fakeClient(fixture: Rows) {
  const tables: Record<string, unknown> = {
    seasons: fixture.season,
    season_contestants: fixture.contestants,
    teams: fixture.teams,
    pairs: fixture.pairs,
    episodes: fixture.episodes,
    referential_versions: { id: fixture.version },
    source_documents: fixture.provenance,
    departures: fixture.departures,
  };
  return {
    from(table: string) {
      const data = tables[table];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = () => Promise.resolve({ data, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve);
      return chain;
    },
  };
}
