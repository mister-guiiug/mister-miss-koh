/**
 * L'état de l'application. Deux natures de données, deux traitements :
 *
 *  - le RÉFÉRENTIEL vient du port `backend.referential`, avec son ORIGINE
 *    (serveur, cache, démonstration) ; il n'est jamais modifié ici ;
 *  - les DONNÉES PERSONNELLES (préférences, épisodes vus, favoris) vivent dans
 *    un magasin versionné du socle, validé par zod au chargement. Privées par
 *    défaut, elles ne quittent pas l'appareil tant qu'aucun compte n'existe.
 *
 * Les sélecteurs restent PLATS : pas de `filter`/`map` dans un sélecteur
 * zustand — chaque rendu produirait un tableau neuf et relancerait le rendu
 * (boucle `useSyncExternalStore`, écran blanc). Les dérivations vivent dans
 * `domain/`, appelées depuis les composants avec `useMemo`.
 */
import { create } from 'zustand';
import { z } from 'zod';
import { createVersionedStore } from '@mister-guiiug/dev-pwa-config/versioned-store';
import type { Referential } from '../domain/referential';
import type { SpoilerMode } from '../domain/spoiler';
import { backend, type Origin } from '../backend/referentialRepository';

const PersonalSchema = z.object({
  spoiler: z.enum(['reveal_all', 'hide_unwatched', 'hide_future']),
  animations: z.boolean(),
  reduceMotion: z.boolean(),
  watched: z.array(z.number().int().positive()),
  favorites: z.array(z.string()),
});

type Personal = z.infer<typeof PersonalSchema>;

const personalStore = createVersionedStore<Personal>({
  store: 'koh',
  key: 'personal',
  version: 1,
  validate: data => PersonalSchema.parse(data),
  seed: () => ({
    // Le défaut le plus sûr : ne rien révéler au-delà de ce qui est marqué vu.
    spoiler: 'hide_unwatched',
    animations: true,
    reduceMotion: false,
    watched: [],
    favorites: [],
  }),
});

interface AppState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  referential: Referential | null;
  origin: Origin | null;
  notice: string | null;
  spoiler: SpoilerMode;
  animations: boolean;
  reduceMotion: boolean;
  watched: readonly number[];
  favorites: readonly string[];
  init(): Promise<void>;
  reload(): Promise<void>;
  setSpoiler(mode: SpoilerMode): void;
  setAnimations(enabled: boolean): void;
  setReduceMotion(enabled: boolean): void;
  toggleWatched(episodeNumber: number): void;
  toggleFavorite(contestantId: string): void;
}

export const useAppStore = create<AppState>((set, get) => {
  const persist = () => {
    const { spoiler, animations, reduceMotion, watched, favorites } = get();
    personalStore.save({
      spoiler,
      animations,
      reduceMotion,
      watched: [...watched],
      favorites: [...favorites],
    });
  };

  const load = async () => {
    set({ loading: true });
    try {
      const { referential, origin, notice } = await backend.referential.load();
      set({
        referential,
        origin,
        notice: notice ?? null,
        ready: true,
        error: null,
      });
    } catch (error) {
      set({
        ready: true,
        error: error instanceof Error ? error.message : 'référentiel illisible',
      });
    } finally {
      set({ loading: false });
    }
  };

  return {
    ready: false,
    loading: false,
    error: null,
    referential: null,
    origin: null,
    notice: null,
    ...personalStore.load(),

    async init() {
      if (get().ready) return;
      await load();
    },

    reload: load,

    setSpoiler(mode) {
      set({ spoiler: mode });
      persist();
    },
    setAnimations(enabled) {
      set({ animations: enabled });
      persist();
    },
    setReduceMotion(enabled) {
      set({ reduceMotion: enabled });
      persist();
    },
    toggleWatched(episodeNumber) {
      const current = get().watched;
      set({
        watched: current.includes(episodeNumber)
          ? current.filter(n => n !== episodeNumber)
          : [...current, episodeNumber].sort((a, b) => a - b),
      });
      persist();
    },
    toggleFavorite(contestantId) {
      const current = get().favorites;
      set({
        favorites: current.includes(contestantId)
          ? current.filter(id => id !== contestantId)
          : [...current, contestantId],
      });
      persist();
    },
  };
});
