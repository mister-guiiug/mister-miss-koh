import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { downloadBlob } from '@mister-guiiug/dev-pwa-config/download';
import { PhotosExport } from './PhotosExport';
import { useAppStore } from '../store/useAppStore';
import { usePhotosStore } from '../store/usePhotosStore';
import { DEMO_REFERENTIAL } from '../backend/demo';

vi.mock('@mister-guiiug/dev-pwa-config/download', async importer => ({
  ...(await importer<
    typeof import('@mister-guiiug/dev-pwa-config/download')
  >()),
  downloadBlob: vi.fn(() => true),
}));

const [premier, deuxieme] = DEMO_REFERENTIAL.contestants;

const blob = (contenu: string) =>
  new Blob([new TextEncoder().encode(contenu)], { type: 'image/webp' });

function poser(
  urls: Record<string, string>,
  lire: (id: string) => Promise<Blob | undefined>
) {
  useAppStore.setState({ referential: DEMO_REFERENTIAL, ready: true });
  usePhotosStore.setState({ urls, read: lire });
}

const rendre = () =>
  render(
    <ToastProvider>
      <PhotosExport />
    </ToastProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('l’export des portraits', () => {
  it('sans portrait, il n’y a rien à exporter — et l’écran le dit', () => {
    poser({}, () => Promise.resolve(undefined));
    rendre();

    expect(
      screen.getByText(/Aucun portrait déposé pour l’instant/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Exporter les portraits' })
    ).toBeDisabled();
  });

  it('bâtit une VRAIE archive, et la donne au téléchargement', async () => {
    poser({ [premier!.id]: 'blob:a', [deuxieme!.id]: 'blob:b' }, id =>
      Promise.resolve(blob(`octets de ${id}`))
    );
    const user = userEvent.setup();
    rendre();

    expect(
      screen.getByText(/2 portraits sur cet appareil/)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Exporter les portraits' })
    );

    const [fichier, nom] = vi.mocked(downloadBlob).mock.calls[0] ?? [];
    expect(nom).toMatch(
      /^portraits-saison-de-demonstration-\d{4}-\d{2}-\d{2}\.zip$/
    );
    expect(fichier?.type).toBe('application/zip');

    // On relit les octets : le composant doit produire une archive, pas un
    // fichier de la bonne extension. Signature et nombre d'entrées suffisent
    // — le format lui-même est éprouvé par `zip.test.ts` et par `unzip`.
    const bytes = new Uint8Array(await fichier!.arrayBuffer());
    const vue = new DataView(bytes.buffer);
    expect(vue.getUint32(0, true)).toBe(0x04034b50);
    expect(vue.getUint16(bytes.length - 22 + 8, true)).toBe(2);
  });

  it('un portrait que la base ne rend plus n’empêche pas les autres', async () => {
    // Une URL sans blob : le dépôt a pu être vidé à moitié. On exporte ce qui
    // existe plutôt que de tout refuser.
    poser({ [premier!.id]: 'blob:a', [deuxieme!.id]: 'blob:b' }, id =>
      Promise.resolve(id === premier!.id ? blob('seul') : undefined)
    );
    const user = userEvent.setup();
    rendre();

    await user.click(
      screen.getByRole('button', { name: 'Exporter les portraits' })
    );

    const [fichier] = vi.mocked(downloadBlob).mock.calls[0] ?? [];
    const bytes = new Uint8Array(await fichier!.arrayBuffer());
    expect(
      new DataView(bytes.buffer).getUint16(bytes.length - 22 + 8, true)
    ).toBe(1);
    expect(await screen.findByText('1 portrait exporté.')).toBeInTheDocument();
  });

  it('si RIEN ne se relit, il ne télécharge pas une archive vide', async () => {
    poser({ [premier!.id]: 'blob:a' }, () => Promise.resolve(undefined));
    const user = userEvent.setup();
    rendre();

    await user.click(
      screen.getByRole('button', { name: 'Exporter les portraits' })
    );

    expect(downloadBlob).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Aucun portrait n’a pu être relu.')
    ).toBeInTheDocument();
  });
});
