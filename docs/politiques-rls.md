# Politiques RLS

Migration : [`supabase/migrations/0004_rls.sql`](../supabase/migrations/0004_rls.sql),
corrigée et complétée par [`0021_partage_des_notes.sql`](../supabase/migrations/0021_partage_des_notes.sql).
Tests : [`supabase/tests/rls.test.sql`](../supabase/tests/rls.test.sql) — le
partage et les notes — et
[`supabase/tests/personnel.test.sql`](../supabase/tests/personnel.test.sql) — le
suivi et l'annulation —, lancés par `supabase test db`.

> `rls.test.sql` et `publication.test.sql` ont été **exécutés contre la base
> hébergée**, sans Docker. `personnel.test.sql` (17 assertions, 06/09/2026) est
> **écrit et non joué** : le jeton disponible sur le poste ne voit plus le
> projet. Voir [Exécution](#exécution).

## Le principe : deux verrous, pas un

Les droits SQL sont **retirés à tout le monde**, puis redonnés table par table :

```sql
revoke all on all tables in schema public from anon, authenticated;
```

Les politiques viennent **en plus**. Une politique mal écrite ne suffit donc
pas à ouvrir une table : il faudrait s'être trompé aussi de `grant`. C'est la
seule protection qui survive à une erreur de politique — et les erreurs de
politique sont la façon normale de se tromper.

## Ce que chaque rôle peut faire

| Table                                   | `anon`                               | `authenticated`               | Écriture                           |
| --------------------------------------- | ------------------------------------ | ----------------------------- | ---------------------------------- |
| Référentiel (16 tables)                 | lecture du publié                    | lecture du publié             | **aucune** — serveur seul          |
| `reference_sources`, `source_documents` | lecture                              | lecture                       | aucune                             |
| `referential_versions`                  | lecture                              | lecture                       | aucune                             |
| Pipeline d'import                       | —                                    | lecture **si `is_staff()`**   | par fonction (`review_difference`) |
| `public_import_status`                  | lecture                              | lecture                       | —                                  |
| `profiles`                              | lecture des publics                  | + le sien en entier           | le sien                            |
| Préférences, favoris, vus, notations    | —                                    | les siens                     | les siens                          |
| `personal_notes`                        | lecture des publiques non brouillons | + les siennes                 | les siennes                        |
| `share_links`                           | —                                    | les siens                     | les siens (quota 20/h)             |
| `user_roles`                            | —                                    | les siens, en lecture         | **aucune**                         |
| `audit_events`                          | —                                    | les siens, ou tous si `admin` | par fonction (`log_event`)         |

**Le référentiel n'a pas une seule politique d'écriture** — pas même pour un
administrateur. Les imports passent par la clé `service_role`, qui ne quitte
jamais le serveur.

## Trois décisions qui méritent leur explication

### `FORCE ROW LEVEL SECURITY` est écarté, volontairement

Il paraît plus sûr : il soumet **aussi** le propriétaire des tables aux
politiques. C'est exactement ce qui le rend inutilisable ici.

Une fonction `security definer` s'exécute avec le rôle de son propriétaire,
c'est-à-dire celui des tables. Sous `force`, elle redevient soumise aux
politiques de l'appelant et ne peut donc **rien lire de plus que lui**. Or tout
le modèle de partage en dépend : lire une note par jeton, vérifier qu'un
identifiant public est libre, agréger l'état d'un import. Chacune rendrait un
résultat vide — **silencieusement**, ce qui est la pire des pannes.

Ce que `force` protégerait — une connexion directe sous le rôle propriétaire —
n'arrive pas par l'API : PostgREST se connecte en `authenticator` puis bascule
en `anon`, `authenticated` ou `service_role`.

### Le partage par lien passe par une fonction, jamais par une politique

Une politique capable d'accepter un jeton devrait le lire quelque part, donc
rendre `share_links` lisible — la table deviendrait **énumérable** et les liens
« secrets » ne le seraient plus.

Les partages sont donc servis par `get_shared_note(token)` et
`get_shared_profile(token)`, qui valident le jeton, refusent ce qui est révoqué
ou expiré, **et choisissent les colonnes rendues**. C'est un point que les
politiques ne savent pas faire : la RLS filtre des **lignes**, pas des
**colonnes**. Rendre une ligne lisible, c'est la rendre lisible en entier.

Corollaire assumé dans le schéma : **`profiles` ne contient aucune adresse
électronique**. Elle reste dans `auth.users`, hors de portée de l'API publique.
La protection est structurelle, pas déclarative — on ne peut pas oublier une
politique sur une colonne qui n'existe pas.

### Les politiques s'additionnent — une lecture doit le savoir

Deux politiques de lecture cohabitent sur `personal_notes` : « les miennes » et
« les notes publiques non brouillons ». Elles sont **permissives**, donc
combinées par **OU**. Un `select` sans clause `user_id` rend par conséquent
aussi les notes publiques des **autres comptes**.

Ce n'est pas une fuite : une note publique **est** publique, et c'est
exactement ce qu'on lui demande. C'est en revanche un piège pour l'appelant —
un écran intitulé « Notes » qui lit sans filtrer afficherait les notes
d'inconnus. `src/backend/notes.ts` filtre donc sur `user_id`, et le § 2 bis de
`rls.test.sql` fige le comportement du serveur (« sans filtre, A voit AUSSI la
note publique de B »). Sans cette assertion, retirer le filtre ne casserait
rien de visible ici, et le défaut ne se verrait qu'en production, le jour où
quelqu'un publierait une note.

### Un jeton inconnu, révoqué ou expiré rend le **même** message

`lien de partage introuvable ou expiré`, dans les trois cas. Les distinguer
apprendrait à un curieux qu'un jeton a existé — ce qui transforme une
énumération sans intérêt en source d'information.

## Ce que les tests prouvent

Vingt-quatre assertions, dont les huit qui comptent :

1. un utilisateur B ne voit **aucune** note de A, même en la nommant par son
   identifiant ;
2. B ne voit pas non plus une note partagée par lien, **tant qu'il ne présente
   pas le jeton** ;
3. les tentatives de modification et de suppression par B laissent la note de A
   intacte — vérifié **depuis A**, parce qu'une écriture bloquée par la RLS
   n'échoue pas, elle ne touche rien, en silence ;
4. B ne peut pas énumérer les liens de partage de A ;
5. la révocation et l'expiration prennent effet **à la requête suivante** ;
6. un utilisateur ne peut pas s'attribuer un rôle ;
7. le référentiel non publié reste invisible, et le publié n'est modifiable par
   personne ;
8. une lecture **sans filtre** rapporte aussi la note publique d'un autre
   compte — la limite est réelle, elle est écrite, et c'est le client qui la
   traite.

`personnel.test.sql` en ajoute **dix-sept**, sur ce que `rls.test.sql` ne dit
pas — et sans une ligne de SQL nouvelle : les tables et les politiques qu'il
interroge existent depuis 0003 et 0004, personne n'avait jamais vérifié
qu'elles tiennent.

1. le **nombre** de politiques permissives de lecture de chaque table
   personnelle : une pour `user_favorites` et `watched_episodes`, deux pour
   `personal_notes`. C'est ce chiffre qui rend une lecture sans clause
   `user_id` sûre sur les deux premières ; le jour où quelqu'un ajoutera « les
   favoris d'un profil public », le fichier tombe **avant** la production, et
   non le jour où quelqu'un rendra son profil visible ;
2. **vu sur A, lu sur B.** Le serveur ne connaît pas les appareils : deux
   appareils du même compte sont deux sessions portant le même `sub`. Ce que A
   écrit, une session de A le lit ; une session de B ne le lit pas, ne peut pas
   l'écrire au nom de A, et sa tentative de suppression est constatée **depuis
   A** — parce qu'une suppression bloquée par la RLS ne lève pas, elle ne
   touche rien, en silence ;
3. **supprimer puis annuler.** Une note supprimée devient invisible à son
   propre auteur, et il peut malgré tout la restaurer, avec son contenu
   intact : la politique de lecture porte `deleted_at is null`, celle de mise à
   jour non. C'est ce qui rend l'annulation possible sans toucher à la base —
   et c'est aussi pourquoi il n'y a pas de corbeille : lister ses supprimées
   demanderait une politique de lecture de plus, donc une politique
   **permissive** de plus, combinée par OU avec les autres.

## Exécution

`supabase test db` exige Docker — `pg_prove` tourne en conteneur — et Docker ne
démarre pas sur le poste de développement. Le fichier se joue donc **contre la
base liée** par `npm run test:rls:remote` (`scripts/pgtap-remote.mjs`) : chaque
assertion est réécrite pour déposer son verdict dans une table temporaire, que
la dernière requête renvoie d'un bloc — `supabase db query` ne rend que le
dernier jeu de lignes. Même fichier, même plan, même `rollback`.

Le 05/09/2026, contre le projet hébergé `oqldfzrsandcguajyxbh` : **24
assertions sur 24** passent, et **39 sur 39** pour la publication
transactionnelle (`npm run test:publication:remote`). Deux faits vérifiés au passage : pgTAP enregistre
ses verdicts sous `set role anon` sans droit supplémentaire ; la table de
collecte, elle, appartient à `postgres` et doit être ouverte aux rôles de
l'API.

> **`personnel.test.sql` n'a pas pu être joué** (06/09/2026).
> `npm run test:personnel:remote` s'arrête sur
> `403 — Your account does not have the necessary privileges` : le jeton
> disponible sur le poste ne voit qu'un autre projet du parc, pas
> `oqldfzrsandcguajyxbh`. Ses dix-sept assertions sont donc **écrites et non
> jouées**, et elles n'attendent aucune migration — tout ce qu'elles
> interrogent est déjà en ligne.
>
> Deux façons de les jouer : `npm run test:personnel:remote` avec un
> `SUPABASE_ACCESS_TOKEN` qui voit le projet, ou — mieux, parce que c'est le
> seul endroit où les migrations s'exécutent vraiment — le réutilisable
> `pwa-supabase-test.yml` du socle, sur une pile jetable, que ce dépôt
> **n'appelle pas encore**.

## L'identité qui a publié

La première publication devait porter un nom : `publish_run` vérifie
`is_staff()`, et `user_roles.user_id` référence `auth.users`. Une identité de
service a donc été créée en SQL, le 05/09/2026 :

| Champ    | Valeur                                         |
| -------- | ---------------------------------------------- |
| `id`     | `00000000-0000-4000-8000-000000000001`         |
| courriel | `publication-initiale@mister-miss-koh.invalid` |
| rôle     | `admin`                                        |

**Ce n'est pas un compte.** Pas de mot de passe, pas d'adresse joignable — le
domaine `.invalid` est réservé et ne peut recevoir aucun courrier. Personne ne
peut obtenir de jeton pour elle. Elle existe pour deux raisons : satisfaire la
clé étrangère, et faire qu'une publication soit attribuée à quelqu'un dans
`audit_events`, `import_differences.reviewed_by` et
`publications.published_by`.

Elle n'est **pas** dans une migration, délibérément : une identité privilégiée
inscrite dans le dépôt serait publiée avec lui. Quand un vrai relecteur aura un
compte, lui donner son rôle se fera de la même façon, en SQL — la table refuse
toute écriture par l'API, quelle que soit la clé.

## Ce qui reste à faire

_(Les fonctions de publication `publish_run` et `revert_publication` sont
écrites, testées et appliquées — voir
[pipeline-wikipedia.md](./pipeline-wikipedia.md). Elles vérifient `is_staff()`
elles-mêmes : donner leur exécution à `authenticated` n'ouvre qu'un refus
poli.)_

- La limitation de fréquence sur la création de notes, si l'usage la réclame ;
  seuls les liens de partage sont plafonnés aujourd'hui (vingt par heure).
- La suppression de compte côté interface. La cascade est en place dans le
  schéma ; le parcours ne l'est pas.
