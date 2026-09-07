/**
 * L'export en masse des portraits — le même geste que « Enregistrer l'image »,
 * mais pour tous ceux qu'on a déposés.
 *
 * UNE ARCHIVE, PAS N TÉLÉCHARGEMENTS. Enchaîner dix-huit `downloadBlob` ferait
 * dix-huit demandes au navigateur, que Chrome bloque après la deuxième et que
 * Safari refuse tout court. Un fichier unique se donne, se range et se
 * retrouve.
 *
 * CE QUI SORT EST CE QUI EST SUR L'APPAREIL. On n'écrit ici aucun portrait
 * qu'on n'aurait pas : un candidat sans photo n'apparaît pas dans l'archive,
 * et rien n'est demandé au serveur — le dépôt est local, l'export l'est aussi.
 */
import { slugify } from '@mister-guiiug/dev-pwa-config/format';
import type { Referential } from './referential';
import { photoFileName } from './sharing';
import type { ZipEntry } from './zip';

/** Un portrait relu du dépôt local, prêt à entrer dans l'archive. */
export interface PortraitLu {
  contestantId: string;
  bytes: Uint8Array;
  mime: string;
}

/**
 * Le nom de l'archive : la saison et le jour.
 *
 * Retrouver « portraits-2026-09-07.zip » six mois plus tard ne dit pas de
 * QUELLE saison il s'agit, et cette application en suit dix-huit.
 */
export function archiveName(seasonName: string, jour: string): string {
  const slug = slugify(seasonName);
  return `portraits-${slug || 'saison'}-${jour}.zip`;
}

/**
 * Les entrées de l'archive, dans l'ordre du référentiel.
 *
 * DEUX CANDIDATS PEUVENT PORTER LE MÊME PRÉNOM — c'est le cas dans les
 * saisons réelles, et le nom de fichier vient du prénom : deux « Camille »
 * donneraient deux fois `portrait-camille.webp`, et l'archive n'en garderait
 * qu'une à l'extraction. Le second reçoit donc un rang. Ce n'est pas une
 * précaution théorique : le référentiel refuse déjà de rapprocher deux
 * homonymes entre saisons pour la même raison.
 */
export function photoEntries(
  ref: Referential,
  portraits: readonly PortraitLu[]
): ZipEntry[] {
  const parId = new Map(portraits.map(p => [p.contestantId, p]));
  const vus = new Map<string, number>();
  const entries: ZipEntry[] = [];

  for (const candidat of ref.contestants) {
    const portrait = parId.get(candidat.id);
    if (!portrait) continue;

    const base = photoFileName(candidat.displayName, portrait.mime);
    const rang = (vus.get(base) ?? 0) + 1;
    vus.set(base, rang);

    const point = base.lastIndexOf('.');
    const name =
      rang === 1 ? base : `${base.slice(0, point)}-${rang}${base.slice(point)}`;

    entries.push({ name, data: portrait.bytes });
  }

  return entries;
}
