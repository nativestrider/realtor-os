export type AgentId = 'claude' | 'codex' | 'kimi' | 'grok';

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

export type AgentCapability = 'chat' | 'vision' | 'imageGeneration';

export interface ModelOption {
  id: string;
  label: string;
  capabilities?: AgentCapability[];
}

export type AgentRuntimeStatus = 'not_installed' | 'needs_login' | 'ready';

export interface DetectedAgent {
  id: AgentId;
  name: string;
  available: boolean;
  version?: string;
  models: ModelOption[];
  /** What this CLI can do today. From the living catalog — not probed at runtime. */
  capabilities: AgentCapability[];
  /** Image model the CLI uses when `imageGeneration` is set (e.g. gpt-image-2). */
  imageModel?: string;
  /** Combined install + login state for Settings. */
  status: AgentRuntimeStatus;
  signedIn: boolean;
  accountLabel?: string;
  loginHint?: string;
  installHint?: string;
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
export * from './actions.js';
