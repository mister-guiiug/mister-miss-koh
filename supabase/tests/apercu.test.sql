-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ L'aperçu de la version en attente (0039) : pgTAP.                         ║
-- ║ Lancement : `supabase test db` (CI : workflow « Supabase tests »).        ║
-- ║                                                                          ║
-- ║ Une saison en ligne, un lot retenu : deux candidats certains, un épisode  ║
-- ║ qui attend un relecteur. Ce qui est vérifié : seuls ceux qui publient     ║
-- ║ calculent l'aperçu, le calcul ne publie RIEN, tout le monde le lit, il    ║
-- ║ cesse d'être servi dès que le lot change, et le rôle de service ne gagne  ║
-- ║ aucun droit de publier pour de bon.                                      ║
-- ║                                                                          ║
-- ║ « Donnée fictive de démonstration » : aucun de ces noms n'est réel.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'relecteur-apercu@exemple.test'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'visiteur-apercu@exemple.test');
insert into user_roles (user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'validator');

insert into reference_sources (id, label, base_url)
values ('src_apercu', 'Source fictive', 'https://exemple.test');
insert into source_documents (id, source_id, external_id, title, url) values
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'src_apercu', '3',
   'Saison aperçu', 'https://exemple.test/apercu');
insert into seasons (id, slug, name, status, source_document_id, validation_status)
values ('cccccccc-0000-0000-0000-0000000000a1', 'saison-apercu', 'Saison aperçu',
        'airing', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'published');
insert into import_runs (id, source_document_id, status, source_revision)
values ('dddddddd-0000-0000-0000-0000000000a1',
        'bbbbbbbb-0000-0000-0000-0000000000a1', 'diffed', '300');

insert into import_differences
  (run_id, entity, natural_key, operation, class, status, after_value) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'season_contestant', 'saison-apercu:Aëlle',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Aëlle","gender":"f","age":30,"previousSeasons":[],"finalJury":null}'),
  ('dddddddd-0000-0000-0000-0000000000a1', 'season_contestant', 'saison-apercu:Bérénice',
   'insert', 'unambiguous', 'validated',
   '{"displayName":"Bérénice","gender":"f","age":41,"previousSeasons":[],"finalJury":null}'),
  -- Celui qui retient le lot : personne ne l'a encore tranché.
  ('dddddddd-0000-0000-0000-0000000000a1', 'episode', 'saison-apercu:e1',
   'insert', 'ambiguous', 'pending_review',
   '{"number":1,"airDate":"2026-10-06","aired":true,"departureDay":3,"comfortWinners":[],"immunityWinners":[]}');

create or replace function pg_temp.devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.devenir_anonyme() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create or replace function pg_temp.devenir_service() returns void
language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- ── Qui calcule ──────────────────────────────────────────────────────────────

select pg_temp.devenir_anonyme();
select throws_ok(
  $$select preparer_apercu('dddddddd-0000-0000-0000-0000000000a1')$$,
  '42501', null,
  'un visiteur anonyme ne calcule pas un aperçu'
);

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select preparer_apercu('dddddddd-0000-0000-0000-0000000000a1')$$,
  '42501', null,
  'un compte sans rôle de relecteur non plus'
);

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000a1');
select is(
  preparer_apercu('dddddddd-0000-0000-0000-0000000000a1'),
  'pret',
  'un relecteur calcule l''aperçu du lot retenu'
);
select is(
  auth.uid(),
  'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'l''identité du relecteur est intacte après le calcul'
);
reset role;

-- ── Le calcul ne publie rien ─────────────────────────────────────────────────

select is(
  (select count(*)::int from episodes
    where season_id = 'cccccccc-0000-0000-0000-0000000000a1'),
  0,
  'aucun épisode n''entre au référentiel'
);
select is(
  (select count(*)::int from season_contestants
    where season_id = 'cccccccc-0000-0000-0000-0000000000a1'),
  0,
  'aucun candidat non plus, même ceux déjà validés'
);
select is(
  (select status::text from import_differences
    where natural_key = 'saison-apercu:e1'),
  'pending_review',
  'la proposition attend toujours un relecteur'
);
select is(
  (select status::text from import_runs
    where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  'diffed',
  'le lot n''est pas marqué publié'
);
select is(
  (select count(*)::int from referential_versions
    where season_id = 'cccccccc-0000-0000-0000-0000000000a1'),
  0,
  'la version publiée n''avance pas'
);

-- ── Tout le monde le lit ─────────────────────────────────────────────────────

select pg_temp.devenir_anonyme();
select is(
  apercu_en_attente_disponible('saison-apercu'),
  '300',
  'un visiteur apprend qu''un aperçu de la révision 300 est prêt'
);
select is(
  (select jsonb_agg(e->>'number')
     from jsonb_array_elements(apercu_version_en_attente('saison-apercu')->'episodes') e),
  '["1"]'::jsonb,
  'l''aperçu montre l''épisode qui attend'
);
select is(
  jsonb_array_length(apercu_version_en_attente('saison-apercu')->'contestants'),
  2,
  'et les deux candidats du lot'
);
select is(
  (apercu_version_en_attente('saison-apercu')->>'version')::int,
  0,
  'sa version est celle du publié, pas celle de la publication défaite'
);
select throws_ok(
  $$select * from apercus_en_attente$$,
  '42501', null,
  'la table des aperçus reste fermée au visiteur'
);

-- ── Il cesse d'être servi dès que le lot change ──────────────────────────────

select pg_temp.devenir('aaaaaaaa-0000-0000-0000-0000000000a1');
select review_difference(
  (select id from import_differences where natural_key = 'saison-apercu:e1'),
  'rejected', 'aperçu : test');
select pg_temp.devenir_anonyme();
select is(
  apercu_version_en_attente('saison-apercu'),
  null,
  'une décision rend l''aperçu périmé : il n''est plus servi'
);

-- ── Le rôle de service simule, il ne publie pas ──────────────────────────────

select pg_temp.devenir_service();
select is(
  preparer_apercu('dddddddd-0000-0000-0000-0000000000a1'),
  'pret',
  'la relecture nocturne (rôle de service) recalcule l''aperçu'
);
select is(
  relecture_automatique_autorisee('dddddddd-0000-0000-0000-0000000000a1'),
  false,
  'hors du calcul, le lot non validé reste impubliable par le rôle de service'
);
reset role;

select * from finish();
rollback;
