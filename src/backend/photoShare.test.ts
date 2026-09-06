import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  base64FromBlob,
  blobFromBase64,
  createPhotoShareRepository,
  mapPhotoShare,
  PHOTO_SHARE_MAX_BYTES,
} from './photoShare';

const ligne = {
  id: 'p-1',
  token: 'jeton',
  label: 'Portrait de Laure',
  season_contestant_id: 'c-laure',
  created_at: '2026-09-06T12:00:00.000Z',
  expires_at: '2026-09-07T12:00:00.000Z',
};

/** Un client de fantaisie : `rpc` scripté, `from` réduit à ce qu'on appelle. */
function clientFactice(over: {
  rpc?: (fn: string, args: unknown) => { data: unknown; error: unknown };
  single?: { data: unknown; error: unknown };
}) {
  const rpc = vi.fn((fn: string, args: unknown) =>
    Promise.resolve(over.rpc?.(fn, args) ?? { data: null, error: null })
  );
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve(over.single ?? { data: ligne, error: null }),
      }),
      order: () => Promise.resolve({ data: [ligne], error: null }),
    }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }));
  return {
    client: { rpc, from } as unknown as SupabaseClient,
    rpc,
  };
}

const depot = (client: SupabaseClient) =>
  createPhotoShareRepository(() => Promise.resolve(client));

describe('l’aller-retour base64', () => {
  it('rend exactement les octets déposés', async () => {
    const octets = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const base64 = await base64FromBlob(new Blob([octets]));
    const rendu = new Uint8Array(
      await blobFromBase64(base64, 'image/webp').arrayBuffer()
    );

    expect([...rendu]).toEqual([...octets]);
  });

  it('encode une image entière sans déborder la pile', async () => {
    // `String.fromCharCode(...tableau)` explose bien avant 120 Kio : c'est
    // exactement la taille d'un portrait, donc le cas NORMAL, pas un extrême.
    const gros = new Uint8Array(120 * 1024).fill(65);
    const base64 = await base64FromBlob(new Blob([gros]));

    expect(base64.length).toBeGreaterThan(160_000);
    expect(blobFromBase64(base64, 'image/webp').size).toBe(gros.length);
  });
});

describe('déposer', () => {
  it('envoie la photo en base64 et relit l’échéance POSÉE PAR LE SERVEUR', async () => {
    const { client, rpc } = clientFactice({
      rpc: () => ({ data: 'jeton', error: null }),
    });

    const cree = await depot(client).share(
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
      'Portrait de Laure',
      'c-laure'
    );

    expect(rpc).toHaveBeenCalledWith('create_photo_share', {
      photo_base64: 'AQID',
      photo_mime: 'image/webp',
      photo_label: 'Portrait de Laure',
      contestant: 'c-laure',
    });
    // L'échéance vient de la relecture, pas d'un `Date.now()` local : c'est
    // l'horloge du serveur qui refusera la lecture, pas celle du navigateur.
    expect(cree.expiresAt).toBe('2026-09-07T12:00:00.000Z');
  });

  it('refuse AVANT l’envoi ce que le serveur refuserait après', async () => {
    const { client, rpc } = clientFactice({});
    const trop = new Blob([new Uint8Array(PHOTO_SHARE_MAX_BYTES + 1)], {
      type: 'image/webp',
    });

    await expect(depot(client).share(trop, null, null)).rejects.toThrow(
      /trop lourde/
    );
    await expect(
      depot(client).share(
        new Blob([new Uint8Array([1])], { type: 'image/gif' }),
        null,
        null
      )
    ).rejects.toThrow(/type d’image inattendu/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('ouvrir', () => {
  it('rend la photo et son libellé', async () => {
    const { client } = clientFactice({
      rpc: () => ({
        data: [
          {
            photo_base64: 'AQID',
            photo_mime: 'image/webp',
            photo_label: 'Portrait de Laure',
            photo_contestant: 'sc-laure',
          },
        ],
        error: null,
      }),
    });

    const lu = await depot(client).consume('jeton');

    expect(lu?.label).toBe('Portrait de Laure');
    expect(lu?.blob.type).toBe('image/webp');
    expect(lu?.blob.size).toBe(3);
    // La cible sort avec les octets : c'est elle qui évite au destinataire
    // l'aller-retour par ses fichiers.
    expect(lu?.contestantId).toBe('sc-laure');
  });

  it('rend `null` quand le lien n’ouvre plus rien', async () => {
    // Le serveur ne distingue pas « inconnu », « déjà ouvert » et « périmé » :
    // il a supprimé la ligne, il n'a plus de quoi les distinguer.
    const { client } = clientFactice({
      rpc: () => ({ data: [], error: null }),
    });

    await expect(depot(client).consume('jeton')).resolves.toBeNull();
  });
});

describe('la forme d’une ligne', () => {
  it('renomme la colonne de cible, et n’attend AUCUN octet', () => {
    const share = mapPhotoShare(ligne);

    expect(share.contestantId).toBe('c-laure');
    expect(Object.keys(share)).not.toContain('bytes');
  });
});
