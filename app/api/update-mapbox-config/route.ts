import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { secretToken, username } = await request.json();

    if (!secretToken || typeof secretToken !== 'string' || secretToken.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid secret token provided' },
        { status: 400 }
      );
    }

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid username provided' },
        { status: 400 }
      );
    }

    // Get the project root directory
    const projectRoot = process.cwd();
    const envLocalPath = join(projectRoot, '.env.local');

    // Read existing .env.local if it exists
    let existingContent = '';
    if (existsSync(envLocalPath)) {
      try {
        existingContent = await readFile(envLocalPath, 'utf-8');
      } catch (error) {
        console.error('Error reading existing .env.local:', error);
      }
    }

    // Parse existing content and update/add the new values
    const lines = existingContent.split('\n');
    const updatedLines: string[] = [];
    let hasSecretToken = false;
    let hasUsername = false;

    // Process existing lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('MAPBOX_SECRET_TOKEN=')) {
        updatedLines.push(`MAPBOX_SECRET_TOKEN=${secretToken.trim()}`);
        hasSecretToken = true;
      } else if (trimmedLine.startsWith('MAPBOX_USERNAME=')) {
        updatedLines.push(`MAPBOX_USERNAME=${username.trim()}`);
        hasUsername = true;
      } else if (trimmedLine.length > 0 && !trimmedLine.startsWith('#')) {
        // Keep other non-empty, non-comment lines
        updatedLines.push(line);
      }
    }

    // Add new entries if they didn't exist
    if (!hasSecretToken) {
      updatedLines.push(`MAPBOX_SECRET_TOKEN=${secretToken.trim()}`);
    }
    if (!hasUsername) {
      updatedLines.push(`MAPBOX_USERNAME=${username.trim()}`);
    }

    // Write updated content
    const envContent = updatedLines.join('\n') + '\n';
    await writeFile(envLocalPath, envContent, 'utf-8');

    return NextResponse.json(
      { message: 'Mapbox Management API config updated successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating Mapbox config:', error);
    return NextResponse.json(
      { error: 'Failed to update config file' },
      { status: 500 }
    );
  }
}

