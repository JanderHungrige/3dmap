import { NextRequest, NextResponse } from 'next/server';
import { BoundingBox, getTilesForBoundingBox, tileToBoundingBox } from '@/lib/tileUtils';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import bboxClip from '@turf/bbox-clip';
import { polygon, multiPolygon, feature } from '@turf/helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { minLon, minLat, maxLon, maxLat } = body;

    // Validate input
    if (
      typeof minLon !== 'number' ||
      typeof minLat !== 'number' ||
      typeof maxLon !== 'number' ||
      typeof maxLat !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid bounding box coordinates' }, { status: 400 });
    }

    const bbox: BoundingBox = { minLon, minLat, maxLon, maxLat };
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Mapbox token not found' }, { status: 500 });
    }

    // 1. Calculate tiles needed. Zoom 15 is standard for buildings.
    const ZOOM = 15;
    const tiles = getTilesForBoundingBox(bbox, ZOOM);

    const buildingFeatures: any[] = [];
    const seenIds = new Set<string | number>();

    // 2. Fetch and parse each tile
    await Promise.all(tiles.map(async (tile) => {
      try {
        const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${tile.z}/${tile.x}/${tile.y}.vector.pbf?access_token=${token}`;
        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`Failed to fetch tile ${tile.x}/${tile.y}/${tile.z}: ${response.statusText}`);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const pbf = new Pbf(new Uint8Array(arrayBuffer));
        const vectorTile = new VectorTile(pbf);

        const buildingLayer = vectorTile.layers['building'];
        if (!buildingLayer) return;

        const tileBbox = tileToBoundingBox(tile);
        const tileWidth = tileBbox.maxLon - tileBbox.minLon;
        const tileHeight = tileBbox.maxLat - tileBbox.minLat;

        for (let i = 0; i < buildingLayer.length; i++) {
          const vectFeature = buildingLayer.feature(i);

          // Deduplicate by ID
          if (vectFeature.id !== undefined && seenIds.has(vectFeature.id)) {
            continue;
          }
          if (vectFeature.id !== undefined) {
            seenIds.add(vectFeature.id);
          }

          // Convert geometry to GeoJSON
          const geometry = vectFeature.loadGeometry();

          // Helper to convert tile coordinates to Lat/Lon
          const convertPoint = (p: { x: number, y: number }) => {
            const xPercent = p.x / vectFeature.extent;
            const yPercent = p.y / vectFeature.extent;

            const lon = tileBbox.minLon + (xPercent * tileWidth);
            const lat = tileBbox.maxLat - (yPercent * tileHeight);
            return [lon, lat];
          };

          const rings: number[][][] = [];
          for (const ring of geometry) {
            const convertedRing = ring.map(convertPoint);
            rings.push(convertedRing);
          }

          const properties = vectFeature.properties;

          // Create Turft Feature for Clipping
          const geoJsonFeature = polygon(rings, {
            ...properties,
            height: properties.height || properties.render_height || 5
          });

          // Clip to bounding box
          // bboxClip takes feature and [minX, minY, maxX, maxY]
          const clipped = bboxClip(geoJsonFeature, [minLon, minLat, maxLon, maxLat]);

          if (clipped && clipped.geometry && clipped.geometry.coordinates.length > 0) {
            // bboxClip might return Polygon or MultiPolygon. Ensure we handle it.
            buildingFeatures.push(clipped);
          }
        }

      } catch (err) {
        console.error(`Error processing tile ${tile.x}/${tile.y}/${tile.z}:`, err);
      }
    }));

    return NextResponse.json({
      type: 'FeatureCollection',
      features: buildingFeatures
    });

  } catch (error) {
    console.error('Error in fetch-mapbox-buildings API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
