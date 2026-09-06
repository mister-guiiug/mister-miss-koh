-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ La photo reçue dit QUI elle montre.                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `photo_shares` porte déjà `season_contestant_id` depuis 0022 — le partage
-- SAIT de quel candidat il est le portrait. La lecture, elle, ne rendait que
-- les octets, le type et un libellé : le destinataire n'avait donc qu'une
-- issue, enregistrer le fichier dans ses téléchargements, puis le redéposer à
-- la main sur la bonne fiche. Deux gestes pour une information que le serveur
-- possédait déjà.
--
-- L'identifiant sort maintenant avec le reste. Il ne coûte rien de plus — la
-- ligne est lue de toute façon — et il ne révèle rien : c'est une clé du
-- RÉFÉRENTIEL PUBLIC, celui-là même que la page affiche à tout le monde. Ce
-- n'est pas `owner_id`, qui reste hors de portée.
--
-- `create or replace` ne sait pas changer un type de retour : on retire, on
-- recrée, ET ON REDONNE LES DROITS — un `drop` les emporte, et une fonction
-- muette pour `anon` serait un lien qui n'ouvre plus rien.

drop function if exists consume_photo_share(text);

create function consume_photo_share(share_token text)
returns table (
  photo_base64 text,
  photo_mime text,
  photo_label text,
  photo_contestant uuid
)
language sql security definer set search_path = public as $$
  delete from photo_shares
   where token = share_token
     and expires_at > now()
  returning encode(bytes, 'base64'), mime, label, season_contestant_id;
$$;

revoke all on function consume_photo_share(text) from public;
grant execute on function consume_photo_share(text) to anon, authenticated;

comment on function consume_photo_share(text) is
  'Rend la photo UNE fois et l''efface dans la même instruction, avec le candidat qu''elle montre — pour que le destinataire la pose sur la bonne fiche sans passer par ses fichiers. Appelée en POST : l''ouverture d''un lien ne consomme rien.';
