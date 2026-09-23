-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Le jour du conseil des épisodes publiés avant 0028     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- CE QUI MANQUAIT. 0028 fait écrire à `publish_run` le jour du conseil de
-- chaque épisode (`episodes.day_end` : la colonne « Départ » du déroulement,
-- « Jour 11 »). Mais une publication n'écrit que ce qui CHANGE : les épisodes
-- déjà publiés, dont l'enregistrement porte ce jour depuis la version 2 de
-- l'extraction, ne l'ont jamais reçu. Relevé du 24/09/2026 : aucun épisode sur
-- 202 dans les quinze saisons anciennes, et, pour All Stars, les épisodes 4 et
-- 5 seulement. Les lots v12 n'y changeraient rien : aucune différence
-- d'épisode.
--
-- CE QUE ÇA COÛTE. Sans jour de conseil, l'application ne date pas les séjours
-- en tribu, et elle refuse de prouver un retour (#118 : une saison sans aucun
-- jour de conseil ne rend personne). Marvyn (« Fidji »), éliminé à l'épisode 2
-- et revenu au jour 7, y paraît sorti pour de bon.
--
-- LE CORRECTIF. Pour chaque épisode qui n'en a pas, le jour que porte son
-- enregistrement dans la dernière exécution publiée — celle que l'import tient
-- pour l'état publié. Simulé le 24/09/2026 : 148 jours à écrire, aucune
-- contradiction avec les deux déjà publiés, 59 épisodes sans jour dans la
-- source (les finales, et trois saisons dont la page n'a pas de déroulement).
-- Puis rejoué avec la logique de l'application, saison par saison et épisode
-- par épisode : la fin de chaque saison est IDENTIQUE, et seuls s'ajoutent 16
-- retours prouvés — ceux dont 0030 a rendu la première sortie.

create or replace function public.recaler_jours_de_conseil(p_season_id uuid default null)
returns integer
language plpgsql set search_path = public as $$
declare
  v_n integer;
begin
  -- Un jour qui n'est pas un entier ne s'écrit pas : l'extraction ne produit
  -- que des nombres, mais une migration qui échoue sur une valeur imprévue
  -- bloquerait toutes les suivantes.
  update episodes e
     set day_end = x.jour
    from (
      select s.id as season_id,
             (ir.payload ->> 'number')::integer as numero,
             min((ir.payload ->> 'departureDay')::integer) as jour
        from seasons s
        cross join lateral (
          select r.id from import_runs r
           where r.source_document_id = s.source_document_id
             and r.status = 'published'
           order by r.started_at desc
           limit 1
        ) derniere
        join import_records ir
          on ir.run_id = derniere.id
         and ir.entity = 'episode'
         and ir.payload ->> 'number' ~ '^[0-9]+$'
         and ir.payload ->> 'departureDay' ~ '^[0-9]+$'
       where p_season_id is null or s.id = p_season_id
       group by s.id, (ir.payload ->> 'number')::integer
      having count(*) = 1
    ) x
   where e.season_id = x.season_id
     and e.number = x.numero
     and e.day_end is null;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform log_event('referentiel.jours_de_conseil', 'episodes', p_season_id::text,
      format('%s jour(s) de conseil posé(s)', v_n));
  end if;
  return v_n;
end $$;

revoke all on function public.recaler_jours_de_conseil(uuid) from public, anon, authenticated;

comment on function public.recaler_jours_de_conseil(uuid) is
  'Pose le jour du conseil (day_end) des épisodes qui n''en ont pas, d''après la dernière exécution publiée. Ne remplace jamais un jour publié ; rend le nombre d''épisodes datés.';

select public.recaler_jours_de_conseil();
