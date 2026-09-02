'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DetectedAgent, UserSettings } from '@realtor-os/contracts';
import { AgentStatusList } from '@/components/AgentStatusList';
import { AppShell } from '@/components/AppShell';
import { fetchAgents, fetchSettings, getApiToken, updateSettings } from '@/lib/api';

const SETTINGS_TABS = [
  { id: 'agents', label: 'Agents', subtitle: 'See which CLIs are installed and signed in on this machine.' },
  { id: 'profile', label: 'Profile', subtitle: 'Who you are and how agents should talk to you.' },
  { id: 'listings', label: 'Listings', subtitle: 'Custom listing statuses for the property picker and homepage filter.' },
  { id: 'memory', label: 'Memory', subtitle: 'Facts agents should remember about you across conversations.' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTabState] = useState<SettingsTab>(() =>
    isSettingsTab(requestedTab) ? requestedTab : 'agents',
  );
  const currentTab = SETTINGS_TABS.find((item) => item.id === tab) ?? SETTINGS_TABS[0];

  useEffect(() => {
    if (isSettingsTab(requestedTab) && requestedTab !== tab) setTabState(requestedTab);
  }, [requestedTab, tab]);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [memoriesText, setMemoriesText] = useState('');
  const [customStatusesText, setCustomStatusesText] = useState('');
  const [learnedCount, setLearnedCount] = useState(0);
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getApiToken()) {
      setError('Missing login token. Open the full link from your terminal.');
      return;
    }
    const [data, detected] = await Promise.all([fetchSettings(), fetchAgents()]);
    setSettings(data.settings);
    setAgents(detected);
    setMemoriesText(data.settings.memories.join('\n'));
    setCustomStatusesText((data.settings.listingSettings?.customStatuses ?? []).join('\n'));
    setLearnedCount(data.memory.learnedCount);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  function setTab(next: SettingsTab) {
    setSaved(false);
    setTabState(next);
    const href = next === 'agents' ? '/settings' : `/settings?tab=${next}`;
    router.replace(href, { scroll: false });
  }

  async function handleRefreshAgents() {
    setAgentsLoading(true);
    try {
      setAgents(await fetchAgents());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentsLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const memories = memoriesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const customStatuses = customStatusesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const data = await updateSettings({
        ...settings,
        memories,
        listingSettings: {
          ...settings.listingSettings,
          customStatuses,
        },
      });
      setSettings(data.settings);
      setMemoriesText(data.settings.memories.join('\n'));
      setCustomStatusesText((data.settings.listingSettings?.customStatuses ?? []).join('\n'));
      setLearnedCount(data.memory.learnedCount);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearLearned() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const data = await updateSettings({ clearLearnedMemories: true });
      setSettings(data.settings);
      setLearnedCount(data.memory.learnedCount);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!settings && !error) {
    return (
      <AppShell hideAddProperty>
        <div className="empty-state">Loading settings…</div>
      </AppShell>
    );
  }

  return (
    <AppShell hideAddProperty>
      <div className="settings-page">
        <header className="settings-header">
          <Link href="/" className="back-link">
            ← Properties
          </Link>
          <h1>Settings</h1>
          <p className="settings-subtitle">{currentTab.subtitle}</p>
        </header>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="connection-banner">{error}</div> : null}

        {tab === 'agents' ? (
          <AgentStatusList
            agents={agents}
            loading={agentsLoading}
            onRefresh={() => void handleRefreshAgents()}
          />
        ) : null}

        {settings && tab !== 'agents' ? (
          <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
            {tab === 'profile' ? (
              <>
                <section className="settings-section">
                  <h2>About you</h2>
                  <label>
                    Display name
                    <input
                      value={settings.displayName ?? ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, displayName: e.target.value } : s))}
                      placeholder="Jane Smith"
                    />
                  </label>
                  <label>
                    Role
                    <input
                      value={settings.role ?? ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, role: e.target.value } : s))}
                      placeholder="Listing agent"
                    />
                  </label>
                  <label>
                    Brokerage
                    <input
                      value={settings.brokerage ?? ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, brokerage: e.target.value } : s))}
                      placeholder="XYZ Realty"
                    />
                  </label>
                </section>
                <section className="settings-section">
                  <h2>How you want agents to communicate</h2>
                  <label>
                    Communication style
                    <textarea
                      rows={3}
                      value={settings.communicationStyle ?? ''}
                      onChange={(e) =>
                        setSettings((s) => (s ? { ...s, communicationStyle: e.target.value } : s))
                      }
                      placeholder="Direct and concise. Use bullet points. No hype."
                    />
                  </label>
                  <label>
                    Custom instructions
                    <textarea
                      rows={4}
                      value={settings.customInstructions ?? ''}
                      onChange={(e) =>
                        setSettings((s) => (s ? { ...s, customInstructions: e.target.value } : s))
                      }
                      placeholder="Always mention co-op rules when relevant. I focus on Queens listings."
                    />
                  </label>
                </section>
              </>
            ) : null}

            {tab === 'listings' ? (
              <section className="settings-section">
                <h2>Listing statuses</h2>
                <p className="settings-hint">
                  Built-in statuses are <strong>Draft</strong>, <strong>Active</strong>, and{' '}
                  <strong>Sold</strong>. Add custom statuses below (one per line) — they appear in
                  property pickers and the homepage filter.
                </p>
                <label>
                  Custom listing statuses
                  <textarea
                    rows={6}
                    value={customStatusesText}
                    onChange={(e) => setCustomStatusesText(e.target.value)}
                    placeholder={'pending\nunder_contract\ncoming_soon'}
                  />
                </label>
              </section>
            ) : null}

            {tab === 'memory' ? (
              <>
                <section className="settings-section">
                  <h2>Things to remember</h2>
                  <p className="settings-hint">One fact per line — always included in agent context.</p>
                  <label>
                    Pinned memories
                    <textarea
                      rows={6}
                      value={memoriesText}
                      onChange={(e) => setMemoriesText(e.target.value)}
                      placeholder={'I prefer email drafts under 150 words.\nMy farm area is Maspeth and Middle Village.'}
                    />
                  </label>
                </section>
                <section className="settings-section">
                  <h2>Learned from chats</h2>
                  <p className="settings-hint">
                    Use <strong>Remember from chat</strong> on a property conversation to save facts about
                    you here. Pinned memories above are always included; learned ones are added when you
                    ask.
                  </p>
                  {learnedCount > 0 ? (
                    <div className="settings-learned">
                      <p>
                        <strong>{learnedCount}</strong> learned{' '}
                        {learnedCount === 1 ? 'memory' : 'memories'} stored on this machine.
                      </p>
                      {settings.learnedMemories.length > 0 ? (
                        <ul className="settings-learned-list">
                          {settings.learnedMemories.map((fact) => (
                            <li key={fact}>{fact}</li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={saving}
                        onClick={() => void handleClearLearned()}
                      >
                        Clear learned memories
                      </button>
                    </div>
                  ) : (
                    <p className="settings-hint">No learned memories yet.</p>
                  )}
                </section>
              </>
            ) : null}

            <div className="settings-actions">
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              {saved ? <span className="settings-saved">Saved</span> : null}
            </div>
          </form>
        ) : null}
      </div>
    </AppShell>
  );
}
