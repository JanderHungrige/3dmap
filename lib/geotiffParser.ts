/**
 * GeoTIFF parsing utilities for GBA.Height data
 * 
 * This module handles parsing GeoTIFF raster data from TUM GBA.Height
 * and converting it to a height matrix for terrain rendering.
 * 
 * REAL-WORLD IMPLEMENTATION:
 * ==========================
 * In production, use geotiff.js library:
 *   npm install geotiff
 * 
 * Example usage:
 *   import { fromArrayBuffer } from 'geotiff';
 *   const tiff = await fromArrayBuffer(buffer);
 *   const image = await tiff.getImage();
 *   const rasters = await image.readRasters();
 *   const elevationData = rasters[0]; // First band contains elevation
 */

export interface GeoTIFFData {
  width: number;
  height: number;
  bounds: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  data: Float32Array; // Elevation values in meters
  noDataValue?: number; // Value representing no data
}

/**
 * Parse GeoTIFF buffer to elevation data
 * 
 * TODO: In production, implement actual GeoTIFF parsing:
 * 
 * import { fromArrayBuffer } from 'geotiff';
 * 
 * export async function parseGeoTIFF(buffer: ArrayBuffer): Promise<GeoTIFFData> {
 *   const tiff = await fromArrayBuffer(buffer);
 *   const image = await tiff.getImage();
 *   
 *   // Get image dimensions
 *   const width = image.getWidth();
 *   const height = image.getHeight();
 *   
 *   // Get bounding box from GeoTIFF metadata
 *   const bbox = image.getBoundingBox();
 *   
 *   // Read elevation raster (first band)
 *   const rasters = await image.readRasters();
 *   const elevationData = new Float32Array(rasters[0] as number[]);
 *   
 *   return {
 *     width,
 *     height,
 *     bounds: {
 *       minLon: bbox[0],
 *       minLat: bbox[1],
 *       maxLon: bbox[2],
 *       maxLat: bbox[3],
 *     },
 *     data: elevationData,
 *     noDataValue: image.getGDALNoData(),
 *   };
 * }
 */

/**
 * Convert GBA API terrain response to Float32Array height matrix
 * This is a temporary helper until actual GeoTIFF parsing is implemented
 */
export function convertGBATerrainToHeights(
  terrainData: {
    width: number;
    height: number;
    bounds: {
      minLon: number;
      minLat: number;
      maxLon: number;
      maxLat: number;
    };
    data: number[];
  }
): Float32Array {
  return new Float32Array(terrainData.data);
}

/**
 * Get elevation value at specific coordinates (bilinear interpolation)
 * For use with GBA.Height data (3m resolution)
 */
export function sampleElevationFromGBA(
  heights: Float32Array,
  width: number,
  height: number,
  u: number, // Normalized X coordinate (0-1)
  v: number   // Normalized Y coordinate (0-1)
): number {
  // Clamp to valid range
  u = Math.max(0, Math.min(1, u));
  v = Math.max(0, Math.min(1, v));

  // Convert to pixel coordinates
  const x = u * (width - 1);
  const y = v * (height - 1);

  // Get integer coordinates
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  // Get fractional parts for interpolation
  const fx = x - x0;
  const fy = y - y0;

  // Sample four corner values
  const idx00 = y0 * width + x0;
  const idx10 = y0 * width + x1;
  const idx01 = y1 * width + x0;
  const idx11 = y1 * width + x1;

  const h00 = heights[idx00];
  const h10 = heights[idx10];
  const h01 = heights[idx01];
  const h11 = heights[idx11];

  // Bilinear interpolation
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  const elevation = h0 * (1 - fy) + h1 * fy;

  return elevation;
}
