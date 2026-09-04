# Pipeline d'import

Code : [`supabase/functions/_shared`](../supabase/functions/_shared).
Tests : `cd supabase/functions && deno test --allow-read _shared/`.

> **53 tests, tous exécutés et verts** le 05/09/2026, avec `deno lint`,
> `deno fmt --check` et `deno check`. C'est la seule partie du projet qui soit
> vérifiée à ce jour — le SQL, lui, n'a pas pu être appliqué (Docker).

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

**Le socle ne franchit pas Deno.** `@mister-guiiug/dev-wpa-config` suppose Node
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

| Fichier            | Rôle                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| `mediawiki.ts`     | Client API : révision, sections, HTML d'une section, empreinte stable     |
| `html-table.ts`    | HTML → grille développée (`rowspan`/`colspan`), sans dépendance           |
| `extract-votes.ts` | Grille → tours, voix, statuts, anomalies                                  |
| `diff.ts`          | Extrait + référentiel → différences classées, et ce qui est automatisable |

Trois pièges que les tests figent :

- un `User-Agent` anonyme est refusé **avant** tout appel réseau ;
- une erreur MediaWiki arrive en **HTTP 200** avec un objet `error` — sans
  contrôle, l'import conclurait « rien à changer » et le référentiel gèlerait ;
- une section se cherche par son **titre**, jamais par son rang : sur cette
  page, l'index 3 rend « Nouveautés » quand le numéro 3 désigne « Candidats ».

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

## Ce qui reste à écrire

1. l'extraction des **candidats** et du **déroulement** (épisodes, épreuves,
   dates), sur le même modèle que les votes ;
2. la **publication transactionnelle** et le `rollback_snapshot` ;
3. l'**orchestrateur** (`functions/import-wikipedia/index.ts`) qui enchaîne
   récupération, contrôle de révision, extraction, validation, diff et
   enregistrement — le tout en `service_role`, côté serveur uniquement.
