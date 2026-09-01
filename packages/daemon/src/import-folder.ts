import { createWriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import Busboy from 'busboy';
import type { Request } from 'express';

function sanitizeRelativePath(raw: string): string | null {
  if (!raw?.trim()) return null;
  const normalized = normalize(raw.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
    return null;
  }
  const posix = normalized.replace(/\\/g, '/');
  if (posix.includes('.realtor-skills')) return null;
  return posix;
}

export function parseFolderUpload(req: Request, workspacePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let filesWritten = 0;
    const pending: Promise<void>[] = [];

    busboy.on('file', (_field, fileStream, info) => {
      const rel = sanitizeRelativePath(info.filename);
      if (!rel) {
        fileStream.resume();
        return;
      }
      const dest = join(workspacePath, rel);
      mkdirSync(dirname(dest), { recursive: true });
      const ws = createWriteStream(dest);
      fileStream.pipe(ws);
      pending.push(
        new Promise((res, rej) => {
          ws.on('finish', () => {
            filesWritten += 1;
            res();
          });
          ws.on('error', rej);
          fileStream.on('error', rej);
        }),
      );
    });

    busboy.on('error', reject);
    busboy.on('finish', () => {
      void Promise.all(pending)
        .then(() => resolve(filesWritten))
        .catch(reject);
    });

    req.pipe(busboy);
  });
}
