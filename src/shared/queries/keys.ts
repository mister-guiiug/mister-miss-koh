/** Clés de cache TanStack Query — source unique pour invalidation. */
export const queryKeys = {
  referential: (season: string) => ['referential', season] as const,
} as const;

/** Le référentiel change rarement ; au-delà du défaut client (60 s). */
export const REFERENTIAL_STALE_MS = 120_000;
