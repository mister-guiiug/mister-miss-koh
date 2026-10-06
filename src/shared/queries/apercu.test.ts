/**
 * La version non validée (migration 0039) face aux lectures publiées : quand
 * on la propose, quand on l'affiche, et quand la demande tombe d'elle-même.
 * Le port est complété à la main : l'adaptateur local (celui des tests) n'a
 * pas d'aperçu, comme la démonstration.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backend } from '../../backend/referentialRepository';
import { DEMO_REFERENTIAL } from '../../backend/demo';
import type { Referential } from '../../domain/referential';
import { useAppStore } from '../../store/useAppStore';
import { synchroniserApercu } from './apercu';

const SAISON = DEMO_REFERENTIAL.season.slug;
const REVISION = '240140469';

/** La version publiée, avec une relecture qui attend un relecteur. */
const PUBLIE: Referential = {
  ...DEMO_REFERENTIAL,
  provenance: {
    ...DEMO_REFERENTIAL.provenance,
    pendingRevision: REVISION,
    observedAt: '2026-10-06T20:46:04Z',
  },
};

/** Ce que le serveur rend : la saison après la publication simulée. */
const APERCU_LU: Referential = {
  ...DEMO_REFERENTIAL,
  season: { ...DEMO_REFERENTIAL.season, name: 'Saison, version non validée' },
  provenance: {
    ...DEMO_REFERENTIAL.provenance,
    revision: REVISION,
    pendingRevision: null,
  },
};

const port = backend.referential as typeof backend.referential & {
  previewRevision?: (slug: string) => Promise<string | null>;
  loadPreview?: (slug: string) => Promise<Referential | null>;
};

function brancherApercu(revision: string | null, lu: Referential | null) {
  port.previewRevision = vi.fn(() => Promise.resolve(revision));
  port.loadPreview = vi.fn(() => Promise.resolve(lu));
}

beforeEach(() => {
  useAppStore.setState({
    season: SAISON,
    referential: PUBLIE,
    apercu: null,
    apercuDisponible: null,
    apercuSaison: null,
  });
});
afterEach(() => {
  delete port.previewRevision;
  delete port.loadPreview;
  vi.restoreAllMocks();
});

describe('synchroniserApercu', () => {
  it('propose la version non validée quand un aperçu est prêt, sans l’afficher', async () => {
    brancherApercu(REVISION, APERCU_LU);

    await synchroniserApercu(PUBLIE);

    const etat = useAppStore.getState();
    expect(etat.apercuDisponible).toBe(REVISION);
    expect(etat.apercu).toBeNull();
    expect(etat.referential).toBe(PUBLIE);
    expect(port.loadPreview).not.toHaveBeenCalled();
  });

  it('l’affiche quand l’utilisateur l’a demandée, avec la provenance du PUBLIÉ', async () => {
    brancherApercu(REVISION, APERCU_LU);
    useAppStore.setState({ apercuSaison: SAISON });

    await synchroniserApercu(PUBLIE);

    const etat = useAppStore.getState();
    expect(etat.referential?.season.name).toBe('Saison, version non validée');
    // « Données publiées le » parle de la version publiée, pas de la simulée.
    expect(etat.referential?.provenance).toEqual(PUBLIE.provenance);
    expect(etat.apercu).toEqual({ revision: REVISION, publie: PUBLIE });
  });

  it('un aperçu périmé ou absent : la version publiée, et la demande attend', async () => {
    brancherApercu(null, null);
    useAppStore.setState({
      apercuSaison: SAISON,
      apercu: { revision: REVISION, publie: PUBLIE },
      referential: APERCU_LU,
    });

    await synchroniserApercu(PUBLIE);

    const etat = useAppStore.getState();
    expect(etat.referential).toBe(PUBLIE);
    expect(etat.apercu).toBeNull();
    expect(etat.apercuDisponible).toBeNull();
    expect(etat.apercuSaison).toBe(SAISON);
  });

  it('plus rien n’attend : la demande tombe d’elle-même', async () => {
    brancherApercu(REVISION, APERCU_LU);
    useAppStore.setState({
      apercuSaison: SAISON,
      apercu: { revision: REVISION, publie: PUBLIE },
      referential: APERCU_LU,
    });

    await synchroniserApercu(DEMO_REFERENTIAL);

    const etat = useAppStore.getState();
    expect(etat.referential).toBe(DEMO_REFERENTIAL);
    expect(etat.apercu).toBeNull();
    expect(etat.apercuSaison).toBeNull();
    expect(port.previewRevision).not.toHaveBeenCalled();
  });

  it('sans aperçu côté serveur (démonstration), rien n’est proposé', async () => {
    await synchroniserApercu(PUBLIE);

    expect(useAppStore.getState().apercuDisponible).toBeNull();
    expect(useAppStore.getState().referential).toBe(PUBLIE);
  });
});

describe('accepterApercu / quitterApercu', () => {
  it('accepter affiche la version non validée ; quitter rend la publiée et oublie la demande', async () => {
    brancherApercu(REVISION, APERCU_LU);

    await useAppStore.getState().accepterApercu();
    expect(useAppStore.getState().referential?.season.name).toBe(
      'Saison, version non validée'
    );
    expect(useAppStore.getState().apercuSaison).toBe(SAISON);

    useAppStore.getState().quitterApercu();
    expect(useAppStore.getState().referential).toBe(PUBLIE);
    expect(useAppStore.getState().apercu).toBeNull();
    expect(useAppStore.getState().apercuSaison).toBeNull();
  });
});
