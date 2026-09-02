'use client';

import type { AgentRuntimeStatus, DetectedAgent } from '@realtor-os/contracts';

const STATUS_LABEL: Record<AgentRuntimeStatus, string> = {
  ready: 'Ready',
  needs_login: 'Needs login',
  not_installed: 'Not installed',
};

function capabilityLabel(agent: DetectedAgent): string {
  const parts = [...(agent.capabilities ?? [])];
  if (agent.imageModel && parts.includes('imageGeneration')) {
    return parts
      .map((cap) => (cap === 'imageGeneration' ? `image gen (${agent.imageModel})` : cap))
      .join(' · ');
  }
  return parts.join(' · ');
}

interface AgentStatusListProps {
  agents: DetectedAgent[];
  loading?: boolean;
  onRefresh: () => void;
}

export function AgentStatusList({ agents, loading, onRefresh }: AgentStatusListProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h2>Connection status</h2>
        <button type="button" className="secondary-btn btn-sm" disabled={loading} onClick={onRefresh}>
          {loading ? 'Checking…' : 'Refresh status'}
        </button>
      </div>
      <p className="settings-hint">
        Install and sign-in live on this machine. RealtorOS never stores these passwords.
      </p>
      {agents.length === 0 && !loading ? (
        <p className="settings-hint">Could not load agent status.</p>
      ) : (
        <ul className="agent-status-list">
          {agents.map((agent) => {
            const status =
              agent.status ??
              (!agent.available ? 'not_installed' : agent.signedIn ? 'ready' : 'needs_login');
            return (
            <li key={agent.id} className={`agent-status-item agent-status-${status}`}>
              <div className="agent-status-top">
                <strong>{agent.name}</strong>
                <span className={`agent-status-pill agent-status-pill-${status}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <p className="agent-status-meta">
                {agent.available
                  ? `Installed${agent.version ? ` · ${agent.version}` : ''}`
                  : 'CLI not found on this machine'}
                {agent.available
                  ? agent.signedIn
                    ? ` · Signed in${agent.accountLabel ? ` as ${agent.accountLabel}` : ''}`
                    : ' · Not signed in'
                  : null}
              </p>
              <p className="agent-status-caps">{capabilityLabel(agent)}</p>
              {!agent.available && agent.installHint ? (
                <p className="agent-status-hint">
                  Install in a terminal: <code>{agent.installHint}</code>
                </p>
              ) : null}
              {agent.available && !agent.signedIn && agent.loginHint ? (
                <p className="agent-status-hint">
                  Sign in: <code>{agent.loginHint}</code>
                </p>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
