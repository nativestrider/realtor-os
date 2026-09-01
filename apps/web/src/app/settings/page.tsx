'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { UserSettings } from '@realtor-os/contracts';
import { AppShell } from '@/components/AppShell';
import { fetchSettings, getApiToken, updateSettings } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [memoriesText, setMemoriesText] = useState('');
  const [customStatusesText, setCustomStatusesText] = useState('');
  const [learnedCount, setLearnedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getApiToken()) {
      setError('Missing login token. Open the full link from your terminal.');
      return;
    }
    const data = await fetchSettings();
    setSettings(data.settings);
    setMemoriesText(data.settings.memories.join('\n'));
    setCustomStatusesText((data.settings.listingSettings?.customStatuses ?? []).join('\n'));
    setLearnedCount(data.memory.learnedCount);
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

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
          <h1>Your settings</h1>
          <p className="settings-subtitle">
            Profile and preferences are injected into every agent conversation on this machine.
          </p>
        </header>

        {error ? <div className="connection-banner">{error}</div> : null}

        {settings ? (
          <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
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
                  rows={4}
                  value={customStatusesText}
                  onChange={(e) => setCustomStatusesText(e.target.value)}
                  placeholder={'pending\nunder_contract\ncoming_soon'}
                />
              </label>
            </section>

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
                Use <strong>Remember from chat</strong> on a property conversation to save facts about you
                here. Pinned memories above are always included; learned ones are added when you ask.
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
