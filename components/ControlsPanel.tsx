'use client';

import { useControls, button } from 'leva';

interface ControlsPanelProps {
  textureType: 'satellite' | 'streets';
  onTextureChange: (type: 'satellite' | 'streets') => void;
  heightExaggeration: number;
  onHeightChange: (value: number) => void;
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
  onExportJPEG: () => void;
  onExportGLB: () => void;
  onExportSVG: () => void;
}

export default function ControlsPanel({
  textureType,
  onTextureChange,
  heightExaggeration,
  onHeightChange,
  autoRotate,
  onAutoRotateChange,
  onExportJPEG,
  onExportGLB,
  onExportSVG,
}: ControlsPanelProps) {
  useControls({
    Texture: {
      value: textureType,
      options: ['satellite', 'streets'],
      onChange: (value) => onTextureChange(value as 'satellite' | 'streets'),
    },
    'Height Exaggeration': {
      value: heightExaggeration,
      min: 0.1,
      max: 5,
      step: 0.1,
      onChange: onHeightChange,
    },
    'Auto Rotate': {
      value: autoRotate,
      onChange: onAutoRotateChange,
    },
    'Export JPEG': button(() => onExportJPEG()),
    'Export GLB': button(() => onExportGLB()),
    'Export SVG': button(() => onExportSVG()),
  });

  return null;
}

