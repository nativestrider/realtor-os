'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentId, ChatMessage, Conversation, DetectedAgent, RunEvent, SkillSummary } from '@realtor-os/contracts';
import { buildActionMessage, getSkillCommandLabel } from '@/components/ActionGrid';
import {
  cancelRun,
  createConversation,
  extractMemoriesFromChat,
  fetchAgents,
  fetchConversations,
  fetchMessages,
  fetchSkills,
  getApiToken,
  streamChat,
  updateConversationAgent,
} from '@/lib/api';
import { formatAgentActivity } from '@/lib/agent-activity';

const LONG_MESSAGE_CHARS = 900;
const INPUT_MAX_HEIGHT = 120;

type UiMessage = ChatMessage & {
  streaming?: boolean;
  thinking?: string;
  error?: string;
};

interface PropertyChatProps {
  propertyId: string;
  propertyLabel: string;
  zillowUrl?: string;
  hasPhotos?: boolean;
  hasPropertyJson?: boolean;
  onStatusChange?: (status: string) => void;
  onRunFinished?: () => void;
}

function ChatMessageBubble({ message }: { message: UiMessage }) {
  const [expanded, setExpanded] = useState(false);
  const content = message.content ?? '';
  const isLong = !message.streaming && content.length > LONG_MESSAGE_CHARS;
  const visibleContent = isLong && !expanded ? `${content.slice(0, LONG_MESSAGE_CHARS)}…` : content;

  return (
    <div className={`message ${message.error ? 'error' : message.role}`}>
      {visibleContent || (message.streaming && !message.thinking ? '…' : '')}
      {message.thinking && !message.content ? (
        <div className="thinking-text">{message.thinking}</div>
      ) : null}
      {message.error ? `\n${message.error}` : null}
      {isLong ? (
        <button
          type="button"
          className="message-expand-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full message'}
        </button>
      ) : null}
    </div>
  );
}

export function PropertyChat({
  propertyId,
  propertyLabel,
  zillowUrl,
  hasPhotos,
  hasPropertyJson,
  onStatusChange,
  onRunFinished,
}: PropertyChatProps) {
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('claude');
  const [selectedModel, setSelectedModel] = useState('default');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [activityLabel, setActivityLabel] = useState('');
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

  const availableAgents = useMemo(() => agents.filter((a) => a.available), [agents]);
  const propertyConversations = useMemo(
    () => conversations.filter((c) => c.propertyId === propertyId),
    [conversations, propertyId],
  );
  const currentAgent = agents.find((a) => a.id === selectedAgent);
  const commandSkill = skills.find((s) => s.id === selectedCommand);

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
    return agent.models[0]?.id ?? 'default';
  };

  const loadAgents = useCallback(async () => {
    const list = await fetchAgents();
    setAgents(list);
    const pick = list.find((a) => a.available);
    if (pick) {
      setSelectedAgent(pick.id);
      setSelectedModel(pickDefaultModel(pick));
    }
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
    void fetchSkills().then(setSkills);
  }, [loadAgents]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv) return;
    setSelectedAgent(conv.agentId);
    setSelectedModel(conv.model);
  }, [activeId, conversations]);

  function handleCommandChange(skillId: string) {
    setSelectedCommand(skillId);
    if (!skillId) return;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    setInput(
      buildActionMessage(skill, {
        zillowUrl,
        hasPhotos,
        hasPropertyJson,
      }),
    );
    inputRef.current?.focus();
  }

  async function handleAgentChange(nextAgentId: AgentId) {
    const agent = agents.find((a) => a.id === nextAgentId);
    const nextModel =
      nextAgentId === 'codex'
        ? (agent?.models.find((m) => m.id === 'gpt-5.4')?.id ?? agent?.models[0]?.id ?? 'default')
        : (agent?.models[0]?.id ?? 'default');
    setSelectedAgent(nextAgentId);
    setSelectedModel(nextModel);

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
    setActiveId(conversation.id);
    setMessages([]);
    setAgentNotice(null);
    setMemoryNotice(null);
    setSelectedCommand('');
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

  async function handleSend() {
    if (!input.trim() || running) return;
    const conversationId = await ensureConversation();
    const skillId = selectedCommand || undefined;
    const outgoing = input.trim();
    stickToBottomRef.current = true;

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: outgoing,
      createdAt: new Date().toISOString(),
    };

    const assistantId = crypto.randomUUID();
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
    setSelectedCommand('');
    setRunning(true);
    setActivityLabel('Starting…');
    onStatusChange?.('Starting...');

    const handleEvent = (event: RunEvent, runId?: string) => {
      if (runId) setCurrentRunId(runId);
      if (event.type === 'status' && event.status) {
        const label = formatAgentActivity({ status: event.status });
        setActivityLabel(label);
        onStatusChange?.(label);
      }
      if (event.type === 'text_delta' && event.text) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m)),
        );
      }
      if (event.type === 'thinking_delta' && event.text) {
        const label = formatAgentActivity({ thinking: true });
        setActivityLabel(label);
        onStatusChange?.(label);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, thinking: (m.thinking ?? '') + event.text } : m,
          ),
        );
      }
      if (event.type === 'tool_call' && event.toolCall) {
        const label = formatAgentActivity({ toolName: event.toolCall.name });
        setActivityLabel(label);
        onStatusChange?.(label);
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
        setCurrentRunId(null);
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
      onStatusChange?.(message);
      setActivityLabel(message);
    }
  }

  const inputPlaceholder = commandSkill
    ? `Run ${commandSkill.name}…`
    : 'Ask about pricing, comps, staging, or listing copy…';

  return (
    <div className="property-chat">
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
              Property context is loaded. Pick a command or ask a question below.
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
          {activityLabel}
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
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
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
              <label className="agent-picker">
                <span className="agent-picker-label">Command</span>
                <select
                  value={selectedCommand}
                  onChange={(e) => handleCommandChange(e.target.value)}
                  disabled={running}
                  title="Skill command"
                >
                  <option value="">Chat</option>
                  {skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {getSkillCommandLabel(skill, { hasPhotos, hasPropertyJson })}
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
                    {running && currentRunId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void cancelRun(currentRunId);
                        }}
                      >
                        Cancel run
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="agent-send-btn"
                onClick={() => void handleSend()}
                disabled={running || !input.trim()}
                aria-label="Send message"
                title="Send (Enter)"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        const model =
          pick.id === 'codex'
            ? (pick.models.find((m) => m.id === 'gpt-5.4')?.id ?? pick.models[0]?.id ?? 'default')
            : (pick.models[0]?.id ?? 'default');
        setModel(model);
      }
    });
  }, []);

  return { agentId, model, agents, setAgentId, setModel };
}
