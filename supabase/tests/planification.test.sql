-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ La planification de l'import — pgTAP.                                    ║
-- ║                                                                          ║
-- ║ CE QUE CES TESTS TIENNENT. Pas « les fonctions existent » : la FENÊTRE.  ║
-- ║ Le référentiel s'est figé cinq jours parce que personne ne franchissait  ║
-- ║ la porte de la planification. Ce qui doit rester vrai, c'est qu'il y a   ║
-- ║ deux tâches, et que la serrée ne s'ouvre qu'aux heures demandées —       ║
-- ║ heure de PARIS, pas heure du serveur, été comme hiver.                   ║
-- ║                                                                          ║
-- ║ Sans Docker : `npm run test:planification:remote`.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

begin;
select plan(40);

-- ── Les deux tâches sont posées ───────────────────────────────────────────

select is(
  (select count(*)::int from cron.job where jobname = 'koh-import-quotidien'),
  1,
  'le passage quotidien est planifié, une fois'
);

select is(
  (select count(*)::int from cron.job where jobname = 'koh-import-diffusion'),
  1,
  'le passage de diffusion est planifié, une fois'
);

-- UNE SAISON PAR RÉVEIL, UN RÉVEIL TOUTES LES DEUX MINUTES. Déclencher les
-- dix-huit dans une seule transaction les faisait partir ensemble (voir 0035).
select is(
  (select schedule from cron.job where jobname = 'koh-import-quotidien'),
  '1-59/2 4-5 * * *',
  'la nuit se réveille toutes les deux minutes, de 4 h à 6 h UTC'
);

-- LA FENÊTRE UTC EST PLUS LARGE QUE CELLE DE PARIS, ET C'EST VOULU : elle
-- couvre l'union de l'heure d'été et de l'heure d'hiver, la fonction tranchant
-- ensuite sur l'heure locale. L'écrire en dur ici, c'est empêcher qu'on la
-- resserre « pour faire propre » en cassant la moitié de l'année.
select is(
  (select schedule from cron.job where jobname = 'koh-import-diffusion'),
  '*/2 0-1,14-23 * * *',
  'la soirée se sonde toutes les 2 min, tous les soirs, sur la fenêtre UTC élargie'
);

select is(
  (select active from cron.job where jobname = 'koh-import-quotidien'),
  true,
  'le quotidien est actif'
);

select is(
  (select active from cron.job where jobname = 'koh-import-diffusion'),
  true,
  'la diffusion est active'
);

-- ── La bordure, heure de Paris ────────────────────────────────────────────
--
-- On ne peut pas déplacer l'horloge dans une transaction pgTAP, alors on
-- éprouve la RÈGLE elle-même, sur des instants choisis. Chaque cas donne un
-- moment UTC et dit ce que Paris en fait. Depuis 0036, la règle est une
-- fonction de la base, `dans_la_soiree` : c'est ELLE qui est éprouvée, plus une
-- copie tenue dans ce fichier. Sans révision récente (`null`), la soirée
-- s'arrête à minuit, comme avant.

create or replace function pg_temp.dans_la_fenetre(p_utc timestamptz)
returns boolean
language sql
stable
as $$
  select public.dans_la_soiree(p_utc, null);
$$;

-- Été (UTC+2). Mardi 8 septembre 2026.
select ok(
  pg_temp.dans_la_fenetre('2026-09-08 14:00:00+00'),
  'été : mardi 16 h 00 à Paris ouvre la fenêtre'
);

select ok(
  not pg_temp.dans_la_fenetre('2026-09-08 13:30:00+00'),
  'été : mardi 15 h 30 à Paris est encore dehors'
);

select ok(
  pg_temp.dans_la_fenetre('2026-09-08 21:30:00+00'),
  'été : mardi 23 h 30 à Paris est le dernier tour'
);

-- C'EST LE CAS QUI JUSTIFIE TOUT LE MÉCANISME. 22 h UTC en été, c'est minuit
-- passé à Paris — et le `cron` UTC, lui, se réveille quand même.
select ok(
  not pg_temp.dans_la_fenetre('2026-09-08 22:00:00+00'),
  'été : 22 h UTC est minuit à Paris — la fenêtre est fermée'
);

-- Hiver (UTC+1). Mardi 8 décembre 2026.
select ok(
  not pg_temp.dans_la_fenetre('2026-12-08 14:00:00+00'),
  'hiver : 14 h UTC n''est que 15 h à Paris — trop tôt'
);

select ok(
  pg_temp.dans_la_fenetre('2026-12-08 15:00:00+00'),
  'hiver : mardi 16 h 00 à Paris ouvre la fenêtre'
);

select ok(
  pg_temp.dans_la_fenetre('2026-12-08 22:30:00+00'),
  'hiver : mardi 23 h 30 à Paris est le dernier tour'
);

-- ── Les jours ─────────────────────────────────────────────────────────────

select ok(
  pg_temp.dans_la_fenetre('2026-09-09 18:00:00+00'),
  'mercredi soir est dans la fenêtre'
);

select ok(
  pg_temp.dans_la_fenetre('2026-09-10 18:00:00+00'),
  'jeudi soir est dans la fenêtre'
);

select ok(
  pg_temp.dans_la_fenetre('2026-09-07 18:00:00+00'),
  'lundi soir est dans la fenêtre'
);

-- ── Ce que personne ne doit pouvoir appeler ───────────────────────────────
--
-- Ces fonctions lisent le Vault et parlent à la fonction Edge avec le secret
-- de la planification. Exposées à l'API, elles offriraient à n'importe quel
-- visiteur un déclencheur d'import.

select ok(
  not has_function_privilege('anon', 'public.declencher_import(uuid)', 'execute'),
  'anon ne peut pas déclencher un import'
);

select ok(
  not has_function_privilege('authenticated', 'public.importer_toutes_les_saisons()', 'execute'),
  'un compte connecté ne peut pas lancer le passage quotidien'
);

select ok(
  not has_function_privilege('authenticated', 'public.importer_saison_en_diffusion()', 'execute'),
  'un compte connecté ne peut pas lancer le passage de diffusion'
);

-- ── La porte par laquelle les secrets entrent ─────────────────────────────
--
-- Elle est réservée à `service_role`, et c'est la CI qui l'emprunte. Ouverte
-- plus largement, elle laisserait un visiteur écrire dans le Vault.

select ok(
  not has_function_privilege('anon', 'public.definir_secret_planification(text, text)', 'execute'),
  'anon ne peut pas écrire dans le Vault'
);

select ok(
  has_function_privilege('service_role', 'public.definir_secret_planification(text, text)', 'execute'),
  'service_role le peut — c''est par là que la CI pose les secrets'
);

-- ── La nuit, une saison par réveil ────────────────────────────────────────
--
-- Dans la pile de test, le Vault est vide : `declencher_import` s'arrête sur
-- son avertissement et n'envoie rien. On juge donc le CHOIX de la saison, par
-- `dispatched_at`, et non l'appel. Contre la base liée, le `rollback` final
-- annule aussi les appels : `pg_net` n'envoie qu'après un COMMIT.

select is(
  (select command from cron.job where jobname = 'koh-import-quotidien'),
  'select importer_la_saison_suivante()',
  'chaque réveil de la nuit déclenche la saison suivante, et elle seule'
);

select ok(
  not has_function_privilege('anon', 'public.importer_la_saison_suivante()', 'execute'),
  'anon ne peut pas déclencher la saison suivante'
);

select ok(
  not has_function_privilege('authenticated', 'public.importer_la_saison_suivante()', 'execute'),
  'un compte connecté non plus'
);

-- Décor : la nuit commence, rien n'est encore déclenché.
update source_documents set dispatched_at = null where source_id = 'wikipedia_fr';

select importer_la_saison_suivante();
select is(
  (select count(*)::int from source_documents
    where source_id = 'wikipedia_fr' and dispatched_at is not null),
  1,
  'un réveil déclenche UNE saison'
);

select importer_la_saison_suivante();
select is(
  (select count(*)::int from source_documents
    where source_id = 'wikipedia_fr' and dispatched_at is not null),
  2,
  'le réveil suivant en déclenche une autre'
);

select importer_la_saison_suivante()
  from generate_series(1, (select count(*)::int from source_documents
                            where source_id = 'wikipedia_fr'));
select is(
  (select count(*)::int from source_documents
    where source_id = 'wikipedia_fr' and dispatched_at is null),
  0,
  'autant de réveils que de saisons, et toutes sont déclenchées'
);

select is(
  importer_la_saison_suivante(),
  0,
  'un réveil de plus ne déclenche rien : la nuit est faite'
);

-- La nuit suivante : une saison déclenchée il y a vingt et une heures redevient
-- la première à lire.
update source_documents set dispatched_at = now() - interval '21 hours'
 where id = (select id from source_documents
              where source_id = 'wikipedia_fr' order by created_at limit 1);
select importer_la_saison_suivante();
select is(
  (select count(*)::int from source_documents
    where source_id = 'wikipedia_fr' and dispatched_at < now() - interval '20 hours'),
  0,
  'une saison lue la nuit d''avant se relit la nuit suivante'
);

-- ── La soirée en quasi direct (0036) ──────────────────────────────────────
--
-- Après minuit, la soirée ne continue que si la page a bougé dans l'heure :
-- après l'émission, les contributeurs écrivent encore. Mercredi 9 septembre
-- 2026, heure d'été : minuit et demi à Paris, c'est 22 h 30 UTC la veille.

select ok(
  public.dans_la_soiree('2026-09-08 22:30:00+00', '2026-09-08 22:10:00+00'),
  'minuit et demi, révision lue il y a vingt minutes : la soirée continue'
);

select ok(
  not public.dans_la_soiree('2026-09-08 22:30:00+00', '2026-09-08 20:30:00+00'),
  'minuit et demi, rien depuis deux heures : la soirée est finie'
);

select ok(
  not public.dans_la_soiree('2026-09-09 00:10:00+00', '2026-09-09 00:05:00+00'),
  '2 h 10 à Paris : fermé, même si la page bouge encore'
);

select ok(
  not public.dans_la_soiree('2026-09-08 13:30:00+00', '2026-09-08 13:25:00+00'),
  '15 h 30 à Paris : une révision récente n''ouvre pas la soirée plus tôt'
);

-- Ce que la sonde envoie. Des secrets de test sont posés s'il n'y en a pas ;
-- contre la base liée, les vrais servent. Dans les deux cas, `pg_net` n'envoie
-- qu'au COMMIT, et le `rollback` final annule les requêtes mises en file.
select vault.create_secret('https://exemple.test/functions/v1', 'koh_functions_url')
 where not exists (select 1 from vault.secrets where name = 'koh_functions_url');
select vault.create_secret('cle-anon-de-test', 'koh_anon_key')
 where not exists (select 1 from vault.secrets where name = 'koh_anon_key');
select vault.create_secret('secret-de-test', 'koh_import_cron_secret')
 where not exists (select 1 from vault.secrets where name = 'koh_import_cron_secret');

select set_config(
  'koh.sonde',
  sonder_la_saison('00000000-0000-4000-8000-0000000000aa')::text,
  true
);
select is(
  (select convert_from(q.body, 'utf8')::jsonb
     from net.http_request_queue q
    where q.id = current_setting('koh.sonde')::bigint),
  '{"action": "sonder", "documentId": "00000000-0000-4000-8000-0000000000aa"}'::jsonb,
  'la sonde part avec son action, pour la saison demandée'
);
select ok(
  (select q.headers ? 'x-import-secret' and q.url like '%/import-wikipedia'
     from net.http_request_queue q
    where q.id = current_setting('koh.sonde')::bigint),
  '... vers la fonction d''import, par la porte de la planification'
);

select set_config(
  'koh.import',
  declencher_import('00000000-0000-4000-8000-0000000000aa')::text,
  true
);
select is(
  (select convert_from(q.body, 'utf8')::jsonb
     from net.http_request_queue q
    where q.id = current_setting('koh.import')::bigint),
  '{"documentId": "00000000-0000-4000-8000-0000000000aa"}'::jsonb,
  'declencher_import envoie le même corps qu''avant, sans action'
);

select ok(
  not has_function_privilege('anon', 'public.sonder_la_saison(uuid)', 'execute'),
  'anon ne peut pas sonder une saison'
);
select ok(
  not has_function_privilege('authenticated', 'public.sonder_la_saison(uuid)', 'execute'),
  'un compte connecté non plus'
);
select ok(
  not has_function_privilege('anon', 'public.appeler_import(jsonb)', 'execute'),
  'anon ne peut pas appeler la fonction d''import avec un corps de son choix'
);
select ok(
  not has_function_privilege('authenticated', 'public.appeler_import(jsonb)', 'execute'),
  'un compte connecté non plus'
);

select finish();
rollback;
