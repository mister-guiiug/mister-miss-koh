# mister-miss-koh — « Aventure Tracker »

PWA de suivi d'une saison d'aventure : candidats, épisodes, épreuves, conseils,
votes et départs, avec notes personnelles, favoris et partage révocable.

> **État : échafaudage vérifié.** L'application démarre, se construit et se
> teste ; le pipeline d'import est écrit et testé. Les migrations Supabase, en
> revanche, **n'ont jamais été appliquées** — voir [Ce qui reste à faire](#ce-qui-reste-à-faire).

## Ce que c'est, et ce que ce n'est pas

Un outil **non officiel**, sans lien avec les ayants droit de l'émission. Les
données référentielles proviennent de Wikipédia, source **collaborative** :
rien n'y est présenté comme officiel, et chaque valeur affichée porte sa
provenance, sa révision et son statut de validation.

L'identité visuelle est **originale** — terre, feu, océan, jungle. Aucun logo,
totem, photographie, extrait ou élément graphique de l'émission n'est reproduit.

**L'application démarre sans configuration.** Sans backend, elle tourne sur un
référentiel de démonstration explicitement marqué « Donnée fictive de
démonstration » — aucun de ses prénoms n'est réel. C'est le comportement de la
page publique, hors ligne, sans compte.

## Démarrer

```bash
npm install
```

```bash
npm run dev
```

Le serveur de développement écoute sur le port 5236 (configuration
`.claude/launch.json` du dépôt parent). L'installation lit
`@mister-guiiug/dev-pwa-config` sur GitHub Packages : exporter
`NODE_AUTH_TOKEN` (un jeton avec `read:packages`) avant `npm install`.

## Vérifier

| Commande             | Ce qu'elle vérifie                                    | État au 05/09/2026        |
| -------------------- | ----------------------------------------------------- | ------------------------- |
| `npm run lint`       | ESLint (socle : react-hooks, jsx-a11y, react-refresh) | 0 erreur, 0 avertissement |
| `npm run type-check` | TypeScript strict, `tsc -b`                           | propre                    |
| `npm test`           | Vitest — cœur métier pur et écran d'accueil           | 24 tests verts            |
| `npm run test:edge`  | Deno — pipeline d'import                              | 90 tests verts            |
| `npm run build`      | `tsc -b`, Vite, budget de bundle (260 kB gzip)        | 185,7 kB gzip             |
| `npm run doctor`     | `pwa-doctor` du socle                                 | 0 défaut                  |

## Deux licences, parce qu'il y a deux choses

| Quoi                           | Licence                            |
| ------------------------------ | ---------------------------------- |
| Le **code**                    | MIT — voir [LICENSE](./LICENSE)    |
| Les **données référentielles** | CC BY-SA 4.0, héritée de la source |

Le partage à l'identique découle de la licence du contenu source, vérifiée à la
source et non supposée. Voir [docs/attribution.md](./docs/attribution.md).

## Socle

L'application consomme **`@mister-guiiug/dev-pwa-config`** (version 4.0.0),
paquet de configuration et de composants de la famille `miss-*` / `mister-*`.

> Jusqu'à la 3.34.0, le paquet et son dépôt s'appelaient `dev-pwa-config`. Ils
> ont été renommés le 05/09/2026 ; la 4.0.0 ne change que le nom, et l'ancien
> paquet reste publié sans évoluer.

Ce qu'il apporte et qui est **réellement branché** : `ThemeProvider`,
`AppHeader`, `BottomNav`, `AppFooter`, `PageContainer`, `Card`, `Badge`,
`Button`, `EmptyState`, `ErrorBoundary`, `LabelsProvider`, `IconsProvider`
(lucide), `react/rive` derrière `AppAnimation`, `versioned-store` pour les
données personnelles, `storage` pour le cache, `backend` pour la sélection du
backend et sa couverture, `vite-pwa` / `vite-csp` / `pwaSeoPlugin`, les
workflows CI, déploiement, Lighthouse et nettoyage, `pwa-icons`,
`pwa-bundle-budget`, `pwa-doctor`.

## Architecture

```
src/
  domain/        métier PUR, sans React : référentiel (zod), anti-spoiler,
                 statistiques (zéro ≠ inconnu), règles de saison
  backend/       sélection du backend, port du référentiel, démonstration
  store/         zustand — référentiel + données personnelles (magasin versionné)
  animations/    registre de rôles → AppAnimation (socle react/rive, repli garanti)
  components/    Layout, SpoilerGuard, Provenance
  features/      accueil, tableau de bord, candidats, épisodes, réglages, hors-ligne
supabase/
  migrations/    0001 référentiel · 0002 import · 0003 personnel · 0004 RLS
  functions/     pipeline d'import (Deno, sans dépendance) + fonction Edge
  tests/         isolation RLS (pgTAP)
```

Trois choix qui structurent le code :

- **la statistique respecte l'anti-spoiler.** Chaque calcul prend une limite
  d'épisode ; « 3 voix reçues » sur la fiche d'un candidat encore en jeu à
  l'épisode 2 dirait qu'un troisième conseil a eu lieu ;
- **zéro n'est pas inconnu.** Les comptes rendent `{ value, complete }` ; un
  départ de binôme vaut `0` certain, un détail de voix partiel vaut « ≥ n » ;
- **les règles de saison sont des données.** « Le binôme suit l'éliminé » est
  lu dans `season.rules`, jamais présumé — une saison ordinaire n'en déduit rien.

## Documentation

| Document                                                   | Contenu                                            |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [docs/audit-socle.md](./docs/audit-socle.md)               | Audit factuel du socle, et ce qu'il change au plan |
| [docs/modele-de-donnees.md](./docs/modele-de-donnees.md)   | Schéma, diagramme, et les six écarts assumés       |
| [docs/politiques-rls.md](./docs/politiques-rls.md)         | Double verrou, partage par fonction, tests         |
| [docs/pipeline-wikipedia.md](./docs/pipeline-wikipedia.md) | Extraction, recoupement, diff, orchestrateur       |
| [docs/attribution.md](./docs/attribution.md)               | Source, licences, obligations, accès responsable   |

## Base de données

```bash
supabase start
```

```bash
supabase db reset
```

Les tables naissent en `ENABLE ROW LEVEL SECURITY` **sans aucune politique** :
un schéma poussé à moitié refuse tout au lieu d'exposer. `0004_rls.sql` ouvre
ensuite le strict nécessaire, avec un double verrou — droits SQL retirés puis
redonnés un par un, **en plus** des politiques.

## Ce qui reste à faire

Dans l'ordre :

1. **appliquer et vérifier les migrations** — non fait, Docker ne démarre pas
   sur le poste de développement ; `supabase test db` attend la même chose ;
2. l'**adaptateur Supabase du référentiel** — le port existe, la couverture le
   déclare local, l'écran des réglages le dit ;
3. la **publication transactionnelle** du pipeline et son retour arrière ;
4. authentification, pseudonyme, profil, notes synchronisées et partage —
   les tables et les politiques sont prêtes, les écrans non ;
5. animations Rive — les composants, les rôles et les replis existent ;
   **aucun fichier `.riv` n'est fourni**, et aucun ne sera inventé.
