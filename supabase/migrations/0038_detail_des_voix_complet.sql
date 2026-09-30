-- Un tour sait enfin si le détail de ses voix est complet.
--
-- `council_rounds.votes_complete` existe depuis 0001 et n'avait jamais été
-- écrit : toutes les lignes valaient `false`, et l'application écrivait « ≥ »
-- devant chaque décompte. Relevé du 30/09/2026 sur le site : « Camille ≥ 5
-- voix » pour un 5/6 que la source détaille bulletin par bulletin (épisode 6
-- d'All Stars, dont un vote double).
--
-- LA RÈGLE. Un tour est complet quand la source donne son total, qu'aucun
-- bulletin n'a de cible inconnue, et que les bulletins en rendent le compte :
-- ses voix valides, OU toutes ses voix, barrées comprises. Les deux, parce que
-- la source n'écrit pas toujours le même total quand un collier annule des
-- voix : « 3/9 » pour trois voix valides et six annulées (toutes les voix),
-- mais « 6/12 » pour douze voix valides et une barrée (les voix valides).
-- Chaque voix compte à son poids (0037). Sans total (« 2 », « / »), rien ne se
-- prouve : le tour reste incomplet.
--
-- Mesuré le 30/09/2026 sur les dix-huit pages (extraction 14) : 89 tours de
-- scrutin complets sur 228, dont les six d'All Stars. Les autres manquent d'au
-- moins un bulletin dans la matrice (neuf pour « 6/10 », le plus souvent), ou
-- n'ont pas de total : « ≥ » y reste juste.
--
-- UN DÉCLENCHEUR, ET NON LA PUBLICATION. Un retour arrière repose les lignes
-- une à une, à l'envers (`revert_publication`). Une valeur calculée par
-- `publish_run` serait restée vraie après le retrait du bulletin qui la
-- rendait vraie. Recalculée à chaque écriture d'un tour ou d'une voix, elle
-- suit la publication, le retour arrière et toute correction à la main.
-- Seuls le propriétaire (par `publish_run` et `revert_publication`) et le rôle
-- de service écrivent ces tables : les clients n'ont que la lecture (0004).

create or replace function round_votes_complete(p_round_id uuid, p_total integer)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_total is not null
    and not exists (
      select 1 from council_votes v
       where v.round_id = p_round_id
         and v.target_id is null
         and not v.did_not_vote
    )
    and p_total in (
      (select coalesce(sum(coalesce(v.weight, 1)), 0) from council_votes v
        where v.round_id = p_round_id and not v.did_not_vote and not v.is_annulled),
      (select coalesce(sum(coalesce(v.weight, 1)), 0) from council_votes v
        where v.round_id = p_round_id and not v.did_not_vote)
    );
$$;

comment on function round_votes_complete(uuid, integer) is
  'Vrai quand les bulletins du tour rendent son total rapporté : voix valides ou toutes les voix, au poids, sans cible inconnue. Faux sans total.';

-- Le tour se juge lui-même à chaque écriture : un total corrigé, un tour
-- reposé par un retour arrière, une valeur écrite à la main.
create or replace function council_rounds_votes_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.votes_complete := round_votes_complete(new.id, new.reported_votes_total);
  return new;
end
$$;

create trigger votes_complete
  before insert or update on council_rounds
  for each row execute function council_rounds_votes_complete();

-- Une voix ajoutée, retirée ou corrigée rejuge son tour ; déplacée, les deux.
create or replace function council_votes_votes_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update council_rounds
       set votes_complete = round_votes_complete(id, reported_votes_total)
     where id = old.round_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update council_rounds
       set votes_complete = round_votes_complete(id, reported_votes_total)
     where id = new.round_id;
  end if;
  return null;
end
$$;

create trigger votes_complete
  after insert or update or delete on council_votes
  for each row execute function council_votes_votes_complete();

revoke all on function round_votes_complete(uuid, integer) from public, anon, authenticated;
grant execute on function round_votes_complete(uuid, integer) to service_role;
revoke all on function council_rounds_votes_complete() from public, anon, authenticated;
revoke all on function council_votes_votes_complete() from public, anon, authenticated;

-- Les tours déjà publiés se jugent une fois, ici.
update council_rounds
   set votes_complete = round_votes_complete(id, reported_votes_total);
