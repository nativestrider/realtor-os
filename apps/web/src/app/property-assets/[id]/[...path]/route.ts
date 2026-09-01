import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NextRequest } from 'next/server';

function getDataDir(): string {
  return process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os');
}

function contentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

function resolveSafeFile(propertyId: string, relativePath: string): string | null {
  if (!propertyId || relativePath.includes('..')) return null;
  const root = resolve(join(getDataDir(), 'properties', propertyId));
  const file = resolve(join(root, relativePath));
  if (file !== root && !file.startsWith(`${root}/`)) return null;
  return file;
}

/** Serve files from ~/.realtor-os/properties/{id}/ (not proxied to daemon). */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; path: string[] }> },
): Promise<Response> {
  const { id, path } = await context.params;
  const relPath = path.join('/');
  if (!relPath) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = resolveSafeFile(id, relPath);
  if (!filePath || !existsSync(filePath)) {
    return new Response('Not found', { status: 404 });
  }

  const body = readFileSync(filePath);
  return new Response(body, {
    headers: {
      'Content-Type': contentType(relPath),
      'Cache-Control': 'public, max-age=300',
    },
  });
}
