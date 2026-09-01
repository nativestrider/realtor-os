import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RunEvent } from '@realtor-os/contracts';
import {
  addMessage,
  getConversation,
  getDefaultDataDir,
  listMessages,
  touchConversation,
  updateConversationSession,
  updatePropertyFromJson,
  updateRunStatus,
} from './db.js';
import { composeAgentPrompt } from './prompts/compose.js';
import { getMemoriesForPrompt } from './memory.js';
import { stageSkill } from './skills.js';
import { resolveAgentLaunch, spawnAgent } from './runtimes/detection.js';
import { runAcpSession } from './runtimes/acp-runner.js';
import {
  buildClaudeStdinPrompt,
  createClaudeStreamHandler,
} from './runtimes/claude-stream.js';
import { createCodexStreamHandler } from './runtimes/codex-stream.js';
import type { ActiveRun } from './runtimes/types.js';

const activeRuns = new Map<string, ActiveRun>();

export function getActiveRun(runId: string): ActiveRun | undefined {
  return activeRuns.get(runId);
}

export function cancelRun(runId: string): boolean {
  const run = activeRuns.get(runId);
  if (!run) return false;
  run.cancel();
  activeRuns.delete(runId);
  return true;
}

export interface StartChatRunOptions {
  db: Database.Database;
  conversationId: string;
  message: string;
  skillId?: string;
  onEvent: (event: RunEvent) => void;
  onComplete?: () => void;
}

export async function startChatRun(options: StartChatRunOptions): Promise<string> {
  const { db, conversationId, message, skillId, onEvent, onComplete } = options;
  const conversation = getConversation(db, conversationId);
  if (!conversation) {
    onEvent({ type: 'error', message: 'Conversation not found' });
    onEvent({ type: 'done' });
    return randomUUID();
  }

  const launch = await resolveAgentLaunch(conversation.agentId);
  if (!launch) {
    onEvent({
      type: 'error',
      message: `${conversation.agentId} CLI not found on PATH`,
    });
    onEvent({ type: 'done' });
    return randomUUID();
  }

  const runId = randomUUID();
  const abortController = new AbortController();

  activeRuns.set(runId, {
    id: runId,
    conversationId,
    child: null,
    cancel: () => {
      abortController.abort();
    },
  });

  addMessage(db, conversationId, 'user', message);
  touchConversation(db, conversationId, message.slice(0, 80) || conversation.title);

  if (skillId) {
    stageSkill(skillId, conversation.cwd);
  }

  const dataDir = getDefaultDataDir();
  const history = listMessages(db, conversationId)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1);

  const memories = getMemoriesForPrompt(dataDir);

  const agentMessage =
    conversation.propertyId || skillId
      ? composeAgentPrompt({
          agentId: conversation.agentId,
          workspacePath: conversation.cwd,
          skillId,
          userMessage: message,
          isPropertyScoped: Boolean(conversation.propertyId),
          memories,
          priorMessages: history,
        })
      : composeAgentPrompt({
          agentId: conversation.agentId,
          workspacePath: conversation.cwd,
          userMessage: message,
          memories,
          priorMessages: history,
        });

  const historyForClaude = history;

  let assistantText = '';

  const emit = (event: RunEvent) => {
    if (event.type === 'text_delta' && event.text) {
      assistantText += event.text;
    }
    onEvent(event);
  };

  try {
    const runtimeContext = {
      cwd: conversation.cwd,
      resumeSessionId: conversation.sessionId ?? null,
      newSessionId: conversation.sessionId ? null : randomUUID(),
    };

    const args = launch.def.buildArgs(
      agentMessage,
      { model: conversation.model },
      runtimeContext,
    );

    const child = spawnAgent(launch, args, conversation.cwd);
    const active = activeRuns.get(runId);
    if (active) active.child = child;

    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8').trim();
      if (text) {
        emit({ type: 'status', status: text.slice(0, 200) });
      }
    });

    if (launch.def.streamFormat === 'acp') {
      child.on('error', (err) => {
        emit({ type: 'error', message: err.message });
      });

      const result = await runAcpSession({
        child,
        prompt: agentMessage,
        cwd: conversation.cwd,
        model: conversation.model,
        resumeSessionId: conversation.sessionId,
        onEvent: emit,
        signal: abortController.signal,
      });

      if (result.sessionId) {
        updateConversationSession(db, conversationId, result.sessionId);
      }
    } else if (launch.def.streamFormat === 'claude-stream-json') {
      await runClaudeStream({
        child,
        message: agentMessage,
        history: historyForClaude,
        emit,
        signal: abortController.signal,
        runtimeContext,
      });
      if (runtimeContext.newSessionId && !conversation.sessionId) {
        updateConversationSession(db, conversationId, runtimeContext.newSessionId);
      }
    } else if (launch.def.streamFormat === 'json-event-stream') {
      const captured = await runCodexStream({
        child,
        message: agentMessage,
        emit,
        signal: abortController.signal,
      });
      if (captured) {
        updateConversationSession(db, conversationId, captured);
      }
    } else {
      emit({ type: 'error', message: `Unsupported stream format: ${launch.def.streamFormat}` });
    }

    if (assistantText.trim()) {
      addMessage(db, conversationId, 'assistant', assistantText.trim());
    }
    if (conversation.propertyId) {
      updatePropertyFromJson(db, conversation.propertyId);
    }
    onComplete?.();
    touchConversation(db, conversationId);
    updateRunStatus(db, runId, abortController.signal.aborted ? 'cancelled' : 'completed');
    emit({ type: 'done' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('cancelled')) {
      updateRunStatus(db, runId, 'cancelled');
      emit({ type: 'error', message: 'Run cancelled' });
    } else {
      updateRunStatus(db, runId, 'failed');
      if (!msg.includes('AUTH_REQUIRED')) {
        emit({ type: 'error', message: msg });
      }
    }
    emit({ type: 'done' });
  } finally {
    activeRuns.delete(runId);
  }

  return runId;
}

async function runClaudeStream(options: {
  child: import('node:child_process').ChildProcessWithoutNullStreams;
  message: string;
  history: Array<{ role: string; content: string }>;
  emit: (event: RunEvent) => void;
  signal: AbortSignal;
  runtimeContext: { newSessionId?: string | null };
}) {
  const { child, message, history, emit, signal } = options;
  const handler = createClaudeStreamHandler(emit);
  emit({ type: 'status', status: 'running' });

  const done = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (buf: Buffer) => handler.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      handler.flush();
      if (code && code !== 0) {
        reject(new Error(`Claude exited with code ${code}`));
      } else {
        resolve();
      }
    });
    signal.addEventListener('abort', () => {
      child.kill('SIGTERM');
    });
  });

  const stdinPayload = buildClaudeStdinPrompt(message, history);
  child.stdin.write(stdinPayload);
  child.stdin.end();
  await done;
}

async function runCodexStream(options: {
  child: import('node:child_process').ChildProcessWithoutNullStreams;
  message: string;
  emit: (event: RunEvent) => void;
  signal: AbortSignal;
}): Promise<string | null> {
  const { child, message, emit, signal } = options;
  const handler = createCodexStreamHandler(emit);
  emit({ type: 'status', status: 'running' });

  const done = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (buf: Buffer) => handler.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      handler.flush();
      if (code && code !== 0) {
        reject(new Error(`Codex exited with code ${code}`));
      } else {
        resolve();
      }
    });
    signal.addEventListener('abort', () => {
      child.kill('SIGTERM');
    });
  });

  child.stdin.write(message);
  child.stdin.end();
  await done;
  return handler.getCapturedSessionId();
}
