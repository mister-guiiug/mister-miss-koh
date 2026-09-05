# Pipeline d'import

Code : [`supabase/functions/_shared`](../supabase/functions/_shared).
Tests : `cd supabase/functions && deno test --allow-read _shared/`.

> **90 tests, tous exécutés et verts** le 05/09/2026, avec `deno lint`,
> `deno fmt --check` et `deno check`. Une réserve nette : le **câblage SQL** de
> la fonction Edge (`import-wikipedia/index.ts`) n'a **jamais tourné contre une
> base** — Docker ne démarre pas sur le poste. Il compile et il se relit ; il
> n'est pas prouvé.

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

| Fichier             | Rôle                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `mediawiki.ts`      | Client API : révision, sections, HTML d'une section, empreinte stable              |
| `html-table.ts`     | HTML → grille développée (`rowspan`/`colspan`), sans dépendance                    |
| `extract-votes.ts`  | Grille → tours, voix, statuts, anomalies                                           |
| `extract-season.ts` | Grilles → candidats et épisodes (dates, épreuves, conseils)                        |
| `parse-fr.ts`       | Dates, âges, jours, décomptes, listes de noms — `null` plutôt qu'une approximation |
| `cross-check.ts`    | Recoupement des trois tableaux entre eux                                           |
| `diff.ts`           | Extrait + référentiel → différences classées, et ce qui est automatisable          |

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

## Ce qui reste à écrire

1. la **publication transactionnelle** et le `rollback_snapshot` — la seule
   pièce du pipeline qui vive entièrement dans la base ;
2. les **colliers d'immunité**, quatrième tableau de la section
   « Déroulement », non encore lu ;
3. le **déploiement** de la fonction (`supabase functions deploy
import-wikipedia`, secret `IMPORT_CRON_SECRET`) et un premier import réel :
   les migrations sont appliquées sur la base hébergée depuis le 05/09/2026,
   la fonction ne l'est pas, et aucun `import_run` n'existe encore.
