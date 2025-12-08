import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Note: Mapbox usage statistics require the Management API
    // which needs server-side authentication with a secret token.
    // This endpoint is a placeholder for future implementation.
    // 
    // To implement:
    // 1. Use Mapbox Management API: https://docs.mapbox.com/api/management/
    // 2. Requires secret token (not public token) for authentication
    // 3. Endpoint: GET https://api.mapbox.com/usage/v1/{username}
    // 4. Returns usage statistics including Static Tiles and Raster Tiles API requests
    
    // For now, return null to indicate stats are not available
    return NextResponse.json(
      { 
        static: null, 
        raster: null,
        message: 'Mapbox usage statistics require Management API integration. See: https://docs.mapbox.com/api/management/' 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching Mapbox usage:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage statistics' },
      { status: 500 }
    );
  }
}

