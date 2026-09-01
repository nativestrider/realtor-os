import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetMetadata, PropertyFileEntry } from '@realtor-os/contracts';
import { getDefaultDataDir } from './db.js';

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export function getRepoRoot(): string {
  return repoRoot;
}

export function getPropertiesRoot(dataDir = getDefaultDataDir()): string {
  return join(dataDir, 'properties');
}

export function getPropertyWorkspacePath(propertyId: string, dataDir = getDefaultDataDir()): string {
  return join(getPropertiesRoot(dataDir), propertyId);
}

export function ensurePropertyWorkspace(propertyId: string, dataDir = getDefaultDataDir()): string {
  const root = getPropertyWorkspacePath(propertyId, dataDir);
  mkdirSync(join(root, 'images'), { recursive: true });
  mkdirSync(join(root, 'staged'), { recursive: true });
  mkdirSync(join(root, 'comps'), { recursive: true });
  mkdirSync(join(root, '.realtor-skills'), { recursive: true });
  return root;
}

export function listPropertyFiles(workspacePath: string, subdir = ''): PropertyFileEntry[] {
  const base = subdir ? join(workspacePath, subdir) : workspacePath;
  if (!existsSync(base)) return [];

  const entries: PropertyFileEntry[] = [];
  for (const name of readdirSync(base)) {
    if (name === '.realtor-skills') continue;
    const full = join(base, name);
    const rel = relative(workspacePath, full).replace(/\\/g, '/');
    const st = statSync(full);
    entries.push({
      path: rel,
      kind: st.isDirectory() ? 'directory' : 'file',
      size: st.isFile() ? st.size : undefined,
    });
    if (st.isDirectory() && (rel === 'images' || rel === 'staged')) {
      entries.push(...listPropertyFiles(workspacePath, rel));
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function readPropertyJsonSummary(workspacePath: string): string {
  const path = join(workspacePath, 'property.json');
  if (!existsSync(path)) return 'No property.json yet.';
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const lines = [
      data.address ? `Address: ${data.address}` : null,
      data.price != null ? `Price: ${data.price}` : null,
      data.beds != null ? `Beds: ${data.beds}` : null,
      data.baths != null ? `Baths: ${data.baths}` : null,
      data.sqft != null ? `Sqft: ${data.sqft}` : null,
      data.description ? `Description: ${String(data.description).slice(0, 400)}` : null,
    ].filter(Boolean);
    return lines.length ? lines.join('\n') : readFileSync(path, 'utf8').slice(0, 2000);
  } catch {
    return readFileSync(path, 'utf8').slice(0, 2000);
  }
}

export function listCompsSummary(workspacePath: string): string {
  const compsDir = join(workspacePath, 'comps');
  if (!existsSync(compsDir)) return 'No comparables yet.';
  const files = readdirSync(compsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (!files.length) return 'No comparables yet.';
  const lines: string[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(compsDir, file), 'utf8')) as Record<string, unknown>;
      const parts = [
        data.address ? String(data.address) : file,
        data.price != null ? `$${data.price}` : null,
        data.beds != null ? `${data.beds}bd` : null,
        data.baths != null ? `${data.baths}ba` : null,
        data.sqft != null ? `${data.sqft} sqft` : null,
        data.listingStatus ? String(data.listingStatus) : null,
        data.distanceMiles != null ? `${data.distanceMiles} mi` : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join(' · ')}`);
    } catch {
      lines.push(`- ${file}`);
    }
  }
  return lines.join('\n');
}

export function listImageIndex(workspacePath: string): string {
  return listMediaIndex(workspacePath);
}

export function assetMetaSidecarPath(workspacePath: string, filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const subdir = filename.startsWith('staged/') ? 'staged' : 'images';
  return join(workspacePath, subdir, '.meta', `${base}.json`);
}

export function readAssetMetadataSidecar(workspacePath: string, filename: string): AssetMetadata {
  const path = assetMetaSidecarPath(workspacePath, filename);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AssetMetadata;
  } catch {
    return {};
  }
}

export function writeAssetMetadataSidecar(
  workspacePath: string,
  filename: string,
  metadata: AssetMetadata,
): void {
  const path = assetMetaSidecarPath(workspacePath, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(metadata, null, 2), 'utf8');
}

export function listMediaIndex(workspacePath: string): string {
  const lines: string[] = [];
  for (const subdir of ['images', 'staged'] as const) {
    const dir = join(workspacePath, subdir);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) continue;
      const rel = `${subdir}/${name}`;
      const meta = readAssetMetadataSidecar(workspacePath, rel);
      if (meta.role && meta.role !== 'unclassified') {
        const note = meta.notes ? ` (${meta.notes})` : '';
        lines.push(`- ${meta.role}: ${rel}${note}`);
      } else {
        lines.push(`- ${rel}`);
      }
    }
  }
  return lines.length ? lines.join('\n') : 'No images yet.';
}

export function extractZpidFromUrl(url: string): string | undefined {
  const match = url.match(/(\d+)_zpid/i);
  return match?.[1];
}

export function parseZillowAddressFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('homedetails');
    if (idx >= 0 && parts[idx + 1]) {
      return parts[idx + 1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // ignore
  }
  return 'New property';
}

export function stageSkillToWorkspace(skillRoot: string, skillId: string, workspacePath: string): string {
  const src = join(skillRoot, skillId);
  const dest = join(workspacePath, '.realtor-skills', skillId);
  mkdirSync(join(workspacePath, '.realtor-skills'), { recursive: true });
  cpSync(src, dest, { recursive: true });
  return dest;
}

export function getBundledSkillsRoot(): string {
  return join(repoRoot, 'skills');
}

export function getUserSkillsRoot(dataDir = getDefaultDataDir()): string {
  return join(dataDir, 'skills');
}

export function resolveSafeFilePath(workspacePath: string, relativePath: string): string | null {
  const resolved = resolve(workspacePath, relativePath);
  const normalizedRoot = resolve(workspacePath);
  if (!resolved.startsWith(normalizedRoot)) return null;
  return resolved;
}
