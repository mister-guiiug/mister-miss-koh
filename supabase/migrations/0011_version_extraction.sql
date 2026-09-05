-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — « Révision déjà traitée » suppose le MÊME traitement     ║
-- ║                                                                          ║
-- ║ L'arrêt « inchangé » compare la révision de la page à celle du dernier     ║
-- ║ import abouti. Il rend une planification fréquente inoffensive, et c'est   ║
-- ║ sa raison d'être. Mais il MENT dès que l'extraction change : le 05/09/2026,║
-- ║ l'ajout des tribus et des épreuves n'atteignait pas le référentiel, parce  ║
-- ║ que la page All Stars n'avait pas bougé et que l'import répondait          ║
-- ║ `unchanged` en boucle. La correction restait à jamais hors de la base.    ║
-- ║                                                                          ║
-- ║ L'exécution retient donc la VERSION DE SORTIE de l'extraction. Le          ║
-- ║ raccourci n'opère que si la révision ET la version coïncident.             ║
-- ║                                                                          ║
-- ║ La colonne est NULLABLE, et c'est voulu : les exécutions d'avant ne        ║
-- ║ savaient pas quelle version les avait produites. `null` ne coïncide avec   ║
-- ║ rien, donc elles seront rejouées — ce qui est exactement ce qu'on veut.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table import_runs
  add column if not exists extractor_version text;

comment on column import_runs.extractor_version is
  'Version de SORTIE de l''extraction, pas du code. Un remaniement qui ne change pas le modèle intermédiaire ne l''incrémente pas.';
