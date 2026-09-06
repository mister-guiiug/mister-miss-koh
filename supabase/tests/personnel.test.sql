-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Ce qui suit le compte — pgTAP. Lancement : `supabase test db`             ║
-- ║ (ou `npm run test:personnel:remote`, sans Docker, contre la base liée).   ║
-- ║                                                                          ║
-- ║ CE FICHIER NE PARLE PAS DE PARTAGE. `rls.test.sql` couvre les notes, les  ║
-- ║ liens et leurs portées — 33 assertions depuis la migration 0021. Ici,     ║
-- ║ trois choses qu'aucun test ne disait, et qui n'ont demandé aucune         ║
-- ║ migration : les tables et les politiques existent depuis 0003 et 0004,    ║
-- ║ personne n'avait jamais vérifié qu'elles tiennent.                        ║
-- ║                                                                          ║
-- ║  1. VU SUR L'APPAREIL A, LU SUR L'APPAREIL B. Les favoris et les épisodes ║
-- ║     vus ne vivaient que dans le magasin local : l'anti-spoiler — la       ║
-- ║     fonction centrale de l'application — n'était pas le même d'un         ║
-- ║     appareil à l'autre. Le serveur, lui, ne connaît pas les appareils :   ║
-- ║     deux appareils du même compte sont deux sessions portant le même      ║
-- ║     `sub`. « Retrouver sur la tablette ce qu'on a coché sur le            ║
-- ║     téléphone » se prouve donc ainsi — ce que A écrit, une session de A   ║
-- ║     le lit, et une session de B ne le lit pas.                            ║
-- ║                                                                          ║
-- ║  2. UNE LECTURE SANS FILTRE NE REND QUE LES SIENNES, sur ces deux         ║
-- ║     tables-là — et c'est le § 0 qui dit pourquoi.                         ║
-- ║                                                                          ║
-- ║  3. UNE SUPPRESSION SE DÉFAIT. `deleted_at` rend la note invisible à son  ║
-- ║     PROPRE auteur — d'où l'absence de corbeille : lister ses supprimées   ║
-- ║     demanderait une politique de lecture de plus.                        ║
-- ║                                                                          ║
-- ║     CE PARAGRAPHE DISAIT LE CONTRAIRE, ET C'EST CE QUI A COÛTÉ LE PLUS    ║
-- ║     CHER. Il affirmait que « la politique de mise à jour ne filtre pas    ║
-- ║     sur `deleted_at`, donc on peut écrire dans une ligne qu'on ne lit     ║
-- ║     plus ». C'est faux : la ligne issue d'un `update` doit RESTER         ║
-- ║     VISIBLE sous une politique de SELECT, et une note supprimée ne l'est  ║
-- ║     sous aucune. Personne n'avait donc jamais pu supprimer une note —     ║
-- ║     l'application non plus. Ce fichier le disait depuis le début, en      ║
-- ║     échouant ; il a fallu qu'un job de CI le lise pour qu'on l'entende.   ║
-- ║     Corrigé par la migration 0023 (`delete_note`, `restore_note`).        ║
-- ║                                                                          ║
-- ║ LE PIÈGE DU « OU ». Les politiques permissives se combinent par OU : sur  ║
-- ║ `personal_notes`, « les miennes » plus « les publiques » donne une        ║
-- ║ lecture sans filtre qui rend celles des autres. Le § 0 fige le NOMBRE de  ║
-- ║ politiques de lecture de chaque table personnelle : le jour où quelqu'un  ║
-- ║ ajoutera « les favoris d'un profil public », ce fichier tombera — avant   ║
-- ║ la production, et non le jour où quelqu'un publiera son profil.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(21);

-- ── Décor ─────────────────────────────────────────────────────────────────
-- Deux comptes, une saison publiée à deux candidats et deux épisodes, et le
-- suivi de A. « Donnée fictive de démonstration » : aucun de ces noms n'est
-- réel.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@exemple.test');

insert into seasons (id, slug, name, validation_status) values
  ('a0000000-0000-4000-8000-000000000001',
   'saison-du-suivi', 'Saison fictive du suivi', 'published');

insert into contestants (id, slug, display_name, validation_status) values
  ('a0000000-0000-4000-8000-000000000011', 'candidat-un', 'Candidat Un', 'published'),
  ('a0000000-0000-4000-8000-000000000012', 'candidat-deux', 'Candidat Deux', 'published');

insert into season_contestants
  (id, season_id, contestant_id, display_name, validation_status) values
  ('a0000000-0000-4000-8000-000000000021',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000011', 'Candidat Un', 'published'),
  ('a0000000-0000-4000-8000-000000000022',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000012', 'Candidat Deux', 'published');

insert into episodes (id, season_id, number, validation_status) values
  ('a0000000-0000-4000-8000-000000000031',
   'a0000000-0000-4000-8000-000000000001', 1, 'published'),
  ('a0000000-0000-4000-8000-000000000032',
   'a0000000-0000-4000-8000-000000000001', 2, 'published');

-- Le suivi de A, tel qu'un appareil l'aurait poussé.
insert into watched_episodes (user_id, episode_id) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-4000-8000-000000000031'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-4000-8000-000000000032');

insert into user_favorites (user_id, season_contestant_id) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-4000-8000-000000000021');

-- Le suivi de B : un seul épisode, et pas le même. Sans lui, « B ne voit rien »
-- passerait aussi si la table était vide pour tout le monde.
insert into watched_episodes (user_id, episode_id) values
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-4000-8000-000000000031');

-- La note de A : celle qu'on supprimera, puis restaurera.
insert into personal_notes (id, user_id, season_id, title, body, visibility)
values
  ('a0000000-0000-4000-8000-000000000041',
   '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-4000-8000-000000000001',
   'Note de A', 'contenu à retrouver intact', 'private'),
  -- Celle de B : c'est elle qui prouve que la porte de 0023 regarde À QUI
  -- elle ouvre. Sans une note d'autrui, « refusé » se confondrait avec
  -- « n'existe pas ».
  ('a0000000-0000-4000-8000-000000000042',
   '22222222-2222-2222-2222-222222222222',
   'a0000000-0000-4000-8000-000000000001',
   'Note de B', 'contenu de B', 'private');

-- Se faire passer pour un utilisateur : rôle + revendication `sub` du jeton,
-- exactement ce que PostgREST met en place à chaque requête.
create or replace function devenir(who uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
end $$;

-- Le code d'erreur d'un refus, sans passer par `throws_ok` — dont la surcharge
-- à quatre arguments ne se laisse pas résoudre ici. On compare un `sqlstate`
-- avec `is()` : même verdict, aucune ambiguïté.
create or replace function refus_de(fn text, note uuid) returns text
language plpgsql as $$
begin
  execute format('select %I($1)', fn) using note;
  return 'aucun refus';
exception when others then
  return sqlstate;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Combien de politiques de lecture, exactement
-- ════════════════════════════════════════════════════════════════════════════
-- Compté AVANT tout changement de rôle : `pg_policies` décrit le schéma, pas
-- ce qu'un appelant voit.
--
-- Ce n'est pas de la paranoïa de catalogue : sur `personal_notes`, la deuxième
-- politique de lecture est précisément ce qui oblige `src/backend/notes.ts` à
-- filtrer sur `user_id`. Les deux tables du suivi n'en ont qu'une aujourd'hui,
-- et une lecture sans filtre y est donc sûre — `src/backend/personal.ts`
-- filtre quand même, et ces trois chiffres disent pourquoi il a raison de ne
-- pas s'en remettre à la RLS seule. Le jour où une deuxième politique arrive,
-- le fichier tombe, au lieu de laisser un écran « Mes favoris » afficher ceux
-- d'un inconnu.

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'user_favorites'
      and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')), 1,
  'user_favorites : UNE seule politique permissive de lecture'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'watched_episodes'
      and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')), 1,
  'watched_episodes : UNE seule politique permissive de lecture'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'personal_notes'
      and permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')), 2,
  'personal_notes en a DEUX — « les miennes » et « les publiques » —, et c''est pour cela que le client filtre'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Vu sur l'appareil A, lu sur l'appareil B — du même compte
-- ════════════════════════════════════════════════════════════════════════════

select devenir('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from watched_episodes
    where user_id = '11111111-1111-1111-1111-111111111111'), 2,
  'A retrouve les deux épisodes marqués vus : le suivi est sur le compte, pas sur l''appareil'
);
select is(
  (select count(*)::int from user_favorites
    where user_id = '11111111-1111-1111-1111-111111111111'), 1,
  'A retrouve son favori'
);

select devenir('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*)::int from watched_episodes
    where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'B ne voit AUCUN épisode vu de A, même en nommant son identifiant'
);
select is(
  (select count(*)::int from user_favorites
    where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'B ne voit AUCUN favori de A'
);

select throws_ok(
  $$ insert into watched_episodes (user_id, episode_id)
     values ('11111111-1111-1111-1111-111111111111',
             'a0000000-0000-4000-8000-000000000031') $$,
  NULL, 'B ne peut pas marquer un épisode vu au nom de A'
);
select throws_ok(
  $$ insert into user_favorites (user_id, season_contestant_id)
     values ('11111111-1111-1111-1111-111111111111',
             'a0000000-0000-4000-8000-000000000022') $$,
  NULL, 'B ne peut pas ajouter un favori au nom de A'
);

-- UNE SUPPRESSION BLOQUÉE PAR LA RLS NE LÈVE PAS : elle ne touche aucune
-- ligne, en silence. Le seul constat honnête se fait depuis A, après coup.
delete from watched_episodes
 where user_id = '11111111-1111-1111-1111-111111111111';
delete from user_favorites
 where user_id = '11111111-1111-1111-1111-111111111111';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Une lecture SANS filtre ne rend que les siennes
-- ════════════════════════════════════════════════════════════════════════════
-- Le contraire de `personal_notes`, et c'est le point. Ces comptages sont
-- cadrés sur le décor : la base hébergée porte de vraies lignes, mais aucune
-- n'appartient aux deux comptes de fantaisie créés ici.

select is(
  (select count(*)::int from watched_episodes), 1,
  'B, sans clause user_id, ne voit QUE son propre épisode vu'
);

select devenir('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from watched_episodes), 2,
  'les deux épisodes vus de A ont survécu à la tentative de suppression de B'
);
select is(
  (select count(*)::int from user_favorites), 1,
  'le favori de A a survécu, lui aussi'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Supprimer, puis annuler
-- ════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from personal_notes
    where id = 'a0000000-0000-4000-8000-000000000041'), 1,
  'avant suppression, A lit sa note'
);

-- CE TEST A ÉCHOUÉ, ET IL AVAIT RAISON. Il posait `deleted_at` par un `update`
-- direct — ce que l'application fait aussi — et PostgreSQL le refusait :
-- « new row violates row-level security policy ». La ligne issue d'un `update`
-- doit rester visible sous une politique de SELECT, et les deux politiques de
-- lecture portent `deleted_at is null`. Personne n'avait donc JAMAIS pu
-- supprimer une note. La migration 0023 ouvre la porte étroite qui manquait ;
-- ces assertions passent maintenant par elle, comme l'application.
select lives_ok(
  $$select delete_note('a0000000-0000-4000-8000-000000000041')$$,
  'A supprime sa note — ce qu''un `update` direct ne permet pas'
);

select is(
  (select count(*)::int from personal_notes
    where id = 'a0000000-0000-4000-8000-000000000041'), 0,
  'supprimée, la note devient invisible À SON PROPRE AUTEUR — d''où l''absence de corbeille'
);

-- La fonction est `security definer` : elle voit tout. C'est son `user_id =
-- auth.uid()` qui tient lieu de politique, et c'est donc lui qu'il faut
-- éprouver — sinon la porte ouvrirait à qui la pousse.
select devenir('22222222-2222-2222-2222-222222222222');
select is(
  refus_de('restore_note', 'a0000000-0000-4000-8000-000000000041'), 'P0002',
  'B ne peut pas ressusciter la note de A : la fonction ne la lui rend pas'
);

select devenir('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from personal_notes
    where id = 'a0000000-0000-4000-8000-000000000041'), 0,
  'et elle est toujours supprimée'
);

-- L'annulation, faite par son auteur. La note revient AVEC son contenu :
-- rien n'avait été effacé, seule une date avait été posée.
select is(
  (select title from restore_note('a0000000-0000-4000-8000-000000000041')),
  'Note de A',
  'restaurée par son auteur, la note revient avec son titre'
);

select is(
  (select count(*)::int from personal_notes
    where id = 'a0000000-0000-4000-8000-000000000041'), 1,
  'et elle redevient lisible'
);

select is(
  refus_de('delete_note', 'a0000000-0000-4000-8000-000000000042'), 'P0002',
  'la note de B ne se supprime pas depuis le compte de A'
);
select is(
  (select body from personal_notes
    where id = 'a0000000-0000-4000-8000-000000000041'),
  'contenu à retrouver intact',
  'et elle revient AVEC son contenu : rien n''avait été effacé, seule une date avait été posée'
);

select * from finish();
rollback;
