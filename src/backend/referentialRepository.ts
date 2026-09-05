/**
 * Le port du référentiel, et ses adaptateurs — remplacés UN PAR UN.
 *
 * C'est la mécanique du socle (`backend.js`) : une base locale complète qui
 * marche sans configuration, et des surcharges distantes déclarées port par
 * port. Une surcharge `undefined` est ignorée — c'est ce qui rend lisible un
 * adaptateur pas encore écrit, et c'est l'état exact d'aujourd'hui :
 *
 *   referential : LOCAL (démonstration) — l'adaptateur Supabase n'est pas
 *                 écrit. Il lira les tables publiées (0001) une fois la
 *                 publication transactionnelle en place.
 *
 * `backendCoverage` le dit à l'écran des réglages, au lieu de laisser croire
 * qu'un backend configuré est un backend utilisé.
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

export interface ReferentialRepository {
  /** Le référentiel courant — du cache si hors ligne, sinon la source. */
  load(): Promise<Referential>;
}

export interface Backend {
  referential: ReferentialRepository;
}

const cache = createStore('koh');
const CACHE_KEY = 'referential';

/** Repli : la démonstration, ou la dernière version mise en cache. */
function createLocalRepository(): ReferentialRepository {
  return {
    load() {
      const cached = cache.get<unknown>(CACHE_KEY, null);
      if (cached) {
        const parsed = ReferentialSchema.safeParse(cached);
        // Un cache illisible n'est pas réparé : il est ignoré, et la
        // démonstration reprend. Le socle a déjà copié de côté ce qui ne se
        // comprend pas ; ici on ne détruit rien.
        if (parsed.success && parsed.data.provenance.kind !== 'demo') {
          return Promise.resolve(parsed.data);
        }
      }
      return Promise.resolve(DEMO_REFERENTIAL);
    },
  };
}

const local: Backend = { referential: createLocalRepository() };

/**
 * Surcharges distantes. `referential: undefined` est DÉLIBÉRÉ : l'adaptateur
 * n'existe pas encore, et le dire ainsi vaut mieux qu'un adaptateur qui
 * rendrait la démonstration en se faisant passer pour le serveur.
 */
const remote: Partial<Backend> =
  BACKEND === 'supabase' ? { referential: undefined } : {};

export const backend: Backend = composeBackend(local, remote);

export const coverage: BackendCoverage = backendCoverage(
  local,
  remote,
  BACKEND
);
