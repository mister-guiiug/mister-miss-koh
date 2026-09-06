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
-- ║ `npm run test:rls:remote` : 24 sur 24 le 05/09/2026.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(34);

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
  ('22222222-2222-2222-2222-222222222222', 'b@exemple.test'),
  -- C N'A PAS DE PROFIL, et c'est le cas de TOUT compte réel : rien ne crée de
  -- ligne dans `profiles` — ni déclencheur, ni application —, et `pseudonym`
  -- est `not null` sans défaut. Le décor d'origine donnait un profil à ses deux
  -- comptes, ce qui masquait exactement le défaut que 0021 corrige.
  ('99999999-9999-9999-9999-999999999999', 'c@exemple.test');

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
   'Note partagée de A', 'contenu partagé', 'link'),
  -- La note PUBLIQUE de B : c'est elle qui révèle que les politiques
  -- s'additionnent, et pourquoi le client filtre sur `user_id` (§ 2 bis).
  ('88888888-8888-8888-8888-888888888888',
   '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333',
   'Note publique de B', 'contenu publié', 'public'),
  -- « link » et non « public » : une note publique de C entrerait dans le
  -- compte de la section 2 bis, qui vérifie autre chose.
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333',
   'Note de C, sans profil', 'lisible quand même', 'link');

insert into share_links (id, owner_id, token, scope, note_id) values
  ('77777777-7777-7777-7777-777777777777',
   '11111111-1111-1111-1111-111111111111',
   'jeton-de-demonstration', 'note',
   '66666666-6666-6666-6666-666666666666'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '99999999-9999-9999-9999-999999999999',
   'jeton-sans-profil', 'note',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  -- Une collection ne désigne AUCUNE note : elle nomme une règle, appliquée à
  -- la lecture (contrainte `share_links_scope_target`).
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111',
   'jeton-collection', 'note_collection', null);

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

-- CADRÉ SUR LES DEUX SAISONS DU DÉCOR. Compter toutes les saisons passait tant
-- que la base était vide, et s'est mis à échouer le jour où une VRAIE saison a
-- été publiée. Un test qui n'est vert que sur une base neuve ne prouve rien le
-- jour où il compte.
select is(
  (select count(*)::int from seasons
    where slug in ('saison-publiee', 'saison-brouillon')), 1,
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
  (select count(*)::int from personal_notes
    where user_id = '11111111-1111-1111-1111-111111111111'), 2,
  'A voit ses deux notes'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2 bis. Les politiques s'ADDITIONNENT — et le client doit le savoir
-- ════════════════════════════════════════════════════════════════════════════
-- Deux politiques de lecture cohabitent sur `personal_notes` : « les miennes »
-- et « les notes publiques ». Elles sont PERMISSIVES : PostgreSQL les combine
-- par OU. Une lecture sans clause `user_id` rend donc aussi les notes publiques
-- des AUTRES comptes — ce que le serveur a raison de faire, et ce qu'un écran
-- intitulé « Mes notes » aurait tort d'afficher.
--
-- Les deux assertions ci-dessous sont la RAISON du filtre `.eq('user_id', …)`
-- dans `src/backend/notes.ts`. Sans elles, ce filtre passerait un jour pour une
-- précaution superflue, et sa disparition ne casserait rien de visible ici.

select is(
  (select count(*)::int from personal_notes), 3,
  'sans filtre, A voit AUSSI la note publique de B — les politiques s''additionnent'
);
select is(
  (select count(*)::int from personal_notes
    where id = '88888888-8888-8888-8888-888888888888'), 1,
  'et cette note publique de B est bien lisible, en la nommant'
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
-- `PT404` N'EST PAS UN DÉTAIL DE PLOMBERIE : PostgREST traduit le SQLSTATE en
-- statut HTTP, et il range tout ce qu'il ne connaît pas — dont `P0002` — dans
-- le fourre-tout 500. Un lien périmé annonçait donc une panne serveur. La
-- convention `PTxxx` impose le statut ; mesuré, `PT404` rend bien un 404.
select throws_ok(
  $$ select * from get_shared_note('jeton-invente') $$,
  'PT404', NULL,
  'un jeton inventé est refusé — et « introuvable », pas « en panne »'
);

-- La règle, pour toutes les autres : rien dans `public` ne doit plus lever
-- `P0002`, sans quoi le défaut reviendrait par une fonction neuve.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and p.prosrc like '%P0002%'), 0,
  'aucune fonction ne répond « erreur serveur » pour un objet introuvable'
);

-- Le contenu rendu est CHOISI : ni propriétaire, ni identifiant de lien.
--
-- Cette assertion lisait `routine_definition`, qui est NULL pour qui n'est pas
-- propriétaire de la fonction : le `not exists` était alors vrai sans rien
-- prouver, et le test ne POUVAIT pas échouer. Ce sont les colonnes rendues
-- qu'il faut interroger.
select ok(
  pg_get_function_result('get_shared_note(text)'::regprocedure)
    !~* '(user|owner)_id',
  'get_shared_note ne rend ni user_id ni owner_id'
);

-- ── Révocation : effective à la requête suivante ───────────────────────────
select devenir('11111111-1111-1111-1111-111111111111');
update share_links set revoked_at = now()
 where id = '77777777-7777-7777-7777-777777777777';

select devenir_anonyme();
select throws_ok(
  $$ select * from get_shared_note('jeton-de-demonstration') $$,
  'PT404', NULL,
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
  'PT404', NULL,
  'un lien expiré n''ouvre plus rien'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3 bis. Partager une note sans profil, et partager la collection
-- ════════════════════════════════════════════════════════════════════════════

select devenir_anonyme();

-- LE DÉFAUT QUE 0021 CORRIGE. `get_shared_note` joignait `profiles` en
-- jointure INTERNE ; comme rien ne crée jamais de profil, tout lien valide
-- d'un compte réel ouvrait une page vide, sans erreur.
select is(
  (select count(*)::int from get_shared_note('jeton-sans-profil')), 1,
  'une note dont l''auteur n''a pas de profil se lit quand même'
);
select is(
  (select author_pseudonym from get_shared_note('jeton-sans-profil')), NULL,
  'et son auteur est simplement anonyme, pas absent'
);
select is(
  (select target from get_shared_note('jeton-sans-profil')), 'season',
  'la note partagée dit sur QUOI elle porte'
);

-- ── La collection : une règle, pas un instantané ───────────────────────────
select is(
  (select count(*)::int from get_shared_notes('jeton-collection')), 1,
  'la collection de A ne montre que sa note « link », pas la privée'
);

select devenir('11111111-1111-1111-1111-111111111111');
update personal_notes set visibility = 'link'
 where id = '55555555-5555-5555-5555-555555555555';
select devenir_anonyme();
select is(
  (select count(*)::int from get_shared_notes('jeton-collection')), 2,
  'rendre une note partageable l''ajoute au lien, sans en refaire un'
);

select devenir('11111111-1111-1111-1111-111111111111');
update personal_notes set visibility = 'private'
 where id = '55555555-5555-5555-5555-555555555555';
select devenir_anonyme();
select is(
  (select count(*)::int from get_shared_notes('jeton-collection')), 1,
  'et la rendre privée l''en retire à la requête suivante'
);

-- ── Les portées ne se croisent pas ─────────────────────────────────────────
-- Le jeton de la section 3 a été expiré : on le remet en état, sans quoi ce
-- test passerait pour la mauvaise raison.
select devenir('11111111-1111-1111-1111-111111111111');
update share_links set revoked_at = null, expires_at = null
 where id = '77777777-7777-7777-7777-777777777777';
select devenir_anonyme();
select throws_ok(
  $$ select * from get_shared_notes('jeton-de-demonstration') $$,
  'PT404', NULL,
  'un jeton de note VIVANT n''ouvre pas la collection'
);

select devenir('11111111-1111-1111-1111-111111111111');
update share_links set revoked_at = now()
 where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select devenir_anonyme();
select throws_ok(
  $$ select * from get_shared_notes('jeton-collection') $$,
  'PT404', NULL,
  'révoquer le lien de collection ferme tout, aussitôt'
);

-- LE CONTRAT, PAS LE TEXTE DE LA FONCTION. `get_shared_notes` filtre bien sur
-- `n.user_id` — c'est ainsi qu'elle sait de qui sont les notes ; chercher cette
-- chaîne dans son corps confondrait « s'en servir » et « le rendre ». Ce sont
-- les colonnes RENDUES qu'il faut regarder.
select ok(
  pg_get_function_result('get_shared_notes(text)'::regprocedure)
    !~* '(user|owner)_id',
  'get_shared_notes ne rend ni user_id ni owner_id'
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
