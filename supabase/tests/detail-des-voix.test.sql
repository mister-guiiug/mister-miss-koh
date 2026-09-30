-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Le détail des voix complet (0038) : pgTAP.                                ║
-- ║ Lancement : `supabase test db` (CI : workflow « Supabase tests »).        ║
-- ║                                                                          ║
-- ║ `votes_complete` n'est plus une colonne que personne n'écrit : il se      ║
-- ║ recalcule à chaque écriture d'un tour ou d'une voix. Ce qui est vérifié : ║
-- ║ la publication, le RETOUR ARRIÈRE (la raison d'être du déclencheur), les  ║
-- ║ deux façons dont la source compte un total, le poids d'un vote double,    ║
-- ║ la cible inconnue, et qu'une valeur écrite à la main ne tient pas.        ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'relecteur-complet@exemple.test');
insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'validator');

insert into reference_sources (id, label, base_url)
values ('src_complet', 'Source fictive', 'https://exemple.test');
insert into source_documents (id, source_id, external_id, title, url) values
  ('bbbbbbbb-0000-0000-0000-0000000000d2', 'src_complet', '3',
   'Saison complète', 'https://exemple.test/complete');
insert into seasons (id, slug, name, status, source_document_id, validation_status)
values ('cccccccc-0000-0000-0000-0000000000d2', 'saison-complete', 'Saison complète',
        'airing', 'bbbbbbbb-0000-0000-0000-0000000000d2', 'pending_review');

-- Premier lot : le tour annonce 4 voix, mais le bulletin de Bérénice manque.
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000d2',
        'bbbbbbbb-0000-0000-0000-0000000000d2', 'diffed', '100');
insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'council_round', 'saison-complete:e6:r1',
   '{"episodeNumber":6,"roundNumber":1,"kind":"vote","eliminated":"Aëlle"}');
insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'season_contestant', 'saison-complete:Aëlle',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Aëlle","gender":"f","age":30,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'season_contestant', 'saison-complete:Bérénice',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Bérénice","gender":"f","age":41,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'season_contestant', 'saison-complete:Côme',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Côme","gender":"m","age":35,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'episode', 'saison-complete:e6',
   'insert', 'unambiguous', 'validated',
   '{"number":6,"airDate":"2026-09-29","aired":true,"departureDay":17,"comfortWinners":[],"immunityWinners":[]}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'council_round', 'saison-complete:e6:r1',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":6,"roundNumber":1,"kind":"vote","eliminated":"Aëlle","reportedVotesFor":3,"reportedVotesTotal":4}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'council_vote', 'saison-complete:e6:r1:Côme',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Côme","target":"Aëlle","struck":false,"weight":2}'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'council_vote', 'saison-complete:e6:r1:Aëlle',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Aëlle","target":"Bérénice","struck":false}');

-- Second lot : le bulletin qui manquait.
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000e2',
        'bbbbbbbb-0000-0000-0000-0000000000d2', 'diffed', '101');
insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-0000000000e2', 'council_round', 'saison-complete:e6:r1',
   '{"episodeNumber":6,"roundNumber":1,"kind":"vote","eliminated":"Aëlle"}');
insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-0000000000e2', 'council_vote', 'saison-complete:e6:r1:Bérénice',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Bérénice","target":"Aëlle","struck":false}');

create or replace function pg_temp.devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

/** Le tour de l'épisode 6 de la saison fictive. */
create or replace function pg_temp.tour() returns uuid
language sql stable as $$
  select cr.id
    from council_rounds cr
    join councils c on c.id = cr.council_id
    join episodes e on e.id = c.episode_id
   where e.season_id = 'cccccccc-0000-0000-0000-0000000000d2'
     and e.number = 6 and cr.round_number = 1
$$;

create or replace function pg_temp.complet() returns boolean
language sql stable as $$
  select votes_complete from council_rounds where id = pg_temp.tour()
$$;

create or replace function pg_temp.participant(nom text) returns uuid
language sql stable as $$
  select id from season_contestants
   where season_id = 'cccccccc-0000-0000-0000-0000000000d2' and display_name = nom
$$;

-- ── La publication, puis le retour arrière ──────────────────────────────────

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000d2');
select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-0000000000d2', 'bulletin manquant')$$,
  'le premier lot se publie'
);
reset role;
select is(pg_temp.complet(), false, '3 voix sur 4 annoncées : le détail est partiel');

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000d2');
select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-0000000000e2', 'bulletin retrouvé')$$,
  'le second lot se publie'
);
reset role;
select is(pg_temp.complet(), true, 'le bulletin retrouvé complète le tour : 4 voix sur 4, vote double compris');

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000d2');
select lives_ok(
  $$select revert_publication(
      (select id from publications
        where run_id = 'dddddddd-0000-0000-0000-0000000000e2'
        order by rang desc limit 1),
      'bulletin contesté')$$,
  'le second lot s''annule'
);
reset role;
select is(
  pg_temp.complet(), false,
  'LE RETOUR ARRIÈRE retire le bulletin, et le tour redevient partiel'
);

-- ── Les deux façons de compter un total ─────────────────────────────────────

insert into council_votes (round_id, voter_id, target_id, validation_status, published_at)
values (pg_temp.tour(), pg_temp.participant('Bérénice'), pg_temp.participant('Aëlle'),
        'published', now());
select is(pg_temp.complet(), true, 'une voix ajoutée rejuge son tour');

update council_votes set is_annulled = true where voter_id = pg_temp.participant('Bérénice');
select is(
  pg_temp.complet(), true,
  '« 3/9 » d''un collier : le total compte aussi les voix annulées'
);

update council_rounds set reported_votes_total = 3 where id = pg_temp.tour();
select is(
  pg_temp.complet(), true,
  '« 6/12 » : le total ne compte que les voix valides'
);

update council_rounds set reported_votes_total = 5 where id = pg_temp.tour();
select is(pg_temp.complet(), false, 'un total que les bulletins ne rendent pas : partiel');

update council_rounds set reported_votes_total = null where id = pg_temp.tour();
select is(pg_temp.complet(), false, 'sans total, rien ne se prouve');

-- ── Le poids, la cible inconnue, la main ────────────────────────────────────

update council_rounds set reported_votes_total = 4 where id = pg_temp.tour();
update council_votes set is_annulled = false where voter_id = pg_temp.participant('Bérénice');
update council_votes set weight = null where voter_id = pg_temp.participant('Côme');
select is(
  pg_temp.complet(), false,
  'un vote double reposé sans poids ne vaut qu''une voix : 3 sur 4'
);

update council_votes set weight = 2 where voter_id = pg_temp.participant('Côme');
update council_votes set target_id = null where voter_id = pg_temp.participant('Aëlle');
select is(pg_temp.complet(), false, 'un bulletin sans cible lisible laisse le tour partiel');

update council_rounds set votes_complete = true where id = pg_temp.tour();
select is(pg_temp.complet(), false, 'une valeur écrite à la main ne tient pas : le tour se rejuge');

-- ── Les droits ─────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'round_votes_complete(uuid, integer)', 'execute'),
  'anon n''appelle pas le calcul'
);
select ok(
  not has_function_privilege('authenticated', 'round_votes_complete(uuid, integer)', 'execute'),
  'un compte connecté non plus'
);

select * from finish();
rollback;
