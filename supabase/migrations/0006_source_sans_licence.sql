-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — La source n'est plus décrite par une licence, et une     ║
-- ║ saison a le droit de ne pas savoir où elle en est.                        ║
-- ║                                                                          ║
-- ║ 1. RETRAIT DE LA LICENCE DU MODÈLE. `reference_sources` portait           ║
-- ║    `licence`, `licence_url` et `attribution_required`, et 0005 y écrivait ║
-- ║    « CC BY-SA 4.0 ». Le produit ne revendique plus de licence sur les      ║
-- ║    données : il conserve la TRAÇABILITÉ (quelle page, quelle révision,     ║
-- ║    quand) parce que c'est ce qui rend une valeur vérifiable, et rien de    ║
-- ║    plus. Ce qui est stocké et republié, ce sont des FAITS — un nom, un     ║
-- ║    âge, une date, un décompte de voix — jamais la prose de la page.        ║
-- ║                                                                          ║
-- ║    Les colonnes disparaissent au lieu d'être vidées : une colonne          ║
-- ║    `licence` restée là finirait remplie un jour, par habitude.            ║
-- ║                                                                          ║
-- ║ 2. `season_status` GAGNE « unknown ». Le catalogue des saisons se          ║
-- ║    découvre par l'API : au moment où une page entre dans le catalogue, on  ║
-- ║    connaît son titre, pas son état. Le défaut `announced` affirmerait      ║
-- ║    d'une saison de 2019 qu'elle est à venir. C'est la règle du projet —    ║
-- ║    zéro n'est pas inconnu — appliquée à une énumération.                   ║
-- ║                                                                          ║
-- ║    La valeur est ajoutée ICI et utilisée AILLEURS : PostgreSQL refuse      ║
-- ║    d'employer une étiquette d'énumération dans la transaction qui vient    ║
-- ║    de la créer.                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

alter table reference_sources
  drop column if exists licence,
  drop column if exists licence_url,
  drop column if exists attribution_required;

comment on table reference_sources is
  'Sources externes du référentiel. On en garde de quoi remonter à la page et à la révision : une donnée dont on ne peut plus dire d''où elle vient n''est plus vérifiable.';

alter type season_status add value if not exists 'unknown';
