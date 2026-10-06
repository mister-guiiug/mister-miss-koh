/**
 * Lecture du référentiel via TanStack Query, miroir vers Zustand.
 *
 * Le magasin reste ce que les écrans lisent ; Query porte le cache réseau et
 * la déduplication. Le suivi des publications (`useReferentialWatch`) ne passe
 * JAMAIS par `refetchOnWindowFocus` : il vérifie seulement le numéro de
 * version, puis invalide / relit si besoin.
 */
import {
  backend,
  peekCachedReferential,
  type LoadOptions,
  type LoadResult,
} from '../../backend/referentialRepository';
import { useAppStore } from '../../store/useAppStore';
import { getQueryClient } from './client';
import { queryKeys, REFERENTIAL_STALE_MS } from './keys';

export type FetchReferentialOptions = LoadOptions & {
  /**
   * Forcer une relecture même si le cache Query est encore frais.
   * Toujours vrai pour `reload()` ; faux pour le premier `init()`.
   */
  readonly force?: boolean;
};

function syncReferentialToStore(result: LoadResult): void {
  // LA VERSION NON VALIDÉE RESTE À L'ÉCRAN pendant qu'on la revérifie : la
  // remplacer par la publiée le temps d'un aller-retour ferait clignoter les
  // épisodes à chaque relecture. `synchroniserApercu` tranche juste après.
  const { apercu, apercuSaison, season, referential } = useAppStore.getState();
  const garder =
    apercu !== null &&
    apercuSaison === season &&
    result.referential.season.slug === season &&
    Boolean(result.referential.provenance.pendingRevision);
  useAppStore.setState({
    referential:
      garder && referential
        ? { ...referential, provenance: result.referential.provenance }
        : result.referential,
    apercu: garder ? { ...apercu, publie: result.referential } : null,
    origin: result.origin,
    notice: result.notice ?? null,
    ready: true,
    error: null,
  });
}

/**
 * Charge le référentiel de la saison courante via `fetchQuery`, puis aligne
 * le magasin. Conserve l'affichage immédiat du cache local, et les sémantiques
 * `manual` / `origin` / `notice`.
 */
export async function fetchReferential(
  options?: FetchReferentialOptions
): Promise<void> {
  const season = useAppStore.getState().season;
  const cached = peekCachedReferential(season);
  if (cached && !useAppStore.getState().referential) {
    useAppStore.setState({
      referential: cached,
      origin: 'cache',
      ready: true,
    });
  }

  useAppStore.setState({ loading: true });
  const client = getQueryClient();
  const force = options?.force === true || options?.manual === true;
  const loadOptions: LoadOptions | undefined = options?.manual
    ? { manual: true }
    : undefined;

  try {
    const result = await client.fetchQuery({
      queryKey: queryKeys.referential(season),
      queryFn: () =>
        loadOptions
          ? backend.referential.load(season, loadOptions)
          : backend.referential.load(season),
      staleTime: force ? 0 : REFERENTIAL_STALE_MS,
      // Une seule tentative : le port gère déjà timeout + repli cache.
      // Un retry Query doublerait les allers-retours (jusqu'à 10 s).
      retry: false,
    });
    syncReferentialToStore(result);
    // À LA DEMANDE, comme dans le magasin : hors du chemin critique. Et SANS
    // L'ATTENDRE : la relecture rend la main dès que la version publiée est
    // là, comme avant l'aperçu. L'attendre retardait d'un chargement de module
    // tout ce qui suit une relecture (le toast du suivi des publications, par
    // exemple), pour une fonction qui ne sert que les soirs où un lot attend.
    void import('./apercu')
      .then(({ synchroniserApercu }) => synchroniserApercu(result.referential))
      .catch(() => {
        // Module introuvable (hors ligne, déploiement en cours) : la version
        // publiée reste à l'écran, et la relecture suivante réessaiera.
      });
  } catch (error) {
    // Rien d'autre ne bouge : référentiel, origine et avis restent ceux de
    // la dernière lecture réussie. Un rechargement qui échoue se signale, il
    // ne remplace pas l'application ; seul le premier chargement, qui ne
    // laisse rien derrière lui, bloque l'écran — et App le sait par
    // `referential`, pas par `error`.
    useAppStore.setState({
      ready: true,
      error: error instanceof Error ? error.message : 'référentiel illisible',
    });
  } finally {
    useAppStore.setState({ loading: false });
  }
}

/** Marque le cache Query de la saison comme périmé (suivi de version). */
export function invalidateReferential(season: string): Promise<void> {
  return getQueryClient().invalidateQueries({
    queryKey: queryKeys.referential(season),
  });
}
