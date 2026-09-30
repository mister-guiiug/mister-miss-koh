-- Le passage de nuit lit une saison à la fois.
--
-- `importer_toutes_les_saisons()` déclenche les dix-huit imports dans UNE
-- transaction, et `pg_net` n'envoie ses requêtes qu'une fois la transaction
-- validée : les dix-huit partaient donc ensemble, et autant de fonctions Edge
-- lisaient Wikipédia en même temps. L'API de Wikimedia demande une requête à
-- la fois. Une nuit ordinaire, dix-huit lectures de révision passent ; mais le
-- jour où l'extraction change de version, les dix-huit pages se relisent en
-- entier, soit plus de cent requêtes en quelques secondes. C'est ce qui fait
-- répondre 429 à Wikipédia : il l'a fait le 24/09/2026 à un relevé des
-- dix-huit pages lancé sans pause.
--
-- UN `pg_sleep` ENTRE DEUX APPELS NE SERVIRAIT À RIEN : tout part au COMMIT.
-- Il faut une transaction par saison. La tâche de nuit se réveille donc toutes
-- les deux minutes, de 4 h à 6 h UTC, et chaque réveil déclenche UNE saison :
-- une que la nuit n'a pas encore lue, la plus anciennement déclenchée
-- d'abord. Dix-huit saisons se lisent entre 4 h 01 et 4 h 35, et la fenêtre en
-- tiendrait soixante.
--
-- `dispatched_at` note le déclenchement, quelle qu'en soit l'issue : une
-- saison dont l'import échoue ne retient pas les suivantes, elle attend la
-- nuit d'après, comme avant.
--
-- `importer_toutes_les_saisons()` reste pour un passage manuel immédiat, par
-- exemple juste après une montée de version d'extraction : elle déclenche tout
-- d'un coup, en connaissance de cause.

alter table public.source_documents
  add column if not exists dispatched_at timestamptz;

comment on column public.source_documents.dispatched_at is
  'Dernier déclenchement par le passage de nuit, abouti ou non.';

create or replace function public.importer_la_saison_suivante()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_id uuid;
begin
  -- Vingt heures : la nuit précédente est passée, celle-ci pas encore.
  select d.id into v_id
    from source_documents d
   where d.source_id = 'wikipedia_fr'
     and (d.dispatched_at is null or d.dispatched_at < now() - interval '20 hours')
   order by d.dispatched_at nulls first, d.created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return 0;
  end if;

  update source_documents set dispatched_at = now() where id = v_id;
  if declencher_import(v_id) is null then
    return 0;
  end if;
  return 1;
end
$fn$;

comment on function public.importer_la_saison_suivante() is
  'Passage de nuit : déclenche UNE saison, parmi celles que la nuit n''a pas encore lues, la plus anciennement déclenchée d''abord.';

-- Comme les autres fonctions de la planification : aucun client ne l'appelle.
-- Les trois rôles sont nommés, parce que retirer l'un ne retire pas l'autre.
revoke all on function public.importer_la_saison_suivante() from public, anon, authenticated;

-- `cron.schedule` est idempotent sur le NOM : la tâche de 0026 est remplacée.
-- Les minutes impaires : un réveil qui ne tombe pas sur l'heure ronde, comme
-- le 4 h 17 d'avant.
select cron.schedule(
  'koh-import-quotidien',
  '1-59/2 4-5 * * *',
  $job$select importer_la_saison_suivante()$job$
);
