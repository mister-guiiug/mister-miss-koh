-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Partage éphémère d'une photo — pgTAP.                                    ║
-- ║                                                                          ║
-- ║ Ce que ces tests tiennent n'est pas « les fonctions existent » mais les   ║
-- ║ PROMESSES faites à l'écran : une seule ouverture, un jour au plus, cinq   ║
-- ║ partages actifs qui glissent, et des octets que personne ne relit.        ║
-- ║                                                                          ║
-- ║ Sans Docker : `npm run test:photo:remote`.                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(24);

-- ── Décor ─────────────────────────────────────────────────────────────────
-- Deux comptes. A partage un portrait ; B en partage un autre et traîne un
-- partage déjà périmé — celui qui sépare « inaccessible » de « effacé ».

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@exemple.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@exemple.test');

-- `S0hM` en base64, c'est-à-dire trois octets. Assez pour prouver l'aller et
-- le retour sans encombrer le décor.
insert into photo_shares (owner_id, token, bytes, mime, label) values
  ('11111111-1111-1111-1111-111111111111', 'jeton-a',
   decode('S0hM', 'base64'), 'image/webp', 'Portrait de A'),
  ('22222222-2222-2222-2222-222222222222', 'jeton-b',
   decode('S0hM', 'base64'), 'image/webp', 'Portrait de B');

-- EN DERNIER, et pour B : le déclencheur efface les partages périmés du
-- propriétaire à chaque insertion. Posé avant `jeton-b`, celui-ci l'emporterait.
insert into photo_shares
  (owner_id, token, bytes, mime, label, created_at, expires_at) values
  ('22222222-2222-2222-2222-222222222222', 'jeton-perime',
   decode('S0hM', 'base64'), 'image/webp', 'Portrait périmé',
   now() - interval '2 days', now() - interval '1 day');

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

-- `set role` se juge sur l'utilisateur de SESSION, pas sur le rôle courant :
-- on peut donc toujours revenir, même depuis `anon`.
create or replace function redevenir_maitre() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Les droits : ce que le moteur refuse, aucun code n'a à s'en souvenir
-- ════════════════════════════════════════════════════════════════════════════

select ok(
  not has_table_privilege('anon', 'photo_shares', 'select'),
  'un anonyme ne peut pas lire la table — le jeton est le seul chemin');

select ok(
  not has_column_privilege('authenticated', 'photo_shares', 'bytes', 'select'),
  'les octets ne sont lisibles par PERSONNE, pas même par leur propriétaire');

select ok(
  has_column_privilege('authenticated', 'photo_shares', 'token', 'select'),
  'le jeton, lui, se relit : c''est le lien qu''on vient de donner');

select ok(
  not has_table_privilege('authenticated', 'photo_shares', 'update'),
  'aucun `update` : une péremption ne se repousse pas');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Chacun chez soi
-- ════════════════════════════════════════════════════════════════════════════

select devenir('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*) from photo_shares), 1::bigint,
  'A ne voit que son partage');

select devenir('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*) from photo_shares), 2::bigint,
  'B voit les siens — le sien vivant et le sien périmé — et rien de A');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Lire, c'est consommer
-- ════════════════════════════════════════════════════════════════════════════

select redevenir_maitre();

-- La lecture DÉTRUIT : pour l'examiner sous plusieurs angles, il faut la
-- retenir. La table est créée ici, mais REMPLIE par l'anonyme — c'est lui, le
-- destinataire d'un lien.
create temp table lu (photo_base64 text, photo_mime text, photo_label text);
grant insert, select on lu to anon;

select devenir_anonyme();
insert into lu select * from consume_photo_share('jeton-a');

select is(
  (select photo_base64 from lu), 'S0hM',
  'les octets reviennent intacts, en base64');

select is(
  (select photo_mime from lu), 'image/webp',
  'le type revient avec eux : le lecteur doit savoir quoi afficher');

select is(
  (select photo_label from lu), 'Portrait de A',
  'et le libellé, pour que le lecteur sache ce qu''il ouvre');

select is(
  (select count(*) from consume_photo_share('jeton-a')), 0::bigint,
  'la SECONDE lecture ne rend rien : le lien a vécu');

select redevenir_maitre();

select ok(
  not exists (select 1 from photo_shares where token = 'jeton-a'),
  'et la ligne n''est pas marquée, elle est PARTIE');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Un jour, et pas une minute de plus
-- ════════════════════════════════════════════════════════════════════════════

select devenir_anonyme();

select is(
  (select count(*) from consume_photo_share('jeton-perime')), 0::bigint,
  'un partage périmé n''ouvre rien, même une seconde après');

select redevenir_maitre();

select ok(
  exists (select 1 from photo_shares where token = 'jeton-perime'),
  'mais il est encore LÀ : inaccessible n''est pas effacé, c''est le balayage qui efface');

select ok(
  not has_function_privilege(
    'anon', 'create_photo_share(text,text,text,uuid)', 'execute'),
  'un anonyme ne DÉPOSE pas : il faut un compte pour publier quelque chose');

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Créer par la fonction, comme l'application le fait
-- ════════════════════════════════════════════════════════════════════════════

create temp table cree (token text);
grant insert, select on cree to authenticated;

select devenir('11111111-1111-1111-1111-111111111111');
insert into cree
  select create_photo_share('S0hM', 'image/webp', 'Portrait neuf', null);

select ok(
  (select length(token) from cree) >= 32,
  'la création rend un jeton, assez long pour n''être pas devinable');

select is(
  (select count(*) from photo_shares), 1::bigint,
  'et A retrouve son partage, lui qui n''en avait plus');

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Cinq actifs, en glissant
-- ════════════════════════════════════════════════════════════════════════════

select redevenir_maitre();

-- Table rase pour A, et des dates DISTINCTES : dans une transaction, `now()`
-- ne bouge pas, donc six créations d'affilée porteraient le même instant et
-- « le plus ancien » ne voudrait rien dire.
delete from photo_shares where owner_id = '11111111-1111-1111-1111-111111111111';

insert into photo_shares
  (owner_id, token, bytes, mime, label, created_at, expires_at)
select '11111111-1111-1111-1111-111111111111',
       'jeton-p' || n,
       decode('S0hM', 'base64'), 'image/webp', 'p' || n,
       now() - (make_interval(mins => 10 - n)),
       now() - (make_interval(mins => 10 - n)) + interval '1 day'
  from generate_series(1, 5) as n;

select is(
  (select count(*) from photo_shares
    where owner_id = '11111111-1111-1111-1111-111111111111'), 5::bigint,
  'cinq tiennent sans que rien ne parte');

insert into photo_shares
  (owner_id, token, bytes, mime, label, created_at, expires_at)
values ('11111111-1111-1111-1111-111111111111', 'jeton-p6',
        decode('S0hM', 'base64'), 'image/webp', 'p6',
        now(), now() + interval '1 day');

select is(
  (select count(*) from photo_shares
    where owner_id = '11111111-1111-1111-1111-111111111111'), 5::bigint,
  'le sixième n''est pas refusé — il y en a toujours cinq');

select ok(
  not exists (select 1 from photo_shares where token = 'jeton-p1'),
  'c''est le PLUS ANCIEN qui a cédé la place');

select ok(
  exists (select 1 from photo_shares where token = 'jeton-p6'),
  'et le nouveau est bien là : on vient de le donner à quelqu''un');

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Ce qui naît ne peut pas naître immortel
-- ════════════════════════════════════════════════════════════════════════════

create or replace function refuse_longue_duree() returns boolean
language plpgsql as $$
begin
  insert into photo_shares (owner_id, token, bytes, mime, expires_at)
  values ('22222222-2222-2222-2222-222222222222', 'jeton-trop-long',
          decode('S0hM', 'base64'), 'image/webp', now() + interval '30 days');
  return false;
exception when check_violation then
  return true;
end $$;

select ok(
  refuse_longue_duree(),
  'une péremption au-delà d''un jour est refusée à l''écriture');

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Le balayage tient la promesse que la lecture ne fait qu'appliquer
-- ════════════════════════════════════════════════════════════════════════════

-- Même piège que pour la création : le privilège par défaut de Supabase
-- accorde `execute` à `anon` sur tout ce qui naît dans `public`. Le balayage
-- ne détruit que du périmé, mais un point d'écriture sans compte reste un
-- point d'écriture sans compte.
select ok(
  not has_function_privilege('anon', 'sweep_photo_shares()', 'execute'),
  'le balayage n''est pas un point d''entrée public');

select sweep_photo_shares();

select ok(
  not exists (select 1 from photo_shares where token = 'jeton-perime'),
  'le balayage efface ce qui a passé son heure');

select ok(
  exists (select 1 from photo_shares where token = 'jeton-b'),
  'et ne touche pas à ce qui vit encore');

select * from finish();
rollback;
