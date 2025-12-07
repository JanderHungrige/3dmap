'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

interface CanvasControlsProps {
  onExportReady: (exports: {
    exportJPEG: () => void;
    exportGLB: () => void;
    exportSVG: () => void;
  }) => void;
}

export function CanvasControls({ onExportReady }: CanvasControlsProps) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const exportAsJPEG = () => {
      const dataURL = gl.domElement.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.download = 'terrain-map.jpg';
      link.href = dataURL;
      link.click();
    };

    const exportAsGLB = async () => {
      try {
        const exporter = new GLTFExporter();
        exporter.parse(
          scene,
          (result) => {
            if (result instanceof ArrayBuffer) {
              const blob = new Blob([result], { type: 'model/gltf-binary' });
              const link = document.createElement('a');
              link.download = 'terrain-map.glb';
              link.href = URL.createObjectURL(blob);
              link.click();
            } else if (typeof result === 'string') {
              // JSON format
              const blob = new Blob([result], { type: 'application/json' });
              const link = document.createElement('a');
              link.download = 'terrain-map.gltf';
              link.href = URL.createObjectURL(blob);
              link.click();
            }
          },
          { binary: true }
        );
      } catch (error) {
        console.error('Error exporting GLB:', error);
      }
    };

    const exportAsSVG = () => {
      // Create SVG wireframe view
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', gl.domElement.width.toString());
      svg.setAttribute('height', gl.domElement.height.toString());
      svg.setAttribute('viewBox', `0 0 ${gl.domElement.width} ${gl.domElement.height}`);

      // This is a simplified wireframe - in production you'd want to extract actual mesh edges
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `
        .wireframe { fill: none; stroke: #00ff00; stroke-width: 0.5; }
      `;
      svg.appendChild(style);

      // For now, create a placeholder wireframe
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', gl.domElement.width.toString());
      rect.setAttribute('height', gl.domElement.height.toString());
      rect.setAttribute('class', 'wireframe');
      svg.appendChild(rect);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const link = document.createElement('a');
      link.download = 'terrain-wireframe.svg';
      link.href = URL.createObjectURL(blob);
      link.click();
    };

    onExportReady({
      exportJPEG: exportAsJPEG,
      exportGLB: exportAsGLB,
      exportSVG: exportAsSVG,
    });
  }, [gl, scene, onExportReady]);

  return null;
}

