# Pipeline d'import

Code : [`supabase/functions/_shared`](../supabase/functions/_shared).
Tests : `cd supabase/functions && deno test --allow-read _shared/`.

> **118 tests, tous exécutés et verts** le 05/09/2026, avec `deno lint`,
> `deno fmt --check` et `deno check`. La publication est prouvée autrement :
> 39 assertions pgTAP contre la base hébergée
> (`npm run test:publication:remote`).
>
> **La fonction Edge est déployée et a tourné pour de vrai** le 05/09/2026. Le
> câblage SQL, qui était jusque-là relu mais pas prouvé, l'est désormais : voir
> « Le premier import réel » plus bas.

## Les principes

**L'API, pas la page.** Le pipeline lit `https://fr.wikipedia.org/w/api.php` :
contenu structuré, métadonnées de révision, canal prévu pour un accès
programmatique. Aucun scraping depuis le navigateur, aucune imitation de
navigateur.

**La révision remplace l'empreinte.** MediaWiki expose un `revid` monotone :
deux lectures de la même révision sont identiques par construction. Comparer
des empreintes de HTML rendu produirait des différences fantômes — bandeaux de
maintenance, rendu des modèles, identifiants de section varient sans qu'un mot
du contenu ait bougé. L'empreinte, elle, porte sur le **modèle intermédiaire**,
et sert à conclure « nouvelle révision, aucun changement utile ».

**Le socle ne franchit pas Deno.** `@mister-guiiug/dev-pwa-config` suppose Node
et un bundler : il n'est pas importable ici. `supabase/functions` est donc
autonome, **sans aucune dépendance** hors bibliothèque standard — y compris
pour lire le HTML, parce que c'est le chemin le plus exposé du projet.

**Pas d'expression régulière sur le HTML.** Le motif naturel
(`/<td[^>]*>(.*?)<\/td>/gs`) est un « polynomial ReDoS » sur une entrée
construite pour lui nuire, et le contenu est modifiable par n'importe qui. Le
balayage est **linéaire** : un seul passage, `indexOf`, aucun retour arrière.

## Ce que la vraie page a appris

L'extraction a été écrite deux fois, parce que la première reposait sur une
hypothèse fausse.

**Les cellules d'un candidat ne sont pas toutes des votes.** Une fois sorti, sa
ligne porte son **statut** — `Maxime | Banni` en colonne 3 n'est pas un vote
pour quelqu'un nommé « Banni ». Prendre ces cellules pour des voix inventait
quinze votes vers des candidats inexistants ; les jeter aurait perdu
l'information la plus utile au recoupement : qui est encore en jeu.

Une cellule est donc classée en trois : **voix** (le texte est un candidat
connu), **statut** (un mot d'un vocabulaire court et explicite), **incomprise**
— et cette dernière devient une anomalie, jamais une donnée. C'est la règle du
besoin : ne pas importer une valeur dont l'interprétation est ambiguë.

**Une colonne n'est pas un épisode.** Le tableau donne une colonne par
**scrutin**. L'épisode 1 en occupe trois : le tour annulé d'une égalité, le
second tour, puis le départ du binôme de l'éliminé. C'est exactement le
découpage de `council_rounds`.

**Deux sortes de vide.** Une colonne vide en fin de tableau est un épisode à
venir — la saison est en cours. Une colonne vide au milieu est une anomalie.
Les confondre produirait soit une fausse alerte chaque semaine, soit un trou
silencieux.

## Résultat sur la page du 05/09/2026

```
candidats : 18
tours     : e1r1/annulled  e1r2/vote  e1r3/linked  e2r1/vote  e2r2/linked
voix      : 52
statuts   : 14
anomalies : aucune
```

Deux épisodes joués, chacun terminé par une élimination au vote **et** un
départ de binôme ; l'épisode 1 précédé d'un tour annulé pour égalité. Les deux
colonnes de l'épisode 3 sont vides : il n'a pas encore été diffusé.

Le lecteur de tableaux relève par ailleurs une **ligne irrégulière** dans la
source (un candidat a une cellule de moins que les autres) : elle est signalée,
et les cellules manquantes valent `null`, jamais la chaîne vide.

## Modules

| Fichier                 | Rôle                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `mediawiki.ts`          | Client API : révision, sections, HTML d'une section, empreinte stable              |
| `html-table.ts`         | HTML → grille développée (`rowspan`/`colspan`), sans dépendance                    |
| `extract-votes.ts`      | Grille → tours, voix, statuts, anomalies                                           |
| `extract-season.ts`     | Grilles → candidats et épisodes (dates, épreuves, conseils)                        |
| `parse-fr.ts`           | Dates, âges, jours, décomptes, listes de noms — `null` plutôt qu'une approximation |
| `cross-check.ts`        | Recoupement des trois tableaux entre eux                                           |
| `diff.ts`               | Extrait + référentiel → différences classées, et ce qui est automatisable          |
| `catalogue.ts`          | Découverte des pages de saison par la catégorie, et leur enregistrement            |
| `extract-advantages.ts` | Grille → colliers d'immunité, détenteurs datés, statut, voix annulées              |

Trois pièges que les tests figent :

- un `User-Agent` anonyme est refusé **avant** tout appel réseau ;
- une erreur MediaWiki arrive en **HTTP 200** avec un objet `error` — sans
  contrôle, l'import conclurait « rien à changer » et le référentiel gèlerait ;
- une section se cherche par son **titre**, jamais par son rang : sur cette
  page, l'index 3 rend « Nouveautés » quand le numéro 3 désigne « Candidats ».

## Candidats et déroulement : deux pièges de plus

**Les colonnes se cherchent par leur en-tête, jamais par leur rang.** Le
tableau du déroulement porte une colonne **décorative** — un `rowspan` de 37
sur une cellule vide, posé pour dessiner un trait entre les épreuves et le
conseil. Elle occupe une position réelle dans la grille : compter les colonnes
ferait lire « Éliminé » là où il n'y a rien.

Et le tableau a **deux lignes d'en-tête** : « Épreuves » chapeaute « Confort »
et « Immunité », « Conseil » chapeaute « Éliminé(s) », « Votes » et « Départ ».
Une colonne se désigne donc par sa paire (chapeau, sous-titre).

**Deux défauts du lecteur de tableaux, trouvés par la donnée réelle :**

- du **CSS fuyait dans le texte**. MediaWiki insère des blocs `<style>` dans
  les cellules (les légendes colorées de la colonne « Tribu ») : le texte de la
  cellule commençait par `.mw-parser-output .legende-bloc-ce…` ;
- des **valeurs multiples se collaient**. La colonne « Saisons précédentes »
  empile deux à trois mentions séparées par des `<br>` ; sans marque de
  frontière, on obtenait « Vainqueur de la saison 9Éliminée le… », une chaîne
  que personne ne peut redécouper.

Les frontières de bloc sont désormais explicites, et `cellLines` rend les
valeurs séparées là où `cellText` n'en attend qu'une.

**Ce que la lecture donne** : 18 candidats avec genre, âge et saisons passées ;
les épisodes avec leur date (« 25 août 2026 » → `2026-08-25`), les vainqueurs
d'épreuves, les éliminés (« Maxime et Joana » → deux noms) et les décomptes —
« 9-9 / 11-7 » rendant bien **deux** tours, « 12-2-1-1 » un seul à quatre
décomptes. Aucune anomalie.

Un détail qui compte : la colonne « Jury final » est vide pour tout le monde,
la saison étant en cours. La lire comme un « non » affirmerait que dix-huit
candidats sont hors jury — elle vaut donc `null`, « la source ne dit rien ».

## Le recoupement : là où les contradictions apparaissent

Les trois tableaux sont écrits **séparément**, par des contributeurs différents
et à des moments différents. Rien ne les force à s'accorder : un nom corrigé
dans l'un peut rester faux dans l'autre pendant des semaines. Un import qui
lirait chaque tableau isolément publierait sereinement deux versions
incompatibles de la même soirée.

`cross-check.ts` compare les listes de candidats, les éliminés épisode par
épisode, les décomptes (« 9-9 / 11-7 » du déroulement contre « 11/18 » du
détail) et le nombre de tours. Il ne tranche pas : il **nomme** la
contradiction et laisse le relecteur décider quelle source croire.

Sur la page du 05/09/2026, les trois tableaux **s'accordent** — c'est un test,
et il tombera le jour où ce ne sera plus vrai.

## Le diff, et le dégât qu'il empêche

Cinq classes, et **une seule est automatisable**. Un diff qui dirait
« 47 changements » obligerait à tout relire à la main, donc à ne rien relire.

| Classe        | Quand                                         | Automatisable     |
| ------------- | --------------------------------------------- | ----------------- |
| `unambiguous` | donnée neuve, sans conflit ni anomalie        | oui, sous plafond |
| `ambiguous`   | l'extraction a signalé quelque chose          | non               |
| `retroactive` | une donnée **déjà publiée** change            | jamais            |
| `conflicting` | deux propositions du même lot se contredisent | jamais            |
| `suspicious`  | le lot lui-même est anormal                   | jamais            |

**La suppression est le danger principal, et il n'est pas théorique.** Une
extraction qui échoue à moitié — tableau renommé, section déplacée, réponse
tronquée — ne lève pas : elle rend simplement **moins** d'enregistrements. Sans
garde, le diff en conclurait que les autres ont disparu de la source et
proposerait de les effacer. Le référentiel serait détruit par un import qui
s'est cru réussi.

D'où la **règle de couverture** : sous 80 % de reprise des clés publiées, tout
le lot bascule en `suspicious` — pas seulement les suppressions. Une insertion
saine dans un lot douteux ne doit pas passer pour saine, et le relecteur doit
voir d'abord que le problème est l'import, pas la donnée.

Deux autres refus délibérés :

- **un doublon ne se départage pas.** Deux valeurs pour la même clé, aucune
  n'est retenue — choisir « la dernière » reviendrait à trancher au hasard de
  l'ordre de lecture ;
- **la validation automatique est tout ou rien.** Au-delà du plafond, elle ne
  prend rien du tout : valider les cinq premiers changements et laisser le
  reste produirait un référentiel à moitié à jour, plus difficile à relire
  qu'un lot entier resté en attente.

## L'orchestrateur

`_shared/import-run.ts` enchaîne les étapes ; `import-wikipedia/index.ts`
authentifie et traduit en SQL. La séparation n'est pas cosmétique : **toutes
les décisions vivent dans le module testable**, et l'orchestrateur se prouve
avec un port de fantaisie, sans base. Ce qui reste dans la fonction Edge est du
câblage — il se relit, il ne se prouve pas par un test unitaire.

**Trois arrêts, avant tout diff :**

| Arrêt                    | Ce qu'il évite                                                      |
| ------------------------ | ------------------------------------------------------------------- |
| révision déjà traitée    | relire la page à chaque tour de planification                       |
| **structure incomprise** | qu'une extraction vide propose de **supprimer tout le référentiel** |
| empreinte inchangée      | encombrer la relecture d'une révision qui n'a rien changé d'utile   |

Le deuxième est le plus important. Le diff a bien sa règle de couverture, mais
un second verrou en amont coûte trois lignes et ferme la porte plus tôt : un
test vérifie qu'une section disparue produit **zéro différence**, pas même une
suppression proposée.

**Deux portes d'entrée, et aucune autre** : un utilisateur dont le rôle
`admin` ou `validator` est vérifié **en base** (une revendication placée dans
un jeton par un client ne prouve rien), ou la planification qui présente un
secret comparé à temps constant. `force` est réservé au déclenchement manuel.

**Absence de politique = aucune automatisation.** Une politique jamais écrite
n'autorise rien : le défaut est `false`, plafond `0`.

Un résultat inattendu, et gardé : **le premier import ne se valide jamais tout
seul**. Cinquante-deux voix d'un coup dépassent le plafond de changements par
entité, le lot bascule en suspect, et rien ne passe — même avec une politique
permissive. C'est souhaitable : la première ingestion d'une saison mérite un
regard, et c'est la seule qui soit aussi volumineuse. Un import de routine, lui,
se valide.

## Le catalogue : toutes les saisons, découvertes et non listées

`catalogue.ts` demande à l'API ce que l'encyclopédie **déclare** comme une
saison — les pages de `Catégorie:Saison de Koh-Lanta` — au lieu de porter une
liste de titres. Une liste écrite à la main vieillit en silence : une saison
ajoutée n'arrive jamais, une page renommée casse l'import sans dire pourquoi.

Le 05/09/2026, la catégorie compte **18 pages**. Ce n'est pas la liste
officielle des saisons diffusées, et l'application ne le prétend pas.

Ce que la découverte écrit : un `source_documents` et une `seasons` **en
attente**, d'état `unknown`. Pas un candidat, pas un vote. Une page découverte
donne un titre, pas une date de diffusion — `announced` affirmerait d'une
saison de 2019 qu'elle est à venir. Ce que la découverte **n'écrit pas** : elle
ne supprime jamais. Une page retirée de la catégorie reste suivie ; l'effacer
emporterait en cascade des données publiées, sur la foi d'une modification que
n'importe qui peut faire.

`0008_catalogue_saisons.sql` amorce ces 18 lignes, relevées par
`fetchSeasonCatalogue` le 05/09/2026, pour qu'une base neuve ne dépende pas
d'un appel réseau au premier démarrage. L'action `discover` de la fonction Edge
relit la catégorie et ajoute ce qui manque.

## Les saisons passées : ce que la première version affirmait à tort

L'extraction avait été écrite sur la seule page All Stars, et **trois de ses
règles n'étaient vraies que d'elle**. Passée sur les 18 pages, elle donnait
ceci :

| Relevé du 05/09/2026            | Avant    | Après         |
| ------------------------------- | -------- | ------------- |
| pages où les candidats sont lus | 3 sur 11 | **11 sur 11** |
| valeurs de vote incomprises     | 69       | **0**         |
| symboles de genre illisibles    | 20       | **0**         |

Les trois règles, et ce que la donnée réelle en a dit :

- **« Saisons précédentes » était exigée.** C'est une colonne des éditions de
  retour ; huit saisons sur onze ne l'ont pas. Elle est désormais facultative.
- **Le nom se déduisait de la colonne « Âge ».** Une colonne « Profession »
  s'intercale ailleurs : `colÂge - 1` lisait « Étudiante en STAPS » comme un
  nom, et le nom comme un symbole de genre — d'où les vingt genres illisibles.
  Le nom est maintenant la **dernière colonne du chapeau « Candidat(s) »**, seul
  ancrage vrai de toutes les éditions.
- **Le vocabulaire des statuts était trop court.** Cinq libellés manquaient, et
  cinq seulement : « Jury final », « Exilé », « Exilée », « Victoire »,
  « Défaite ». Ils ne sont pas devinés : ils ont été **relevés** sur les pages.

Le sous-titre du décompte s'écrit aussi « Vote » au singulier — accepté.

Ce qui **reste refusé, et doit l'être** : quatre structures que l'extraction ne
comprend pas (deux tableaux de déroulement transposés, où les épisodes sont en
colonnes ; un tableau de votes d'une autre forme). Elles produisent
`structure_inconnue` et **aucune donnée**. Quatre `episode_duplique` signalent
des épisodes qui apparaissent deux fois — un fait de la source, à relire, pas
une erreur de lecture.

## La publication : le seul endroit qui écrit le référentiel

`0007_publication.sql`. Une fonction, une transaction, et une photo.

`publish_run(run_id)` applique les différences **validées** dans l'ordre des
dépendances — candidats, épisodes, tours, voix, puis les départs qui en
découlent — rend la saison visible, marque l'exécution et fait avancer
`referential_versions`. Un conseil publié sans ses votes serait pire qu'un
conseil absent : PostgreSQL défait tout à la première erreur.

`revert_publication(publication_id, motif)` ne rejoue pas l'inverse : il
**repose** les lignes telles que `rollback_snapshot` les avait photographiées
avant modification, et supprime celles qui avaient été créées. Les différences
redeviennent `validated` — c'est leur application qui a été jugée mauvaise, pas
elles.

Trois refus délibérés :

- **les suppressions**, sauf sur les voix. Supprimer un candidat ou un épisode
  emporte ses enfants en cascade ; la photo ne les contient pas, et le retour
  arrière serait incomplet — donc mensonger. Le lot est refusé et les
  différences en cause nommées, à rejeter à la main ;
- **les tribus**. « Ikalu (jour 2 – 5) » porte un nom, deux bornes et une
  convention de tiret : découper cela relève de l'extraction, pas d'une
  fonction SQL ;
- **le rapprochement des personnes entre saisons.** La source ne donne que des
  prénoms. `contestants.slug` porte donc la saison : deux « Camille » de deux
  éditions ne fusionnent pas en une personne à qui l'on prêterait un parcours
  qu'elle n'a pas eu.

**20 assertions pgTAP, exécutées contre la base hébergée** le 05/09/2026 :
`npm run test:publication:remote`.

## Le premier import réel

Le 05/09/2026, contre la base hébergée, sur `Koh-Lanta All Stars`.

```
status  : diffed       revision : 239179934
records : 78           durée    : 1,58 s
```

| Entité              | Classe        | Proposées | Statut           |
| ------------------- | ------------- | --------: | ---------------- |
| `season_contestant` | `unambiguous` |        18 | `pending_review` |
| `council_vote`      | `suspicious`  |        52 | `pending_review` |
| `council_round`     | `unambiguous` |         5 | `pending_review` |
| `episode`           | `unambiguous` |         3 | `pending_review` |

**Aucune différence validée automatiquement, et c'est le comportement voulu.**
La politique du document interdit l'automatisation (`auto_validate_unambiguous`
faux, `max_auto_changes` à zéro), et les 52 voix dépassent de toute façon le
plafond par entité du diff : un lot de cette taille n'est pas une mise à jour,
c'est une première ingestion, et elle mérite un regard. Le référentiel publié
n'a pas bougé d'une ligne.

Une anomalie relevée, non bloquante : le tableau des votes a une ligne dont le
nombre de cellules diffère des autres. Elle est signalée, et ses cellules
manquantes valent `null`.

### La relecture, puis la publication

Les 78 propositions ont été relues avant d'être validées, et voici ce qui a été
vérifié — pas « ça compile », mais « ça correspond » :

- les **18 candidats** portent un nom, un genre, un âge et une tribu lisibles ;
- les **3 épisodes** ont leur date, et le troisième est marqué non diffusé ;
- les **52 voix** ne désignent que des candidats connus : aucun votant, aucune
  cible hors des dix-huit, aucun bulletin sans destinataire ;
- surtout, **la répartition des voix reproduit exactement les décomptes** que
  le tableau « Déroulement » annonce de son côté : 9 Laure / 9 Maxime puis
  11 Maxime / 7 Laure à l'épisode 1, et 12 Moussa / 2 Vincent / 1 Laure /
  1 Nicolas à l'épisode 2. Deux tableaux écrits séparément s'accordent au
  bulletin près : c'est le recoupement qui fait son travail.

`publish_run` a ensuite appliqué le lot : saison publiée, 18 participations,
3 épisodes, 2 conseils, 3 tours, 52 voix, 4 départs, 103 lignes photographiées
pour le retour arrière.

### Trois défauts que seule la publication pouvait révéler

Le résultat, relu **dans l'application**, montrait
`? éliminé·e (11/18 voix)` et un tour de trop. Trois défauts, corrigés par
`0009_publication_correctifs.sql` :

1. **le départ inséré ne portait pas son `round_id`.** La branche de mise à
   jour le posait, celle d'insertion l'oubliait — un défaut invisible tant
   qu'aucun départ n'avait été publié deux fois ;
2. **un tour `linked` était écrit dans `council_rounds`.** Ce n'est pas un
   scrutin : personne n'y vote. L'extraction en produit un parce que la
   **source** lui réserve une colonne, et l'application en reconstitue déjà un,
   synthétique, à partir du départ. La soirée en montrait donc deux ;
3. **une exécution `reverted` ne pouvait plus être republiée**, ce qui rendait
   le retour arrière inutilisable pour corriger une publication : il aurait
   fallu réimporter et tout relire.

Le correctif s'est appliqué comme il devait : **retour arrière puis
republication, dans une seule transaction**, pour que le site ne reste jamais
sans saison. `revert_publication` a reposé les 103 lignes, `publish_run` a
réappliqué le lot corrigé. La soirée affiche désormais ses trois événements
réels — tour annulé, « Maxime éliminé·e (11/18 voix) », « Joana part avec son
binôme ».

**Trois comportements vérifiés en production :**

- **la révision garde la porte.** Le second appel rend `unchanged` sans relire
  la page. Une planification fréquente est donc inoffensive ;
- **`discover` ne dérive pas.** Relancée sur la catégorie réelle : 18 trouvées,
  0 ajoutée, 0 doublon ;
- **les deux portes refusent.** Sans secret, ou avec un mauvais secret, la
  fonction répond `401` — même en présentant la clé anonyme.

## Les tribus et les épreuves

Relevé du 05/09/2026 sur les pages de saison, **avant** d'écrire une ligne :

| Ce qui a été compté                          | Résultat                                                   |
| -------------------------------------------- | ---------------------------------------------------------- |
| lignes de la colonne « Tribu »               | 639, **toutes** parenthésées                               |
| formes de l'intervalle                       | 3 : `jour N – N`, `jour N –`, `jour N`                     |
| lignes qui sont un **statut**, pas une tribu | 46 (`Banni`, `Bannie`, `Éliminé`, `Éliminée`)              |
| valeurs des colonnes d'épreuve               | 368 : 120 tribus, 210 candidats, **38 ni l'un ni l'autre** |

Trois conséquences, chacune tirée de ce tableau :

- **l'appartenance se date en JOURS.** La source écrit « Ikalu (jour 2 – 5) » et
  ne parle jamais en épisodes. `team_memberships` gagne donc `from_day` et
  `to_day` ; les colonnes en épisodes restent nulles, faute d'une
  correspondance que la page ne donne pas ;
- **« Bannie » n'est pas une tribu.** La source range l'état du candidat après
  sa sortie dans la même colonne. Sans cette distinction, la publication
  créerait une tribu « Bannie » et lui donnerait quatre membres ;
- **un vainqueur est une tribu OU un candidat**, et la source n'écrit qu'un
  nom. Le recoupement classe chaque valeur ; les 38 qui ne désignent rien de
  connu — un nom d'épreuve, une équipe formée pour l'occasion — deviennent des
  anomalies et ne sont **pas** rattachées au hasard.

Le format de l'épreuve se **déduit** du vainqueur : `team` si une tribu a
gagné, `individual` si un candidat. Le supposer individuel ferait passer une
victoire de tribu pour une victoire personnelle.

## Les colliers d'immunité

Quatrième tableau de la source. Relevé du 05/09/2026 :

| Ce qui a été compté                | Résultat                            |
| ---------------------------------- | ----------------------------------- |
| pages de saison qui ont la section | **9 sur 18**, dont All Stars        |
| colliers lus                       | 63, dont 52 avec un détenteur nommé |
| formes d'en-tête                   | 6, toutes en deux lignes            |
| statuts hors vocabulaire           | 3, sur une seule page               |

La section est **facultative** : son absence n'est pas une structure
incomprise, c'est une saison qui n'en parle pas. Les colonnes se cherchent
dans la **seconde** ligne d'en-tête, celle qui porte tous les libellés, avec
une liste de synonymes acceptés — « Localisation » ou « Localisation ou
circonstance », « Propriétaire d'origine » ou « Détenteur ».

Trois choix, tirés des mêmes lignes :

- **« Non découvert » n'est pas un nom.** Le tableau pré-dimensionne ses
  lignes : un collier repéré mais jamais trouvé en remplit une entièrement.
  Le lire comme un détenteur inventerait un aventurier, exactement comme
  « Banni » inventait une tribu ;
- **un collier passe de main en main**, et la source le dit — deux colonnes,
  « Propriétaire d'origine » et « Autre(s) propriétaire(s) ». Une colonne
  `holder_id` unique ne pouvait pas porter cela, ni « Dorian et Lola » qui
  trouvent ensemble. D'où `advantage_holders`, bâtie comme les appartenances
  de tribu : un intervalle en jours, pas un attribut ;
- **trois statuts sur soixante-trois sortent du vocabulaire** — « Utilisé
  (collier maudit) », « Finaliste ». Ils deviennent `unknown` et une anomalie,
  jamais « utilisé » par défaut.

**Ce que l'anti-spoiler peut, et ce qu'il ne peut pas.** Un collier **joué**
porte son épisode : c'est lui qui le protège. Un collier trouvé et pas encore
joué n'est daté qu'en **jours**, et rien ne traduit un jour en épisode. Il est
alors gardé jusqu'au **dernier épisode diffusé** : conservateur, mais jamais
faux.

## Les duos : autant que la source en dit, pas un de plus

**La source ne liste pas les duos.** Vérifié le 05/09/2026 : la section
« Nouveautés » énonce la règle en prose — « si l'un des deux est éliminé lors
d'un conseil, son partenaire quitte lui aussi immédiatement » — et ne nomme
aucun couple. Le tableau des candidats n'a pas de colonne de duo. Les neuf
duos de la saison ne sont écrits nulle part.

**Ce que la structure dit, elle, sans ambiguïté.** Le tableau des votes donne
une colonne par scrutin : à l'épisode 1, un tour de vote qui élimine Maxime,
puis une colonne de départ lié où part Joana. Cette seconde colonne n'existe
_que_ parce que la première a eu lieu. La sortie de Joana est donc causée par
celle de Maxime, et cela nomme leur duo.

Le lien est porté par l'**extraction** (`causedBy`, version 4 du modèle
intermédiaire), pas par une requête SQL. La différence : un relecteur le voit
dans la proposition qu'il valide. La première version le cherchait côté base ;
c'était juste et au mauvais endroit.

**La limite, écrite et assumée** : un duo n'est connu que lorsqu'un départ le
révèle. Deux sur neuf à ce jour. Les sept autres ne sont pas « manquants » —
ils ne sont écrits nulle part, et les deviner à partir des vainqueurs
d'épreuve, qui se présentent souvent par deux, serait une invention.
L'application ne montre donc un binôme qu'à partir de l'épisode qui l'a
révélé : le dire plus tôt divulgâcherait ce départ.

## Le lieu de tournage : une ligne d'infobox, et une page de plus

L'infobox de la page — le seul tableau de l'introduction, la section 0 —
porte une ligne « Lieu de tournage » : « Archipel des Perles (Panama) ». Deux
choses s'y lisent, et elles n'ont pas le même usage. Le **texte** est ce que
l'application affiche. Le **premier lien** de la cellule est la page la plus
précise que la source cite — l'archipel, pas le pays — et c'est elle que l'on
géolocalise : la page de la saison ne porte pas de coordonnées, mais celle du
lieu en déclare (`prop=coordinates`, extension GeoData). Rien n'est estimé
ici ; un lieu sans page, ou une page sans point, reste un lieu sans carte, et
l'anomalie le dit (`lieu_sans_page`, `lieu_sans_coordonnees`).

Ce qui n'est pas un lieu : un drapeau (`Fichier:…`), un lien rouge vers une
page inexistante, un lien externe. Ils précèdent parfois le vrai lien, et les
prendre géolocaliserait une image.

Côté base, quatre colonnes sur `seasons` (migration `0019`) et **une entité de
plus dans le modèle intermédiaire, `season`** — une différence par saison,
relue et publiée comme les autres. C'est la version 5 de l'extraction : une
page qui n'a pas bougé se relit quand même, et le lieu arrive par la voie
ordinaire. La saison n'est **photographiée qu'une fois** par publication,
qu'elle devienne visible ou qu'elle reçoive un lieu : deux photos de la même
ligne, reposées dans l'ordre inverse, laisseraient la saison publiée après un
retour arrière qui devait la cacher.

En chemin, un manque plus ancien : `source_documents.last_seen_revision` et
`last_seen_at` n'étaient jamais écrits — l'import gardait la révision sur
l'exécution, la publication ne la reportait pas, et l'écran « Source de
vérité » n'avait ni révision ni date à montrer. Depuis `0020`, `publish_run`
estampille le document avec la révision et la date de lecture de l'exécution
qu'il applique.

## « Déjà traitée » suppose le même traitement

L'arrêt « révision inchangée » a menti le jour où l'extraction s'est enrichie :
la page All Stars n'avait pas bougé, l'import répondait `unchanged`, et les
tribus n'atteignaient jamais le référentiel.

`import_runs` retient donc la **version de sortie** de l'extraction
(`EXTRACTOR_VERSION`), et le raccourci n'opère que si la révision **et** la
version coïncident. Ce n'est pas une version de code : un remaniement qui ne
change pas le modèle intermédiaire ne l'incrémente pas.

Une limite reste, et elle mérite d'être dite : la publication est
**incrémentale**, elle applique des différences. Quand c'est la _dérivation_
qui change — publier des épreuves à partir d'un payload d'épisode inchangé —
aucune différence ne la porte. Il faut alors **défaire et rejouer** le lot, ce
que `revert_publication` puis `publish_run` savent faire depuis que les
exécutions annulées sont republiables.

### Déclencher la fonction

La vérification de jeton de la plateforme reste **activée** : un appel porte
donc la clé anonyme en `Authorization`, **et** le secret de planification en
`x-import-secret`. La clé anonyme n'ouvre rien ici ; c'est le secret, ou un
rôle `admin`/`validator` vérifié en base, qui décide.

```bash
supabase functions deploy import-wikipedia --project-ref oqldfzrsandcguajyxbh --use-api
```

`--use-api` empaquette côté serveur : aucun Docker n'est nécessaire.
`IMPORT_CRON_SECRET` se pose par `supabase secrets set --env-file`, jamais sur
une ligne de commande, et vit en local dans `.env.supabase.local`, ignoré par
git.

## Ce qui reste à écrire

1. les **duos non révélés** : la source ne les liste nulle part, un duo n'est
   connu que lorsqu'un départ le nomme — ils arriveront un départ à la fois ;
2. les **résumés d'épisodes** : la source les rédige en prose, et le projet ne
   stocke que des faits tabulaires — ce serait un changement de nature, pas
   une extraction de plus ;
3. les **ordinaux** des saisons précédentes : « 33<sup>e</sup> jour » perd son
   « e » parce que tous les exposants sont retirés avec les appels de note.
