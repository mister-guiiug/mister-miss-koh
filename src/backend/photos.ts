/**
 * Les portraits des candidats — CHOISIS PAR VOUS, et gardés sur cet appareil.
 *
 * POURQUOI L'APPLICATION NE VA PAS LES CHERCHER. Les photos officielles de
 * l'émission sont des œuvres protégées, représentant des personnes
 * identifiables, et le README de ce dépôt dit en toutes lettres qu'aucune
 * photographie de l'émission n'est reproduite. Les republier depuis un site
 * public serait à la fois une reproduction et un démenti de ce qu'on affiche.
 * L'hôte de ces images l'écrit d'ailleurs lui-même dans son `robots.txt`.
 *
 * CE QUE FAIT CE MODULE, DONC : il range l'image QUE VOUS choisissez, dans
 * IndexedDB, sur votre appareil. Rien ne part sur le réseau, rien n'entre dans
 * le référentiel — qui reste ce qu'il est, un relevé de faits tracés.
 *
 * UN INDEX À CÔTÉ DES BLOBS. Le magasin du socle sait lire un `Blob` par sa
 * clé, mais ne sait pas les ÉNUMÉRER : la liste des candidats illustrés vit
 * donc dans le magasin clé/valeur de la même base, écrite à chaque
 * changement. Une base sans index rend simplement zéro portrait.
 */
import { createIdb } from '@mister-guiiug/dev-pwa-config/idb';

const INDEX_KEY = 'photo-index';
const blobKey = (contestantId: string) => `photo:${contestantId}`;

export interface PhotoStore {
  /** Tous les portraits rangés, par identifiant de candidat. */
  loadAll(): Promise<Record<string, Blob>>;
  save(contestantId: string, blob: Blob): Promise<void>;
  remove(contestantId: string): Promise<void>;
}

/**
 * Ce que ce module demande à une base — cinq méthodes sur la quinzaine
 * qu'`IdbStore` offre. Déclarer le strict nécessaire dit ce dont on dépend, et
 * suffit aux tests pour tenir dans un objet littéral.
 */
export interface PhotoDb {
  get<T>(key: string, fallback: T): Promise<T>;
  set(key: string, value: unknown): Promise<boolean>;
  getBlob(key: string): Promise<Blob | undefined>;
  setBlob(key: string, blob: Blob): Promise<boolean>;
  removeBlob(key: string): Promise<boolean>;
}

/** Injectable : les tests passent une base de fantaisie, sans IndexedDB. */
export function createPhotoStore(db: PhotoDb = createIdb('koh')): PhotoStore {
  const index = () => db.get<string[]>(INDEX_KEY, []);

  return {
    async loadAll() {
      const ids = await index();
      const photos: Record<string, Blob> = {};
      for (const id of ids) {
        const blob = await db.getBlob(blobKey(id));
        // Une clé indexée sans blob n'est pas une erreur : la base a pu être
        // vidée à moitié. On rend ce qui existe, sans réparer ni se plaindre.
        if (blob) photos[id] = blob;
      }
      return photos;
    },

    async save(contestantId, blob) {
      await db.setBlob(blobKey(contestantId), blob);
      const ids = await index();
      if (!ids.includes(contestantId)) {
        await db.set(INDEX_KEY, [...ids, contestantId]);
      }
    },

    async remove(contestantId) {
      await db.removeBlob(blobKey(contestantId));
      const ids = await index();
      await db.set(
        INDEX_KEY,
        ids.filter(id => id !== contestantId)
      );
    },
  };
}

export const photoStore = createPhotoStore();
