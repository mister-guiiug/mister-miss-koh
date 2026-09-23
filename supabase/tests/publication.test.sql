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
select plan(81);

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
   '{"number":1,"airDate":"2026-08-25","aired":true,"departureDay":3,"comfortWinners":["Aël"],"immunityWinners":["Rouge"]}'),
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

-- Troisième lot (0028) : les tribus reçoivent leur couleur, l'épisode 2 son
-- jour de conseil, et deux candidats DÉJÀ sortis à l'épisode 1 ressortent —
-- Bastien sans scrutin ni cause, à l'arène, AVANT le conseil (colonne 1) ;
-- Aël, revenu, au vote (colonne 2). L'épisode 4 d'All Stars, en petit.
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-000000000003',
        'bbbbbbbb-0000-0000-0000-000000000001', 'diffed', '44');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-000000000003', 'team', 'saison-fictive:tribu:Rouge',
   'insert', 'unambiguous', 'validated', '{"name":"Rouge","colour":"#fc5d5d"}'),
  ('dddddddd-0000-0000-0000-000000000003', 'team', 'saison-fictive:tribu:Jaune',
   'insert', 'unambiguous', 'validated', '{"name":"Jaune","colour":"#fee347"}'),
  ('dddddddd-0000-0000-0000-000000000003', 'team', 'saison-fictive:tribu:Verte',
   'insert', 'unambiguous', 'validated',
   '{"name":"Verte","colour":"url(https://exemple.test/pixel.png)"}'),
  ('dddddddd-0000-0000-0000-000000000003', 'episode', 'saison-fictive:e2',
   'insert', 'unambiguous', 'validated',
   '{"number":2,"airDate":"2026-09-01","aired":true,"departureDay":11,"comfortWinners":[],"immunityWinners":[]}'),
  ('dddddddd-0000-0000-0000-000000000003', 'council_round', 'saison-fictive:e2:r1',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":2,"roundNumber":1,"kind":"linked","eliminated":"Bastien","causedBy":null,"reportedVotesFor":0,"reportedVotesTotal":null}'),
  ('dddddddd-0000-0000-0000-000000000003', 'council_round', 'saison-fictive:e2:r2',
   'insert', 'unambiguous', 'validated',
   '{"episodeNumber":2,"roundNumber":2,"kind":"vote","eliminated":"Aël","causedBy":null,"reportedVotesFor":3,"reportedVotesTotal":5}');

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

select is(
  (select day_end from episodes
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and number = 1),
  3,
  'le jour du conseil arrive sur l''épisode : c''est lui qui date les séjours en tribu'
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

select is(
  (select string_agg(d.round_number || ':' || sc.display_name, ', '
                     order by d.round_number)
     from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  '1:Bastien, 2:Aël',
  'chaque sortie garde sa colonne de la source, qu''elle ait un tour ou non'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2 bis. Les sorties publiées avant 0029 retrouvent leur rang
--
-- Leur rang se perdait à la publication. Le tour le porte pour une sortie au
-- vote ; pour une sortie sans scrutin, c'est sa colonne dans la dernière
-- exécution publiée — l'état publié, pour l'import lui-même.
-- ════════════════════════════════════════════════════════════════════════════

update departures d
   set round_number = null
  from season_contestants sc
 where sc.id = d.season_contestant_id
   and sc.season_id = 'cccccccc-0000-0000-0000-000000000001';

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'council_round',
   'saison-fictive:e1:r2',
   '{"episodeNumber":1,"roundNumber":2,"kind":"linked","eliminated":"Aël","causedBy":"Bastien"}');

select is(
  recaler_rangs_des_sorties('cccccccc-0000-0000-0000-000000000001'), 2,
  'le recalage rend un rang aux deux sorties'
);

select is(
  (select string_agg(d.round_number || ':' || sc.display_name, ', '
                     order by d.round_number)
     from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'),
  '1:Bastien, 2:Aël',
  'le vote par son tour, le départ lié par sa colonne : les rangs de la publication'
);

select is(
  recaler_rangs_des_sorties('cccccccc-0000-0000-0000-000000000001'), 0,
  'rejoué, il ne déplace rien : seuls les rangs vides se remplissent'
);

-- Deux colonnes nomment Aël dans la même soirée : laquelle a été publiée ?
update departures d
   set round_number = null
  from season_contestants sc
 where sc.id = d.season_contestant_id
   and sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
   and sc.display_name = 'Aël';

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'council_round',
   'saison-fictive:e1:r3',
   '{"episodeNumber":1,"roundNumber":3,"kind":"linked","eliminated":"Aël","causedBy":null}');

select is(
  recaler_rangs_des_sorties('cccccccc-0000-0000-0000-000000000001'), 0,
  'deux colonnes pour une même sortie : aucune n''est choisie'
);

select is(
  (select d.round_number from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and sc.display_name = 'Aël'),
  null,
  'le rang reste vide plutôt que faux'
);

delete from import_records
 where run_id = 'dddddddd-0000-0000-0000-000000000001'
   and natural_key = 'saison-fictive:e1:r3';

select is(
  recaler_rangs_des_sorties('cccccccc-0000-0000-0000-000000000001'), 1,
  'la colonne en trop partie, la sortie retrouve la sienne'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2 ter. Les sorties écrasées avant 0028 reviennent (0030)
--
-- Une seule sortie par candidat tenait en base : la seconde écrasait la
-- première, et le tour de celle-ci affichait « ? éliminé·e ». Les
-- enregistrements de la dernière exécution publiée les gardent toutes : c'est
-- d'eux que la réparation les rend. Ici, Bastien sort au vote (colonne 1) et
-- Aël le suit (colonne 2) — puis on rejoue les écrasements, un par un.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function sortie_de(prenom text, episode integer) returns text
language sql stable as $$
  select d.kind::text || ':' || coalesce(d.round_number::text, '?')
         || coalesce(':' || cr.round_number, '')
         || coalesce(' ← ' || cause_sc.display_name || ' ép.' || cause_e.number, '')
    from departures d
    join season_contestants sc on sc.id = d.season_contestant_id
    join episodes e on e.id = d.episode_id
    left join council_rounds cr on cr.id = d.round_id
    left join departures cause on cause.id = d.caused_by_departure_id
    left join season_contestants cause_sc on cause_sc.id = cause.season_contestant_id
    left join episodes cause_e on cause_e.id = cause.episode_id
   where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
     and sc.display_name = prenom and e.number = episode
$$;

create or replace function oublier_sortie(prenom text) returns void
language sql as $$
  delete from departures d using season_contestants sc
   where sc.id = d.season_contestant_id
     and sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
     and sc.display_name = prenom
$$;

-- La sortie au vote de Bastien est partie ailleurs ; par la clé étrangère, le
-- départ lié d'Aël a perdu sa cause avec elle.
select oublier_sortie('Bastien');

select is(
  sortie_de('Aël', 1), 'linked_pair:2',
  'décor : le départ lié n''a plus de cause'
);

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 2,
  'la sortie au vote revient, et le départ lié retrouve sa cause'
);

select is(
  sortie_de('Bastien', 1), 'vote:1:1',
  'elle retrouve son tour : il ne dira plus « ? éliminé·e »'
);

select is(
  sortie_de('Aël', 1), 'linked_pair:2 ← Bastien ép.1',
  'la cause est celle de la même soirée'
);

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 0,
  'rejouée, la réparation ne fait rien'
);

-- Le départ lié, écrasé à son tour.
select oublier_sortie('Aël');

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 1,
  'une sortie sans scrutin revient aussi'
);

select is(
  sortie_de('Aël', 1), 'linked_pair:2 ← Bastien ép.1',
  'avec sa colonne et sa cause'
);

select is(fictif_compte('duos'), 1, 'le duo existait : il n''est pas doublé');

-- Une cause emportée dans une autre soirée, comme celle de Teheiura (« L'Île
-- des héros »), éliminé à l'épisode 3 « à la suite de » Charlotte, sortie au 10.
insert into episodes (id, season_id, number, validation_status, published_at)
values ('eeeeeeee-0000-0000-0000-000000000009',
        'cccccccc-0000-0000-0000-000000000001', 9, 'published', now());

insert into departures (id, season_contestant_id, episode_id, kind,
                        validation_status, published_at)
select 'ffffffff-0000-0000-0000-000000000009', sc.id,
       'eeeeeeee-0000-0000-0000-000000000009', 'vote', 'published', now()
  from season_contestants sc
 where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
   and sc.display_name = 'Bastien';

update departures d
   set caused_by_departure_id = 'ffffffff-0000-0000-0000-000000000009'
  from season_contestants sc
 where sc.id = d.season_contestant_id
   and sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
   and sc.display_name = 'Aël';

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 1,
  'une cause d''une autre soirée est reprise'
);

select is(
  sortie_de('Aël', 1), 'linked_pair:2 ← Bastien ép.1',
  'elle revient dans la soirée de la sortie'
);

delete from departures where id = 'ffffffff-0000-0000-0000-000000000009';
delete from episodes where id = 'eeeeeeee-0000-0000-0000-000000000009';

-- Deux candidats portent le même prénom : lequel est sorti ? (Le décor ne met
-- aucun candidat dans les enregistrements : on y pose les deux.)
insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'season_contestant', 'saison-fictive:Aël',
   '{"displayName":"Aël","gender":"f","age":31,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-000000000001', 'season_contestant', 'saison-fictive:Aël~2',
   '{"displayName":"Aël","gender":"f","age":52,"previousSeasons":[],"finalJury":null}');

select oublier_sortie('Aël');

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 0,
  'un prénom que portent deux candidats ne désigne personne : rien n''est rendu'
);

delete from import_records
 where run_id = 'dddddddd-0000-0000-0000-000000000001'
   and natural_key in ('saison-fictive:Aël', 'saison-fictive:Aël~2');

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 1,
  'l''homonyme parti, la sortie revient'
);

-- Égalité puis second tour, sans rien qui la marque : deux colonnes contre
-- Bastien dans la même soirée.
insert into council_rounds (council_id, round_number, outcome, source_document_id,
                            validation_status, published_at)
select c.id, 3, 'elimination', 'bbbbbbbb-0000-0000-0000-000000000001', 'published', now()
  from councils c
  join episodes e on e.id = c.episode_id
 where e.season_id = 'cccccccc-0000-0000-0000-000000000001' and e.number = 1;

insert into import_records (run_id, entity, natural_key, payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'council_round', 'saison-fictive:e1:r3',
   '{"episodeNumber":1,"roundNumber":3,"kind":"vote","eliminated":"Bastien"}');

select oublier_sortie('Bastien');

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 2,
  'deux colonnes pour une sortie : elle revient une fois, et le départ lié la retrouve'
);

select is(
  sortie_de('Bastien', 1), 'vote:3:3',
  'c''est la dernière colonne qui élimine'
);

-- Le décor d'avant, pour la suite.
select oublier_sortie('Bastien');

delete from council_rounds cr using councils c, episodes e
 where c.id = cr.council_id and e.id = c.episode_id
   and e.season_id = 'cccccccc-0000-0000-0000-000000000001'
   and e.number = 1 and cr.round_number = 3;

delete from import_records
 where run_id = 'dddddddd-0000-0000-0000-000000000001'
   and natural_key = 'saison-fictive:e1:r3';

select is(
  rendre_les_sorties_perdues('cccccccc-0000-0000-0000-000000000001'), 2,
  'la seconde colonne partie, la sortie retrouve la première'
);

select is(
  sortie_de('Bastien', 1) || ' / ' || sortie_de('Aël', 1),
  'vote:1:1 / linked_pair:2 ← Bastien ép.1',
  'et le décor est celui d''avant'
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
-- 3 ter. Tribus en couleur, jour du conseil, et une SECONDE sortie (0028)
--
-- La page All Stars du 23/09/2026 : Taboga est jaune, Sebako rouge ; Maxime,
-- sorti au premier conseil, revient au jour 9 ; Charlotte, sortie à
-- l'épisode 3, revient puis ressort à l'épisode 5. Avec une sortie par
-- candidat, la seconde ÉCRASAIT la première.
-- ════════════════════════════════════════════════════════════════════════════

select devenir('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$select publish_run('dddddddd-0000-0000-0000-000000000003', 'couleurs et retours')$$,
  'le lot des couleurs et des secondes sorties se publie'
);

reset role;

select is(
  (select colour from teams
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and name = 'Rouge'),
  '#fc5d5d',
  'une tribu née d''un séjour reçoit sa couleur'
);

select is(
  (select count(*)::int from team_memberships tm
     join teams t on t.id = tm.team_id
    where t.season_id = 'cccccccc-0000-0000-0000-000000000001' and t.name = 'Rouge'),
  1,
  'et garde son identifiant : le séjour qui la cite pointe toujours dessus'
);

select is(
  (select colour from teams
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and name = 'Jaune'),
  '#fee347',
  'une tribu neuve naît avec sa couleur'
);

select is(
  (select colour from teams
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and name = 'Verte'),
  null,
  'ce qui n''est pas une couleur n''est pas écrit — la tribu, elle, est publiée'
);

select throws_ok(
  $$update teams set colour = 'url(https://exemple.test/pixel.png)'
     where season_id = 'cccccccc-0000-0000-0000-000000000001' and name = 'Jaune'$$,
  '23514',
  null,
  'et la base elle-même refuse une couleur qui finirait dans un attribut `style`'
);

select is(
  (select day_end from episodes
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and number = 2),
  11,
  'l''épisode 2 porte le jour de son conseil'
);

select is(
  (select string_agg(e.number || ':' || d.kind, ', ' order by e.number)
     from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
     join episodes e on e.id = d.episode_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and sc.display_name = 'Aël'),
  '1:linked_pair, 2:vote',
  'une seconde sortie S''AJOUTE : celle de l''épisode 1 reste ce qu''elle était'
);

select is(
  (select d.kind::text || coalesce(':' || d.caused_by_departure_id::text, '')
     from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
     join episodes e on e.id = d.episode_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and sc.display_name = 'Bastien' and e.number = 2),
  'other',
  'zéro voix que rien ne cause : ni un vote, ni un binôme — une sortie, sans plus'
);

select is(
  (select string_agg(d.round_number || ':' || sc.display_name, ', '
                     order by d.round_number)
     from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
     join episodes e on e.id = d.episode_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and e.number = 2),
  '1:Bastien, 2:Aël',
  'l''arène garde sa place : la sortie sans scrutin vient AVANT le conseil de sa soirée'
);

select devenir('aaaaaaaa-0000-0000-0000-000000000001');

select lives_ok(
  $$select revert_publication(
      (select id from publications
        where run_id = 'dddddddd-0000-0000-0000-000000000003'
        order by rang desc limit 1),
      'couleurs contestées')$$,
  'le lot des couleurs s''annule'
);

reset role;

select is(
  (select colour from teams
    where season_id = 'cccccccc-0000-0000-0000-000000000001' and name = 'Rouge'),
  null,
  'la tribu retrouve l''absence de couleur qu''elle avait : elle avait été photographiée'
);

select is(
  (select count(*)::int from teams
    where season_id = 'cccccccc-0000-0000-0000-000000000001'
      and name in ('Jaune', 'Verte')),
  0,
  'les tribus nées de ce lot disparaissent avec lui'
);

select is(
  (select count(*)::int from departures d
     join season_contestants sc on sc.id = d.season_contestant_id
    where sc.season_id = 'cccccccc-0000-0000-0000-000000000001'
      and sc.display_name in ('Aël', 'Bastien')),
  2,
  'les secondes sorties partent, les premières restent'
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
