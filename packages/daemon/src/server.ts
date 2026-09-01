import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type { CreateConversationRequest } from '@realtor-os/contracts';
import {
  createConversation,
  createRun,
  ensureServerToken,
  getDefaultDataDir,
  listConversations,
  listMessages,
  openDatabase,
} from './db.js';
import { detectAgents } from './runtimes/detection.js';
import { cancelRun, getActiveRun, startChatRun } from './runner.js';
import { registerPropertyRoutes } from './routes/properties.js';
import { registerSettingsRoutes } from './routes/settings.js';

export interface CreateServerOptions {
  dataDir?: string;
  token?: string;
  bindHost?: string;
}

export function createApp(options: CreateServerOptions = {}) {
  const dataDir = options.dataDir ?? getDefaultDataDir();
  const token = options.token ?? ensureServerToken(dataDir);
  const db = openDatabase(dataDir);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health') return next();
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const provided = bearer ?? queryToken;
    if (provided !== token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'realtor-os-daemon' });
  });

  app.get('/api/agents', async (_req, res) => {
    const agents = await detectAgents();
    res.json({ agents });
  });

  app.get('/api/conversations', (_req, res) => {
    res.json({ conversations: listConversations(db) });
  });

  app.post('/api/conversations', (req, res) => {
    const body = req.body as CreateConversationRequest;
    if (!body?.agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }
    const conversation = createConversation(db, body);
    res.status(201).json({ conversation });
  });

  app.get('/api/conversations/:id/messages', (req, res) => {
    res.json({ messages: listMessages(db, req.params.id) });
  });

  app.post('/api/chat', async (req, res) => {
    const { conversationId, message, skillId } = req.body as {
      conversationId?: string;
      message?: string;
      skillId?: string;
    };
    if (!conversationId || !message?.trim()) {
      res.status(400).json({ error: 'conversationId and message are required' });
      return;
    }

    const runId = randomUUID();
    createRun(db, conversationId, runId);

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

    try {
      await startChatRun({
        db,
        conversationId,
        message: message.trim(),
        skillId: skillId?.trim() || undefined,
        onEvent: (evt) => send('message', evt),
      });
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
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = getActiveRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Run not found or already finished' });
      return;
    }
    cancelRun(req.params.id);
    res.json({ ok: true });
  });

  registerPropertyRoutes(app, db, dataDir);
  registerSettingsRoutes(app, db, dataDir);

  return { app, token, dataDir };
}

export function startServer(port: number, options: CreateServerOptions = {}) {
  const { app, token, dataDir } = createApp(options);
  const host = options.bindHost ?? '127.0.0.1';
  return new Promise<{ port: number; token: string; dataDir: string; close: () => void }>(
    (resolve) => {
      const server = app.listen(port, host, () => {
        resolve({
          port,
          token,
          dataDir,
          close: () => server.close(),
        });
      });
    },
  );
}
