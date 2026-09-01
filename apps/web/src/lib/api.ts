import type {
  AgentId,
  AssetMetadata,
  ChatMessage,
  Conversation,
  CreateComparableRequest,
  DetectedAgent,
  ImportZillowResponse,
  Property,
  PropertyAsset,
  PropertyComparable,
  PropertyStatus,
  PropertySummary,
  RunEvent,
  SkillSummary,
  UserSettings,
} from '@realtor-os/contracts';

let cachedToken: string | null = null;

export function getApiToken(): string {
  if (cachedToken) return cachedToken;
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const match = hash.match(/token=([^&]+)/);
    if (match?.[1]) {
      cachedToken = decodeURIComponent(match[1]);
      sessionStorage.setItem('realtor_token', cachedToken);
      localStorage.setItem('realtor_token', cachedToken);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return cachedToken;
    }
    const stored = sessionStorage.getItem('realtor_token') ?? localStorage.getItem('realtor_token');
    if (stored) {
      cachedToken = stored;
      sessionStorage.setItem('realtor_token', stored);
      return stored;
    }
  }
  return process.env.REALTOR_API_TOKEN ?? '';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getApiToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error('Unauthorized — open the full link from your terminal (includes #token=...)');
    }
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

async function consumeSse(
  res: Response,
  onEvent: (event: RunEvent, runId?: string) => void,
): Promise<void> {
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentRunId: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let eventName = 'message';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine) as RunEvent | { runId: string };
        if (eventName === 'run' && 'runId' in parsed) {
          currentRunId = parsed.runId;
          onEvent({ type: 'status', status: 'started' }, currentRunId);
        } else {
          onEvent(parsed as RunEvent, currentRunId);
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

export async function fetchAgents(): Promise<DetectedAgent[]> {
  const data = await apiFetch<{ agents: DetectedAgent[] }>('/api/agents');
  return data.agents;
}

export async function fetchSkills(): Promise<SkillSummary[]> {
  const data = await apiFetch<{ skills: SkillSummary[] }>('/api/skills');
  return data.skills;
}

export async function fetchProperties(): Promise<PropertySummary[]> {
  const data = await apiFetch<{ properties: PropertySummary[] }>('/api/properties');
  return data.properties;
}

export async function fetchProperty(id: string): Promise<{
  property: Property;
  assets: PropertyAsset[];
  comparables: PropertyComparable[];
}> {
  return apiFetch(`/api/properties/${id}`);
}

export async function updatePropertyAsset(
  propertyId: string,
  assetId: string,
  metadata: AssetMetadata,
): Promise<PropertyAsset> {
  const data = await apiFetch<{ asset: PropertyAsset }>(
    `/api/properties/${propertyId}/assets/${assetId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ metadata }),
    },
  );
  return data.asset;
}

export async function createComparable(
  propertyId: string,
  input: CreateComparableRequest,
): Promise<PropertyComparable> {
  const data = await apiFetch<{ comparable: PropertyComparable }>(`/api/properties/${propertyId}/comps`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.comparable;
}

export async function deleteComparable(propertyId: string, compId: string): Promise<void> {
  const token = getApiToken();
  const res = await fetch(`/api/properties/${propertyId}/comps/${compId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
}

export async function createProperty(input?: { title?: string; address?: string }): Promise<Property> {
  const data = await apiFetch<{ property: Property }>('/api/properties', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
  });
  return data.property;
}

export async function updateProperty(
  id: string,
  input: {
    title?: string;
    address?: string;
    status?: PropertyStatus;
    zillowUrl?: string;
    price?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    description?: string;
  },
): Promise<Property> {
  const data = await apiFetch<{ property: Property }>(`/api/properties/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.property;
}

export async function importFromZillow(
  url: string,
  mode: 'default' | 'duplicate' | 'refresh' = 'default',
): Promise<ImportZillowResponse> {
  return apiFetch<ImportZillowResponse>('/api/properties/import-zillow', {
    method: 'POST',
    body: JSON.stringify({ url, mode }),
  });
}

export async function importFromFolder(files: FileList): Promise<Property> {
  const token = getApiToken();
  const formData = new FormData();
  for (const file of Array.from(files)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    formData.append('files', file, rel);
  }
  const res = await fetch('/api/properties/import-folder', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const data = (await res.json()) as { property: Property };
  return data.property;
}

export async function importFolderToProperty(propertyId: string, files: FileList): Promise<Property> {
  const token = getApiToken();
  const formData = new FormData();
  for (const file of Array.from(files)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    formData.append('files', file, rel);
  }
  const res = await fetch(`/api/properties/${propertyId}/import-folder`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const data = (await res.json()) as { property: Property };
  return data.property;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
  return data.conversations;
}

export async function createConversation(input: {
  agentId: AgentId;
  model?: string;
  cwd?: string;
  title?: string;
  propertyId?: string;
}): Promise<Conversation> {
  const data = await apiFetch<{ conversation: Conversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.conversation;
}

export async function updateConversationAgent(
  conversationId: string,
  input: { agentId: AgentId; model?: string },
): Promise<Conversation> {
  const data = await apiFetch<{ conversation: Conversation }>(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.conversation;
}

export async function fetchSettings(): Promise<{
  settings: UserSettings;
  memory: { pinnedCount: number; learnedCount: number };
}> {
  return apiFetch('/api/settings');
}

export async function updateSettings(
  input: Partial<UserSettings> & {
    memories?: string[];
    clearLearnedMemories?: boolean;
  },
): Promise<{
  settings: UserSettings;
  memory: { pinnedCount: number; learnedCount: number };
}> {
  return apiFetch('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const data = await apiFetch<{ messages: ChatMessage[] }>(
    `/api/conversations/${conversationId}/messages`,
  );
  return data.messages;
}

export async function extractMemoriesFromChat(conversationId: string): Promise<{
  added: string[];
  memory: { pinnedCount: number; learnedCount: number };
}> {
  return apiFetch(`/api/conversations/${conversationId}/memories`, { method: 'POST' });
}

export async function streamChat(
  conversationId: string,
  message: string,
  onEvent: (event: RunEvent, runId?: string) => void,
  options?: { skillId?: string },
): Promise<void> {
  const token = getApiToken();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, message, skillId: options?.skillId }),
  });

  if (!res.ok) throw new Error(await res.text());
  await consumeSse(res, onEvent);
}

export async function streamPropertyAction(
  propertyId: string,
  skillId: string,
  input: { agentId: AgentId; model?: string; message?: string },
  onEvent: (event: RunEvent, runId?: string) => void,
): Promise<void> {
  const token = getApiToken();
  const res = await fetch(`/api/properties/${propertyId}/actions/${skillId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) throw new Error(await res.text());
  await consumeSse(res, onEvent);
}

export async function cancelRun(runId: string): Promise<void> {
  await apiFetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
}

export function formatPrice(price?: number): string {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

/** Property workspace file URL (served by Next.js, not the daemon API). */
export function propertyFileUrl(propertyId: string, relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, '');
  const segments = normalized.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `/property-assets/${encodeURIComponent(propertyId)}/${segments}`;
}
