-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Deux colonnes que rien n'écrit, et que rien n'écrira    ║
-- ║                                                                          ║
-- ║ `advantages` a été dessinée en 0001 avant qu'on ait lu le tableau des     ║
-- ║ colliers. Elle prévoyait `found_episode_id` et `played_round_id` ; la     ║
-- ║ source, elle, date la découverte en JOURS et l'usage par un ÉPISODE.      ║
-- ║ 0013 a donc ajouté `found_day` et `played_episode_id`, qui sont remplies. ║
-- ║                                                                          ║
-- ║ Les deux anciennes restent vides. Les garder, c'est laisser deux endroits ║
-- ║ où lire « quand ce collier a-t-il été joué » — et le jour où quelqu'un    ║
-- ║ remplit celle que l'application ne lit pas, la donnée existe sans         ║
-- ║ s'afficher. C'est exactement la divergence que ce schéma refuse ailleurs. ║
-- ║                                                                          ║
-- ║ Elles n'ont jamais porté une seule valeur : rien n'est perdu.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table advantages
  drop column if exists found_episode_id,
  drop column if exists played_round_id;

comment on column advantages.found_day is
  'Jour de jeu de la découverte, tel que la source l''écrit. Elle ne donne pas d''épisode pour ce moment-là.';
comment on column advantages.played_episode_id is
  'Épisode où l''avantage a été joué. La source donne un NUMÉRO d''épisode pour l''usage, là où elle donne un jour pour la découverte.';
