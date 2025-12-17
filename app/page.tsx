'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Map, Loader2, Eye, EyeOff, Info, Settings } from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import CityscapeMap from '@/components/CityscapeMap';
import ControlsPanel from '@/components/ControlsPanel';
import { parseBoundingBox, BoundingBox } from '@/lib/tileUtils';
import { FilterMethod } from '@/lib/terrainFilters';

export default function Home() {
  const [bboxInput, setBboxInput] = useState('');
  const [bbox, setBbox] = useState<BoundingBox | null>(null);
  const [viewMode, setViewMode] = useState<'r3f' | 'rayshader' | 'cityscape'>('r3f');
  const [rayshaderImage, setRayshaderImage] = useState<string | null>(null);
  const [rayshaderLoading, setRayshaderLoading] = useState(false);
  const [rayshaderError, setRayshaderError] = useState<string | null>(null);
  const [textureType, setTextureType] = useState<'satellite' | 'satellite-v9' | 'satellite-streets' | 'streets' | 'heatmap'>('satellite');
  const [heightExaggeration, setHeightExaggeration] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [meshResolution, setMeshResolution] = useState<128 | 256 | 512 | 1024>(256);
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('median');
  const [useRealScale] = useState(true); // Always use Real Scale mode
  const [showBuildings, setShowBuildings] = useState(true); // Show buildings in cityscape mode
  const [showUI, setShowUI] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapboxUsage, setMapboxUsage] = useState<{ static: number; raster: number } | null>(null);
  const [apiToken, setApiToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [mapboxSecretToken, setMapboxSecretToken] = useState('');
  const [mapboxUsername, setMapboxUsername] = useState('');
  const [mapboxConfigError, setMapboxConfigError] = useState<string | null>(null);
  const [exportFunctions, setExportFunctions] = useState<{
    exportJPEG: () => void;
    exportPNG: () => void;
    exportGLB: () => void;
    exportOBJ: () => void;
    exportSTL: () => void;
    exportSVG: () => void;
  } | null>(null);

  const handleGenerate = () => {
    setError(null);
    setRayshaderError(null);
    const parsed = parseBoundingBox(bboxInput);

    if (!parsed) {
      setError('Invalid bounding box format. Please use: minLon, minLat, maxLon, maxLat');
      return;
    }

    setBbox(parsed);
    setViewMode('r3f');
  };

  const handleGenerateCityscape = () => {
    setError(null);
    setRayshaderError(null);
    const parsed = parseBoundingBox(bboxInput);

    if (!parsed) {
      setError('Invalid bounding box format. Please use: minLon, minLat, maxLon, maxLat');
      return;
    }

    setBbox(parsed);
    setViewMode('cityscape');
  };

  const handleGenerateRayshader = async () => {
    setError(null);
    setRayshaderError(null);
    const parsed = parseBoundingBox(bboxInput);

    if (!parsed) {
      setError('Invalid bounding box format. Please use: minLon, minLat, maxLon, maxLat');
      return;
    }

    setBbox(parsed);
    setViewMode('rayshader');
    setRayshaderLoading(true);
    setRayshaderImage(null);

    try {
      const response = await fetch('/api/rayshader-render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          minLon: parsed.minLon,
          minLat: parsed.minLat,
          maxLon: parsed.maxLon,
          maxLat: parsed.maxLat,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate Rayshader render');
      }

      if (data.imageUrl || data.imageBase64) {
        setRayshaderImage(data.imageUrl || data.imageBase64);
      } else {
        throw new Error('No image data received from server');
      }
    } catch (error) {
      console.error('Error generating Rayshader render:', error);
      setRayshaderError(error instanceof Error ? error.message : 'Failed to generate Rayshader render');
    } finally {
      setRayshaderLoading(false);
    }
  };

  // Fetch Mapbox usage stats when admin panel opens
  useEffect(() => {
    if (showAdmin) {
      const fetchMapboxUsage = async () => {
        try {
          const response = await fetch('/api/mapbox-usage');
          if (response.ok) {
            const data = await response.json();
            if (data.static !== null && data.raster !== null) {
              setMapboxUsage({ static: data.static, raster: data.raster });
            } else {
              setMapboxUsage(null);
            }
          } else {
            setMapboxUsage(null);
          }
        } catch (error) {
          console.error('Error fetching Mapbox usage:', error);
          setMapboxUsage(null);
        }
      };
      fetchMapboxUsage();
    }
  }, [showAdmin]);

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

      {/* Header */}
      {showUI && (
        <div className="absolute top-0 left-0 right-0 z-20 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="glass rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 bg-clip-text text-transparent">
                  3D Terrain Map Generator
                </h1>
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors rounded hover:bg-white/5"
                  title="Show information"
                >
                  <Info className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowAdmin(!showAdmin)}
                  className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors rounded hover:bg-white/5"
                  title="Admin panel"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
              <p className="text-gray-300 text-sm mb-4">
                Generate photorealistic 3D terrain maps from GPS coordinates
              </p>

              {/* Info Panel */}
              {showInfo && (
                <div className="mb-4 glass rounded-lg p-4 text-xs text-gray-300 border border-white/10">
                  <div className="space-y-4">
                    {/* Mouse Controls */}
                    <div>
                      <div className="font-semibold text-white mb-2">Mouse Controls:</div>
                      <div className="pl-2 space-y-1">
                        <div>🖱️ Left Mouse: Rotate</div>
                        <div>🖱️ Right Mouse: Pan</div>
                        <div>🖱️ Scroll: Zoom</div>
                      </div>
                    </div>

                    {/* Height Exaggeration Info */}
                    <div>
                      <div className="font-semibold text-white mb-2">Height Exaggeration:</div>
                      <div className="pl-2">
                        <div className="font-medium text-yellow-400 mb-1.5">
                          {useRealScale ? 'Real Scale Mode:' : 'Normalized Scale Mode:'}
                        </div>
                        {useRealScale ? (
                          <div className="space-y-1">
                            <div>• Height uses actual elevation in meters</div>
                            <div>• Scale: 1 meter = 0.1 units in 3D space</div>
                            <div>• Slider multiplies the actual elevation</div>
                            <div className="pt-1 text-yellow-400">• Value of 1.0 = true-to-scale height</div>
                            <div>• Values &lt; 1.0 = reduced height</div>
                            <div>• Values &gt; 1.0 = exaggerated height</div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div>• Height is normalized and scaled for visibility</div>
                            <div>• Elevation range scaled to 25% of plane width</div>
                            <div>• Slider multiplies the normalized elevation</div>
                            <div className="pt-1 text-yellow-400">• Value of 1.0 = standard visibility scale</div>
                            <div>• Values &lt; 1.0 = flatter terrain</div>
                            <div>• Values &gt; 1.0 = more dramatic terrain</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Panel */}
              {showAdmin && (
                <div className="mb-4 glass rounded-lg p-4 text-xs text-gray-300 border border-white/10">
                  <div className="space-y-4">
                    <div className="font-semibold text-white mb-3 flex items-center justify-between">
                      <span>Admin Panel</span>
                      <button
                        onClick={() => setShowAdmin(false)}
                        className="text-gray-400 hover:text-white text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>

                    {/* Restart Application */}
                    <div>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to restart the application?')) {
                            window.location.reload();
                          }
                        }}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-medium transition-colors"
                      >
                        Restart Application
                      </button>
                    </div>

                    {/* Mapbox Usage */}
                    <div>
                      <div className="font-semibold text-white mb-2 flex items-center justify-between">
                        <span>Mapbox API Usage</span>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/mapbox-usage');
                              if (response.ok) {
                                const data = await response.json();
                                if (data.static !== null && data.raster !== null) {
                                  setMapboxUsage({ static: data.static, raster: data.raster });
                                } else if (data.error) {
                                  setMapboxUsage(null);
                                  alert(`Error: ${data.error}\n\n${data.message || ''}`);
                                } else {
                                  setMapboxUsage(null);
                                }
                              } else {
                                const data = await response.json();
                                setMapboxUsage(null);
                                alert(`Error fetching usage: ${data.error || 'Unknown error'}`);
                              }
                            } catch (error) {
                              console.error('Error fetching usage:', error);
                              setMapboxUsage(null);
                              alert('Error fetching usage statistics');
                            }
                          }}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors text-black font-medium"
                        >
                          Update Usage
                        </button>
                      </div>
                      <div className="pl-2 space-y-1">
                        {mapboxUsage && mapboxUsage.static !== null && mapboxUsage.raster !== null ? (
                          <>
                            <div>Static Tiles API: {mapboxUsage.static.toLocaleString()} requests</div>
                            <div>Raster Tiles API: {mapboxUsage.raster.toLocaleString()} requests</div>
                          </>
                        ) : (
                          <>
                            <div className="text-gray-400">Usage statistics not available</div>
                            <div className="text-gray-500 text-xs mt-1 space-y-1">
                              <div>To enable usage tracking:</div>
                              <div>1. Get your Mapbox username from <a href="https://account.mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">account.mapbox.com</a></div>
                              <div>2. Create a secret token with Management API access</div>
                              <div>3. Enter credentials above and click "Update Management API Config"</div>
                              <div>4. Click "Update Usage" button to fetch statistics</div>
                              <div className="mt-2">
                                Or view usage at: <a href="https://console.mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">Mapbox Console</a>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* API Token Management */}
                    <div>
                      <div className="font-semibold text-white mb-2">Mapbox API Token</div>
                      <div className="space-y-2">
                        <input
                          type="password"
                          value={apiToken}
                          onChange={(e) => setApiToken(e.target.value)}
                          placeholder="Enter your Mapbox API token"
                          className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                        />
                        {tokenError && (
                          <div className="text-red-400 text-xs">{tokenError}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!apiToken.trim()) {
                              setTokenError('Please enter a valid API token');
                              return;
                            }

                            try {
                              const response = await fetch('/api/update-token', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ token: apiToken }),
                              });

                              const data = await response.json();

                              if (response.ok) {
                                setTokenError(null);
                                alert('API token updated successfully! Please restart the application.');
                                setApiToken('');
                              } else {
                                setTokenError(data.error || 'Failed to update token');
                              }
                            } catch (error) {
                              setTokenError('Error updating token. Please check console.');
                              console.error('Error updating token:', error);
                            }
                          }}
                          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-medium transition-colors text-sm"
                        >
                          Update API Token
                        </button>
                        <div className="text-gray-500 text-xs">
                          Token will be saved to .env.local file
                        </div>
                      </div>
                    </div>

                    {/* Mapbox Management API Configuration */}
                    <div>
                      <div className="font-semibold text-white mb-2">Mapbox Management API Config</div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Secret Token</label>
                          <input
                            type="password"
                            value={mapboxSecretToken}
                            onChange={(e) => setMapboxSecretToken(e.target.value)}
                            placeholder="Enter Mapbox secret token"
                            className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Username</label>
                          <input
                            type="text"
                            value={mapboxUsername}
                            onChange={(e) => setMapboxUsername(e.target.value)}
                            placeholder="Enter Mapbox username"
                            className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                          />
                        </div>
                        {mapboxConfigError && (
                          <div className="text-red-400 text-xs">{mapboxConfigError}</div>
                        )}
                        <button
                          onClick={async () => {
                            if (!mapboxSecretToken.trim() || !mapboxUsername.trim()) {
                              setMapboxConfigError('Please enter both secret token and username');
                              return;
                            }

                            try {
                              const response = await fetch('/api/update-mapbox-config', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  secretToken: mapboxSecretToken,
                                  username: mapboxUsername
                                }),
                              });

                              const data = await response.json();

                              if (response.ok) {
                                setMapboxConfigError(null);
                                alert('Mapbox Management API config updated successfully! Usage stats will be available after restart.');
                                setMapboxSecretToken('');
                                setMapboxUsername('');
                              } else {
                                setMapboxConfigError(data.error || 'Failed to update config');
                              }
                            } catch (error) {
                              setMapboxConfigError('Error updating config. Please check console.');
                              console.error('Error updating config:', error);
                            }
                          }}
                          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-medium transition-colors text-sm"
                        >
                          Update Management API Config
                        </button>
                        <div className="text-gray-500 text-xs">
                          Config will be saved to .env.local file
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                      className="flex-1 px-4 py-2 bg-black/40 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    <div className="flex flex-col items-end gap-1">
                      <a
                        href="https://boundingbox.klokantech.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Get Coordinates
                      </a>
                      <span className="text-xs text-gray-400">use CSV output on webpage</span>
                    </div>
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm mt-2">{error}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 rounded-lg text-black font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <button
                    onClick={handleGenerateCityscape}
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 rounded-lg text-black font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Map className="w-4 h-4" />
                    Generate Cityscape (3D Buildings)
                  </button>
                  <button
                    onClick={handleGenerateRayshader}
                    disabled={rayshaderLoading}
                    className="px-6 py-2 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 rounded-lg text-black font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {rayshaderLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Rendering...
                      </>
                    ) : (
                      <>
                        <Map className="w-4 h-4" />
                        Generate Rayshader Map (High Quality)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas / Rayshader Display */}
      <div className="w-full h-screen">
        {bbox ? (
          viewMode === 'r3f' ? (
            <MapCanvas
              bbox={bbox}
              textureType={textureType}
              heightExaggeration={heightExaggeration}
              autoRotate={autoRotate}
              meshResolution={meshResolution}
              filterMethod={filterMethod}
              useRealScale={useRealScale}
              onUseRealScaleChange={() => { }} // No-op since we always use Real Scale
              onLoadingChange={setLoading}
              onExportReady={setExportFunctions}
            />
          ) : viewMode === 'cityscape' ? (
            <CityscapeMap
              bbox={bbox}
              textureType={textureType}
              heightExaggeration={heightExaggeration}
              autoRotate={autoRotate}
              meshResolution={meshResolution}
              filterMethod={filterMethod}
              useRealScale={useRealScale}
              onUseRealScaleChange={() => { }} // No-op since we always use Real Scale
              onLoadingChange={setLoading}
              onExportReady={setExportFunctions}
              showBuildings={showBuildings}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black relative">
              {rayshaderLoading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-yellow-500" />
                  <div className="text-white text-lg">Rendering high-quality Rayshader visualization...</div>
                  <div className="text-gray-400 text-sm">This may take a few moments</div>
                </div>
              ) : rayshaderError ? (
                <div className="flex flex-col items-center gap-4 max-w-md text-center">
                  <div className="text-red-400 text-lg font-semibold">Rendering Error</div>
                  <div className="text-gray-300">{rayshaderError}</div>
                  <button
                    onClick={handleGenerateRayshader}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-black transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : rayshaderImage ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={rayshaderImage}
                    alt="Rayshader rendered terrain"
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-gray-400">
                  <Map className="w-16 h-16" />
                  <div>Click "Generate Rayshader Map" to render</div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-black via-gray-900 to-black">
            <div className="text-center glass rounded-2xl p-12 max-w-md">
              <Map className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
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
              useRealScale={useRealScale}
              autoRotate={autoRotate}
              onAutoRotateChange={setAutoRotate}
              meshResolution={meshResolution}
              onMeshResolutionChange={setMeshResolution}
              filterMethod={filterMethod}
              onFilterMethodChange={setFilterMethod}
              onUseRealScaleChange={() => { }} // No-op since we always use Real Scale
              showBuildings={viewMode === 'cityscape' ? showBuildings : undefined}
              onShowBuildingsChange={viewMode === 'cityscape' ? setShowBuildings : undefined}
              onExportJPEG={exportFunctions.exportJPEG}
              onExportPNG={exportFunctions.exportPNG}
              onExportGLB={exportFunctions.exportGLB}
              onExportOBJ={exportFunctions.exportOBJ}
              onExportSTL={exportFunctions.exportSTL}
              onExportSVG={exportFunctions.exportSVG}
            />
          </div>
        </div>
      )}
    </main>
  );
}

