/**
 * Hook for fetching TUM GBA data
 * 
 * This hook manages loading GBA.LoD1 (buildings) and GBA.Height (terrain) data
 * from the API endpoint and provides loading states.
 */

import { useState, useEffect } from 'react';
import { BoundingBox } from '@/lib/tileUtils';

export interface GBABuildings {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][];
    };
    properties: {
      height: number;
      [key: string]: any;
    };
  }>;
}

export interface GBATerrain {
  width: number;
  height: number;
  bounds: BoundingBox;
  data: number[];
}

export interface GBAData {
  buildings: GBABuildings;
  terrain: GBATerrain;
  metadata: {
    resolution: string;
    buildingCount: number;
    dataSource: string;
  };
}

export interface UseGBADataResult {
  data: GBAData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch GBA data for a bounding box
 */
export function useGBAData(bbox: BoundingBox | null): UseGBADataResult {
  const [data, setData] = useState<GBAData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bbox) {
      setData(null);
      return;
    }

    const fetchGBAData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/fetch-gba-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            minLon: bbox.minLon,
            minLat: bbox.minLat,
            maxLon: bbox.maxLon,
            maxLat: bbox.maxLat,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch GBA data');
        }

        const gbaData: GBAData = await response.json();

        // Log for debugging
        console.log(`[useGBAData] Loaded ${gbaData.metadata.buildingCount} buildings`);
        console.log(`[useGBAData] Terrain: ${gbaData.terrain.width}x${gbaData.terrain.height} (${gbaData.metadata.resolution})`);

        setData(gbaData);
      } catch (err) {
        console.error('Error fetching GBA data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch GBA data');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchGBAData();
  }, [bbox]);

  return { data, loading, error };
}
