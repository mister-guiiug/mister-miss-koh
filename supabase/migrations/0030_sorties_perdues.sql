-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Les sorties que l'unicité d'avant 0028 a écrasées       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- CE QUI SE VOIT. Des tours « ? éliminé·e » dans quinze saisons publiées, et
-- des candidats qui ne sortent qu'une fois alors que la source les fait sortir
-- deux fois : Tania (« Le Feu sacré »), éliminée aux épisodes 4, 13 et 17, n'a
-- en ligne que sa sortie de l'épisode 4.
--
-- LA CAUSE. Jusqu'à 0028, `departures` portait `unique (season_contestant_id)`.
-- Publier la seconde sortie d'une personne METTAIT À JOUR la première — son
-- épisode, son tour, sa nature — au lieu d'en ajouter une. Les tours se
-- publiant dans l'ordre TEXTUEL des clés (`e13` avant `e4`), c'est la dernière
-- appliquée qui restait, pas forcément la dernière de la saison. Le tour dont
-- la sortie avait été déplacée ne nommait plus personne : « ? éliminé·e ».
-- Et la cause d'un départ lié pouvait suivre la ligne dans une autre soirée.
--
-- POURQUOI AUCUN LOT NE LES RÉPARE. Le diff compare l'extraction aux
-- enregistrements de la dernière exécution publiée — ils contiennent déjà ces
-- sorties. Rien ne change, rien n'est proposé, et `publish_run` ne repasse
-- jamais dessus.
--
-- LE CORRECTIF. Ces enregistrements sont l'état publié, pour l'import
-- lui-même (`loadPublished`). `rendre_les_sorties_perdues` y relit chaque
-- soirée et écrit ce que la `publish_run` d'aujourd'hui en aurait fait.
--
-- Relevé du 24/09/2026, en rejouant hors ligne la dernière exécution publiée
-- de chaque saison — son nombre d'enregistrements égale, pour les quinze, le
-- nombre de différences que sa publication a appliquées : 31 sorties perdues.
-- 29 reviennent ; 2 restent absentes, faute de savoir QUI : deux candidats
-- portent le même prénom (Jérôme, « La Revanche des 4 terres » ; Cécile,
-- « La Tribu maudite »), et la publication les a confondus. Et 3 départs
-- gardés avaient emporté la cause d'une autre soirée.

-- ── Les sorties qu'écrit la dernière exécution publiée ─────────────────────
--
-- Une par (candidat, épisode) : la DERNIÈRE colonne de la soirée qui le nomme.
-- Égalité puis second tour, c'est le second qui élimine — et c'est aussi celle
-- que `publish_run` garde, en appliquant les tours dans l'ordre. Un prénom que
-- portent deux candidats ne désigne personne : ses sorties sont laissées de
-- côté plutôt qu'attribuées au hasard.
create or replace function public.sorties_ecrites(p_season_id uuid default null)
returns table (
  season_id uuid,
  source_document_id uuid,
  season_contestant_id uuid,
  episode_id uuid,
  rang integer,
  genre departure_kind,
  cause_contestant_id uuid
)
language sql stable set search_path = public as $$
  with derniere as (
    select s.id as season_id, s.source_document_id, r.id as run_id
      from seasons s
      cross join lateral (
        select r.id from import_runs r
         where r.source_document_id = s.source_document_id
           and r.status = 'published'
         order by r.started_at desc
         limit 1
      ) r
     where p_season_id is null or s.id = p_season_id
  ),
  homonymes as (
    select d.season_id, ir.payload ->> 'displayName' as prenom
      from derniere d
      join import_records ir
        on ir.run_id = d.run_id and ir.entity = 'season_contestant'
     group by d.season_id, ir.payload ->> 'displayName'
    having count(*) > 1
  ),
  colonnes as (
    select d.season_id, d.source_document_id,
           sc.id as season_contestant_id, e.id as episode_id,
           (ir.payload ->> 'roundNumber')::integer as rang,
           ir.payload ->> 'kind' as genre_source,
           nullif(ir.payload ->> 'causedBy', '') as cause_prenom,
           row_number() over (
             partition by sc.id, e.id
             order by (ir.payload ->> 'roundNumber')::integer desc
           ) as n
      from derniere d
      join import_records ir
        on ir.run_id = d.run_id
       and ir.entity = 'council_round'
       and ir.payload ->> 'kind' in ('vote', 'linked')
       and coalesce(ir.payload ->> 'eliminated', '') <> ''
      join episodes e
        on e.season_id = d.season_id
       and e.number = (ir.payload ->> 'episodeNumber')::integer
      join season_contestants sc
        on sc.season_id = d.season_id
       and sc.display_name = ir.payload ->> 'eliminated'
     where not exists (
       select 1 from homonymes h
        where h.season_id = d.season_id and h.prenom = ir.payload ->> 'eliminated'
     )
  )
  select c.season_id, c.source_document_id, c.season_contestant_id, c.episode_id,
         c.rang,
         (case when c.genre_source = 'vote' then 'vote'
               when c.cause_prenom is not null then 'linked_pair'
               else 'other' end)::departure_kind,
         cause.id
    from colonnes c
    left join season_contestants cause
      on cause.season_id = c.season_id
     and cause.display_name = c.cause_prenom
     and cause.id <> c.season_contestant_id
   where c.n = 1
$$;

revoke all on function public.sorties_ecrites(uuid) from public, anon, authenticated;

comment on function public.sorties_ecrites(uuid) is
  'Les sorties qu''écrit la dernière exécution publiée de chaque saison, une par (candidat, épisode), telles que publish_run les écrirait aujourd''hui. Les prénoms portés par deux candidats en sont exclus.';

-- ── Les rendre ──────────────────────────────────────────────────────────────
--
-- Une fonction et non des instructions, pour la même raison que 0029 : sur la
-- base neuve des tests, une instruction ne toucherait rien. Elle n'ajoute que
-- ce qui manque et ne reprend que des causes fausses : rejouée, elle ne fait
-- rien.
create or replace function public.rendre_les_sorties_perdues(p_season_id uuid default null)
returns integer
language plpgsql set search_path = public as $$
declare
  v_votes   integer;
  v_liees   integer;
  v_causes  integer;
  v_duos    integer;
begin
  -- 1. Les sorties au vote, d'abord : ce sont elles que les départs liés
  --    désignent. Chacune retrouve son tour — celui qui affichait
  --    « ? éliminé·e ». Sans ce tour en base, rien n'est écrit.
  insert into departures (season_contestant_id, episode_id, council_id, round_id,
                          round_number, kind, source_document_id,
                          validation_status, published_at)
  select w.season_contestant_id, w.episode_id, co.id, cr.id, w.rang, w.genre,
         w.source_document_id, 'published', now()
    from sorties_ecrites(p_season_id) w
    join councils co on co.episode_id = w.episode_id and co.ordinal = 1
    join council_rounds cr on cr.council_id = co.id and cr.round_number = w.rang
   where w.genre = 'vote'
     and not exists (select 1 from departures d
                      where d.season_contestant_id = w.season_contestant_id
                        and d.episode_id = w.episode_id);
  get diagnostics v_votes = row_count;

  -- 2. Les sorties sans scrutin. La cause d'un départ lié se cherche dans la
  --    MÊME soirée, comme `publish_run` la cherche : introuvable, la sortie
  --    reste liée mais sans cause, plutôt qu'attachée à une autre soirée.
  insert into departures (season_contestant_id, episode_id, council_id, round_id,
                          round_number, kind, caused_by_departure_id,
                          source_document_id, validation_status, published_at)
  select w.season_contestant_id, w.episode_id,
         (select co.id from councils co
           where co.episode_id = w.episode_id and co.ordinal = 1),
         null, w.rang, w.genre,
         case when w.genre = 'linked_pair' then
           (select c.id from departures c
             where c.season_contestant_id = w.cause_contestant_id
               and c.episode_id = w.episode_id)
         end,
         w.source_document_id, 'published', now()
    from sorties_ecrites(p_season_id) w
   where w.genre <> 'vote'
     and not exists (select 1 from departures d
                      where d.season_contestant_id = w.season_contestant_id
                        and d.episode_id = w.episode_id);
  get diagnostics v_liees = row_count;

  -- 3. Les causes. L'écrasement déplaçait une ligne d'une soirée à l'autre en
  --    gardant sa cause : Teheiura (« L'Île des héros »), éliminé au vote à
  --    l'épisode 3, y « partait à la suite de » Charlotte, éliminée à
  --    l'épisode 10. Et un départ lié dont la cause avait été déplacée restait
  --    sans elle. La nature et la cause redeviennent celles de la soirée de la
  --    ligne — pour ces lignes-là seulement.
  update departures d
     set kind = w.genre,
         caused_by_departure_id = x.cause_id
    from sorties_ecrites(p_season_id) w
    cross join lateral (
      select case when w.genre = 'linked_pair' then
        (select c.id from departures c
          where c.season_contestant_id = w.cause_contestant_id
            and c.episode_id = w.episode_id)
      end as cause_id
    ) x
   where d.season_contestant_id = w.season_contestant_id
     and d.episode_id = w.episode_id
     and (
       exists (select 1 from departures c
                where c.id = d.caused_by_departure_id
                  and c.episode_id is distinct from d.episode_id)
       or (d.caused_by_departure_id is null and x.cause_id is not null)
     );
  get diagnostics v_causes = row_count;

  -- 4. Le duo qu'un départ lié nomme, s'il manque — comme `publish_run` :
  --    l'éliminé du vote d'abord, puis celui que son départ entraîne.
  insert into pairs (season_id, member_a_id, member_b_id, source_document_id,
                     validation_status, published_at)
  select distinct on (least(cause.season_contestant_id::text, d.season_contestant_id::text),
                      greatest(cause.season_contestant_id::text, d.season_contestant_id::text))
         sc.season_id, cause.season_contestant_id, d.season_contestant_id,
         d.source_document_id, 'published', now()
    from departures d
    join departures cause on cause.id = d.caused_by_departure_id
                         and cause.episode_id = d.episode_id
    join season_contestants sc on sc.id = d.season_contestant_id
   where d.kind = 'linked_pair'
     and (p_season_id is null or sc.season_id = p_season_id)
     and not exists (
       select 1 from pairs p
        where p.season_id = sc.season_id
          and least(p.member_a_id::text, p.member_b_id::text)
              = least(cause.season_contestant_id::text, d.season_contestant_id::text)
          and greatest(p.member_a_id::text, p.member_b_id::text)
              = greatest(cause.season_contestant_id::text, d.season_contestant_id::text)
     );
  get diagnostics v_duos = row_count;

  if v_votes + v_liees + v_causes + v_duos > 0 then
    perform log_event('referentiel.sorties_rendues', 'departures', p_season_id::text,
      format('%s sortie(s) au vote et %s sans scrutin rendue(s), %s cause(s) reprise(s), %s duo(s)',
             v_votes, v_liees, v_causes, v_duos));
  end if;

  return v_votes + v_liees + v_causes + v_duos;
end $$;

revoke all on function public.rendre_les_sorties_perdues(uuid) from public, anon, authenticated;

comment on function public.rendre_les_sorties_perdues(uuid) is
  'Rend les sorties que l''unicité d''avant 0028 a écrasées, et reprend les causes qu''elles avaient emportées dans une autre soirée, d''après la dernière exécution publiée. N''ajoute que ce qui manque ; rend le nombre de lignes écrites.';

select public.rendre_les_sorties_perdues();
