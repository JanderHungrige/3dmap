
# scripts/render_map.R

# Enforce strict library path isolation to avoid System R pollution
# We check if R_LIBS_USER is set and force .libPaths to ONLY that
lib_path <- Sys.getenv("R_LIBS_USER")
if (lib_path != "") {
  .libPaths(c(lib_path))
}

# Capture all output and errors to a log file for debugging
log_file <- file("rayshader_log.txt", open = "wt")
sink(log_file, type = "output")
sink(log_file, type = "message")

tryCatch({
  
  args <- commandArgs(trailingOnly = TRUE)
  
  if (length(args) < 5) {
    stop("Usage: Rscript render_map.R <minLon> <minLat> <maxLon> <maxLat> <token>")
  }
  
  minLon <- as.numeric(args[1])
  minLat <- as.numeric(args[2])
  maxLon <- as.numeric(args[3])
  maxLat <- as.numeric(args[4])
  token <- args[5]
  
  # Load libraries gracefully
  if (!require("rayshader")) stop("rayshader package not installed")
  if (!require("terra")) stop("terra package not installed")
  if (!require("png")) stop("png package not installed")
  if (!require("base64enc")) stop("base64enc package not installed")
  
  # Helper to identify tile coordinates
  lon2tile <- function(lon, zoom) { floor((lon + 180) / 360 * 2^zoom) }
  lat2tile <- function(lat, zoom) { floor((1 - log(tan(lat * pi / 180) + 1 / cos(lat * pi / 180)) / pi) / 2 * 2^zoom) }
  
  # 1. Download Tiles
  # Calculate zoom to get decent resolution (target ~1600px width)
  diffLon <- maxLon - minLon
  target_px <- 1600
  zoom_float <- log2(target_px * 360 / (diffLon * 512))
  zoom <- floor(zoom_float)
  zoom <- max(min(zoom, 15), 10) 
  
  cat(sprintf("DEBUG: Calculated zoom: %d\n", zoom))
  
  x_min <- lon2tile(minLon, zoom)
  x_max <- lon2tile(maxLon, zoom)
  y_min <- lat2tile(maxLat, zoom) 
  y_max <- lat2tile(minLat, zoom)
  
  cat(sprintf("DEBUG: Tile range X: %d-%d, Y: %d-%d\n", x_min, x_max, y_min, y_max))
  
  tmp_dir <- tempdir()
  r_list <- list()
  
  for (x in x_min:x_max) {
    for (y in y_min:y_max) {
      url <- sprintf("https://api.mapbox.com/v4/mapbox.terrain-rgb/%d/%d/%d@2x.png?access_token=%s", zoom, x, y, token)
      dest <- file.path(tmp_dir, sprintf("tile_%d_%d_%d.png", zoom, x, y))
      
      if (!file.exists(dest)) {
        download.file(url, dest, mode = "wb", quiet = TRUE)
      }
      
      # Load into terra raster
      b <- rast(dest)
      
      # Calculate height: -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
      # terra bands are accessed by name or index
      height <- -10000 + ((b[[1]] * 256 * 256 + b[[2]] * 256 + b[[3]]) * 0.1)
      
      # Set extent
      n <- 2 ^ zoom
      lon_deg <- x / n * 360.0 - 180.0
      lat_rad <- atan(sinh(pi * (1 - 2 * y / n)))
      lat_deg <- lat_rad * 180.0 / pi
      
      lon_deg_next <- (x + 1) / n * 360.0 - 180.0
      lat_rad_next <- atan(sinh(pi * (1 - 2 * (y + 1) / n)))
      lat_deg_next <- lat_rad_next * 180.0 / pi
      
      # Ensure correct order: xmin, xmax, ymin, ymax
      # ymin is lat_deg_next (South), ymax is lat_deg (North)
      ext(height) <- c(lon_deg, lon_deg_next, lat_deg_next, lat_deg)
      crs(height) <- "EPSG:4326"
      
      r_list[[length(r_list) + 1]] <- height
    }
  }
  
  cat(sprintf("DEBUG: Tiles processed: %d\n", length(r_list)))

  # Merge using terra
  if (length(r_list) > 1) {
    # Create a SpatRasterCollection
    coll <- sprc(r_list)
    full_raster <- merge(coll)
  } else {
    full_raster <- r_list[[1]]
  }
  
  # Crop
  target_extent <- ext(minLon, maxLon, minLat, maxLat)
  cropped_raster <- crop(full_raster, target_extent)
  
  cat(sprintf("DEBUG: Cropped raster dims: %d x %d\n", nrow(cropped_raster), ncol(cropped_raster)))
  
  # Convert to matrix
  elmat <- as.matrix(cropped_raster, wide=TRUE)
  # Flip matrix to orient correctly for rayshader?
  # rayshader expects matrix oriented ... usually correctly from raster package.
  # terra::as.matrix with wide=TRUE returns standard R matrix.
  # rayshader's raster_to_matrix does: t(raster::as.matrix(raster))[,nrow:1] usually.
  # Let's use rayshader's built-in conversion if possible OR replicate it.
  # rayshader::raster_to_matrix uses `raster` package logic.
  # Let's manually flip:
  # terra as.matrix gives row 1 (north) at index 1.
  # rayshader usually wants standard matrix orientation.
  # Let's trust rayshader's behavior on the matrix.
  # But rayshader `raster_to_matrix` flips it: `matrix_flip = function(x) t(x[nrow(x):1,,drop=FALSE])`
  # So we probably need to transpose and flip if we do it manually.
  
  # Replicate rayshader::raster_to_matrix logic for terra:
  # It transposes.
  elmat <- t(elmat)
  elmat <- elmat[, ncol(elmat):1] # Flip columns? No, flip rows?
  # Wait, raster_to_matrix(r) -> flip(t(r))
  # Standard R raster: rows are Y (top to bottom), cols are X.
  # t(r) -> rows are X, cols are Y (top to bottom) ie Y decreases as col index increases
  # flip -> reverse columns?
  # Let's just try without manual flip first? No, rayshader needs it.
  # Actually, rayshader might have `raster_to_matrix` that accepts terra?
  # If not, use the manual transform:
  # mat = as.matrix(terra_rast, wide=TRUE)
  # return(t(mat)[, nrow(mat):1]) 
  # wait, as.matrix(wide=TRUE) returns standard matrix: [1,1] is top-left.
  # rayshader needs [1,1] to be ... bottom-left?
  # rayshader documentation says: "Base R matrix ... rows run west to east, columns run south to north?"
  # Wait. `plot_3d` expects `heightmap`.
  # `raster_to_matrix` doc: "Converts a raster file into a matrix... to be used in rayshader."
  # It produces a matrix where `image(mat)` looks like the map.
  # `image()` in R expects `m[x, y]` where x is x-axis (rows), y is y-axis (cols).
  # `as.matrix(raster, wide=TRUE)` gives `m[i, j]` where i is row (y, top-down), j is col (x, left-right).
  # So we need to transpose: `t(m)` puts x on rows, y on text (top-down).
  # `image` plots y bottom-up. So we need to flip the y-axis (columns of transposed matrix).
  # Correct transform: `t(as.matrix(r, wide=TRUE))[, nrow(r):1]`
  
  elmat <- t(as.matrix(cropped_raster, wide=TRUE))
  elmat <- elmat[, ncol(elmat):1]

  
  cat(sprintf("DEBUG: Matrix dimensions: %d x %d\n", nrow(elmat), ncol(elmat)))
  
  # Render
  # Simple 3D plot
  # We use a temp file for the output
  outfile <- tempfile(fileext = ".png")
  
  # Small texture for overlay (optional, skipping for speed/error reduction now, just heightmap)
  # But rayshader looks best with texture. 
  # For now, let's just do a heightmap render with a default texture or just base raytrace
  
  # Render
  # Switch to 2D hillshade rendering to avoid OpenGL/X11 requirements on headless system
  # This provides a high-quality "pseudo-3D" look which is stable
  
  # Create a hillshade texture
  hillshade <- elmat %>%
    sphere_shade(texture = "imhof1") %>%
    add_shadow(ray_shade(elmat, zscale = 10, maxsearch = 300), 0.5) %>%
    add_shadow(ambient_shade(elmat), 0)

  # Save directly to file using save_png (part of rayshader)
  save_png(hillshade, outfile)
  
  # Convert to base64 (RESTORED)
  b64 <- base64enc::base64encode(outfile)
  
  # rgl cleanup not needed for 2D
  
  # Print MARKER then base64 to ensure we can parse it from stdout mixing
  # Restore output to console for the final result
  sink(type = "message")
  sink(type = "output")
  
  cat("___IMAGE_START___")
  cat(b64)
  cat("___IMAGE_END___")
  
}, error = function(e) {
  # If error, print to stderr (or stdout with error marker)
  sink(type = "message")
  sink(type = "output")
  cat(sprintf("ERROR: %s", e$message))
  quit(status = 1)
})
