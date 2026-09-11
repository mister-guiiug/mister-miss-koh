-- ═══════════════════════════════════════════════════════════════════════════
-- POSER LES SECRETS DE LA PLANIFICATION SANS PSQL
--
-- LE PROBLÈME. `0026` a besoin de trois valeurs dans le Vault, et une migration
-- ne peut pas les porter : elles seraient dans git. Les poser à la main, c'est
-- une étape que personne ne refait — et une planification qui attend un geste
-- humain finit comme celle d'avant, décrite et jamais franchie.
--
-- POURQUOI PAS `psql` DEPUIS LA CI. L'hôte direct `db.<ref>.supabase.co` est
-- désormais joignable en IPv6 seulement, et les exécuteurs GitHub n'ont pas
-- d'IPv6 ; le connecteur groupé, lui, porte une région dans son nom qu'aucun
-- fichier du dépôt ne connaît. Un appel HTTPS, lui, marche partout.
--
-- D'OÙ CETTE FONCTION : le seul chemin par lequel un secret entre, et il est
-- réservé à `service_role`. Ce que cette clé permet déjà par ailleurs est sans
-- commune mesure — elle n'ouvre donc aucune porte nouvelle.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.definir_secret_planification(
  p_nom text,
  p_valeur text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_id uuid;
begin
  -- TROIS NOMS, ET AUCUN AUTRE. Sans cette liste, la fonction deviendrait un
  -- « écris n'importe quoi dans le Vault » — utile à personne, et une surface
  -- de plus le jour où la clé de service fuite.
  if p_nom not in ('koh_functions_url', 'koh_anon_key', 'koh_import_cron_secret') then
    raise exception 'secret de planification inconnu : %', p_nom;
  end if;

  if p_valeur is null or length(trim(p_valeur)) = 0 then
    raise exception 'valeur vide pour %', p_nom;
  end if;

  select id into v_id from vault.secrets where name = p_nom;

  if v_id is null then
    perform vault.create_secret(
      p_valeur,
      p_nom,
      'Planification de l''import Wikipédia (migration 0027)'
    );
  else
    -- Rejouable : une rotation de clé repasse par ici sans qu'on ait à effacer
    -- quoi que ce soit, et la planification reprend la valeur neuve au tour
    -- suivant.
    perform vault.update_secret(v_id, p_valeur);
  end if;
end
$fn$;

comment on function public.definir_secret_planification(text, text) is
  'Pose ou remplace un des trois secrets du Vault dont la planification a besoin. Réservé à service_role.';

-- LE MESSAGE D'ERREUR NE PORTE JAMAIS LA VALEUR, seulement le nom : une
-- exception remonte dans la réponse HTTP, et une réponse se journalise.
revoke all on function public.definir_secret_planification(text, text)
  from public, anon, authenticated;
grant execute on function public.definir_secret_planification(text, text)
  to service_role;
