-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Le vote double (0037) — pgTAP.                                            ║
-- ║ Lancement : `supabase test db` (CI : workflow « Supabase tests »).        ║
-- ║                                                                          ║
-- ║ Épisode 6 d'All Stars, en petit : Yassin vote deux fois contre Camille.   ║
-- ║ Ce qui est vérifié : le poids se publie, un bulletin simple vaut 1, les   ║
-- ║ voix pesées rendent le décompte de la source, et une ligne reposée d'avant ║
-- ║ la colonne (retour arrière) reste lisible.                                ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'relecteur-double@exemple.test');
insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'validator');

insert into reference_sources (id, label, base_url)
values ('src_double', 'Source fictive', 'https://exemple.test');
insert into source_documents (id, source_id, external_id, title, url) values
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'src_double', '2',
   'Saison double', 'https://exemple.test/double');
insert into seasons (id, slug, name, status, source_document_id, validation_status)
values ('cccccccc-0000-0000-0000-0000000000d1', 'saison-double', 'Saison double',
        'airing', 'bbbbbbbb-0000-0000-0000-0000000000d1', 'pending_review');
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000d1',
        'bbbbbbbb-0000-0000-0000-0000000000d1', 'diffed', '239943413');

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'council_round', 'saison-double:e6:r1',
   '{"episodeNumber":6,"roundNumber":1,"kind":"vote","eliminated":"Aëlle"}');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'season_contestant', 'saison-double:Aëlle',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Aëlle","gender":"f","age":30,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'season_contestant', 'saison-double:Bérénice',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Bérénice","gender":"f","age":41,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'season_contestant', 'saison-double:Côme',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Côme","gender":"m","age":35,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'episode', 'saison-double:e6',
   'insert', 'unambiguous', 'validated',
   '{"number":6,"airDate":"2026-09-29","aired":true,"departureDay":17,"comfortWinners":[],"immunityWinners":[]}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'council_round', 'saison-double:e6:r1',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":6,"roundNumber":1,"kind":"vote","eliminated":"Aëlle","reportedVotesFor":3,"reportedVotesTotal":4}'),
  -- Le vote double, puis deux bulletins simples : 3 voix contre Aëlle sur 4.
  ('dddddddd-0000-0000-0000-0000000000d1', 'council_vote', 'saison-double:e6:r1:Côme',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Côme","target":"Aëlle","struck":false,"weight":2}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'council_vote', 'saison-double:e6:r1:Bérénice',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Bérénice","target":"Aëlle","struck":false}'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'council_vote', 'saison-double:e6:r1:Aëlle',
   'insert', 'unambiguous', 'validated',
   '{"voter":"Aëlle","target":"Bérénice","struck":false}');

create or replace function pg_temp.devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

/** Le poids publié du bulletin d'un votant de la saison fictive. */
create or replace function pg_temp.poids(votant text) returns smallint
language sql stable as $$
  select v.weight
    from council_votes v
    join season_contestants sc on sc.id = v.voter_id
   where sc.season_id = 'cccccccc-0000-0000-0000-0000000000d1'
     and sc.display_name = votant
$$;

select col_type_is('council_votes', 'weight', 'smallint', 'le poids d''un bulletin est un petit entier');

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000d1');
select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-0000000000d1', 'le soir du vote double')$$,
  'un relecteur publie le lot du vote double'
);
reset role;

select is(pg_temp.poids('Côme'), 2::smallint, '« Aëlle (x2) » se publie avec son poids');
select is(pg_temp.poids('Bérénice'), 1::smallint, 'un bulletin sans poids en porte un');

select is(
  (select sum(v.weight)::integer
     from council_votes v
     join season_contestants cible on cible.id = v.target_id
    where cible.season_id = 'cccccccc-0000-0000-0000-0000000000d1'
      and cible.display_name = 'Aëlle'),
  3,
  'les voix pesées rendent le décompte de la source (3 sur 4)'
);

select throws_ok(
  $$update council_votes set weight = 0
     where voter_id = (select id from season_contestants
                        where season_id = 'cccccccc-0000-0000-0000-0000000000d1'
                          and display_name = 'Bérénice')$$,
  '23514',
  null,
  'un poids nul est refusé'
);

-- Une photo prise AVANT la colonne n'a pas de poids. La reposer (retour
-- arrière) ne doit pas échouer : la ligne revient, sans poids, et vaut une voix.
select lives_ok(
  $$select restore_row('council_votes',
      (select to_jsonb(v) - 'weight' from council_votes v
         join season_contestants sc on sc.id = v.voter_id
        where sc.season_id = 'cccccccc-0000-0000-0000-0000000000d1'
          and sc.display_name = 'Côme'))$$,
  'une ligne photographiée avant la colonne se repose'
);
select is(pg_temp.poids('Côme'), null::smallint, 'elle revient sans poids : l''application la lit comme une voix');

select * from finish();
rollback;
