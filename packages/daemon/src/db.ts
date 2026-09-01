import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AssetMetadata,
  AgentId,
  ChatMessage,
  Conversation,
  CreateConversationRequest,
  CreatePropertyRequest,
  Property,
  PropertyAsset,
  PropertyAssetKind,
  PropertyStatus,
  PropertySummary,
  UpdatePropertyRequest,
} from '@realtor-os/contracts';
import {
  ensurePropertyWorkspace,
  extractZpidFromUrl,
  getPropertyWorkspacePath,
  parseZillowAddressFromUrl,
  readAssetMetadataSidecar,
  writeAssetMetadataSidecar,
} from './property-workspace.js';
import { ensureComparablesTable } from './comparables.js';

export function getDefaultDataDir(): string {
  return process.env.REALTOR_DATA_DIR ?? join(homedir(), '.realtor-os');
}

export function openDatabase(dataDir = getDefaultDataDir()): Database.Database {
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'realtor.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'default',
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      zillow_url TEXT,
      zpid TEXT,
      price REAL,
      beds INTEGER,
      baths REAL,
      sqft INTEGER,
      description TEXT,
      cover_image TEXT,
      workspace_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS property_assets (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (property_id) REFERENCES properties(id)
    );
  `);
  migrateConversations(db);
  ensureComparablesTable(db);
  return db;
}

function migrateConversations(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'property_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN property_id TEXT`);
  }
}

export function listConversations(db: Database.Database): Conversation[] {
  const rows = db
    .prepare(
      `SELECT id, agent_id, model, cwd, title, session_id, property_id, created_at, updated_at
       FROM conversations ORDER BY updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    agent_id: AgentId;
    model: string;
    cwd: string;
    title: string;
    session_id: string | null;
    property_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    model: row.model,
    cwd: row.cwd,
    title: row.title,
    sessionId: row.session_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getConversation(db: Database.Database, id: string): Conversation | null {
  const row = db
    .prepare(
      `SELECT id, agent_id, model, cwd, title, session_id, property_id, created_at, updated_at
       FROM conversations WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        agent_id: AgentId;
        model: string;
        cwd: string;
        title: string;
        session_id: string | null;
        property_id: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    model: row.model,
    cwd: row.cwd,
    title: row.title,
    sessionId: row.session_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createConversation(
  db: Database.Database,
  input: CreateConversationRequest,
): Conversation {
  const now = new Date().toISOString();
  let cwd = input.cwd ?? process.cwd();
  if (input.propertyId) {
    const property = getProperty(db, input.propertyId);
    if (property) cwd = property.workspacePath;
  }
  const conversation: Conversation = {
    id: randomUUID(),
    agentId: input.agentId,
    model: input.model ?? 'default',
    cwd,
    title: input.title ?? 'New chat',
    propertyId: input.propertyId,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO conversations (id, agent_id, model, cwd, title, session_id, property_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    conversation.id,
    conversation.agentId,
    conversation.model,
    conversation.cwd,
    conversation.title,
    conversation.propertyId ?? null,
    conversation.createdAt,
    conversation.updatedAt,
  );
  return conversation;
}

export function updateConversationSession(
  db: Database.Database,
  conversationId: string,
  sessionId: string,
): void {
  const now = new Date().toISOString();
  db.prepare(`UPDATE conversations SET session_id = ?, updated_at = ? WHERE id = ?`).run(
    sessionId,
    now,
    conversationId,
  );
}

export function updateConversationAgent(
  db: Database.Database,
  conversationId: string,
  agentId: import('@realtor-os/contracts').AgentId,
  model: string,
): Conversation | null {
  const existing = getConversation(db, conversationId);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE conversations SET agent_id = ?, model = ?, session_id = NULL, updated_at = ? WHERE id = ?`,
  ).run(agentId, model, now, conversationId);
  return getConversation(db, conversationId);
}

export function touchConversation(db: Database.Database, conversationId: string, title?: string): void {
  const now = new Date().toISOString();
  if (title) {
    db.prepare(`UPDATE conversations SET updated_at = ?, title = ? WHERE id = ?`).run(
      now,
      title,
      conversationId,
    );
  } else {
    db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);
  }
}

export function listMessages(db: Database.Database, conversationId: string): ChatMessage[] {
  const rows = db
    .prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    )
    .all(conversationId) as Array<{
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function addMessage(
  db: Database.Database,
  conversationId: string,
  role: ChatMessage['role'],
  content: string,
): ChatMessage {
  const message: ChatMessage = {
    id: randomUUID(),
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(message.id, message.conversationId, message.role, message.content, message.createdAt);
  return message;
}

export function createRun(db: Database.Database, conversationId: string, runId: string): void {
  db.prepare(`INSERT INTO runs (id, conversation_id, status, created_at) VALUES (?, ?, 'running', ?)`).run(
    runId,
    conversationId,
    new Date().toISOString(),
  );
}

export function updateRunStatus(
  db: Database.Database,
  runId: string,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
): void {
  db.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(status, runId);
}

export function getServerTokenPath(dataDir = getDefaultDataDir()): string {
  return join(dataDir, 'server.token');
}

export function ensureServerToken(dataDir = getDefaultDataDir()): string {
  mkdirSync(dirname(getServerTokenPath(dataDir)), { recursive: true });
  const tokenPath = getServerTokenPath(dataDir);
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, 'utf8').trim();
    if (existing) return existing;
  }
  const token = randomUUID().replace(/-/g, '');
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return token;
}

type PropertyRow = {
  id: string;
  title: string;
  address: string;
  status: PropertyStatus;
  zillow_url: string | null;
  zpid: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  description: string | null;
  cover_image: string | null;
  workspace_path: string;
  created_at: string;
  updated_at: string;
};

function mapProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    title: row.title,
    address: row.address,
    status: row.status,
    zillowUrl: row.zillow_url ?? undefined,
    zpid: row.zpid ?? undefined,
    price: row.price ?? undefined,
    beds: row.beds ?? undefined,
    baths: row.baths ?? undefined,
    sqft: row.sqft ?? undefined,
    description: row.description ?? undefined,
    coverImage: row.cover_image ?? undefined,
    workspacePath: row.workspace_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProperties(db: Database.Database): Property[] {
  const rows = db
    .prepare(`SELECT * FROM properties ORDER BY updated_at DESC`)
    .all() as PropertyRow[];
  return rows.map(mapProperty);
}

export function listPropertySummaries(db: Database.Database): PropertySummary[] {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM property_assets pa WHERE pa.property_id = p.id AND pa.kind = 'photo') AS photo_count,
        (SELECT COUNT(*) FROM property_comps pc WHERE pc.property_id = p.id) AS comp_count
       FROM properties p
       ORDER BY p.updated_at DESC`,
    )
    .all() as Array<PropertyRow & { photo_count: number; comp_count: number }>;
  return rows.map((row) => ({
    ...mapProperty(row),
    photoCount: row.photo_count,
    compCount: row.comp_count,
    hasImport: row.price != null || row.photo_count > 0,
  }));
}

export function findPropertyByZpid(db: Database.Database, zpid: string): Property | null {
  const row = db.prepare(`SELECT * FROM properties WHERE zpid = ? ORDER BY updated_at DESC LIMIT 1`).get(zpid) as
    | PropertyRow
    | undefined;
  return row ? mapProperty(row) : null;
}

export function getProperty(db: Database.Database, id: string): Property | null {
  const row = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(id) as PropertyRow | undefined;
  return row ? mapProperty(row) : null;
}

export function updateProperty(
  db: Database.Database,
  propertyId: string,
  input: UpdatePropertyRequest,
): Property | null {
  const existing = getProperty(db, propertyId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const title = input.title ?? existing.title;
  const address = input.address ?? existing.address;
  const status = input.status ?? existing.status;
  const zillowUrl = input.zillowUrl !== undefined ? input.zillowUrl : existing.zillowUrl;
  const zpid =
    input.zillowUrl !== undefined
      ? input.zillowUrl
        ? extractZpidFromUrl(input.zillowUrl)
        : undefined
      : existing.zpid;
  const price = input.price !== undefined ? input.price : existing.price;
  const beds = input.beds !== undefined ? input.beds : existing.beds;
  const baths = input.baths !== undefined ? input.baths : existing.baths;
  const sqft = input.sqft !== undefined ? input.sqft : existing.sqft;
  const description = input.description !== undefined ? input.description : existing.description;

  db.prepare(
    `UPDATE properties SET
      title = ?, address = ?, status = ?,
      zillow_url = ?, zpid = ?,
      price = ?, beds = ?, baths = ?, sqft = ?, description = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    title,
    address,
    status,
    zillowUrl ?? null,
    zpid ?? null,
    price ?? null,
    beds ?? null,
    baths ?? null,
    sqft ?? null,
    description ?? null,
    now,
    propertyId,
  );

  const jsonPath = join(existing.workspacePath, 'property.json');
  const jsonPatch: Record<string, unknown> = {};
  if (input.title != null) jsonPatch.title = input.title;
  if (input.address != null) jsonPatch.address = input.address;
  if (input.status != null) jsonPatch.status = input.status;
  if (input.zillowUrl !== undefined) jsonPatch.zillowUrl = input.zillowUrl || undefined;
  if (input.price !== undefined) jsonPatch.price = input.price;
  if (input.beds !== undefined) jsonPatch.beds = input.beds;
  if (input.baths !== undefined) jsonPatch.baths = input.baths;
  if (input.sqft !== undefined) jsonPatch.sqft = input.sqft;
  if (input.description !== undefined) jsonPatch.description = input.description;

  if (Object.keys(jsonPatch).length > 0) {
    let data: Record<string, unknown> = {};
    if (existsSync(jsonPath)) {
      try {
        data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
      } catch {
        data = {};
      }
    }
    writeFileSync(jsonPath, JSON.stringify({ ...data, ...jsonPatch }, null, 2), 'utf8');
  }

  if (input.zillowUrl?.trim()) {
    writeFileSync(
      join(existing.workspacePath, 'source.json'),
      JSON.stringify({ url: input.zillowUrl.trim(), fetchedAt: now }, null, 2),
      'utf8',
    );
  }

  syncPropertyAssets(db, propertyId, existing.workspacePath);
  return getProperty(db, propertyId);
}

export function createProperty(
  db: Database.Database,
  input: CreatePropertyRequest,
  dataDir = getDefaultDataDir(),
): Property {
  const id = randomUUID();
  const now = new Date().toISOString();
  const workspacePath = ensurePropertyWorkspace(id, dataDir);
  const property: Property = {
    id,
    title: input.title ?? 'New property',
    address: input.address ?? 'Address TBD',
    status: input.status ?? 'draft',
    workspacePath,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO properties (
      id, title, address, status, zillow_url, zpid, price, beds, baths, sqft,
      description, cover_image, workspace_path, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  ).run(
    property.id,
    property.title,
    property.address,
    property.status,
    property.workspacePath,
    property.createdAt,
    property.updatedAt,
  );
  return property;
}

export function createPropertyFromZillow(
  db: Database.Database,
  url: string,
  dataDir = getDefaultDataDir(),
): Property {
  const id = randomUUID();
  const now = new Date().toISOString();
  const workspacePath = ensurePropertyWorkspace(id, dataDir);
  const address = parseZillowAddressFromUrl(url);
  const zpid = extractZpidFromUrl(url);
  const property: Property = {
    id,
    title: address,
    address,
    status: 'draft',
    zillowUrl: url,
    zpid,
    workspacePath,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO properties (
      id, title, address, status, zillow_url, zpid, price, beds, baths, sqft,
      description, cover_image, workspace_path, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
  ).run(
    property.id,
    property.title,
    property.address,
    property.status,
    property.zillowUrl ?? null,
    property.zpid ?? null,
    property.workspacePath,
    property.createdAt,
    property.updatedAt,
  );
  return property;
}

export function updatePropertyFromJson(db: Database.Database, propertyId: string): Property | null {
  const property = getProperty(db, propertyId);
  if (!property) return null;
  const jsonPath = join(getPropertyWorkspacePath(propertyId), 'property.json');
  if (!existsSync(jsonPath)) return property;
  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE properties SET
        title = COALESCE(?, title),
        address = COALESCE(?, address),
        price = ?,
        beds = ?,
        baths = ?,
        sqft = ?,
        description = ?,
        cover_image = COALESCE(?, cover_image),
        zpid = COALESCE(?, zpid),
        zillow_url = COALESCE(?, zillow_url),
        updated_at = ?
      WHERE id = ?`,
    ).run(
      (data.title as string) ?? null,
      (data.address as string) ?? null,
      typeof data.price === 'number' ? data.price : null,
      typeof data.beds === 'number' ? data.beds : null,
      typeof data.baths === 'number' ? data.baths : null,
      typeof data.sqft === 'number' ? data.sqft : null,
      (data.description as string) ?? null,
      (data.coverImage as string) ?? null,
      (data.zpid as string) ?? null,
      (data.zillowUrl as string) ?? null,
      now,
      propertyId,
    );
    syncPropertyAssets(db, propertyId, property.workspacePath);
    return getProperty(db, propertyId);
  } catch {
    return property;
  }
}

export function syncPropertyAssets(
  db: Database.Database,
  propertyId: string,
  workspacePath: string,
): void {
  const imagesDir = join(workspacePath, 'images');
  const stagedDir = join(workspacePath, 'staged');

  const existing = listPropertyAssets(db, propertyId);
  const metadataByFilename = new Map<string, string | undefined>();
  for (const asset of existing) {
    metadataByFilename.set(asset.filename, asset.metadata);
  }

  db.prepare(`DELETE FROM property_assets WHERE property_id = ?`).run(propertyId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO property_assets (id, property_id, kind, filename, url, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [dir, kind] of [
    [imagesDir, 'photo'],
    [stagedDir, 'staged'],
  ] as const) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) continue;
      const rel = `${kind === 'photo' ? 'images' : 'staged'}/${name}`;
      const preserved = metadataByFilename.get(rel);
      const sidecar = readAssetMetadataSidecar(workspacePath, rel);
      const metadataJson =
        preserved ??
        (Object.keys(sidecar).length > 0 ? JSON.stringify(sidecar) : undefined);
      if (metadataJson && !preserved) {
        writeAssetMetadataSidecar(workspacePath, rel, sidecar);
      }
      insert.run(
        randomUUID(),
        propertyId,
        kind,
        rel,
        `/api/properties/${propertyId}/file?path=${encodeURIComponent(rel)}`,
        metadataJson ?? null,
        now,
      );
    }
  }
}

export function updatePropertyAsset(
  db: Database.Database,
  propertyId: string,
  assetId: string,
  metadata: AssetMetadata,
): PropertyAsset | null {
  const property = getProperty(db, propertyId);
  if (!property) return null;

  const row = db
    .prepare(
      `SELECT id, property_id, kind, filename, url, metadata, created_at
       FROM property_assets WHERE id = ? AND property_id = ?`,
    )
    .get(assetId, propertyId) as
    | {
        id: string;
        property_id: string;
        kind: PropertyAssetKind;
        filename: string;
        url: string | null;
        metadata: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;

  const metadataJson = JSON.stringify(metadata);
  db.prepare(`UPDATE property_assets SET metadata = ? WHERE id = ? AND property_id = ?`).run(
    metadataJson,
    assetId,
    propertyId,
  );
  writeAssetMetadataSidecar(property.workspacePath, row.filename, metadata);

  return {
    id: row.id,
    propertyId: row.property_id,
    kind: row.kind,
    filename: row.filename,
    url: row.url ?? undefined,
    metadata: metadataJson,
    createdAt: row.created_at,
  };
}

export function listPropertyAssets(db: Database.Database, propertyId: string): PropertyAsset[] {
  const rows = db
    .prepare(
      `SELECT id, property_id, kind, filename, url, metadata, created_at
       FROM property_assets WHERE property_id = ? ORDER BY filename ASC`,
    )
    .all(propertyId) as Array<{
    id: string;
    property_id: string;
    kind: PropertyAssetKind;
    filename: string;
    url: string | null;
    metadata: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    kind: row.kind,
    filename: row.filename,
    url: row.url ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  }));
}
