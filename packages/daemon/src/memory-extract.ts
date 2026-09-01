import { randomUUID } from 'node:crypto';
import type { AgentId, ChatMessage, RunEvent } from '@realtor-os/contracts';
import { appendLearnedMemories, readUserSettings } from './user-settings.js';
import { getDefaultDataDir } from './db.js';
import { resolveAgentLaunch, spawnAgent } from './runtimes/detection.js';
import { runAcpSession } from './runtimes/acp-runner.js';
import {
  buildClaudeStdinPrompt,
  createClaudeStreamHandler,
} from './runtimes/claude-stream.js';
import { createCodexStreamHandler } from './runtimes/codex-stream.js';

const EXTRACTION_TIMEOUT_MS = 90_000;

const EXTRACTION_SYSTEM = `You extract durable facts about the USER (not property details) from a chat transcript.

Return ONLY valid JSON with this shape:
{"memories":["fact one","fact two"]}

Rules:
- Include preferences, role, market area, communication style, standing instructions, workflows they care about.
- Skip property-specific facts, one-off tasks, greetings, and tool output.
- Each memory is one short sentence, third person ("User prefers…").
- Return {"memories":[]} if nothing new is worth remembering.
- Do not wrap JSON in markdown fences.`;

export function parseExtractedMemories(text: string): string[] {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/u);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(jsonStr) as { memories?: unknown };
    if (!Array.isArray(parsed.memories)) return [];
    return parsed.memories
      .filter((m): m is string => typeof m === 'string')
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function buildExtractionPrompt(
  exchange: Array<{ role: string; content: string }>,
  knownFacts: string[],
): string {
  const transcript = exchange
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n')
    .slice(0, 16_000);
  const known =
    knownFacts.length > 0
      ? `\n\nAlready stored (do not repeat):\n${knownFacts.map((f) => `- ${f}`).join('\n')}`
      : '';
  return `${EXTRACTION_SYSTEM}\n\n## Conversation\n\n${transcript}${known}`;
}

function collectText(onEvent: (event: RunEvent) => void): { emit: (event: RunEvent) => void; getText: () => string } {
  let text = '';
  return {
    emit: (event) => {
      if (event.type === 'text_delta' && event.text) text += event.text;
      onEvent(event);
    },
    getText: () => text,
  };
}

async function runSilentAgentPrompt(options: {
  agentId: AgentId;
  model: string;
  cwd: string;
  prompt: string;
}): Promise<string | null> {
  const launch = await resolveAgentLaunch(options.agentId);
  if (!launch) return null;

  const runtimeContext = {
    cwd: options.cwd,
    resumeSessionId: null as string | null,
    newSessionId: randomUUID(),
  };

  const args = launch.def.buildArgs(
    options.prompt,
    { model: options.model },
    runtimeContext,
  );

  const child = spawnAgent(launch, args, options.cwd);
  const collector = collectText(() => {});

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('memory extraction timed out')), EXTRACTION_TIMEOUT_MS);
  });

  try {
    if (launch.def.streamFormat === 'acp') {
      await Promise.race([
        runAcpSession({
          child,
          prompt: options.prompt,
          cwd: options.cwd,
          model: options.model,
          onEvent: collector.emit,
        }),
        timeout,
      ]);
    } else if (launch.def.streamFormat === 'claude-stream-json') {
      await Promise.race([
        runClaudeSilent(child, options.prompt, collector.emit),
        timeout,
      ]);
    } else if (launch.def.streamFormat === 'json-event-stream') {
      await Promise.race([
        runCodexSilent(child, options.prompt, collector.emit),
        timeout,
      ]);
    } else {
      return null;
    }

    return collector.getText().trim() || null;
  } catch {
    return null;
  } finally {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function runClaudeSilent(
  child: import('node:child_process').ChildProcessWithoutNullStreams,
  message: string,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const handler = createClaudeStreamHandler(emit);
  const done = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (buf: Buffer) => handler.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      handler.flush();
      if (code && code !== 0) reject(new Error(`Claude exited with code ${code}`));
      else resolve();
    });
  });
  child.stdin.write(buildClaudeStdinPrompt(message, []));
  child.stdin.end();
  await done;
}

async function runCodexSilent(
  child: import('node:child_process').ChildProcessWithoutNullStreams,
  message: string,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const handler = createCodexStreamHandler(emit);
  const done = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (buf: Buffer) => handler.push(buf.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      handler.flush();
      if (code && code !== 0) reject(new Error(`Codex exited with code ${code}`));
      else resolve();
    });
  });
  child.stdin.write(message);
  child.stdin.end();
  await done;
}

function conversationTranscript(
  messages: ChatMessage[],
): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}

export async function extractMemoriesFromConversation(options: {
  agentId: AgentId;
  model: string;
  cwd: string;
  messages: ChatMessage[];
  dataDir?: string;
}): Promise<string[]> {
  const dataDir = options.dataDir ?? getDefaultDataDir();
  const settings = readUserSettings(dataDir);

  const transcript = conversationTranscript(options.messages);
  if (transcript.length < 2) return [];

  const knownFacts = [...settings.memories, ...settings.learnedMemories];
  const prompt = buildExtractionPrompt(transcript, knownFacts);
  const response = await runSilentAgentPrompt({
    agentId: options.agentId,
    model: options.model,
    cwd: options.cwd,
    prompt,
  });
  if (!response) return [];

  const facts = parseExtractedMemories(response);
  if (!facts.length) return [];

  appendLearnedMemories(facts, dataDir);
  return facts;
}
