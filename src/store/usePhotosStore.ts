/**
 * Les portraits chargés en mémoire, prêts à s'afficher.
 *
 * Les `Blob` vivent dans IndexedDB (`backend/photos`) ; ce magasin en tient
 * les URL d'objet, une par candidat. Elles sont RÉVOQUÉES dès qu'elles sont
 * remplacées ou retirées : une URL d'objet retient son blob en mémoire tant
 * qu'on ne la relâche pas, et dix-huit portraits oubliés font un lot.
 *
 * L'image est RÉ-ENCODÉE avant d'être rangée : une photo de téléphone pèse
 * plusieurs mégaoctets, porte ses métadonnées EXIF — dont, souvent, l'endroit
 * où elle a été prise — et n'a aucun besoin de dépasser la taille d'une
 * vignette. Le module `image` du socle réduit et ré-encode ; le fichier
 * d'origine n'est jamais conservé.
 */
import { create } from 'zustand';
import { type PhotoStore, photoStore } from '../backend/photos';

/** Une vignette : 512 px suffisent au plus grand portrait de l'application. */
const MAX_BYTES = 120 * 1024;
const MAX_DIMENSION = 512;

/**
 * L'encodeur n'est chargé qu'au moment où l'on dépose une image.
 *
 * Il tire le canevas et la chaîne de ré-encodage du socle, dont personne n'a
 * besoin pour LIRE l'application : la plupart des visites n'ajouteront jamais
 * de portrait, et ne doivent pas payer ce code au premier écran.
 */
async function defaultCompress(file: File): Promise<Blob> {
  const { compressImageToMaxBytes } =
    await import('@mister-guiiug/dev-pwa-config/image');
  return compressImageToMaxBytes(file, MAX_BYTES, {
    maxDimension: MAX_DIMENSION,
  });
}

export interface PhotosState {
  /** URL d'objet par candidat — vide tant que rien n'est chargé. */
  urls: Readonly<Record<string, string>>;
  /** La première lecture d'IndexedDB est faite (réussie ou non). */
  ready: boolean;
  load(): Promise<void>;
  attach(contestantId: string, file: File): Promise<void>;
  detach(contestantId: string): Promise<void>;
}

export function createPhotosStore(
  store: PhotoStore = photoStore,
  compress: (file: File) => Promise<Blob> = defaultCompress
) {
  return create<PhotosState>((set, get) => {
    const revoke = (url: string | undefined) => {
      if (url) URL.revokeObjectURL(url);
    };

    return {
      urls: {},
      ready: false,

      async load() {
        if (get().ready) return;
        const photos = await store.loadAll();
        const urls: Record<string, string> = {};
        for (const [id, blob] of Object.entries(photos)) {
          urls[id] = URL.createObjectURL(blob);
        }
        set({ urls, ready: true });
      },

      async attach(contestantId, file) {
        const blob = await compress(file);
        await store.save(contestantId, blob);
        const previous = get().urls[contestantId];
        set({
          urls: { ...get().urls, [contestantId]: URL.createObjectURL(blob) },
        });
        // Après le remplacement : révoquer avant laisserait un instant où
        // l'écran pointe une URL morte.
        revoke(previous);
      },

      async detach(contestantId) {
        await store.remove(contestantId);
        const { [contestantId]: gone, ...rest } = get().urls;
        set({ urls: rest });
        revoke(gone);
      },
    };
  });
}

export const usePhotosStore = createPhotosStore();
