/**
 * Artifact filtering utilities for terrain height data
 */

export type FilterMethod = 'none' | 'capping' | 'median';

export const MAX_SPIKE_HEIGHT = 3500; // meters - reasonable maximum elevation
export const ABSOLUTE_MAX_HEIGHT = 8000; // Hard cap for extreme outliers (pre-filter safety)
export const HAMPEL_THRESHOLD_MULTIPLIER = 3.0; // k value for Hampel filter (standard robust threshold)

/**
 * Convert Terrain-RGB pixel to height in meters
 * Applies absolute maximum height cap as pre-filter safety measure
 */
function terrainRGBToHeight(r: number, g: number, b: number): number {
  const height = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
  // Hard cap at ABSOLUTE_MAX_HEIGHT to prevent extreme outliers
  return Math.min(height, ABSOLUTE_MAX_HEIGHT);
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
 * Get 5x5 kernel heights for a pixel (handles boundaries)
 * Returns all 25 pixels including center (for Hampel filter)
 */
function get5x5KernelHeights(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number[] {
  const kernelHeights: number[] = [];
  
  // 5x5 kernel: iterate from (x-2, y-2) to (x+2, y+2), including center
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      
      // Only sample pixels within bounds
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        kernelHeights.push(heights[idx]);
      }
    }
  }
  
  return kernelHeights;
}

/**
 * Calculate Median Absolute Deviation (MAD)
 * MAD = Median(|H_i - M|) where M is the median of the values
 */
function calculateMAD(values: number[], median: number): number {
  const absoluteDeviations = values.map(v => Math.abs(v - median));
  return calculateMedian(absoluteDeviations);
}

/**
 * Apply Hampel filter with 5x5 kernel: statistically robust outlier detection
 * Uses Median Absolute Deviation (MAD) for adaptive spike detection
 */
export function applyHampelFilter(
  imageData: ImageData,
  width: number,
  height: number
): Float32Array {
  // First, decode all heights (with absolute max cap applied)
  const heights = new Float32Array(width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    heights[i] = terrainRGBToHeight(r, g, b);
  }

  // Then apply 5x5 Hampel filter
  const filtered = new Float32Array(heights);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const centerHeight = heights[idx];
      
      // Get 5x5 kernel heights (25 points including center)
      const kernelHeights = get5x5KernelHeights(heights, width, height, x, y);
      
      // Only process if we have enough samples (at least 9 points for meaningful statistics)
      // For pixels within 2 pixels of edge, we may have fewer samples
      if (kernelHeights.length >= 9) {
        // Step 1: Calculate local median M
        const localMedian = calculateMedian(kernelHeights);
        
        // Step 2: Calculate Median Absolute Deviation (MAD)
        const mad = calculateMAD(kernelHeights, localMedian);
        
        // Step 3: Threshold check - spike if |H_center - M| > k * MAD
        // Use a small epsilon to handle near-zero MAD cases
        const epsilon = 0.01;
        const threshold = HAMPEL_THRESHOLD_MULTIPLIER * (mad + epsilon);
        const deviation = Math.abs(centerHeight - localMedian);
        
        const isSpike = deviation > threshold;
        
        if (isSpike) {
          // Step 4: Replace spike with local median M
          filtered[idx] = localMedian;
        }
      }
      // For boundary pixels with insufficient samples (<9), keep original value
      // (they're already capped by ABSOLUTE_MAX_HEIGHT during decoding)
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
      // 'median' now maps to Hampel filter for backward compatibility
      return applyHampelFilter(imageData, width, height);
    case 'none':
    default:
      return applyNoFilter(imageData, width, height);
  }
}

