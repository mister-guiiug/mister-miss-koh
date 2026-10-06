-- L'aperçu de la version en attente de validation, calculé à l'avance.
--
-- POURQUOI. Le soir d'un épisode, la relecture nocturne trouve souvent un lot
-- qu'elle ne peut pas publier seule : une partie de ses différences n'est pas
-- certaine (`hold_reason = en_attente`). Tant qu'un relecteur ne l'a pas
-- tranché, le site montre la version précédente, et l'accueil se contente de
-- dire qu'une révision plus récente attend. Relevé du 06/10/2026 : All Stars
-- publiée au 30/09, révision 240140469 relue le 06/10 à 20:46 UTC et retenue.
--
-- CE QUE FAIT CETTE MIGRATION. Elle permet à n'importe quel visiteur de VOIR,
-- s'il le demande et sur son seul appareil, la saison telle qu'elle serait si
-- tout le lot en attente était accepté. Rien n'est publié : le référentiel,
-- les différences et leur statut restent tels quels.
--
-- QUI CALCULE, QUI LIT. Le calcul simule une publication : il est réservé à
-- ceux qui publient déjà, les relecteurs et le rôle de service (la relecture
-- nocturne, juste après un lot retenu). Le visiteur, lui, ne fait que LIRE le
-- résultat rangé, et seulement tant qu'il décrit encore l'état du lot. Aucun
-- chemin ouvert aux anonymes ne passe par un droit de publication.
--
-- COMMENT, SANS RÉÉCRIRE LA PUBLICATION. La version en attente n'existe que
-- sous forme de différences, que seul `publish_run` sait appliquer (huit
-- entités, leurs dépendances, les remplacements en bloc). La réécrire ici, ou
-- dans l'application, ferait deux vérités qui divergeraient au premier
-- correctif. Le calcul APPELLE donc `publish_run`, dans un bloc qui finit
-- toujours par une exception : PostgreSQL revient au point de sauvegarde du
-- bloc et défait tout ce qu'il a écrit (référentiel, statuts, photo, version,
-- journal), mais une variable PL/pgSQL garde sa valeur. On y a rangé, juste
-- avant, la saison lue telle que l'application la lit.

-- ── 1. La saison, telle que l'application la lit ─────────────────────────────
--
-- Le même JSON que `fetchRows` (src/backend/supabaseReferential.ts) compose
-- par PostgREST, et que `RowsSchema` valide : l'application le passe tel quel
-- à `mapReferential`. Comme la lecture publique (0004), seules les lignes
-- `published` y entrent. Interne : aucun droit d'exécution n'est accordé.

create or replace function referentiel_de_saison(p_season_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'season', (
      select to_jsonb(s) || jsonb_build_object(
        'season_rules', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'kind', r.kind,
                   'label', r.label,
                   'from_episode_number', r.from_episode_number,
                   'to_episode_number', r.to_episode_number)
                 order by r.from_episode_number nulls first, r.label)
            from season_rules r
           where r.season_id = s.id
             and r.validation_status = 'published'), '[]'::jsonb))
        from seasons s
       where s.id = p_season_id
    ),
    'contestants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sc.id,
               'contestant_id', sc.contestant_id,
               'display_name', sc.display_name,
               'age_at_season', sc.age_at_season,
               'final_jury', sc.final_jury,
               'contestants', (
                 select jsonb_build_object('gender', c.gender)
                   from contestants c
                  where c.id = sc.contestant_id
                    and c.validation_status = 'published'),
               'contestant_previous_seasons', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'label', p.label, 'ordinal', p.ordinal)
                        order by p.ordinal)
                   from contestant_previous_seasons p
                  where p.season_contestant_id = sc.id), '[]'::jsonb),
               'team_memberships', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'team_id', m.team_id,
                          'from_episode_number', m.from_episode_number,
                          'from_day', m.from_day,
                          'to_day', m.to_day)
                        order by m.from_day nulls first, m.id)
                   from team_memberships m
                  where m.season_contestant_id = sc.id
                    and m.validation_status = 'published'), '[]'::jsonb))
             order by sc.created_at, sc.id)
        from season_contestants sc
       where sc.season_id = p_season_id
         and sc.validation_status = 'published'), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'colour', t.colour)
             order by t.created_at, t.id)
        from teams t
       where t.season_id = p_season_id
         and t.validation_status = 'published'), '[]'::jsonb),
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'member_a_id', p.member_a_id,
               'member_b_id', p.member_b_id)
             order by p.created_at, p.id)
        from pairs p
       where p.season_id = p_season_id
         and p.validation_status = 'published'), '[]'::jsonb),
    'episodes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'number', e.number,
               'air_date', e.air_date,
               'day_end', e.day_end,
               'challenges', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'kind', ch.kind,
                          'challenge_results', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'season_contestant_id', cr.season_contestant_id,
                                     'pair_id', cr.pair_id,
                                     'team_id', cr.team_id,
                                     'is_winner', cr.is_winner)
                                   order by cr.rank nulls last, cr.id)
                              from challenge_results cr
                             where cr.challenge_id = ch.id
                               and cr.validation_status = 'published'),
                            '[]'::jsonb))
                        order by ch.ordinal, ch.id)
                   from challenges ch
                  where ch.episode_id = e.id
                    and ch.validation_status = 'published'), '[]'::jsonb),
               'councils', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', co.id,
                          'council_rounds', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', r.id,
                                     'round_number', r.round_number,
                                     'outcome', r.outcome,
                                     'reported_votes_for', r.reported_votes_for,
                                     'reported_votes_total', r.reported_votes_total,
                                     'votes_complete', r.votes_complete,
                                     -- Toute la ligne, comme `council_votes(*)`
                                     -- côté application (le poids, 0037).
                                     'council_votes', coalesce((
                                       select jsonb_agg(to_jsonb(v) order by v.id)
                                         from council_votes v
                                        where v.round_id = r.id
                                          and v.validation_status = 'published'),
                                       '[]'::jsonb))
                                   order by r.round_number)
                              from council_rounds r
                             where r.council_id = co.id
                               and r.validation_status = 'published'),
                            '[]'::jsonb))
                        order by co.ordinal, co.id)
                   from councils co
                  where co.episode_id = e.id
                    and co.validation_status = 'published'), '[]'::jsonb))
             order by e.number)
        from episodes e
       where e.season_id = p_season_id
         and e.validation_status = 'published'), '[]'::jsonb),
    -- Toute la ligne, comme `departures(*)` côté application.
    'departures', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at, d.id)
        from departures d
        join season_contestants sc on sc.id = d.season_contestant_id
       where sc.season_id = p_season_id
         and sc.validation_status = 'published'
         and d.validation_status = 'published'), '[]'::jsonb),
    'advantages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'kind', a.kind,
               'label', a.label,
               'status', a.status,
               'found_day', a.found_day,
               'played_episode_id', a.played_episode_id,
               'advantage_holders', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'season_contestant_id', h.season_contestant_id,
                          'ordinal', h.ordinal)
                        order by h.ordinal)
                   from advantage_holders h
                  where h.advantage_id = a.id
                    and h.validation_status = 'published'), '[]'::jsonb))
             order by a.created_at, a.id)
        from advantages a
       where a.season_id = p_season_id
         and a.validation_status = 'published'), '[]'::jsonb),
    'version', coalesce((
      select max(v.id) from referential_versions v
       where v.season_id = p_season_id), 0),
    'provenance', (
      select to_jsonb(d) || jsonb_build_object(
               'reference_sources', (
                 select jsonb_build_object('label', rs.label)
                   from reference_sources rs
                  where rs.id = d.source_id))
        from seasons s
        join source_documents d on d.id = s.source_document_id
       where s.id = p_season_id)
  )
$$;

revoke all on function referentiel_de_saison(uuid) from public, anon, authenticated;

-- ── 2. Les aperçus rangés, un par lot ────────────────────────────────────────

create table apercus_en_attente (
  run_id uuid primary key references import_runs (id) on delete cascade,
  season_id uuid not null references seasons (id) on delete cascade,
  -- L'état du lot au moment du calcul : statut de chaque différence et
  -- version publiée de la saison. Une décision ou une publication le change,
  -- et l'aperçu cesse aussitôt d'être servi.
  empreinte text not null,
  -- La saison lue après la publication simulée ; nulle si le calcul a échoué.
  lignes jsonb,
  -- Pourquoi le calcul a échoué, pour qui relit la base. Jamais rendu au
  -- visiteur : un message d'erreur SQL n'a rien à faire dans un navigateur.
  erreur text,
  calcule_le timestamptz not null default now()
);

-- Fermée à tous : seules les fonctions ci-dessous, propriétaires, y touchent.
alter table apercus_en_attente enable row level security;
revoke all on apercus_en_attente from anon, authenticated;

--  L'état d'un lot, tel que l'aperçu le décrit.
create or replace function empreinte_du_lot(p_run_id uuid, p_season_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(concat_ws('|',
    coalesce((select max(v.id) from referential_versions v
               where v.season_id = p_season_id), 0)::text,
    (select string_agg(d.id::text || ':' || d.status::text, ',' order by d.id)
       from import_differences d
      where d.run_id = p_run_id)))
$$;

revoke all on function empreinte_du_lot(uuid, uuid) from public, anon, authenticated;

-- ── 3. Le rôle de service peut SIMULER, jamais publier un lot non validé ─────
--
-- `publish_run` laisse passer le rôle de service quand
-- `relecture_automatique_autorisee` le dit : lot entièrement validé, sans
-- ambiguïté, sans suppression, sous le plafond. Le calcul d'un aperçu porte
-- par définition sur un lot qui ne remplit pas ces conditions. Il lève donc,
-- le temps de son bloc et dans sa seule transaction, un réglage local
-- (`koh.simulation_apercu`) que cette fonction accepte EN PLUS, pour le rôle
-- de service seulement. Le bloc qui le pose finit toujours en retour au point
-- de sauvegarde : le réglage tombe avec tout le reste, et rien n'est publié.
-- Un client ne peut ni poser ce réglage (PostgREST ne transmet aucun réglage
-- libre) ni se faire passer pour le rôle de service (le jeton est signé).

create or replace function relecture_automatique_autorisee(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    and (
      coalesce(current_setting('koh.simulation_apercu', true), '') = 'on'
      or (
        (
          select count(*)::int
          from import_differences d
          where d.run_id = p_run_id
        ) between 1 and 80
        and not exists (
          select 1
          from import_differences d
          where d.run_id = p_run_id
            and (
              d.status is distinct from 'validated'
              or d.class is distinct from 'unambiguous'
              or d.operation = 'delete'
            )
        )
      )
    );
$$;

revoke all on function relecture_automatique_autorisee(uuid) from public, anon, authenticated;

-- ── 4. Calculer et ranger l'aperçu d'un lot ──────────────────────────────────
--
-- Réservé aux relecteurs et au rôle de service : ceux qui publient déjà.
-- Rend `pret`, `echec` (la raison reste dans la table) ou `rien` (pas de lot
-- en attente pour cette exécution ; l'aperçu rangé, s'il y en avait un, part).

create or replace function preparer_apercu(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run        import_runs%rowtype;
  v_season     seasons%rowtype;
  v_version    bigint;
  v_lignes     jsonb;
  v_erreur     text;
begin
  if not is_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'aperçu réservé aux relecteurs' using errcode = '42501';
  end if;

  select * into v_run from import_runs where id = p_run_id;
  if not found then
    -- `PT404` : un lot introuvable n'est pas une panne. Le code d'erreur
    -- « introuvable » de PL/pgSQL, PostgREST le range dans le fourre-tout
    -- 500 (convention et garde dans rls.test.sql).
    raise exception 'exécution d''import introuvable : %', p_run_id
      using errcode = 'PT404';
  end if;

  select * into v_season from seasons
   where source_document_id = v_run.source_document_id
     and validation_status = 'published';

  -- Rien à montrer : exécution déjà publiée ou défaite, saison pas encore en
  -- ligne, ou ni proposition en attente ni différence validée à appliquer.
  -- Une différence REJETÉE ne compte pas : un relecteur l'a écartée.
  if v_run.status <> 'diffed'
     or v_season.id is null
     or not exists (
       select 1 from import_differences
        where run_id = p_run_id
          and status in ('pending_review', 'validated')
     ) then
    delete from apercus_en_attente where run_id = p_run_id;
    return 'rien';
  end if;

  v_version := coalesce(
    (select max(id) from referential_versions where season_id = v_season.id), 0);

  begin
    perform set_config('koh.simulation_apercu', 'on', true);

    -- Accepter TOUT le lot, le temps du bloc : c'est la version demandée.
    update import_differences
       set status = 'validated'
     where run_id = p_run_id
       and status = 'pending_review';

    perform publish_run(p_run_id, 'aperçu de la version en attente, défait aussitôt');

    -- La `version` rendue est celle du PUBLIÉ : l'application compare ce
    -- numéro au serveur pour savoir s'il faut relire. Celui de la publication
    -- simulée, défaite, n'existera jamais, et ferait relire en boucle.
    v_lignes := referentiel_de_saison(v_season.id)
                || jsonb_build_object('version', v_version);

    -- Toujours : c'est cette exception qui défait la publication simulée.
    raise exception using
      errcode = 'KH001',
      message = 'aperçu calculé, publication défaite';
  exception
    when sqlstate 'KH001' then
      null;
    when others then
      v_lignes := null;
      v_erreur := sqlerrm;
  end;

  -- Le retour au point de sauvegarde l'a déjà retiré ; on le retire quand
  -- même, pour ne dépendre de rien d'implicite.
  perform set_config('koh.simulation_apercu', '', true);

  insert into apercus_en_attente (run_id, season_id, empreinte, lignes, erreur, calcule_le)
  values (p_run_id, v_season.id, empreinte_du_lot(p_run_id, v_season.id),
          v_lignes, v_erreur, now())
  on conflict (run_id) do update
     set season_id = excluded.season_id,
         empreinte = excluded.empreinte,
         lignes = excluded.lignes,
         erreur = excluded.erreur,
         calcule_le = excluded.calcule_le;

  return case when v_lignes is null then 'echec' else 'pret' end;
end $$;

revoke all on function preparer_apercu(uuid) from public, anon;
grant execute on function preparer_apercu(uuid) to authenticated, service_role;

-- Le même calcul, désigné par la saison : c'est ce que l'application connaît
-- quand un relecteur vient de trancher une proposition.
create or replace function preparer_apercu_de_saison(p_saison text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
begin
  if not is_staff() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'aperçu réservé aux relecteurs' using errcode = '42501';
  end if;
  select r.id into v_run
    from seasons s
    join import_runs r on r.source_document_id = s.source_document_id
   where s.slug = p_saison
     and r.status = 'diffed'
   order by r.started_at desc
   limit 1;
  if v_run is null then
    return 'rien';
  end if;
  return preparer_apercu(v_run);
end $$;

revoke all on function preparer_apercu_de_saison(text) from public, anon;
grant execute on function preparer_apercu_de_saison(text) to authenticated, service_role;

-- ── 5. Lire l'aperçu : ouvert à tous, en lecture seule ───────────────────────
--
-- L'aperçu servi est celui du DERNIER lot en attente de la saison (le même
-- que « Publier le lot en attente »), et seulement s'il décrit encore l'état
-- de ce lot. Une décision, une publication ou une relecture plus récente le
-- rendent périmé : on ne sert alors rien, plutôt qu'une version fausse.

create or replace function apercu_courant(p_saison text)
returns apercus_en_attente
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from seasons s
    join lateral (
      select r.id
        from import_runs r
       where r.source_document_id = s.source_document_id
         and r.status = 'diffed'
       order by r.started_at desc
       limit 1
    ) dernier on true
    join apercus_en_attente a on a.run_id = dernier.id
   where s.slug = p_saison
     and s.validation_status = 'published'
     and a.lignes is not null
     and a.empreinte = empreinte_du_lot(a.run_id, s.id)
$$;

revoke all on function apercu_courant(text) from public, anon, authenticated;

-- L'IDENTITÉ de l'aperçu servi (`<révision>:<empreinte>`), ou `null`.
-- Légère : c'est elle que l'application demande pour savoir s'il y a quelque
-- chose à proposer, et que l'écran ouvert surveille. Elle change dès que
-- l'aperçu rangé change : une décision d'un relecteur garde la révision mais
-- change le lot, et un écran ouvert ne doit pas continuer à montrer une
-- proposition rejetée. Le suivi des publications ne le verrait pas : aucune
-- version ne bouge tant que rien n'est publié.
create or replace function apercu_en_attente_disponible(p_saison text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.source_revision || ':' || a.empreinte
    from apercu_courant(p_saison) a
    join import_runs r on r.id = a.run_id
   where a.run_id is not null
$$;

revoke all on function apercu_en_attente_disponible(text) from public;
grant execute on function apercu_en_attente_disponible(text) to anon, authenticated;

--  La saison telle qu'elle serait si le lot en attente était accepté, ou `null`.
create or replace function apercu_version_en_attente(p_saison text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select a.lignes from apercu_courant(p_saison) a where a.run_id is not null
$$;

revoke all on function apercu_version_en_attente(text) from public;
grant execute on function apercu_version_en_attente(text) to anon, authenticated;
