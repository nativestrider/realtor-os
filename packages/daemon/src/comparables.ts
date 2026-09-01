import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  CreateComparableRequest,
  PropertyComparable,
  UpdateComparableRequest,
} from '@realtor-os/contracts';
import { extractZpidFromUrl, parseZillowAddressFromUrl } from './property-workspace.js';

type CompRow = {
  id: string;
  property_id: string;
  address: string;
  title: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listing_status: string | null;
  sold_date: string | null;
  distance_miles: number | null;
  zillow_url: string | null;
  zpid: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapComp(row: CompRow): PropertyComparable {
  return {
    id: row.id,
    propertyId: row.property_id,
    address: row.address,
    title: row.title ?? undefined,
    price: row.price ?? undefined,
    beds: row.beds ?? undefined,
    baths: row.baths ?? undefined,
    sqft: row.sqft ?? undefined,
    listingStatus: (row.listing_status as PropertyComparable['listingStatus']) ?? undefined,
    soldDate: row.sold_date ?? undefined,
    distanceMiles: row.distance_miles ?? undefined,
    zillowUrl: row.zillow_url ?? undefined,
    zpid: row.zpid ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureComparablesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS property_comps (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      address TEXT NOT NULL,
      title TEXT,
      price REAL,
      beds INTEGER,
      baths REAL,
      sqft INTEGER,
      listing_status TEXT,
      sold_date TEXT,
      distance_miles REAL,
      zillow_url TEXT,
      zpid TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_property_comps_property_id ON property_comps(property_id);
  `);
}

export function writeComparableToDisk(workspacePath: string, comp: PropertyComparable): void {
  const compsDir = join(workspacePath, 'comps');
  writeFileSync(join(compsDir, `${comp.id}.json`), JSON.stringify(comp, null, 2), 'utf8');
}

export function deleteComparableFromDisk(workspacePath: string, compId: string): void {
  const path = join(workspacePath, 'comps', `${compId}.json`);
  if (existsSync(path)) unlinkSync(path);
}

function normalizeCreateInput(input: CreateComparableRequest): CreateComparableRequest {
  let address = input.address?.trim() ?? '';
  let zpid = input.zpid;
  let zillowUrl = input.zillowUrl?.trim();

  if (zillowUrl && !address) {
    address = parseZillowAddressFromUrl(zillowUrl);
  }
  if (zillowUrl && !zpid) {
    zpid = extractZpidFromUrl(zillowUrl);
  }

  return { ...input, address, zpid, zillowUrl };
}

export function listComparables(db: Database.Database, propertyId: string): PropertyComparable[] {
  const rows = db
    .prepare(
      `SELECT * FROM property_comps WHERE property_id = ? ORDER BY updated_at DESC`,
    )
    .all(propertyId) as CompRow[];
  return rows.map(mapComp);
}

export function getComparable(
  db: Database.Database,
  propertyId: string,
  compId: string,
): PropertyComparable | null {
  const row = db
    .prepare(`SELECT * FROM property_comps WHERE property_id = ? AND id = ?`)
    .get(propertyId, compId) as CompRow | undefined;
  return row ? mapComp(row) : null;
}

export function createComparable(
  db: Database.Database,
  propertyId: string,
  workspacePath: string,
  input: CreateComparableRequest,
): PropertyComparable {
  const normalized = normalizeCreateInput(input);
  if (!normalized.address) {
    throw new Error('Address is required');
  }

  const now = new Date().toISOString();
  const comp: PropertyComparable = {
    id: randomUUID(),
    propertyId,
    address: normalized.address,
    title: normalized.title,
    price: normalized.price,
    beds: normalized.beds,
    baths: normalized.baths,
    sqft: normalized.sqft,
    listingStatus: normalized.listingStatus,
    soldDate: normalized.soldDate,
    distanceMiles: normalized.distanceMiles,
    zillowUrl: normalized.zillowUrl,
    zpid: normalized.zpid,
    notes: normalized.notes,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO property_comps (
      id, property_id, address, title, price, beds, baths, sqft,
      listing_status, sold_date, distance_miles, zillow_url, zpid, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    comp.id,
    comp.propertyId,
    comp.address,
    comp.title ?? null,
    comp.price ?? null,
    comp.beds ?? null,
    comp.baths ?? null,
    comp.sqft ?? null,
    comp.listingStatus ?? null,
    comp.soldDate ?? null,
    comp.distanceMiles ?? null,
    comp.zillowUrl ?? null,
    comp.zpid ?? null,
    comp.notes ?? null,
    comp.createdAt,
    comp.updatedAt,
  );

  writeComparableToDisk(workspacePath, comp);
  return comp;
}

export function updateComparable(
  db: Database.Database,
  propertyId: string,
  workspacePath: string,
  compId: string,
  input: UpdateComparableRequest,
): PropertyComparable | null {
  const existing = getComparable(db, propertyId, compId);
  if (!existing) return null;

  const normalized = normalizeCreateInput({
    address: input.address ?? existing.address,
    title: input.title ?? existing.title,
    price: input.price ?? existing.price,
    beds: input.beds ?? existing.beds,
    baths: input.baths ?? existing.baths,
    sqft: input.sqft ?? existing.sqft,
    listingStatus: input.listingStatus ?? existing.listingStatus,
    soldDate: input.soldDate ?? existing.soldDate,
    distanceMiles: input.distanceMiles ?? existing.distanceMiles,
    zillowUrl: input.zillowUrl ?? existing.zillowUrl,
    zpid: input.zpid ?? existing.zpid,
    notes: input.notes ?? existing.notes,
  });

  const now = new Date().toISOString();
  const comp: PropertyComparable = {
    ...existing,
    ...normalized,
    address: normalized.address,
    updatedAt: now,
  };

  db.prepare(
    `UPDATE property_comps SET
      address = ?, title = ?, price = ?, beds = ?, baths = ?, sqft = ?,
      listing_status = ?, sold_date = ?, distance_miles = ?,
      zillow_url = ?, zpid = ?, notes = ?, updated_at = ?
    WHERE id = ? AND property_id = ?`,
  ).run(
    comp.address,
    comp.title ?? null,
    comp.price ?? null,
    comp.beds ?? null,
    comp.baths ?? null,
    comp.sqft ?? null,
    comp.listingStatus ?? null,
    comp.soldDate ?? null,
    comp.distanceMiles ?? null,
    comp.zillowUrl ?? null,
    comp.zpid ?? null,
    comp.notes ?? null,
    comp.updatedAt,
    compId,
    propertyId,
  );

  writeComparableToDisk(workspacePath, comp);
  return comp;
}

export function deleteComparable(
  db: Database.Database,
  propertyId: string,
  workspacePath: string,
  compId: string,
): boolean {
  const result = db
    .prepare(`DELETE FROM property_comps WHERE property_id = ? AND id = ?`)
    .run(propertyId, compId);
  if (result.changes === 0) return false;
  deleteComparableFromDisk(workspacePath, compId);
  return true;
}
