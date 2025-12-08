'use client';

import { useControls, button } from 'leva';
import { FilterMethod } from '@/lib/terrainFilters';
import { useState } from 'react';

interface ControlsPanelProps {
  textureType: 'satellite' | 'streets';
  onTextureChange: (type: 'satellite' | 'streets') => void;
  heightExaggeration: number;
  onHeightChange: (value: number) => void;
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
  meshResolution: 128 | 256 | 512 | 1024;
  onMeshResolutionChange: (value: 128 | 256 | 512 | 1024) => void;
  filterMethod: FilterMethod;
  onFilterMethodChange: (value: FilterMethod) => void;
  useRealScale: boolean;
  onUseRealScaleChange: (value: boolean) => void;
  onExportJPEG: () => void;
  onExportPNG: () => void;
  onExportGLB: () => void;
  onExportOBJ: () => void;
  onExportSTL: () => void;
  onExportSVG: () => void;
}

export default function ControlsPanel({
  textureType,
  onTextureChange,
  heightExaggeration,
  onHeightChange,
  autoRotate,
  onAutoRotateChange,
  meshResolution,
  onMeshResolutionChange,
  filterMethod,
  onFilterMethodChange,
  useRealScale,
  onUseRealScaleChange,
  onExportJPEG,
  onExportPNG,
  onExportGLB,
  onExportOBJ,
  onExportSTL,
  onExportSVG,
}: ControlsPanelProps) {
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png' | 'glb' | 'obj' | 'stl' | 'svg'>('png');

  const handleExport = () => {
    switch (exportFormat) {
      case 'jpeg':
        onExportJPEG();
        break;
      case 'png':
        onExportPNG();
        break;
      case 'glb':
        onExportGLB();
        break;
      case 'obj':
        onExportOBJ();
        break;
      case 'stl':
        onExportSTL();
        break;
      case 'svg':
        onExportSVG();
        break;
    }
  };

  useControls({
    Texture: {
      value: textureType,
      options: ['satellite', 'streets'],
      onChange: (value) => onTextureChange(value as 'satellite' | 'streets'),
    },
    'Mesh Resolution': {
      value: meshResolution,
      options: {
        'Low (Mobile)': 128,
        'Medium (Fast)': 256,
        'High (Detailed)': 512,
        'Ultra (Sharp) ⚠️': 1024,
      },
      onChange: (value) => {
        const numValue = value as number;
        if (numValue === 1024 && meshResolution !== 1024) {
          // Show warning but allow change
          const confirmed = window.confirm(
            '⚠️ Ultra resolution (1024 segments) is performance-heavy and may cause lag on slower devices. Continue?'
          );
          if (!confirmed) {
            // User cancelled - don't change
            return;
          }
        }
        onMeshResolutionChange(numValue as 128 | 256 | 512 | 1024);
      },
    },
    'Height Exaggeration': {
      value: heightExaggeration,
      min: 0.1,
      max: 1,
      step: 0.05,
      onChange: onHeightChange,
    },
    'Artifact Filter': {
      value: filterMethod,
      options: {
        'None (Raw Data)': 'none',
        'Capping (Fast Clip)': 'capping',
        'Hampel (Robust Outlier Filter)': 'median',
      },
      onChange: (value) => onFilterMethodChange(value as FilterMethod),
    },
    'Use Real Scale': {
      value: useRealScale,
      onChange: onUseRealScaleChange,
    },
    'Auto Rotate': {
      value: autoRotate,
      onChange: onAutoRotateChange,
    },
    'Export Format': {
      value: exportFormat,
      options: {
        'PNG (Lossless Image)': 'png',
        'JPEG (Compressed Image)': 'jpeg',
        'GLB (3D Model)': 'glb',
        'OBJ (Universal 3D)': 'obj',
        'STL (3D Printing)': 'stl',
        'SVG (Wireframe)': 'svg',
      },
      onChange: (value) => setExportFormat(value as typeof exportFormat),
    },
    'Save': button(() => handleExport()),
  });

  return null;
}

