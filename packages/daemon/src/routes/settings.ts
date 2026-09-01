import type { Express } from 'express';
import type Database from 'better-sqlite3';
import type { UpdateConversationRequest, UpdateUserSettingsRequest } from '@realtor-os/contracts';
import { getConversation, listMessages, updateConversationAgent } from '../db.js';
import { extractMemoriesFromConversation, getMemoryStatus } from '../memory.js';
import { readUserSettings, writeUserSettings } from '../user-settings.js';

export function registerSettingsRoutes(app: Express, db: Database.Database, dataDir: string): void {
  app.get('/api/settings', (_req, res) => {
    const settings = readUserSettings(dataDir);
    const memory = getMemoryStatus(dataDir);
    res.json({ settings, memory });
  });

  app.patch('/api/settings', (req, res) => {
    const body = req.body as UpdateUserSettingsRequest;
    const current = readUserSettings(dataDir);
    const memories =
      body.memories != null
        ? body.memories.map((m) => m.trim()).filter(Boolean)
        : current.memories;
    const learnedMemories = body.clearLearnedMemories
      ? []
      : body.learnedMemories != null
        ? body.learnedMemories.map((m) => m.trim()).filter(Boolean)
        : current.learnedMemories;
    const settings = writeUserSettings(
      {
        ...current,
        ...body,
        memories,
        learnedMemories,
      },
      dataDir,
    );
    res.json({ settings, memory: getMemoryStatus(dataDir) });
  });

  app.patch('/api/conversations/:id', (req, res) => {
    const body = req.body as UpdateConversationRequest;
    if (!body.agentId) {
      res.status(400).json({ error: 'agentId is required' });
      return;
    }
    const conversation = updateConversationAgent(
      db,
      req.params.id,
      body.agentId,
      body.model ?? 'default',
    );
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ conversation });
  });

  app.post('/api/conversations/:id/memories', async (req, res) => {
    const conversation = getConversation(db, req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = listMessages(db, conversation.id);
    const chatMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (chatMessages.length < 2) {
      res.status(400).json({ error: 'Need at least one exchange in this chat to extract memories' });
      return;
    }

    try {
      const added = await extractMemoriesFromConversation({
        agentId: conversation.agentId,
        model: conversation.model,
        cwd: conversation.cwd,
        messages,
        dataDir,
      });
      res.json({ added, memory: getMemoryStatus(dataDir) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Memory extraction failed',
      });
    }
  });
}
