/**
 * La géométrie de la carte du lieu — projection Web Mercator et tuiles
 * OpenStreetMap — SANS React : c'est ce qui se teste au pixel près, et ce que
 * Fast Refresh demande de tenir hors du fichier du composant.
 */

export const TILE = 256;
export const WIDTH = 768;
export const HEIGHT = 512;
const TILES_URL = 'https://tile.openstreetmap.org';

/** Le point en pixels « monde » au zoom donné (projection Web Mercator). */
export function projectToPixels(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n * TILE;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE;
  return { x, y };
}

export interface Tile {
  readonly href: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Les tuiles qui couvrent la fenêtre de 768 × 512 centrée sur le point —
 * jamais plus que nécessaire (douze au plus), et la longitude boucle aux
 * bords de la carte.
 */
export function tilesFor(
  lat: number,
  lon: number,
  zoom: number
): {
  readonly viewBox: string;
  readonly point: { x: number; y: number };
  readonly tiles: readonly Tile[];
} {
  const n = 2 ** zoom;
  const point = projectToPixels(lat, lon, zoom);
  const x0 = point.x - WIDTH / 2;
  const y0 = point.y - HEIGHT / 2;
  const tiles: Tile[] = [];
  for (
    let tx = Math.floor(x0 / TILE);
    tx <= Math.floor((x0 + WIDTH - 1) / TILE);
    tx += 1
  ) {
    for (
      let ty = Math.floor(y0 / TILE);
      ty <= Math.floor((y0 + HEIGHT - 1) / TILE);
      ty += 1
    ) {
      if (ty < 0 || ty >= n) continue;
      const wrapped = ((tx % n) + n) % n;
      tiles.push({
        href: `${TILES_URL}/${zoom}/${wrapped}/${ty}.png`,
        x: tx * TILE,
        y: ty * TILE,
      });
    }
  }
  return { viewBox: `${x0} ${y0} ${WIDTH} ${HEIGHT}`, point, tiles };
}
