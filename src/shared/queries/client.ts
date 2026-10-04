import { getQueryClient as getFamilyQueryClient } from '@mister-guiiug/dev-pwa-config/react/query-client';

/**
 * Client Query — defaults famille + staleTime 60 s.
 *
 * `refetchOnWindowFocus: false` vient du socle : le référentiel se suit par
 * un contrôle léger de version (`useReferentialWatch`), pas par une relecture
 * complète à chaque focus d'onglet.
 */
export function getQueryClient() {
  return getFamilyQueryClient({
    queries: { staleTime: 60_000 },
  });
}

export {
  resetQueryClient,
  createQueryClient,
} from '@mister-guiiug/dev-pwa-config/react/query-client';
