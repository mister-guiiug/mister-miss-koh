# mister-miss-koh — « Mister & miss Koh »

PWA de suivi des saisons d'aventure — en cours comme passées : candidats,
épisodes, épreuves, conseils, votes et départs, avec notes personnelles,
favoris et partage révocable.

> **État : la saison en cours est publiée, et lue par le site.**
> Les **vingt et une** migrations sont appliquées sur le projet Supabase hébergé,
> qui suit les **18 pages de saison** déclarées par Wikipédia. Les politiques
> d'isolation (33 assertions) et la publication transactionnelle (43 assertions)
> passent contre cette base.
> La fonction Edge est **déployée**, un premier import réel a tourné, et son lot
> de 78 différences a été relu puis **publié** : le site affiche la vraie saison,
> avec sa provenance et son anti-spoiler. Le retour arrière a servi pour de
> vrai, à corriger trois défauts de la publication — voir
> [Ce qui reste à faire](#ce-qui-reste-à-faire).

## Ce que c'est, et ce que ce n'est pas

Un outil **non officiel**, sans lien avec les ayants droit de l'émission. Les
données référentielles proviennent de Wikipédia, source **collaborative** :
rien n'y est présenté comme officiel, et chaque valeur affichée porte sa
provenance, sa révision et son statut de validation.

L'identité visuelle est **originale** — terre, feu, océan, jungle. Aucun logo,
totem, photographie, extrait ou élément graphique de l'émission n'est reproduit.

**Les portraits des candidats ne font pas exception.** L'application n'en
distribue aucun et n'en télécharge aucun : chaque candidat porte une vignette
d'initiales, et vous pouvez y mettre **votre** image, qui reste sur votre
appareil (IndexedDB, ré-encodée en vignette, métadonnées retirées). Les photos
officielles sont des œuvres protégées représentant des personnes
identifiables ; les republier ici contredirait la ligne ci-dessus.

**Partager une de vos images, c'est la donner — pas la publier.** L'image part
par la feuille de partage du système ou par un enregistrement, d'appareil à
appareil : aucune route ne la dépose sur un serveur, il n'y en a pas pour ça.
Le QR code, lui, porte le **lien de la fiche**, jamais l'image — un QR code
contient au plus 2,9 ko, et l'écran affiche les deux tailles côte à côte
plutôt que de le laisser croire.

**Un pseudonyme se choisit, il ne s'invente pas.** Aucun profil n'est créé
automatiquement : `pseudonym` est obligatoire, et le fabriquer depuis une
adresse électronique reviendrait à vous attribuer un nom. Tant que vous n'en
choisissez pas un, une note partagée est signée « quelqu'un qui n'a pas choisi
de pseudonyme » — c'est l'état réel, pas une panne. L'**identifiant public**,
lui, est facultatif : c'est une adresse unique, et sa disponibilité se demande
au serveur, seul à voir les profils des autres.

**Vos notes, elles, peuvent être données OU publiées — et l'écran ne confond
pas les deux.** Les envoyer en texte ou les enregistrer en Markdown ne publie
rien. Un **lien de lecture**, lui, les ouvre à qui obtient l'adresse, sans
compte : le bouton le dit avant, « Révoquer » est à côté du lien, et un lien
révoqué referme la note dans la foulée. Le **lien de collection** montre les
notes que vous avez marquées « partagée » — telles qu'elles sont à l'instant
où on l'ouvre : en retirer une la fait disparaître aussitôt, sans révoquer le
lien ni en refaire un.

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

| Commande                          | Ce qu'elle vérifie                                    | État au 06/09/2026           |
| --------------------------------- | ----------------------------------------------------- | ---------------------------- |
| `npm run lint`                    | ESLint (socle : react-hooks, jsx-a11y, react-refresh) | 0 erreur, 0 avertissement    |
| `npm run type-check`              | TypeScript strict, `tsc -b`                           | propre                       |
| `npm test`                        | Vitest — cœur métier, adaptateur, écrans, composants  | 246 tests verts              |
| `npm run test:edge`               | Deno — pipeline d'import, catalogue, lieu de tournage | 133 tests verts              |
| `npm run test:rls:remote`         | pgTAP — RLS et partages, contre la base liée          | 33 assertions vertes         |
| `npm run test:publication:remote` | pgTAP — publication, lieu et retour arrière           | 43 assertions vertes         |
| `npm run test:personnel:remote`   | pgTAP — suivi multi-appareils, annulation             | 17 assertions **non jouées** |
| `npm run build`                   | `tsc -b`, Vite, budget (305 kB gzip, index ≤ 105 kB)  | 277,8 kB gzip, index 98 kB   |
| `npm run doctor`                  | `pwa-doctor` du socle                                 | 0 défaut, 0 dette, 0 info    |

## Licence, et ce que le projet stocke

Le dépôt est sous licence **MIT** — voir [LICENSE](./LICENSE) — et cette licence
couvre le **code**.

Le référentiel ne retient que des **faits tabulaires** : un prénom, un âge, une
date, un nom de tribu, qui a voté pour qui, un décompte. Aucune prose de la
source n'est copiée — ni résumé d'épisode, ni paragraphe rédigé. Le projet ne
revendique donc aucune licence sur les données, et garde en revanche leur
**traçabilité** entière : page, révision, date de lecture, pour chaque valeur.
Voir [docs/attribution.md](./docs/attribution.md).

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
backend et sa couverture, `image` pour ré-encoder un portrait déposé, `share`
(partage natif et repli presse-papiers), `download`, `qr` (peer optionnelle
`qrcode`, chargée seulement à l'ouverture d'un QR code), `format` (`slugify`,
`formatBytes`), `vite-pwa` / `vite-csp` / `pwaSeoPlugin`, les workflows CI,
déploiement, Lighthouse et nettoyage, `pwa-icons`, `pwa-bundle-budget`,
`pwa-doctor`.

## Architecture

```
src/
  domain/        métier PUR, sans React : référentiel (zod), anti-spoiler,
                 statistiques (zéro ≠ inconnu), règles de saison, duos
                 supposés (`pairing.ts` — la source prime toujours), partage
                 (`sharing.ts` — nom de fichier, adresses, capacité d'un QR),
                 notes en document (`notesExport.ts` — Markdown et texte brut),
                 cibles d'une note (`noteTargets.ts` — nommer, ou le dire),
                 pseudonyme et identifiant public (`profile.ts` — les règles du
                 schéma, dites avant que PostgreSQL ne les oppose)
  backend/       sélection du backend, port du référentiel, démonstration,
                 portraits (IndexedDB, sur l'appareil — `photos.ts`), envoi
                 d'une image par la feuille du système (`sharePhoto.ts`), liens
                 de partage des notes (`sharing.ts` — créer, révoquer, lire),
                 profil (`profile.ts` — `upsert`, et la disponibilité demandée
                 au serveur et non à la table), suivi du compte
                 (`personal.ts` — favoris et épisodes vus, une union jamais un
                 écrasement)
  store/         zustand — référentiel + données personnelles (magasin versionné) ;
                 un rechargement en échec garde la dernière lecture réussie ;
                 notes du compte (useNotesStore), portraits (usePhotosStore :
                 URL d'objet, révoquées dès qu'elles sont remplacées)
  animations/    registre de rôles → AppAnimation (socle react/rive, repli garanti),
                 niveaux de mouvement (`data-motion` sur <html>)
  hooks/         useSpoilerLimit, useSession (compte courant), useProfile (le
                 pseudonyme, chargé à la connexion et oublié après), useNotes (les
                 notes du compte, une fois), usePersonalSync (le suivi qui suit
                 le compte, le magasin local en repli), useUndo (supprimer sans
                 confirmer, annuler pendant huit secondes), useHaptics,
                 useRefreshReferential (recharger et le dire — l'échec aussi)
  components/    Layout, SpoilerGuard, Provenance, FavoriteButton, PullToRefresh,
                 NoteEditor + TargetNotes (une note là où la chose s'affiche),
                 PairBlock (le binôme : celui de la source, ou le vôtre),
                 Avatar + ContestantTraits + PhotoPicker (portrait, sexe, âge),
                 PhotoShare et NoteShare, tous deux sur ShareLinkPanel (le QR,
                 l'adresse en clair, et le partage natif d'un lien),
                 LocationMap (tuiles OpenStreetMap en SVG, géométrie dans mapTiles)
  features/      accueil, tableau de bord, candidats, épisodes, notes, compte,
                 profil (pseudonyme, identifiant public, visibilité), réglages,
                 hors-ligne, et `share/` — ce qu'un lien ouvre, pour n'importe
                 qui, sans session
supabase/
  migrations/    0001 référentiel · 0002 import · 0003 personnel · 0004 RLS
                 0005 amorçage · 0006 source · 0007 publication · 0008 catalogue
                 0009 correctifs · 0010 tribus et épreuves · 0011 version
                 d'extraction · 0012 format d'épreuve · 0013 colliers ·
                 0014 colonnes mortes · 0015-0018 duos révélés, ordre des
                 publications, photo des remplacements, cause extraite ·
                 0019 lieu de tournage · 0020 révision publiée ·
                 0021 partage des notes (lecteur de collection, et la
                 jointure de profil rendue EXTERNE)
  functions/     pipeline d'import (Deno, sans dépendance) + fonction Edge
  tests/         isolation RLS, publication, et le suivi du compte (pgTAP)
```

Six choix qui structurent le code :

- **la statistique respecte l'anti-spoiler.** Chaque calcul prend une limite
  d'épisode ; « 3 voix reçues » sur la fiche d'un candidat encore en jeu à
  l'épisode 2 dirait qu'un troisième conseil a eu lieu ;
- **zéro n'est pas inconnu.** Les comptes rendent `{ value, complete }` ; un
  départ de binôme vaut `0` certain, un détail de voix partiel vaut « ≥ n » ;
- **les règles de saison sont des données.** « Le binôme suit l'éliminé » est
  lu dans `season.rules`, jamais présumé — une saison ordinaire n'en déduit rien ;
- **le mouvement est un confort, jamais une information.** Tout ce qui bouge
  est en CSS (entrée d'écran, révélation d'un contenu démasqué, étoile des
  favoris, cases et boutons) sous `data-motion` sur `<html>` — `full`,
  `essential` (« Animations » décochée : plus rien de décoratif, mais une case
  qui se coche répond encore), `none` (« Réduire les mouvements ») — posé par
  `useMotionLevel` ; le réglage système gagne toujours. Les cases restent des
  `<input>` natifs redessinés : le clavier, le lecteur d'écran et le script de
  captures les trouvent ;
- **une hypothèse n'entre pas dans le référentiel.** Un duo créé à la main est
  une **supposition** : elle vit dans les données personnelles, sur l'appareil,
  et s'affiche partout comme telle. Dès que la source nomme ce duo — et que
  l'anti-spoiler le laisse voir — c'est elle qui s'affiche, et la supposition
  est dite confirmée ou contredite plutôt qu'effacée en silence. Un duo révélé
  mais **masqué** ne compte pour rien, pas même pour retirer un nom de la liste
  des binômes possibles : cette absence-là divulguerait ce que l'écran cache ;
- **donner et publier ne sont pas le même geste, et l'écran ne les confond
  pas.** Aucune route ne dépose une image sur un serveur ; un texte ou un
  fichier de notes non plus. Ce qui publie — un lien de lecture — le dit avant,
  et se révoque. Les détails qui font que ça tient : le fichier est relu depuis
  IndexedDB **avant** que le bouton n'apparaisse (Safari veut que
  `navigator.share` parte du geste) ; la charge examinée par `canShare` est
  exactement celle qui sera envoyée — vérifier `{ files }` puis envoyer
  `{ files, url }` fait dire oui au bouton et non au clic ; la **visibilité**
  d'une note s'ouvre avant que son lien n'existe, sinon l'adresse promettrait
  ce que le serveur refuse ; et un lien de collection nomme une **règle**, pas
  une liste figée, ce qui rend le retrait immédiat. Ce qui ne peut pas passer
  est dit avec le chiffre : le QR code porte le lien parce qu'un QR contient au
  plus 2,9 ko.

## Documentation

| Document                                                   | Contenu                                            |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [docs/audit-socle.md](./docs/audit-socle.md)               | Audit factuel du socle, et ce qu'il change au plan |
| [docs/modele-de-donnees.md](./docs/modele-de-donnees.md)   | Schéma, diagramme, et les six écarts assumés       |
| [docs/politiques-rls.md](./docs/politiques-rls.md)         | Double verrou, partage par fonction, tests         |
| [docs/pipeline-wikipedia.md](./docs/pipeline-wikipedia.md) | Catalogue, extraction, diff, publication           |
| [docs/attribution.md](./docs/attribution.md)               | Source, traçabilité, accès responsable             |

## Base de données

La base **hébergée** est le projet Supabase `mister-miss-koh`
(`oqldfzrsandcguajyxbh`, région `eu-west-3`, offre Free). Les dix-huit migrations y
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

Le projet Free se met en pause après sept jours sans requête. Le workflow
`supabase-keepalive.yml` fait un `select` anonyme tous les trois jours. Il
n'attend **aucun secret** : le réutilisable du socle déclare ses deux entrées
en `secrets:`, mais un appelant y passe l'expression qu'il veut — ici les
**variables** du dépôt, qui portent déjà l'URL et la clé anonyme pour le
déploiement. Une seule valeur, un seul endroit.

Les tables naissent en `ENABLE ROW LEVEL SECURITY` **sans aucune politique** :
un schéma poussé à moitié refuse tout au lieu d'exposer. `0004_rls.sql` ouvre
ensuite le strict nécessaire, avec un double verrou — droits SQL retirés puis
redonnés un par un, **en plus** des politiques.

### Le catalogue des saisons

Les saisons suivies ne sont pas une liste écrite à la main : ce sont les pages
que l'API MediaWiki déclare dans `Catégorie:Saison de Koh-Lanta` — **18 le
05/09/2026**. `0008_catalogue_saisons.sql` les amorce ; l'action `discover` de
la fonction Edge relit la catégorie et ajoute ce qui manque, sans jamais rien
supprimer.

Chaque saison découverte naît en `unknown` / `pending_review` : on sait qu'une
page existe, pas ce qu'elle contient. C'est un import relu **puis publié** qui
la rend visible.

### La fonction d'import

Déployée sur le projet hébergé, sans Docker :

```bash
supabase functions deploy import-wikipedia --project-ref oqldfzrsandcguajyxbh --use-api
```

Elle s'ouvre par un secret de planification (`IMPORT_CRON_SECRET`, posé avec
`supabase secrets set --env-file`, conservé en local dans `.env.supabase.local`)
ou par un compte portant le rôle `admin` ou `validator`, **vérifié en base**. La
vérification de jeton de la plateforme restant active, un appel présente aussi
la clé anonyme en `Authorization` ; elle n'ouvre rien par elle-même.

Le premier import réel a tourné le 05/09/2026 : 78 différences proposées,
aucune validée automatiquement, référentiel publié inchangé. Détail et
comportements vérifiés dans
[docs/pipeline-wikipedia.md](./docs/pipeline-wikipedia.md).

### Tests des politiques

`supabase test db` exige Docker (`pg_prove` en conteneur), qui ne démarre pas
sur le poste de développement. Le même fichier se joue **contre la base liée**,
sans Docker, par un lanceur qui collecte chaque verdict pgTAP :

```bash
npm run test:rls:remote
```

Le 05/09/2026, contre la base hébergée : **24 assertions sur 24** pour
l'isolation, **39 sur 39** pour la publication. Le `rollback` final ne laisse
rien derrière lui.

```bash
npm run test:publication:remote
```

## Comptes et notes

**Aucun mot de passe, nulle part.** On entre par un lien à usage unique envoyé
à une adresse (`signInWithOtp`) : l'application ne voit passer aucun secret et
n'en conserve aucun. Il n'y a donc ni réinitialisation, ni stockage, ni fuite
possible par le bundle.

Deux réglages sans lesquels le lien ne ramène nulle part :

- le **flux PKCE** (`src/backend/supabaseReferential.ts`). Le flux implicite
  renvoie le jeton dans le _fragment_ (`#access_token=…`), l'endroit exact où
  `HashRouter` lit la route : le routeur y verrait une adresse inconnue et
  remplacerait le tout par « / », emportant le jeton. PKCE passe par
  `?code=…`, que le routeur ne touche pas ;
- la **liste d'URL autorisées** du projet, posée le 05/09/2026 sur
  `https://mister-guiiug.github.io/mister-miss-koh/` (aussi `site_url`) et
  `http://localhost:5236/`. Elle valait `http://localhost:3000` par défaut,
  c'est-à-dire nulle part.

Les notes vivent **sur le serveur** : on relit une note ailleurs, et on ne veut
pas la perdre en vidant un cache. Une note vise exactement **une** chose
(saison, candidat, épisode…), garantie par une contrainte de cardinalité ; la
suppression est **logique** (`deleted_at`), pour qu'un lien partagé cesse
d'ouvrir la note au moment où son auteur la retire.

**Et cette suppression s'annule.** Supprimer une note ne demande plus de
confirmation : la notification offre huit secondes pour revenir en arrière. Une
boîte de dialogue avant chaque geste fatigue sans protéger — on répond « oui »
par réflexe —, alors qu'un retour en arrière protège vraiment, et il ne coûte
rien ici puisque la ligne n'a jamais été détruite : annuler retire une date.
Pas de corbeille pour autant, et la raison est dans la RLS — la politique de
lecture porte `deleted_at is null`, donc on ne peut pas _lister_ ses notes
supprimées, tandis que la politique de mise à jour, elle, laisse les
restaurer. La publication d'une collection, elle, garde sa confirmation : on
confirme ce qui sort, on annule ce qui reste chez soi.

**Les favoris et les épisodes vus suivent le compte, sans cesser d'être
locaux.** L'anti-spoiler est la fonction centrale de l'application et il ne
franchissait pas l'appareil : un épisode marqué vu sur le téléphone laissait la
tablette afficher les éliminés. Il s'écrit maintenant aussi dans
`user_favorites` et `watched_episodes` — tables présentes depuis la migration
0003, fermées à autrui depuis 0004, **sans aucune migration nouvelle** —
pendant que le magasin local reste la référence de l'appareil : sans compte,
hors ligne, ou si le serveur refuse, l'application marche entière. À la
connexion, l'appareil et le compte sont **réunis** (une union, jamais un
écrasement) ; le prix, assumé et écrit, est qu'un décochage fait sur un
appareil pendant que l'autre l'ignorait revient une fois.

Le référentiel de **démonstration** ne synchronise rien : ses identifiants
(`c-ael`, `e1`) ne sont pas des `uuid`, les envoyer ferait échouer chaque
insertion et publierait un suivi qui ne veut rien dire.

**Le profil** (`/profil`, sous le compte) donne un pseudonyme à ce que l'on
partage, et un identifiant public facultatif. Ce sont **deux choses** : deux
personnes ont le droit de s'appeler « Tarzan », une seule peut être `tarzan` —
l'unicité porte sur l'adresse, pas sur le libellé, sans quoi chaque inscription
deviendrait une course au nom. Sa disponibilité se demande au **serveur**
(`handle_is_available`, `security definer`) : vérifiée côté client, un
identifiant déjà pris passerait pour libre, puisque l'appelant ne voit pas le
profil qui le détient. Tout y est **privé par défaut**, et chaque bascule
— favoris, statistiques, notes publiques — est un consentement **séparé** :
rendre son profil visible n'ouvre rien d'autre. Aucune adresse électronique n'y
figure : elle n'est dans aucune colonne de `profiles`, elle reste dans
`auth.users`, hors de portée de l'API publique.

Enfin, la lecture filtre sur `user_id`, et ce n'est pas une précaution
superflue : les politiques RLS sont **permissives**, donc combinées par OU. À
côté de « je vois les miennes » vit « tout le monde voit les notes publiques ».
Le serveur a raison ; c'est à la requête de dire ce qu'elle cherche. Deux
assertions pgTAP (§ 2 bis de `rls.test.sql`) figent ce comportement, faute de
quoi la disparition du filtre ne casserait rien de visible.

## Ce qui reste à faire

Dans l'ordre :

1. les **duos non révélés** : la source ne les liste nulle part, et un duo
   n'est connu que lorsqu'un départ le nomme — deux sur neuf à ce jour ;
2. les **résumés d'épisodes** : la source les rédige en prose, et le projet
   ne stocke que des faits tabulaires — ce serait un changement de nature, pas
   une extraction de plus ;
3. le **profil PUBLIC** : le pseudonyme et l'identifiant se choisissent depuis
   l'écran Compte, mais `profiles.visibility` reste à `private` et aucun écran
   ne montre le profil de quelqu'un d'autre. Tant qu'il n'y en a pas, la
   bascule n'aurait rien à gouverner — et les trois consentements séparés
   (`show_favorites`, `show_stats`, `show_notes`) attendent avec elle ;
4. la **suppression de compte** : la cascade existe en base, mais l'effacer
   demande un appel serveur — le navigateur n'a pas ce droit, et ne doit pas
   l'avoir ;
5. l'**export** et l'**import** de ses données : `export_my_data()` existe en
   base (0004, § 9) et aucun écran ne l'appelle — la portabilité est écrite,
   pas offerte ;
6. animations Rive — les composants, les rôles et les replis existent ;
   **aucun fichier `.riv` n'est fourni**, et aucun ne sera inventé. En
   attendant, la flamme de l'écran d'attente est le repli CSS du rôle
   `referential-loading` : un `.riv` la remplacerait sans toucher à l'écran.
