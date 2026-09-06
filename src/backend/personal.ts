/**
 * Ce qui suit le compte : les favoris et les épisodes vus.
 *
 * POURQUOI CE FICHIER EXISTE. L'anti-spoiler est la fonction centrale de
 * l'application, et il vivait entièrement dans le magasin local : marquer un
 * épisode vu sur le téléphone ne protégeait pas la tablette, qui continuait à
 * afficher les éliminés. Les deux tables du serveur — `user_favorites` et
 * `watched_episodes` — existent depuis la migration 0003 et sont fermées à
 * autrui depuis 0004 (§ 5) ; il ne manquait que ce câblage.
 *
 * LE MAGASIN LOCAL RESTE LA RÉFÉRENCE DE L'APPAREIL. Rien ici n'est requis
 * pour que l'application marche : sans compte, sans réseau, ou si le serveur
 * refuse, la lecture et l'écriture continuent en local. La synchronisation est
 * un SUPPLÉMENT, jamais un passage obligé — c'est une propriété du parc, et
 * c'est aussi ce qui permet à la démonstration publique de fonctionner.
 *
 * LA FUSION EST UNE UNION, JAMAIS UN ÉCRASEMENT. À la connexion, ce que
 * l'appareil savait et ce que le compte savait sont réunis. Un « dernier
 * écrivain gagne » effacerait en silence les épisodes vus de l'autre appareil
 * — exactement la perte que ce chantier veut supprimer. Le prix de l'union est
 * connu et assumé : décocher un épisode sur A puis ouvrir B, qui l'avait
 * encore, le remet. Après cette fusion unique, chaque geste part au serveur
 * tel quel, décochage compris.
 *
 * LES IDENTIFIANTS. Le serveur range les vus par identifiant d'épisode (uuid)
 * et les favoris par identifiant de participation (`season_contestants.id`).
 * Le magasin local, lui, garde les épisodes par NUMÉRO depuis toujours. La
 * traduction se fait à la frontière (`usePersonalSync`), avec le référentiel
 * en main : changer le schéma du magasin local aurait imposé une migration de
 * version à tous les appareils, pour un gain nul.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFactory } from './supabaseReferential';

/** Ce que porte un compte, dans les clés du SERVEUR. */
export interface PersonalSnapshot {
  /** `season_contestants.id` */
  readonly favorites: readonly string[];
  /** `episodes.id` */
  readonly watchedEpisodeIds: readonly string[];
}

export const EMPTY_SNAPSHOT: PersonalSnapshot = {
  favorites: [],
  watchedEpisodeIds: [],
};

export interface PersonalRepository {
  /** Ce que le compte sait déjà. */
  pull(): Promise<PersonalSnapshot>;
  /** Ajoute sans retirer : la fusion de connexion, et rien d'autre. */
  push(snapshot: PersonalSnapshot): Promise<void>;
  setFavorite(seasonContestantId: string, on: boolean): Promise<void>;
  setWatched(episodeId: string, on: boolean): Promise<void>;
}

const FavoriteRow = z.object({ season_contestant_id: z.string() });
const WatchedRow = z.object({ episode_id: z.string() });

/**
 * L'union de deux instantanés, sans doublon et sans ordre imposé.
 *
 * Pure et exportée : c'est la seule décision de ce fichier, et elle se teste
 * sans serveur.
 */
export function mergeSnapshots(
  a: PersonalSnapshot,
  b: PersonalSnapshot
): PersonalSnapshot {
  return {
    favorites: [...new Set([...a.favorites, ...b.favorites])],
    watchedEpisodeIds: [
      ...new Set([...a.watchedEpisodeIds, ...b.watchedEpisodeIds]),
    ],
  };
}

/** Ce que l'appareil a en plus du compte — donc ce qu'il faut pousser. */
export function missingFrom(
  server: PersonalSnapshot,
  local: PersonalSnapshot
): PersonalSnapshot {
  const known = new Set(server.favorites);
  const seen = new Set(server.watchedEpisodeIds);
  return {
    favorites: local.favorites.filter(id => !known.has(id)),
    watchedEpisodeIds: local.watchedEpisodeIds.filter(id => !seen.has(id)),
  };
}

export function isEmpty(snapshot: PersonalSnapshot): boolean {
  return (
    snapshot.favorites.length === 0 && snapshot.watchedEpisodeIds.length === 0
  );
}

/** Injectable : les tests passent un client de fantaisie. */
export function createPersonalRepository(
  getClient: () => Promise<SupabaseClient>
): PersonalRepository {
  const fail = (what: string, message: string): never => {
    throw new Error(`${what} : ${message}`);
  };

  const userOf = async (
    supabase: SupabaseClient,
    what: string
  ): Promise<string> => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? fail(what, 'aucune session');
  };

  return {
    /**
     * MES lignes, et le filtre sur `user_id` n'est pas décoratif.
     *
     * Aujourd'hui ces deux tables n'ont qu'UNE politique de lecture, « les
     * miennes » : la RLS suffirait. Mais les politiques permissives se
     * combinent par OU — c'est déjà le cas sur `personal_notes`, où « les
     * miennes » cohabite avec « les publiques » —, et le jour où quelqu'un
     * ajoutera « les favoris d'un profil public », une lecture sans filtre
     * rapporterait ceux des autres dans un écran qui promet les siens. Le
     * fichier `supabase/tests/personnel.test.sql` fige les deux moitiés de
     * cette phrase : une seule politique aujourd'hui, et une lecture sans
     * filtre qui ne rend que les siennes.
     */
    async pull() {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'lecture du suivi');

      const favorites = await supabase
        .from('user_favorites')
        .select('season_contestant_id')
        .eq('user_id', userId);
      if (favorites.error) fail('lecture des favoris', favorites.error.message);

      const watched = await supabase
        .from('watched_episodes')
        .select('episode_id')
        .eq('user_id', userId);
      if (watched.error)
        fail('lecture des épisodes vus', watched.error.message);

      return {
        favorites: (favorites.data ?? []).map(
          row => FavoriteRow.parse(row).season_contestant_id
        ),
        watchedEpisodeIds: (watched.data ?? []).map(
          row => WatchedRow.parse(row).episode_id
        ),
      };
    },

    async push(snapshot) {
      if (isEmpty(snapshot)) return;
      const supabase = await getClient();
      const userId = await userOf(supabase, 'envoi du suivi');

      if (snapshot.favorites.length > 0) {
        // `ignoreDuplicates` : la ligne peut déjà exister (deux onglets, une
        // reprise après coupure). Un conflit de clé primaire n'est pas une
        // erreur, c'est le résultat attendu.
        const { error } = await supabase.from('user_favorites').upsert(
          snapshot.favorites.map(id => ({
            user_id: userId,
            season_contestant_id: id,
          })),
          { ignoreDuplicates: true }
        );
        if (error) fail('envoi des favoris', error.message);
      }

      if (snapshot.watchedEpisodeIds.length > 0) {
        const { error } = await supabase.from('watched_episodes').upsert(
          snapshot.watchedEpisodeIds.map(id => ({
            user_id: userId,
            episode_id: id,
          })),
          { ignoreDuplicates: true }
        );
        if (error) fail('envoi des épisodes vus', error.message);
      }
    },

    async setFavorite(seasonContestantId, on) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'favori');
      if (on) {
        const { error } = await supabase
          .from('user_favorites')
          .upsert(
            { user_id: userId, season_contestant_id: seasonContestantId },
            { ignoreDuplicates: true }
          );
        if (error) fail('favori', error.message);
        return;
      }
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('season_contestant_id', seasonContestantId);
      if (error) fail('favori', error.message);
    },

    async setWatched(episodeId, on) {
      const supabase = await getClient();
      const userId = await userOf(supabase, 'épisode vu');
      if (on) {
        const { error } = await supabase
          .from('watched_episodes')
          .upsert(
            { user_id: userId, episode_id: episodeId },
            { ignoreDuplicates: true }
          );
        if (error) fail('épisode vu', error.message);
        return;
      }
      const { error } = await supabase
        .from('watched_episodes')
        .delete()
        .eq('user_id', userId)
        .eq('episode_id', episodeId);
      if (error) fail('épisode vu', error.message);
    },
  };
}

export const personalRepository = createPersonalRepository(() =>
  supabaseFactory.getClient()
);
