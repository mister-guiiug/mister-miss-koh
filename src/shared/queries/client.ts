import { QueryClient } from '@tanstack/react-query';

/**
 * Client Query partagé — défauts PWA.
 *
 * `refetchOnWindowFocus: false` est volontaire : le référentiel se suit par
 * un contrôle léger de version (`useReferentialWatch`), pas par une relecture
 * complète à chaque focus d'onglet.
 */
function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

let client: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  client ??= createAppQueryClient();
  return client;
}
