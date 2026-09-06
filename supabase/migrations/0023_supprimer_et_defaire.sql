-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Supprimer une note, et défaire la suppression.                            ║
-- ║                                                                          ║
-- ║ CORRECTIF : DEPUIS 0004, PERSONNE N'A JAMAIS PU SUPPRIMER UNE NOTE.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- CE QUI SE PASSAIT. L'application supprime en posant `deleted_at`
-- (`notesRepository.remove`). PostgreSQL refusait cette écriture :
--
--   ERROR:  42501: new row violates row-level security policy
--                  for table "personal_notes"
--
-- Non pas à cause du `with check` de `notes_maj`, qui ne regarde que
-- `user_id` — mais parce que **la ligne issue d'un `update` doit rester
-- visible sous une politique de SELECT**. Les deux politiques de lecture de
-- `personal_notes` portent `deleted_at is null` : la ligne qu'on vient de
-- marquer supprimée n'est plus visible par personne, donc l'écriture est
-- rejetée. Mesuré le 06/09/2026 contre la base liée : la MÊME instruction
-- passe dès qu'on ajoute une politique de lecture couvrant les supprimées, et
-- échoue sans elle. Ni la clause `where` ni le déclencheur de fraîcheur n'y
-- sont pour quelque chose.
--
-- L'AUTRE MOITIÉ ÉTAIT CASSÉE AUSSI, et plus silencieusement : `restore` fait
-- `update … set deleted_at = null`, mais la ligne à restaurer est déjà
-- invisible — l'`update` ne trouvait donc AUCUNE ligne. Pas d'erreur de
-- droits, simplement rien, et un `.single()` qui échoue au retour.
--
-- POURQUOI UNE FONCTION PLUTÔT QU'UNE POLITIQUE DE LECTURE. Ouvrir la lecture
-- de ses propres supprimées débloquerait l'écriture d'une ligne, et créerait
-- une corbeille que la conception refuse explicitement (voir l'en-tête de
-- `personnel.test.sql`). Pire : chaque requête du client devrait désormais
-- filtrer `deleted_at is null`, et le jour où l'une l'oublie, des notes
-- supprimées reparaissent. On ne peut pas à la fois cacher une ligne à son
-- auteur et lui laisser retourner l'interrupteur : il faut une PORTE, étroite,
-- qui vérifie elle-même à qui elle ouvre.
--
-- Ces deux fonctions sont cette porte. `security definer`, donc au-dessus de
-- la RLS — et c'est le `user_id = auth.uid()` de leur clause `where` qui tient
-- lieu de politique. `auth.uid()` vaut `null` pour un anonyme, la condition
-- n'est alors jamais vraie ; le droit d'exécution lui est retiré en plus.

create or replace function delete_note(note_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Pas de garde `deleted_at is null` : supprimer deux fois ne doit pas être
  -- une erreur. Un double clic n'est pas une faute, et le résultat visé est
  -- déjà là.
  update personal_notes n
     set deleted_at = now()
   where n.id = note_id
     and n.user_id = auth.uid();

  -- MÊME message pour « pas la vôtre » et « n'existe pas » : les distinguer
  -- dirait à un curieux quels identifiants existent.
  if not found then
    raise exception 'note introuvable' using errcode = 'P0002';
  end if;
end $$;

revoke all on function delete_note(uuid) from public, anon;
grant execute on function delete_note(uuid) to authenticated;

comment on function delete_note(uuid) is
  'Pose `deleted_at`. Passe par une fonction parce qu''une ligne supprimée n''est plus visible sous aucune politique de lecture, ce qui fait refuser l''`update` direct.';

-- ── Défaire ────────────────────────────────────────────────────────────────
--
-- Rend la note AVEC son contenu : rien n'avait été effacé, seule une date
-- avait été posée. C'est ce retour qui prouve à l'appelant que la
-- restauration a bien eu lieu, plutôt que de lui faire réafficher une copie
-- gardée à l'écran. Les colonnes sont CHOISIES — les mêmes que celles que
-- l'application lit —, jamais `user_id` ni `deleted_at`.

create or replace function restore_note(note_id uuid)
returns table (
  id uuid,
  title text,
  body text,
  rating smallint,
  is_draft boolean,
  is_pinned boolean,
  visibility visibility_level,
  updated_at timestamptz,
  season_id uuid,
  season_contestant_id uuid,
  episode_id uuid,
  team_id uuid,
  challenge_id uuid,
  council_id uuid,
  departure_id uuid
)
language plpgsql security definer set search_path = public as $$
begin
  return query
    update personal_notes n
       set deleted_at = null
     where n.id = note_id
       and n.user_id = auth.uid()
    returning n.id, n.title, n.body, n.rating, n.is_draft, n.is_pinned,
              n.visibility, n.updated_at, n.season_id, n.season_contestant_id,
              n.episode_id, n.team_id, n.challenge_id, n.council_id,
              n.departure_id;

  if not found then
    raise exception 'note introuvable' using errcode = 'P0002';
  end if;
end $$;

revoke all on function restore_note(uuid) from public, anon;
grant execute on function restore_note(uuid) to authenticated;

comment on function restore_note(uuid) is
  'Retire `deleted_at` et rend la note. Passe par une fonction parce que la ligne à restaurer est invisible : un `update` direct ne trouverait rien, sans erreur.';
