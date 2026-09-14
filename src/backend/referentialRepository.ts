/**
 * Le port du référentiel, et ses adaptateurs — remplacés UN PAR UN.
 *
 * C'est la mécanique du socle (`backend.js`) : une base locale complète qui
 * marche sans configuration, et des surcharges distantes déclarées port par
 * port. `backendCoverage` dit à l'écran des réglages qui sert quoi, au lieu de
 * laisser croire qu'un backend configuré est un backend utilisé.
 *
 * `load()` rend l'ORIGINE avec la donnée. Serveur, cache ou démonstration ne
 * se valent pas, et l'utilisateur doit le savoir : une donnée fictive qui
 * passerait pour du référentiel est le pire des défauts de ce projet.
 */
import {
  backendCoverage,
  composeBackend,
  type BackendCoverage,
} from '@mister-guiiug/dev-pwa-config/backend';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { type Referential, ReferentialSchema } from '../domain/referential';
import { BACKEND } from './config';
import { DEMO_REFERENTIAL } from './demo';
import {
  createSupabaseRepository,
  supabaseFactory,
} from './supabaseReferential';

export type Origin = 'server' | 'cache' | 'demo';

export interface LoadResult {
  readonly referential: Referential;
  readonly origin: Origin;
  /** Ce qu'il faut dire à l'utilisateur quand l'origine n'est pas le serveur. */
  readonly notice?: string;
}

/** Une saison offerte au choix : ce qu'il faut pour une liste déroulante. */
export interface SeasonOption {
  readonly slug: string;
  readonly name: string;
}

/**
 * LA SAISON PAR DÉFAUT.
 *
 * Seize saisons sont publiées ; il en faut une à l'ouverture, et c'est celle
 * qui est EN COURS DE DIFFUSION. Un slug absent du serveur ne casse rien :
 * l'adaptateur retombe sur la plus récente.
 */
export const DEFAULT_SEASON_SLUG = 'all-stars-2026';

export interface ReferentialRepository {
  load(seasonSlug?: string): Promise<LoadResult>;
  /** Les saisons publiées. Vide = pas de choix à offrir. */
  listSeasons(): Promise<SeasonOption[]>;
}

export interface Backend {
  referential: ReferentialRepository;
}

const cache = createStore('koh');

/**
 * UNE CLÉ DE CACHE PAR SAISON. Une seule clé partagée rendrait « La Légende »
 * à qui vient de choisir « Malaisie », le temps d'un aller-retour réseau — et
 * indéfiniment hors ligne. L'ancienne clé reste lue pour ne pas jeter le cache
 * de ceux qui n'ont jamais choisi.
 */
const CACHE_KEY = 'referential';
const cacheKeyOf = (seasonSlug?: string) =>
  seasonSlug ? `${CACHE_KEY}:${seasonSlug}` : CACHE_KEY;

/** La dernière version mise en cache, si elle se valide et n'est pas la démo. */
function readCache(seasonSlug?: string): Referential | null {
  const lire = (cle: string): Referential | null => {
    const raw = cache.get<unknown>(cle, null);
    if (!raw) return null;
    const parsed = ReferentialSchema.safeParse(raw);
    // Un cache illisible n'est pas réparé : il est ignoré. Rien n'est détruit.
    if (!parsed.success || parsed.data.provenance.kind === 'demo') return null;
    return parsed.data;
  };

  const propre = lire(cacheKeyOf(seasonSlug));
  if (propre) return propre;

  // L'ANCIENNE CLÉ NE VAUT QUE POUR SA PROPRE SAISON. Elle date d'avant le
  // choix : la rendre pour n'importe quelle demande afficherait « All Stars »
  // à qui vient de choisir « Malaisie », et indéfiniment hors ligne.
  const ancien = seasonSlug ? lire(CACHE_KEY) : null;
  return ancien && ancien.season.slug === seasonSlug ? ancien : null;
}

function writeCache(referential: Referential): void {
  cache.set(cacheKeyOf(referential.season.slug), referential);
}

/** Repli : le cache s'il existe, sinon la démonstration. */
function createLocalRepository(): ReferentialRepository {
  return {
    load(seasonSlug?: string) {
      const cached = readCache(seasonSlug);
      if (cached)
        return Promise.resolve({ referential: cached, origin: 'cache' });
      return Promise.resolve({ referential: DEMO_REFERENTIAL, origin: 'demo' });
    },
    // La démonstration n'a qu'une saison : offrir un choix d'un seul élément
    // serait un faux choix.
    listSeasons: () => Promise.resolve([]),
  };
}

const local: Backend = { referential: createLocalRepository() };

const remote: Partial<Backend> =
  BACKEND === 'supabase'
    ? {
        referential: createSupabaseRepository({
          getClient: () => supabaseFactory.getClient(),
          readCache,
          writeCache,
        }),
      }
    : {};

export const backend: Backend = composeBackend(local, remote);

export const coverage: BackendCoverage = backendCoverage(
  local,
  remote,
  BACKEND
);
