-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Publication transactionnelle — pgTAP.                                     ║
-- ║ Lancement : `npm run test:publication:remote` (ou `supabase test db`).    ║
-- ║                                                                          ║
-- ║ Ce que ces tests vérifient n'est pas que les fonctions existent, mais     ║
-- ║ qu'elles TIENNENT leur promesse : un lot s'applique en entier, une        ║
-- ║ deuxième publication est refusée, et un retour arrière repose la base     ║
-- ║ dans l'état exact d'avant — y compris en effaçant ce qui avait été créé.  ║
-- ║                                                                          ║
-- ║ TOUT EST CADRÉ SUR LA SAISON FICTIVE. La première version comptait les    ║
-- ║ lignes du schéma entier ; elle passait sur une base vide et s'est mise à  ║
-- ║ échouer le jour où une VRAIE saison a été publiée — « more than one row   ║
-- ║ returned by a subquery ». Un test qui n'est vert que sur une base neuve   ║
-- ║ ne prouve rien le jour où il compte.                                      ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(43);

-- ── Décor ─────────────────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'relecteur@exemple.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'quidam@exemple.test');

insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'validator');

insert into reference_sources (id, label, base_url)
values ('src_pub', 'Source fictive', 'https://exemple.test');

insert into source_documents (id, source_id, external_id, title, url) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'src_pub', '1',
   'Saison fictive', 'https://exemple.test/saison');

insert into seasons (id, slug, name, status, source_document_id, validation_status)
values ('cccccccc-0000-0000-0000-000000000001', 'saison-fictive', 'Saison fictive',
        'unknown', 'bbbbbbbb-0000-0000-0000-000000000001', 'pending_review');

insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 'diffed', '42');

-- Le modèle intermédiaire : c'est lui qui relie une voix à son tour.
insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'council_round',
   'saison-fictive:e1:r1',
   '{"episodeNumber":1,"roundNumber":1,"kind":"vote","eliminated":"Bastien"}');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-000000000001', 'season_contestant', 'saison-fictive:Aël',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Aël","gender":"f","age":31,"previousSeasons":["Saison 1"],"finalJury":null,"teams":[{"name":"Rouge","fromDay":1,"toDay":5},{"name":"Tribu unique","fromDay":5,"toDay":null}]}'),
  ('dddddddd-0000-0000-0000-000000000001', 'season_contestant', 'saison-fictive:Bastien',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Bastien","gender":"m","age":44,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-000000000001', 'episode', 'saison-fictive:e1',
   'insert', 'unambiguous', 'validated',
   '{"number":1,"airDate":"2026-08-25","aired":true,"comfortWinners":["Aël"],"immunityWinners":["Rouge"]}'),
  ('dddddddd-0000-0000-0000-000000000001', 'council_round', 'saison-fictive:e1:r1',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":1,"roundNumber":1,"kind":"vote","eliminated":"Bastien","reportedVotesFor":2,"reportedVotesTotal":2}'),
  ('dddddddd-0000-0000-0000-000000000001', 'council_vote', 'saison-fictive:e1:r1:Aël',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Aël","target":"Bastien","struck":false}'),
  ('dddddddd-0000-0000-0000-000000000001', 'council_round', 'saison-fictive:e1:r2',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":1,"roundNumber":2,"kind":"linked","eliminated":"Aël","causedBy":"Bastien","reportedVotesFor":0,"reportedVotesTotal":null}'),
  ('dddddddd-0000-0000-0000-000000000001', 'advantage', 'saison-fictive:collier:1',
   'insert', 'unambiguous', 'validated',
   '{"kind":"immunity_necklace","location":"Camp unique","status":"not_used","foundDay":6,"playedDay":null,"playedEpisodeNumber":null,"annulledVotes":null,"annulledVotesTotal":null,"holders":[{"name":"Aël","fromDay":6,"toDay":null,"original":true},{"name":"Bastien","fromDay":6,"toDay":null,"original":true},{"name":"Inconnue","fromDay":6,"toDay":null,"original":false}]}'),
  ('dddddddd-0000-0000-0000-000000000001', 'season', 'saison-fictive',
   'insert', 'unambiguous', 'validated',
   '{"locationName":"Île fictive (Océan imaginaire)","locationPageTitle":"Île fictive","locationLat":-12.5,"locationLon":45.25}'),
  -- Non validée : elle ne doit PAS être appliquée.
  ('dddddddd-0000-0000-0000-000000000001', 'council_vote', 'saison-fictive:e1:r1:Bastien',
   'insert', 'ambiguous', 'pending_review',
   '{"voter":"Bastien","target":"Aël","struck":false}');

insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001', 'diffed', '43');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-000000000002', 'season_contestant', 'saison-fictive:Aël',
   'update', 'retroactive', 'validated',
   '{"displayName":"Aël","gender":"f","age":32,"previousSeasons":["Saison 1"],"finalJury":null,"teams":[{"name":"Rouge","fromDay":1,"toDay":5}]}');

create or replace function devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

-- Compteurs CADRÉS sur la saison fictive : la base peut contenir de vraies
-- saisons publiées, et elles ne regardent pas ces tests.
create or replace function fictif_compte(quoi text) returns integer
language sql stable as $$
  select case quoi
    when 'participations' then
      (select count(*) from season_contestants
        where season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'personnes' then
      (select count(*) from contestants where slug like 'saison-fictive-%')
    when 'saisons_citees' then
      (select count(*) from contestant_previous_seasons cps
        join season_contestants sc on sc.id = cps.season_contestant_id
       where sc.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'episodes' then
      (select count(*) from episodes
        where season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'tours' then
      (select count(*) from council_rounds cr
        join councils c on c.id = cr.council_id
        join episodes e on e.id = c.episode_id
       where e.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'voix' then
      (select count(*) from council_votes v
        join council_rounds cr on cr.id = v.round_id
        join councils c on c.id = cr.council_id
        join episodes e on e.id = c.episode_id
       where e.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'tribus' then
      (select count(*) from teams
        where season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'appartenances' then
      (select count(*) from team_memberships tm
        join season_contestants sc on sc.id = tm.season_contestant_id
       where sc.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'epreuves' then
      (select count(*) from challenges c
        join episodes e on e.id = c.episode_id
       where e.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'resultats' then
      (select count(*) from challenge_results r
        join challenges c on c.id = r.challenge_id
        join episodes e on e.id = c.episode_id
       where e.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'colliers' then
      (select count(*) from advantages
        where season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'detenteurs' then
      (select count(*) from advantage_holders h
        join season_contestants sc on sc.id = h.season_contestant_id
       where sc.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'duos' then
      (select count(*) from pairs
        where season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'saisons_citees_total' then
      (select count(*) from contestant_previous_seasons cps
        join season_contestants sc on sc.id = cps.season_contestant_id
       where sc.season_id = 'cccccccc-0000-0000-0000-000000000001')
    when 'departs' then
      (select count(*) from departures d
        join season_contestants sc on sc.id = d.season_contestant_id
       where sc.season_id = 'cccccccc-0000-0000-0000-000000000001')
    else null
  end::integer
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Qui a le droit
-- ════════════════════════════════════════════════════════════════════════════

select devenir('aaaaaaaa-0000-0000-0000-000000000002'); -- sans rôle

select throws_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000001')$$,
  '42501',
  'publication réservée aux relecteurs',
  'un utilisateur sans rôle ne publie rien'
);

reset role;

select is(
  fictif_compte('participations'), 0,
  'et le refus n''a rien écrit'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. La publication applique le lot, et lui seul
-- ════════════════════════════════════════════════════════════════════════════

select devenir('aaaaaaaa-0000-0000-0000-000000000001'); -- relecteur

select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000001', 'premier lot')$$,
  'le relecteur publie'
);

reset role;

select is(fictif_compte('participations'), 2, 'les deux candidats validés sont publiés');

select is(fictif_compte('personnes'), 2, 'chaque participation a créé sa personne');

select is(
  (select slug from contestants where display_name = 'Aël'),
  'saison-fictive-ael',
  'l''identifiant de personne porte la saison : deux prénoms identiques ne fusionnent pas'
);

select is(fictif_compte('saisons_citees'), 1, 'les saisons citées suivent le candidat');

select is(
  fictif_compte('voix'), 1,
  'seule la voix VALIDÉE est publiée — l''ambiguë reste en attente'
);

select is(
  (select cr.outcome::text from council_rounds cr
     join councils c on c.id = cr.council_id
     join episodes e on e.id = c.episode_id
    where e.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  'elimination',
  'le genre de tour extrait devient l''issue du tour'
);

select is(
  (select d.kind::text from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and sc.display_name = 'Bastien'),
  'vote',
  'le départ découle du tour, sans règle supposée'
);

select is(
  (select count(*)::int from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and d.round_id is not null),
  1,
  'le départ porte SON TOUR : sans `round_id`, l''écran ne peut pas nommer l''éliminé'
);

select is(
  (select validation_status::text from seasons
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  'published',
  'la saison devient visible : sans cela, publier ne changerait rien pour personne'
);

select is(
  (select status::text from import_runs
    where id = 'dddddddd-0000-0000-0000-000000000001'),
  'published',
  'l''exécution est marquée publiée'
);

select is(
  (select count(*)::int from import_differences
    where run_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'published'), 8,
  'les huit différences validées sont marquées publiées'
);

select is(
  (select count(*)::int from referential_versions
    where season_id = 'cccccccc-0000-0000-0000-000000000001'), 1,
  'la version du référentiel avance — c''est elle que le client compare'
);

select is(
  (select location_name from seasons where id = 'cccccccc-0000-0000-0000-000000000001'),
  'Île fictive (Océan imaginaire)',
  'le lieu de tournage est publié avec la saison, relu comme le reste'
);

select is(
  (select location_lat from seasons where id = 'cccccccc-0000-0000-0000-000000000001'),
  -12.5::double precision,
  'et ses coordonnées avec lui'
);

select is(
  (select last_seen_revision from source_documents
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  '42',
  'le document source dit quelle révision est en ligne'
);


select is(fictif_compte('tribus'), 2, 'chaque tribu citée est créée une fois');

select is(
  (select count(*)::int from team_memberships tm
     join season_contestants sc on sc.id = tm.season_contestant_id
    where sc.display_name = 'Aël' and tm.from_day is not null),
  2,
  'les deux séjours sont publiés, avec leurs bornes en JOURS'
);

select is(
  (select tm.to_day from team_memberships tm
     join season_contestants sc on sc.id = tm.season_contestant_id
     join teams t on t.id = tm.team_id
    where sc.display_name = 'Aël' and t.name = 'Rouge'),
  5,
  'une borne fermée reste fermée'
);

select is(fictif_compte('epreuves'), 2, 'une épreuve de confort, une d''immunité');

select is(
  (select c.format::text from challenges c
     join episodes e on e.id = c.episode_id
    where e.season_id = 'cccccccc-0000-0000-0000-000000000001' and c.kind = 'comfort'),
  'individual',
  'un candidat vainqueur : épreuve individuelle'
);

select is(
  (select c.format::text from challenges c
     join episodes e on e.id = c.episode_id
    where e.season_id = 'cccccccc-0000-0000-0000-000000000001' and c.kind = 'immunity'),
  'team',
  'une TRIBU vainqueur : épreuve d''équipe — le format se déduit, il ne se suppose pas'
);

select is(fictif_compte('colliers'), 1, 'le collier est publié');

select is(
  (select string_agg(sc.display_name, ' et ' order by h.ordinal)
     from advantage_holders h
     join season_contestants sc on sc.id = h.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  'Aël et Bastien',
  'les détenteurs suivent l''ordre de la source, et le nom inconnu est écarté'
);

select is(
  (select a.status from advantages a
    where a.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  'not_used',
  'le statut est celui que l''extraction a normalisé'
);

select is(fictif_compte('duos'), 1, 'le départ lié nomme le duo');

select is(
  (select a.display_name || ' et ' || b.display_name from pairs p
     join season_contestants a on a.id = p.member_a_id
     join season_contestants b on b.id = p.member_b_id
    where p.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  'Bastien et Aël',
  'l''éliminé du vote d''abord, puis celui que son départ entraîne'
);

select is(
  (select cause.display_name from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
     join departures dc on dc.id = d.caused_by_departure_id
     join season_contestants cause on cause.id = dc.season_contestant_id
    where sc.display_name = 'Aël'),
  'Bastien',
  'le départ lié pointe la cause que L''EXTRACTION a nommée, pas une trouvée en SQL'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. On ne publie pas deux fois
-- ════════════════════════════════════════════════════════════════════════════

select devenir('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000001')$$,
  'P0001',
  null,
  'une exécution déjà publiée est refusée : appliquer deux fois le même lot doublerait tout'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3 bis. UN SECOND LOT sur le même candidat, puis son annulation
--
-- C'est l'enchaînement qui a révélé, le 05/09/2026, que la photo retenait les
-- lignes EFFACÉES d'un remplacement en bloc mais pas celles ÉCRITES. Défaire
-- le second lot reposait alors les anciennes SANS retirer les nouvelles, et
-- l'unicité (candidat, libellé) arrêtait tout.
-- ════════════════════════════════════════════════════════════════════════════

select devenir('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000002', 'second lot')$$,
  'un second lot republie le même candidat'
);

reset role;

select is(
  fictif_compte('saisons_citees'), 1,
  'les saisons citées sont REMPLACÉES, pas doublées'
);

select is(
  (select age_at_season from season_contestants
    where season_id = 'cccccccc-0000-0000-0000-000000000001'
      and display_name = 'Aël'),
  32,
  'la correction rétroactive est appliquée'
);

select devenir('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$select revert_publication(
      (select id from publications
        where run_id = 'dddddddd-0000-0000-0000-000000000001'
        order by rang desc limit 1),
      'dans le désordre')$$,
  'P0001',
  null,
  'on refuse de défaire une publication tant qu''une plus récente est active'
);

select lives_ok(
  $$select revert_publication(
      (select id from publications
        where run_id = 'dddddddd-0000-0000-0000-000000000002'
        order by rang desc limit 1),
      'correction contestée')$$,
  'le second lot s''annule'
);

reset role;

select is(
  fictif_compte('saisons_citees'), 1,
  'après annulation, une seule saison citée — ni doublon ni disparition'
);

select is(
  (select age_at_season from season_contestants
    where season_id = 'cccccccc-0000-0000-0000-000000000001'
      and display_name = 'Aël'),
  31,
  'et le candidat retrouve son âge d''avant'
);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Le retour arrière repose la base
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select revert_publication(
      (select id from publications
        where run_id = 'dddddddd-0000-0000-0000-000000000001'
        order by published_at desc limit 1),
      'décompte contesté')$$,
  'le relecteur annule la publication'
);

reset role;

select is(
  fictif_compte('participations') + fictif_compte('voix') + fictif_compte('tours')
    + fictif_compte('departs') + fictif_compte('episodes')
    + fictif_compte('tribus') + fictif_compte('appartenances')
    + fictif_compte('epreuves') + fictif_compte('resultats')
    + fictif_compte('colliers') + fictif_compte('detenteurs')
    + fictif_compte('duos'),
  0,
  'tout ce qui avait été créé a disparu — la photo servait à cela'
);

select is(
  (select validation_status::text from seasons
    where id = 'cccccccc-0000-0000-0000-000000000001'),
  'pending_review',
  'la saison redevient invisible, exactement comme avant'
);

select is(
  (select location_name from seasons where id = 'cccccccc-0000-0000-0000-000000000001'),
  null,
  'le lieu disparaît avec le retour arrière : la saison n''est photographiée qu''une fois'
);

select is(
  (select count(*)::int from import_differences
    where run_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'validated'), 8,
  'les différences redeviennent validées : c''est leur application qui a été jugée mauvaise, pas elles'
);

select * from finish();
rollback;
