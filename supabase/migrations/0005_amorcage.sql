-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Amorçage : la source, le document, la saison, la        ║
-- ║ politique d'import, et la table anti-pause.                               ║
-- ║                                                                          ║
-- ║ Tout est IDEMPOTENT par `where not exists` — jamais `on conflict do       ║
-- ║ nothing` sur une clé `identity`, qui ne conflicte jamais (leçon du        ║
-- ║ keep-alive du socle, 04/09/2026). Rejouer ce fichier n'ajoute rien.       ║
-- ║                                                                          ║
-- ║ RIEN ICI N'EST PUBLIÉ. La saison naît en `pending_review` : la clé `anon` ║
-- ║ ne la voit pas, et l'application affiche la démonstration en le disant.   ║
-- ║ C'est le premier import validé, puis publié, qui la rendra visible.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── La source ─────────────────────────────────────────────────────────────
insert into reference_sources
  (id, label, base_url, api_url, licence, licence_url, attribution_required, terms_url)
select
  'wikipedia_fr',
  'Wikipédia en français',
  'https://fr.wikipedia.org',
  'https://fr.wikipedia.org/w/api.php',
  'CC BY-SA 4.0',
  'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
  true,
  'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/fr'
where not exists (select 1 from reference_sources where id = 'wikipedia_fr');

-- ── Le document suivi ─────────────────────────────────────────────────────
-- `external_id` est le pageid MediaWiki : stable même si la page est renommée.
insert into source_documents (source_id, external_id, title, url)
select
  'wikipedia_fr',
  '17479409',
  'Koh-Lanta All Stars',
  'https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars'
where not exists (
  select 1 from source_documents
  where source_id = 'wikipedia_fr'
    and url = 'https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars'
);

-- ── La saison, EN ATTENTE ─────────────────────────────────────────────────
insert into seasons (slug, name, edition_label, status, source_document_id, validation_status)
select
  'all-stars-2026',
  'Koh-Lanta All Stars',
  '25 ans',
  'airing',
  d.id,
  'pending_review'
from source_documents d
where d.source_id = 'wikipedia_fr'
  and d.url = 'https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars'
  and not exists (select 1 from seasons where slug = 'all-stars-2026');

-- ── La politique d'import : RIEN d'automatique ────────────────────────────
--
-- Un index partiel manquait : `unique (source_document_id, entity)` laisse
-- coexister plusieurs lignes à `entity is null` — les NULL ne se valent pas
-- pour une contrainte d'unicité. La politique par défaut d'un document doit
-- pourtant être unique, et `loadPolicy` la lit par `maybeSingle()`.
create unique index if not exists import_policies_default_unique
  on import_policies (source_document_id)
  where entity is null;

insert into import_policies
  (source_document_id, entity, auto_validate_unambiguous, max_auto_changes, auto_validate_retroactive)
select d.id, null, false, 0, false
from source_documents d
where d.source_id = 'wikipedia_fr'
  and d.url = 'https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars'
  and not exists (
    select 1 from import_policies p
    where p.source_document_id = d.id and p.entity is null
  );

-- ── Anti-pause du plan Free (gabarit du socle) ───────────────────────────
--
-- Le projet gratuit se met en pause après sept jours sans requête, et alors
-- plus rien ne se déploie ni ne se lit (miss-carbook en a payé le prix). Le
-- workflow `supabase-keepalive.yml` fait un SELECT anonyme sur cette table
-- tous les trois jours : une vraie requête, donc un vrai compteur remis à
-- zéro. Trois pièces, aucune n'est facultative : la table, les deux secrets,
-- le workflow. Sans la table, le ping répond 404 en silence.
create table if not exists keep_alive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now()
);

alter table keep_alive enable row level security;

drop policy if exists keep_alive_lecture_anonyme on keep_alive;
create policy keep_alive_lecture_anonyme
  on keep_alive for select to anon using (true);

-- Double verrou, comme ailleurs : le droit SQL EN PLUS de la politique.
grant select on keep_alive to anon;

insert into keep_alive (pinged_at)
select now()
where not exists (select 1 from keep_alive);
