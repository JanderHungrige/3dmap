
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { minLon, minLat, maxLon, maxLat } = body;

        if (!minLon || !minLat || !maxLon || !maxLat) {
            return NextResponse.json(
                { error: 'Missing bounding box coordinates' },
                { status: 400 }
            );
        }

        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            return NextResponse.json(
                { error: 'Mapbox token not configured' },
                { status: 500 }
            );
        }

        const scriptPath = path.join(process.cwd(), 'scripts', 'render_map.R');

        // Command: conda run -n 3dmap Rscript scripts/render_map.R ...
        // Use Conda R environment explicitly by calling the binary directly
        // This avoids 'conda run' scrubbing environment variables
        const rscriptPath = '/Users/jwh/miniconda3/envs/3dmap/bin/Rscript';

        const args = [
            scriptPath,
            String(minLon),
            String(minLat),
            String(maxLon),
            String(maxLat),
            token
        ];

        console.log(`Executing R script: ${rscriptPath} ${args.join(' ')}`);

        return new Promise<NextResponse>((resolve) => {
            // Force R to key off the conda environment library path
            const condaLibPath = '/Users/jwh/miniconda3/envs/3dmap/lib/R/library';
            const env = {
                ...process.env,
                R_LIBS_USER: condaLibPath,
                R_LIBS: condaLibPath,
                RGL_USE_NULL: 'TRUE', // Force RGL to use NULL device (no X11)
                PATH: `/Users/jwh/miniconda3/envs/3dmap/bin:${process.env.PATH}` // Ensure conda bin is in path
            };

            const child = spawn(rscriptPath, args, { env });

            let stdoutData = '';
            let stderrData = '';

            child.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderrData += data.toString();
                // Conda often prints environment info to stderr, so we log it but don't fail immediately
                console.log('R stderr:', data.toString());
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    console.error('R script failed with code', code);
                    console.error('Stderr:', stderrData);
                    resolve(NextResponse.json(
                        { error: 'Rendering process failed', details: stderrData },
                        { status: 500 }
                    ));
                    return;
                }

                // Parse Output
                // We look for ___IMAGE_START___ and ___IMAGE_END___
                const startMarker = '___IMAGE_START___';
                const endMarker = '___IMAGE_END___';

                const startIndex = stdoutData.indexOf(startMarker);
                const endIndex = stdoutData.indexOf(endMarker);

                if (startIndex !== -1 && endIndex !== -1) {
                    const base64 = stdoutData.substring(startIndex + startMarker.length, endIndex);
                    resolve(NextResponse.json({
                        imageBase64: `data:image/png;base64,${base64}`
                    }));
                } else {
                    console.error('Could not find image markers in output');
                    console.log('Full Output:', stdoutData);

                    // Check for manual error marker
                    if (stdoutData.includes("ERROR:")) {
                        resolve(NextResponse.json(
                            { error: 'R Script Error', details: stdoutData },
                            { status: 500 }
                        ));
                    } else {
                        resolve(NextResponse.json(
                            { error: 'Invalid output from renderer', details: stdoutData },
                            { status: 500 }
                        ));
                    }
                }
            });

            child.on('error', (err) => {
                console.error("Failed to spawn conda:", err);
                resolve(NextResponse.json(
                    { error: 'Failed to spawn process', details: err.message },
                    { status: 500 }
                ));
            });
        });

    } catch (error) {
        console.error('Error in rayshader-render API:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
