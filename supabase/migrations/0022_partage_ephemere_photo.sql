-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Partager une photo — un jour au plus, une ouverture au plus.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- C'EST LA PREMIÈRE FOIS QUE CETTE APPLICATION PUBLIE UNE IMAGE, et il faut le
-- dire avant tout le reste. Jusqu'ici la fiche promettait : « votre image reste
-- sur cet appareil, l'application n'en publie aucune ». Cette phrase devient
-- conditionnelle. Un partage éphémère est un dépôt volontaire, borné et
-- révocable — pas un hébergement.
--
-- UNE LIGNE, UNE VIE. Les octets sont DANS la ligne (`bytea`), pas dans un
-- bucket. Un bucket, ce sont deux durées de vie à tenir synchrones : la ligne
-- qui décrit le partage et l'objet qui porte l'image. Le jour où l'une part
-- sans l'autre, il reste des octets qui survivent à leur promesse — exactement
-- ce que cette fonctionnalité promet de ne pas faire. Une ligne : `delete`, et
-- il n'y a plus rien à orpheliner. Le portrait est déjà réduit à 120 Kio et
-- 512 px par le dépôt local ; c'est ce qui rend ce choix tenable.
--
-- LIRE, C'EST CONSOMMER. `consume_photo_share` est un `delete … returning` :
-- une seule instruction, donc deux lecteurs simultanés ne peuvent pas obtenir
-- la même image. Un `select` puis un `delete` les servirait tous les deux.
--
-- RIEN N'EST MARQUÉ, TOUT EST SUPPRIMÉ. Pas de `revoked_at`, pas de `read_at` :
-- un état « consommé » serait une ligne qui prétend ne plus exister tout en
-- existant. Conséquence assumée : après coup, on ne peut plus distinguer « ce
-- lien a servi » de « ce lien n'a jamais existé ». Les distinguer supposerait
-- de garder la trace de ce qu'on a promis d'effacer.
--
-- AUCUN `update`. Le droit n'est pas accordé, à personne : un partage se crée
-- et se détruit, il ne se modifie pas. Sa date de péremption n'est donc pas
-- repoussable, pas même par son propriétaire.
--
-- CINQ ACTIFS, EN GLISSANT. Le sixième ne se voit pas refuser : il chasse le
-- plus ancien. Un partage qu'on vient de créer est celui dont on a besoin, et
-- un plafond qui claque au visage transforme un quota en énigme.

create table photo_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Ce que le portrait montre — pour que la fiche retrouve SON partage et
  -- puisse l'éteindre. Nullable : un partage survit au retrait de la saison.
  season_contestant_id uuid references season_contestants (id) on delete set null,
  -- 32 octets aléatoires (0003). Inénumérable, ce qui compte doublement ici :
  -- deviner un jeton ne donnerait pas seulement à voir, cela DÉTRUIRAIT.
  token text not null unique default generate_share_token(),
  bytes bytea not null,
  mime text not null,
  -- Le nom du candidat, recopié du référentiel à la création : le lecteur est
  -- anonyme et n'a pas à parcourir le référentiel pour savoir ce qu'il ouvre.
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day',
  -- La borne du dépôt local est de 120 Kio ; 200 laisse la place à un format
  -- moins efficace sans ouvrir la table à autre chose qu'une vignette.
  constraint photo_shares_taille
    check (octet_length(bytes) between 1 and 200 * 1024),
  constraint photo_shares_mime
    check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  -- Un partage qui naîtrait déjà périmé, ou pour un mois, n'est pas celui
  -- qu'on a promis.
  constraint photo_shares_duree
    check (expires_at > created_at and expires_at <= created_at + interval '1 day')
);

comment on table photo_shares is
  'Partage éphémère d''une photo : la ligne PORTE les octets et meurt à la première des deux échéances — une ouverture, ou un jour. Aucun droit d''`update` n''est accordé : la péremption n''est pas repoussable.';

create index on photo_shares (owner_id, created_at desc);
create index on photo_shares (expires_at);

-- ── Qui voit quoi ──────────────────────────────────────────────────────────
--
-- Deny-by-default, comme le reste de 0004. Le propriétaire voit ses lignes ;
-- personne ne voit celles des autres ; `anon` ne voit rien du tout.
--
-- ET SURTOUT : `bytes` N'EST ACCORDÉ EN LECTURE À PERSONNE. C'est un droit de
-- COLONNE, tenu par le moteur — pas une vue qu'un jour on oublierait
-- d'utiliser. Le propriétaire n'a aucune raison de retélécharger une image
-- qu'il a déjà sur son appareil, et le lecteur passe par la fonction.
-- Conséquence à connaître : `select *` échoue depuis le client, il faut
-- nommer les colonnes.

alter table photo_shares enable row level security;

create policy photos_proprietaire on photo_shares
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on photo_shares from anon, authenticated;
grant select (id, token, label, season_contestant_id, created_at, expires_at)
  on photo_shares to authenticated;
grant insert (owner_id, season_contestant_id, bytes, mime, label)
  on photo_shares to authenticated;
grant delete on photo_shares to authenticated;

-- ── Le glissement ──────────────────────────────────────────────────────────
--
-- Dans un DÉCLENCHEUR, pas dans la fonction de création : le plafond doit
-- tenir quel que soit le chemin d'écriture, y compris un `insert` direct.

create or replace function glisser_photo_shares() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Ce qui a passé son heure part maintenant, sans attendre le balayage : un
  -- compte qui s'en sert nettoie derrière lui.
  delete from photo_shares
   where owner_id = new.owner_id
     and expires_at <= now();

  -- On garde les QUATRE plus récents ; le nouveau fera le cinquième. Le tri
  -- porte aussi sur `id` : deux créations dans la même milliseconde rendraient
  -- sinon un `offset` indécis.
  delete from photo_shares
   where id in (
     select id
       from photo_shares
      where owner_id = new.owner_id
        and expires_at > now()
      order by created_at desc, id desc
      offset 4
   );

  return new;
end $$;

revoke all on function glisser_photo_shares()
  from public, anon, authenticated;

create trigger photo_shares_glissement
  before insert on photo_shares
  for each row execute function glisser_photo_shares();

-- ── Créer ──────────────────────────────────────────────────────────────────
--
-- `security invoker` (le défaut) : la RLS s'applique, `auth.uid()` doit
-- exister, et la fonction n'accorde donc aucun pouvoir que l'appelant n'ait
-- déjà. Base64 plutôt que `bytea` brut parce que c'est ce que PostgREST sait
-- transporter sans cérémonie — et parce que le retour l'est aussi.
--
-- `extensions` DANS LE CHEMIN, ET CE N'EST PAS DÉCORATIF. Le jeton vient du
-- défaut de la colonne, donc de `generate_share_token` (0003), qui appelle
-- `gen_random_bytes` — fourni par pgcrypto, installé dans `extensions` et non
-- dans `public`. Un chemin réduit au seul `public` fait échouer l'insertion
-- avec « function gen_random_bytes(integer) does not exist », loin de sa
-- cause. Les requêtes ordinaires ne le voient pas : PostgREST, lui, a
-- `extensions` dans son chemin.

create or replace function create_photo_share(
  photo_base64 text,
  photo_mime text,
  photo_label text default null,
  contestant uuid default null
) returns text
language plpgsql set search_path = public, extensions as $$
declare cree text;
begin
  insert into photo_shares (owner_id, season_contestant_id, bytes, mime, label)
  values (auth.uid(), contestant, decode(photo_base64, 'base64'),
          photo_mime, photo_label)
  returning token into cree;
  return cree;
end $$;

-- `from public, anon` ET PAS SEULEMENT `from public`. Supabase pose un
-- privilège PAR DÉFAUT qui accorde `execute` à `anon` sur toute fonction créée
-- dans `public` : c'est une concession EXPLICITE, que retirer le droit
-- implicite de `public` ne défait pas. Sans cette ligne, n'importe qui
-- déposerait des images sans compte. Le test 14 de `photo_partage.test.sql`
-- l'a attrapé — les lecteurs de 0004, eux, l'accordaient à `anon` de toute
-- façon, et le piège n'était jamais apparu.
revoke all on function create_photo_share(text, text, text, uuid)
  from public, anon;
grant execute on function create_photo_share(text, text, text, uuid)
  to authenticated;

-- ── Lire, c'est-à-dire consommer ───────────────────────────────────────────
--
-- `delete … returning` : la lecture ET la destruction dans la même
-- instruction. Un jeton inconnu, périmé, ou déjà servi rend zéro ligne — et
-- rend la MÊME chose, faute de quoi il faudrait garder ce qu'on a effacé.

create or replace function consume_photo_share(share_token text)
returns table (photo_base64 text, photo_mime text, photo_label text)
language sql security definer set search_path = public as $$
  delete from photo_shares
   where token = share_token
     and expires_at > now()
  returning encode(bytes, 'base64'), mime, label;
$$;

revoke all on function consume_photo_share(text) from public;
grant execute on function consume_photo_share(text) to anon, authenticated;

comment on function consume_photo_share(text) is
  'Rend la photo UNE fois et l''efface dans la même instruction. Appelée en POST : l''ouverture d''un lien ne consomme rien, seul un geste le fait — les aperçus des messageries ne font que des GET.';

-- ── Le balayage ────────────────────────────────────────────────────────────
--
-- Deux mécanismes, et ils ne servent pas à la même chose. `expires_at > now()`
-- dans la fonction de lecture est le CONTRÔLE D'ACCÈS : il est immédiat et ne
-- dépend de personne. Le balayage, lui, est la PROMESSE : les octets s'en
-- vont, même si plus jamais personne n'ouvre le lien.

create or replace function sweep_photo_shares() returns integer
language plpgsql security definer set search_path = public as $$
declare efface integer;
begin
  delete from photo_shares where expires_at <= now();
  get diagnostics efface = row_count;
  return efface;
end $$;

-- Personne ne l'appelle depuis l'API : pg_cron tourne comme propriétaire du
-- travail. `anon` et `authenticated` sont nommés pour la même raison que
-- ci-dessus — le privilège par défaut de Supabase les aurait servis.
revoke all on function sweep_photo_shares() from public, anon, authenticated;

-- pg_cron tourne comme propriétaire du travail, sans passer par l'API : aucun
-- secret à poser, aucun appelant à surveiller. Le quart d'heure borne à quinze
-- minutes le sursis d'octets déjà inaccessibles.
create extension if not exists pg_cron;

select cron.schedule(
  'photo-shares-balayage',
  '*/15 * * * *',
  $$select sweep_photo_shares()$$
);
