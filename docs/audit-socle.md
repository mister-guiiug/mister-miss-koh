# Audit du socle — ce qui est vérifié, et ce qui ne l'est pas

_Conduit le 04–05/09/2026, avant toute écriture de code applicatif. Chaque
ligne de ce document a été lue dans le dépôt, obtenue par une commande, ou
demandée à une API. Ce qui n'a pas pu l'être est marqué **« Je ne sais
pas. »**_

## Trois prémisses du besoin sont fausses

**1. `dev-pwa-config` n'existe pas.** Ni en local, ni sur GitHub
(`Could not resolve to a Repository`). Le socle réel est **`dev-wpa-config`**,
publié sous `@mister-guiiug/dev-wpa-config`.

Le besoin demandait de traiter « WPA » comme une coquille. Ce n'en est pas une
ici : c'est le **nom publié du paquet npm et du dépôt**, immuable sans
republication. Le produit est décrit comme une **PWA** partout ; le nom du
paquet reste `dev-wpa-config` dans les imports et le `package.json`, sans quoi
rien ne s'installe.

> **Post-scriptum du 05/09/2026.** Le propriétaire a renommé le socle le
> lendemain de cet audit : dépôt `mister-guiiug/dev-pwa-config`, paquet
> `@mister-guiiug/dev-pwa-config` **4.0.0**, workflows réutilisables en `@v4`.
> La coquille était donc corrigeable — par republication, comme dit ci-dessus.
> Cette application le consomme sous son nouveau nom ; le reste de l'audit
> décrit l'état du 04/09 et n'est pas réécrit.

**2. Le socle n'est pas un modèle d'application.** C'est une bibliothèque de
configuration et de composants, **sans aucune dépendance de production**
(`dependencies: {}`), consommée en `devDependency`. On ne « part » pas de lui
en le clonant : on échafaude une application et on l'ajoute.

**3. Rive est déjà intégré.** Le besoin demandait de créer une couche
`RiveAnimation` / repli / `reduced-motion`. `react/rive` l'a déjà, et
**`@rive-app/react-canvas ^4.0.0`** est déclaré en peer optionnelle — la
question du « paquet réellement recommandé » est donc tranchée par le code.

## Technologies détectées

| Domaine     | Fait vérifié                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paquet      | `@mister-guiiug/dev-wpa-config@3.34.0`, MIT, ESM, Node ≥ 22, **148 sous-chemins**                                                                    |
| Dépendances | **0 en production**, 33 peers dont **22 optionnelles**                                                                                               |
| Front       | React `^19`, Vite `^8`, TypeScript `~6.0.3`, Tailwind `^4`                                                                                           |
| Tests       | Vitest `^4`, `@vitest/browser`, Playwright `^1.49`, `@axe-core/playwright`, jsdom, fake-indexeddb                                                    |
| Validation  | **zod `^4`**                                                                                                                                         |
| Backend     | `@supabase/supabase-js ^2` (Firebase existe en option concurrente)                                                                                   |
| Animation   | `@rive-app/react-canvas ^4`                                                                                                                          |
| Qualité     | ESLint 9 + `jsx-a11y` + `react-hooks` + `react-refresh`, Prettier 3.6, commitlint                                                                    |
| Binaires    | `pwa-icons`, `pwa-bundle-budget`, `pwa-doctor`                                                                                                       |
| CI/CD       | 14 workflows, dont 6 réutilisables (`pwa-ci`, `pwa-deploy`, `pwa-lighthouse`, `pwa-supabase-migrate`, `pwa-supabase-keepalive`, `pwa-worker-deploy`) |
| Poste       | `supabase` CLI **2.111.0**, Docker **29.5.3** installé                                                                                               |

**Ni routeur ni gestion d'état imposés.** `react-router` n'apparaît que dans
des commentaires expliquant l'agnosticisme ; `zustand` seulement dans des notes
d'adoption. La convention de la famille, vérifiée dans deux applications
Supabase (miss-uwh, miss-lookhouse), est `react-router-dom ^7` + `zustand ^5` +
`zod ^4` + `lucide-react`.

## Réutilisable tel quel

- **Hors ligne** : `sync-queue` (file persistante, rejeu en série, retrait
  exponentiel dispersé, lettres mortes rejouables), `idb`, `versioned-store`,
  `storage`, `backup`, `react/sync-status-badge` ;
- **Supabase** : `supabase-client` (dont `getClient()` **rejette en nommant les
  variables manquantes**), `auth`, `auth/supabase`, `auth/mfa`,
  `auth/errors-fr`, `react/auth-gate`, `realtime/supabase` ;
- **Rive** : `react/rive` — WASM chargé à la demande, runtime injectable,
  `prefers-reduced-motion`, repli statique, et un mécanisme qui permet de
  **réessayer** après un échec réseau (React mémorise sinon le rejet d'un
  `lazy()` jusqu'au rechargement complet) ;
- **PWA** : `vite-pwa` (`registerType: 'prompt'`, `CacheFirst` sur les images,
  `NetworkFirst` sur les API), `react/use-update-prompt`, `sw-update` ;
- **Métier générique** : `backend.js` — lire l'environnement, **retomber sur un
  backend local quand la configuration manque**, remplacer les ports un par un ;
- **UI / a11y** : `components.css`, `tokens.css`, preset Tailwind, `react/a11y`,
  `react/labels` (7 langues), `react/bottom-nav`, `react/confirm-dialog`.

## À écrire

Pipeline Wikipédia, modèle relationnel, politiques RLS, moteur de règles
conseils/votes/binômes, statistiques, anti-spoiler, partage révocable, et les
fichiers `.riv`.

## Ce que la source a appris — et qui a changé la conception

Page `Koh-Lanta All Stars`, **pageid 17479409**, révision **239179934** du
03/09/2026, 22 668 octets. L'API MediaWiki répond et fournit `revid` +
horodatage : **la détection de non-modification se fait par révision, pas par
empreinte du HTML.**

- **Licence du contenu source**, lue via `meta=siteinfo`. _(Constat du 04/09.
  Le produit ne revendique plus de licence sur les données : il n'en retient que
  des faits tabulaires — voir [attribution.md](./attribution.md).)_
- **La saison est en cours.** Épisode 1 diffusé le 25/08/2026, trois
  éliminations, table pré-dimensionnée avec des cellules vides. Le
  rafraîchissement est le cœur du produit, pas un confort.
- **18 candidats en duos à destins liés** : si l'un est éliminé au conseil,
  l'autre part immédiatement. Règle **de cette édition** — d'où `season_rules`.
- **Les cas difficiles sont déjà dans les données** : égalité et second vote
  (`<s>9-9</s> / 11-7`), départ de binôme à **zéro vote**, votes barrés,
  cellules vides, et un bandeau `{{Section à sourcer|date=août 2026}}`.
- Le wikitexte est truffé de modèles (`{{date|…}}`, `{{1er|…}}`, `{{♀}}`) :
  l'extraction devra développer les modèles, pas lire le wikitexte brut.

## Risques et dette

**Dette du socle** (déjà instruite dans ses propres dossiers) : ESLint 9 est
hors support ; douze appelants sur seize passent encore `secrets: inherit` ;
quinze valeurs publiques sont rangées en `secrets` sur trois dépôts.

**Risques à traiter ici** : la clé `service_role` ne doit jamais quitter le
serveur ; le contenu importé est du texte tiers à assainir avant tout rendu ;
les notes en Markdown sont une surface XSS ; les liens de partage doivent être
imprévisibles et révocables.

## Ce que je ne sais pas

- Si des fichiers `.riv` seront fournis — **je ne sais pas.** Les composants et
  les replis seront livrés ; aucune animation ne sera inventée.
- Quel projet Supabase héberge cette application, et quels fournisseurs OAuth y
  sont autorisés — **je ne sais pas.**
- Si les sessions anonymes sont activées sur ce projet — **je ne sais pas**, et
  la transformation d'une session invitée en compte persistant ne sera pas
  déclarée fonctionnelle avant d'avoir été testée.
- Si les informations de la page sont exactes — **je ne sais pas.** Wikipédia
  est collaborative, et l'application ne prétendra pas le contraire.

## Vérifications exécutées, et leur résultat réel

| Commande                                    | Résultat                                              |
| ------------------------------------------- | ----------------------------------------------------- |
| `gh repo view mister-guiiug/dev-pwa-config` | **échec** — le dépôt n'existe pas (prémisse corrigée) |
| lecture de `package.json` du socle          | 3.34.0, 148 exports, 0 dépendance de production       |
| `api.php action=query prop=revisions`       | pageid 17479409, revid 239179934                      |
| `api.php meta=siteinfo siprop=rightsinfo`   | CC BY-SA 4.0                                          |
| `api.php action=parse prop=sections         | wikitext`                                             | 15 sections ; structures de candidats, épisodes et votes lues |
| `supabase --version`                        | 2.111.0                                               |
| `supabase init`                             | réussi — Postgres 17, schéma `public` exposé          |
| `supabase start`                            | **échec** — démon Docker non démarré sur le poste     |
| Application des migrations                  | **non faite**, faute de base locale                   |
