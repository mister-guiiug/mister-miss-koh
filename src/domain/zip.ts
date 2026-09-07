/**
 * Une archive ZIP « stored » — sans compression, et c'est un choix.
 *
 * POURQUOI PAS DE COMPRESSION. Ce qu'on met dedans, ce sont des portraits déjà
 * encodés en WebP ou en JPEG : les redéflater ne gagnerait rien et coûterait
 * une bibliothèque de plus dans un budget de bundle qui se resserre. La
 * méthode 0 est prévue par le format et lue par tous les outils.
 *
 * POURQUOI DANS L'APPLICATION. Le socle a exactement ce code — `zipStore` et
 * `crc32` vivent dans son module `xlsx` — mais ne l'exporte pas : seuls
 * `buildXlsx` et `downloadXlsx` le sont. Le remonter demanderait une PR sur le
 * socle ET une publication, que `CONTRIBUTING` interdit de déclencher. C'est
 * une duplication assumée, et le bon candidat à la promotion le jour où le
 * socle rouvre.
 *
 * DÉTERMINISTE. La date de modification est un PARAMÈTRE : mêmes entrées et
 * même date donnent les mêmes octets, ce qui rend l'archive comparable dans un
 * test au lieu de dépendre de l'heure qu'il est.
 */

/** Table CRC-32 (polynôme inversé 0xEDB88320), calculée une fois. */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Le chemin DANS l'archive. Encodé en UTF-8, drapeau posé. */
  name: string;
  data: Uint8Array;
}

/** L'heure et la date au format MS-DOS, que le ZIP porte depuis 1989. */
function dosDateTime(date: Date): { time: number; date: number } {
  // Les secondes tiennent sur 5 bits : le format ne connaît que les paires.
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  // 1980 est l'an zéro du format ; une date antérieure n'est pas représentable.
  const annee = Math.max(0, date.getFullYear() - 1980);
  return {
    time,
    date: (annee << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Les octets d'une archive contenant ces entrées, dans cet ordre.
 *
 * Une archive VIDE reste une archive valide : elle n'a qu'un enregistrement de
 * fin. C'est voulu — lever ici obligerait chaque appelant à se garder, alors
 * que c'est à l'écran de ne pas proposer un export sans rien à exporter.
 */
/*
 * Le type de retour porte `<ArrayBuffer>`, pas le `Uint8Array` nu : depuis
 * TypeScript 5.7 un `Uint8Array` peut être adossé à un `SharedArrayBuffer`, et
 * `BlobPart` n'en veut pas. Sans cette précision, `new Blob([archive])` est
 * refusé par le compilateur alors que le tableau rendu ici est toujours
 * adossé à un `ArrayBuffer` ordinaire.
 */
export function buildZip(
  entries: readonly ZipEntry[],
  modified = new Date()
): Uint8Array<ArrayBuffer> {
  const encodeur = new TextEncoder();
  const { time, date } = dosDateTime(modified);

  const locaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let position = 0;

  for (const entree of entries) {
    const nom = encodeur.encode(entree.name);
    const crc = crc32(entree.data);
    const taille = entree.data.length;

    const enTete = new DataView(new ArrayBuffer(30));
    enTete.setUint32(0, 0x04034b50, true); // signature
    enTete.setUint16(4, 20, true); // version minimale
    enTete.setUint16(6, 0x0800, true); // drapeau : le nom est en UTF-8
    enTete.setUint16(8, 0, true); // méthode 0 = stocké
    enTete.setUint16(10, time, true);
    enTete.setUint16(12, date, true);
    enTete.setUint32(14, crc, true);
    enTete.setUint32(18, taille, true); // taille compressée…
    enTete.setUint32(22, taille, true); // … égale à la taille réelle
    enTete.setUint16(26, nom.length, true);
    enTete.setUint16(28, 0, true); // pas de champ « extra »

    locaux.push(new Uint8Array(enTete.buffer), nom, entree.data);

    const fiche = new DataView(new ArrayBuffer(46));
    fiche.setUint32(0, 0x02014b50, true);
    fiche.setUint16(4, 20, true); // version d'écriture
    fiche.setUint16(6, 20, true); // version minimale
    fiche.setUint16(8, 0x0800, true);
    fiche.setUint16(10, 0, true);
    fiche.setUint16(12, time, true);
    fiche.setUint16(14, date, true);
    fiche.setUint32(16, crc, true);
    fiche.setUint32(20, taille, true);
    fiche.setUint32(24, taille, true);
    fiche.setUint16(28, nom.length, true);
    fiche.setUint16(30, 0, true); // extra
    fiche.setUint16(32, 0, true); // commentaire
    fiche.setUint16(34, 0, true); // disque de départ
    fiche.setUint16(36, 0, true); // attributs internes
    fiche.setUint32(38, 0, true); // attributs externes
    fiche.setUint32(42, position, true); // où trouver l'en-tête local

    central.push(new Uint8Array(fiche.buffer), nom);
    position += 30 + nom.length + taille;
  }

  const tailleCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(4, 0, true); // ce disque
  fin.setUint16(6, 0, true); // disque du répertoire central
  fin.setUint16(8, entries.length, true);
  fin.setUint16(10, entries.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, position, true);
  fin.setUint16(20, 0, true); // commentaire d'archive

  const morceaux = [...locaux, ...central, new Uint8Array(fin.buffer)];
  const total = morceaux.reduce((n, p) => n + p.length, 0);
  const sortie = new Uint8Array(total);
  let curseur = 0;
  for (const m of morceaux) {
    sortie.set(m, curseur);
    curseur += m.length;
  }
  return sortie;
}
