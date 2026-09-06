import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationMap } from './LocationMap';
import { projectToPixels, tilesFor } from './mapTiles';

describe('projectToPixels', () => {
  it('place l’origine au centre de la carte du monde', () => {
    expect(projectToPixels(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });
});

describe('tilesFor', () => {
  it('cadre une fenêtre 768 × 512 centrée sur le point, couverte par douze tuiles au plus', () => {
    const { viewBox, point, tiles } = tilesFor(8.33333333, -79.11666667, 6);
    const [x0, y0, w, h] = viewBox.split(' ').map(Number);
    expect(w).toBe(768);
    expect(h).toBe(512);
    expect(x0).toBeCloseTo(point.x - 384);
    expect(y0).toBeCloseTo(point.y - 256);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(12);
    for (const tile of tiles) {
      expect(tile.href).toMatch(
        /^https:\/\/tile\.openstreetmap\.org\/6\/\d+\/\d+\.png$/
      );
      // Chaque tuile touche la fenêtre : aucune n'est demandée pour rien.
      expect(tile.x).toBeLessThan((x0 ?? 0) + 768);
      expect(tile.x + 256).toBeGreaterThan(x0 ?? 0);
    }
  });

  it('la longitude boucle au bord de la carte', () => {
    const { tiles } = tilesFor(0, 179.9, 2);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every(t => /\/2\/[0-3]\/\d\.png$/.test(t.href))).toBe(true);
  });
});

describe('LocationMap', () => {
  it('rend une image nommée, l’attribution et le lien vers OpenStreetMap', () => {
    render(<LocationMap name="Île fictive" lat={-12.5} lon={45.25} />);
    expect(
      screen.getByRole('img', { name: 'Carte : Île fictive' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /contributeurs OpenStreetMap/ })
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(
      screen.getByRole('link', { name: /Ouvrir dans OpenStreetMap/ })
    ).toHaveAttribute('href', expect.stringContaining('mlat=-12.5'));
  });
});
