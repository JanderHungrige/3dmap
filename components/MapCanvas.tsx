'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useTexture, Plane } from '@react-three/drei';
import * as THREE from 'three';
import { BoundingBox } from '@/lib/tileUtils';
import { stitchTiles } from '@/lib/tileStitcher';
import { getTilesForBoundingBox, calculateZoomLevel } from '@/lib/tileUtils';
import { FilterMethod, applyTerrainFilter } from '@/lib/terrainFilters';
import { CanvasControls } from './CanvasControls';

interface MapCanvasProps {
  bbox: BoundingBox | null;
  textureType: 'satellite' | 'streets';
  heightExaggeration: number;
  autoRotate: boolean;
  meshResolution: 128 | 256 | 512 | 1024;
  filterMethod: FilterMethod;
  onLoadingChange: (loading: boolean) => void;
  onExportReady: (exports: {
    exportJPEG: () => void;
    exportGLB: () => void;
    exportSVG: () => void;
  }) => void;
}

function TerrainMesh({
  bbox,
  textureType,
  heightExaggeration,
  meshResolution,
  filterMethod,
  satelliteTexture,
  streetsTexture,
  terrainImageData,
  terrainWidth,
  terrainHeight,
}: {
  bbox: BoundingBox;
  textureType: 'satellite' | 'streets';
  heightExaggeration: number;
  meshResolution: 128 | 256 | 512 | 1024;
  filterMethod: FilterMethod;
  satelliteTexture: THREE.Texture | null;
  streetsTexture: THREE.Texture | null;
  terrainImageData: ImageData | null;
  terrainWidth: number;
  terrainHeight: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Calculate plane dimensions based on bounding box (approximate)
  const lonDiff = bbox.maxLon - bbox.minLon;
  const latDiff = bbox.maxLat - bbox.minLat;
  // Use average of lat/lon for aspect ratio (rough approximation)
  const planeWidth = 10;
  const planeHeight = 10 * (latDiff / lonDiff);
  
  // Create geometry dynamically based on resolution
  const geometryRef = useRef<THREE.PlaneGeometry>(
    new THREE.PlaneGeometry(planeWidth, planeHeight, meshResolution, meshResolution)
  );
  
  // Recreate geometry when resolution changes
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
    
    // Update mesh geometry reference
    if (meshRef.current) {
      meshRef.current.geometry = geometryRef.current;
    }
  }, [meshResolution, planeWidth, planeHeight]);

  // True vertex displacement using ImageData pixel sampling with artifact filtering
  useEffect(() => {
    if (!meshRef.current || !terrainImageData || !geometryRef.current) return;

    const geometry = geometryRef.current;
    const positions = geometry.attributes.position.array as Float32Array;
    const segments = meshResolution;
    
    // Apply artifact filtering to terrain data
    const filteredHeights = applyTerrainFilter(
      terrainImageData,
      terrainWidth,
      terrainHeight,
      filterMethod
    );
    
    // Find min/max elevation from filtered heights
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    
    for (let i = 0; i < filteredHeights.length; i++) {
      const elevation = filteredHeights[i];
      if (elevation < minElevation) minElevation = elevation;
      if (elevation > maxElevation) maxElevation = elevation;
    }
    
    const elevationRange = maxElevation - minElevation;
    
    // Scale elevation range to be 25% of plane width for good visibility
    const targetElevationUnits = planeWidth * 0.25;
    const baseScale = elevationRange > 0 
      ? targetElevationUnits / elevationRange 
      : 0.01;
    
    console.log('Elevation stats:', { 
      minElevation: minElevation.toFixed(2), 
      maxElevation: maxElevation.toFixed(2), 
      elevationRange: elevationRange.toFixed(2), 
      baseScale: baseScale.toFixed(6),
      targetElevationUnits: targetElevationUnits.toFixed(2),
      heightExaggeration,
      meshResolution,
      filterMethod
    });

    // Apply true vertex displacement using filtered heights with bilinear sampling
    let appliedMin = Infinity;
    let appliedMax = -Infinity;
    
    // Helper function to sample filtered height at pixel coordinates
    const sampleHeight = (x: number, y: number): number => {
      const px = Math.max(0, Math.min(Math.floor(x), terrainWidth - 1));
      const py = Math.max(0, Math.min(Math.floor(y), terrainHeight - 1));
      return filteredHeights[py * terrainWidth + px];
    };
    
    for (let i = 0; i < positions.length / 3; i++) {
      const vertexX = i % (segments + 1);
      const vertexY = Math.floor(i / (segments + 1));
      
      // Calculate UV coordinates (0 to 1)
      const u = vertexX / segments;
      const v = vertexY / segments;
      
      // Map UV to terrain image coordinates with bilinear sampling
      const terrainX = u * (terrainWidth - 1);
      const terrainY = v * (terrainHeight - 1);
      
      // Bilinear interpolation for smooth sampling
      const x0 = Math.floor(terrainX);
      const y0 = Math.floor(terrainY);
      const x1 = Math.min(x0 + 1, terrainWidth - 1);
      const y1 = Math.min(y0 + 1, terrainHeight - 1);
      
      const fx = terrainX - x0;
      const fy = terrainY - y0;
      
      // Sample four surrounding pixels from filtered heights
      const h00 = sampleHeight(x0, y0);
      const h10 = sampleHeight(x1, y0);
      const h01 = sampleHeight(x0, y1);
      const h11 = sampleHeight(x1, y1);
      
      // Bilinear interpolation
      const h0 = h00 * (1 - fx) + h10 * fx;
      const h1 = h01 * (1 - fx) + h11 * fx;
      const elevationMeters = h0 * (1 - fy) + h1 * fy;
      
      // Scale and apply exaggeration
      const normalizedElevation = elevationMeters - minElevation;
      const elevation = normalizedElevation * baseScale * heightExaggeration;
      
      positions[i * 3 + 2] = elevation;
      
      if (elevation < appliedMin) appliedMin = elevation;
      if (elevation > appliedMax) appliedMax = elevation;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); // Crucial for proper lighting/shadows
    geometry.computeBoundingBox();
    
    console.log('Applied vertex displacement:', { 
      appliedMin: appliedMin.toFixed(4), 
      appliedMax: appliedMax.toFixed(4),
      range: (appliedMax - appliedMin).toFixed(4),
      vertices: positions.length / 3,
      filterMethod
    });
  }, [terrainImageData, heightExaggeration, terrainWidth, terrainHeight, planeWidth, meshResolution, filterMethod]);

  const texture = textureType === 'satellite' ? satelliteTexture : streetsTexture;
  
  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow geometry={geometryRef.current}>
      <meshStandardMaterial
        map={texture || undefined}
        roughness={0.7}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function MapCanvas({
  bbox,
  textureType,
  heightExaggeration,
  autoRotate,
  meshResolution,
  filterMethod,
  onLoadingChange,
  onExportReady,
}: MapCanvasProps) {
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [streetsTexture, setStreetsTexture] = useState<THREE.Texture | null>(null);
  const [terrainImageData, setTerrainImageData] = useState<ImageData | null>(null);
  const [textureWidth, setTextureWidth] = useState(0);
  const [textureHeight, setTextureHeight] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

        // Load satellite texture
        const satelliteResult = await stitchTiles(tiles, bbox, 'satellite', token);
        const satelliteTexture = new THREE.Texture(satelliteResult.canvas);
        satelliteTexture.needsUpdate = true;
        setSatelliteTexture(satelliteTexture);
        setTextureWidth(satelliteResult.canvas.width);
        setTextureHeight(satelliteResult.canvas.height);

        // Load streets texture
        const streetsResult = await stitchTiles(tiles, bbox, 'streets', token);
        const streetsTexture = new THREE.Texture(streetsResult.canvas);
        streetsTexture.needsUpdate = true;
        setStreetsTexture(streetsTexture);

        // Load terrain-rgb for vertex displacement (store ImageData directly)
        const terrainResult = await stitchTiles(tiles, bbox, 'terrain-rgb', token);
        if (terrainResult.imageData) {
          setTerrainImageData(terrainResult.imageData);
        }

        onLoadingChange(false);
      } catch (error) {
        console.error('Error loading tiles:', error);
        onLoadingChange(false);
      }
    };

    loadTiles();
  }, [bbox, onLoadingChange]);

  return (
    <div className="w-full h-full">
      <Canvas
        ref={canvasRef}
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900"
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
              satelliteTexture={satelliteTexture}
              streetsTexture={streetsTexture}
              terrainImageData={terrainImageData}
              terrainWidth={textureWidth}
              terrainHeight={textureHeight}
            />
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
        />
      </Canvas>
    </div>
  );
}

