import { describe, expect, it, vi } from 'vitest';
import { canSharePhoto, sharePhoto, type SharePlatform } from './sharePhoto';

const photo = () =>
  new File(['portrait'], 'portrait-ael.jpg', { type: 'image/jpeg' });

const abort = () => {
  const error = new Error('feuille refermée');
  error.name = 'AbortError';
  return error;
};

describe('savoir si la plateforme peut envoyer CETTE image', () => {
  it('non sans `share`, non sans `canShare`', () => {
    // Sans `canShare`, on ne peut pas demander : afficher le bouton
    // reviendrait à promettre ce qui échouera au clic.
    expect(canSharePhoto(photo(), 'Portrait', {})).toBe(false);
    expect(canSharePhoto(photo(), 'Portrait', { share: vi.fn() })).toBe(false);
  });

  it('non quand la plateforme refuse un fichier, oui quand elle l’accepte', () => {
    const refuse: SharePlatform = {
      share: vi.fn(),
      canShare: () => false,
    };
    const accept: SharePlatform = { share: vi.fn(), canShare: () => true };

    expect(canSharePhoto(photo(), 'Portrait', refuse)).toBe(false);
    expect(canSharePhoto(photo(), 'Portrait', accept)).toBe(true);
  });

  it('non quand `canShare` lève — une charge inexaminable est un refus', () => {
    const platform: SharePlatform = {
      share: vi.fn(),
      canShare: () => {
        throw new TypeError('charge illisible');
      },
    };

    expect(canSharePhoto(photo(), 'Portrait', platform)).toBe(false);
  });

  it('demande EXACTEMENT la charge qui sera envoyée', async () => {
    // Le piège que ce test ferme : vérifier `{ files }` puis envoyer
    // `{ files, url }`. Plusieurs plateformes acceptent chaque partie et
    // refusent la somme — le bouton dirait oui, le clic dirait non.
    const canShare = vi.fn<(data: ShareData) => boolean>(() => true);
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.resolve()
    );
    const platform: SharePlatform = { share, canShare };
    const file = photo();

    canSharePhoto(file, 'Portrait de Ael', platform);
    await sharePhoto(file, 'Portrait de Ael', platform);

    expect(canShare.mock.calls[0]?.[0]).toEqual(share.mock.calls[0]?.[0]);
    expect(share.mock.calls[0]?.[0]).toEqual({
      files: [file],
      title: 'Portrait de Ael',
    });
  });
});

describe('l’envoi de l’image', () => {
  it('rend « unsupported » là où le partage natif n’existe pas', async () => {
    expect(await sharePhoto(photo(), 'Portrait', {})).toBe('unsupported');
  });

  it('rend « shared » quand la feuille a fait son travail', async () => {
    const platform: SharePlatform = { share: () => Promise.resolve() };
    expect(await sharePhoto(photo(), 'Portrait', platform)).toBe('shared');
  });

  it('rend « cancelled », pas « failed », quand on referme la feuille', async () => {
    // La distinction n'est pas cosmétique : trois apps du parc affichaient
    // « échec » à qui avait simplement changé d'avis.
    const platform: SharePlatform = { share: () => Promise.reject(abort()) };
    expect(await sharePhoto(photo(), 'Portrait', platform)).toBe('cancelled');
  });

  it('rend « failed » sur toute autre erreur', async () => {
    const platform: SharePlatform = {
      share: () => Promise.reject(new Error('permission refusée')),
    };
    expect(await sharePhoto(photo(), 'Portrait', platform)).toBe('failed');
  });
});
