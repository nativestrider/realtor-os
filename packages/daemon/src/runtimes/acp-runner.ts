import { Writable, Readable } from 'node:stream';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as acp from '@agentclientprotocol/sdk';
import type { RunEvent } from '@realtor-os/contracts';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface AcpRunOptions {
  child: ChildProcessWithoutNullStreams;
  prompt: string;
  cwd: string;
  model?: string;
  resumeSessionId?: string | null;
  onEvent: (event: RunEvent) => void;
  signal?: AbortSignal;
  authLoginHint?: string;
}

export async function runAcpSession(options: AcpRunOptions): Promise<{ sessionId?: string }> {
  const { child, prompt, cwd, resumeSessionId, onEvent, signal } = options;

  onEvent({ type: 'status', status: 'initializing' });

  const input = Writable.toWeb(child.stdin);
  const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
  const stream = acp.ndJsonStream(input, output);

  let capturedSessionId: string | undefined = resumeSessionId ?? undefined;
  let activeSessionId: string | null = null;
  /** `nextUpdate()` already consumes `session/update`; skip the raw notification then. */
  let drivenByNextUpdate = false;

  const abortPromise = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  });

  const runPromise = acp
    .client({ name: 'realtor-os' })
    .onRequest(acp.methods.client.session.requestPermission, async (ctx) => {
      const allow =
        ctx.params.options.find((o) => o.kind === 'allow_once') ?? ctx.params.options[0];
      return {
        outcome: allow
          ? { outcome: 'selected', optionId: allow.optionId }
          : { outcome: 'cancelled' },
      };
    })
    .onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
      const content = await readFile(ctx.params.path, 'utf8');
      return { content };
    })
    .onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
      await mkdir(dirname(ctx.params.path), { recursive: true });
      await writeFile(ctx.params.path, ctx.params.content, 'utf8');
      return {};
    })
    .onNotification(acp.methods.client.session.update, (ctx) => {
      if (drivenByNextUpdate) return;
      if (activeSessionId && ctx.params.sessionId === activeSessionId) {
        handleSessionUpdate(ctx.params.update, onEvent);
      }
    })
    .connectWith(stream, async (ctx) => {
      await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
      });

      onEvent({ type: 'status', status: 'running' });

      if (resumeSessionId) {
        await ctx.request(acp.methods.agent.session.resume, {
          sessionId: resumeSessionId,
          cwd,
          mcpServers: [],
        });
        activeSessionId = resumeSessionId;
        capturedSessionId = resumeSessionId;

        await ctx.request(acp.methods.agent.session.prompt, {
          sessionId: resumeSessionId,
          prompt: [{ type: 'text', text: prompt }],
        });
        onEvent({ type: 'done' });
        return;
      }

      drivenByNextUpdate = true;
      await ctx.buildSession(cwd).withSession(async (session) => {
        activeSessionId = session.sessionId;
        capturedSessionId = session.sessionId;
        await driveSession(session, prompt, onEvent);
      });
    });

  try {
    await Promise.race([runPromise, abortPromise]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('cancelled')) {
      throw err;
    }
    if (message.includes('AUTH_REQUIRED') || message.includes('-32000')) {
      const login = options.authLoginHint ?? 'the agent CLI login command';
      onEvent({
        type: 'error',
        code: 'AUTH_REQUIRED',
        message: `Authentication required. Run \`${login}\` in your terminal.`,
      });
      throw err;
    }
    onEvent({ type: 'error', message });
    throw err;
  }

  return { sessionId: capturedSessionId };
}

function handleSessionUpdate(
  update: acp.SessionUpdate,
  onEvent: (event: RunEvent) => void,
) {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      if (update.content.type === 'text' && update.content.text) {
        onEvent({ type: 'text_delta', text: update.content.text });
      }
      break;
    case 'agent_thought_chunk':
      if (update.content.type === 'text' && update.content.text) {
        onEvent({ type: 'thinking_delta', text: update.content.text });
      }
      break;
    case 'tool_call':
      onEvent({
        type: 'tool_call',
        toolCall: {
          id: update.toolCallId,
          name: update.title,
          input: {},
        },
      });
      break;
    case 'tool_call_update':
      if (update.status === 'completed' || update.status === 'failed') {
        onEvent({
          type: 'tool_result',
          toolResult: {
            toolUseId: update.toolCallId,
            content: update.status,
            isError: update.status === 'failed',
          },
        });
      }
      break;
    default:
      break;
  }
}

async function driveSession(
  session: acp.ActiveSession,
  prompt: string,
  onEvent: (event: RunEvent) => void,
) {
  session.prompt(prompt);

  for (;;) {
    const update = await session.nextUpdate();
    if (update.kind === 'stop') {
      onEvent({ type: 'done' });
      return;
    }
    handleSessionUpdate(update.update, onEvent);
  }
}
