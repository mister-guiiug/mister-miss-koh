-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Deux publications d'une même transaction ne s'ordonnent  ║
-- ║ pas, et le retour arrière en dépend                                       ║
-- ║                                                                          ║
-- ║ CE QUI S'EST PASSÉ. Le 05/09/2026, deux lots ont été publiés dans une      ║
-- ║ SEULE transaction, pour que le site ne reste pas sans saison entre les     ║
-- ║ deux. `published_at` vaut `now()`, et `now()` est l'heure de DÉBUT de la   ║
-- ║ transaction : les deux publications portent donc la même. Les défaire      ║
-- ║ « du plus récent au plus ancien » devenait un tirage au sort.              ║
-- ║                                                                          ║
-- ║ CE QUE ÇA COÛTE. La photo du second lot contient des lignes créées par le  ║
-- ║ premier. Défaire le premier d'abord supprime les parents, et la           ║
-- ║ restauration du second échoue sur une clé étrangère — c'est exactement    ║
-- ║ ce qui est arrivé. La transaction a tout annulé, donc rien n'a été perdu ; ║
-- ║ mais l'ordre ne doit pas dépendre d'une chance.                           ║
-- ║                                                                          ║
-- ║ DEUX CORRECTIFS. Un rang MONOTONE sur `publications`, qui donne un ordre   ║
-- ║ total même à l'intérieur d'une transaction. Et un refus explicite : on ne  ║
-- ║ défait pas une publication tant qu'une plus récente est encore active.     ║
-- ║ Une corruption silencieuse devient un message.                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Un ordre total, indépendant de l'horloge ──────────────────────────────
create sequence if not exists publications_rang_seq;

alter table publications
  add column if not exists rang bigint;

alter table publications
  alter column rang set default nextval('publications_rang_seq');

-- L'existant se range dans le seul ordre total déjà enregistré : celui des
-- versions du référentiel, dont l'identifiant est une identité croissante.
update publications p
   set rang = v.rang
  from (
    select rv.publication_id, row_number() over (order by min(rv.id)) as rang
    from referential_versions rv
    where rv.publication_id is not null
    group by rv.publication_id
  ) v
 where v.publication_id = p.id and p.rang is null;

-- Les publications qu'aucune version ne référence (il ne devrait pas y en
-- avoir) prennent la suite, par date puis par identifiant.
update publications p
   set rang = (select coalesce(max(rang), 0) from publications) + q.n
  from (
    select id, row_number() over (order by published_at, id) as n
    from publications where rang is null
  ) q
 where q.id = p.id and p.rang is null;

select setval(
  'publications_rang_seq',
  greatest((select coalesce(max(rang), 0) from publications), 1)
);

alter table publications alter column rang set not null;

create unique index if not exists publications_rang_unique on publications (rang);

comment on column publications.rang is
  'Ordre total des publications. `published_at` ne suffit pas : `now()` est l''heure de début de transaction, et deux publications d''une même transaction la partagent.';

-- ── On ne défait pas dans le désordre ─────────────────────────────────────
create or replace function revert_publication(p_publication_id uuid, p_reason text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_pub     publications%rowtype;
  v_entry   jsonb;
  v_count   integer := 0;
  v_apres   bigint;
begin
  if not is_staff() then
    raise exception 'retour arrière réservé aux relecteurs' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'un retour arrière se motive';
  end if;

  select * into v_pub from publications where id = p_publication_id for update;
  if not found then
    raise exception 'publication introuvable : %', p_publication_id;
  end if;
  if v_pub.reverted_at is not null then
    raise exception 'publication déjà annulée le %', v_pub.reverted_at;
  end if;

  -- DANS L'ORDRE INVERSE, ET PAS AUTREMENT. La photo d'une publication
  -- contient des lignes créées par les précédentes ; défaire une ancienne
  -- avant une récente supprime des parents que la seconde restauration
  -- attend encore. Le refus vaut mieux qu'une clé étrangère au milieu du gué.
  select rang into v_apres from publications
   where reverted_at is null and rang > v_pub.rang
   order by rang limit 1;
  if v_apres is not null then
    raise exception
      'publication de rang % : la publication de rang % est encore active — défaire de la plus récente à la plus ancienne',
      v_pub.rang, v_apres;
  end if;

  -- À L'ENVERS. Les lignes ont été créées des parents vers les enfants ; les
  -- défaire dans l'autre sens évite de supprimer un parent dont un enfant
  -- attend encore d'être retiré.
  for v_entry in
    select t.value from jsonb_array_elements(v_pub.rollback_snapshot)
           with ordinality as t(value, ord)
    order by t.ord desc
  loop
    if v_entry -> 'before' is null or v_entry ->> 'before' is null then
      execute format('delete from public.%I where id = $1', v_entry ->> 't')
        using (v_entry ->> 'id')::uuid;
    else
      perform restore_row(v_entry ->> 't', v_entry -> 'before');
    end if;
    v_count := v_count + 1;
  end loop;

  update publications
     set reverted_at = now(), reverted_by = auth.uid(), revert_reason = p_reason
   where id = p_publication_id;

  update import_runs set status = 'reverted' where id = v_pub.run_id;

  -- Les différences REDEVIENNENT validées : elles restent vraies, c'est leur
  -- application qui a été jugée mauvaise. Les remettre en attente de relecture
  -- effacerait le travail du relecteur.
  update import_differences
     set status = 'validated', publication_id = null
   where publication_id = p_publication_id;

  insert into referential_versions (season_id, publication_id, summary)
  select rv.season_id, null, format('retour arrière : %s', p_reason)
  from referential_versions rv
  where rv.publication_id = p_publication_id
  limit 1;

  perform log_event('import.revert', 'publication', p_publication_id::text,
                    format('%s ligne(s) reposée(s) — %s', v_count, p_reason));

  return v_count;
end $$;

revoke all on function revert_publication(uuid, text) from public, anon;
grant execute on function revert_publication(uuid, text) to authenticated;
