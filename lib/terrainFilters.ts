/**
 * Artifact filtering utilities for terrain height data
 */

export type FilterMethod = 'none' | 'capping' | 'median';

export const MAX_SPIKE_HEIGHT = 3500; // meters - reasonable maximum elevation
export const MEDIAN_SPIKE_THRESHOLD = 200; // meters - threshold for spike detection

/**
 * Convert Terrain-RGB pixel to height in meters
 */
function terrainRGBToHeight(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

/**
 * Apply capping filter: clamp heights above MAX_SPIKE_HEIGHT
 */
export function applyCappingFilter(
  imageData: ImageData,
  width: number,
  height: number
): Float32Array {
  const filtered = new Float32Array(width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const elevation = terrainRGBToHeight(r, g, b);
    
    // Cap at maximum spike height
    filtered[i] = Math.min(elevation, MAX_SPIKE_HEIGHT);
  }

  return filtered;
}

/**
 * Calculate median of an array of numbers
 */
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Get 8-neighbor heights for a pixel (handles boundaries)
 */
function getNeighborHeights(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number[] {
  const neighbors: number[] = [];
  
  // 8-neighbor offsets: top-left, top, top-right, left, right, bottom-left, bottom, bottom-right
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
  ];
  
  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    
    // Check bounds
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      const idx = ny * width + nx;
      neighbors.push(heights[idx]);
    }
  }
  
  return neighbors;
}

/**
 * Apply median filter: replace spikes with median of neighbors
 */
export function applyMedianFilter(
  imageData: ImageData,
  width: number,
  height: number
): Float32Array {
  // First, decode all heights
  const heights = new Float32Array(width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    heights[i] = terrainRGBToHeight(r, g, b);
  }

  // Then apply median filter
  const filtered = new Float32Array(heights);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const currentHeight = heights[idx];
      
      // Get neighbor heights
      const neighborHeights = getNeighborHeights(heights, width, height, x, y);
      
      if (neighborHeights.length > 0) {
        const medianHeight = calculateMedian(neighborHeights);
        
        // Check if current pixel is a spike (>200m above median)
        if (currentHeight - medianHeight > MEDIAN_SPIKE_THRESHOLD) {
          // Replace with median
          filtered[idx] = medianHeight;
        }
      }
    }
  }

  return filtered;
}

/**
 * Apply no filtering (raw data)
 */
export function applyNoFilter(
  imageData: ImageData,
  width: number,
  height: number
): Float32Array {
  const heights = new Float32Array(width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    heights[i] = terrainRGBToHeight(r, g, b);
  }

  return heights;
}

/**
 * Apply the selected filter method to terrain ImageData
 */
export function applyTerrainFilter(
  imageData: ImageData,
  width: number,
  height: number,
  filterMethod: FilterMethod
): Float32Array {
  switch (filterMethod) {
    case 'capping':
      return applyCappingFilter(imageData, width, height);
    case 'median':
      return applyMedianFilter(imageData, width, height);
    case 'none':
    default:
      return applyNoFilter(imageData, width, height);
  }
}

