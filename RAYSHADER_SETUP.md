# Rayshader Setup Guide

## Current Status

The rayshader-render API route is currently a **placeholder** that generates fake SVG images. To make it work with real R/rayshader rendering, you need:

## What's Missing

1. **R is not installed** in the `3dmap2` conda environment
2. **rayshader R package** is not installed
3. **R dependencies** for rayshader are not installed

## Conda Environment Analysis

### Available in Conda-Forge:
- ✅ `r-base` - R programming language
- ✅ `r-raster` - Raster data manipulation
- ✅ `r-rgl` - 3D visualization (required by rayshader)
- ✅ `r-ggplot2` - Plotting (some rayshader functions use this)

### NOT Available in Conda-Forge:
- ❌ `r-rayshader` - Must be installed via R's `install.packages()`

## Rayshader Dependencies

Rayshader requires these R packages (will auto-install when installing rayshader):
- `doParallel`
- `foreach`
- `Rcpp`
- `progress`
- `raster` (available in conda)
- `scales`
- `png`
- `jpeg`
- `rgl` (version 1.3.16+, available in conda)
- `terrainmeshr`
- `rayimage` (version 0.22.3+)
- `rayvertex` (version 0.13.1+)
- `rayrender` (version 0.39.2+)

## Installation Steps

### Step 1: Install R Base from Conda-Forge

```bash
conda activate 3dmap2
conda install -c conda-forge r-base
```

### Step 2: Install R Packages Available in Conda (Optional but Recommended)

These can be installed via conda for better dependency management:

```bash
conda install -c conda-forge r-raster r-rgl r-ggplot2
```

### Step 3: Install Rayshader and Remaining Dependencies via R

Since `rayshader` is not in conda-forge, install it via R's package manager:

```bash
# Activate environment first
conda activate 3dmap2

# Install rayshader (will auto-install dependencies)
Rscript -e "install.packages('rayshader', repos='https://cloud.r-project.org')"
```

Or interactively:
```bash
R
> install.packages("rayshader")
> q()
```

### Step 4: Verify Installation

```bash
conda activate 3dmap2
Rscript -e "library(rayshader); cat('Rayshader version:', packageVersion('rayshader'), '\n')"
```

## System Dependencies

Rayshader may also require system libraries for graphics rendering:
- **macOS**: X11/XQuartz (usually pre-installed)
- **Linux**: libX11, libGL, mesa libraries
- **Windows**: Usually handled automatically

For macOS, if you encounter issues with rgl, you may need:
```bash
brew install xquartz  # if not already installed
```

## Implementation Approach

Once R and rayshader are installed, you have three options:

### Option 1: Direct R Script Execution (Simplest)
- Modify `/app/api/rayshader-render/route.ts` to:
  - Use Node.js `child_process` to execute an R script
  - Pass bounding box as JSON
  - R script fetches elevation data and renders with rayshader
  - Returns PNG image as base64

### Option 2: Docker Container
- Create a Docker image with R + rayshader
- Execute via `docker run` from Node.js
- More isolated but requires Docker

### Option 3: External R Service
- Deploy R service separately (AWS Lambda, etc.)
- Call via HTTP from Next.js API route
- Best for production scaling

## Recommended: Option 1 Implementation

For local development, Option 1 is simplest. You'll need to:

1. Create an R script (`scripts/render_rayshader.R`) that:
   - Accepts bounding box via command line or JSON
   - Fetches Mapbox Terrain-RGB tiles (similar to your existing tileStitcher.ts)
   - Converts to elevation matrix
   - Renders with `rayshader::plot_3d()` or `rayshader::plot_gg()`
   - Saves PNG and returns base64

2. Modify the API route to call this R script using `child_process.spawn()`

## Testing

After installation, test with:
```bash
conda activate 3dmap2
Rscript -e "library(rayshader); demo(rayshader)"
```

## Notes on Conda vs CRAN

- **Conda advantages**: Better system dependency management, version pinning
- **CRAN advantages**: More packages, latest versions
- **Hybrid approach** (recommended): Install R base and common packages via conda, install specialized packages like rayshader via CRAN

This hybrid approach gives you the best of both worlds.
