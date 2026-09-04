-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Données personnelles, et ce que l'on choisit d'en       ║
-- ║ montrer.                                                                 ║
-- ║                                                                          ║
-- ║ PRIVÉ PAR DÉFAUT, PARTOUT. Chaque colonne de visibilité vaut `private`    ║
-- ║ à la création. Le partage est un GESTE : il s'active, il se révoque, et   ║
-- ║ la révocation prend effet immédiatement parce qu'elle est lue à chaque    ║
-- ║ requête par la RLS, jamais recopiée dans une colonne dénormalisée.        ║
-- ║                                                                          ║
-- ║ RIEN DE PERSONNEL N'EST DÉDUIT. Le pseudonyme n'est jamais dérivé de      ║
-- ║ l'adresse électronique, et l'adresse n'apparaît dans AUCUNE table de ce   ║
-- ║ fichier : elle reste dans `auth.users`, hors de portée de l'API publique. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Profils
-- ════════════════════════════════════════════════════════════════════════════

create type visibility_level as enum (
  'private', -- personne d'autre
  'link', -- quiconque détient un lien de partage non révoqué
  'public' -- lisible par tous
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- PSEUDONYME ET IDENTIFIANT PUBLIC SONT DEUX CHOSES.
  --
  -- Le pseudonyme est un libellé d'affichage : deux personnes ont le droit de
  -- s'appeler « Tarzan ». L'unicité globale sur un libellé transformerait
  -- chaque inscription en course au nom, et c'est l'identifiant public —
  -- attribué, unique, réservable — qui sert d'adresse. Le besoin demandait
  -- une règle d'unicité « explicitement définie » : la voici.
  pseudonym text not null
    check (char_length(pseudonym) between 2 and 32),
  public_handle text unique
    check (public_handle is null or public_handle ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),

  -- Personnalisation SANS téléversement dans un premier temps : une graine et
  -- un style engendrent un avatar déterministe. Aucun fichier à modérer,
  -- aucune image protégée à héberger, aucun risque de contenu illicite.
  avatar_style text not null default 'geometric',
  avatar_seed text,
  avatar_url text, -- réservé à un téléversement futur, contrôlé
  accent_colour text
    check (accent_colour is null or accent_colour ~ '^#[0-9a-fA-F]{6}$'),
  theme text not null default 'system'
    check (theme in ('system', 'light', 'dark')),
  banner_style text,
  bio text check (bio is null or char_length(bio) <= 280),

  visibility visibility_level not null default 'private',
  -- Ce qu'un profil public montre. Chaque bascule est un consentement séparé :
  -- rendre son profil visible n'expose pas ses favoris.
  show_favorites boolean not null default false,
  show_stats boolean not null default false,
  show_notes boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column profiles.public_handle is
  'Identifiant public unique, distinct du pseudonyme et de l''identifiant technique. Null tant que le profil est privé.';

-- Termes réservés : refusés comme identifiant public. Une table plutôt qu'une
-- constante dans le code, pour l'enrichir sans redéploiement.
create table reserved_handles (
  handle text primary key,
  reason text,
  created_at timestamptz not null default now()
);

insert into reserved_handles (handle, reason) values
  ('admin', 'rôle'),
  ('administrateur', 'rôle'),
  ('moderateur', 'rôle'),
  ('support', 'rôle'),
  ('koh-lanta', 'marque tierce'),
  ('kohlanta', 'marque tierce'),
  ('tf1', 'marque tierce'),
  ('officiel', 'usurpation'),
  ('api', 'technique'),
  ('www', 'technique');

create or replace function handle_is_available(candidate text) returns boolean
language sql stable set search_path = public as $$
  select candidate is not null
     and candidate not in (select handle from reserved_handles)
     and not exists (select 1 from profiles where public_handle = candidate)
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Préférences
-- ════════════════════════════════════════════════════════════════════════════

-- L'ANTI-SPOILER EST UNE PRÉFÉRENCE DE PREMIÈRE CLASSE, et non un filtre
-- d'affichage bricolé écran par écran. La saison est en cours : afficher un
-- éliminé du dernier épisode à quelqu'un qui n'a vu que le deuxième est le
-- défaut le plus facile à commettre et le moins pardonné.
create type spoiler_mode as enum (
  'reveal_all', -- tout est visible
  'hide_unwatched', -- masque ce qui suit le dernier épisode vu
  'hide_future' -- masque ce qui suit la date du jour
);

create table user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'fr',
  spoiler spoiler_mode not null default 'hide_unwatched',
  animations_enabled boolean not null default true,
  -- Préférence EXPLICITE, distincte de `prefers-reduced-motion` : le média
  -- système reste prioritaire, celle-ci permet de couper les animations sans
  -- toucher aux réglages de l'appareil.
  reduce_motion boolean not null default false,
  default_season_id uuid references seasons (id) on delete set null,
  -- Consentements horodatés. Null = jamais donné ; on ne présume aucun accord.
  analytics_consent_at timestamptz,
  public_sharing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Favoris et suivi
-- ════════════════════════════════════════════════════════════════════════════

create table user_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_contestant_id uuid not null
    references season_contestants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, season_contestant_id)
);

create index on user_favorites (season_contestant_id);

create table watched_episodes (
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id uuid not null references episodes (id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Notes personnelles
-- ════════════════════════════════════════════════════════════════════════════

-- SEPT CIBLES POSSIBLES, SEPT CLÉS ÉTRANGÈRES NULLABLES, UNE CONTRAINTE.
--
-- Le couple polymorphe (`target_type`, `target_id`) aurait été plus court à
-- écrire et incapable de porter la moindre intégrité : rien n'y empêche un
-- identifiant d'épisode rangé sous « candidat », ni une cible supprimée de
-- laisser une note orpheline. Ici, `on delete cascade` fait son travail et la
-- contrainte garantit qu'une note vise exactement une chose.
create table personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  season_id uuid references seasons (id) on delete cascade,
  season_contestant_id uuid references season_contestants (id) on delete cascade,
  episode_id uuid references episodes (id) on delete cascade,
  team_id uuid references teams (id) on delete cascade,
  challenge_id uuid references challenges (id) on delete cascade,
  council_id uuid references councils (id) on delete cascade,
  departure_id uuid references departures (id) on delete cascade,

  title text check (title is null or char_length(title) <= 120),
  -- Markdown restreint. La table stocke la SOURCE ; le rendu est assaini côté
  -- client, et le serveur ne fait jamais confiance à un HTML reçu.
  body text not null default '' check (char_length(body) <= 20000),
  rating smallint check (rating is null or rating between 1 and 5),
  tags text[] not null default '{}',
  is_draft boolean not null default false,
  is_pinned boolean not null default false,

  visibility visibility_level not null default 'private',
  shared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Suppression logique : une note partagée puis supprimée doit cesser d'être
  -- lisible immédiatement, sans attendre une purge.
  deleted_at timestamptz,

  constraint personal_notes_one_target check (
    (season_id is not null)::integer
    + (season_contestant_id is not null)::integer
    + (episode_id is not null)::integer
    + (team_id is not null)::integer
    + (challenge_id is not null)::integer
    + (council_id is not null)::integer
    + (departure_id is not null)::integer = 1
  )
);

create index on personal_notes (user_id, updated_at desc);
create index on personal_notes (season_contestant_id) where deleted_at is null;
create index on personal_notes (episode_id) where deleted_at is null;
create index on personal_notes using gin (tags);
-- Une seule note épinglée par cible et par utilisateur n'est PAS imposée :
-- rien dans l'usage ne le justifie, et une contrainte inutile est une gêne.

-- Notation d'un candidat ou d'un épisode, séparée des notes rédigées : on note
-- souvent sans écrire, et mélanger les deux obligerait à créer une note vide.
create table user_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  season_contestant_id uuid references season_contestants (id) on delete cascade,
  episode_id uuid references episodes (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ratings_one_target check (
    (season_contestant_id is not null)::integer
    + (episode_id is not null)::integer = 1
  )
);

create unique index user_ratings_contestant_unique
  on user_ratings (user_id, season_contestant_id)
  where season_contestant_id is not null;
create unique index user_ratings_episode_unique
  on user_ratings (user_id, episode_id)
  where episode_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Liens de partage
-- ════════════════════════════════════════════════════════════════════════════

create type share_scope as enum ('profile', 'note', 'note_collection', 'favorites', 'ranking');

-- LE JETON EST IMPRÉVISIBLE ET N'EST PAS UN SECRET DE SESSION. 32 octets
-- aléatoires encodés en base64url : ni séquentiel, ni dérivé de
-- l'identifiant de l'utilisateur, ni devinable en énumérant.
create or replace function generate_share_token() returns text
language sql volatile as $$
  select translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')
$$;

create table share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique default generate_share_token(),
  scope share_scope not null,

  note_id uuid references personal_notes (id) on delete cascade,
  season_id uuid references seasons (id) on delete cascade,

  label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  -- Compteur d'ouvertures, SANS journal des visiteurs : savoir qu'un lien a
  -- été ouvert douze fois est utile ; savoir par qui ne l'est pas, et
  -- constituerait une collecte que personne n'a demandée.
  view_count integer not null default 0,
  last_viewed_at timestamptz,

  created_at timestamptz not null default now(),
  constraint share_links_scope_target check (
    (scope = 'note' and note_id is not null)
    or (scope <> 'note' and note_id is null)
  )
);

create index on share_links (owner_id, created_at desc);
create index on share_links (token) where revoked_at is null;

comment on table share_links is
  'Un lien révoqué ou expiré cesse d''ouvrir l''accès à la requête suivante : la RLS lit `revoked_at` et `expires_at`, elle ne consulte aucune copie.';

-- ── Fraîcheur ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'user_preferences', 'personal_notes', 'user_ratings'
  ]) loop
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ── Verrou : RLS activée et forcée ────────────────────────────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles', 'reserved_handles', 'user_preferences', 'user_favorites',
    'watched_episodes', 'personal_notes', 'user_ratings', 'share_links'
  ]) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
