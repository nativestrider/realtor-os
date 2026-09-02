'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AgentId, ChatMessage, Conversation, DetectedAgent, RunEvent } from '@realtor-os/contracts';
import { actionAllowsSelection, formatAllowedAgents } from '@realtor-os/contracts';
import {
  cancelRun,
  createConversation,
  extractMemoriesFromChat,
  fetchAgents,
  fetchConversations,
  fetchMessages,
  getApiToken,
  streamChat,
  updateConversationAgent,
} from '@/lib/api';
import { ChatMarkdown } from '@/components/ChatMarkdown';
import { formatAgentActivity } from '@/lib/agent-activity';
import { partitionAssistantText } from '@/lib/assistant-text';

const INPUT_MAX_HEIGHT = 120;

type UiMessage = ChatMessage & {
  streaming?: boolean;
  thinking?: string;
  error?: string;
};

export type PropertyChatHandle = {
  runSkill: (skillId: string, message: string) => Promise<void>;
};

interface PropertyChatProps {
  propertyId: string;
  propertyLabel: string;
  onStatusChange?: (status: string) => void;
  onRunningChange?: (running: boolean) => void;
  onRunFinished?: () => void;
  onSelectionChange?: (selection: { agentId: AgentId; model: string; agents: DetectedAgent[] }) => void;
}

function ThinkingBlock({ text, live }: { text: string; live?: boolean }) {
  return (
    <details className="thinking-disclosure" open={live}>
      <summary>{live ? 'Thinking…' : 'Thinking'}</summary>
      <div className="thinking-text">{text}</div>
    </details>
  );
}

function ChatMessageBubble({ message }: { message: UiMessage }) {
  const raw = message.content ?? '';
  const parts =
    message.role === 'assistant' && !message.error
      ? partitionAssistantText(raw)
      : { thinking: '', content: raw };
  const thinking = [message.thinking?.trim(), parts.thinking].filter(Boolean).join('\n\n');
  const content = message.role === 'assistant' && !message.error ? parts.content : raw;
  const showPlaceholder = message.streaming && !thinking && !content;
  const useMarkdown = Boolean(content) && !message.error;

  return (
    <div className={`message ${message.error ? 'error' : message.role}`}>
      {thinking ? <ThinkingBlock text={thinking} live={message.streaming && !content} /> : null}
      {useMarkdown ? <ChatMarkdown>{content}</ChatMarkdown> : null}
      {showPlaceholder ? '…' : null}
      {message.error ? message.error : null}
    </div>
  );
}

export const PropertyChat = forwardRef<PropertyChatHandle, PropertyChatProps>(function PropertyChat(
  {
    propertyId,
    propertyLabel,
    onStatusChange,
    onRunningChange,
    onRunFinished,
    onSelectionChange,
  },
  ref,
) {
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('claude');
  const [selectedModel, setSelectedModel] = useState('default');
  const [running, setRunning] = useState(false);
  const [activityLabel, setActivityLabel] = useState('');
  const [activeSkillId, setActiveSkillId] = useState('');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [agentNotice, setAgentNotice] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  const [extractingMemories, setExtractingMemories] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const syncedThreadId = useRef<string | null>(null);
  const userPickedAgent = useRef(false);

  const propertyConversations = useMemo(
    () => conversations.filter((c) => c.propertyId === propertyId),
    [conversations, propertyId],
  );
  const currentAgent = agents.find((a) => a.id === selectedAgent);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowJumpLatest(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 72;
    stickToBottomRef.current = atBottom;
    setShowJumpLatest(!atBottom);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const pickDefaultModel = (agent: DetectedAgent): string => {
    if (agent.id === 'codex') {
      const gpt54 = agent.models.find((m) => m.id === 'gpt-5.4');
      if (gpt54) return gpt54.id;
    }
    if (agent.id === 'grok') {
      const grok46 = agent.models.find((m) => m.id === 'grok-4.6');
      if (grok46) return grok46.id;
    }
    return agent.models[0]?.id ?? 'default';
  };

  const loadAgents = useCallback(async () => {
    const list = await fetchAgents();
    setAgents(list);
  }, []);

  const loadConversations = useCallback(async () => {
    const list = await fetchConversations();
    setConversations(list);
    const scoped = list.filter((c) => c.propertyId === propertyId);
    if (!activeId && scoped[0]) setActiveId(scoped[0].id);
  }, [activeId, propertyId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const list = await fetchMessages(conversationId);
    setMessages(list);
    stickToBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [scrollToBottom]);

  useEffect(() => {
    if (!getApiToken()) return;
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId) {
      syncedThreadId.current = null;
      if (userPickedAgent.current) return;
      const pick = agents.find((a) => a.available);
      if (pick) {
        setSelectedAgent(pick.id);
        setSelectedModel(pickDefaultModel(pick));
      }
      return;
    }
    if (syncedThreadId.current === activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv) return;
    syncedThreadId.current = activeId;
    setSelectedAgent(conv.agentId);
    setSelectedModel(conv.model);
  }, [activeId, conversations, agents]);

  useEffect(() => {
    onSelectionChange?.({ agentId: selectedAgent, model: selectedModel, agents });
  }, [selectedAgent, selectedModel, agents, onSelectionChange]);

  async function handleAgentChange(nextAgentId: AgentId) {
    const agent = agents.find((a) => a.id === nextAgentId);
    const nextModel = agent ? pickDefaultModel(agent) : 'default';
    userPickedAgent.current = true;
    setSelectedAgent(nextAgentId);
    setSelectedModel(nextModel);
    onSelectionChange?.({ agentId: nextAgentId, model: nextModel, agents });

    if (activeId) {
      try {
        const updated = await updateConversationAgent(activeId, {
          agentId: nextAgentId,
          model: nextModel,
        });
        setConversations((prev) => prev.map((c) => (c.id === activeId ? updated : c)));
        setAgentNotice(
          `Now using ${agent?.name ?? nextAgentId}. Prior messages stay in this thread.`,
        );
      } catch (err) {
        setAgentNotice(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function handleModelChange(nextModel: string) {
    setSelectedModel(nextModel);
    onSelectionChange?.({ agentId: selectedAgent, model: nextModel, agents });
    if (activeId) {
      try {
        const updated = await updateConversationAgent(activeId, {
          agentId: selectedAgent,
          model: nextModel,
        });
        setConversations((prev) => prev.map((c) => (c.id === activeId ? updated : c)));
      } catch {
        // model-only change is best-effort
      }
    }
  }

  async function startNewThread() {
    setMenuOpen(false);
    const conversation = await createConversation({
      agentId: selectedAgent,
      model: selectedModel,
      propertyId,
      title: propertyLabel.slice(0, 60) || 'Property chat',
    });
    setConversations((prev) => [conversation, ...prev]);
    syncedThreadId.current = conversation.id;
    setActiveId(conversation.id);
    setMessages([]);
    setAgentNotice(null);
    setMemoryNotice(null);
    stickToBottomRef.current = true;
  }

  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId;
    const conversation = await createConversation({
      agentId: selectedAgent,
      model: selectedModel,
      propertyId,
      title: propertyLabel.slice(0, 60) || 'Property chat',
    });
    setConversations((prev) => [conversation, ...prev]);
    syncedThreadId.current = conversation.id;
    setActiveId(conversation.id);
    return conversation.id;
  }

  async function handleRememberFromChat() {
    setMenuOpen(false);
    if (!activeId || running || extractingMemories || messages.length < 2) return;
    setExtractingMemories(true);
    setMemoryNotice(null);
    try {
      const result = await extractMemoriesFromChat(activeId);
      if (result.added.length === 0) {
        setMemoryNotice('No new facts to remember from this chat.');
      } else {
        setMemoryNotice(
          `Saved ${result.added.length} ${result.added.length === 1 ? 'memory' : 'memories'} to your profile.`,
        );
      }
    } catch (err) {
      setMemoryNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setExtractingMemories(false);
    }
  }

  function setLiveActivity(label: string) {
    setActivityLabel(label);
    onStatusChange?.(label);
  }

  async function sendMessage(outgoing: string, skillId?: string) {
    if (!outgoing.trim() || running) return;
    const conversationId = await ensureConversation();
    stickToBottomRef.current = true;

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: outgoing,
      createdAt: new Date().toISOString(),
    };

    const assistantId = crypto.randomUUID();
    const startLabel =
      skillId === 'zillow-import'
        ? 'Starting Zillow import…'
        : skillId === 'zillow-comp'
          ? 'Starting comparable import…'
          : 'Starting…';
    const assistantMessage: UiMessage = {
      id: assistantId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      streaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setActiveSkillId(skillId ?? '');
    setRunning(true);
    onRunningChange?.(true);
    setActivityLabel(startLabel);
    onStatusChange?.(startLabel);

    const handleEvent = (event: RunEvent, runId?: string) => {
      if (runId) setCurrentRunId(runId);
      if (event.type === 'status' && event.status) {
        setLiveActivity(formatAgentActivity({ status: event.status, skillId }));
      }
      if (event.type === 'text_delta' && event.text) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m)),
        );
      }
      if (event.type === 'thinking_delta' && event.text) {
        setLiveActivity(formatAgentActivity({ thinking: true, skillId }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + event.text } : m,
          ),
        );
      }
      if (event.type === 'tool_call' && event.toolCall) {
        setLiveActivity(formatAgentActivity({ toolName: event.toolCall.name, skillId }));
      }
      if (event.type === 'error') {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, error: event.message, streaming: false } : m)),
        );
        onStatusChange?.(event.message ?? 'Error');
        setActivityLabel(event.message ?? 'Error');
      }
      if (event.type === 'done') {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
        );
        setRunning(false);
        onRunningChange?.(false);
        setCurrentRunId(null);
        setActiveSkillId('');
        setActivityLabel('');
        onStatusChange?.('');
        onRunFinished?.();
        void loadConversations();
      }
    };

    try {
      await streamChat(conversationId, outgoing, handleEvent, { skillId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, error: message, streaming: false } : m)),
      );
      setRunning(false);
      onRunningChange?.(false);
      setActiveSkillId('');
      onStatusChange?.(message);
      setActivityLabel(message);
    }
  }

  async function handleSend() {
    await sendMessage(input.trim());
  }

  async function handleCancel() {
    if (!currentRunId) return;
    setLiveActivity('Cancelling…');
    try {
      await cancelRun(currentRunId);
    } catch (err) {
      setLiveActivity(err instanceof Error ? err.message : String(err));
    }
  }

  useImperativeHandle(ref, () => ({
    runSkill: async (skillId, message) => {
      const modelCaps = currentAgent?.models.find((m) => m.id === selectedModel)?.capabilities
        ?? currentAgent?.capabilities;
      if (!actionAllowsSelection(skillId, selectedAgent, modelCaps)) {
        const needed = formatAllowedAgents(skillId);
        setAgentNotice(`This action needs ${needed}. Switch the Agent picker and try again.`);
        onStatusChange?.(`Needs ${needed}`);
        return;
      }
      await sendMessage(message, skillId);
    },
  }));

  const inputPlaceholder = 'Ask about pricing, comps, staging, or listing copy…';
  const showZillowBriefing = running && (activeSkillId === 'zillow-import' || activeSkillId === 'zillow-comp');

  return (
    <div className="property-chat">
      {showZillowBriefing ? (
        <div className="import-live-banner" role="status">
          <strong>
            {activeSkillId === 'zillow-comp' ? 'Importing a comparable from Zillow' : 'Importing from Zillow'}
          </strong>
          <p>
            A Chrome window will open — that is the agent reading the listing. If Zillow asks you
            to prove you are human, complete it in that window, then type <em>done</em> here.
          </p>
        </div>
      ) : null}
      {(propertyConversations.length > 1 || agentNotice || memoryNotice) && (
        <div className="property-chat-header">
          {propertyConversations.length > 1 ? (
            <div className="chat-history-tabs">
              {propertyConversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={c.id === activeId ? 'active' : ''}
                  onClick={() => setActiveId(c.id)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          ) : null}
          {agentNotice ? <div className="agent-switch-notice">{agentNotice}</div> : null}
          {memoryNotice ? <div className="memory-extract-notice">{memoryNotice}</div> : null}
        </div>
      )}

      <div className="property-chat-body">
        <div ref={scrollRef} className="messages property-messages" onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className="empty-state property-chat-empty">
              {showZillowBriefing
                ? 'The agent is starting the import. Progress will appear here.'
                : 'Property context is loaded. Pick a command or ask a question below.'}
            </div>
          ) : (
            messages.map((message) => <ChatMessageBubble key={message.id} message={message} />)
          )}
        </div>
        {showJumpLatest ? (
          <button type="button" className="chat-jump-latest" onClick={() => scrollToBottom()}>
            Jump to latest
          </button>
        ) : null}
      </div>

      {running && activityLabel ? (
        <div className="agent-activity-banner" role="status" aria-live="polite">
          <span className="agent-activity-dot" aria-hidden />
          <span>{activityLabel}</span>
        </div>
      ) : null}

      <div className="agent-composer">
        <div className="agent-composer-box">
          <textarea
            ref={inputRef}
            className="agent-composer-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
            rows={1}
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="agent-composer-bar">
            <div className="agent-composer-pickers">
              <label className="agent-picker">
                <span className="agent-picker-label">Agent</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => void handleAgentChange(e.target.value as AgentId)}
                  disabled={running}
                  title="Agent"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id} disabled={!agent.available}>
                      {agent.available ? agent.name : `${agent.name} (not installed)`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="agent-picker">
                <span className="agent-picker-label">Model</span>
                <select
                  value={selectedModel}
                  onChange={(e) => void handleModelChange(e.target.value)}
                  disabled={running}
                  title="Model"
                >
                  {(currentAgent?.models ?? []).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="agent-composer-actions">
              <div className="agent-menu" ref={menuRef}>
                <button
                  type="button"
                  className="agent-icon-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={running && !currentRunId}
                  aria-label="More actions"
                  title="More actions"
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <div className="agent-menu-dropdown">
                    <button
                      type="button"
                      onClick={() => void handleRememberFromChat()}
                      disabled={extractingMemories || messages.length < 2 || !activeId}
                    >
                      {extractingMemories ? 'Remembering…' : 'Remember from chat'}
                    </button>
                    <button type="button" onClick={() => void startNewThread()} disabled={running}>
                      New thread
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={running ? 'agent-send-btn agent-send-btn-stop' : 'agent-send-btn'}
                onClick={() => {
                  if (running) {
                    void handleCancel();
                    return;
                  }
                  void handleSend();
                }}
                disabled={running ? !currentRunId : !input.trim()}
                aria-label={running ? 'Cancel run' : 'Send message'}
                title={running ? 'Cancel' : 'Send (Enter)'}
              >
                {running ? <span className="agent-send-stop" aria-hidden /> : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export function useAgentDefaults() {
  const [agentId, setAgentId] = useState<AgentId>('claude');
  const [model, setModel] = useState('default');
  const [agents, setAgents] = useState<DetectedAgent[]>([]);

  useEffect(() => {
    void fetchAgents().then((list) => {
      setAgents(list);
      const pick = list.find((a) => a.available);
      if (pick) {
        setAgentId(pick.id);
        const preferred =
          pick.id === 'codex'
            ? pick.models.find((m) => m.id === 'gpt-5.4')?.id
            : pick.id === 'grok'
              ? pick.models.find((m) => m.id === 'grok-4.6')?.id
              : undefined;
        setModel(preferred ?? pick.models[0]?.id ?? 'default');
      }
    });
  }, []);

  return { agentId, model, agents, setAgentId, setModel };
}
