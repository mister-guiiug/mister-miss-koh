-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Publication transactionnelle — pgTAP.                                     ║
-- ║ Lancement : `npm run test:publication:remote` (ou `supabase test db`).    ║
-- ║                                                                          ║
-- ║ Ce que ces tests vérifient n'est pas que les fonctions existent, mais     ║
-- ║ qu'elles TIENNENT leur promesse : un lot s'applique en entier, une        ║
-- ║ deuxième publication est refusée, et un retour arrière repose la base     ║
-- ║ dans l'état exact d'avant — y compris en effaçant ce qui avait été créé.  ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(19);

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
   '{"displayName":"Aël","gender":"f","age":31,"previousSeasons":["Saison 1"],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-000000000001', 'season_contestant', 'saison-fictive:Bastien',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Bastien","gender":"m","age":44,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-000000000001', 'episode', 'saison-fictive:e1',
   'insert', 'unambiguous', 'validated',
   '{"number":1,"airDate":"2026-08-25","aired":true}'),
  ('dddddddd-0000-0000-0000-000000000001', 'council_round', 'saison-fictive:e1:r1',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":1,"roundNumber":1,"kind":"vote","eliminated":"Bastien","reportedVotesFor":2,"reportedVotesTotal":2}'),
  ('dddddddd-0000-0000-0000-000000000001', 'council_vote', 'saison-fictive:e1:r1:Aël',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Aël","target":"Bastien","struck":false}'),
  -- Non validée : elle ne doit PAS être appliquée.
  ('dddddddd-0000-0000-0000-000000000001', 'council_vote', 'saison-fictive:e1:r1:Bastien',
   'insert', 'ambiguous', 'pending_review',
   '{"voter":"Bastien","target":"Aël","struck":false}');

create or replace function devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

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

select is(
  (select count(*)::int from season_contestants), 0,
  'et le refus n''a rien écrit'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. La publication applique le lot, et lui seul
-- ════════════════════════════════════════════════════════════════════════════

reset role;
select devenir('aaaaaaaa-0000-0000-0000-000000000001'); -- relecteur

select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000001', 'premier lot')$$,
  'le relecteur publie'
);

reset role;

select is(
  (select count(*)::int from season_contestants
   where season_id = 'cccccccc-0000-0000-0000-000000000001'), 2,
  'les deux candidats validés sont publiés'
);

select is(
  (select count(*)::int from contestants), 2,
  'chaque participation a créé sa personne'
);

select is(
  (select slug from contestants where display_name = 'Aël'),
  'saison-fictive-ael',
  'l''identifiant de personne porte la saison : deux prénoms identiques ne fusionnent pas'
);

select is(
  (select count(*)::int from contestant_previous_seasons), 1,
  'les saisons citées suivent le candidat'
);

select is(
  (select count(*)::int from council_votes), 1,
  'seule la voix VALIDÉE est publiée — l''ambiguë reste en attente'
);

select is(
  (select outcome::text from council_rounds), 'elimination',
  'le genre de tour extrait devient l''issue du tour'
);

select is(
  (select kind::text from departures d
    join season_contestants sc on sc.id = d.season_contestant_id
   where sc.display_name = 'Bastien'),
  'vote',
  'le départ découle du tour, sans règle supposée'
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
    where run_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'published'), 5,
  'les cinq différences validées sont marquées publiées'
);

select is(
  (select count(*)::int from referential_versions
    where season_id = 'cccccccc-0000-0000-0000-000000000001'), 1,
  'la version du référentiel avance — c''est elle que le client compare'
);

-- ════════════════════════════════════════════════════════════════════════════
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
-- 4. Le retour arrière repose la base
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select revert_publication(
      (select id from publications limit 1), 'décompte contesté')$$,
  'le relecteur annule la publication'
);

reset role;

select is(
  (select count(*)::int from season_contestants) +
  (select count(*)::int from council_votes) +
  (select count(*)::int from council_rounds) +
  (select count(*)::int from departures) +
  (select count(*)::int from episodes),
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
  (select count(*)::int from import_differences
    where run_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'validated'), 5,
  'les différences redeviennent validées : c''est leur application qui a été jugée mauvaise, pas elles'
);

select * from finish();
rollback;
