import { describe, expect, it } from 'vitest';
import { DEMO_REFERENTIAL } from '../backend/demo';
import { archiveName, photoEntries, type PortraitLu } from './photosExport';
import type { Referential } from './referential';

const ref = DEMO_REFERENTIAL;
const octets = new Uint8Array([1, 2, 3]);

const portrait = (contestantId: string, mime = 'image/webp'): PortraitLu => ({
  contestantId,
  bytes: octets,
  mime,
});

describe('le nom de l’archive', () => {
  it('nomme la saison ET le jour', () => {
    // « portraits-2026-09-07.zip » retrouvé six mois plus tard ne dit pas de
    // QUELLE saison il s'agit — l'application en suit dix-huit.
    expect(archiveName('Koh-Lanta All Stars', '2026-09-07')).toBe(
      'portraits-koh-lanta-all-stars-2026-09-07.zip'
    );
  });

  it('reste un nom de fichier même sans saison lisible', () => {
    expect(archiveName('', '2026-09-07')).toBe(
      'portraits-saison-2026-09-07.zip'
    );
  });
});

describe('les entrées de l’archive', () => {
  it('ne retient QUE les portraits qu’on a, dans l’ordre du référentiel', () => {
    const deuxieme = ref.contestants[1]!;
    const premier = ref.contestants[0]!;
    // Donnés à l'envers : c'est le référentiel qui ordonne, pas l'appelant.
    const entries = photoEntries(ref, [
      portrait(deuxieme.id),
      portrait(premier.id),
    ]);

    // Noms exacts, pas « contient » : `slugify` retire les diacritiques
    // (« Aël » → « ael »), et comparer au prénom brut ne vérifierait rien de
    // ce que le fichier portera vraiment.
    expect(entries.map(e => e.name)).toEqual([
      'portrait-ael.webp',
      'portrait-bastien.webp',
    ]);
    expect(premier.displayName).toBe('Aël');
    expect(deuxieme.displayName).toBe('Bastien');
  });

  it('ignore un portrait dont le candidat n’est pas dans le référentiel', () => {
    expect(photoEntries(ref, [portrait('candidat-fantome')])).toEqual([]);
  });

  it('l’extension suit le TYPE réel du blob, pas une supposition', () => {
    const [entree] = photoEntries(ref, [
      portrait(ref.contestants[0]!.id, 'image/jpeg'),
    ]);
    expect(entree!.name.endsWith('.jpg')).toBe(true);
  });

  it('DEUX HOMONYMES ne se recouvrent pas', () => {
    // Le cas est réel : le référentiel refuse déjà de rapprocher deux
    // « Camille » entre saisons. Sans rang, l'archive porterait deux fois le
    // même nom et l'extraction n'en garderait qu'un — en silence.
    const [a, b] = ref.contestants;
    const homonymes: Referential = {
      ...ref,
      contestants: [
        { ...a!, displayName: 'Camille' },
        { ...b!, displayName: 'Camille' },
      ],
    };

    const entries = photoEntries(homonymes, [portrait(a!.id), portrait(b!.id)]);

    expect(entries.map(e => e.name)).toEqual([
      'portrait-camille.webp',
      'portrait-camille-2.webp',
    ]);
  });
});
