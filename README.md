# mister-miss-koh — « Aventure Tracker »

PWA de suivi d'une saison d'aventure : candidats, épisodes, épreuves, conseils,
votes et départs, avec notes personnelles, favoris et partage révocable.

> **État : conception.** Le dépôt contient à ce jour l'audit du socle, le
> modèle de données et les migrations Supabase. **L'application n'est pas encore
> échafaudée**, et les migrations **n'ont pas encore été appliquées** — voir
> [Ce qui reste à faire](#ce-qui-reste-à-faire).

## Ce que c'est, et ce que ce n'est pas

Un outil **non officiel**, sans lien avec les ayants droit de l'émission. Les
données référentielles proviennent de Wikipédia, source **collaborative** :
rien n'y est présenté comme officiel, et chaque valeur affichée porte sa
provenance, sa révision et son statut de validation.

L'identité visuelle est **originale**. Aucun logo, totem, photographie, extrait
ou élément graphique de l'émission n'est reproduit.

## Deux licences, parce qu'il y a deux choses

| Quoi                           | Licence                            |
| ------------------------------ | ---------------------------------- |
| Le **code**                    | MIT — voir [LICENSE](./LICENSE)    |
| Les **données référentielles** | CC BY-SA 4.0, héritée de la source |

Le partage à l'identique n'est pas un détail de bas de page : il découle de la
licence du contenu source, vérifiée à la source et non supposée. Voir
[docs/attribution.md](./docs/attribution.md).

## Socle

L'application consomme **`@mister-guiiug/dev-wpa-config`** (version 3.34.0),
paquet de configuration et de composants de la famille `miss-*` / `mister-*`.

> Le paquet s'appelle bien `dev-**wpa**-config` : c'est son nom publié sur
> GitHub Packages, pas une coquille corrigeable. Le produit, lui, est une
> **PWA**, et c'est ce terme qui est employé partout ailleurs.

Ce que le socle apporte déjà, et qu'il ne faut pas réécrire : file de
synchronisation hors ligne (`sync-queue`), IndexedDB (`idb`), magasin versionné
(`versioned-store`), client Supabase et couche d'authentification (`auth`,
`auth/supabase`), animations (`react/rive` — chargement paresseux, repli,
`prefers-reduced-motion`), configuration PWA (`vite-pwa`), accessibilité
(`react/a11y`), et les workflows CI/CD réutilisables.

## Documentation

| Document                                                 | Contenu                                            |
| -------------------------------------------------------- | -------------------------------------------------- |
| [docs/audit-socle.md](./docs/audit-socle.md)             | Audit factuel du socle, et ce qu'il change au plan |
| [docs/modele-de-donnees.md](./docs/modele-de-donnees.md) | Schéma, diagramme, et les six écarts assumés       |
| [docs/attribution.md](./docs/attribution.md)             | Source, licences, obligations, accès responsable   |

## Base de données

```bash
supabase start
```

```bash
supabase db reset
```

Les migrations sont dans [`supabase/migrations`](./supabase/migrations) :
`0001_referentiel.sql` (référentiel + provenance), `0002_import.sql` (pipeline
d'import), `0003_personnel.sql` (profils, notes, partage).

Les tables sont créées en `ENABLE ROW LEVEL SECURITY` **sans aucune politique** :
un schéma poussé à moitié refuse tout au lieu d'exposer. `0004_rls.sql` ouvre
ensuite le strict nécessaire, avec un double verrou — droits SQL retirés puis
redonnés un par un, **en plus** des politiques.

## Ce qui reste à faire

Dans l'ordre :

1. **Appliquer et vérifier les migrations** — non fait, Docker n'a pas démarré
   sur le poste ;
2. `0004_rls.sql` — politiques de lecture, écriture, partage et révocation ;
3. échafaudage de la PWA (Vite, React 19, routeur, magasin, Tailwind) ;
4. pipeline d'import Wikipédia en Edge Function ;
5. écrans, statistiques, anti-spoiler, hors-ligne ;
6. animations Rive — les composants et les replis ; **aucun fichier `.riv`
   n'est fourni à ce jour**, et aucun ne sera inventé.
