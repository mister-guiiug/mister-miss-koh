-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Tests d'isolation — pgTAP. Lancement : `supabase test db`                 ║
-- ║                                                                          ║
-- ║ Ces tests ne vérifient pas que les politiques existent : ils vérifient    ║
-- ║ qu'elles TIENNENT. Chacun se place dans la peau d'un utilisateur — rôle   ║
-- ║ `authenticated` et jeton portant son identifiant — puis compte ce qu'il   ║
-- ║ voit. Une politique qui laisse fuir une ligne fait tomber un compte.      ║
-- ║                                                                          ║
-- ║ `supabase test db` exige Docker, qui ne démarre pas sur le poste de       ║
-- ║ développement. Le même fichier se joue contre la base LIÉE par            ║
-- ║ `npm run test:rls:remote` : 22 sur 22 le 05/09/2026.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(22);

-- ── Décor ─────────────────────────────────────────────────────────────────
-- Deux comptes, une note privée chacun, et une saison à moitié publiée.
-- « Donnée fictive de démonstration » : aucun de ces noms n'est réel.

-- `auth.users` appartient à Supabase et sa liste de colonnes obligatoires
-- dépend de la version de GoTrue installée. Si cette insertion échoue au
-- premier lancement, compléter les colonnes manquantes ici — et NE PAS
-- contourner en désactivant la contrainte de clé étrangère, qui est justement
-- ce que les tests vérifient (la cascade de suppression de compte).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@exemple.test');

insert into profiles (id, pseudonym, visibility) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha', 'private'),
  ('22222222-2222-2222-2222-222222222222', 'Beta', 'public');

insert into reference_sources (id, label, base_url)
values ('demo_src', 'Source fictive', 'https://exemple.test');

insert into seasons (id, slug, name, validation_status) values
  ('33333333-3333-3333-3333-333333333333', 'saison-publiee', 'Saison publiée', 'published'),
  ('44444444-4444-4444-4444-444444444444', 'saison-brouillon', 'Saison en attente', 'pending_review');

insert into personal_notes (id, user_id, season_id, title, body, visibility)
values
  ('55555555-5555-5555-5555-555555555555',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   'Note privée de A', 'contenu confidentiel', 'private'),
  ('66666666-6666-6666-6666-666666666666',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   'Note partagée de A', 'contenu partagé', 'link');

insert into share_links (id, owner_id, token, scope, note_id) values
  ('77777777-7777-7777-7777-777777777777',
   '11111111-1111-1111-1111-111111111111',
   'jeton-de-demonstration', 'note',
   '66666666-6666-6666-6666-666666666666');

-- Se faire passer pour un utilisateur : rôle + revendication `sub` du jeton,
-- exactement ce que PostgREST met en place à chaque requête.
create or replace function devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

create or replace function devenir_anonyme() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Le référentiel : publié seulement, et jamais modifiable
-- ════════════════════════════════════════════════════════════════════════════

select devenir_anonyme();

select is(
  (select count(*)::int from seasons), 1,
  'anonyme : seule la saison PUBLIÉE est visible'
);
select is(
  (select count(*)::int from seasons where slug = 'saison-brouillon'), 0,
  'anonyme : une saison en attente reste invisible'
);

select throws_ok(
  $$ insert into seasons (slug, name) values ('pirate', 'Saison pirate') $$,
  NULL, 'anonyme : impossible d''insérer dans le référentiel'
);

select devenir('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ update seasons set name = 'Détournée'
      where slug = 'saison-publiee' $$,
  NULL, 'authentifié : impossible de modifier le référentiel'
);
select throws_ok(
  $$ delete from seasons where slug = 'saison-publiee' $$,
  NULL, 'authentifié : impossible de supprimer du référentiel'
);
select is(
  (select count(*)::int from seasons where slug = 'saison-brouillon'), 0,
  'authentifié sans rôle : le non publié reste invisible'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. A et B sont étanches
-- ════════════════════════════════════════════════════════════════════════════

select devenir('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from personal_notes
    where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'B ne voit AUCUNE note de A'
);
select is(
  (select count(*)::int from personal_notes
    where id = '55555555-5555-5555-5555-555555555555'), 0,
  'B ne voit pas la note privée de A, même en la nommant'
);
select is(
  (select count(*)::int from personal_notes
    where id = '66666666-6666-6666-6666-666666666666'), 0,
  'B ne voit pas la note partagée par lien sans présenter le jeton'
);

-- UNE ÉCRITURE BLOQUÉE PAR LA RLS NE LÈVE PAS : elle ne touche aucune ligne,
-- en silence. Constater l'échec depuis B serait donc vide de sens — B ne voit
-- rien de toute façon. Le seul constat honnête se fait depuis A, APRÈS coup.
update personal_notes set title = 'Détournée'
 where id = '55555555-5555-5555-5555-555555555555';
delete from personal_notes where id = '55555555-5555-5555-5555-555555555555';

select devenir('11111111-1111-1111-1111-111111111111');
select is(
  (select title from personal_notes
    where id = '55555555-5555-5555-5555-555555555555'),
  'Note privée de A',
  'la note de A a survécu aux tentatives de modification ET de suppression de B'
);
select is(
  (select count(*)::int from personal_notes), 2,
  'A voit ses deux notes'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Liens de partage : le jeton, et rien que le jeton
-- ════════════════════════════════════════════════════════════════════════════

select devenir('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from share_links), 0,
  'B ne peut pas énumérer les liens de partage de A'
);

select devenir_anonyme();

select is(
  (select count(*)::int from get_shared_note('jeton-de-demonstration')), 1,
  'anonyme : le bon jeton ouvre la note partagée'
);
select throws_ok(
  $$ select * from get_shared_note('jeton-invente') $$,
  'P0002', NULL,
  'un jeton inventé est refusé'
);

-- Le contenu rendu est CHOISI : ni propriétaire, ni identifiant de lien.
select ok(
  not exists (
    select 1 from information_schema.routines r
    where r.routine_name = 'get_shared_note'
      and r.routine_definition ilike '%n.user_id%'
  ),
  'get_shared_note ne renvoie jamais user_id'
);

-- ── Révocation : effective à la requête suivante ───────────────────────────
select devenir('11111111-1111-1111-1111-111111111111');
update share_links set revoked_at = now()
 where id = '77777777-7777-7777-7777-777777777777';

select devenir_anonyme();
select throws_ok(
  $$ select * from get_shared_note('jeton-de-demonstration') $$,
  'P0002', NULL,
  'la révocation prend effet immédiatement'
);

-- ── Expiration ────────────────────────────────────────────────────────────
select devenir('11111111-1111-1111-1111-111111111111');
update share_links
   set revoked_at = null, expires_at = now() - interval '1 minute'
 where id = '77777777-7777-7777-7777-777777777777';

select devenir_anonyme();
select throws_ok(
  $$ select * from get_shared_note('jeton-de-demonstration') $$,
  'P0002', NULL,
  'un lien expiré n''ouvre plus rien'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Profils
-- ════════════════════════════════════════════════════════════════════════════

select devenir_anonyme();
select is(
  (select count(*)::int from profiles), 1,
  'anonyme : seul le profil PUBLIC est visible'
);
select is(
  (select pseudonym from profiles), 'Beta',
  'anonyme : le profil privé de A reste invisible'
);

-- L'adresse électronique n'est pas exposable : elle n'est dans aucune colonne.
select hasnt_column('public', 'profiles', 'email',
  'la table profiles ne porte AUCUNE adresse électronique');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Rôles : impossible de se promouvoir
-- ════════════════════════════════════════════════════════════════════════════

select devenir('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ insert into user_roles (user_id, role)
     values ('22222222-2222-2222-2222-222222222222', 'admin') $$,
  NULL, 'un utilisateur ne peut pas s''attribuer un rôle'
);
select is(
  (select count(*)::int from import_differences), 0,
  'sans rôle, les propositions d''import sont invisibles'
);

select * from finish();
rollback;
