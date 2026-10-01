-- mister-miss-koh : trois invariants de sécurité de la base. pgTAP, joué par
-- `supabase test db` sur la pile jetable de la CI.
--
-- 1. Aucune table de `public` sans RLS. Supabase expose `public` à la clé
--    anon du bundle : une table sans RLS y est ouverte à quiconque a cette
--    clé, dans la limite de ses privilèges.
-- 2. Les fonctions SECURITY DEFINER qu'`anon` peut exécuter forment une liste
--    RELUE. Une telle fonction s'exécute sous son propriétaire (`postgres`,
--    qui porte BYPASSRLS) : elle contourne la RLS, et seul son propre
--    contrôle de l'appelant protège les données. Supabase accorde EXECUTE à
--    `anon` sur toute fonction créée dans `public`, par un privilège PAR
--    DÉFAUT, et `revoke … from public` ne le retire pas : il faut nommer
--    `anon`. Une fonction neuve absente de la liste fait échouer ce test :
--    lui retirer `anon`, ou l'ajouter après avoir relu son contrôle de
--    l'appelant.
-- 3. Aucune fonction de `public` ne lève `40001` (`serialization_failure`).
--    PostgREST prend ce code pour un échec de sérialisation passager et
--    rejoue la transaction SANS FIN : la requête ne répond jamais, et le
--    backend tourne jusqu'à ce qu'on le tue (PostgREST 14, corrigé en 16).
--    Un conflit métier se signale par `PT409`, rendu en HTTP 409. Ajouté le
--    01/10/2026, après une boucle en production sur mister-molkky.
--
-- Le même fichier vit dans chaque application Supabase du parc (29/09/2026).
-- Les tables et fonctions d'une extension ne relèvent pas des migrations :
-- elles sont écartées.

create extension if not exists pgtap with schema extensions;

set search_path to public, extensions;

begin;

select plan(3);

select is_empty(
  $$
    select c.relname::text
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass
            and d.objid = c.oid
            and d.deptype = 'e'
       )
  $$,
  'aucune table de public sans RLS'
);

select set_eq(
  $$
    select p.proname::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and p.prosecdef
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and has_function_privilege('anon', p.oid, 'execute')
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.deptype = 'e'
       )
  $$,
  array[
    -- Aides de la RLS : elles ne rendent que ce qui concerne l'appelant, rien
    -- pour anon
    'has_role',
    'is_staff',
    -- Publiques par conception : disponibilité d'un pseudo, et liens de
    -- partage protégés par leur jeton
    'consume_photo_share',
    'get_shared_note',
    'get_shared_notes',
    'get_shared_profile',
    'handle_is_available',
    -- Sans effet pour anon : export_my_data ne lit que auth.uid(),
    -- review_difference exige is_staff()
    'export_my_data',
    'review_difference'
    -- log_event en est sortie avec 0034.
  ],
  'les fonctions SECURITY DEFINER exécutables par anon sont exactement la liste relue'
);

-- Le corps entier est lu, commentaires compris : une fonction qui ne fait que
-- CITER le code échoue aussi. C'est voulu, la règle reste simple à tenir.
select is_empty(
  $$
    select p.proname::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~* '40001|serialization_failure'
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.deptype = 'e'
       )
  $$,
  'aucune fonction de public ne lève 40001 : PostgREST la rejouerait sans fin'
);

select * from finish();

rollback;
