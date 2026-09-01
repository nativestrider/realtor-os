import { randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import type { Express, Response } from 'express';
import type Database from 'better-sqlite3';
import {
  createConversation,
  createProperty,
  createPropertyFromZillow,
  createRun,
  findPropertyByZpid,
  getProperty,
  listPropertySummaries,
  listPropertyAssets,
  updateProperty,
  updatePropertyAsset,
  updatePropertyFromJson,
} from '../db.js';
import { parseFolderUpload } from '../import-folder.js';
import { extractZpidFromUrl } from '../property-workspace.js';
import {
  createComparable,
  deleteComparable,
  listComparables,
  updateComparable,
} from '../comparables.js';
import type {
  CreateComparableRequest,
  CreatePropertyRequest,
  ImportZillowRequest,
  PropertyActionRequest,
  UpdateComparableRequest,
  UpdatePropertyAssetRequest,
  UpdatePropertyRequest,
} from '@realtor-os/contracts';
import {
  listPropertyFiles,
  resolveSafeFilePath,
} from '../property-workspace.js';
import { listSkills, stageSkill } from '../skills.js';
import { startChatRun } from '../runner.js';

function isValidZillowUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('zillow.com') && u.pathname.includes('/homedetails/');
  } catch {
    return false;
  }
}

function streamRun(
  res: Response,
  runHandler: (runId: string, send: (event: string, data: unknown) => void) => Promise<void>,
): void {
  const runId = randomUUID();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('run', { runId });

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  void (async () => {
    try {
      await runHandler(runId, send);
    } catch (err) {
      send('message', {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      send('message', { type: 'done' });
    } finally {
      clearInterval(keepalive);
      res.end();
    }
  })();
}

export function registerPropertyRoutes(
  app: Express,
  db: Database.Database,
  dataDir: string,
): void {
  app.get('/api/skills', (_req, res) => {
    res.json({ skills: listSkills(dataDir) });
  });

  app.get('/api/properties', (_req, res) => {
    const ids = db.prepare(`SELECT id FROM properties`).all() as Array<{ id: string }>;
    for (const { id } of ids) {
      updatePropertyFromJson(db, id);
    }
    res.json({ properties: listPropertySummaries(db) });
  });

  app.patch('/api/properties/:id', (req, res) => {
    const body = req.body as UpdatePropertyRequest;
    const property = updateProperty(db, req.params.id, body);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json({ property });
  });

  app.post('/api/properties', (req, res) => {
    const body = req.body as CreatePropertyRequest;
    const property = createProperty(db, body, dataDir);
    res.status(201).json({ property });
  });

  app.post('/api/properties/import-zillow', (req, res) => {
    const body = req.body as ImportZillowRequest;
    if (!body?.url?.trim() || !isValidZillowUrl(body.url)) {
      res.status(400).json({ error: 'Valid Zillow homedetails URL is required' });
      return;
    }
    const url = body.url.trim();
    const mode = body.mode ?? 'default';
    const zpid = extractZpidFromUrl(url);

    if (zpid && mode !== 'duplicate') {
      const existing = findPropertyByZpid(db, zpid);
      if (existing) {
        writeFileSync(
          `${existing.workspacePath}/source.json`,
          JSON.stringify({ url, fetchedAt: new Date().toISOString() }, null, 2),
          'utf8',
        );
        res.json({ property: existing, existing: true });
        return;
      }
    }

    const property = createPropertyFromZillow(db, url, dataDir);
    writeFileSync(
      `${property.workspacePath}/source.json`,
      JSON.stringify({ url, fetchedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
    res.status(201).json({ property, existing: false });
  });

  app.post('/api/properties/import-folder', (req, res) => {
    const property = createProperty(db, { title: 'Imported folder', address: 'Address TBD' }, dataDir);
    void parseFolderUpload(req, property.workspacePath)
      .then((filesWritten) => {
        if (filesWritten === 0) {
          res.status(400).json({ error: 'No files received. Select a folder with property data.' });
          return;
        }
        updatePropertyFromJson(db, property.id);
        const refreshed = getProperty(db, property.id)!;
        res.status(201).json({ property: refreshed, filesWritten });
      })
      .catch((err) => {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      });
  });

  app.post('/api/properties/:id/import-folder', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    void parseFolderUpload(req, property.workspacePath)
      .then((filesWritten) => {
        if (filesWritten === 0) {
          res.status(400).json({ error: 'No files received. Select a folder with property data.' });
          return;
        }
        updatePropertyFromJson(db, property.id);
        const refreshed = getProperty(db, property.id)!;
        res.json({ property: refreshed, filesWritten });
      })
      .catch((err) => {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      });
  });

  app.get('/api/properties/:id', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    updatePropertyFromJson(db, property.id);
    const refreshed = getProperty(db, property.id)!;
    const assets = listPropertyAssets(db, property.id);
    const comparables = listComparables(db, property.id);
    res.json({ property: refreshed, assets, comparables });
  });

  app.patch('/api/properties/:id/assets/:assetId', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const body = req.body as UpdatePropertyAssetRequest;
    if (!body?.metadata || typeof body.metadata !== 'object') {
      res.status(400).json({ error: 'metadata object is required' });
      return;
    }
    const asset = updatePropertyAsset(db, property.id, req.params.assetId, body.metadata);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    res.json({ asset });
  });

  app.get('/api/properties/:id/comps', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json({ comparables: listComparables(db, property.id) });
  });

  app.post('/api/properties/:id/comps', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const body = req.body as CreateComparableRequest;
    try {
      const comp = createComparable(db, property.id, property.workspacePath, body);
      res.status(201).json({ comparable: comp });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/properties/:id/comps/:compId', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const body = req.body as UpdateComparableRequest;
    const comp = updateComparable(db, property.id, property.workspacePath, req.params.compId, body);
    if (!comp) {
      res.status(404).json({ error: 'Comparable not found' });
      return;
    }
    res.json({ comparable: comp });
  });

  app.delete('/api/properties/:id/comps/:compId', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const deleted = deleteComparable(db, property.id, property.workspacePath, req.params.compId);
    if (!deleted) {
      res.status(404).json({ error: 'Comparable not found' });
      return;
    }
    res.status(204).end();
  });

  app.get('/api/properties/:id/files', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json({ files: listPropertyFiles(property.workspacePath) });
  });

  app.get('/api/properties/:id/file', (req, res) => {
    const property = getProperty(db, req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const relPath = String(req.query.path ?? '');
    if (!relPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    const filePath = resolveSafeFilePath(property.workspacePath, relPath);
    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.sendFile(filePath);
  });

  app.post('/api/properties/:id/actions/:skillId', (req, res) => {
    const { id, skillId } = req.params;
    const body = req.body as PropertyActionRequest;
    const property = getProperty(db, id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    const staged = stageSkill(skillId, property.workspacePath, dataDir);
    if (!staged) {
      res.status(404).json({ error: `Skill not found: ${skillId}` });
      return;
    }

    const agentId = body.agentId ?? 'claude';
    const model = body.model ?? 'default';
    const userMessage =
      body.message?.trim() ??
      `Run the ${skillId} skill workflow for this property.`;

    const conversation = createConversation(db, {
      agentId,
      model,
      propertyId: property.id,
      title: `${skillId} — ${property.title}`,
    });

    streamRun(res, async (runId, send) => {
      createRun(db, conversation.id, runId);
      await startChatRun({
        db,
        conversationId: conversation.id,
        message: userMessage,
        skillId,
        onEvent: (evt) => send('message', evt),
        onComplete: () => {
          updatePropertyFromJson(db, property.id);
        },
      });
    });
  });
}
