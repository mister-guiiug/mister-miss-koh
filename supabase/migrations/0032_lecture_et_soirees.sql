-- La lecture se note même quand rien n'est publié, et le passage du soir
-- couvre tous les soirs d'une saison en diffusion.
--
-- `last_seen_revision` ne bouge qu'à la publication. Une relecture qui attend
-- (ambiguë, ou simplement plus récente) laissait le site afficher la dernière
-- publication comme si elle était la page. `observed_revision` est ce qui a
-- été lu ; `hold_reason` dit pourquoi ce n'est pas encore le référentiel.
--
-- La fenêtre du soir était mardi et mercredi. Une modification du dimanche
-- attendait le lundi 4 h 17. La saison en diffusion se relit désormais chaque
-- soir, 16 h à minuit, heure de Paris. L'expression cron reste en UTC, large
-- de 14 h à 22 h : la fonction tranche sur l'heure de Paris, été comme hiver.

alter table public.source_documents
  add column if not exists observed_revision text,
  add column if not exists observed_at timestamptz,
  add column if not exists hold_reason text;

comment on column public.source_documents.observed_revision is
  'Dernière révision lue, publiée ou non.';
comment on column public.source_documents.observed_at is
  'Quand cette révision a été lue.';
comment on column public.source_documents.hold_reason is
  'en_attente, echec, forme_non_prise_en_charge, ou null si la lecture a été publiée.';

create or replace function public.importer_saison_en_diffusion()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_paris timestamptz := timezone('Europe/Paris', now());
  v_heure integer := extract(hour from v_paris);
  v_document record;
  v_lances integer := 0;
begin
  -- 16 à 23 inclus, donc le dernier tour part à 23 h 30 et rien ne se
  -- déclenche une fois minuit passé. Tous les soirs : une saison en
  -- diffusion bouge aussi le jeudi.
  if v_heure < 16 then
    return 0;
  end if;

  for v_document in
    select s.source_document_id as id
      from seasons s
     where s.status = 'airing'
       and s.source_document_id is not null
  loop
    if declencher_import(v_document.id) is not null then
      v_lances := v_lances + 1;
    end if;
  end loop;
  return v_lances;
end
$fn$;

comment on function public.importer_saison_en_diffusion() is
  'Chaque soir 16h-minuit (heure de Paris) : la saison en diffusion seulement.';

revoke all on function public.importer_saison_en_diffusion() from public, anon, authenticated;

select cron.schedule(
  'koh-import-diffusion',
  '*/30 14-22 * * *',
  $job$select importer_saison_en_diffusion()$job$
);
