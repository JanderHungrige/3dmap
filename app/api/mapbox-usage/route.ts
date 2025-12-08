import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mapbox Management API requires a secret token (not the public token)
    // The secret token should be stored in environment variables
    // Force reload environment variables to get latest values
    const secretToken = process.env.MAPBOX_SECRET_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const username = process.env.MAPBOX_USERNAME;

    if (!secretToken) {
      return NextResponse.json(
        { 
          static: null, 
          raster: null,
          error: 'Mapbox secret token not configured. Add MAPBOX_SECRET_TOKEN to .env.local',
          message: 'Note: Management API requires a secret token (not public token). Get it from: https://account.mapbox.com/access-tokens/'
        },
        { status: 200 }
      );
    }

    if (!username) {
      // Try to get username from the token (if it's a secret token, we can extract username)
      // For now, we'll use a default approach or require username in env
      return NextResponse.json(
        { 
          static: null, 
          raster: null,
          error: 'Mapbox username not configured. Add MAPBOX_USERNAME to .env.local',
          message: 'Get your username from: https://account.mapbox.com/'
        },
        { status: 200 }
      );
    }

    // Fetch usage statistics from Mapbox Management API
    // Endpoint: https://api.mapbox.com/usage/v1/{username}
    const response = await fetch(`https://api.mapbox.com/usage/v1/${username}`, {
      headers: {
        'Authorization': `Bearer ${secretToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { 
            static: null, 
            raster: null,
            error: 'Unauthorized: Invalid token or token lacks Management API permissions',
            message: 'Make sure you\'re using a secret token with Management API access'
          },
          { status: 200 }
        );
      }
      
      const errorText = await response.text();
      console.error('Mapbox API error:', response.status, errorText);
      return NextResponse.json(
        { 
          static: null, 
          raster: null,
          error: `Mapbox API error: ${response.status}`,
          message: errorText
        },
        { status: 200 }
      );
    }

    const data = await response.json();
    
    // Parse the usage data - Mapbox returns usage in a specific format
    // The response structure may vary, but typically includes service usage
    let staticTiles = 0;
    let rasterTiles = 0;

    // Mapbox usage API returns data in different formats depending on the account type
    // Common structure: { services: { 'static-tiles': { requests: number }, 'raster-tiles': { requests: number } } }
    if (data.services) {
      staticTiles = data.services['static-tiles']?.requests || data.services['static']?.requests || 0;
      rasterTiles = data.services['raster-tiles']?.requests || data.services['raster']?.requests || 0;
    } else if (data.static) {
      // Alternative format
      staticTiles = data.static.requests || 0;
      rasterTiles = data.raster?.requests || 0;
    } else if (typeof data === 'object') {
      // Try to find any usage data
      for (const [key, value] of Object.entries(data)) {
        if (key.toLowerCase().includes('static') && typeof value === 'object' && 'requests' in value) {
          staticTiles = (value as any).requests || 0;
        }
        if (key.toLowerCase().includes('raster') && typeof value === 'object' && 'requests' in value) {
          rasterTiles = (value as any).requests || 0;
        }
      }
    }

    return NextResponse.json(
      { 
        static: staticTiles, 
        raster: rasterTiles,
        raw: data // Include raw data for debugging
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching Mapbox usage:', error);
    return NextResponse.json(
      { 
        static: null, 
        raster: null,
        error: 'Failed to fetch usage statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 200 }
    );
  }
}

