/**
 * Simplified Codex json-event-stream parser (inspired by open-design, Apache-2.0).
 */
import type { RunEvent } from '@realtor-os/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const nested = parsed.error;
        if (isRecord(nested) && typeof nested.message === 'string' && nested.message) {
          return nested.message;
        }
        if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
      } catch {
        // use raw string
      }
    }
    return trimmed || fallback;
  }
  if (isRecord(value)) {
    if (isRecord(value.error) && typeof value.error.message === 'string' && value.error.message) {
      return value.error.message;
    }
    if (typeof value.message === 'string' && value.message) return value.message;
    if (typeof value.detail === 'string' && value.detail) return value.detail;
    if (typeof value.error === 'string' && value.error) return value.error;
  }
  return fallback;
}

export function createCodexStreamHandler(onEvent: (event: RunEvent) => void) {
  let buffer = '';
  let capturedSessionId: string | null = null;
  const codexToolUses = new Set<string>();

  function handleObject(obj: Record<string, unknown>) {
    const type = obj.type;
    if (type === 'thread.started') {
      const threadId =
        typeof obj.thread_id === 'string'
          ? obj.thread_id
          : isRecord(obj.thread) && typeof obj.thread.thread_id === 'string'
            ? obj.thread.thread_id
            : null;
      if (threadId) capturedSessionId = threadId;
      return;
    }

    if (type === 'item.started' && isRecord(obj.item)) {
      const item = obj.item as Record<string, unknown>;
      if (item.type === 'agent_message') {
        onEvent({ type: 'status', status: 'thinking' });
      }
      if (item.type === 'command_execution' || item.type === 'file_change') {
        const id = typeof item.id === 'string' ? item.id : cryptoRandomId();
        if (!codexToolUses.has(id)) {
          codexToolUses.add(id);
          onEvent({
            type: 'tool_call',
            toolCall: {
              id,
              name: String(item.type),
              input: item,
            },
          });
        }
      }
      return;
    }

    if (type === 'item.completed' && isRecord(obj.item)) {
      const item = obj.item as Record<string, unknown>;
      if (item.type === 'agent_message' && typeof item.text === 'string') {
        onEvent({ type: 'text_delta', text: item.text });
      }
      if (item.type === 'command_execution' || item.type === 'file_change') {
        const id = typeof item.id === 'string' ? item.id : '';
        onEvent({
          type: 'tool_result',
          toolResult: {
            toolUseId: id,
            content: JSON.stringify(item),
          },
        });
      }
      return;
    }

    if (type === 'turn.completed' || type === 'turn.failed') {
      if (type === 'turn.failed') {
        onEvent({
          type: 'error',
          message: extractErrorMessage(obj.error, 'Codex turn failed'),
        });
      }
      return;
    }

    if (type === 'error') {
      onEvent({
        type: 'error',
        message: extractErrorMessage(obj.error ?? obj.message, 'Codex error'),
      });
    }
  }

  function handleLine(line: string) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (isRecord(obj)) handleObject(obj);
    } catch {
      // ignore
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) handleLine(trimmed);
      }
    },
    flush() {
      const trimmed = buffer.trim();
      if (trimmed) handleLine(trimmed);
      buffer = '';
    },
    getCapturedSessionId: () => capturedSessionId,
  };
}

function cryptoRandomId(): string {
  return `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
