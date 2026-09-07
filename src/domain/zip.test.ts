import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip';

const octets = (s: string) => new TextEncoder().encode(s);
const LE = (a: Uint8Array, i: number) =>
  new DataView(a.buffer).getUint32(i, true);
const LE16 = (a: Uint8Array, i: number) =>
  new DataView(a.buffer).getUint16(i, true);

describe('CRC-32', () => {
  it('rend les valeurs de référence du format', () => {
    // Les deux vecteurs que toute implémentation de CRC-32 doit donner.
    expect(crc32(octets('')).toString(16)).toBe('0');
    expect(crc32(octets('123456789')).toString(16)).toBe('cbf43926');
  });
});

describe('l’archive', () => {
  const LE_JOUR = new Date('2026-09-07T10:30:00');

  it('porte les signatures du format, et la méthode « stocké »', () => {
    const zip = buildZip([{ name: 'a.txt', data: octets('bonjour') }], LE_JOUR);

    expect(LE(zip, 0)).toBe(0x04034b50); // en-tête local
    expect(LE16(zip, 8)).toBe(0); // méthode 0 : rien n'est compressé
    expect(LE16(zip, 6) & 0x800).toBe(0x800); // le nom est annoncé en UTF-8
    // La taille « compressée » égale la taille réelle : c'est ce que « stocké »
    // veut dire, et un lecteur qui trouverait deux valeurs différentes
    // refuserait l'archive.
    expect(LE(zip, 18)).toBe(LE(zip, 22));
    expect(LE(zip, 18)).toBe(7);
  });

  it('est DÉTERMINISTE à date égale, et ne l’est plus si la date change', () => {
    // C'est ce qui rend une archive comparable dans un test : sans le
    // paramètre, deux appels à une seconde d'intervalle diffèreraient.
    const a = buildZip([{ name: 'x', data: octets('y') }], LE_JOUR);
    const b = buildZip([{ name: 'x', data: octets('y') }], LE_JOUR);
    expect([...a]).toEqual([...b]);

    const c = buildZip(
      [{ name: 'x', data: octets('y') }],
      new Date('2026-09-08T10:30:00')
    );
    expect([...c]).not.toEqual([...a]);
  });

  it('une archive vide reste une archive : l’enregistrement de fin, et rien d’autre', () => {
    const zip = buildZip([], LE_JOUR);

    expect(zip.length).toBe(22);
    expect(LE(zip, 0)).toBe(0x06054b50);
    expect(LE16(zip, 8)).toBe(0); // aucune entrée
  });

  it('les décalages du répertoire central suivent les en-têtes locaux', () => {
    // L'erreur la plus facile à commettre, et la plus silencieuse : un
    // décalage faux rend une archive que certains outils ouvrent quand même,
    // en devinant. Ici on vérifie que le second en-tête est bien à l'endroit
    // annoncé par sa fiche.
    const zip = buildZip(
      [
        { name: 'un.txt', data: octets('AAA') },
        { name: 'deux.txt', data: octets('BBBBB') },
      ],
      LE_JOUR
    );

    const debutCentral = 30 + 6 + 3 + (30 + 8 + 5);
    expect(LE(zip, debutCentral)).toBe(0x02014b50);
    // Le décalage de la PREMIÈRE fiche pointe le premier en-tête local.
    expect(LE(zip, debutCentral + 42)).toBe(0);
    // Celui de la seconde pointe juste après le premier fichier.
    const secondeFiche = debutCentral + 46 + 6;
    expect(LE(zip, secondeFiche)).toBe(0x02014b50);
    expect(LE(zip, secondeFiche + 42)).toBe(30 + 6 + 3);
  });
});
