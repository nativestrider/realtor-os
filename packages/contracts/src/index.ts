export type AgentId = 'claude' | 'codex' | 'kimi';

export type StreamFormat = 'claude-stream-json' | 'json-event-stream' | 'acp';

export type RunEventType =
  | 'status'
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'done';

export interface RunEvent {
  type: RunEventType;
  text?: string;
  message?: string;
  code?: string;
  toolCall?: {
    id: string;
    name: string;
    input: unknown;
  };
  toolResult?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  };
  status?: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface DetectedAgent {
  id: AgentId;
  name: string;
  available: boolean;
  version?: string;
  models: ModelOption[];
}

export interface Conversation {
  id: string;
  agentId: AgentId;
  model: string;
  cwd: string;
  title: string;
  propertyId?: string;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  skillId?: string;
}

export interface CreateConversationRequest {
  agentId: AgentId;
  model?: string;
  cwd?: string;
  title?: string;
  propertyId?: string;
}

export interface RunRecord {
  id: string;
  conversationId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
}

export * from './property.js';
export * from './comparable.js';
export * from './user-settings.js';
export * from './media.js';
export * from './listing.js';
