import tilebelt from '@mapbox/tilebelt';

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Parse bounding box string (format: minLon, minLat, maxLon, maxLat)
 */
export function parseBoundingBox(input: string): BoundingBox | null {
  const parts = input.split(',').map(s => s.trim());
  if (parts.length !== 4) return null;

  const [minLon, minLat, maxLon, maxLat] = parts.map(parseFloat);

  if (
    isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat) ||
    minLon >= maxLon || minLat >= maxLat ||
    minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90
  ) {
    return null;
  }

  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Calculate optimal zoom level for bounding box
 */
export function calculateZoomLevel(bbox: BoundingBox, maxTiles: number = 16): number {
  const lonDiff = bbox.maxLon - bbox.minLon;
  const latDiff = bbox.maxLat - bbox.minLat;

  // Start with a reasonable zoom level
  let zoom = 10;

  for (let z = 0; z <= 18; z++) {
    const topLeft = tilebelt.pointToTile(bbox.minLon, bbox.maxLat, z);
    const bottomRight = tilebelt.pointToTile(bbox.maxLon, bbox.minLat, z);

    const tilesX = Math.abs(bottomRight[0] - topLeft[0]) + 1;
    const tilesY = Math.abs(bottomRight[1] - topLeft[1]) + 1;
    const totalTiles = tilesX * tilesY;

    if (totalTiles <= maxTiles) {
      zoom = z;
    } else {
      break;
    }
  }

  return Math.max(8, Math.min(zoom, 15)); // Limit between 8-15 for performance
}

/**
 * Get all tile coordinates needed for bounding box
 */
export function getTilesForBoundingBox(bbox: BoundingBox, zoom: number): TileCoord[] {
  const topLeft = tilebelt.pointToTile(bbox.minLon, bbox.maxLat, zoom);
  const bottomRight = tilebelt.pointToTile(bbox.maxLon, bbox.minLat, zoom);

  const minX = Math.min(topLeft[0], bottomRight[0]);
  const maxX = Math.max(topLeft[0], bottomRight[0]);
  const minY = Math.min(topLeft[1], bottomRight[1]);
  const maxY = Math.max(topLeft[1], bottomRight[1]);

  const tiles: TileCoord[] = [];

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Convert tile coordinates to bounding box
 */
export function tileToBoundingBox(tile: TileCoord): BoundingBox {
  const bbox = tilebelt.tileToBBOX([tile.x, tile.y, tile.z]);
  return {
    minLon: bbox[0],
    minLat: bbox[1],
    maxLon: bbox[2],
    maxLat: bbox[3],
  };
}

/**
 * Get Mapbox tile URL
 */
export function getMapboxTileUrl(
  tile: TileCoord,
  style: 'satellite' | 'satellite-v9' | 'satellite-streets' | 'streets' | 'terrain-rgb',
  token: string
): string {
  const { x, y, z } = tile;

  switch (style) {
    case 'satellite':
      return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${token}`;
    case 'satellite-v9':
      return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/${z}/${x}/${y}@2x?access_token=${token}`;
    case 'satellite-streets':
      return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/${z}/${x}/${y}@2x?access_token=${token}`;
    case 'streets':
      return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/512/${z}/${x}/${y}@2x?access_token=${token}`;
    case 'terrain-rgb':
      return `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}@2x.png?access_token=${token}`;
  }
}

/**
 * Convert Terrain-RGB pixel to height in meters
 */
export function terrainRGBToHeight(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

