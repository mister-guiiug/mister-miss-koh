/**
 * L'état de l'application. Deux natures de données, deux traitements :
 *
 *  - le RÉFÉRENTIEL vient du port `backend.referential`, avec son ORIGINE
 *    (serveur, cache, démonstration) ; il n'est jamais modifié ici ;
 *  - les DONNÉES PERSONNELLES (préférences, épisodes vus, favoris) vivent dans
 *    un magasin versionné du socle, validé par zod au chargement. Privées par
 *    défaut, elles ne quittent pas l'appareil tant qu'aucun compte n'existe.
 *
 * LE MAGASIN LOCAL RESTE LA RÉFÉRENCE, MÊME CONNECTÉ. Quand un compte existe,
 * `usePersonalSync` attache un RELAIS (`attachPersonalRemote`) : chaque bascule
 * s'écrit ici d'abord, puis part au serveur. Un relais absent — pas de compte,
 * référentiel de démonstration — ou un envoi en échec ne change rien à ce que
 * l'écran affiche. L'application reste entière sans compte ; c'est une
 * propriété du parc, pas une tolérance.
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
import { isWatched, type SpoilerMode } from '../domain/spoiler';
import {
  type GuessRefusal,
  orderedMembers,
  type PairGuess,
  PairGuessSchema,
  refuseGuess,
} from '../domain/pairing';
import {
  backend,
  DEFAULT_SEASON_SLUG,
  type Origin,
  type SeasonOption,
} from '../backend/referentialRepository';
import {
  CONTESTANT_FILTERS,
  DEFAULT_CONTESTANT_FILTER,
  type ContestantFilter,
} from '../domain/contestantFilter';
import { fetchReferential } from '../shared/queries/referential';
import { synchroniserApercu } from '../shared/queries/apercu';

const PersonalSchema = z.object({
  spoiler: z.enum(['reveal_all', 'hide_unwatched', 'hide_future']),
  animations: z.boolean(),
  reduceMotion: z.boolean(),
  /**
   * La saison regardée. Seize sont publiées ; celle-ci est celle que les
   * écrans affichent, et elle survit à un rechargement.
   */
  season: z.string().default(DEFAULT_SEASON_SLUG),
  /**
   * LES ÉPISODES VUS, PAR SAISON.
   *
   * Une liste unique de NUMÉROS ne pouvait pas survivre au choix de la
   * saison : « vu jusqu'au 5 » d'All Stars serait devenu « vu jusqu'au 5 » de
   * Malaisie, et la synchronisation l'aurait remonté au serveur comme tel. Les
   * favoris, eux, sont des identifiants — ils ne se confondent pas d'une
   * saison à l'autre et n'ont rien à changer.
   */
  watchedBySeason: z
    .record(z.string(), z.array(z.number().int().positive()))
    .default({}),
  favorites: z.array(z.string()),
  /**
   * Les duos supposés par l'utilisateur — jamais ceux de la source.
   *
   * `default` plutôt qu'une migration : un magasin écrit avant ce champ se
   * valide encore, et repart simplement sans aucune supposition. Une version
   * de plus n'apporterait ici qu'une chaîne de migrations à maintenir.
   */
  pairGuesses: z.array(PairGuessSchema).default([]),
  /**
   * Le filtre de la liste des candidats, retenu d'une visite à l'autre.
   *
   * Meme `default` que pour les duos supposes : un magasin ecrit avant ce
   * champ se valide encore, et repart sur « En jeu » — le defaut voulu pour
   * tout le monde, pas seulement pour les nouveaux venus.
   */
  contestantFilter: z
    .enum(CONTESTANT_FILTERS)
    .default(DEFAULT_CONTESTANT_FILTER),
  /**
   * Les portraits qui ATTENDENT leur tour d'être confiés pour un jour.
   *
   * Le serveur ne porte que cinq liens vivants par compte : le reste attend
   * ici, et repart à la place suivante qui se libère. La file doit donc
   * survivre à un rechargement — sans elle, fermer l'onglet perdrait la suite
   * de la tournée et il faudrait tout recommencer.
   */
  portraitQueue: z.array(z.string()).default([]),
  /**
   * Un mot par candidat, sur cet appareil, sans compte.
   *
   * Les notes du serveur restent les notes. Ceci est le premier avis, du même
   * ordre que les favoris : il ne part pas, et un compte ne l'efface pas.
   */
  jots: z.record(z.string(), z.string().max(280)).default({}),
  /**
   * La première ouverture a été faite — ou écartée. Même `default` que les
   * champs précédents : un magasin plus ancien se valide encore, et l'accueil
   * ne la propose qu'à qui n'a encore rien coché.
   */
  onboarded: z.boolean().default(false),
  /**
   * Le nombre d'épisodes à rattraper sur l'icône de l'app installée. Un
   * nombre d'épisodes, jamais ce qui s'y passe ; décochable dans les Réglages.
   */
  appBadge: z.boolean().default(true),
  /**
   * La saison dont l'utilisateur a demandé à voir la version NON VALIDÉE
   * (migration 0039), sur cet appareil. Le choix tombe de lui-même dès que
   * plus rien n'attend pour cette saison : il vaut pour une attente, pas
   * pour toujours. Même `default` que les champs précédents.
   */
  apercuSaison: z.string().nullable().default(null),
});

type Personal = z.infer<typeof PersonalSchema>;

/**
 * Le relais vers le compte, dans les clés du MAGASIN (numéro d'épisode,
 * identifiant de participation) — le magasin ne sait rien des uuid du serveur,
 * et n'a pas à l'apprendre.
 *
 * Les deux méthodes ne rendent rien : un envoi en échec ne doit pas défaire un
 * geste déjà accompli à l'écran. C'est l'appelant (`usePersonalSync`) qui
 * avale l'erreur et décide s'il faut en dire quelque chose.
 */
export interface PersonalRemote {
  favorite(contestantId: string, on: boolean): void;
  watched(episodeNumber: number, on: boolean): void;
}

const GRAINE: Personal = {
  // Le défaut le plus sûr : ne rien révéler au-delà de ce qui est marqué vu.
  spoiler: 'hide_unwatched',
  animations: true,
  reduceMotion: false,
  season: DEFAULT_SEASON_SLUG,
  watchedBySeason: {},
  favorites: [],
  pairGuesses: [],
  contestantFilter: DEFAULT_CONTESTANT_FILTER,
  portraitQueue: [],
  jots: {},
  onboarded: false,
  appBadge: true,
  apercuSaison: null,
};

const personalStore = createVersionedStore<Personal>({
  store: 'koh',
  key: 'personal',
  version: 2,
  migrations: {
    /**
     * 1 → 2 : le suivi devient propre à chaque saison.
     *
     * Ce qui était suivi l'a été sur la seule saison que l'application
     * montrait — celle par défaut. On le lui attribue, plutôt que de le jeter
     * ou de le rendre valable partout.
     */
    1: data => {
      const avant = data as { watched?: number[] };
      const { watched, ...reste } = { watched: [], ...avant };
      return {
        ...reste,
        season: DEFAULT_SEASON_SLUG,
        watchedBySeason: { [DEFAULT_SEASON_SLUG]: watched },
      };
    },
  },
  validate: data => PersonalSchema.parse(data),
  seed: () => GRAINE,
});

interface AppState {
  /** Le premier chargement est terminé, réussi ou non : l'attente peut cesser. */
  ready: boolean;
  /** Un chargement est en cours — le premier comme un rechargement. */
  loading: boolean;
  /**
   * Le message du DERNIER chargement en échec, effacé par le suivant qui
   * réussit. Il ne dit pas s'il y a quelque chose à montrer : c'est
   * `referential` qui le dit. Sans référentiel, c'est le premier chargement
   * qui a échoué et l'écran bloque (App) ; avec, c'est un rechargement, la
   * lecture précédente reste affichée et l'échec se signale — toast de
   * `useRefreshReferential`, avis des Réglages.
   */
  error: string | null;
  /**
   * La dernière lecture réussie. Un échec ne l'efface jamais. Quand
   * l'utilisateur a demandé la version non validée, c'est elle : `apercu`
   * garde alors la version publiée à côté.
   */
  referential: Referential | null;
  /**
   * La version NON VALIDÉE est affichée à la place de la publiée : sa
   * révision Wikipédia, et la version publiée qu'elle remplace à l'écran.
   * Jamais persistée, jamais mise en cache.
   */
  apercu: { revision: string; publie: Referential } | null;
  /**
   * La révision dont un aperçu non validé est prêt pour la saison courante,
   * ou `null` : c'est ce qui fait proposer « Afficher la version non
   * validée ».
   */
  apercuDisponible: string | null;
  apercuSaison: string | null;
  /** La saison regardée, et celles qu'on peut choisir. */
  season: string;
  watchedBySeason: Readonly<Record<string, readonly number[]>>;
  seasons: readonly SeasonOption[];
  /** D'où vient `referential`, et ce qu'il faut en dire : de la même lecture. */
  origin: Origin | null;
  notice: string | null;
  spoiler: SpoilerMode;
  animations: boolean;
  reduceMotion: boolean;
  watched: readonly number[];
  favorites: readonly string[];
  /** Les duos SUPPOSÉS, sur cet appareil. Le référentiel, lui, ne bouge pas. */
  pairGuesses: readonly PairGuess[];
  /** Le filtre de la liste des candidats, retenu d'une visite à l'autre. */
  contestantFilter: ContestantFilter;
  /** Les portraits qui attendent une place libre pour être confiés. */
  portraitQueue: readonly string[];
  jots: Readonly<Record<string, string>>;
  onboarded: boolean;
  appBadge: boolean;
  init(): Promise<void>;
  setJot(contestantId: string, text: string): void;
  reload(options?: { manual?: boolean }): Promise<void>;
  setSpoiler(mode: SpoilerMode): void;
  setAnimations(enabled: boolean): void;
  setReduceMotion(enabled: boolean): void;
  setContestantFilter(filter: ContestantFilter): void;
  setPortraitQueue(ids: readonly string[]): void;
  toggleWatched(episodeNumber: number): void;
  /**
   * « J'en suis à l'épisode N » : tout ce qui précède est vu, rien après.
   * `0` = rien de vu. Le geste de la première ouverture et du lecteur d'un
   * partage, qui répondent à « où en êtes-vous ? » sans cocher une à une.
   */
  setWatchedUpTo(episodeNumber: number): void;
  /** Remet le suivi tel qu'il était — l'« Annuler » d'une cascade de coches. */
  restoreWatched(watched: readonly number[]): void;
  setOnboarded(done: boolean): void;
  /** Affiche la version non validée de la saison courante, sur cet appareil. */
  accepterApercu(): Promise<void>;
  /** Revient à la version publiée, et oublie la demande. */
  quitterApercu(): void;
  setAppBadge(enabled: boolean): void;
  /**
   * Change de saison : le suivi de celle qu'on quitte est mis de côté, celui
   * de celle qu'on prend revient, et le référentiel se recharge.
   */
  setSeason(slug: string): void;
  /** Va chercher les saisons publiées. Silencieuse en cas d'échec. */
  loadSeasons(): Promise<void>;
  toggleFavorite(contestantId: string): void;
  /**
   * Branche (ou débranche) le compte. `null` = cet appareil, seul — l'état par
   * défaut, et celui de la déconnexion.
   */
  attachPersonalRemote(remote: PersonalRemote | null): void;
  /**
   * Remplace le suivi par le résultat de la fusion appareil + compte.
   *
   * Écrit dans le magasin local AUSSI : ce qui vient du compte devient le repli
   * hors ligne de cet appareil. Aucun envoi n'est déclenché — la fusion vient
   * justement du serveur.
   */
  setPersonal(next: {
    watched: readonly number[];
    favorites: readonly string[];
  }): void;
  /**
   * Suppose un duo, ou dit pourquoi il est refusé.
   *
   * La LIMITE ANTI-SPOILER vient de l'appelant : elle dépend de la date du
   * jour, que le magasin n'a pas à connaître, et c'est elle qui décide si la
   * source « a déjà nommé » un binôme.
   */
  guessPair(a: string, b: string, limit: number): GuessRefusal | null;
  /** Oublie la supposition qui nomme ce candidat, s'il y en a une. */
  forgetPairGuess(contestantId: string): void;
}

export const useAppStore = create<AppState>((set, get) => {
  /**
   * Hors de l'état : le relais n'est pas une donnée d'écran, et le mettre dans
   * l'état ferait rendre à nouveau tous les abonnés à chaque connexion.
   */
  let remote: PersonalRemote | null = null;

  const initial: Personal = personalStore.load() ?? GRAINE;

  const persist = () => {
    const {
      spoiler,
      animations,
      reduceMotion,
      season,
      watched,
      watchedBySeason,
      favorites,
      pairGuesses,
      contestantFilter,
      portraitQueue,
      jots,
      onboarded,
      appBadge,
      apercuSaison,
    } = get();
    personalStore.save({
      spoiler,
      animations,
      reduceMotion,
      season,
      // `watched` est le suivi de la saison COURANTE ; la carte porte les
      // autres. On les réunit au moment d'écrire, pas avant.
      watchedBySeason: Object.fromEntries(
        Object.entries({ ...watchedBySeason, [season]: watched }).map(
          ([saison, numeros]) => [saison, [...numeros]]
        )
      ),
      favorites: [...favorites],
      pairGuesses: [...pairGuesses],
      contestantFilter,
      portraitQueue: [...portraitQueue],
      jots: { ...jots },
      onboarded,
      appBadge,
      apercuSaison,
    });
  };

  /**
   * Écrit le suivi, et n'envoie au compte QUE CE QUI A CHANGÉ. Réémettre tout
   * l'ensemble à chaque geste ferait autant d'écritures que d'épisodes.
   */
  const applyWatched = (next: readonly number[]) => {
    const current = get().watched;
    const sorted = [...new Set(next)].sort((a, b) => a - b);
    set({ watched: sorted });
    persist();
    const avant = new Set(current);
    const apres = new Set(sorted);
    for (const n of sorted) if (!avant.has(n)) remote?.watched(n, true);
    for (const n of current) if (!apres.has(n)) remote?.watched(n, false);
  };

  /**
   * Lecture via TanStack Query (`fetchReferential`) : cache réseau dédupliqué,
   * miroir Zustand inchangé pour les écrans. `force` pour un reload explicite
   * (suivi de version, rattrapage, geste manuel).
   */
  const load = (options?: { manual?: boolean; force?: boolean }) =>
    fetchReferential(options);

  return {
    ready: false,
    loading: false,
    error: null,
    referential: null,
    apercu: null,
    apercuDisponible: null,
    origin: null,
    notice: null,
    ...initial,
    // DÉRIVÉ, PAS PERSISTÉ : les écrans lisent `watched` sans savoir qu'il
    // existe une carte derrière.
    watched: initial.watchedBySeason[initial.season] ?? [],
    seasons: [],

    async init() {
      if (get().ready) return;
      await load();
    },

    // Toujours forcer : un reload explicite ne doit pas servir un cache Query
    // encore frais (suivi de version, rattrapage réseau, bouton Réglages).
    reload: options => load({ ...options, force: true }),

    async accepterApercu() {
      const { season, apercu, referential } = get();
      set({ apercuSaison: season });
      persist();
      const publie = apercu?.publie ?? referential;
      if (publie) await synchroniserApercu(publie);
    },

    quitterApercu() {
      const { apercu } = get();
      set({
        apercuSaison: null,
        apercu: null,
        ...(apercu ? { referential: apercu.publie } : {}),
      });
      persist();
    },

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
    setContestantFilter(filter) {
      set({ contestantFilter: filter });
      persist();
    },
    setPortraitQueue(ids) {
      set({ portraitQueue: [...ids] });
      persist();
    },
    setJot(contestantId, text) {
      const trimmed = text.trim().slice(0, 280);
      const jots = { ...get().jots };
      if (trimmed) jots[contestantId] = trimmed;
      else delete jots[contestantId];
      set({ jots });
      persist();
    },
    toggleWatched(episodeNumber) {
      // COCHER L'ÉPISODE 5, C'EST DIRE « J'EN SUIS LÀ » — donc les quatre
      // premiers sont vus aussi. Décocher le 3 dit l'inverse : on n'en est plus
      // qu'au 2, et ce qui vient après ne l'est plus. Le suivi reste un
      // ENSEMBLE de numéros (c'est ce que le serveur stocke, une ligne par
      // épisode), mais cet ensemble est désormais toujours un début de saison.
      const current = get().watched;
      const on = !isWatched(episodeNumber, current);
      const connus = get().referential?.episodes.map(e => e.number) ?? [];
      const retenus = new Set(
        connus.filter(n => (on ? n <= episodeNumber : n < episodeNumber))
      );
      // Un référentiel plus ancien que le geste ne doit pas avaler l'épisode
      // qu'on vient de cocher.
      if (on) retenus.add(episodeNumber);
      applyWatched([...retenus]);
    },
    setWatchedUpTo(episodeNumber) {
      const connus = get().referential?.episodes.map(e => e.number) ?? [];
      const retenus = new Set(connus.filter(n => n <= episodeNumber));
      if (episodeNumber >= 1) retenus.add(episodeNumber);
      applyWatched([...retenus]);
    },
    restoreWatched(watched) {
      applyWatched(watched);
    },
    setOnboarded(done) {
      set({ onboarded: done });
      persist();
    },
    setAppBadge(enabled) {
      set({ appBadge: enabled });
      persist();
    },
    setSeason(slug) {
      const { season, watched, watchedBySeason } = get();
      if (slug === season) return;
      // LE SUIVI DE LA SAISON QU'ON QUITTE EST MIS DE CÔTÉ, pas perdu : on y
      // revient souvent, et retrouver « vu jusqu'au 5 » est le moindre dû.
      const carte = { ...watchedBySeason, [season]: [...watched] };
      set({
        season: slug,
        watchedBySeason: carte,
        watched: carte[slug] ?? [],
        // L'aperçu est celui d'UNE saison : il ne suit pas le changement.
        apercu: null,
        apercuDisponible: null,
      });
      persist();
      // Nouvelle saison = nouvelle clé Query, mais on force quand même pour
      // ne pas resservir un cache encore frais si on revient sur une saison.
      void load({ force: true });
    },

    async loadSeasons() {
      const seasons = await backend.referential.listSeasons();
      set({ seasons });
    },

    toggleFavorite(contestantId) {
      const current = get().favorites;
      const on = !current.includes(contestantId);
      set({
        favorites: on
          ? [...current, contestantId]
          : current.filter(id => id !== contestantId),
      });
      persist();
      remote?.favorite(contestantId, on);
    },
    attachPersonalRemote(next) {
      remote = next;
    },
    setPersonal(next) {
      set({
        watched: [...next.watched].sort((a, b) => a - b),
        favorites: [...next.favorites],
      });
      persist();
    },
    guessPair(a, b, limit) {
      const { referential, pairGuesses } = get();
      if (!referential) return 'candidat-inconnu';
      const refusal = refuseGuess(referential, pairGuesses, limit, a, b);
      if (refusal) return refusal;
      // Une supposition CONTREDITE par la source ne tient plus personne, mais
      // elle traîne encore ici : supposer à nouveau la remplace, sinon les
      // deux cohabiteraient et l'écran citerait la périmée.
      const kept = pairGuesses.filter(
        g => !g.memberIds.includes(a) && !g.memberIds.includes(b)
      );
      set({ pairGuesses: [...kept, { memberIds: orderedMembers(a, b) }] });
      persist();
      return null;
    },
    forgetPairGuess(contestantId) {
      const current = get().pairGuesses;
      const next = current.filter(g => !g.memberIds.includes(contestantId));
      if (next.length === current.length) return;
      set({ pairGuesses: next });
      persist();
    },
  };
});
