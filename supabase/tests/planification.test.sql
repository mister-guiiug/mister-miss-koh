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
select plan(19);

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

select is(
  (select schedule from cron.job where jobname = 'koh-import-quotidien'),
  '17 4 * * *',
  'le quotidien tourne une fois par jour'
);

-- LA FENÊTRE UTC EST PLUS LARGE QUE CELLE DE PARIS, ET C'EST VOULU : elle
-- couvre l'union de l'heure d'été et de l'heure d'hiver, la fonction tranchant
-- ensuite sur l'heure locale. L'écrire en dur ici, c'est empêcher qu'on la
-- resserre « pour faire propre » en cassant la moitié de l'année.
select is(
  (select schedule from cron.job where jobname = 'koh-import-diffusion'),
  '*/30 14-22 * * 2,3',
  'la diffusion tourne toutes les 30 min, mardi et mercredi, sur la fenêtre UTC élargie'
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
-- moment UTC et dit ce que Paris en fait.

create or replace function pg_temp.dans_la_fenetre(p_utc timestamptz)
returns boolean
language sql
immutable
as $$
  select extract(isodow from timezone('Europe/Paris', p_utc)) in (2, 3)
     and extract(hour   from timezone('Europe/Paris', p_utc)) >= 16;
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
  not pg_temp.dans_la_fenetre('2026-09-10 18:00:00+00'),
  'jeudi soir ne l''est pas'
);

select ok(
  not pg_temp.dans_la_fenetre('2026-09-07 18:00:00+00'),
  'lundi soir ne l''est pas'
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

select finish();
rollback;
