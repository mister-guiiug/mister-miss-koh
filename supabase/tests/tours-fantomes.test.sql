-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Défaire un tour fantôme (0040) : pgTAP.                                   ║
-- ║ Lancement : `supabase test db` (CI : workflow « Supabase tests »).        ║
-- ║                                                                          ║
-- ║ Les deux formes relevées le 13/10/2026, en petit :                        ║
-- ║  - épisode 3 : un tour fantôme, copie du vrai, et la sortie qui le        ║
-- ║    désigne (Fidji, Les Armes secrètes, Malaisie…) ;                       ║
-- ║  - épisode 5 : un fantôme suivi d'un départ lié, qui remonte d'un rang    ║
-- ║    (Le Feu sacré, épisode 12).                                            ║
-- ║ Premier lot : ce que l'extraction 14 publiait. Second lot : ce que la 15  ║
-- ║ propose. Puis le retour arrière doit tout reposer.                        ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'relecteur-fantome@exemple.test');
insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'validator');

insert into reference_sources (id, label, base_url)
values ('src_fantome', 'Source fictive', 'https://exemple.test');
insert into source_documents (id, source_id, external_id, title, url) values
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'src_fantome', '4',
   'Saison fantôme', 'https://exemple.test/fantome');
insert into seasons (id, slug, name, status, source_document_id, validation_status)
values ('cccccccc-0000-0000-0000-0000000000f1', 'saison-fantome', 'Saison fantôme',
        'completed', 'bbbbbbbb-0000-0000-0000-0000000000f1', 'pending_review');

-- ── Premier lot : la lecture de l'extraction 14, fantômes compris ────────────
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000f1',
        'bbbbbbbb-0000-0000-0000-0000000000f1', 'diffed', '100');

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-0000000000f1', 'council_round', 'saison-fantome:e3:r1',
   '{"episodeNumber":3,"roundNumber":1,"kind":"vote","eliminated":"Aëlle","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f1', 'council_round', 'saison-fantome:e3:r2',
   '{"episodeNumber":3,"roundNumber":2,"kind":"vote","eliminated":"Aëlle","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f1', 'council_round', 'saison-fantome:e5:r1',
   '{"episodeNumber":5,"roundNumber":1,"kind":"vote","eliminated":"Élie","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f1', 'council_round', 'saison-fantome:e5:r2',
   '{"episodeNumber":5,"roundNumber":2,"kind":"vote","eliminated":"Élie","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f1', 'council_round', 'saison-fantome:e5:r3',
   '{"episodeNumber":5,"roundNumber":3,"kind":"linked","eliminated":"Fanny","causedBy":"Élie","reportedVotesFor":0,"reportedVotesTotal":null,"rawTally":"0"}');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value)
select 'dddddddd-0000-0000-0000-0000000000f1', 'season_contestant',
       'saison-fantome:' || nom, 'insert', 'unambiguous', 'validated',
       jsonb_build_object('displayName', nom, 'gender', 'f', 'age', 30,
                          'previousSeasons', '[]'::jsonb, 'finalJury', null)
from unnest(array['Aëlle', 'Bérénice', 'Côme', 'Dimitri', 'Élie', 'Fanny']) as nom;

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-0000000000f1', 'episode', 'saison-fantome:e3', 'insert', 'unambiguous', 'validated',
   '{"number":3,"airDate":"2026-09-08","aired":true,"departureDay":8,"comfortWinners":[],"immunityWinners":[]}'),
  ('dddddddd-0000-0000-0000-0000000000f1', 'episode', 'saison-fantome:e5', 'insert', 'unambiguous', 'validated',
   '{"number":5,"airDate":"2026-09-22","aired":true,"departureDay":14,"comfortWinners":[],"immunityWinners":[]}');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value)
select 'dddddddd-0000-0000-0000-0000000000f1', 'council_round', natural_key,
       'insert', 'unambiguous', 'validated', payload
from import_records where run_id = 'dddddddd-0000-0000-0000-0000000000f1';

-- Les mêmes quatre bulletins dans le vrai tour et dans son fantôme.
insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value)
select 'dddddddd-0000-0000-0000-0000000000f1', 'council_vote',
       'saison-fantome:e' || ep || ':r' || tour || ':' || votant,
       'insert', 'unambiguous', 'validated',
       jsonb_build_object('voter', votant, 'target', cible, 'struck', false)
from (values
  (3, 'Bérénice', 'Aëlle'), (3, 'Côme', 'Aëlle'), (3, 'Dimitri', 'Aëlle'), (3, 'Aëlle', 'Bérénice'),
  (5, 'Bérénice', 'Élie'), (5, 'Côme', 'Élie'), (5, 'Dimitri', 'Élie'), (5, 'Élie', 'Côme')
) as v(ep, votant, cible)
cross join (values (1), (2)) as t(tour);

create or replace function pg_temp.devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

/** Les tours publiés d'un épisode de la saison fictive. */
create or replace function pg_temp.tours(ep integer) returns integer
language sql stable as $$
  select count(*)::integer
    from council_rounds cr
    join councils c on c.id = cr.council_id
    join episodes e on e.id = c.episode_id
   where e.season_id = 'cccccccc-0000-0000-0000-0000000000f1' and e.number = ep
$$;

/** La sortie d'un candidat à un épisode : son rang, et le rang du tour qu'elle désigne. */
create or replace function pg_temp.sortie(nom text, ep integer) returns text
language sql stable as $$
  select d.round_number || '/' || coalesce(cr.round_number::text, '-') || '/' || d.kind
    from departures d
    join season_contestants sc on sc.id = d.season_contestant_id
    join episodes e on e.id = d.episode_id
    left join council_rounds cr on cr.id = d.round_id
   where sc.season_id = 'cccccccc-0000-0000-0000-0000000000f1'
     and sc.display_name = nom and e.number = ep
$$;

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000f1');
select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-0000000000f1', 'lecture 14, fantômes compris')$$,
  'le premier lot se publie, fantômes compris'
);
reset role;

select is(pg_temp.tours(3), 2, 'épisode 3 : le vrai tour et son fantôme');
select is(pg_temp.sortie('Aëlle', 3), '2/2/vote', 'la sortie d''Aëlle désigne le FANTÔME, comme en production');
select is(pg_temp.sortie('Élie', 5), '2/2/vote', 'celle d''Élie aussi');

-- ── Second lot : la lecture de l'extraction 15 ──────────────────────────────
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000f2',
        'bbbbbbbb-0000-0000-0000-0000000000f1', 'diffed', '100');

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_round', 'saison-fantome:e3:r1',
   '{"episodeNumber":3,"roundNumber":1,"kind":"vote","eliminated":"Aëlle","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_round', 'saison-fantome:e5:r1',
   '{"episodeNumber":5,"roundNumber":1,"kind":"vote","eliminated":"Élie","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}'),
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_round', 'saison-fantome:e5:r2',
   '{"episodeNumber":5,"roundNumber":2,"kind":"linked","eliminated":"Fanny","causedBy":"Élie","reportedVotesFor":0,"reportedVotesTotal":null,"rawTally":"0"}');

-- Ce que le diff propose : la suppression vient avec son « avant », jamais un « après ».
insert into import_differences
  (run_id, entity, natural_key, operation, class, status, before_value, after_value)
select 'dddddddd-0000-0000-0000-0000000000f2', entity, natural_key,
       'delete', 'ambiguous', 'validated', payload, null
from import_records
where run_id = 'dddddddd-0000-0000-0000-0000000000f1'
  and natural_key in ('saison-fantome:e3:r2', 'saison-fantome:e5:r3');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, before_value, after_value)
select 'dddddddd-0000-0000-0000-0000000000f2', 'council_vote',
       'saison-fantome:e' || ep || ':r2:' || votant, 'delete', 'ambiguous', 'validated',
       jsonb_build_object('voter', votant, 'target', cible, 'struck', false), null
from (values
  (3, 'Bérénice', 'Aëlle'), (3, 'Côme', 'Aëlle'), (3, 'Dimitri', 'Aëlle'), (3, 'Aëlle', 'Bérénice'),
  (5, 'Bérénice', 'Élie'), (5, 'Côme', 'Élie'), (5, 'Dimitri', 'Élie'), (5, 'Élie', 'Côme')
) as v(ep, votant, cible);

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, before_value, after_value) values
  -- Le vote double, enfin lu : Côme pèse deux voix dans le vrai tour.
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_vote', 'saison-fantome:e3:r1:Côme',
   'update', 'unambiguous', 'validated',
   '{"voter":"Côme","target":"Aëlle","struck":false}',
   '{"voter":"Côme","target":"Aëlle","struck":false,"weight":2}'),
  -- Une voix qui disparaît d'un tour qui RESTE : le chemin que 0040 répare.
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_vote', 'saison-fantome:e3:r1:Dimitri',
   'delete', 'ambiguous', 'validated',
   '{"voter":"Dimitri","target":"Aëlle","struck":false}', null),
  -- Épisode 5 : le départ lié de Fanny remonte au rang du fantôme.
  ('dddddddd-0000-0000-0000-0000000000f2', 'council_round', 'saison-fantome:e5:r2',
   'update', 'retroactive', 'validated',
   '{"episodeNumber":5,"roundNumber":2,"kind":"vote","eliminated":"Élie","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":4,"rawTally":"3/4"}',
   '{"episodeNumber":5,"roundNumber":2,"kind":"linked","eliminated":"Fanny","causedBy":"Élie","reportedVotesFor":0,"reportedVotesTotal":null,"rawTally":"0"}');

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000f1');
select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-0000000000f2', 'lecture 15, fantômes défaits')$$,
  'le second lot, suppressions comprises, se publie'
);
reset role;

select is(pg_temp.tours(3), 1, 'épisode 3 : le fantôme est parti');
select is(
  (select count(*)::integer from council_votes cv
     join council_rounds cr on cr.id = cv.round_id
     join councils c on c.id = cr.council_id
     join episodes e on e.id = c.episode_id
    where e.season_id = 'cccccccc-0000-0000-0000-0000000000f1' and e.number = 3),
  3,
  'ses voix aussi, et celle de Dimitri, supprimée d''un tour qui reste'
);
select is(
  (select cv.weight from council_votes cv
     join season_contestants sc on sc.id = cv.voter_id
     join council_rounds cr on cr.id = cv.round_id
     join councils c on c.id = cr.council_id
     join episodes e on e.id = c.episode_id
    where sc.season_id = 'cccccccc-0000-0000-0000-0000000000f1'
      and sc.display_name = 'Côme' and e.number = 3),
  2::smallint,
  'Côme pèse deux voix dans le vrai tour'
);
select is(pg_temp.sortie('Aëlle', 3), '1/1/vote', 'la sortie d''Aëlle revient au vrai tour');

select is(pg_temp.tours(5), 1, 'épisode 5 : le scrutin fantôme a laissé sa place au départ lié');
select is(pg_temp.sortie('Élie', 5), '1/1/vote', 'la sortie d''Élie revient au vrai tour');
select is(pg_temp.sortie('Fanny', 5), '2/-/linked_pair', 'Fanny part liée, au rang 2, sans scrutin');

-- ── Le retour arrière repose tout ───────────────────────────────────────────
select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000f1');
select lives_ok(
  $$select revert_publication(
      (select id from publications where run_id = 'dddddddd-0000-0000-0000-0000000000f2'),
      'essai : défaire la correction')$$,
  'la correction se défait'
);
reset role;

select is(pg_temp.tours(3), 2, 'le fantôme revient, avec son tour');
select is(pg_temp.sortie('Aëlle', 3), '2/2/vote', 'et la sortie d''Aëlle le désigne de nouveau');
select is(pg_temp.sortie('Fanny', 5), '3/-/linked_pair', 'Fanny retrouve son rang 3');

select * from finish();
rollback;
