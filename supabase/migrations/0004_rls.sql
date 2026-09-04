-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Row Level Security                                      ║
-- ║                                                                          ║
-- ║ Les tables sont en `ENABLE ROW LEVEL SECURITY` depuis 0001–0003, et sans  ║
-- ║ aucune politique : jusqu'ici elles ne répondaient à personne. Ce fichier  ║
-- ║ ouvre le strict nécessaire, et rien d'autre.                              ║
-- ║                                                                          ║
-- ║ QUATRE PRINCIPES                                                          ║
-- ║                                                                          ║
-- ║  1. DEUX VERROUS, PAS UN. Les droits SQL (`grant`) sont retirés puis      ║
-- ║     redonnés un par un, EN PLUS des politiques. Une politique mal écrite  ║
-- ║     ne suffit alors pas à ouvrir une table : il faudrait aussi s'être     ║
-- ║     trompé de `grant`. C'est la seule protection qui survive à une        ║
-- ║     erreur de politique.                                                  ║
-- ║                                                                          ║
-- ║  2. LE RÉFÉRENTIEL EST EN LECTURE SEULE, ET SEULEMENT PUBLIÉ. Aucune      ║
-- ║     politique d'écriture n'existe pour `anon` ni `authenticated` — pas    ║
-- ║     une seule, pas même pour un administrateur. Les écritures passent     ║
-- ║     par des fonctions serveur ou la clé `service_role`, qui ne quitte     ║
-- ║     jamais le serveur.                                                    ║
-- ║                                                                          ║
-- ║  3. CE QUI EXIGE UN JETON PASSE PAR UNE FONCTION, PAS PAR UNE POLITIQUE.  ║
-- ║     Une politique qui accepterait un jeton de partage obligerait à rendre ║
-- ║     `share_links` lisible — donc énumérable. Les partages par lien sont   ║
-- ║     donc servis par des RPC `security definer`, qui valident le jeton et  ║
-- ║     CHOISISSENT LES COLONNES rendues. La RLS est un contrôle de LIGNES ;  ║
-- ║     seule une fonction sait restreindre des COLONNES.                     ║
-- ║                                                                          ║
-- ║  4. LA RÉVOCATION EST LUE, JAMAIS RECOPIÉE. `revoked_at` et `expires_at`  ║
-- ║     sont évalués à chaque requête. Rien n'est mis en cache côté base, ce  ║
-- ║     qui rend une révocation effective à la requête suivante.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Rôles applicatifs
-- ════════════════════════════════════════════════════════════════════════════

create type app_role as enum ('admin', 'validator');

-- Table NON écrivable par l'API : aucune politique d'insertion ni de mise à
-- jour n'est créée plus bas. Se donner un rôle à soi-même est donc impossible
-- depuis le navigateur, quelle que soit la clé utilisée.
create table user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (user_id, role)
);

alter table user_roles enable row level security;

-- `security definer` : la fonction doit voir `user_roles` alors que l'appelant
-- n'y a accès qu'à ses propres lignes. `search_path` figé — sans lui, un
-- schéma temporaire placé devant `public` détournerait le nom de la table.
create or replace function has_role(wanted app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = wanted
  )
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin', 'validator')
  )
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Verrou SQL — tout retirer, puis redonner nommément
-- ════════════════════════════════════════════════════════════════════════════

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Référentiel — lecture du PUBLIÉ, pour tout le monde, et rien de plus
-- ════════════════════════════════════════════════════════════════════════════

-- L'application doit fonctionner sans compte : la démonstration publique lit
-- le référentiel en `anon`. Ce qui n'est pas publié reste invisible, y compris
-- aux relecteurs — ils voient les propositions dans `import_differences`, pas
-- des lignes à moitié entrées dans le référentiel.
do $$
declare t text;
begin
  for t in select unnest(array[
    'seasons', 'season_rules', 'contestants', 'season_contestants',
    'teams', 'team_memberships', 'pairs', 'episodes', 'challenges',
    'challenge_results', 'councils', 'council_rounds', 'council_votes',
    'departures', 'reinstatements', 'advantages'
  ]) loop
    execute format($p$
      create policy %I_lecture_publiee on %I
        for select to anon, authenticated
        using (validation_status = 'published')
    $p$, t, t);
    execute format('grant select on %I to anon, authenticated', t);
  end loop;
end $$;

-- Table fille sans statut propre : elle suit la participation qu'elle décrit.
create policy previous_seasons_lecture on contestant_previous_seasons
  for select to anon, authenticated
  using (
    exists (
      select 1 from season_contestants sc
      where sc.id = season_contestant_id
        and sc.validation_status = 'published'
    )
  );
grant select on contestant_previous_seasons to anon, authenticated;

-- Provenance : lisible, parce qu'une donnée sans sa source ne vaut rien et que
-- la licence CC BY-SA impose de pouvoir l'afficher.
create policy sources_lecture on reference_sources
  for select to anon, authenticated using (true);
create policy documents_lecture on source_documents
  for select to anon, authenticated using (true);
grant select on reference_sources, source_documents to anon, authenticated;

-- Version du référentiel : c'est elle que la PWA compare pour savoir s'il faut
-- retélécharger. La cacher obligerait à tout rapatrier à chaque ouverture.
create policy versions_lecture on referential_versions
  for select to anon, authenticated using (true);
grant select on referential_versions to anon, authenticated;

-- AUCUNE POLITIQUE D'ÉCRITURE N'EST CRÉÉE SUR CES TABLES. C'est volontaire et
-- c'est le cœur du modèle : le référentiel ne s'écrit que côté serveur.

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Pipeline d'import — visible des relecteurs, écrit par personne
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  for t in select unnest(array[
    'import_runs', 'import_records', 'import_differences',
    'publications', 'import_policies'
  ]) loop
    execute format($p$
      create policy %I_lecture_staff on %I
        for select to authenticated using (is_staff())
    $p$, t, t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

-- L'état d'avancement de la dernière synchronisation intéresse TOUT LE MONDE
-- (« dernière mise à jour réussie », « x éléments en attente »), sans révéler
-- le détail des propositions. Une vue expose le strict nécessaire.
create view public_import_status
with (security_invoker = false) as
  select
    r.source_document_id,
    max(r.started_at) filter (where r.status = 'published') as last_published_at,
    max(r.started_at) as last_run_at,
    (array_agg(r.status order by r.started_at desc))[1] as last_status,
    sum(r.differences_ambiguous) filter (
      where r.status in ('diffed', 'extracted')
    ) as pending_review_count
  from import_runs r
  group by r.source_document_id;

grant select on public_import_status to anon, authenticated;

comment on view public_import_status is
  'Compteurs de synchronisation, sans le contenu des propositions. `security_invoker = false` est délibéré : la vue agrège des lignes que l''appelant ne peut pas lire, et n''en rend que des totaux.';

-- Relire une proposition est une DÉCISION, pas une mise à jour de colonne.
-- Aucune politique `update` n'existe sur `import_differences` : passer par une
-- fonction permet de vérifier le rôle, de tracer l'acte, et d'interdire de
-- toucher aux autres colonnes — ce qu'une politique de ligne ne sait pas faire.
create or replace function review_difference(
  difference_id uuid,
  decision validation_status,
  comment_text text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  if decision not in ('validated', 'rejected') then
    raise exception 'décision invalide : % (attendu validated ou rejected)', decision
      using errcode = '22023';
  end if;

  update import_differences
     set status = decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_comment = comment_text
   where id = difference_id
     and status = 'pending_review';

  if not found then
    raise exception 'différence introuvable ou déjà relue' using errcode = 'P0002';
  end if;

  insert into audit_events (actor_id, action, target_type, target_id, summary)
  values (auth.uid(), 'import.review', 'import_difference',
          difference_id::text, 'décision : ' || decision);
end $$;

revoke all on function review_difference(uuid, validation_status, text) from public;
grant execute on function review_difference(uuid, validation_status, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Profils
-- ════════════════════════════════════════════════════════════════════════════

-- LA RLS NE FILTRE PAS LES COLONNES : rendre une ligne lisible, c'est rendre
-- TOUTE la ligne lisible. C'est précisément pourquoi `profiles` ne contient
-- aucune adresse électronique — elle reste dans `auth.users`, hors de portée
-- de l'API publique. La protection est dans le schéma, pas dans une politique
-- qu'on pourrait oublier.
create policy profils_lecture_proprietaire on profiles
  for select to authenticated using (id = auth.uid());

create policy profils_lecture_publique on profiles
  for select to anon, authenticated using (visibility = 'public');

create policy profils_creation on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profils_maj on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy profils_suppression on profiles
  for delete to authenticated using (id = auth.uid());

grant select, insert, update, delete on profiles to authenticated;
grant select on profiles to anon;

-- L'identifiant public est un espace de noms partagé : sa disponibilité doit
-- être vérifiable sans lire les profils d'autrui. `security definer` répare
-- ici un défaut de 0003 — la fonction y était `stable` simple, donc soumise à
-- la RLS de l'appelant : elle aurait répondu « disponible » pour un
-- identifiant déjà pris, puisque l'appelant ne voit pas le profil qui le
-- détient. Le doublon aurait été refusé plus tard, par la contrainte, avec un
-- message technique et après la saisie.
create or replace function handle_is_available(candidate text) returns boolean
language sql stable security definer set search_path = public as $$
  select candidate is not null
     and candidate ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'
     and not exists (select 1 from reserved_handles where handle = candidate)
     and not exists (select 1 from profiles where public_handle = candidate)
$$;

revoke all on function handle_is_available(text) from public;
grant execute on function handle_is_available(text) to anon, authenticated;

-- `reserved_handles` reste INVISIBLE : la fonction ci-dessus répond à la seule
-- question utile, et publier la liste des termes réservés inviterait à les
-- contourner par variantes.

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Données personnelles strictement privées
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  for t in select unnest(array[
    'user_preferences', 'user_favorites', 'watched_episodes', 'user_ratings'
  ]) loop
    execute format($p$
      create policy %I_proprietaire on %I
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$, t, t);
    execute format(
      'grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Notes
-- ════════════════════════════════════════════════════════════════════════════

-- Le propriétaire voit tout ce qui n'est pas supprimé ; il reste seul à
-- pouvoir modifier ou supprimer, y compris une note qu'il a partagée.
create policy notes_lecture_proprietaire on personal_notes
  for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

-- Une note PUBLIQUE est lisible de tous. Le brouillon ne l'est jamais : on
-- partage ce qu'on a fini d'écrire.
create policy notes_lecture_publique on personal_notes
  for select to anon, authenticated
  using (visibility = 'public' and deleted_at is null and is_draft = false);

create policy notes_creation on personal_notes
  for insert to authenticated with check (user_id = auth.uid());

create policy notes_maj on personal_notes
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notes_suppression on personal_notes
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on personal_notes to authenticated;
grant select on personal_notes to anon;

-- PAS DE POLITIQUE POUR `visibility = 'link'`. Une politique qui accepterait
-- un jeton devrait le lire quelque part, donc rendre `share_links` lisible :
-- la table deviendrait énumérable et les liens « secrets » ne le seraient
-- plus. Le lien passe donc par la fonction du § 7.

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Liens de partage
-- ════════════════════════════════════════════════════════════════════════════

create policy liens_proprietaire on share_links
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on share_links to authenticated;

-- LIMITATION D'ABUS. Un lien de partage est bon marché à créer et coûteux à
-- modérer : sans plafond, un compte peut en produire des milliers et s'en
-- servir comme d'un hébergement anonyme. Vingt par heure suffisent largement à
-- un usage humain.
create or replace function enforce_share_link_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent integer;
begin
  select count(*) into recent
    from share_links
   where owner_id = new.owner_id
     and created_at > now() - interval '1 hour';
  if recent >= 20 then
    raise exception 'trop de liens de partage créés récemment ; réessayez plus tard'
      using errcode = '54000';
  end if;
  return new;
end $$;

create trigger share_links_quota
  before insert on share_links
  for each row execute function enforce_share_link_quota();

-- ── Lecture par jeton ──────────────────────────────────────────────────────
--
-- La fonction est le seul chemin d'accès à un partage par lien. Elle valide le
-- jeton, refuse ce qui est révoqué, expiré ou supprimé, incrémente le compteur
-- de vues — et RETOURNE DES COLONNES CHOISIES. `user_id`, `deleted_at` et
-- l'identifiant du lien n'en font pas partie : le lecteur n'a aucun besoin de
-- savoir QUI a écrit, ni de repartir de là vers d'autres données.
create or replace function get_shared_note(share_token text)
returns table (
  note_id uuid,
  title text,
  body text,
  rating smallint,
  tags text[],
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
    -- Message IDENTIQUE pour « inexistant », « révoqué » et « expiré » : les
    -- distinguer dirait à un curieux qu'un jeton a existé, ce qui transforme
    -- l'énumération en source d'information.
    raise exception 'lien de partage introuvable ou expiré' using errcode = 'P0002';
  end if;

  update share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = link.id;

  return query
    select n.id, n.title, n.body, n.rating, n.tags,
           n.created_at, n.updated_at,
           p.pseudonym, p.public_handle
      from personal_notes n
      join profiles p on p.id = n.user_id
     where n.id = link.note_id
       and n.deleted_at is null
       and n.visibility in ('link', 'public');
end $$;

revoke all on function get_shared_note(text) from public;
grant execute on function get_shared_note(text) to anon, authenticated;

-- Profil partagé par lien : mêmes règles, et les bascules de consentement du
-- profil sont respectées — un profil partagé n'expose ses favoris que si son
-- propriétaire a coché `show_favorites`.
create or replace function get_shared_profile(share_token text)
returns table (
  pseudonym text,
  public_handle text,
  avatar_style text,
  avatar_seed text,
  accent_colour text,
  banner_style text,
  bio text,
  show_favorites boolean,
  show_stats boolean
)
language plpgsql security definer set search_path = public as $$
declare link share_links%rowtype;
begin
  select * into link
    from share_links
   where token = share_token
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and scope in ('profile', 'favorites', 'ranking');

  if not found then
    raise exception 'lien de partage introuvable ou expiré' using errcode = 'P0002';
  end if;

  update share_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = link.id;

  return query
    select p.pseudonym, p.public_handle, p.avatar_style, p.avatar_seed,
           p.accent_colour, p.banner_style, p.bio,
           p.show_favorites, p.show_stats
      from profiles p
     where p.id = link.owner_id;
end $$;

revoke all on function get_shared_profile(text) from public;
grant execute on function get_shared_profile(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Rôles et journal
-- ════════════════════════════════════════════════════════════════════════════

-- Chacun voit ses propres rôles — l'interface doit savoir s'il faut afficher
-- l'écran de validation. Personne ne peut en écrire : aucune politique
-- d'insertion n'existe, l'attribution passe par la clé `service_role`.
create policy roles_lecture_propre on user_roles
  for select to authenticated using (user_id = auth.uid());
grant select on user_roles to authenticated;

create policy audit_lecture_propre on audit_events
  for select to authenticated using (actor_id = auth.uid());

create policy audit_lecture_admin on audit_events
  for select to authenticated using (has_role('admin'));

grant select on audit_events to authenticated;

-- Écriture du journal par fonction seulement : append-only, jamais modifiable,
-- et l'appelant ne choisit pas son `actor_id`.
create or replace function log_event(
  p_action text, p_target_type text, p_target_id text, p_summary text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (actor_id, action, target_type, target_id, summary)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_summary);
end $$;

revoke all on function log_event(text, text, text, text) from public;
grant execute on function log_event(text, text, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Suppression de compte et export
-- ════════════════════════════════════════════════════════════════════════════

-- Tout ce qui appartient à un utilisateur est en `on delete cascade` depuis
-- `auth.users` : supprimer le compte efface profil, préférences, favoris,
-- épisodes vus, notes, notations et liens de partage. Les liens révoqués
-- cessent donc de répondre au même instant.
--
-- L'export part des mêmes tables, dans un seul appel, pour que la portabilité
-- ne dépende pas d'une liste tenue à la main côté client — qui oublierait la
-- prochaine table ajoutée.
create or replace function export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from profiles p where p.id = auth.uid()),
    'preferences', (select to_jsonb(x) from user_preferences x where x.user_id = auth.uid()),
    'favorites', coalesce((select jsonb_agg(to_jsonb(f)) from user_favorites f where f.user_id = auth.uid()), '[]'::jsonb),
    'watched_episodes', coalesce((select jsonb_agg(to_jsonb(w)) from watched_episodes w where w.user_id = auth.uid()), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n)) from personal_notes n where n.user_id = auth.uid()), '[]'::jsonb),
    'ratings', coalesce((select jsonb_agg(to_jsonb(r)) from user_ratings r where r.user_id = auth.uid()), '[]'::jsonb),
    'share_links', coalesce((select jsonb_agg(to_jsonb(s)) from share_links s where s.owner_id = auth.uid()), '[]'::jsonb)
  )
$$;

revoke all on function export_my_data() from public;
grant execute on function export_my_data() to authenticated;
