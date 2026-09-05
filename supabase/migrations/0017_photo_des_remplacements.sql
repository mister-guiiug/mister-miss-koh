-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Une photo doit montrer les DEUX faces d'un remplacement  ║
-- ║                                                                          ║
-- ║ Trois blocs de la publication remplacent en bloc : les saisons citées     ║
-- ║ d'un candidat, ses appartenances de tribu, les résultats d'une épreuve,   ║
-- ║ les détenteurs d'un collier. Ils n'ont pas d'identité propre — ils se     ║
-- ║ relisent entièrement de la cellule source — donc on efface et on réécrit. ║
-- ║                                                                          ║
-- ║ CE QUI MANQUAIT. La photo retenait bien les lignes EFFACÉES (0010), mais  ║
-- ║ pas celles INSÉRÉES pour les remplacer — sauf dans trois blocs sur        ║
-- ║ quatre. `contestant_previous_seasons` était le quatrième. Conséquence :   ║
-- ║ défaire une seconde publication reposait les anciennes lignes SANS avoir  ║
-- ║ retiré les nouvelles, et la contrainte d'unicité (candidat, libellé)      ║
-- ║ arrêtait tout.                                                           ║
-- ║                                                                          ║
-- ║ Le défaut n'apparaît qu'à la DEUXIÈME publication d'un même candidat,     ║
-- ║ suivie d'un retour arrière. Aucun test ne couvrait cet enchaînement ;     ║
-- ║ celui de `publication.test.sql` le couvre désormais.                     ║
-- ║                                                                          ║
-- ║ La transaction a tout annulé les deux fois : rien n'a été perdu.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create or replace function publish_run(p_run_id uuid, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_run           import_runs%rowtype;
  v_season        seasons%rowtype;
  v_snapshot      jsonb := '[]'::jsonb;
  v_publication   uuid;
  v_applied       integer := 0;
  v_diff          record;
  v_payload       jsonb;
  v_before        jsonb;
  v_id            uuid;
  v_contestant    uuid;
  v_episode       uuid;
  v_council       uuid;
  v_round         uuid;
  v_voter         uuid;
  v_target        uuid;
  v_name          text;
  v_round_key     text;
  v_refused       text;
  v_stint         jsonb;
  v_team          uuid;
  v_epreuve       record;
  v_challenge     uuid;
  v_winners       jsonb;
  v_winner        text;
  v_old           record;
  v_advantage     uuid;
  v_cause         uuid;
  v_partner       uuid;
  v_holder        jsonb;
  v_rang          integer;
begin
  if not is_staff() then
    raise exception 'publication réservée aux relecteurs' using errcode = '42501';
  end if;

  -- VERROU AVANT TOUT. Deux publications simultanées du même lot appliqueraient
  -- deux fois les mêmes différences et produiraient deux photos concurrentes.
  select * into v_run from import_runs where id = p_run_id for update;
  if not found then
    raise exception 'exécution d''import introuvable : %', p_run_id;
  end if;
  -- UNE EXÉCUTION ANNULÉE SE REPUBLIE. Le contraire condamnerait un lot déjà
  -- relu et validé au seul motif que sa première application a été défaite :
  -- il faudrait réimporter la page et tout relire, alors que les différences,
  -- elles, sont restées vraies. C'est précisément le cas d'un correctif
  -- apporté à cette fonction.
  if v_run.status not in ('diffed', 'reverted') then
    raise exception 'seule une exécution « diffed » ou « reverted » se publie (celle-ci est « % »)', v_run.status;
  end if;

  select s.* into v_season from seasons s
  where s.source_document_id = v_run.source_document_id
  limit 1;
  if not found then
    raise exception 'aucune saison rattachée au document de cette exécution';
  end if;

  -- Les suppressions non prises en charge arrêtent le lot AVANT toute écriture.
  select string_agg(distinct entity::text, ', ') into v_refused
  from import_differences
  where run_id = p_run_id and status = 'validated'
    and operation = 'delete' and entity <> 'council_vote';
  if v_refused is not null then
    raise exception
      'suppressions non automatisées (%) : rejeter ces différences avant de publier',
      v_refused;
  end if;

  -- ── La saison elle-même devient visible ────────────────────────────────
  if v_season.validation_status <> 'published' then
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      't', 'seasons', 'id', v_season.id, 'before', row_snapshot('seasons', v_season.id)));
    update seasons
       set validation_status = 'published', published_at = now()
     where id = v_season.id;
  end if;

  -- ── Les différences, dans l'ordre des dépendances ──────────────────────
  --
  -- Un vote a besoin de son tour, un tour de son épisode, et les deux d'un
  -- candidat. Publier dans l'ordre d'insertion des différences échouerait sur
  -- la première clé étrangère manquante.
  for v_diff in
    select * from import_differences
    where run_id = p_run_id and status = 'validated'
    order by case entity
      when 'season_contestant' then 1
      when 'episode' then 2
      when 'council_round' then 3
      when 'council_vote' then 4
      when 'advantage' then 5
      else 9 end,
      natural_key
  loop
    v_payload := coalesce(v_diff.after_value, '{}'::jsonb);

    -- ── Candidat ─────────────────────────────────────────────────────────
    if v_diff.entity = 'season_contestant' then
      v_name := v_payload ->> 'displayName';
      if v_name is null then
        raise exception 'différence % sans displayName', v_diff.natural_key;
      end if;

      -- La PERSONNE d'abord. Son identifiant porte la saison, et ce n'est pas
      -- un oubli : la source ne donne que des PRÉNOMS. Deux « Camille » de
      -- deux éditions deviendraient une seule personne, à qui l'application
      -- prêterait un parcours qu'elle n'a pas eu. Rapprocher deux
      -- participations est une décision humaine — `contestant_previous_seasons`
      -- porte déjà la clé étrangère qui la recevra.
      select id into v_contestant from contestants
       where slug = slugify_fr(v_season.slug || '-' || v_name);
      if not found then
        insert into contestants (slug, display_name, gender, source_document_id,
                                 validation_status, published_at)
        values (slugify_fr(v_season.slug || '-' || v_name), v_name,
                v_payload ->> 'gender',
                v_run.source_document_id, 'published', now())
        returning id into v_contestant;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'contestants', 'id', v_contestant, 'before', null));
      end if;

      select id into v_id from season_contestants
       where season_id = v_season.id and contestant_id = v_contestant;
      v_before := case when found then row_snapshot('season_contestants', v_id) end;

      if found then
        update season_contestants
           set display_name = v_name,
               age_at_season = nullif(v_payload ->> 'age', 'null')::integer,
               final_jury = (v_payload ->> 'finalJury')::boolean,
               source_document_id = v_run.source_document_id,
               validation_status = 'published',
               published_at = now()
         where id = v_id;
      else
        insert into season_contestants (season_id, contestant_id, display_name,
                                        age_at_season, final_jury, source_document_id,
                                        validation_status, published_at)
        values (v_season.id, v_contestant, v_name,
                nullif(v_payload ->> 'age', 'null')::integer,
                (v_payload ->> 'finalJury')::boolean,
                v_run.source_document_id, 'published', now())
        returning id into v_id;
      end if;

      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
        't', 'season_contestants', 'id', v_id, 'before', v_before));

      -- Les saisons passées CITÉES par la source sont des libellés : on les
      -- remplace en bloc, elles n'ont pas d'identité propre à préserver.
      for v_old in
        select id from contestant_previous_seasons where season_contestant_id = v_id
      loop
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'contestant_previous_seasons', 'id', v_old.id,
          'before', row_snapshot('contestant_previous_seasons', v_old.id)));
      end loop;
      delete from contestant_previous_seasons where season_contestant_id = v_id;

      -- LES LIGNES ÉCRITES ENTRENT AUSSI DANS LA PHOTO. Sans elles, défaire
      -- une seconde publication reposerait les anciennes SANS retirer les
      -- nouvelles, et l'unicité (candidat, libellé) arrêterait tout. Les trois
      -- autres remplacements en bloc le faisaient déjà ; celui-ci ne le
      -- faisait pas.
      for v_old in
        with ecrites as (
          insert into contestant_previous_seasons (season_contestant_id, label, ordinal)
          select v_id, t.value, t.ord - 1
          from jsonb_array_elements_text(coalesce(v_payload -> 'previousSeasons', '[]'::jsonb))
               with ordinality as t(value, ord)
          where t.value <> ''
          returning id
        )
        select id from ecrites
      loop
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'contestant_previous_seasons', 'id', v_old.id, 'before', null));
      end loop;

      -- ── Les séjours en tribu ──────────────────────────────────────────
      --
      -- LA TRIBU EST UN INTERVALLE, PAS UN ATTRIBUT. Un candidat en change ;
      -- l'écrire sur sa participation perdrait l'histoire que le tableau de
      -- bord doit justement montrer. Les bornes sont des JOURS parce que
      -- c'est ce que la source dit — « Ikalu (jour 2 – 5) ». Les convertir en
      -- épisodes demanderait une table jour → épisode que la page ne donne
      -- pas, et serait donc une invention.
      --
      -- Remplacement en bloc : une appartenance n'a pas d'identité propre,
      -- elle se relit entièrement de la cellule source. Les lignes effacées
      -- sont photographiées AVANT, sans quoi le retour arrière les perdrait.
      for v_old in
        select id from team_memberships where season_contestant_id = v_id
      loop
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'team_memberships', 'id', v_old.id,
          'before', row_snapshot('team_memberships', v_old.id)));
      end loop;
      delete from team_memberships where season_contestant_id = v_id;

      for v_stint in
        select value from jsonb_array_elements(coalesce(v_payload -> 'teams', '[]'::jsonb))
      loop
        select id into v_team from teams
         where season_id = v_season.id and name = (v_stint ->> 'name');
        if not found then
          insert into teams (season_id, name, kind, source_document_id,
                             validation_status, published_at)
          values (v_season.id, v_stint ->> 'name', team_kind_of(v_stint ->> 'name'),
                  v_run.source_document_id, 'published', now())
          returning id into v_team;
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            't', 'teams', 'id', v_team, 'before', null));
        end if;

        insert into team_memberships (team_id, season_contestant_id, from_day, to_day,
                                      source_document_id, validation_status, published_at)
        values (v_team, v_id,
                (v_stint ->> 'fromDay')::integer,
                (v_stint ->> 'toDay')::integer,
                v_run.source_document_id, 'published', now())
        returning id into v_old;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'team_memberships', 'id', v_old.id, 'before', null));
      end loop;

    -- ── Épisode ──────────────────────────────────────────────────────────
    elsif v_diff.entity = 'episode' then
      select id into v_id from episodes
       where season_id = v_season.id and number = (v_payload ->> 'number')::integer;
      v_before := case when found then row_snapshot('episodes', v_id) end;

      if found then
        update episodes
           set air_date = nullif(v_payload ->> 'airDate', 'null')::date,
               source_document_id = v_run.source_document_id,
               validation_status = 'published',
               published_at = now()
         where id = v_id;
      else
        insert into episodes (season_id, number, air_date, source_document_id,
                              validation_status, published_at)
        values (v_season.id, (v_payload ->> 'number')::integer,
                nullif(v_payload ->> 'airDate', 'null')::date,
                v_run.source_document_id, 'published', now())
        returning id into v_id;
      end if;

      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
        't', 'episodes', 'id', v_id, 'before', v_before));

      -- ── Les épreuves de la soirée ─────────────────────────────────────
      --
      -- UN VAINQUEUR EST UNE TRIBU OU UN CANDIDAT, et la source ne le dit pas :
      -- elle écrit un nom. Sur les pages relevées le 05/09/2026, 120 valeurs
      -- désignaient une tribu et 210 un candidat. Les 38 restantes ne
      -- désignaient ni l'un ni l'autre — un nom d'épreuve, une équipe formée
      -- pour l'occasion. Elles sont signalées en anomalie par le recoupement,
      -- et LAISSÉES DE CÔTÉ ici : rattacher au hasard vaut moins que ne rien
      -- rattacher.
      for v_epreuve in
        select * from (values
          ('comfort'::challenge_kind, 'comfortWinners'),
          ('immunity'::challenge_kind, 'immunityWinners')
        ) as t(kind, cle)
      loop
        v_winners := coalesce(v_payload -> v_epreuve.cle, '[]'::jsonb);
        if jsonb_array_length(v_winners) = 0 then continue; end if;

        select id into v_challenge from challenges
         where episode_id = v_id and kind = v_epreuve.kind and ordinal = 0;
        v_before := case when found then row_snapshot('challenges', v_challenge) end;

        if found then
          update challenges
             set source_document_id = v_run.source_document_id,
                 validation_status = 'published', published_at = now()
           where id = v_challenge;
        else
          insert into challenges (episode_id, kind, format, ordinal,
                                  source_document_id, validation_status, published_at)
          values (v_id, v_epreuve.kind, 'unknown', 0,
                  v_run.source_document_id, 'published', now())
          returning id into v_challenge;
        end if;

        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'challenges', 'id', v_challenge, 'before', v_before));

        for v_old in select id from challenge_results where challenge_id = v_challenge loop
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            't', 'challenge_results', 'id', v_old.id,
            'before', row_snapshot('challenge_results', v_old.id)));
        end loop;
        delete from challenge_results where challenge_id = v_challenge;

        for v_winner in select jsonb_array_elements_text(v_winners) loop
          select id into v_contestant from season_contestants
           where season_id = v_season.id and display_name = v_winner;
          if found then
            insert into challenge_results (challenge_id, season_contestant_id, is_winner,
                                           source_document_id, validation_status, published_at)
            values (v_challenge, v_contestant, true,
                    v_run.source_document_id, 'published', now())
            returning id into v_old;
          else
            select id into v_team from teams
             where season_id = v_season.id and name = v_winner;
            if not found then continue; end if;
            insert into challenge_results (challenge_id, team_id, is_winner,
                                           source_document_id, validation_status, published_at)
            values (v_challenge, v_team, true,
                    v_run.source_document_id, 'published', now())
            returning id into v_old;
          end if;
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            't', 'challenge_results', 'id', v_old.id, 'before', null));
        end loop;

        -- Le format se DÉDUIT de ce qui a gagné. Le supposer « individuel »
        -- ferait passer une victoire de tribu pour une victoire personnelle.
        update challenges c set format = case
          when exists (select 1 from challenge_results r
                        where r.challenge_id = c.id and r.team_id is not null) then 'team'
          when exists (select 1 from challenge_results r
                        where r.challenge_id = c.id and r.season_contestant_id is not null)
            then 'individual'
          else 'unknown'
        end::challenge_format where c.id = v_challenge;
      end loop;

    -- ── Tour de conseil ──────────────────────────────────────────────────
    elsif v_diff.entity = 'council_round' then
      select id into v_episode from episodes
       where season_id = v_season.id and number = (v_payload ->> 'episodeNumber')::integer;
      if not found then
        raise exception 'tour % : épisode % absent du référentiel',
          v_diff.natural_key, v_payload ->> 'episodeNumber';
      end if;

      -- Un conseil par épisode : la source n'en distingue pas plusieurs, et en
      -- inventer un par tour ferait passer une égalité pour deux conseils.
      select id into v_council from councils where episode_id = v_episode and ordinal = 1;
      if not found then
        insert into councils (episode_id, ordinal, source_document_id,
                              validation_status, published_at)
        values (v_episode, 1, v_run.source_document_id, 'published', now())
        returning id into v_council;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'councils', 'id', v_council, 'before', null));
      end if;

      -- UN DÉPART DE BINÔME N'EST PAS UN SCRUTIN.
      --
      -- L'extraction produit un tour `linked` parce que la SOURCE lui donne une
      -- colonne — le tableau des votes en réserve une par scrutin, et le départ
      -- du binôme y occupe la sienne. Personne n'y vote pour autant. L'écrire
      -- dans `council_rounds` fabriquait un scrutin fantôme, que l'application
      -- relisait en « ? éliminé·e (0 voix) », EN PLUS du départ qu'elle
      -- reconstitue déjà à sa place. Seul le départ est publié.
      if (v_payload ->> 'kind') = 'linked' then
        v_round := null;
      else
        select id into v_id from council_rounds
         where council_id = v_council and round_number = (v_payload ->> 'roundNumber')::integer;
        v_before := case when found then row_snapshot('council_rounds', v_id) end;

        if found then
          update council_rounds
             set outcome = round_outcome(v_payload ->> 'kind'),
                 reported_votes_for = nullif(v_payload ->> 'reportedVotesFor', 'null')::integer,
                 reported_votes_total = nullif(v_payload ->> 'reportedVotesTotal', 'null')::integer,
                 source_document_id = v_run.source_document_id,
                 validation_status = 'published',
                 published_at = now()
           where id = v_id;
        else
          insert into council_rounds (council_id, round_number, outcome,
                                      reported_votes_for, reported_votes_total,
                                      source_document_id, validation_status, published_at)
          values (v_council, (v_payload ->> 'roundNumber')::integer,
                  round_outcome(v_payload ->> 'kind'),
                  nullif(v_payload ->> 'reportedVotesFor', 'null')::integer,
                  nullif(v_payload ->> 'reportedVotesTotal', 'null')::integer,
                  v_run.source_document_id, 'published', now())
          returning id into v_id;
        end if;

        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'council_rounds', 'id', v_id, 'before', v_before));
        v_round := v_id; -- `v_id` va servir au départ : on garde le tour.
      end if;

      -- ── Le départ qui découle du tour ─────────────────────────────────
      --
      -- « Éliminé » et « part avec son binôme » sont deux sorties distinctes,
      -- et la seconde se lit ZÉRO VOTE. Le genre de départ vient du tour
      -- EXTRAIT, pas d'une règle supposée : une saison sans destins liés n'en
      -- produit aucun.
      v_name := v_payload ->> 'eliminated';
      if v_name is not null and v_name <> '' and (v_payload ->> 'kind') <> 'annulled' then
        select sc.id into v_contestant from season_contestants sc
         where sc.season_id = v_season.id and sc.display_name = v_name;
        if found then
          select id into v_id from departures where season_contestant_id = v_contestant;
          v_before := case when found then row_snapshot('departures', v_id) end;

          if found then
            update departures
               set episode_id = v_episode, council_id = v_council, round_id = v_round,
                   kind = case when (v_payload ->> 'kind') = 'linked'
                               then 'linked_pair'::departure_kind
                               else 'vote'::departure_kind end,
                   source_document_id = v_run.source_document_id,
                   validation_status = 'published', published_at = now()
             where id = v_id;
          else
            -- `round_id` MANQUAIT. Sans lui, l'application ne peut nommer
            -- l'éliminé d'un tour : elle affichait « ? éliminé·e (11/18 voix) ».
            -- La branche de mise à jour, elle, le posait — d'où un défaut
            -- invisible tant qu'aucun départ n'avait été publié deux fois.
            insert into departures (season_contestant_id, episode_id, council_id,
                                    round_id, kind,
                                    source_document_id, validation_status, published_at)
            values (v_contestant, v_episode, v_council, v_round,
                    case when (v_payload ->> 'kind') = 'linked'
                         then 'linked_pair'::departure_kind else 'vote'::departure_kind end,
                    v_run.source_document_id, 'published', now())
            returning id into v_id;
          end if;

          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            't', 'departures', 'id', v_id, 'before', v_before));

          -- ── Ce qu'un départ LIÉ apprend ─────────────────────────────
          --
          -- La colonne « départ lié » du tableau des votes n'existe que
          -- parce qu'un vote a éliminé quelqu'un dans le même épisode. La
          -- sortie qu'elle décrit est donc CAUSÉE par cette élimination, et
          -- les deux personnes forment un duo. Ce n'est pas une déduction :
          -- c'est le sens de la colonne.
          --
          -- Rien n'est écrit si l'élimination du même épisode n'est pas
          -- publiée — mieux vaut un duo absent qu'un duo faux.
          if (v_payload ->> 'kind') = 'linked' then
            select d.id, d.season_contestant_id into v_cause, v_partner
            from departures d
            where d.episode_id = v_episode and d.kind = 'vote'
            limit 1;

            if v_cause is not null and v_partner <> v_contestant then
              update departures
                 set caused_by_departure_id = v_cause
               where id = v_id;

              -- L'index d'unicité est indépendant de l'ordre des membres :
              -- (A,B) et (B,A) sont le même duo.
              if not exists (
                select 1 from pairs p
                where p.season_id = v_season.id
                  and least(p.member_a_id::text, p.member_b_id::text)
                      = least(v_partner::text, v_contestant::text)
                  and greatest(p.member_a_id::text, p.member_b_id::text)
                      = greatest(v_partner::text, v_contestant::text)
              ) then
                insert into pairs (season_id, member_a_id, member_b_id,
                                   source_document_id, validation_status, published_at)
                values (v_season.id, v_partner, v_contestant,
                        v_run.source_document_id, 'published', now())
                returning id into v_id;
                v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
                  't', 'pairs', 'id', v_id, 'before', null));
              end if;
            end if;
          end if;
        end if;
      end if;

    -- ── Voix ─────────────────────────────────────────────────────────────
    elsif v_diff.entity = 'council_vote' then
      -- La clé du tour est celle du vote MOINS le nom du votant : le payload
      -- le porte, donc rien n'est deviné par découpage.
      v_name := v_payload ->> 'voter';
      v_round_key := left(v_diff.natural_key, length(v_diff.natural_key) - length(':' || v_name));

      select cr.id into v_round
      from council_rounds cr
      join councils c on c.id = cr.council_id
      join episodes e on e.id = c.episode_id
      join import_records ir
        on ir.entity = 'council_round' and ir.natural_key = v_round_key
       and ir.run_id = p_run_id
      where e.season_id = v_season.id
        and e.number = (ir.payload ->> 'episodeNumber')::integer
        and cr.round_number = (ir.payload ->> 'roundNumber')::integer;
      if not found then
        raise exception 'voix % : tour % absent du référentiel',
          v_diff.natural_key, v_round_key;
      end if;

      select id into v_voter from season_contestants
       where season_id = v_season.id and display_name = v_name;
      if not found then
        raise exception 'voix % : votant « % » inconnu de la saison',
          v_diff.natural_key, v_name;
      end if;

      select id into v_target from season_contestants
       where season_id = v_season.id and display_name = v_payload ->> 'target';

      select id into v_id from council_votes
       where round_id = v_round and voter_id = v_voter;
      v_before := case when found then row_snapshot('council_votes', v_id) end;

      if v_diff.operation = 'delete' then
        if v_before is null then continue; end if;
        delete from council_votes where id = v_id;
      elsif found then
        update council_votes
           set target_id = v_target,
               is_annulled = coalesce((v_payload ->> 'struck')::boolean, false),
               source_document_id = v_run.source_document_id,
               validation_status = 'published', published_at = now()
         where id = v_id;
      else
        insert into council_votes (round_id, voter_id, target_id, is_annulled,
                                   source_document_id, validation_status, published_at)
        values (v_round, v_voter, v_target,
                coalesce((v_payload ->> 'struck')::boolean, false),
                v_run.source_document_id, 'published', now())
        returning id into v_id;
      end if;

      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
        't', 'council_votes', 'id', v_id, 'before', v_before));
    -- ── Collier d'immunité ───────────────────────────────────────────────
    elsif v_diff.entity = 'advantage' then
      select id into v_id from advantages
       where season_id = v_season.id and natural_key = v_diff.natural_key;
      v_before := case when found then row_snapshot('advantages', v_id) end;

      -- L'épisode où il a été joué, s'il l'a été. Un numéro qui ne
      -- correspond à aucun épisode publié laisse la colonne nulle plutôt que
      -- de pointer ailleurs.
      v_episode := null;
      if (v_payload ->> 'playedEpisodeNumber') is not null then
        select id into v_episode from episodes
         where season_id = v_season.id
           and number = (v_payload ->> 'playedEpisodeNumber')::integer;
      end if;

      if v_before is not null then
        update advantages
           set kind = 'immunity_necklace',
               label = v_payload ->> 'location',
               status = v_payload ->> 'status',
               found_day = (v_payload ->> 'foundDay')::integer,
               played_episode_id = v_episode,
               played_day = (v_payload ->> 'playedDay')::integer,
               annulled_votes = (v_payload ->> 'annulledVotes')::integer,
               annulled_votes_total = (v_payload ->> 'annulledVotesTotal')::integer,
               source_document_id = v_run.source_document_id,
               validation_status = 'published', published_at = now()
         where id = v_id;
      else
        insert into advantages (season_id, natural_key, kind, label, status,
                                found_day, played_episode_id, played_day,
                                annulled_votes, annulled_votes_total,
                                source_document_id, validation_status, published_at)
        values (v_season.id, v_diff.natural_key, 'immunity_necklace',
                v_payload ->> 'location', v_payload ->> 'status',
                (v_payload ->> 'foundDay')::integer, v_episode,
                (v_payload ->> 'playedDay')::integer,
                (v_payload ->> 'annulledVotes')::integer,
                (v_payload ->> 'annulledVotesTotal')::integer,
                v_run.source_document_id, 'published', now())
        returning id into v_id;
      end if;

      v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
        't', 'advantages', 'id', v_id, 'before', v_before));
      v_advantage := v_id;

      -- Les détenteurs se remplacent en bloc, comme les appartenances : ils
      -- se relisent entièrement de la cellule source et n'ont pas d'identité
      -- propre. Les lignes effacées sont photographiées AVANT.
      for v_old in
        select id from advantage_holders where advantage_id = v_advantage
      loop
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          't', 'advantage_holders', 'id', v_old.id,
          'before', row_snapshot('advantage_holders', v_old.id)));
      end loop;
      delete from advantage_holders where advantage_id = v_advantage;

      v_rang := 0;
      for v_holder in
        select value from jsonb_array_elements(coalesce(v_payload -> 'holders', '[]'::jsonb))
      loop
        -- Un détenteur inconnu de la saison n'est PAS créé : la colonne
        -- « Non découvert » remplit des lignes entières, et le recoupement
        -- signale déjà les noms qu'il ne reconnaît pas.
        select id into v_contestant from season_contestants
         where season_id = v_season.id and display_name = (v_holder ->> 'name');
        if not found then continue; end if;

        insert into advantage_holders (advantage_id, season_contestant_id, ordinal,
                                       from_day, to_day, is_original,
                                       source_document_id, validation_status, published_at)
        values (v_advantage, v_contestant, v_rang,
                (v_holder ->> 'fromDay')::integer,
                (v_holder ->> 'toDay')::integer,
                coalesce((v_holder ->> 'original')::boolean, true),
                v_run.source_document_id, 'published', now())
        on conflict (advantage_id, season_contestant_id) do nothing
        returning id into v_old;

        if v_old.id is not null then
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            't', 'advantage_holders', 'id', v_old.id, 'before', null));
        end if;
        v_rang := v_rang + 1;
      end loop;

    else
      raise exception 'entité non publiable : %', v_diff.entity;
    end if;

    v_applied := v_applied + 1;
  end loop;

  if v_applied = 0 then
    raise exception 'aucune différence validée à publier dans cette exécution';
  end if;

  insert into publications (run_id, published_by, differences_applied,
                            rollback_snapshot, notes)
  values (p_run_id, auth.uid(), v_applied, v_snapshot, p_notes)
  returning id into v_publication;

  update import_differences
     set status = 'published', publication_id = v_publication
   where run_id = p_run_id and status = 'validated';

  update import_runs set status = 'published', finished_at = now() where id = p_run_id;

  insert into referential_versions (season_id, publication_id, summary)
  values (v_season.id, v_publication,
          format('%s différence(s) appliquée(s) depuis la révision %s',
                 v_applied, coalesce(v_run.source_revision, '?')));

  perform log_event('import.publish', 'publication', v_publication::text,
                    format('%s différence(s) publiée(s)', v_applied));

  return v_publication;
end $$;
