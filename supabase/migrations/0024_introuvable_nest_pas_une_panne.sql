-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ « Introuvable » n'est pas une panne : PT404 au lieu de P0002.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- CE QUI SE PASSAIT. Ouvrir un lien de partage inconnu, révoqué ou expiré
-- faisait répondre au serveur **HTTP 500**. L'écran affichait bien « Ce lien
-- n'ouvre rien » — l'application n'a jamais été en défaut —, mais la trace,
-- elle, annonçait une panne serveur pour la situation la plus ordinaire qui
-- soit. Une erreur rouge dans la console de chaque visiteur qui ouvre un lien
-- périmé, et une supervision qui compte des incidents inexistants.
--
-- POURQUOI. PostgREST traduit le SQLSTATE en statut HTTP, et il ne connaît que
-- quelques codes : `P0001` → 400, `42501` → 403, `42P01` → 404… Tout le reste,
-- dont `P0002` (`no_data_found`), tombe dans le fourre-tout **500**. Il offre
-- en revanche une convention explicite : un SQLSTATE de la forme **`PTxxx`**
-- impose le statut `xxx`.
--
-- Mesuré le 07/09/2026 contre la base liée, par deux fonctions sondes
-- appelées avec la clé anonyme puis retirées :
--
--     raise … using errcode = 'P0002'  →  HTTP 500
--     raise … using errcode = 'PT404'  →  HTTP 404
--
-- Le partage de photo, lui, n'a jamais eu ce défaut : `consume_photo_share`
-- rend zéro ligne au lieu de lever, et répond donc 200. Ce n'était pas un
-- choix de style — la ligne étant supprimée, elle n'a rien à distinguer.
-- Les lecteurs de notes, eux, DOIVENT lever : un tableau vide y signifie déjà
-- « lien valide, mais son auteur n'y a laissé aucune note ouverte », et c'est
-- un message tout différent de « ce lien ne mène à rien ».
--
-- POURQUOI RÉÉCRIRE PLUTÔT QUE RECOPIER. Six fonctions sont concernées, nées
-- dans trois migrations (0004, 0021, 0023). Les redéclarer ici en recopiant
-- leur corps ferait entrer dans le dépôt six copies destinées à diverger de
-- l'original au premier correctif. On remplace donc UN JETON dans la
-- définition que la base porte déjà : rien d'autre ne peut bouger, et la
-- migration reste juste quel que soit ce que les corps sont devenus.
--
-- La règle est tenue par `supabase/tests/rls.test.sql` : plus aucune fonction
-- de `public` ne doit lever `P0002`.

do $$
declare
  f record;
  def text;
  n integer := 0;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind = 'f'
       and p.prosrc like '%P0002%'
     order by p.proname
  loop
    -- `pg_get_functiondef` rend un `create or replace` complet, guillemets
    -- dollar compris : le rejouer tel quel, à un jeton près, ne peut pas
    -- altérer autre chose.
    def := replace(pg_get_functiondef(f.oid), 'P0002', 'PT404');
    execute def;
    n := n + 1;
    raise notice 'PT404 posé sur %', f.proname;
  end loop;

  if n = 0 then
    raise exception 'aucune fonction à corriger : la migration a déjà tourné, ou le motif a changé';
  end if;
end $$;
