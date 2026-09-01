import type { AgentId, ModelOption, StreamFormat } from '@realtor-os/contracts';

export interface RuntimeBuildOptions {
  model?: string;
  reasoning?: string;
}

export interface RuntimeContext {
  cwd?: string;
  resumeSessionId?: string | null;
  newSessionId?: string | null;
}

export interface RuntimeAgentDef {
  id: AgentId;
  name: string;
  bin: string;
  fallbackBins?: string[];
  versionArgs: string[];
  fallbackModels: ModelOption[];
  buildArgs: (
    prompt: string,
    options?: RuntimeBuildOptions,
    runtimeContext?: RuntimeContext,
  ) => string[];
  streamFormat: StreamFormat;
  eventParser?: 'codex';
  promptViaStdin?: boolean;
  promptInputFormat?: 'text' | 'stream-json';
  fetchModels?: (resolvedBin: string) => Promise<ModelOption[] | null>;
  resumesSessionViaCli?: boolean;
  capturesSessionIdFromStream?: boolean;
}

export interface ResolvedAgentLaunch {
  def: RuntimeAgentDef;
  bin: string;
}

export interface ActiveRun {
  id: string;
  conversationId: string;
  child: import('node:child_process').ChildProcessWithoutNullStreams | null;
  cancel: () => void;
}
