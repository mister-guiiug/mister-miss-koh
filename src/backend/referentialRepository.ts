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

export interface ReferentialRepository {
  load(): Promise<LoadResult>;
}

export interface Backend {
  referential: ReferentialRepository;
}

const cache = createStore('koh');
const CACHE_KEY = 'referential';

/** La dernière version mise en cache, si elle se valide et n'est pas la démo. */
function readCache(): Referential | null {
  const raw = cache.get<unknown>(CACHE_KEY, null);
  if (!raw) return null;
  const parsed = ReferentialSchema.safeParse(raw);
  // Un cache illisible n'est pas réparé : il est ignoré. Rien n'est détruit.
  if (!parsed.success || parsed.data.provenance.kind === 'demo') return null;
  return parsed.data;
}

function writeCache(referential: Referential): void {
  cache.set(CACHE_KEY, referential);
}

/** Repli : le cache s'il existe, sinon la démonstration. */
function createLocalRepository(): ReferentialRepository {
  return {
    load() {
      const cached = readCache();
      if (cached)
        return Promise.resolve({ referential: cached, origin: 'cache' });
      return Promise.resolve({ referential: DEMO_REFERENTIAL, origin: 'demo' });
    },
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
