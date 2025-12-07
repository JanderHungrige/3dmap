# 3D Terrain Map Generator

A Next.js application that generates photorealistic 3D terrain maps based on GPS coordinates. Input a bounding box, and the app renders a 3D mesh of that area with interchangeable textures (Satellite vs. Map Data).

## Features

- **Interactive 3D Terrain Visualization** - Render realistic 3D terrain using Mapbox Terrain-RGB elevation data
- **Texture Switching** - Toggle between Satellite and Streets/Outdoors textures
- **Height Exaggeration Control** - Adjust elevation scale for better visualization
- **Export Options** - Save as JPEG, GLB (3D model), or SVG wireframe
- **Auto-rotation** - Optional automatic camera rotation for presentation
- **Tile Stitching** - Automatically fetches and stitches multiple map tiles for seamless coverage
- **Artifact Filtering** - Hampel filter for robust outlier detection and removal
- **Resolution Control** - Adjustable mesh resolution (128-1024 segments) for performance vs quality tradeoff

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **3D Rendering:** Three.js, React Three Fiber, Drei
- **Geospatial:** Mapbox Tilebelt
- **UI Controls:** Leva
- **Icons:** Lucide React

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Mapbox token:**
   - Get a free Mapbox token from [mapbox.com](https://www.mapbox.com/)
   - Create a `.env.local` file in the root directory:
     ```
     NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
     ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Get Bounding Box Coordinates:**
   - Click the "Get Coordinates" button to open the bounding box tool
   - Select your area of interest
   - Copy the coordinates (format: minLon, minLat, maxLon, maxLat)

2. **Generate 3D Map:**
   - Paste the coordinates into the input field
   - Click "Generate 3D Map"
   - Wait for tiles to load and process

3. **Customize:**
   - Use the controls panel to switch textures
   - Adjust height exaggeration slider
   - Toggle auto-rotation
   - Export your map in various formats

## Example Coordinates

- San Francisco Bay Area: `-122.5, 37.7, -122.3, 37.8`
- Grand Canyon: `-112.1, 36.0, -111.9, 36.2`
- Mount Everest: `86.9, 27.9, 87.0, 28.0`

## How It Works

1. **Tile Calculation:** The app calculates the optimal zoom level and required tile coordinates to cover your bounding box
2. **Tile Fetching:** Downloads Mapbox Terrain-RGB (elevation), Satellite, and Streets tiles
3. **Stitching:** Combines multiple tiles into seamless textures on HTML Canvas
4. **Height Mapping:** Converts Terrain-RGB values to elevation data using true vertex displacement
5. **3D Rendering:** Creates a high-resolution mesh with vertex displacement using React Three Fiber

## Terrain-RGB to Elevation Conversion

The application uses Mapbox Terrain-RGB tiles to extract elevation data. Each pixel's RGB values are converted to height in meters using the following formula:

```
height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
```

Where:
- **R** = Red channel value (0-255)
- **G** = Green channel value (0-255)
- **B** = Blue channel value (0-255)

### How It Works:

1. **RGB to Decimal Conversion:**
   - The RGB values are combined into a single decimal number: `R * 256² + G * 256 + B`
   - This gives a value from 0 to 16,777,215

2. **Scale to Meters:**
   - Multiply by `0.1` to convert the encoded value to decimeters, then to meters

3. **Offset:**
   - Subtract `10000` meters to handle negative elevations (below sea level)
   - This allows encoding elevations from -10,000m to +6,777,721.5m

### Example:

If a pixel has RGB values: `R=100, G=50, B=25`

```
height = -10000 + ((100 * 256 * 256 + 50 * 256 + 25) * 0.1)
height = -10000 + ((6,553,600 + 12,800 + 25) * 0.1)
height = -10000 + 656,642.5
height = 646,642.5 meters
```

### Safety Cap:

The code applies a hard cap at **8000 meters** (`ABSOLUTE_MAX_HEIGHT`) to filter extreme outliers, as elevations above this are likely data artifacts (only Mount Everest reaches ~8,848m).

This is the standard Mapbox Terrain-RGB encoding format.

## Height Exaggeration Slider

The Height Exaggeration slider (range: 0.1 to 1.0) multiplies the final elevation value after Terrain-RGB conversion and scaling. It does not modify the formula itself, but scales the visualization result.

### Complete Calculation Flow:

1. **Terrain-RGB to meters** (formula):
   ```
   elevationMeters = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
   ```

2. **Apply base scaling** (for 3D visualization):
   - **Real Scale Mode**: `baseScale = 0.1` (1 meter = 0.1 units in 3D space)
   - **Normalized Scale Mode**: `baseScale = (planeWidth * 0.25) / elevationRange` (scales elevation range to 25% of plane width)

3. **Apply height exaggeration** (slider value):
   ```
   finalElevation = elevationMeters * baseScale * heightExaggeration
   ```
   
   Or in Normalized Mode:
   ```
   finalElevation = (elevationMeters - minElevation) * baseScale * heightExaggeration
   ```

### What the Slider Does:

The slider value acts as a multiplier:

- **Value = 1.0**: Uses the calculated elevation as-is (no exaggeration, true-to-scale in Real Scale mode)
- **Value = 0.5**: Reduces elevation to 50% (flatter terrain)
- **Value = 0.1**: Reduces elevation to 10% (very flat terrain)

### Example:

If the formula calculates `elevationMeters = 1000m`:

- With slider at **1.0**: `finalElevation = 1000 * 0.1 * 1.0 = 100 units` (Real Scale mode)
- With slider at **0.5**: `finalElevation = 1000 * 0.1 * 0.5 = 50 units` (half height)
- With slider at **0.1**: `finalElevation = 1000 * 0.1 * 0.1 = 10 units` (very flat)

The slider allows you to adjust terrain visibility without changing the underlying elevation data from the Terrain-RGB tiles.

## Project Structure

```
├── app/
│   ├── page.tsx          # Main page component
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/
│   ├── MapCanvas.tsx     # 3D canvas component
│   ├── ControlsPanel.tsx # Leva controls panel
│   └── CanvasControls.tsx # Export functions
├── lib/
│   ├── tileUtils.ts      # Tile calculation utilities
│   └── tileStitcher.ts   # Tile fetching and stitching
└── package.json
```

## License

MIT

