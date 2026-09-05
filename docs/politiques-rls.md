# Politiques RLS

Migration : [`supabase/migrations/0004_rls.sql`](../supabase/migrations/0004_rls.sql).
Tests : [`supabase/tests/rls.test.sql`](../supabase/tests/rls.test.sql), lancés
par `supabase test db`.

> **Tous exécutés contre la base hébergée** le 05/09/2026, sans Docker :
> 22 assertions sur 22 pour l'isolation, 39 sur 39 pour la publication. Voir
> [Exécution](#exécution).

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

### Un jeton inconnu, révoqué ou expiré rend le **même** message

`lien de partage introuvable ou expiré`, dans les trois cas. Les distinguer
apprendrait à un curieux qu'un jeton a existé — ce qui transforme une
énumération sans intérêt en source d'information.

## Ce que les tests prouvent

Vingt-deux assertions, dont les sept qui comptent :

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
   personne.

## Exécution

`supabase test db` exige Docker — `pg_prove` tourne en conteneur — et Docker ne
démarre pas sur le poste de développement. Le fichier se joue donc **contre la
base liée** par `npm run test:rls:remote` (`scripts/pgtap-remote.mjs`) : chaque
assertion est réécrite pour déposer son verdict dans une table temporaire, que
la dernière requête renvoie d'un bloc — `supabase db query` ne rend que le
dernier jeu de lignes. Même fichier, même plan, même `rollback`.

Le 05/09/2026, contre le projet hébergé `oqldfzrsandcguajyxbh` : **22
assertions sur 22** passent, et **39 sur 39** pour la publication
transactionnelle (`npm run test:publication:remote`). Deux faits vérifiés au passage : pgTAP enregistre
ses verdicts sous `set role anon` sans droit supplémentaire ; la table de
collecte, elle, appartient à `postgres` et doit être ouverte aux rôles de
l'API.

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
