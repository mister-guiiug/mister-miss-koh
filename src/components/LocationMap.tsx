/**
 * Une carte du lieu de tournage, sans bibliothèque : des tuiles OpenStreetMap
 * posées côte à côte dans un SVG, et un repère au point exact.
 *
 * POURQUOI UN SVG. Le `viewBox` fait le cadrage : on demande la fenêtre de
 * 768 × 512 pixels centrée sur le point, à l'échelle de la carte, et le
 * navigateur découpe et redimensionne. Les tuiles qui couvrent cette fenêtre
 * — douze au plus — se calculent depuis la projection Web Mercator, la même
 * que toutes les cartes en ligne.
 *
 * CE QUE ÇA IMPLIQUE. Les tuiles viennent de la fondation OpenStreetMap :
 * usage léger, attribution obligatoire (ODbL), aucun préchargement — c'est le
 * seul hôte d'images externe de l'application, et la CSP le nomme. Hors
 * ligne, les tuiles manquent : le nom du lieu et le lien restent.
 */
import { ExternalLink } from 'lucide-react';
import { TILE, tilesFor } from './mapTiles';

interface Props {
  /** « Archipel des Perles (Panama) » */
  name: string;
  lat: number;
  lon: number;
  /** Niveau de zoom OpenStreetMap ; 6 montre la région, 8 la côte. */
  zoom?: number;
}

export function LocationMap({ name, lat, lon, zoom = 6 }: Props) {
  const { viewBox, point, tiles } = tilesFor(lat, lon, zoom);
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom + 2}/${lat}/${lon}`;

  return (
    <figure className="map">
      <svg
        className="map-canvas"
        viewBox={viewBox}
        role="img"
        aria-label={`Carte : ${name}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {tiles.map(t => (
          <image
            key={t.href}
            href={t.href}
            x={t.x}
            y={t.y}
            width={TILE}
            height={TILE}
          />
        ))}
        {/* Le repère : un halo qui respire, un point plein, un liseré clair
            pour rester lisible sur la mer comme sur la terre. */}
        <circle className="map-halo" cx={point.x} cy={point.y} r={22} />
        <circle className="map-pin" cx={point.x} cy={point.y} r={9} />
      </svg>
      <figcaption className="map-caption">
        <span>{name}</span>
        <a href={osmUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir dans OpenStreetMap <ExternalLink size={14} aria-hidden />
        </a>
        <small className="muted">
          ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            contributeurs OpenStreetMap
          </a>
        </small>
      </figcaption>
    </figure>
  );
}
