-- La soirée de diffusion se lit en quasi direct.
--
-- LE DÉLAI. La saison en diffusion était relue toutes les trente minutes, de
-- 16 h à minuit : une élimination pouvait attendre une demi-heure avant d'être
-- seulement lue, et une correction faite à 0 h 30 attendait le passage de 4 h.
--
-- CE QUI CHANGE.
--   1. Toutes les deux minutes, une SONDE (action `sonder` de la fonction Edge,
--      voir `_shared/sonde.ts`) : un appel à l'API, et aucune exécution en base
--      quand la page n'a pas bougé. Une révision nouvelle n'est lue que lorsque
--      la page s'est calmée (trois minutes sans modification), ou au bout de
--      quinze minutes d'attente si elle ne se calme pas.
--   2. La fenêtre s'étend jusqu'à 2 h, heure de Paris, tant que la page a bougé
--      dans l'heure : après l'émission, les contributeurs écrivent encore.
--   3. La règle de la fenêtre devient une FONCTION, `dans_la_soiree`, que le
--      test éprouve directement au lieu d'en tenir une copie.
--
-- LE COÛT. Une trentaine de petites requêtes par heure vers Wikipédia pendant
-- la fenêtre, au lieu de deux ; environ neuf mille appels de la fonction Edge
-- par mois, pour un quota gratuit de cinq cent mille.

-- ── L'appel à la fonction Edge, commun aux deux portes ──────────────────────
--
-- `declencher_import` portait seul la lecture du Vault et l'appel. La sonde a
-- besoin du même appel avec un autre corps : l'appel devient une fonction, et
-- `declencher_import` la délègue, sans changer ni de signature ni de droits.

create or replace function public.appeler_import(p_corps jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_base   text;
  v_anon   text;
  v_secret text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'koh_functions_url';
  select decrypted_secret into v_anon
    from vault.decrypted_secrets where name = 'koh_anon_key';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'koh_import_cron_secret';
  -- Un secret manquant n'est pas une panne silencieuse (0026) : on s'arrête,
  -- et on dit lequel manque, jamais sa valeur.
  if v_base is null or v_anon is null or v_secret is null then
    raise warning
      'planification import : secret absent du Vault (url=%, anon=%, secret=%)',
      v_base is not null, v_anon is not null, v_secret is not null;
    return null;
  end if;
  return net.http_post(
    url     := v_base || '/import-wikipedia',
    body    := p_corps,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'Authorization',   'Bearer ' || v_anon,
      'x-import-secret', v_secret
    ),
    timeout_milliseconds := 120000
  );
end
$fn$;

comment on function public.appeler_import(jsonb) is
  'Appelle la fonction Edge import-wikipedia par la porte de la planification, avec ce corps. Asynchrone.';

-- Comme toutes les fonctions de la planification : aucun client ne l'appelle,
-- et les trois rôles sont nommés, parce que retirer l'un ne retire pas l'autre.
revoke all on function public.appeler_import(jsonb) from public, anon, authenticated;

create or replace function public.declencher_import(p_document_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  return appeler_import(jsonb_build_object('documentId', p_document_id));
end
$fn$;

create or replace function public.sonder_la_saison(p_document_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $fn$
begin
  return appeler_import(
    jsonb_build_object('action', 'sonder', 'documentId', p_document_id)
  );
end
$fn$;

comment on function public.sonder_la_saison(uuid) is
  'Sonde la page d''une saison : un appel à l''API, un import seulement si la révision est nouvelle et la page calmée. Asynchrone.';

revoke all on function public.sonder_la_saison(uuid) from public, anon, authenticated;

-- ── La fenêtre de la soirée ──────────────────────────────────────────────────
--
-- De 16 h à minuit, heure de Paris ; de minuit à 2 h, seulement si la dernière
-- révision lue date de moins d'une heure. L'heure est celle de PARIS, pas celle
-- du serveur, été comme hiver (0026).

create or replace function public.dans_la_soiree(
  p_instant timestamptz,
  p_derniere_revision timestamptz
)
returns boolean
language sql
stable
as $fn$
  select case
    when extract(hour from timezone('Europe/Paris', p_instant)) >= 16 then true
    when extract(hour from timezone('Europe/Paris', p_instant)) < 2 then
      coalesce(p_derniere_revision > p_instant - interval '1 hour', false)
    else false
  end;
$fn$;

comment on function public.dans_la_soiree(timestamptz, timestamptz) is
  'Vrai de 16 h à minuit (Paris), et de minuit à 2 h si la dernière révision lue date de moins d''une heure.';

revoke all on function public.dans_la_soiree(timestamptz, timestamptz)
  from public, anon, authenticated;

-- ── Le passage de la soirée : une sonde par saison en diffusion ─────────────

create or replace function public.importer_saison_en_diffusion()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_document record;
  v_lances integer := 0;
begin
  for v_document in
    select s.source_document_id as id,
           (select max(r.source_revision_at)
              from import_runs r
             where r.source_document_id = s.source_document_id) as derniere_revision
      from seasons s
     where s.status = 'airing'
       and s.source_document_id is not null
  loop
    continue when not dans_la_soiree(now(), v_document.derniere_revision);
    if sonder_la_saison(v_document.id) is not null then
      v_lances := v_lances + 1;
    end if;
  end loop;
  return v_lances;
end
$fn$;

comment on function public.importer_saison_en_diffusion() is
  'Toutes les deux minutes, de 16 h à 2 h heure de Paris (après minuit tant que la page a bougé dans l''heure) : sonde la saison en diffusion.';

-- L'expression reste en UTC et large : 14 h à 1 h 59 couvre l'union de l'heure
-- d'été et de l'heure d'hiver, et `dans_la_soiree` tranche sur l'heure locale.
select cron.schedule(
  'koh-import-diffusion',
  '*/2 0-1,14-23 * * *',
  $job$select importer_saison_en_diffusion()$job$
);
