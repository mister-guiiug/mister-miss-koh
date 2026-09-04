-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Référentiel PUBLIÉ (PostgreSQL / Supabase)              ║
-- ║                                                                          ║
-- ║ Données communes à tous les utilisateurs : saisons, candidats, équipes,   ║
-- ║ binômes, épisodes, épreuves, conseils, votes, départs, avantages.         ║
-- ║                                                                          ║
-- ║ TROIS PRINCIPES, et chacun vient d'un fait constaté sur la source :       ║
-- ║                                                                          ║
-- ║  1. AUCUNE LIGNE N'EST ANONYME. Toute donnée référentielle porte sa       ║
-- ║     provenance (source, révision, import) et son statut de validation.    ║
-- ║     La source est Wikipédia — collaborative, en CC BY-SA 4.0, et la page  ║
-- ║     portait le 04/09/2026 un bandeau « Section à sourcer ». Rien ici      ║
-- ║     n'est « officiel », et l'interface doit pouvoir le dire pour CHAQUE   ║
-- ║     valeur affichée.                                                     ║
-- ║                                                                          ║
-- ║  2. ZÉRO N'EST PAS INCONNU. La saison est EN COURS : la moitié du         ║
-- ║     tableau source est vide, et une élimination de binôme s'y lit         ║
-- ║     « 0 vote » — une valeur, pas une absence. Les compteurs sont donc     ║
-- ║     nullables, et un booléen `*_complet` dit si la source les donnait.    ║
-- ║                                                                          ║
-- ║  3. RIEN DE PROPRE À CETTE SAISON N'EST CODÉ EN DUR. Les « destins liés » ║
-- ║     (si l'un du duo part au conseil, l'autre part aussi) sont une règle   ║
-- ║     DE CETTE ÉDITION : elle vit dans `season_rules`, pas dans une         ║
-- ║     colonne, et le moteur lit la règle au lieu de la présumer.            ║
-- ║                                                                          ║
-- ║ La RLS est activée et FORCÉE en fin de fichier, sans aucune politique :   ║
-- ║ tant que 0004 n'a pas ouvert de lecture, ces tables sont inaccessibles.   ║
-- ║ Un schéma poussé à moitié refuse tout — il n'expose rien.                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Provenance — d'où vient chaque donnée, et jusqu'où on la croit
-- ════════════════════════════════════════════════════════════════════════════

-- Cycle de vie d'une donnée référentielle. `published` est le SEUL statut
-- lisible par une application cliente ; les trois autres vivent en attente
-- d'un regard humain (cf. 0002, pipeline d'import).
create type validation_status as enum (
  'pending_review', -- extraite, ambiguë ou non encore relue
  'validated', -- relue et acceptée, pas encore publiée
  'rejected', -- relue et refusée : conservée pour ne pas la ré-proposer
  'published' -- visible par les clients
);

-- Une source externe. `licence` et `attribution` ne sont pas décoratifs :
-- Wikipédia est en CC BY-SA 4.0 (vérifié via l'API `meta=siteinfo`), ce qui
-- oblige à citer ET à partager à l'identique toute donnée qui en dérive.
create table reference_sources (
  id text primary key, -- slug : 'wikipedia_fr'
  label text not null,
  base_url text not null,
  api_url text, -- point d'entrée MediaWiki, si la source en a un
  licence text not null, -- 'CC BY-SA 4.0'
  licence_url text not null,
  attribution_required boolean not null default true,
  terms_url text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table reference_sources is
  'Sources externes du référentiel. La licence est une contrainte de publication, pas une note de bas de page.';

-- Une page suivie chez une source. Pour MediaWiki, `external_id` est le
-- `pageid` (17479409 pour « Koh-Lanta All Stars ») : stable même si le titre
-- de la page est renommé, ce qu'un titre ne garantit pas.
create table source_documents (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references reference_sources (id) on delete restrict,
  external_id text, -- pageid MediaWiki
  title text not null,
  url text not null,
  last_seen_revision text, -- revid de la dernière révision lue
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, url)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Saisons et règles
-- ════════════════════════════════════════════════════════════════════════════

create type season_status as enum ('announced', 'airing', 'completed');

create table seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- 'all-stars-2026'
  name text not null, -- 'Koh-Lanta All Stars'
  edition_label text, -- '25 ans'
  status season_status not null default 'announced',
  first_air_date date,
  last_air_date date,
  contestant_count integer check (contestant_count is null or contestant_count > 0),
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- LES RÈGLES SONT DES DONNÉES, PAS DU CODE.
--
-- « Si un membre du duo est éliminé au conseil, son binôme part aussi » est
-- vrai de l'édition All Stars et faux des autres. L'écrire dans le moteur
-- rendrait la deuxième saison impossible à ajouter sans le réécrire ; l'écrire
-- ici la rend déclarative, testable, et surtout DATÉE : une règle peut
-- apparaître ou disparaître en cours de saison.
create type season_rule_kind as enum (
  'linked_pair_departure', -- destins liés : le binôme suit l'éliminé
  'pair_composition', -- contrainte de formation des duos
  'council_without_host', -- un conseil sans l'animateur
  'comfort_island', -- îlot du salut / récompense prolongée
  'other'
);

create table season_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  kind season_rule_kind not null,
  label text not null,
  description text,
  -- Portée temporelle : null = toute la saison.
  from_episode_number integer,
  to_episode_number integer,
  -- Paramètres libres et VALIDÉS À L'USAGE, pas ici : une règle peut porter
  -- un seuil, une liste, une exception. Un jsonb évite d'ajouter une colonne
  -- à chaque édition ; le moteur valide sa forme par zod, à la frontière.
  parameters jsonb not null default '{}'::jsonb,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    from_episode_number is null
    or to_episode_number is null
    or to_episode_number >= from_episode_number
  )
);

create index on season_rules (season_id, kind);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Personnes et participations
-- ════════════════════════════════════════════════════════════════════════════

-- UNE PERSONNE, PLUSIEURS SAISONS. Une édition « All Stars » ne rassemble que
-- des candidats déjà venus : séparer la personne de sa participation est ce
-- qui permettra de relier deux saisons sans dupliquer la personne.
create table contestants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  -- Volontairement libre et NULLABLE : la source ne donne pas toujours le
  -- genre, et l'enfermer dans un booléen le rendrait faux pour rien.
  gender text check (gender is null or gender in ('f', 'm', 'other')),
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table season_contestants (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  contestant_id uuid not null references contestants (id) on delete restrict,
  -- Le nom TEL QU'AFFICHÉ dans cette saison : un candidat peut changer de nom
  -- d'usage d'une édition à l'autre, et la fiche doit rester fidèle.
  display_name text not null,
  age_at_season integer check (age_at_season is null or age_at_season between 1 and 120),
  final_jury boolean,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, contestant_id)
);

create index on season_contestants (season_id);

-- Les saisons précédentes citées par la source sont des LIBELLÉS, pas des
-- lignes de `seasons` : on ne modélise pas des saisons qu'on ne suit pas.
-- Le jour où l'une d'elles est importée, `season_id` la relie sans migration.
create table contestant_previous_seasons (
  id uuid primary key default gen_random_uuid(),
  season_contestant_id uuid not null
    references season_contestants (id) on delete cascade,
  label text not null, -- 'Koh-Lanta : Le Totem maudit'
  season_id uuid references seasons (id) on delete set null,
  ordinal integer not null default 0,
  unique (season_contestant_id, label)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Équipes et binômes
-- ════════════════════════════════════════════════════════════════════════════

create type team_kind as enum ('initial', 'reshuffled', 'merged', 'ambassador', 'other');

create table teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  name text not null,
  kind team_kind not null default 'initial',
  colour text, -- indicatif d'affichage, jamais la seule distinction visuelle
  from_episode_number integer,
  to_episode_number integer,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name, kind)
);

-- L'APPARTENANCE EST UN INTERVALLE, pas un attribut. Un candidat change de
-- tribu ; stocker « sa » tribu sur `season_contestants` perdrait l'histoire,
-- que le tableau de bord et les statistiques doivent justement montrer.
create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  season_contestant_id uuid not null
    references season_contestants (id) on delete cascade,
  from_episode_number integer,
  to_episode_number integer,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    from_episode_number is null
    or to_episode_number is null
    or to_episode_number >= from_episode_number
  )
);

create index on team_memberships (season_contestant_id);
create index on team_memberships (team_id);

-- LES BINÔMES SONT DE PREMIÈRE CLASSE parce que la règle de départ en dépend.
-- Deux colonnes ordonnées et une contrainte d'unicité normalisée : sans elle,
-- (A,B) et (B,A) coexisteraient et le moteur trouverait deux binômes là où il
-- n'y en a qu'un.
create table pairs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  label text,
  member_a_id uuid not null references season_contestants (id) on delete cascade,
  member_b_id uuid not null references season_contestants (id) on delete cascade,
  formed_episode_number integer,
  dissolved_episode_number integer,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_a_id <> member_b_id)
);

-- Unicité indépendante de l'ordre des deux membres.
create unique index pairs_unordered_unique
  on pairs (season_id, least(member_a_id::text, member_b_id::text),
            greatest(member_a_id::text, member_b_id::text));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Épisodes, épreuves, résultats
-- ════════════════════════════════════════════════════════════════════════════

create table episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  number integer not null check (number > 0),
  title text,
  air_date date,
  -- « Jour 3 » de la source : le jour de jeu, distinct de la date de diffusion.
  day_start integer,
  day_end integer,
  summary text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, number)
);

create index on episodes (season_id, number);

create type challenge_kind as enum ('comfort', 'immunity', 'combined', 'other');
create type challenge_format as enum ('individual', 'team', 'pair', 'unknown');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes (id) on delete cascade,
  kind challenge_kind not null,
  format challenge_format not null default 'unknown',
  name text,
  reward text,
  ordinal integer not null default 0,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on challenges (episode_id, kind);

-- UN RÉSULTAT DÉSIGNE EXACTEMENT UNE ENTITÉ : un candidat, une équipe ou un
-- binôme. Trois clés étrangères nullables plutôt qu'un couple (type, id)
-- polymorphe : le couple ne peut porter AUCUNE intégrité référentielle, et un
-- identifiant orphelin y passerait inaperçu jusqu'à l'affichage.
create table challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  season_contestant_id uuid references season_contestants (id) on delete cascade,
  team_id uuid references teams (id) on delete cascade,
  pair_id uuid references pairs (id) on delete cascade,
  rank integer check (rank is null or rank > 0),
  is_winner boolean not null default false,
  -- Récompense reçue par CE résultat, quand elle diffère de celle de l'épreuve
  -- (invités d'un vainqueur, part d'un lot…).
  reward text,
  notes text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_results_one_subject check (
    (season_contestant_id is not null)::integer
    + (team_id is not null)::integer
    + (pair_id is not null)::integer = 1
  )
);

create index on challenge_results (challenge_id);
create index on challenge_results (season_contestant_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Conseils, tours de vote, votes
-- ════════════════════════════════════════════════════════════════════════════

create table councils (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes (id) on delete cascade,
  ordinal integer not null default 1,
  day integer, -- « Jour 3 »
  -- La source annonce un conseil SANS l'animateur : c'est un fait de saison,
  -- il se stocke au lieu d'être supposé toujours vrai.
  host_present boolean,
  notes text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, ordinal)
);

-- LE TOUR DE VOTE EST LE NIVEAU QUI MANQUAIT.
--
-- La source écrit « <s>9-9</s> / 11-7 » : premier vote à égalité, annulé, puis
-- second vote entre les deux ex æquo. Sans ce niveau intermédiaire, ces deux
-- décomptes s'écrasent l'un l'autre et l'égalité devient invisible.
create type council_round_outcome as enum (
  'elimination', -- un candidat est éliminé
  'tie', -- égalité : un tour suivant est organisé
  'annulled', -- tour annulé (avantage joué, incident)
  'no_elimination', -- conseil sans élimination
  'unknown' -- la source ne le dit pas encore
);

create table council_rounds (
  id uuid primary key default gen_random_uuid(),
  council_id uuid not null references councils (id) on delete cascade,
  round_number integer not null default 1 check (round_number > 0),
  outcome council_round_outcome not null default 'unknown',
  -- Décompte TEL QUE RAPPORTÉ par la source (« 11/18 » = 11 voix sur 18
  -- votants). Nullable : la source ne le donne pas toujours, et 0 est une
  -- valeur légitime — une élimination de binôme se lit « 0 vote ».
  reported_votes_for integer check (reported_votes_for is null or reported_votes_for >= 0),
  reported_votes_total integer check (reported_votes_total is null or reported_votes_total >= 0),
  -- Les votes individuels sont-ils tous connus ? Faux = le détail est partiel,
  -- et toute statistique qui les agrège doit le dire au lieu de sous-compter.
  votes_complete boolean not null default false,
  notes text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (council_id, round_number),
  check (
    reported_votes_for is null
    or reported_votes_total is null
    or reported_votes_for <= reported_votes_total
  )
);

create table council_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references council_rounds (id) on delete cascade,
  voter_id uuid not null references season_contestants (id) on delete cascade,
  target_id uuid references season_contestants (id) on delete cascade,
  -- Vote barré dans la source : exprimé, puis rendu sans effet (égalité,
  -- avantage joué). Il compte dans « votes exprimés », pas dans le résultat.
  is_annulled boolean not null default false,
  -- Le candidat n'a pas voté (absent, immunisé d'office, non montré).
  -- Distinct d'un vote inconnu : `target_id is null` + `did_not_vote = false`
  -- signifie « il a voté, on ne sait pas pour qui ».
  did_not_vote boolean not null default false,
  notes text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (round_id, voter_id),
  check (not (did_not_vote and target_id is not null))
);

create index on council_votes (round_id);
create index on council_votes (target_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Départs
-- ════════════════════════════════════════════════════════════════════════════

-- « ÉLIMINATION » EST TROP ÉTROIT — c'est le nom que le besoin donnait, et la
-- source le contredit dès le troisième épisode : Joana quitte l'aventure avec
-- ZÉRO vote, parce que son binôme a été éliminé. Ce n'est pas une élimination,
-- et l'appeler ainsi fausserait chaque statistique de votes reçus.
create type departure_kind as enum (
  'vote', -- éliminé au conseil
  'linked_pair', -- suit son binôme, sans vote
  'quit', -- abandon
  'medical', -- évacuation médicale
  'banned', -- bannissement
  'jury_exit', -- sortie vers le jury final
  'final_ranking', -- fin de parcours en finale
  'other'
);

create table departures (
  id uuid primary key default gen_random_uuid(),
  season_contestant_id uuid not null
    references season_contestants (id) on delete cascade,
  episode_id uuid references episodes (id) on delete set null,
  council_id uuid references councils (id) on delete set null,
  round_id uuid references council_rounds (id) on delete set null,
  kind departure_kind not null,
  day integer, -- « Jour 3 »
  -- Le départ qui a ENTRAÎNÉ celui-ci (binôme). Auto-référence : c'est ce qui
  -- permet à la chronologie de dire « partie à la suite de Maxime ».
  caused_by_departure_id uuid references departures (id) on delete set null,
  reason text,
  ordinal integer, -- ordre de sortie dans la saison
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un candidat ne part qu'une fois. Une réintégration se modélise par une
  -- REVENUE (table `reinstatements`), pas par la suppression du départ :
  -- l'histoire ne se réécrit pas.
  unique (season_contestant_id)
);

create index on departures (episode_id);
create index on departures (kind);

create table reinstatements (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references departures (id) on delete cascade,
  episode_id uuid references episodes (id) on delete set null,
  day integer,
  reason text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Avantages (colliers d'immunité, etc.)
-- ════════════════════════════════════════════════════════════════════════════

create type advantage_kind as enum (
  'immunity_necklace',
  'vote_advantage',
  'comfort_advantage',
  'other'
);

create table advantages (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  kind advantage_kind not null,
  label text,
  holder_id uuid references season_contestants (id) on delete set null,
  found_episode_id uuid references episodes (id) on delete set null,
  played_round_id uuid references council_rounds (id) on delete set null,
  effect text,
  source_document_id uuid references source_documents (id) on delete set null,
  validation_status validation_status not null default 'pending_review',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on advantages (season_id, kind);

-- PAS DE TABLE `immunities`. Le besoin en demandait une ; elle serait
-- entièrement DÉRIVABLE de `challenge_results` (épreuve d'immunité gagnée) et
-- d'`advantages` (collier joué). La stocker en plus, c'est se donner deux
-- vérités qui divergeront au premier import corrigé. Une vue la calcule.

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Fraîcheur des champs `updated_at`
-- ════════════════════════════════════════════════════════════════════════════

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'seasons', 'season_rules', 'contestants', 'season_contestants',
    'teams', 'pairs', 'episodes', 'challenges', 'councils',
    'departures', 'advantages'
  ]) loop
    execute format(
      'create trigger %I_touch before update on %I
         for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Verrou : RLS activée, sans aucune politique
-- ════════════════════════════════════════════════════════════════════════════
--
-- Deny-by-default au sens strict. Les politiques de lecture arrivent en 0004 ;
-- d'ici là, et si une migration s'arrête en chemin, ces tables ne répondent à
-- personne.
--
-- POURQUOI PAS `FORCE ROW LEVEL SECURITY`. Il paraît plus sûr — il soumet AUSSI
-- le propriétaire des tables aux politiques — et c'est précisément ce qui le
-- rend inutilisable ici : une fonction `security definer` s'exécute avec le
-- rôle de son propriétaire, donc celui des tables. Sous `force`, elle est
-- soumise aux politiques de l'APPELANT et ne peut plus rien lire de plus que
-- lui. Or tout le modèle de partage en dépend : lire une note par jeton,
-- vérifier qu'un identifiant public est libre, agréger l'état d'un import.
-- Chacune de ces fonctions rendrait un résultat vide, silencieusement.
--
-- Ce que `force` protégerait — une connexion directe SOUS le rôle propriétaire
-- — n'arrive pas par l'API : PostgREST se connecte en `authenticator` puis
-- bascule en `anon`, `authenticated` ou `service_role`. Le gain est nul, le
-- coût est un modèle de partage muet.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
