/**
 * Les fichiers `.riv` publiés sont ceux que le script écrit, octet pour
 * octet : un fichier retouché à la main, ou un script modifié sans
 * régénération, se verrait ici plutôt qu'à l'écran.
 *
 * `?inline` de Vite plutôt que `node:fs` : ce dossier est du code de
 * navigateur, son `tsconfig` n'a pas les types de Node (voir
 * `manifeste.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from './registry';
// @ts-expect-error — script Node en JavaScript, sans déclaration de types.
import { fichiers } from '../../scripts/rive/animations.mjs';

const publies = import.meta.glob<string>('../../public/animations/*.riv', {
  query: '?inline',
  import: 'default',
  eager: true,
});

function octetsDe(dataUrl: string): number[] {
  const binaire = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Array.from(binaire, c => c.charCodeAt(0));
}

describe('les animations Rive écrites par du code', () => {
  const produits = fichiers() as Record<string, Uint8Array>;

  it('en-tête RIVE, format 7', () => {
    for (const octets of Object.values(produits)) {
      expect(String.fromCharCode(...octets.slice(0, 4))).toBe('RIVE');
      expect(octets[4]).toBe(7);
    }
  });

  it('les fichiers publiés sont à jour (npm run animations:rive)', () => {
    const noms = Object.keys(publies).map(p => p.split('/').pop());
    expect(noms.sort()).toEqual(Object.keys(produits).sort());
    for (const [chemin, dataUrl] of Object.entries(publies)) {
      const nom = chemin.split('/').pop()!;
      expect(octetsDe(dataUrl), nom).toEqual(Array.from(produits[nom]!));
    }
  });

  it('chaque rôle à fichier existe dans les deux thèmes', () => {
    for (const [role, spec] of Object.entries(ANIMATIONS)) {
      if (!spec.src) continue;
      for (const theme of ['clair', 'sombre']) {
        const nom = spec.src.replace('{theme}', theme).split('/').pop()!;
        expect(produits[nom], `${role} : ${nom}`).toBeDefined();
      }
    }
  });
});
