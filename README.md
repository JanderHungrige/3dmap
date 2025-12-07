# 3D Terrain Map Generator

A Next.js application that generates photorealistic 3D terrain maps based on GPS coordinates. Input a bounding box, and the app renders a 3D mesh of that area with interchangeable textures (Satellite vs. Map Data).

## Features

- 🗺️ **Interactive 3D Terrain Visualization** - Render realistic 3D terrain using Mapbox Terrain-RGB elevation data
- 🎨 **Texture Switching** - Toggle between Satellite and Streets/Outdoors textures
- 📐 **Height Exaggeration Control** - Adjust elevation scale for better visualization
- 📸 **Export Options** - Save as JPEG, GLB (3D model), or SVG wireframe
- 🎯 **Auto-rotation** - Optional automatic camera rotation for presentation
- 🌐 **Tile Stitching** - Automatically fetches and stitches multiple map tiles for seamless coverage

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
4. **Height Mapping:** Converts Terrain-RGB values to elevation data using the formula: `height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)`
5. **3D Rendering:** Creates a high-resolution mesh with displacement mapping using React Three Fiber

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

