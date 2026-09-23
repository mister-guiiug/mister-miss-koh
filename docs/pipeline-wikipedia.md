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

| Fichier                 | Rôle                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `mediawiki.ts`          | Client API : révision, sections, HTML d'une section, empreinte stable                 |
| `html-table.ts`         | HTML → grille développée (`rowspan`/`colspan`), couleur des légendes, sans dépendance |
| `extract-votes.ts`      | Grille → tours, voix, statuts, anomalies                                              |
| `extract-season.ts`     | Grilles → candidats et épisodes (dates, épreuves, conseils)                           |
| `parse-fr.ts`           | Dates, âges, jours, décomptes, listes de noms — `null` plutôt qu'une approximation    |
| `cross-check.ts`        | Recoupement des trois tableaux entre eux                                              |
| `diff.ts`               | Extrait + référentiel → différences classées, et ce qui est automatisable             |
| `catalogue.ts`          | Découverte des pages de saison par la catégorie, et leur enregistrement               |
| `extract-advantages.ts` | Grille → colliers d'immunité, détenteurs datés, statut, voix annulées                 |

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

**Trois défauts du lecteur de tableaux, trouvés par la donnée réelle :**

- du **CSS fuyait dans le texte**. MediaWiki insère des blocs `<style>` dans
  les cellules (les légendes colorées de la colonne « Tribu ») : le texte de la
  cellule commençait par `.mw-parser-output .legende-bloc-ce…` ;
- des **valeurs multiples se collaient**. La colonne « Saisons précédentes »
  empile deux à trois mentions séparées par des `<br>` ; sans marque de
  frontière, on obtenait « Vainqueur de la saison 9Éliminée le… », une chaîne
  que personne ne peut redécouper ;
- **l'ordinal partait avec les appels de note** (vu en production le
  06/09/2026, dans `contestant_previous_seasons`). La page écrit
  `33<sup>e</sup> jour`, et TOUS les `<sup>` sortaient des cellules pour
  écarter les `[n° 2]` : le référentiel publiait « Éliminé le 33 jour de la
  saison 27 ». Seuls les appels de note sortent désormais — classe
  `reference`, ou texte entre crochets — et l'exposant d'un ordinal reste
  collé à son nombre. C'est une version de sortie de plus (`6`).

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

## Les tribus en couleur, et ce que la page du 23/09/2026 a appris

Au jour 9 d'All Stars, la tribu unique se scinde : **Taboga**, la tribu jaune,
et **Sebako**, la rouge. La page le dit deux fois — une pastille devant chaque
séjour de la colonne « Tribu » (`{{Légende|#fee347|Taboga (jour 9 – )}}`), et
une légende sous le tableau. Le site, lui, n'affichait qu'une « Tribu unique » :
la base en était restée à la révision du 11/09, et même relue, elle n'aurait
pas su dire qui était jaune ni qui était rouge.

Relevé du 23/09/2026 sur les dix-huit pages, **avant** d'écrire une ligne :

| Ce qui a été compté                                      | Résultat                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| lignes de légende dans les colonnes « Tribu »            | 657, dont 21 sans pastille (« La Légende »)                                 |
| notations de couleur                                     | `#rrggbb` (les deux casses) et `white`, `black`, `gray`, `grey`, `darkgray` |
| tribus dont la couleur varie dans leur saison            | aucune, une fois la casse ramenée à une seule                               |
| colonnes « / » à voix non barrées                        | 14, sur neuf pages — toutes le 1er tour d'une égalité                       |
| colonnes à zéro voix qu'aucun vote de la soirée ne cause | 84, sur quinze pages                                                        |
| personnes éliminées à deux épisodes différents           | sur quatorze pages sur seize                                                |

Quatre conséquences, une par ligne du tableau ou presque :

- **la couleur est un fait de la tribu, pas du séjour.** L'extraction 12 la lit
  sur la pastille (`legendLines`), la réduit à `#rrggbb` — rien d'autre ne
  passe, parce qu'elle finira dans un attribut `style` — et la propose une fois
  par tribu : une entité `team` de plus, une différence par tribu à relire, et
  les séjours des candidats gardent exactement leur forme. Deux couleurs pour
  une même tribu, aucune n'est retenue, et l'anomalie le dit ;
- **une égalité ne se lit pas toujours à ses voix barrées.** Quatorze colonnes
  écrivent « / » pour décompte et font courir le nom de l'éliminé sur deux
  colonnes, sans rien barrer : c'est le premier tour d'une égalité, et il
  devient `annulled`. Lu comme un scrutin, il publiait deux tours contre la
  même personne, dont un « ? éliminé·e » ;
- **zéro voix sans cause n'est pas un départ de binôme.** Un abandon, une
  évacuation, et à l'épisode 4 d'All Stars la sortie de quatre bannis battus à
  l'arène. L'extraction dit déjà « rien ne le cause » (`causedBy` vide) ; c'est
  la publication qui en faisait un `linked_pair`, et l'application écrivait
  « part avec son binôme » sous des abandons et des évacuations, dans quinze
  saisons. Elle publie désormais `other` ;
- **on revient, et l'on ressort.** Maxime, éliminé au premier conseil, rentre
  dans Sebako au jour 9 ; Charlotte sort avec son binôme à l'épisode 3,
  revient dans Taboga, puis est éliminée à l'épisode 5. Avec une sortie par
  candidat, la seconde écrasait la première : depuis `0028`, une sortie se
  rattache à sa soirée. Le retour, lui, n'a pas de ligne — il se lit dans les
  séjours, qui recommencent après la sortie.

**Et le jour du conseil devient publié.** La colonne « Départ » du déroulement
date chaque conseil (« Jour 11 ») ; l'extraction la lisait depuis la version 2
sans que rien ne la publie. `episodes.day_end` la reçoit. C'est la pièce qui
manquait pour montrer un séjour au bon moment : « Taboga (jour 9 – ) » se
montre à partir de l'épisode dont le conseil tombe le jour 9 ou après — le 4,
tenu le jour 11. Rien n'est converti en base : l'application déduit, et quand
un jour de conseil manque, elle attend plutôt que de deviner.

**Et chaque sortie garde sa colonne (0029, 24/09/2026).** L'extraction
numérote les colonnes d'une soirée dans l'ordre de la source, sorties sans
scrutin comprises (`roundNumber`). La publication ne gardait ce numéro qu'avec
un tour : une sortie sans scrutin le perdait, et l'application la rangeait
après le conseil — l'arène d'All Stars passait derrière l'élimination de Lola.
Relevé du 24/09/2026 : 102 colonnes sans scrutin dans quinze saisons, 65 avant
un tour de leur soirée, et chaque départ de binôme après l'élimination qui le
cause. `departures.round_number` garde désormais la colonne, et
`recaler_rangs_des_sorties` l'a rendue aux sorties déjà publiées, relue dans la
dernière exécution publiée de chaque page.

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

## Les saisons anciennes : trois hypothèses tacites, onze pages perdues

La planification a fait ce qu'aucune exécution manuelle n'avait fait — appeler
les **dix-huit** pages. Onze ont échoué d'un coup, pour des défauts qui
dormaient depuis le premier jour : l'extracteur n'avait jamais lu que les
saisons récentes, et avait pris leurs habitudes pour la structure de
l'encyclopédie.

**1. Un rôle, un seul titre.** La matrice des votes s'intitule « Détails des
votes » sur dix saisons, « Détail des votes » sur une, et « Détail des
éliminations » sur quatre anciennes — pour un tableau rigoureusement
identique. `findSection` accepte désormais plusieurs titres par rôle, dans un
ordre de préférence.

**2. Le bon tableau est le premier de sa section.** Faux deux fois : « Les
4 Terres » et « La Revanche des 4 Terres » ouvrent leur « Déroulement » par un
récapitulatif des épreuves — mêmes colonnes « Épisode » et « Diffusion »,
aucun conseil — et le vrai tableau vient en second. Le tableau se choisit
maintenant par sa FORME (`looksLikeProgress`, `looksLikeVotes`,
`looksLikeContestants`), pas par son rang. Le tableau des candidats garde un
repli sur le premier : s'il est là mais méconnaissable, c'est une structure qui
a changé, et le message doit le dire.

**3. L'en-tête s'écrit d'une seule façon.** Six orthographes pour le même
libellé : « ► Épisode » et « ►Épisode », « ► Éliminé », « ► Éliminés »,
« ► Éliminé ou abandon » et « ►Éliminéou abandon » — cette dernière née d'un
`<br>` aplati. Le marqueur et son espace sont maintenant retirés avant
comparaison, et le préfixe suffit.

### Les trois tableaux ne sont plus exigés ensemble

Seule la liste des candidats l'est. « Malaisie » et « La Légende » n'ont aucun
tableau épisode par épisode, « Le Retour des héros » n'a que ses candidats :
Wikipédia ne les a jamais écrits. Exiger les trois, c'était jeter ce que la
page DONNE pour ce qu'elle n'a pas.

⚠️ **Mais une absence n'est pas l'autre**, et c'est là qu'était le danger. Si la
page de « Fidji » perdait demain sa matrice des votes, la même extraction
partielle proposerait d'effacer tous les conseils publiés. Ce qui sépare les
deux cas n'est pas sur la page : c'est ce que le référentiel tient déjà. Rien
de publié pour ce que la section alimente, l'absence est de naissance et
l'import continue en le disant (`section_absente`) ; quelque chose de publié,
la page a régressé et l'import s'arrête sans rien proposer.

### Le relevé du 11/09/2026, sur les dix-huit pages réelles

**Seize produisent un modèle**, contre sept avant. Les deux restantes —
« Pacifique » et « Les Aventuriers de Koh-Lanta », les saisons 5 et 1 — ne
portent que trois tableaux : l'infobox, les audiences et le pied de
navigation. Aucune liste de candidats, aucun déroulement, aucun vote. Il n'y a
rien à en extraire, et l'import le dit en clair plutôt que de laisser croire à
un défaut d'outil.

## Ce qui reste à écrire

1. les **duos non révélés** : la source ne les liste nulle part, un duo n'est
   connu que lorsqu'un départ le nomme — ils arriveront un départ à la fois ;
2. les **résumés d'épisodes** : la source les rédige en prose, et le projet ne
   stocke que des faits tabulaires — ce serait un changement de nature, pas
   une extraction de plus ;
3. l'**île des bannis** : « Banni (jour 3 – 9) » est lu (`teamStatuses`) mais
   pas publié. L'application sait qu'un candidat est sorti puis revenu ; elle
   ne sait pas dire, entre les deux, qu'il attendait sur l'île plutôt qu'il
   était rentré chez lui. Le publier demande une table — ce n'est pas une
   tribu, et la colonne le range pourtant avec elles.

## La planification

**Elle n'existait pas.** La fonction a toujours eu sa porte « planification »
— un secret dans `x-import-secret`, comparé à temps constant — mais personne ne
la franchissait : aucun `cron`, aucun workflow, aucune tâche en base. Relevé le
11/09/2026 : la base en était à la révision **239179934**, lue le 06/09, quand
Wikipédia en était à **239358298**. Cinq jours de retard sur une saison en
cours de diffusion, sans le moindre signal — le site affichait simplement des
données anciennes.

C'est le genre de panne qu'une CI verte ne voit pas : tout le code marchait.

**Deux tâches `pg_cron`** (migration `0026`) :

| tâche                  | quand                    | quoi                     |
| ---------------------- | ------------------------ | ------------------------ |
| `koh-import-quotidien` | `17 4 * * *` UTC         | les 18 pages de saison   |
| `koh-import-diffusion` | `*/30 14-22 * * 2,3` UTC | la seule saison `airing` |

**L'heure de la fenêtre serrée est celle de PARIS**, pas celle du serveur.
`pg_cron` lit ses expressions dans le fuseau de la base — UTC — et la France
change d'heure deux fois par an : une fenêtre écrite en UTC déborderait d'une
heure la moitié de l'année. En été, 22 h UTC est déjà minuit passé à Paris. La
planification ouvre donc large, sur l'union des deux saisons, et
`importer_saison_en_diffusion()` tranche sur l'heure locale. La bordure est
exacte toute l'année, au prix d'un réveil par tour qui ne fait rien.

**Trois secrets dans le Vault, posés par la CI** — ils n'entrent jamais dans
git, et personne n'a à les taper : `supabase-migrate.yml` les écrit après chaque
`db push`, par la fonction `definir_secret_planification` (migration `0027`),
réservée à `service_role`.

| secret                   | d'où vient la valeur                    |
| ------------------------ | --------------------------------------- |
| `koh_functions_url`      | déduite de `SUPABASE_PROJECT_ID`        |
| `koh_anon_key`           | demandée au CLI (`projects api-keys`)   |
| `koh_import_cron_secret` | le secret de dépôt `IMPORT_CRON_SECRET` |

Les trois, et pas seulement le dernier : la plateforme Supabase garde l'entrée
de toute fonction Edge derrière un JWT valide. Sans `Authorization`, elle rend
`UNAUTHORIZED_NO_AUTH_HEADER` et la fonction n'est même pas atteinte — la clé
anon suffit à franchir cette porte-là, elle est publique et déjà dans le bundle
du site. C'est ensuite que `x-import-secret` ouvre celle de la planification.

**Le même passage pose `IMPORT_CRON_SECRET` sur la fonction Edge.** GitHub en
est donc la source unique : la fonction et le Vault en reçoivent une copie au
même moment, et une rotation se fait en changeant une valeur puis en relançant
le workflow. Les clés d'API, elles, ne sont pas rangées en secret de dépôt —
elles se demandent au CLI, si bien qu'une clé tournée côté Supabase est reprise
toute seule au passage suivant.

Un secret manquant ne fait pas un 401 toutes les demi-heures que personne ne
lit : `declencher_import` s'arrête et écrit un `warning` nommant lequel manque.

**Vérification** : `supabase/tests/planification.test.sql`, 19 assertions —
les deux tâches et leurs expressions, et surtout la bordure de la fenêtre
éprouvée sur des instants d'été ET d'hiver, dont le cas qui justifie tout le
mécanisme : 22 h UTC un mardi de septembre, qui est minuit à Paris et doit
rester dehors.
