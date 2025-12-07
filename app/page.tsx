'use client';

import { useState } from 'react';
import { ExternalLink, Map, Loader2, Eye, EyeOff, Info } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import ControlsPanel from '@/components/ControlsPanel';
import { parseBoundingBox, BoundingBox } from '@/lib/tileUtils';
import { FilterMethod } from '@/lib/terrainFilters';

export default function Home() {
  const [bboxInput, setBboxInput] = useState('');
  const [bbox, setBbox] = useState<BoundingBox | null>(null);
  const [textureType, setTextureType] = useState<'satellite' | 'streets'>('satellite');
  const [heightExaggeration, setHeightExaggeration] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [meshResolution, setMeshResolution] = useState<128 | 256 | 512 | 1024>(256);
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('median');
  const [useRealScale, setUseRealScale] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportFunctions, setExportFunctions] = useState<{
    exportJPEG: () => void;
    exportGLB: () => void;
    exportSVG: () => void;
  } | null>(null);

  const handleGenerate = () => {
    setError(null);
    const parsed = parseBoundingBox(bboxInput);
    
    if (!parsed) {
      setError('Invalid bounding box format. Please use: minLon, minLat, maxLon, maxLat');
      return;
    }
    
    setBbox(parsed);
  };

  return (
    <main className="min-h-screen w-full relative">
      {/* UI Toggle Button */}
      <button
        onClick={() => setShowUI(!showUI)}
        className="absolute top-4 left-4 z-30 p-3 glass rounded-lg hover:bg-white/10 transition-colors"
        title={showUI ? 'Hide UI' : 'Show UI'}
      >
        {showUI ? <EyeOff className="w-5 h-5 text-white" /> : <Eye className="w-5 h-5 text-white" />}
      </button>

      {/* Controls Info */}
      {showUI && (
        <div className="absolute top-4 right-4 z-30 glass rounded-lg p-3 max-w-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-gray-300">
              <div className="font-semibold text-white mb-1">Controls:</div>
              <div>🖱️ Left Mouse: Rotate</div>
              <div>🖱️ Right Mouse: Pan</div>
              <div>🖱️ Scroll: Zoom</div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {showUI && (
        <div className="absolute top-0 left-0 right-0 z-20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass rounded-2xl p-6 shadow-2xl">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              3D Terrain Map Generator
            </h1>
            <p className="text-gray-300 text-sm mb-4">
              Generate photorealistic 3D terrain maps from GPS coordinates
            </p>
            
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bounding Box (minLon, minLat, maxLon, maxLat)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bboxInput}
                    onChange={(e) => setBboxInput(e.target.value)}
                    placeholder="-122.5, 37.7, -122.3, 37.8"
                    className="flex-1 px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <a
                    href="https://boundingbox.klokantech.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Get Coordinates
                  </a>
                </div>
                {error && (
                  <p className="text-red-400 text-sm mt-2">{error}</p>
                )}
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg text-white font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Map className="w-4 h-4" />
                    Generate 3D Map
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Canvas */}
      <div className="w-full h-screen">
        {bbox ? (
          <MapCanvas
            bbox={bbox}
            textureType={textureType}
            heightExaggeration={heightExaggeration}
            autoRotate={autoRotate}
            meshResolution={meshResolution}
            filterMethod={filterMethod}
            useRealScale={useRealScale}
            onUseRealScaleChange={setUseRealScale}
            onLoadingChange={setLoading}
            onExportReady={setExportFunctions}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900">
            <div className="text-center glass rounded-2xl p-12 max-w-md">
              <Map className="w-16 h-16 mx-auto mb-4 text-purple-400" />
              <h2 className="text-2xl font-bold mb-2 text-white">
                Enter Bounding Box Coordinates
              </h2>
              <p className="text-gray-400">
                Use the input above to specify your area of interest, then click "Generate 3D Map"
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls Panel */}
      {showUI && bbox && exportFunctions && (
        <div className="absolute bottom-6 right-6 z-20">
          <div className="glass rounded-xl p-4 shadow-2xl">
            <ControlsPanel
              textureType={textureType}
              onTextureChange={setTextureType}
              heightExaggeration={heightExaggeration}
              onHeightChange={setHeightExaggeration}
              autoRotate={autoRotate}
              onAutoRotateChange={setAutoRotate}
              meshResolution={meshResolution}
              onMeshResolutionChange={setMeshResolution}
              filterMethod={filterMethod}
              onFilterMethodChange={setFilterMethod}
              useRealScale={useRealScale}
              onUseRealScaleChange={setUseRealScale}
              onExportJPEG={exportFunctions.exportJPEG}
              onExportGLB={exportFunctions.exportGLB}
              onExportSVG={exportFunctions.exportSVG}
            />
          </div>
        </div>
      )}
    </main>
  );
}

