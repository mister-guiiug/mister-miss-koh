# Source, traçabilité et accès responsable

## La source

| Élément            | Valeur vérifiée le 05/09/2026                                        |
| ------------------ | -------------------------------------------------------------------- |
| Encyclopédie       | Wikipédia en français — <https://fr.wikipedia.org>                   |
| Point d'entrée     | API MediaWiki — <https://fr.wikipedia.org/w/api.php>                 |
| Catalogue          | `Catégorie:Saison de Koh-Lanta` — **18 pages** le 05/09/2026         |
| Saison en cours    | `Koh-Lanta All Stars`, `pageid` **17479409**, révision **239179934** |
| Conditions d'accès | <https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/fr>       |

## Ce que le projet stocke : des faits, pas un texte

Le pipeline lit des **tableaux** et n'en retient que des valeurs atomiques :
un prénom, un âge, une date de diffusion, un nom de tribu, « qui a voté pour
qui », un décompte. Il ne copie pas la prose de la page — ni les résumés
d'épisodes, ni les paragraphes de la section « Tournage », ni une phrase
rédigée quelle qu'elle soit. `raw_excerpt` conserve un fragment de la cellule
d'origine, pour qu'un relecteur puisse trancher une ambiguïté sans rouvrir la
page ; il n'est pas publié dans l'application.

Ce choix a une conséquence directe sur ce que le projet peut affirmer : il ne
revendique **aucune licence** sur les données référentielles. Le dépôt est sous
licence MIT, et cette licence couvre le **code**.

> **La limite, dite franchement.** Retirer une mention de licence ne modifie pas
> le régime du contenu d'origine. Ce qui protège ce projet, ce n'est pas
> l'absence d'étiquette, c'est de rester du côté des faits : des valeurs
> tabulaires, extraites une par une, jamais un texte recopié. Si un jour le
> pipeline importe des résumés d'épisodes rédigés, la question se reposera
> entièrement — et devra être retranchée avant, pas après.

## La traçabilité reste, entière

Elle ne découle plus d'une obligation de licence : elle découle de ce que le
produit prétend être. Une valeur affichée sans sa source n'est pas vérifiable,
et la source est **collaborative** — donc faillible, et corrigible
rétroactivement.

Chaque table du référentiel porte `source_document_id`, chaque import retient
la **révision** lue (`revid` MediaWiki) et sa date, et l'écran affiche pour
chaque référentiel : la page, sa révision, la date de lecture. `Provenance`
n'est pas un ornement de bas de page.

**Pas d'endossement.** Rien n'est présenté comme officiel. La page All Stars
portait le 05/09/2026 un bandeau `{{Section à sourcer|date=août 2026}}` sur sa
section « Nouveautés ».

## Ce qui n'est pas importé

- **Aucune image.** Les fichiers de Commons ont chacun leurs propres
  conditions, distinctes de celles du texte. Aucune importation automatique :
  chaque fichier devrait être examiné individuellement, ce qui n'est pas fait.
- **Aucun élément protégé de l'émission** : logo, totem, identité graphique,
  photographies, extraits, musique. L'identité visuelle du projet est originale
  — aventure, exploration, jungle, océan, feu — et ne cite aucun signe officiel.
- **Aucune marque tierce comme identifiant public** : `reserved_handles`
  refuse notamment `koh-lanta`, `kohlanta`, `tf1` et `officiel`.
- **Aucun texte rédigé** : ni résumé d'épisode, ni paragraphe encyclopédique.

## Accès à la source : ce qui est respecté

- **API officielle d'abord.** Le pipeline lit l'API MediaWiki, pas le HTML
  public. Elle fournit un contenu structuré, des métadonnées de révision, et
  c'est le canal prévu pour un accès programmatique.
- **Identification du client.** Chaque appel porte un `User-Agent` nommant le
  projet et un moyen de contact, comme la politique d'accès de Wikimedia le
  demande. Un `User-Agent` anonyme est refusé **avant** tout appel réseau.
- **Fréquence raisonnable.** Le rafraîchissement est manuel ou planifié à basse
  fréquence ; une révision déjà traitée termine l'exécution en `unchanged` sans
  relire la page. Le parcours du catalogue est séquentiel, avec une pause entre
  deux pages.
- **Aucun contournement.** Pas de scraping depuis le navigateur, pas de
  contournement de limite, pas de parallélisme agressif.

## Ce que je ne sais pas

- Si les fichiers image des pages sont réutilisables dans ce contexte : **je ne
  sais pas**, aucun n'a été examiné, et aucun n'est importé.
- Si les informations des pages sont exactes : **je ne sais pas**, et
  l'application ne le prétendra pas.
- Si les 18 pages de la catégorie couvrent toutes les saisons diffusées : **je
  ne sais pas**. Le catalogue reflète ce que l'encyclopédie déclare comme
  « saison de Koh-Lanta », pas une liste officielle. Voir
  [pipeline-wikipedia.md](./pipeline-wikipedia.md).
