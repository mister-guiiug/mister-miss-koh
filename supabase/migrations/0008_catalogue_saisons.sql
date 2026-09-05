-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ mister-miss-koh — Amorçage du catalogue des saisons                       ║
-- ║                                                                          ║
-- ║ Ces 18 lignes ne sont pas une liste d'auteur : ce sont les pages que    ║
-- ║ l'API MediaWiki déclarait dans « Catégorie:Saison de Koh-Lanta » le        ║
-- ║ 05/09/2026, relevées par `fetchSeasonCatalogue` et écrites telles quelles. ║
-- ║ C'est un AMORÇAGE, pas une source de vérité : l'action `discover` de la    ║
-- ║ fonction Edge relit la catégorie et ajoute ce qui manque. Une base neuve   ║
-- ║ part d'ici pour ne pas dépendre d'un appel réseau au premier démarrage.    ║
-- ║                                                                          ║
-- ║ RIEN N'EST PUBLIÉ. Chaque saison naît en `unknown` / `pending_review` :    ║
-- ║ la découverte apprend qu'une page existe, pas ce qu'elle contient. La clé  ║
-- ║ `anon` ne voit donc aucune de ces lignes tant qu'un import n'a pas été     ║
-- ║ relu et publié.                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create temporary table catalogue_amorcage (
  external_id text, title text, url text, slug text
) on commit drop;

insert into catalogue_amorcage (external_id, title, url, slug) values
  ('10962643', 'Koh-Lanta : Fidji', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Fidji', 'koh-lanta-fidji'),
  ('12535816', 'Koh-Lanta : L''Île des héros', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_L''%C3%8Ele_des_h%C3%A9ros', 'koh-lanta-l-ile-des-heros'),
  ('12167380', 'Koh-Lanta : La Guerre des chefs', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_La_Guerre_des_chefs', 'koh-lanta-la-guerre-des-chefs'),
  ('14064715', 'Koh-Lanta : La Légende', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_La_L%C3%A9gende', 'koh-lanta-la-legende'),
  ('16699292', 'Koh-Lanta : La Revanche des 4 Terres', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_La_Revanche_des_4_Terres', 'koh-lanta-la-revanche-des-4-terres'),
  ('5927038', 'Koh-Lanta : La Revanche des héros', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_La_Revanche_des_h%C3%A9ros', 'koh-lanta-la-revanche-des-heros'),
  ('16405365', 'Koh-Lanta : La Tribu maudite', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_La_Tribu_maudite', 'koh-lanta-la-tribu-maudite'),
  ('11169108', 'Koh-Lanta : Le Combat des héros', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Le_Combat_des_h%C3%A9ros', 'koh-lanta-le-combat-des-heros'),
  ('15345695', 'Koh-Lanta : Le Feu sacré', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Le_Feu_sacr%C3%A9', 'koh-lanta-le-feu-sacre'),
  ('3353851', 'Koh-Lanta : Le Retour des héros', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Le_Retour_des_h%C3%A9ros', 'koh-lanta-le-retour-des-heros'),
  ('13408964', 'Koh-Lanta : Les 4 Terres', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Les_4_Terres', 'koh-lanta-les-4-terres'),
  ('13747918', 'Koh-Lanta : Les Armes secrètes', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Les_Armes_secr%C3%A8tes', 'koh-lanta-les-armes-secretes'),
  ('16104153', 'Koh-Lanta : Les Chasseurs d''immunité', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Les_Chasseurs_d''immunit%C3%A9', 'koh-lanta-les-chasseurs-d-immunite'),
  ('17283394', 'Koh-Lanta : Les Reliques du destin', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Les_Reliques_du_destin', 'koh-lanta-les-reliques-du-destin'),
  ('6044029', 'Koh-Lanta : Malaisie', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Malaisie', 'koh-lanta-malaisie'),
  ('3296533', 'Koh-Lanta : Pacifique', 'https://fr.wikipedia.org/wiki/Koh-Lanta_%3A_Pacifique', 'koh-lanta-pacifique'),
  ('17479409', 'Koh-Lanta All Stars', 'https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars', 'koh-lanta-all-stars'),
  ('3300210', 'Les Aventuriers de Koh-Lanta', 'https://fr.wikipedia.org/wiki/Les_Aventuriers_de_Koh-Lanta', 'les-aventuriers-de-koh-lanta');

-- ── Les documents suivis ──────────────────────────────────────────────────
-- Idempotent par `external_id` : le `pageid` survit à un renommage de page,
-- l'URL non. « Koh-Lanta All Stars » est déjà là depuis 0005 et n'est pas
-- redoublé.
insert into source_documents (source_id, external_id, title, url)
select 'wikipedia_fr', c.external_id, c.title, c.url
from catalogue_amorcage c
where not exists (
  select 1 from source_documents d
  where d.source_id = 'wikipedia_fr' and d.external_id = c.external_id
);

-- ── Les saisons, EN ATTENTE et d'état INCONNU ─────────────────────────────
-- Une page découverte donne un titre, pas une date de diffusion : `announced`
-- affirmerait d'une saison de 2019 qu'elle est à venir.
insert into seasons (slug, name, status, source_document_id, validation_status)
select c.slug, c.title, 'unknown', d.id, 'pending_review'
from catalogue_amorcage c
join source_documents d
  on d.source_id = 'wikipedia_fr' and d.external_id = c.external_id
where not exists (select 1 from seasons s where s.source_document_id = d.id)
  and not exists (select 1 from seasons s where s.slug = c.slug);

-- ── La politique d'import : rien d'automatique, pour chaque document ──────
insert into import_policies
  (source_document_id, entity, auto_validate_unambiguous, max_auto_changes,
   auto_validate_retroactive)
select d.id, null, false, 0, false
from source_documents d
where d.source_id = 'wikipedia_fr'
  and not exists (
    select 1 from import_policies p
    where p.source_document_id = d.id and p.entity is null
  );
