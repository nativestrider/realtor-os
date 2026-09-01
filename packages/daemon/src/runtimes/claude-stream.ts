/**
 * Simplified Claude stream-json parser (inspired by open-design, Apache-2.0).
 */
import type { RunEvent } from '@realtor-os/contracts';

type BlockState = {
  type?: unknown;
  name?: unknown;
  id?: unknown;
  input: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createClaudeStreamHandler(onEvent: (event: RunEvent) => void) {
  let buffer = '';
  const blocks = new Map<string, BlockState>();
  const streamedToolUseIds = new Set<string>();
  let currentMessageId: string | null = null;
  const textStreamed = new Set<string>();

  function emitToolUse(id: unknown, name: unknown, input: unknown) {
    if (typeof id !== 'string' || typeof name !== 'string') return;
    if (streamedToolUseIds.has(id)) return;
    streamedToolUseIds.add(id);
    onEvent({
      type: 'tool_call',
      toolCall: { id, name, input: input ?? {} },
    });
  }

  function handleLine(line: string) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = obj.type;
    if (type === 'assistant' && isRecord(obj.message)) {
      const message = obj.message as Record<string, unknown>;
      const messageId = typeof message.id === 'string' ? message.id : 'assistant';
      if (textStreamed.has(messageId)) return;
      const content = message.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block.type === 'text' && typeof block.text === 'string') {
          onEvent({ type: 'text_delta', text: block.text });
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          onEvent({ type: 'thinking_delta', text: block.thinking });
        } else if (block.type === 'tool_use') {
          emitToolUse(block.id, block.name, block.input);
        }
      }
      return;
    }

    if (type === 'stream_event' && isRecord(obj.event)) {
      const event = obj.event as Record<string, unknown>;
      const eventType = event.type;
      if (eventType === 'message_start' && isRecord(event.message)) {
        currentMessageId = typeof event.message.id === 'string' ? event.message.id : null;
        if (currentMessageId) textStreamed.add(currentMessageId);
      }
      if (eventType === 'content_block_delta' && isRecord(event.delta)) {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          onEvent({ type: 'text_delta', text: delta.text });
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          onEvent({ type: 'thinking_delta', text: delta.thinking });
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const index = typeof event.index === 'number' ? event.index : 0;
          const key = `${currentMessageId ?? 'msg'}:${index}`;
          const block = blocks.get(key) ?? { input: '' };
          block.input += delta.partial_json;
          blocks.set(key, block);
        }
      }
      if (eventType === 'content_block_stop') {
        const index = typeof event.index === 'number' ? event.index : 0;
        const key = `${currentMessageId ?? 'msg'}:${index}`;
        const block = blocks.get(key);
        if (block?.type === 'tool_use') {
          let input: unknown = {};
          try {
            input = block.input ? JSON.parse(block.input) : {};
          } catch {
            input = {};
          }
          emitToolUse(block.id, block.name, input);
        }
      }
      if (eventType === 'content_block_start' && isRecord(event.content_block)) {
        const cb = event.content_block as Record<string, unknown>;
        const index = typeof event.index === 'number' ? event.index : 0;
        const key = `${currentMessageId ?? 'msg'}:${index}`;
        blocks.set(key, {
          type: cb.type,
          name: cb.name,
          id: cb.id,
          input: '',
        });
      }
      return;
    }

    if (type === 'user' && isRecord(obj.message)) {
      const message = obj.message as Record<string, unknown>;
      const content = message.content;
      if (!Array.isArray(content)) return;
      for (const block of content) {
        if (!isRecord(block) || block.type !== 'tool_result') continue;
        onEvent({
          type: 'tool_result',
          toolResult: {
            toolUseId: typeof block.tool_use_id === 'string' ? block.tool_use_id : '',
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''),
            isError: Boolean(block.is_error),
          },
        });
      }
      return;
    }

    if (type === 'result' && obj.is_error) {
      onEvent({
        type: 'error',
        message: typeof obj.result === 'string' ? obj.result : 'Claude run failed',
      });
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
  };
}

export function buildClaudeStdinPrompt(message: string, history: Array<{ role: string; content: string }>) {
  const messages = [
    ...history.map((m) => ({
      type: 'user',
      message: {
        role: m.role,
        content: [{ type: 'text', text: m.content }],
      },
    })),
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: message }],
      },
    },
  ];
  return messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
}
