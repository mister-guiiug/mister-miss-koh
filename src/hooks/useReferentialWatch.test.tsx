/**
 * CE QUE CES TESTS TIENNENT : l'écran ouvert suit les publications.
 *
 * Un soir de diffusion, l'import publie une élimination quelques minutes après
 * qu'elle est écrite sur Wikipédia (migration 0036). L'écran ouvert, lui, ne
 * relisait rien de lui-même. On éprouve le CONTRAT du suivi : il relit quand
 * le numéro de publication avance, il ne relit pas sinon, il se tait en
 * arrière-plan et rattrape au retour, et il n'annonce jamais le contenu.
 *
 * Le magasin est le VRAI ; seuls le port du référentiel, le réseau et le toast
 * sont remplacés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { backend } from '../backend/referentialRepository';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { getQueryClient } from '../shared/queries/client';
import { useAppStore } from '../store/useAppStore';
import type { Referential } from '../domain/referential';

const reseau = vi.hoisted(() => ({ online: true }));
const toastApi = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@mister-guiiug/dev-pwa-config/react/use-online', () => ({
  useOnline: () => reseau.online,
}));
vi.mock('@mister-guiiug/dev-pwa-config/react/toast', () => ({
  useToast: () => toastApi,
}));

const { useReferentialWatch, MESSAGE_NOUVEAUTE } =
  await import('./useReferentialWatch');

const TOUR_MS = 1_000;

/** Un référentiel du serveur, à tel numéro de publication. */
const aLaVersion = (version: number): Referential => ({
  ...DEMO_REFERENTIAL,
  provenance: { ...DEMO_REFERENTIAL.provenance, version },
});

let visibilite: DocumentVisibilityState = 'visible';

function Sonde(props: {
  latestVersion: (seasonId: string) => Promise<number | null>;
}) {
  useReferentialWatch({
    intervalMs: TOUR_MS,
    latestVersion: props.latestVersion,
  });
  return null;
}

function renderSonde(latestVersion: (seasonId: string) => Promise<number | null>) {
  return render(
    <QueryClientProvider client={getQueryClient()}>
      <Sonde latestVersion={latestVersion} />
    </QueryClientProvider>
  );
}

function poseLEtat(etat: Partial<ReturnType<typeof useAppStore.getState>>) {
  useAppStore.setState({
    ready: true,
    loading: false,
    error: null,
    referential: aLaVersion(5),
    origin: 'server',
    notice: null,
    ...etat,
  });
}

/** Avance l'horloge d'un tour, et laisse les promesses se résoudre. */
async function unTour() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(TOUR_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  reseau.online = true;
  visibilite = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibilite,
  });
  toastApi.info.mockClear();
  getQueryClient().clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('suivre les publications pendant qu’on regarde', () => {
  it('une publication nouvelle est relue en silence, et annoncée sans son contenu', async () => {
    const load = vi
      .spyOn(backend.referential, 'load')
      .mockResolvedValue({ referential: aLaVersion(6), origin: 'server' });
    const latestVersion = vi.fn().mockResolvedValue(6);

    poseLEtat({});
    renderSonde(latestVersion);
    await unTour();

    expect(latestVersion).toHaveBeenCalledWith(DEMO_REFERENTIAL.season.id);
    expect(load).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().referential?.provenance.version).toBe(6);
    // Neutre : le toast ne nomme ni l'épisode ni l'éliminé, la limite
    // anti-spoiler reste seule juge de ce qui se montre.
    expect(toastApi.info).toHaveBeenCalledWith(MESSAGE_NOUVEAUTE);
  });

  it('rien de neuf : aucune relecture, aucun toast', async () => {
    const load = vi.spyOn(backend.referential, 'load');
    const latestVersion = vi.fn().mockResolvedValue(5);

    poseLEtat({});
    renderSonde(latestVersion);
    await unTour();
    await unTour();

    expect(latestVersion).toHaveBeenCalledTimes(2);
    expect(load).not.toHaveBeenCalled();
    expect(toastApi.info).not.toHaveBeenCalled();
  });

  it('un serveur muet ne déclenche rien', async () => {
    const load = vi.spyOn(backend.referential, 'load');
    const latestVersion = vi.fn().mockResolvedValue(null);

    poseLEtat({});
    renderSonde(latestVersion);
    await unTour();

    expect(load).not.toHaveBeenCalled();
  });

  it('en arrière-plan, aucune requête ; au retour, la vérification part', async () => {
    const latestVersion = vi.fn().mockResolvedValue(5);
    visibilite = 'hidden';

    poseLEtat({});
    renderSonde(latestVersion);
    await unTour();
    expect(latestVersion).not.toHaveBeenCalled();

    visibilite = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(latestVersion).toHaveBeenCalledTimes(1);
  });

  it('sur la démonstration, rien à suivre', async () => {
    const latestVersion = vi.fn().mockResolvedValue(9);

    poseLEtat({ origin: 'demo', referential: DEMO_REFERENTIAL });
    renderSonde(latestVersion);
    await unTour();

    expect(latestVersion).not.toHaveBeenCalled();
  });

  it('hors ligne, rien non plus', async () => {
    const latestVersion = vi.fn().mockResolvedValue(9);
    reseau.online = false;

    poseLEtat({});
    renderSonde(latestVersion);
    await unTour();

    expect(latestVersion).not.toHaveBeenCalled();
  });
});
