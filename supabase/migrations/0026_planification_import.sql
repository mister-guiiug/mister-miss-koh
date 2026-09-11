-- ═══════════════════════════════════════════════════════════════════════════
-- LA PLANIFICATION DE L'IMPORT
--
-- CE QUI MANQUAIT. La fonction Edge a toujours eu deux portes d'entrée — un
-- utilisateur habilité, ou « la planification qui présente un secret ». La
-- seconde était décrite, testée, documentée… et personne ne la franchissait :
-- aucun `cron`, aucun workflow, aucune tâche en base. Le référentiel s'est donc
-- figé sur la révision lue le 06/09/2026 pendant que la page continuait d'être
-- modifiée. Relevé le 11/09 : la base en était à la révision 239179934, et
-- Wikipédia à 239358298.
--
-- POURQUOI EN BASE ET PAS DANS UN WORKFLOW. `pg_cron` est déjà là — il balaie
-- les partages de photos depuis 0022 —, il ne dépend pas de GitHub, et il ne
-- réclame aucun secret de dépôt. Le secret de la planification reste dans le
-- Vault du projet : il n'entre jamais dans ce fichier, donc jamais dans git.
-- ═══════════════════════════════════════════════════════════════════════════

-- `pg_net` : l'appel HTTP depuis la base. Il est ASYNCHRONE — `http_post` rend
-- un identifiant de requête et n'attend pas la réponse. C'est exactement ce
-- qu'on veut : la planification déclenche, elle n'arbitre pas. Ce que l'import
-- a fait se lit dans `import_runs`, jamais dans le retour de cette fonction.
create extension if not exists pg_net;

-- ───────────────────────────────────────────────────────────────────────────
-- CE QU'IL FAUT AVOIR POSÉ DANS LE VAULT pour que tout ceci serve à quelque
-- chose. Trois secrets, à créer une fois, à la main :
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1',
--                              'koh_functions_url');
--   select vault.create_secret('<clé anon>', 'koh_anon_key');
--   select vault.create_secret('<IMPORT_CRON_SECRET>',
--                              'koh_import_cron_secret');
--
-- LES TROIS SONT NÉCESSAIRES, et pour des raisons différentes. La plateforme
-- Supabase garde l'entrée de toute fonction Edge derrière un JWT valide : sans
-- `Authorization`, elle rend `UNAUTHORIZED_NO_AUTH_HEADER` et la fonction n'est
-- même pas atteinte — vérifié le 11/09/2026. La clé anon suffit à franchir
-- cette porte-là : elle est publique, elle est déjà dans le bundle du site.
-- C'est ENSUITE que `x-import-secret` ouvre la porte de la planification, la
-- seule qui n'exige pas d'utilisateur habilité.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.declencher_import(p_document_id uuid)
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

  -- UN SECRET MANQUANT N'EST PAS UNE PANNE SILENCIEUSE. Sans lui, l'appel
  -- partirait quand même et se ferait refuser : un 401 de plus toutes les
  -- trente minutes, que personne ne lit. On s'arrête, et on DIT lequel manque
  -- — jamais sa valeur.
  if v_base is null or v_anon is null or v_secret is null then
    raise warning
      'planification import : secret absent du Vault (url=%, anon=%, secret=%)',
      v_base is not null, v_anon is not null, v_secret is not null;
    return null;
  end if;

  return net.http_post(
    url     := v_base || '/import-wikipedia',
    body    := jsonb_build_object('documentId', p_document_id),
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'Authorization',   'Bearer ' || v_anon,
      'x-import-secret', v_secret
    ),
    -- Généreux à dessein : un import qui a vraiment du travail lit plusieurs
    -- sections et écrit un lot de différences. Une coupure côté base tuerait
    -- la requête en vol, et le journal garderait un import commencé sans fin.
    timeout_milliseconds := 120000
  );
end
$fn$;

comment on function public.declencher_import(uuid) is
  'Déclenche un import pour un document source, par la porte de la planification. Asynchrone : le résultat se lit dans import_runs.';

-- Personne ne l'appelle depuis l'API : elle lit le Vault, et `pg_cron` tourne
-- comme propriétaire du travail. Les rôles exposés sont nommés explicitement,
-- parce que le privilège par défaut de Supabase les aurait servis.
revoke all on function public.declencher_import(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- LE PASSAGE QUOTIDIEN : toutes les saisons.
--
-- Une page peut être corrigée des mois après sa diffusion — une orthographe,
-- une précision, un lien ajouté. Rien ne justifie de ne surveiller que la
-- saison en cours, et ce passage ne coûte presque rien : une révision déjà
-- traitée s'arrête au premier appel d'API, sans lire une seule section.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.importer_toutes_les_saisons()
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
    select d.id
      from source_documents d
     where d.source_id = 'wikipedia_fr'
     order by d.created_at
  loop
    if declencher_import(v_document.id) is not null then
      v_lances := v_lances + 1;
    end if;
  end loop;
  return v_lances;
end
$fn$;

comment on function public.importer_toutes_les_saisons() is
  'Passage quotidien : un import par page de saison connue.';

revoke all on function public.importer_toutes_les_saisons() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- LE PASSAGE SERRÉ : la saison en cours, pendant la diffusion.
--
-- Mardi et mercredi, de 16 h à minuit, toutes les trente minutes. C'est la
-- fenêtre où la page bouge : un épisode passe, et les contributeurs écrivent
-- pendant et après.
--
-- SEULE LA SAISON `airing` EST RELUE. Les autres n'ont aucune raison de changer
-- un mardi soir, et les appeler ferait dix-huit requêtes toutes les demi-heures
-- pour dix-sept réponses « rien de neuf ».
--
-- L'HEURE EST CELLE DE PARIS, PAS CELLE DU SERVEUR. `pg_cron` lit ses
-- expressions dans le fuseau de la base — UTC ici — et la France change d'heure
-- deux fois par an. Une fenêtre écrite en UTC déborderait donc d'une heure la
-- moitié de l'année : en été, 22 h UTC est déjà minuit passé à Paris. La
-- planification ouvre large — 14 h à 22 h UTC, l'union des deux saisons — et
-- c'est CETTE FONCTION qui tranche, sur l'heure de Paris. La bordure est ainsi
-- exacte toute l'année, au prix d'un réveil par tour qui ne fait rien.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.importer_saison_en_diffusion()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  -- Une seule lecture de l'horloge : deux appels séparés pourraient tomber de
  -- part et d'autre d'une minute, et faire mentir la borne.
  v_paris timestamptz := timezone('Europe/Paris', now());
  v_heure integer := extract(hour from v_paris);
  v_jour  integer := extract(isodow from v_paris);
  v_document record;
  v_lances integer := 0;
begin
  -- 2 = mardi, 3 = mercredi ; 16 à 23 inclus, donc le dernier tour part à
  -- 23 h 30 et rien ne se déclenche une fois minuit passé.
  if v_jour not in (2, 3) or v_heure < 16 then
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
  'Passage serré mardi/mercredi 16h-minuit (heure de Paris) : la saison en diffusion seulement.';

revoke all on function public.importer_saison_en_diffusion() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- LES DEUX TÂCHES
--
-- `cron.schedule` est idempotent sur le NOM : rejouer cette migration remplace
-- la définition au lieu d'empiler des doublons.
--
-- 4 h 17 UTC pour le quotidien : creux de trafic, et une minute qui n'est pas
-- pile — les planificateurs du monde entier se réveillent à l'heure ronde.
-- ───────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'koh-import-quotidien',
  '17 4 * * *',
  $job$select importer_toutes_les_saisons()$job$
);

select cron.schedule(
  'koh-import-diffusion',
  '*/30 14-22 * * 2,3',
  $job$select importer_saison_en_diffusion()$job$
);
