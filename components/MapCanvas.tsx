'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useTexture, Plane } from '@react-three/drei';
import * as THREE from 'three';
import { BoundingBox } from '@/lib/tileUtils';
import { stitchTiles, createHeightmapFromTerrainRGB } from '@/lib/tileStitcher';
import { getTilesForBoundingBox, calculateZoomLevel } from '@/lib/tileUtils';
import { CanvasControls } from './CanvasControls';

interface MapCanvasProps {
  bbox: BoundingBox | null;
  textureType: 'satellite' | 'streets';
  heightExaggeration: number;
  autoRotate: boolean;
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
  satelliteTexture,
  streetsTexture,
  heightmapData,
  width,
  height,
}: {
  bbox: BoundingBox;
  textureType: 'satellite' | 'streets';
  heightExaggeration: number;
  satelliteTexture: THREE.Texture | null;
  streetsTexture: THREE.Texture | null;
  heightmapData: Float32Array | null;
  width: number;
  height: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const segments = 256;

  // Calculate plane dimensions based on bounding box (approximate)
  const lonDiff = bbox.maxLon - bbox.minLon;
  const latDiff = bbox.maxLat - bbox.minLat;
  // Use average of lat/lon for aspect ratio (rough approximation)
  const planeWidth = 10;
  const planeHeight = 10 * (latDiff / lonDiff);
  
  // Create geometry once and reuse
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  if (!geometryRef.current) {
    geometryRef.current = new THREE.PlaneGeometry(planeWidth, planeHeight, segments, segments);
  }

  useEffect(() => {
    if (!meshRef.current || !heightmapData || !geometryRef.current) return;

    const geometry = geometryRef.current;
    const positions = geometry.attributes.position.array as Float32Array;

    // Find min/max elevation
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    for (let i = 0; i < heightmapData.length; i++) {
      if (heightmapData[i] < minElevation) minElevation = heightmapData[i];
      if (heightmapData[i] > maxElevation) maxElevation = heightmapData[i];
    }
    
    const elevationRange = maxElevation - minElevation;
    
    // More aggressive scaling: make elevation clearly visible
    // Scale elevation range to be 20-30% of plane width for good visibility
    const targetElevationUnits = planeWidth * 0.25; // 25% of plane width
    const baseScale = elevationRange > 0 
      ? targetElevationUnits / elevationRange 
      : 0.01; // Fallback: 1 meter = 0.01 units
    
    console.log('Elevation stats:', { 
      minElevation: minElevation.toFixed(2), 
      maxElevation: maxElevation.toFixed(2), 
      elevationRange: elevationRange.toFixed(2), 
      baseScale: baseScale.toFixed(6),
      targetElevationUnits: targetElevationUnits.toFixed(2),
      heightExaggeration
    });

    // Apply heightmap to vertices
    let appliedMin = Infinity;
    let appliedMax = -Infinity;
    
    for (let i = 0; i < positions.length / 3; i++) {
      const x = i % (segments + 1);
      const y = Math.floor(i / (segments + 1));
      
      const u = x / segments;
      const v = y / segments;
      
      const heightmapX = Math.floor(u * (width - 1));
      const heightmapY = Math.floor(v * (height - 1));
      const heightmapIndex = heightmapY * width + heightmapX;
      
      if (heightmapIndex < heightmapData.length) {
        // Use actual elevation value, scaled appropriately
        // Subtract minElevation to start from 0, then scale and apply exaggeration
        const elevationMeters = heightmapData[heightmapIndex] - minElevation;
        const elevation = elevationMeters * baseScale * heightExaggeration;
        positions[i * 3 + 2] = elevation;
        
        if (elevation < appliedMin) appliedMin = elevation;
        if (elevation > appliedMax) appliedMax = elevation;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    
    console.log('Applied elevation range to mesh:', { 
      appliedMin: appliedMin.toFixed(4), 
      appliedMax: appliedMax.toFixed(4),
      range: (appliedMax - appliedMin).toFixed(4)
    });
  }, [heightmapData, heightExaggeration, width, height, planeWidth]);

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
  onLoadingChange,
  onExportReady,
}: MapCanvasProps) {
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [streetsTexture, setStreetsTexture] = useState<THREE.Texture | null>(null);
  const [heightmapData, setHeightmapData] = useState<Float32Array | null>(null);
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

        // Load terrain-rgb for heightmap
        const terrainResult = await stitchTiles(tiles, bbox, 'terrain-rgb', token);
        if (terrainResult.imageData) {
          const heightmap = createHeightmapFromTerrainRGB(
            terrainResult.imageData,
            terrainResult.canvas.width,
            terrainResult.canvas.height
          );
          setHeightmapData(heightmap);
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

        {bbox && heightmapData && (
          <>
            <TerrainMesh
              bbox={bbox}
              textureType={textureType}
              heightExaggeration={heightExaggeration}
              satelliteTexture={satelliteTexture}
              streetsTexture={streetsTexture}
              heightmapData={heightmapData}
              width={textureWidth}
              height={textureHeight}
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

