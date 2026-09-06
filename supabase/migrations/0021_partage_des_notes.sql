-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Partager ses notes : une, ou toutes celles qu'on a rendues partageables.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- DEUX CHANGEMENTS, ET LE PREMIER EST UN CORRECTIF.
--
-- 1. `get_shared_note` JOIGNAIT `profiles` EN JOINTURE INTERNE. Aucune ligne de
--    `profiles` n'est créée nulle part — ni par un déclencheur, ni par
--    l'application, et `pseudonym` est `not null` sans valeur par défaut, donc
--    on ne peut pas en fabriquer une sans demander un pseudonyme. Résultat :
--    pour tout compte réel d'aujourd'hui, un lien de partage valide ouvrait une
--    page VIDE, sans erreur — la note existait, le lien fonctionnait, et la
--    jointure la faisait disparaître. Le test pgTAP ne l'a pas vu parce que son
--    décor insère les deux profils. Jointure EXTERNE désormais : une note se
--    lit même si son auteur n'a jamais choisi de pseudonyme.
--
-- 2. `get_shared_notes` : le lecteur du `note_collection` que le type
--    `share_scope` prévoyait depuis 0003 sans jamais lui donner de fonction.
--
-- CE QU'UN LIEN DE COLLECTION MONTRE : les notes de son propriétaire dont la
-- VISIBILITÉ est « link » ou « public » — pas une liste figée à la création.
-- C'est ce qui rend le retrait immédiat et sans cérémonie : redevenue privée,
-- une note quitte le lien à la requête suivante, sans qu'il faille révoquer le
-- lien ni en refaire un. Le lien nomme une RÈGLE, pas un instantané, et
-- l'écran qui le crée doit le dire.
--
-- Les deux fonctions gardent la discipline de 0004 : mêmes gardes (révoqué,
-- expiré, supprimé), MÊME message pour les trois — les distinguer dirait à un
-- curieux qu'un jeton a existé —, compteur de vues sans journal des visiteurs,
-- et des colonnes CHOISIES : jamais `user_id`, jamais l'identifiant du lien.

-- ── La cible d'une note, dérivée une fois pour toutes ──────────────────────
--
-- Sept colonnes nullables dont exactement une est renseignée (contrainte
-- `personal_notes_one_target`). Deux lecteurs en ont besoin ; l'écrire deux
-- fois, c'est s'assurer qu'un jour les deux divergeront. Internes : appelées
-- depuis des fonctions `security definer`, elles n'ont besoin d'aucun droit
-- pour `anon`.

create or replace function note_target(n personal_notes) returns text
language sql immutable set search_path = public as $$
  select case
    when n.season_id is not null then 'season'
    when n.season_contestant_id is not null then 'season_contestant'
    when n.episode_id is not null then 'episode'
    when n.team_id is not null then 'team'
    when n.challenge_id is not null then 'challenge'
    when n.council_id is not null then 'council'
    else 'departure'
  end
$$;

create or replace function note_target_id(n personal_notes) returns uuid
language sql immutable set search_path = public as $$
  select coalesce(n.season_id, n.season_contestant_id, n.episode_id,
                  n.team_id, n.challenge_id, n.council_id, n.departure_id)
$$;

revoke all on function note_target(personal_notes) from public;
revoke all on function note_target_id(personal_notes) from public;

-- ── Une note partagée par lien ─────────────────────────────────────────────
--
-- `create or replace` ne sait pas changer un type de retour : on retire puis on
-- recrée. La signature d'appel, elle, ne bouge pas.

drop function if exists get_shared_note(text);

create function get_shared_note(share_token text)
returns table (
  note_id uuid,
  title text,
  body text,
  rating smallint,
  tags text[],
  target text,
  target_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  author_pseudonym text,
  author_handle text
)
language plpgsql security definer set search_path = public as $$
declare link share_links%rowtype;
begin
  select * into link
    from share_links
   where token = share_token
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and scope = 'note';

  if not found then
    raise exception 'lien de partage introuvable ou expiré' using errcode = 'P0002';
  end if;

  update share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = link.id;

  return query
    select n.id, n.title, n.body, n.rating, n.tags,
           note_target(n.*), note_target_id(n.*),
           n.created_at, n.updated_at,
           p.pseudonym, p.public_handle
      from personal_notes n
      left join profiles p on p.id = n.user_id
     where n.id = link.note_id
       and n.deleted_at is null
       and n.visibility in ('link', 'public');
end $$;

revoke all on function get_shared_note(text) from public;
grant execute on function get_shared_note(text) to anon, authenticated;

-- ── Toutes les notes qu'on a rendues partageables ──────────────────────────

create or replace function get_shared_notes(share_token text)
returns table (
  note_id uuid,
  title text,
  body text,
  rating smallint,
  tags text[],
  target text,
  target_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  author_pseudonym text,
  author_handle text
)
language plpgsql security definer set search_path = public as $$
declare link share_links%rowtype;
begin
  select * into link
    from share_links
   where token = share_token
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and scope = 'note_collection';

  if not found then
    raise exception 'lien de partage introuvable ou expiré' using errcode = 'P0002';
  end if;

  update share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = link.id;

  -- Le même ordre que la liste de son auteur : épinglées d'abord, puis les
  -- plus récemment modifiées. Un lecteur qui découvre la page voit ce que
  -- l'auteur voit en haut de la sienne.
  return query
    select n.id, n.title, n.body, n.rating, n.tags,
           note_target(n.*), note_target_id(n.*),
           n.created_at, n.updated_at,
           p.pseudonym, p.public_handle
      from personal_notes n
      left join profiles p on p.id = n.user_id
     where n.user_id = link.owner_id
       and n.deleted_at is null
       and n.visibility in ('link', 'public')
     order by n.is_pinned desc, n.updated_at desc;
end $$;

revoke all on function get_shared_notes(text) from public;
grant execute on function get_shared_notes(text) to anon, authenticated;

comment on function get_shared_notes(text) is
  'Les notes « link » ou « public » du propriétaire du lien, à l''instant de la lecture : rendre une note privée la retire du partage sans révoquer le lien.';
