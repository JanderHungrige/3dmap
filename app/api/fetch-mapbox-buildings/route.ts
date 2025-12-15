import { NextRequest, NextResponse } from 'next/server';
import { BoundingBox, getTilesForBoundingBox, tileToBoundingBox } from '@/lib/tileUtils';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

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
          const feature = buildingLayer.feature(i);
          
          // Deduplicate by ID
          if (feature.id !== undefined && seenIds.has(feature.id)) {
            continue;
          }
          if (feature.id !== undefined) {
            seenIds.add(feature.id);
          }

          // Convert geometry to GeoJSON
          const geometry = feature.loadGeometry();
          const coordinates: number[][][] = []; // MultiPolygon structure

          // Helper to convert tile coordinates to Lat/Lon
          // Vector tiles default extent is 4096
          const convertPoint = (p: {x: number, y: number}) => {
             const xPercent = p.x / feature.extent;
             const yPercent = p.y / feature.extent;
             
             const lon = tileBbox.minLon + (xPercent * tileWidth);
             const lat = tileBbox.maxLat - (yPercent * tileHeight);
             return [lon, lat];
          };

          // Process geometry rings
          // MVT polygons are array of rings. First ring is exterior, subsequent are holes.
          // Note: We are simplifying structure here. Ideally we should robustly handle MultiPolygons.
          // For simple rendering: extract outer rings.
          
          const rings: number[][] = [];
          
          for (const ring of geometry) {
             const convertedRing = ring.map(convertPoint);
             rings.push(convertedRing);
          }
           
          // Simple polygon handling: push as a single polygon with holes if formatted that way
          // BUT: loadGeometry() returns arrays of Points.
          // A Polygon in GeoJSON is [ [outer], [hole], [hole] ]
          // MVT loadGeometry returns [ [x,y], [x,y]... ] corresponding to rings.
          // We can just push this structure directly as a Polygon coordinates.
          
          // Check for building height
          // properties usually have 'height' or 'render_height' or 'min_height'
          const properties = feature.properties;
          
          // Filter if completely outside our requested bbox (optional optimization)
          // But since we selected tiles intersecting bbox, most will be relevant.

          buildingFeatures.push({
            type: 'Feature',
            id: feature.id,
            geometry: {
              type: 'Polygon',
              coordinates: rings 
            },
            properties: {
             ...properties,
             // Ensure height exists for rendering
             height: properties.height || properties.render_height || 5 // default fallback
            }
          });
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
