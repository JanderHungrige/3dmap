'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { BoundingBox } from '@/lib/tileUtils';
import { stitchTiles } from '@/lib/tileStitcher';
import { getTilesForBoundingBox, calculateZoomLevel } from '@/lib/tileUtils';
import { FilterMethod, applyTerrainFilter } from '@/lib/terrainFilters';
import { CanvasControls } from './CanvasControls';

/**
 * CityscapeMap - Hybrid R3F Terrain + Deck.gl Buildings
 * 
 * This component combines:
 * - R3F terrain rendering (exact same logic as MapCanvas)
 * - Deck.gl overlay for Mapbox 3D buildings
 * - Synchronized camera/viewport between R3F and Deck.gl
 */

interface CityscapeMapProps {
  bbox: BoundingBox;
  textureType: 'satellite' | 'streets' | 'heatmap';
  heightExaggeration: number;
  autoRotate: boolean;
  meshResolution: 128 | 256 | 512 | 1024;
  filterMethod: FilterMethod;
  useRealScale: boolean;
  onUseRealScaleChange: () => void;
  onLoadingChange: (loading: boolean) => void;
  onExportReady: (functions: {
    exportJPEG: () => void;
    exportPNG: () => void;
    exportGLB: () => void;
    exportOBJ: () => void;
    exportSTL: () => void;
    exportSVG: () => void;
  }) => void;
  showBuildings: boolean;
  showUI?: boolean;
}

/**
 * Calculate distance in meters - EXACT COPY from MapCanvas
 */
function calculateDistanceMeters(
  lon1: number, lat1: number,
  lon2: number, lat2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const avgLat = (lat1 + lat2) * Math.PI / 360;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate heatmap texture - EXACT COPY from MapCanvas
 */
function generateHeatmapTexture(
  terrainImageData: ImageData,
  width: number,
  height: number,
  minElevation: number,
  maxElevation: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);

  const elevationRange = maxElevation - minElevation;
  const data = terrainImageData.data;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
    const normalized = elevationRange > 0
      ? (elevation - minElevation) / elevationRange
      : 0.5;
    const clamped = Math.max(0, Math.min(1, normalized));

    let red, green, blue;
    if (clamped < 0.5) {
      const t = clamped * 2;
      red = 0;
      green = Math.round(255 * t);
      blue = 255;
    } else {
      const t = (clamped - 0.5) * 2;
      red = Math.round(255 * t);
      green = Math.round(255 * (1 - t));
      blue = 0;
    }

    imageData.data[idx] = red;
    imageData.data[idx + 1] = green;
    imageData.data[idx + 2] = blue;
    imageData.data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * TerrainMesh - EXACT COPY from MapCanvas.tsx
 * This ensures the terrain is identical to the R3F mode
 */
function TerrainMesh({
  bbox,
  textureType,
  heightExaggeration,
  meshResolution,
  filterMethod,
  useRealScale,
  satelliteTexture,
  streetsTexture,
  heatmapTexture,
  terrainImageData,
  terrainWidth,
  terrainHeight,
  minElevation,
  maxElevation,
}: {
  bbox: BoundingBox;
  textureType: 'satellite' | 'streets' | 'heatmap';
  heightExaggeration: number;
  meshResolution: 128 | 256 | 512 | 1024;
  filterMethod: FilterMethod;
  useRealScale: boolean;
  satelliteTexture: THREE.Texture | null;
  streetsTexture: THREE.Texture | null;
  heatmapTexture: THREE.Texture | null;
  terrainImageData: ImageData | null;
  minElevation: number;
  maxElevation: number;
  terrainWidth: number;
  terrainHeight: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const lonDiff = bbox.maxLon - bbox.minLon;
  const latDiff = bbox.maxLat - bbox.minLat;
  const planeWidth = 10;
  const planeHeight = 10 * (latDiff / lonDiff);

  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const horizontalDistanceMeters = calculateDistanceMeters(
    bbox.minLon, avgLat,
    bbox.maxLon, avgLat
  );

  const geometryRef = useRef<THREE.PlaneGeometry>(
    new THREE.PlaneGeometry(planeWidth, planeHeight, meshResolution, meshResolution)
  );

  useEffect(() => {
    if (geometryRef.current) {
      geometryRef.current.dispose();
    }
    geometryRef.current = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      meshResolution,
      meshResolution
    );

    if (meshRef.current) {
      meshRef.current.geometry = geometryRef.current;
    }
  }, [meshResolution, planeWidth, planeHeight]);

  useEffect(() => {
    if (!meshRef.current || !terrainImageData || !geometryRef.current) return;

    const geometry = geometryRef.current;
    const positions = geometry.attributes.position.array as Float32Array;
    const segments = meshResolution;

    const filteredHeights = applyTerrainFilter(
      terrainImageData,
      terrainWidth,
      terrainHeight,
      filterMethod
    );

    let minElev = Infinity;
    let maxElev = -Infinity;

    for (let i = 0; i < filteredHeights.length; i++) {
      const elevation = filteredHeights[i];
      if (elevation < minElev) minElev = elevation;
      if (elevation > maxElev) maxElev = elevation;
    }

    const elevationRange = maxElev - minElev;

    let baseScale: number;
    if (useRealScale) {
      if (horizontalDistanceMeters > 0) {
        const horizontalScaleFactor = planeWidth / horizontalDistanceMeters;
        baseScale = horizontalScaleFactor;
      } else {
        baseScale = 0.1;
      }
    } else {
      const targetElevationUnits = planeWidth * 0.25;
      baseScale = elevationRange > 0
        ? targetElevationUnits / elevationRange
        : 0.01;
    }

    const sampleHeight = (x: number, y: number): number => {
      const px = Math.max(0, Math.min(Math.floor(x), terrainWidth - 1));
      const py = Math.max(0, Math.min(Math.floor(y), terrainHeight - 1));
      return filteredHeights[py * terrainWidth + px];
    };

    for (let i = 0; i < positions.length / 3; i++) {
      const vertexX = i % (segments + 1);
      const vertexY = Math.floor(i / (segments + 1));

      const u = vertexX / segments;
      const v = vertexY / segments;

      const terrainX = u * (terrainWidth - 1);
      const terrainY = v * (terrainHeight - 1);

      const x0 = Math.floor(terrainX);
      const y0 = Math.floor(terrainY);
      const x1 = Math.min(x0 + 1, terrainWidth - 1);
      const y1 = Math.min(y0 + 1, terrainHeight - 1);

      const fx = terrainX - x0;
      const fy = terrainY - y0;

      const h00 = sampleHeight(x0, y0);
      const h10 = sampleHeight(x1, y0);
      const h01 = sampleHeight(x0, y1);
      const h11 = sampleHeight(x1, y1);

      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const elevationMeters = h0 * (1 - fy) + h1 * fy;

      let elevation: number;
      if (useRealScale) {
        elevation = elevationMeters * baseScale * heightExaggeration;
      } else {
        const normalizedElevation = elevationMeters - minElev;
        elevation = normalizedElevation * baseScale * heightExaggeration;
      }

      positions[i * 3 + 2] = elevation;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
  }, [terrainImageData, heightExaggeration, terrainWidth, terrainHeight, planeWidth, meshResolution, filterMethod, useRealScale, horizontalDistanceMeters]);

  const texture = textureType === 'satellite'
    ? satelliteTexture
    : textureType === 'heatmap'
      ? heatmapTexture
      : streetsTexture;

  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      castShadow
      geometry={geometryRef.current}
      userData={{ isTerrain: true }}
    >
      <meshStandardMaterial
        map={texture || undefined}
        roughness={0.7}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Convert lat/lon to 3D coordinates - matches terrain mapping
 */
function latLonTo3D(
  lon: number,
  lat: number,
  bbox: BoundingBox,
  planeWidth: number,
  planeHeight: number
): [number, number] {
  const u = (lon - bbox.minLon) / (bbox.maxLon - bbox.minLon);
  const v = (lat - bbox.minLat) / (bbox.maxLat - bbox.minLat);
  const x = (u - 0.5) * planeWidth;
  const z = (0.5 - v) * planeHeight;
  return [x, z];
}

/**
 * Convert GeoJSON polygon to Three.js Shape
 */
function polygonToShape(
  coordinates: number[][][],
  bbox: BoundingBox,
  planeWidth: number,
  planeHeight: number,
  invertZ: boolean = false
): THREE.Shape {
  const shape = new THREE.Shape();

  coordinates.forEach((ring, ringIndex) => {
    const points: THREE.Vector2[] = [];
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const [x, z] = latLonTo3D(lon, lat, bbox, planeWidth, planeHeight);
      // If invertZ is true, we use -z for the Y coordinate of the shape
      points.push(new THREE.Vector2(x, invertZ ? -z : z));
    }

    if (ringIndex === 0) {
      shape.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
      }
      shape.lineTo(points[0].x, points[0].y);
    } else {
      const hole = new THREE.Path();
      hole.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        hole.lineTo(points[i].x, points[i].y);
      }
      hole.lineTo(points[0].x, points[0].y);
      shape.holes.push(hole);
    }
  });

  return shape;
}

/**
 * Building component - renders extruded building from GeoJSON
 * Uses Three.js directly (no Deck.gl needed)
 */
function Building({
  feature,
  bbox,
  planeWidth,
  planeHeight,
  heightExaggeration,
  useRealScale,
  terrainImageData,
  terrainWidth,
  terrainHeight,
}: {
  feature: {
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][];
    };
    properties: {
      height?: number;
      render_height?: number;
    };
  };
  bbox: BoundingBox;
  planeWidth: number;
  planeHeight: number;
  heightExaggeration: number;
  useRealScale: boolean;
  terrainImageData: ImageData | null;
  terrainWidth: number;
  terrainHeight: number;
}) {
  const buildingHeight = feature.properties.render_height || feature.properties.height || 10;

  // Calculate base elevation at building center
  let baseElevation = 0;
  if (terrainImageData) {
    const coords = feature.geometry.coordinates[0];
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of coords) {
      sumLon += lon;
      sumLat += lat;
    }
    const centerLon = sumLon / coords.length;
    const centerLat = sumLat / coords.length;

    const u = (centerLon - bbox.minLon) / (bbox.maxLon - bbox.minLon);
    const v = (centerLat - bbox.minLat) / (bbox.maxLat - bbox.minLat);

    const x = Math.floor(u * (terrainWidth - 1));
    const y = Math.floor((1 - v) * (terrainHeight - 1));

    if (x >= 0 && x < terrainWidth && y >= 0 && y < terrainHeight) {
      const idx = (y * terrainWidth + x) * 4;
      const r = terrainImageData.data[idx];
      const g = terrainImageData.data[idx + 1];
      const b = terrainImageData.data[idx + 2];
      baseElevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
    }
  }

  // Calculate scale - same as terrain
  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const lonDiff = bbox.maxLon - bbox.minLon;
  const metersPerDegreeLon = 111320 * Math.cos(avgLat * Math.PI / 180);
  const horizontalMeters = lonDiff * metersPerDegreeLon;
  const horizontalScaleFactor = planeWidth / horizontalMeters;

  const scaledHeight = useRealScale
    ? buildingHeight * horizontalScaleFactor // Decoupled from heightExaggeration
    : buildingHeight * 0.01; // Decoupled from heightExaggeration

  const scaledBaseElevation = useRealScale
    ? baseElevation * horizontalScaleFactor * heightExaggeration
    : baseElevation * 0.01 * heightExaggeration;

  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];

  return (
    <group>
      {polygons.map((polygonCoords, idx) => {
        // Invert Z for Shape Y to match rotated coordinate system
        // World North is -Z. rotated -90 X means Local Y -> World -Z.
        // So Local Y must be Positive for North.
        // latLonTo3D returns negative Z for North. So we invert it.
        const shape = polygonToShape(polygonCoords, bbox, planeWidth, planeHeight, true);

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: scaledHeight,
          bevelEnabled: false,
        });

        return (
          <mesh
            key={idx}
            geometry={geometry}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, scaledBaseElevation, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={0xcccccc}
              roughness={0.7}
              metalness={0.1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function CityscapeMap({
  bbox,
  textureType,
  heightExaggeration,
  autoRotate,
  meshResolution,
  filterMethod,
  useRealScale,
  onUseRealScaleChange,
  onLoadingChange,
  onExportReady,
  showBuildings,
  showUI = true,
}: CityscapeMapProps) {
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [streetsTexture, setStreetsTexture] = useState<THREE.Texture | null>(null);
  const [heatmapTexture, setHeatmapTexture] = useState<THREE.Texture | null>(null);
  const [terrainImageData, setTerrainImageData] = useState<ImageData | null>(null);
  const [minElevation, setMinElevation] = useState(0);
  const [maxElevation, setMaxElevation] = useState(0);
  const [textureWidth, setTextureWidth] = useState(0);
  const [textureHeight, setTextureHeight] = useState(0);
  const [buildings, setBuildings] = useState<{
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: number[][][];
      };
      properties: {
        height?: number;
        render_height?: number;
        [key: string]: any;
      };
    }>;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load terrain data - EXACT COPY from MapCanvas
  useEffect(() => {
    if (!bbox) return;

    const loadTiles = async () => {
      onLoadingChange(true);
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      if (!token) {
        console.error('Mapbox token not found');
        onLoadingChange(false);
        return;
      }

      try {
        const zoom = calculateZoomLevel(bbox);
        const tiles = getTilesForBoundingBox(bbox, zoom);

        const satelliteResult = await stitchTiles(tiles, bbox, 'satellite', token);
        const satelliteTexture = new THREE.Texture(satelliteResult.canvas);
        satelliteTexture.needsUpdate = true;
        setSatelliteTexture(satelliteTexture);
        setTextureWidth(satelliteResult.canvas.width);
        setTextureHeight(satelliteResult.canvas.height);

        const streetsResult = await stitchTiles(tiles, bbox, 'streets', token);
        const streetsTexture = new THREE.Texture(streetsResult.canvas);
        streetsTexture.needsUpdate = true;
        setStreetsTexture(streetsTexture);

        const terrainResult = await stitchTiles(tiles, bbox, 'terrain-rgb', token);
        if (terrainResult.imageData) {
          setTerrainImageData(terrainResult.imageData);

          const filteredHeights = applyTerrainFilter(
            terrainResult.imageData,
            terrainResult.imageData.width,
            terrainResult.imageData.height,
            filterMethod
          );

          let min = Infinity;
          let max = -Infinity;
          for (let i = 0; i < filteredHeights.length; i++) {
            if (filteredHeights[i] < min) min = filteredHeights[i];
            if (filteredHeights[i] > max) max = filteredHeights[i];
          }
          setMinElevation(min);
          setMaxElevation(max);

          const heatmapCanvas = generateHeatmapTexture(
            terrainResult.imageData,
            terrainResult.imageData.width,
            terrainResult.imageData.height,
            min,
            max
          );
          const heatmapTexture = new THREE.Texture(heatmapCanvas);
          heatmapTexture.needsUpdate = true;
          setHeatmapTexture(heatmapTexture);
        }

        onLoadingChange(false);
      } catch (error) {
        console.error('Error loading tiles:', error);
        onLoadingChange(false);
      }
    };

    loadTiles();
  }, [bbox, onLoadingChange, filterMethod]);

  // Fetch building data from Mapbox API
  useEffect(() => {
    if (!bbox || !showBuildings) {
      setBuildings(null);
      return;
    }

    const fetchBuildings = async () => {
      try {
        const response = await fetch('/api/fetch-mapbox-buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            minLon: bbox.minLon,
            minLat: bbox.minLat,
            maxLon: bbox.maxLon,
            maxLat: bbox.maxLat,
          }),
        });

        if (response.ok) {
          const buildingData = await response.json();
          setBuildings(buildingData);
        }
      } catch (error) {
        console.error('Error fetching buildings:', error);
      }
    };

    fetchBuildings();
  }, [bbox, showBuildings]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!token) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-500">
        Mapbox token not found
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* R3F Canvas - Terrain Rendering */}
      <Canvas
        ref={canvasRef}
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="bg-gradient-to-b from-black via-gray-900 to-black"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <PerspectiveCamera makeDefault position={[0, 8, 8]} fov={50} />

        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-10, 5, -5]} intensity={0.3} />

        {bbox && terrainImageData && (
          <>
            <TerrainMesh
              bbox={bbox}
              textureType={textureType}
              heightExaggeration={heightExaggeration}
              meshResolution={meshResolution}
              filterMethod={filterMethod}
              useRealScale={useRealScale}
              satelliteTexture={satelliteTexture}
              streetsTexture={streetsTexture}
              heatmapTexture={heatmapTexture}
              terrainImageData={terrainImageData}
              terrainWidth={textureWidth}
              terrainHeight={textureHeight}
              minElevation={minElevation}
              maxElevation={maxElevation}
            />

            {/* Render buildings directly in Three.js */}
            {showBuildings && buildings && buildings.features.map((feature, idx) => {
              const lonDiff = bbox.maxLon - bbox.minLon;
              const latDiff = bbox.maxLat - bbox.minLat;
              const planeWidth = 10;
              const planeHeight = 10 * (latDiff / lonDiff);

              return (
                <Building
                  key={idx}
                  feature={feature}
                  bbox={bbox}
                  planeWidth={planeWidth}
                  planeHeight={planeHeight}
                  heightExaggeration={heightExaggeration}
                  useRealScale={useRealScale}
                  terrainImageData={terrainImageData}
                  terrainWidth={textureWidth}
                  terrainHeight={textureHeight}
                />
              );
            })}

            <CanvasControls onExportReady={onExportReady} />
          </>
        )}

        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          enablePan={true}
          enableZoom={true}
          minDistance={3}
          maxDistance={20}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          }}
        />
      </Canvas>

    </div>
  );
}
