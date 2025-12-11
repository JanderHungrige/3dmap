'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useTexture, Plane } from '@react-three/drei';
import * as THREE from 'three';
import { BoundingBox } from '@/lib/tileUtils';
import { stitchTiles } from '@/lib/tileStitcher';
import { getTilesForBoundingBox, calculateZoomLevel } from '@/lib/tileUtils';
import { FilterMethod, applyTerrainFilter } from '@/lib/terrainFilters';
import { CanvasControls } from './CanvasControls';

/**
 * Generate a heatmap texture from elevation data (red = high, blue = low)
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
    
    // Convert RGB to elevation
    const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
    
    // Normalize to 0-1 range
    const normalized = elevationRange > 0 
      ? (elevation - minElevation) / elevationRange 
      : 0.5;
    
    // Clamp to 0-1
    const clamped = Math.max(0, Math.min(1, normalized));
    
    // Red (high) to Blue (low) gradient
    // At 0 (low): blue (0, 0, 255)
    // At 0.5: cyan/green (0, 255, 255)
    // At 1 (high): red (255, 0, 0)
    let red, green, blue;
    if (clamped < 0.5) {
      // Blue to Cyan (0 -> 0.5)
      const t = clamped * 2;
      red = 0;
      green = Math.round(255 * t);
      blue = 255;
    } else {
      // Cyan to Yellow to Red (0.5 -> 1.0)
      const t = (clamped - 0.5) * 2;
      red = Math.round(255 * t);
      green = Math.round(255 * (1 - t));
      blue = 0;
    }
    
    imageData.data[idx] = red;
    imageData.data[idx + 1] = green;
    imageData.data[idx + 2] = blue;
    imageData.data[idx + 3] = 255; // Alpha
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

interface MapCanvasProps {
  bbox: BoundingBox | null;
  textureType: 'satellite' | 'streets' | 'heatmap';
  heightExaggeration: number;
  autoRotate: boolean;
  meshResolution: 128 | 256 | 512 | 1024;
  filterMethod: FilterMethod;
  useRealScale: boolean;
  onUseRealScaleChange: (value: boolean) => void;
  onLoadingChange: (loading: boolean) => void;
  onExportReady: (exports: {
    exportJPEG: () => void;
    exportPNG: () => void;
    exportGLB: () => void;
    exportOBJ: () => void;
    exportSTL: () => void;
    exportSVG: () => void;
  }) => void;
}

/**
 * Calculate approximate distance in meters between two lat/lon coordinates
 * Uses the Haversine formula for better accuracy, but simplified for small distances
 */
function calculateDistanceMeters(
  lon1: number, lat1: number,
  lon2: number, lat2: number
): number {
  // Earth's radius in meters
  const R = 6371000;
  
  // Convert degrees to radians
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  // Average latitude for longitude distance calculation
  const avgLat = (lat1 + lat2) * Math.PI / 360;
  
  // Haversine formula
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

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

  // Calculate plane dimensions based on bounding box (approximate)
  const lonDiff = bbox.maxLon - bbox.minLon;
  const latDiff = bbox.maxLat - bbox.minLat;
  // Use average of lat/lon for aspect ratio (rough approximation)
  const planeWidth = 10;
  const planeHeight = 10 * (latDiff / lonDiff);
  
  // Calculate real-world distances in meters
  const avgLat = (bbox.minLat + bbox.maxLat) / 2;
  const horizontalDistanceMeters = calculateDistanceMeters(
    bbox.minLon, avgLat,
    bbox.maxLon, avgLat
  );
  const verticalDistanceMeters = calculateDistanceMeters(
    bbox.minLon, bbox.minLat,
    bbox.minLon, bbox.maxLat
  );
  
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
    
    // Calculate base scale based on whether real-world scale is enabled
    let baseScale: number;
    if (useRealScale) {
      // True 1:1 real-world scale: match the horizontal scale factor
      // Horizontal scale: horizontalDistanceMeters meters → planeWidth units
      // So: 1 meter horizontally = planeWidth / horizontalDistanceMeters units
      // For true 1:1, vertical should match: 1 meter elevation = planeWidth / horizontalDistanceMeters units
      if (horizontalDistanceMeters > 0) {
        const horizontalScaleFactor = planeWidth / horizontalDistanceMeters;
        baseScale = horizontalScaleFactor; // This ensures 1:1 real-world proportion
      } else {
        // Fallback if distance calculation fails
        baseScale = 0.1;
      }
    } else {
      // Scaled for visibility: elevation range scaled to 25% of plane width
      const targetElevationUnits = planeWidth * 0.25;
      baseScale = elevationRange > 0 
        ? targetElevationUnits / elevationRange 
        : 0.01;
    }
    
    console.log('Elevation stats:', { 
      minElevation: minElevation.toFixed(2), 
      maxElevation: maxElevation.toFixed(2), 
      elevationRange: elevationRange.toFixed(2), 
      baseScale: baseScale.toFixed(6),
      horizontalDistanceMeters: horizontalDistanceMeters.toFixed(2),
      verticalDistanceMeters: verticalDistanceMeters.toFixed(2),
      horizontalScaleFactor: useRealScale && horizontalDistanceMeters > 0 ? (planeWidth / horizontalDistanceMeters).toFixed(6) : 'N/A',
      useRealScale,
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
      let elevation: number;
      if (useRealScale) {
        // Real scale: use actual elevation in meters, offset from sea level
        elevation = elevationMeters * baseScale * heightExaggeration;
      } else {
        // Normalized scale: offset from minimum elevation
        const normalizedElevation = elevationMeters - minElevation;
        elevation = normalizedElevation * baseScale * heightExaggeration;
      }
      
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
      filterMethod,
      useRealScale
    });
  }, [terrainImageData, heightExaggeration, terrainWidth, terrainHeight, planeWidth, meshResolution, filterMethod, useRealScale]);

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

// Component to reset camera when scale changes
function CameraReset({ useRealScale }: { useRealScale: boolean }) {
  const { camera } = useThree();
  const prevScaleRef = useRef(useRealScale);

  useEffect(() => {
    if (prevScaleRef.current !== useRealScale) {
      // Reset camera to center position when scale mode changes
      camera.position.set(0, 8, 8);
      camera.lookAt(0, 0, 0);
      prevScaleRef.current = useRealScale;
    }
  }, [useRealScale, camera]);

  return null;
}

export default function MapCanvas({
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
}: MapCanvasProps) {
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [streetsTexture, setStreetsTexture] = useState<THREE.Texture | null>(null);
  const [heatmapTexture, setHeatmapTexture] = useState<THREE.Texture | null>(null);
  const [terrainImageData, setTerrainImageData] = useState<ImageData | null>(null);
  const [minElevation, setMinElevation] = useState(0);
  const [maxElevation, setMaxElevation] = useState(0);
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
          
          // Calculate min/max elevation for heatmap
          const { applyTerrainFilter } = await import('@/lib/terrainFilters');
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
          
          // Generate heatmap texture
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

  // Regenerate heatmap when filter method or terrain data changes
  useEffect(() => {
    if (terrainImageData && textureWidth > 0 && textureHeight > 0) {
      const { applyTerrainFilter } = require('@/lib/terrainFilters');
      const filteredHeights = applyTerrainFilter(
        terrainImageData,
        textureWidth,
        textureHeight,
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
      
      // Regenerate heatmap texture
      const heatmapCanvas = generateHeatmapTexture(
        terrainImageData,
        textureWidth,
        textureHeight,
        min,
        max
      );
      const heatmapTexture = new THREE.Texture(heatmapCanvas);
      heatmapTexture.needsUpdate = true;
      setHeatmapTexture(heatmapTexture);
    }
  }, [terrainImageData, textureWidth, textureHeight, filterMethod]);

  return (
    <div className="w-full h-full relative">
      {/* Heatmap Legend */}
      {textureType === 'heatmap' && terrainImageData && (() => {
        const elevationRange = maxElevation - minElevation;
        const numIntervals = 7; // Reduced from 9 to fit without scrolling
        
        // Generate color for a given normalized elevation (0-1)
        const getColor = (normalized: number): string => {
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
          return `rgb(${red}, ${green}, ${blue})`;
        };
        
        // Generate elevation intervals (quartiles and key points) - reversed order (highest first)
        const intervals = Array.from({ length: numIntervals }, (_, i) => {
          const ratio = i / (numIntervals - 1);
          const elevation = minElevation + (ratio * elevationRange);
          const normalized = elevationRange > 0 ? ratio : 0.5;
          return {
            elevation,
            normalized,
            color: getColor(normalized),
            isKeyPoint: i === 0 || i === Math.floor(numIntervals / 2) || i === numIntervals - 1
          };
        }).reverse(); // Reverse to show highest first
        
        // Calculate quartiles
        const q1 = minElevation + elevationRange * 0.25;
        const q2 = minElevation + elevationRange * 0.5;
        const q3 = minElevation + elevationRange * 0.75;
        
        return (
          <div className="absolute left-4 top-[68px] z-30 glass rounded-lg p-3 shadow-2xl min-w-[240px] max-w-[260px]">
            <div className="text-white font-bold mb-2 text-sm border-b border-white/20 pb-1.5">
              Elevation Heatmap
            </div>
            
            {/* Compact color gradient bar with elevation markers */}
            <div className="mb-2.5">
              <div className="flex justify-between text-[10px] text-white/90 mb-1 font-medium">
                <span>{maxElevation.toFixed(0)} m</span>
                <span>{q2.toFixed(0)} m</span>
                <span>{minElevation.toFixed(0)} m</span>
              </div>
              <div className="w-full h-5 rounded overflow-hidden border border-white/30 shadow-inner">
                <div className="w-full h-full bg-gradient-to-r from-red-500 via-cyan-500 to-blue-500"></div>
              </div>
              <div className="flex justify-between text-[9px] text-white/60 mt-0.5">
                <span>High</span>
                <span>Medium</span>
                <span>Low</span>
              </div>
            </div>
            
            {/* Compact elevation intervals with color swatches - highest to lowest */}
            <div className="mb-2.5">
              <div className="text-white text-[10px] font-semibold mb-1">Elevation:</div>
              <div className="space-y-0.5">
                {intervals.map((interval, idx) => {
                  const isFirst = idx === 0; // Highest (now first)
                  const isLast = idx === intervals.length - 1; // Lowest (now last)
                  const isQ1 = Math.abs(interval.elevation - q1) < elevationRange * 0.08;
                  const isQ2 = Math.abs(interval.elevation - q2) < elevationRange * 0.08;
                  const isQ3 = Math.abs(interval.elevation - q3) < elevationRange * 0.08;
                  
                  let label = '';
                  if (isFirst) label = 'Max';
                  else if (isLast) label = 'Min';
                  else if (isQ1) label = 'Q1';
                  else if (isQ2) label = 'Q2';
                  else if (isQ3) label = 'Q3';
                  
                  return (
                    <div key={idx} className="flex items-center gap-2 py-0.5">
                      <div 
                        className="w-4 h-4 rounded border border-white/40 flex-shrink-0" 
                        style={{ backgroundColor: interval.color }}
                        title={`Elevation: ${interval.elevation.toFixed(1)} m`}
                      ></div>
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className="text-white text-[10px] font-medium">
                          {interval.elevation.toFixed(0)} m
                        </span>
                        {label && (
                          <span className="text-white/70 text-[9px] bg-white/10 px-1 py-0 rounded">
                            {label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Compact statistical summary */}
            <div className="pt-2 border-t border-white/20">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-white/80">
                <div>
                  <span className="text-white/60">Range:</span>{' '}
                  <span className="font-medium">{elevationRange.toFixed(0)} m</span>
                </div>
                <div>
                  <span className="text-white/60">Mean:</span>{' '}
                  <span className="font-medium">{(minElevation + elevationRange / 2).toFixed(0)} m</span>
                </div>
                <div>
                  <span className="text-white/60">Min:</span>{' '}
                  <span className="font-medium">{minElevation.toFixed(0)} m</span>
                </div>
                <div>
                  <span className="text-white/60">Max:</span>{' '}
                  <span className="font-medium">{maxElevation.toFixed(0)} m</span>
                </div>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[9px] text-white/50">
                Red (high) → Blue (low)
              </div>
            </div>
          </div>
        );
      })()}
      <Canvas
        ref={canvasRef}
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="bg-gradient-to-b from-black via-gray-900 to-black"
      >
        <PerspectiveCamera makeDefault position={[0, 8, 8]} fov={50} />
        
        <CameraReset useRealScale={useRealScale} />
        
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

