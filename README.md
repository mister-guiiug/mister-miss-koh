# mister-miss-koh — « Aventure Tracker »

PWA de suivi d'une saison d'aventure : candidats, épisodes, épreuves, conseils,
votes et départs, avec notes personnelles, favoris et partage révocable.

> **État : base hébergée, lecture réelle.** L'application démarre, se construit
> et se teste ; le pipeline d'import est écrit et testé ; les cinq migrations
> sont **appliquées** sur le projet Supabase hébergé, et les 22 assertions RLS
> passent contre lui. Cette base ne publie encore aucune saison : l'application
> le dit et affiche la démonstration. L'Edge Function d'import n'est pas
> déployée — voir [Ce qui reste à faire](#ce-qui-reste-à-faire).

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

| Commande                  | Ce qu'elle vérifie                                    | État au 05/09/2026        |
| ------------------------- | ----------------------------------------------------- | ------------------------- |
| `npm run lint`            | ESLint (socle : react-hooks, jsx-a11y, react-refresh) | 0 erreur, 0 avertissement |
| `npm run type-check`      | TypeScript strict, `tsc -b`                           | propre                    |
| `npm test`                | Vitest — cœur métier, adaptateur Supabase, accueil    | 38 tests verts            |
| `npm run test:edge`       | Deno — pipeline d'import                              | 90 tests verts            |
| `npm run test:rls:remote` | pgTAP — politiques RLS, contre la base liée           | 22 assertions vertes      |
| `npm run build`           | `tsc -b`, Vite, budget de bundle (260 kB gzip)        | 243,2 kB gzip             |
| `npm run doctor`          | `pwa-doctor` du socle                                 | 0 défaut                  |

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

> Jusqu'au 05/09/2026, ce paquet s'appelait `dev-wpa-config` : une coquille
> typographique dans le nom publié, corrigée par la 4.0.0, qui ne change que
> le nom (dépôt, paquet, workflows `@v4`). L'audit du 04/09
> ([docs/audit-socle.md](./docs/audit-socle.md)) est antérieur à ce
> renommage et n'est pas réécrit.

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

La base **hébergée** est le projet Supabase `mister-miss-koh`
(`oqldfzrsandcguajyxbh`, région `eu-west-3`, offre Free). Les cinq migrations y
sont appliquées ; `src/backend/database.types.ts` en est généré.

```bash
supabase link --project-ref oqldfzrsandcguajyxbh
```

```bash
supabase db push
```

```bash
supabase gen types typescript --linked > src/backend/database.types.ts
```

`supabase link` lit le mot de passe de la base dans `SUPABASE_DB_PASSWORD` ; il
vit, avec la référence du projet, dans `.env.supabase.local`, ignoré par git.
L'URL et la clé anonyme vont dans `.env.development.local` sur le poste, et
dans les **variables** — pas les secrets — du dépôt GitHub pour le déploiement :
Vite les copie dans le bundle, et la clé anonyme est publique par construction
(rôle `anon` vérifié dans le jeton avant d'être traitée ainsi). La clé
`service_role`, elle, n'entre nulle part côté client.

Les tables naissent en `ENABLE ROW LEVEL SECURITY` **sans aucune politique** :
un schéma poussé à moitié refuse tout au lieu d'exposer. `0004_rls.sql` ouvre
ensuite le strict nécessaire, avec un double verrou — droits SQL retirés puis
redonnés un par un, **en plus** des politiques.

### Tests des politiques

`supabase test db` exige Docker (`pg_prove` en conteneur), qui ne démarre pas
sur le poste de développement. Le même fichier se joue **contre la base liée**,
sans Docker, par un lanceur qui collecte chaque verdict pgTAP :

```bash
npm run test:rls:remote
```

Le 05/09/2026, contre la base hébergée : **22 assertions sur 22** passent. Le
`rollback` final ne laisse rien derrière lui.

## Ce qui reste à faire

Dans l'ordre :

1. la **publication transactionnelle** du pipeline et son retour arrière ;
2. le **déploiement de l'Edge Function** `import-wikipedia` et son secret
   `IMPORT_CRON_SECRET` — le code est testé, rien n'est déployé, aucun import
   réel n'a tourné ;
3. les secrets du **keep-alive** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   que le workflow réutilisable déclare comme tels), que seul le propriétaire
   du dépôt peut poser ;
4. authentification, pseudonyme, profil, notes synchronisées et partage —
   les tables et les politiques sont prêtes, les écrans non ;
5. animations Rive — les composants, les rôles et les replis existent ;
   **aucun fichier `.riv` n'est fourni**, et aucun ne sera inventé.
