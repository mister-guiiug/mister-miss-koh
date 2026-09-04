-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Pipeline d'import (extraction → diff → publication)     ║
-- ║                                                                          ║
-- ║ LE RÉFÉRENTIEL N'EST JAMAIS ÉCRIT PAR UNE EXTRACTION. Une extraction      ║
-- ║ produit des PROPOSITIONS ; un humain (ou une règle explicitement          ║
-- ║ autorisée) les accepte ; une publication transactionnelle les applique.   ║
-- ║ Ces trois moments sont trois tables, parce qu'ils sont trois              ║
-- ║ responsabilités et qu'on doit pouvoir revenir sur chacun.                 ║
-- ║                                                                          ║
-- ║ POURQUOI CE N'EST PAS DU LUXE. La source est une page collaborative,      ║
-- ║ d'une saison EN COURS : elle change chaque semaine, elle se corrige       ║
-- ║ rétroactivement, et elle portait le 04/09/2026 un bandeau « Section à     ║
-- ║ sourcer ». Écrire son contenu directement dans le référentiel, c'est      ║
-- ║ donner à n'importe quel contributeur anonyme un accès en écriture à la    ║
-- ║ base — sans relecture et sans retour arrière.                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Exécutions d'import
-- ════════════════════════════════════════════════════════════════════════════

create type import_trigger as enum ('manual', 'scheduled', 'backfill');

create type import_run_status as enum (
  'running',
  'unchanged', -- la révision distante est celle déjà traitée : on s'arrête
  'extracted', -- contenu extrait, diff pas encore calculé
  'diffed', -- différences calculées, en attente de relecture
  'published', -- lot publié dans le référentiel
  'failed',
  'reverted'
);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null
    references source_documents (id) on delete restrict,
  trigger import_trigger not null default 'manual',
  triggered_by uuid, -- auth.users.id ; null = tâche planifiée
  status import_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- IDENTITÉ DE LA RÉVISION, pas empreinte du HTML. MediaWiki expose un
  -- `revid` monotone et un horodatage : deux lectures de la même révision
  -- sont identiques par construction, là où le HTML rendu varie (bandeaux,
  -- rendu des modèles) et déclencherait des différences fantômes.
  source_revision text,
  source_revision_at timestamptz,
  -- Empreinte du contenu EXTRAIT (le modèle intermédiaire, pas la page) :
  -- elle détecte qu'une nouvelle révision n'a rien changé d'utile.
  extract_hash text,
  http_status integer,
  error_message text,
  -- Compteurs de restitution, alimentés à la fin du diff.
  differences_total integer not null default 0,
  differences_ambiguous integer not null default 0,
  notes text
);

create index on import_runs (source_document_id, started_at desc);
create index on import_runs (status);

comment on column import_runs.extract_hash is
  'Empreinte du modèle intermédiaire. Une nouvelle révision au contenu inchangé se termine en `unchanged` sans produire une seule différence.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Enregistrements extraits (modèle intermédiaire, avant toute décision)
-- ════════════════════════════════════════════════════════════════════════════

-- Les entités que le pipeline sait extraire. Une valeur inconnue de cette
-- liste est un bug d'extraction, pas une donnée : l'enum le dit tout de suite.
create type referential_entity as enum (
  'season',
  'season_rule',
  'contestant',
  'season_contestant',
  'team',
  'team_membership',
  'pair',
  'episode',
  'challenge',
  'challenge_result',
  'council',
  'council_round',
  'council_vote',
  'departure',
  'reinstatement',
  'advantage'
);

create table import_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references import_runs (id) on delete cascade,
  entity referential_entity not null,
  -- CLÉ NATURELLE lisible, stable entre deux imports : c'est elle qui permet
  -- de reconnaître « le même » objet d'une révision à l'autre sans dépendre
  -- de l'ordre des lignes du tableau source, qui n'est pas stable.
  natural_key text not null,
  payload jsonb not null,
  -- Extrait BRUT correspondant (wikitexte ou fragment HTML) : ce qui permet à
  -- un relecteur de trancher une ambiguïté sans rouvrir la page.
  raw_excerpt text,
  source_section text, -- 'Déroulement', 'Détails des votes'…
  anomalies text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, entity, natural_key)
);

create index on import_records (run_id, entity);
create index on import_records using gin (anomalies);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Différences proposées
-- ════════════════════════════════════════════════════════════════════════════

create type difference_operation as enum ('insert', 'update', 'delete');

-- CLASSIFIER AVANT DE DÉCIDER. Une insertion de nouvel épisode est sans
-- ambiguïté ; une correction rétroactive d'un vote déjà publié ne l'est
-- jamais. Seule la première catégorie peut être validée automatiquement, et
-- seulement si `import_policies` l'autorise explicitement.
create type difference_class as enum (
  'unambiguous', -- nouvelle donnée, aucun conflit
  'ambiguous', -- interprétation incertaine (cellule vide, libellé nouveau)
  'retroactive', -- modifie une donnée DÉJÀ PUBLIÉE
  'conflicting', -- contredit une autre différence du même lot
  'suspicious' -- volume ou nature anormale (garde-fou anti-vandalisme)
);

create table import_differences (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references import_runs (id) on delete cascade,
  record_id uuid references import_records (id) on delete set null,
  entity referential_entity not null,
  natural_key text not null,
  operation difference_operation not null,
  class difference_class not null default 'ambiguous',
  -- Cible dans le référentiel publié. Null pour une insertion.
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  -- Champs réellement touchés : c'est ce qui rend le diff LISIBLE au lieu de
  -- montrer deux objets entiers à comparer à l'œil.
  changed_fields text[] not null default '{}',
  status validation_status not null default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comment text,
  publication_id uuid, -- renseigné à la publication (FK ajoutée plus bas)
  created_at timestamptz not null default now(),
  unique (run_id, entity, natural_key, operation)
);

create index on import_differences (run_id, status);
create index on import_differences (class);
create index on import_differences (entity, natural_key);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Publications et retour arrière
-- ════════════════════════════════════════════════════════════════════════════

-- UN LOT, PAS UNE LIGNE. Publier épisode par épisode laisserait le référentiel
-- dans un état mi-ancien mi-nouveau si l'opération s'interrompt : un conseil
-- publié sans ses votes est pire qu'un conseil absent.
create table publications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references import_runs (id) on delete restrict,
  published_at timestamptz not null default now(),
  published_by uuid,
  differences_applied integer not null default 0,
  -- Instantané des lignes AVANT application, par entité et identifiant. C'est
  -- ce qui rend le retour arrière possible sans versionner chaque table.
  rollback_snapshot jsonb not null default '[]'::jsonb,
  reverted_at timestamptz,
  reverted_by uuid,
  revert_reason text,
  notes text
);

alter table import_differences
  add constraint import_differences_publication_fkey
  foreign key (publication_id) references publications (id) on delete set null;

create index on publications (run_id);

-- VERSION DU RÉFÉRENTIEL. Un entier qui n'avance qu'à la publication : c'est
-- lui que la PWA compare pour savoir s'il faut retélécharger, au lieu de
-- rapatrier tout le référentiel à chaque ouverture.
create table referential_versions (
  id bigint generated always as identity primary key,
  season_id uuid references seasons (id) on delete cascade,
  publication_id uuid references publications (id) on delete set null,
  created_at timestamptz not null default now(),
  summary text
);

create index on referential_versions (season_id, id desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Politique d'import — l'automatisation est un CHOIX ÉCRIT
-- ════════════════════════════════════════════════════════════════════════════

-- Le besoin autorise la validation automatique des changements non ambigus
-- « si cette règle est explicitement autorisée ». Elle l'est donc ici, par
-- source et par entité, avec un plafond : au-delà de `max_auto_changes`, même
-- des différences non ambiguës attendent un humain. Un import qui voudrait
-- réécrire cent lignes d'un coup n'est pas une mise à jour, c'est un incident.
create table import_policies (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null
    references source_documents (id) on delete cascade,
  entity referential_entity,
  auto_validate_unambiguous boolean not null default false,
  max_auto_changes integer not null default 20 check (max_auto_changes >= 0),
  -- Une correction rétroactive n'est JAMAIS automatique : le défaut est faux
  -- et la colonne existe pour qu'on doive l'écrire pour le changer.
  auto_validate_retroactive boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (source_document_id, entity)
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Journal d'audit
-- ════════════════════════════════════════════════════════════════════════════

create table audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid, -- auth.users.id ; null = système
  action text not null, -- 'import.publish', 'note.share.revoke'…
  target_type text,
  target_id text,
  -- RÉSUMÉ, jamais le contenu. Une note privée ne doit pas fuiter par le
  -- journal qui trace sa suppression.
  summary text,
  created_at timestamptz not null default now()
);

create index on audit_events (occurred_at desc);
create index on audit_events (actor_id, occurred_at desc);

comment on column audit_events.summary is
  'Résumé non sensible. Ne JAMAIS y écrire le corps d''une note, un pseudonyme privé ou une adresse électronique.';

-- ── Verrou : RLS activée et forcée sur les tables créées ici ───────────────
do $$
declare t text;
begin
  for t in select unnest(array[
    'import_runs', 'import_records', 'import_differences',
    'publications', 'referential_versions', 'import_policies', 'audit_events'
  ]) loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
