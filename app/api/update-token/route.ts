import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid token provided' },
        { status: 400 }
      );
    }

    // Get the project root directory
    const projectRoot = process.cwd();
    const envLocalPath = join(projectRoot, '.env.local');

    // Prepare the content for .env.local
    const envContent = `NEXT_PUBLIC_MAPBOX_TOKEN=${token.trim()}\n`;

    // Write or update .env.local file
    await writeFile(envLocalPath, envContent, 'utf-8');

    return NextResponse.json(
      { message: 'Token updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating token:', error);
    return NextResponse.json(
      { error: 'Failed to update token file' },
      { status: 500 }
    );
  }
}

