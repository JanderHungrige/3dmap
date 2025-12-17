import { BoundingBox, TileCoord, getMapboxTileUrl, tileToBoundingBox, terrainRGBToHeight } from './tileUtils';

/**
 * Stitch multiple tiles together into a single canvas
 */
export async function stitchTiles(
  tiles: TileCoord[],
  bbox: BoundingBox,
  style: 'satellite' | 'satellite-v9' | 'satellite-streets' | 'streets' | 'terrain-rgb',
  token: string
): Promise<{ canvas: HTMLCanvasElement; imageData?: ImageData }> {
  if (tiles.length === 0) {
    throw new Error('No tiles provided');
  }

  // Calculate the bounding box of all tiles
  const tileBboxes = tiles.map(tile => tileToBoundingBox(tile));
  const minLon = Math.min(...tileBboxes.map(b => b.minLon));
  const maxLon = Math.max(...tileBboxes.map(b => b.maxLon));
  const minLat = Math.min(...tileBboxes.map(b => b.minLat));
  const maxLat = Math.max(...tileBboxes.map(b => b.maxLat));

  // Determine tile size (Mapbox tiles are typically 512x512 at @2x)
  const tileSize = 512;

  // Calculate grid dimensions
  const tilesByX = new Map<number, TileCoord[]>();
  const tilesByY = new Map<number, TileCoord[]>();

  tiles.forEach(tile => {
    if (!tilesByX.has(tile.x)) tilesByX.set(tile.x, []);
    if (!tilesByY.has(tile.y)) tilesByY.set(tile.y, []);
    tilesByX.get(tile.x)!.push(tile);
    tilesByY.get(tile.y)!.push(tile);
  });

  const xCoords = Array.from(tilesByX.keys()).sort((a, b) => a - b);
  const yCoords = Array.from(tilesByY.keys()).sort((a, b) => a - b);

  const canvasWidth = xCoords.length * tileSize;
  const canvasHeight = yCoords.length * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Load and draw all tiles
  const tilePromises = tiles.map(async (tile) => {
    const url = getMapboxTileUrl(tile, style, token);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch tile: ${url}`);

      const blob = await response.blob();
      const img = await createImageBitmap(blob);

      const xIndex = xCoords.indexOf(tile.x);
      const yIndex = yCoords.indexOf(tile.y);

      const x = xIndex * tileSize;
      const y = yIndex * tileSize;

      ctx.drawImage(img, x, y, tileSize, tileSize);
      img.close();
    } catch (error) {
      console.error(`Error loading tile ${tile.x}/${tile.y}/${tile.z}:`, error);
      // Draw a placeholder (gray square)
      ctx.fillStyle = '#808080';
      ctx.fillRect(
        xCoords.indexOf(tile.x) * tileSize,
        yCoords.indexOf(tile.y) * tileSize,
        tileSize,
        tileSize
      );
    }
  });

  await Promise.all(tilePromises);

  // Crop canvas to exact bounding box
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d')!;

  // Calculate pixel positions for bounding box
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;

  const startX = ((bbox.minLon - minLon) / lonRange) * canvasWidth;
  const startY = ((maxLat - bbox.maxLat) / latRange) * canvasHeight;
  const cropWidth = ((bbox.maxLon - bbox.minLon) / lonRange) * canvasWidth;
  const cropHeight = ((bbox.maxLat - bbox.minLat) / latRange) * canvasHeight;

  croppedCanvas.width = Math.ceil(cropWidth);
  croppedCanvas.height = Math.ceil(cropHeight);

  croppedCtx.drawImage(
    canvas,
    Math.max(0, startX),
    Math.max(0, startY),
    cropWidth,
    cropHeight,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height
  );

  // Get ImageData for terrain-rgb processing
  let imageData: ImageData | undefined;
  if (style === 'terrain-rgb') {
    imageData = croppedCtx.getImageData(0, 0, croppedCanvas.width, croppedCanvas.height);
  }

  return { canvas: croppedCanvas, imageData };
}

/**
 * Convert terrain-rgb ImageData to heightmap data
 */
export function createHeightmapFromTerrainRGB(
  imageData: ImageData,
  width: number,
  height: number
): Float32Array {
  const heightmap = new Float32Array(width * height);
  const data = imageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    heightmap[i] = terrainRGBToHeight(r, g, b);
  }

  return heightmap;
}

