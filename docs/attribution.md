# Sources, licences et attribution

## La source

| Élément            | Valeur vérifiée le 05/09/2026                                               |
| ------------------ | --------------------------------------------------------------------------- |
| Page               | `Koh-Lanta All Stars` — <https://fr.wikipedia.org/wiki/Koh-Lanta_All_Stars> |
| Identifiant stable | `pageid` **17479409**                                                       |
| Révision lue       | **239179934**, du 03/09/2026 à 01:34 UTC                                    |
| Licence du contenu | **Creative Commons Attribution — Partage dans les mêmes conditions 4.0**    |
| Texte de licence   | <https://creativecommons.org/licenses/by-sa/4.0/deed.fr>                    |

La licence n'a pas été supposée : elle est lue à la source, par
`action=query&meta=siteinfo&siprop=rightsinfo`.

## Ce que CC BY-SA 4.0 impose

**Attribution.** Toute donnée référentielle affichée doit pouvoir indiquer sa
provenance : la page, sa révision, la date de récupération. Le schéma le permet
ligne par ligne (`source_document_id` sur chaque table du référentiel).

**Partage dans les mêmes conditions.** Une base dérivée d'un contenu CC BY-SA
se partage sous la même licence. Conséquence concrète pour ce projet :

- le **code** est sous licence MIT ;
- les **données référentielles** dérivées de Wikipédia sont sous **CC BY-SA 4.0**.

Les deux licences coexistent parce qu'elles portent sur deux choses
différentes. Le `LICENSE` du dépôt couvre le code ; ce document couvre les
données, et l'application doit l'afficher.

**Pas d'endossement.** Rien ne doit être présenté comme officiel. Wikipédia est
une source collaborative : la page portait le 05/09/2026 un bandeau
`{{Section à sourcer|date=août 2026}}` sur sa section « Nouveautés ».

## Ce qui n'est pas importé

- **Aucune image de Wikipédia.** Les fichiers de Commons ont chacun leur propre
  licence et leurs propres obligations d'attribution, distinctes de celle du
  texte. Aucune importation automatique : chaque fichier devrait être vérifié
  individuellement, ce qui n'est pas fait à ce jour.
- **Aucun élément protégé de l'émission** : logo, totem, identité graphique,
  photographies, extraits, musique. L'identité visuelle du projet est originale
  — aventure, exploration, jungle, océan, feu — et ne cite aucun signe officiel.
- **Aucune marque tierce comme identifiant public** : `reserved_handles`
  refuse notamment `koh-lanta`, `kohlanta`, `tf1` et `officiel`.

## Accès à la source : ce qui est respecté

- **API officielle d'abord.** Le pipeline lit l'API MediaWiki
  (`https://fr.wikipedia.org/w/api.php`), pas le HTML public. Elle fournit un
  contenu structuré, des métadonnées de révision, et c'est le canal prévu pour
  un accès programmatique.
- **Identification du client.** Chaque appel porte un en-tête `User-Agent`
  nommant le projet et un moyen de contact, comme la politique d'accès de
  Wikimedia le demande.
- **Fréquence raisonnable.** Le rafraîchissement est déclenché manuellement ou
  planifié à basse fréquence ; une révision déjà traitée termine l'exécution en
  `unchanged` sans relire la page entière.
- **Aucun contournement.** Pas de scraping depuis le navigateur, pas de
  contournement de limite, pas de parallélisme agressif.

## Ce que je ne sais pas

- Si les fichiers image de la page sont réutilisables dans ce contexte : **je
  ne sais pas**, aucun n'a été vérifié individuellement, et aucun n'est importé.
- Si les informations de la page sont exactes : **je ne sais pas**, et
  l'application ne le prétendra pas.
