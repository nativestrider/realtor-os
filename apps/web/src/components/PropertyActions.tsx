'use client';

import type { SkillAdmissibility } from '@/lib/property-actions';

interface PropertyActionsProps {
  actions: SkillAdmissibility[];
  running: boolean;
  onRun: (action: SkillAdmissibility) => void;
  embedded?: boolean;
}

export function PropertyActions({ actions, running, onRun, embedded }: PropertyActionsProps) {
  const ready = actions.filter((a) => a.availability === 'ready');
  const done = actions.filter((a) => a.availability === 'done');
  const blocked = actions.filter((a) => a.availability === 'blocked');

  if (actions.length === 0) return null;

  return (
    <section
      className={`property-actions${embedded ? ' property-actions-embedded' : ''}`}
      aria-label="Property actions"
    >
      <h3 className="property-actions-title">Actions</h3>
      <p className="property-actions-hint">Only actions that fit this property&apos;s data are enabled.</p>

      <ul className="property-actions-list">
        {ready.map((action) => (
          <li key={action.skill.id} className="property-action-item property-action-ready">
            <div className="property-action-body">
              <strong>{action.skill.name}</strong>
              <span className="property-action-reason">{action.reason}</span>
            </div>
            <button
              type="button"
              className="primary-btn btn-sm"
              disabled={running}
              onClick={() => onRun(action)}
            >
              {action.runLabel}
            </button>
          </li>
        ))}

        {done.map((action) => (
          <li key={action.skill.id} className="property-action-item property-action-done">
            <div className="property-action-body">
              <strong>{action.skill.name}</strong>
              <span className="property-action-reason">{action.reason}</span>
            </div>
            <button
              type="button"
              className="secondary-btn btn-sm"
              disabled={running}
              onClick={() => onRun(action)}
              title="Re-run only if you need to verify or refresh"
            >
              {action.runLabel}
            </button>
          </li>
        ))}

        {blocked.map((action) => (
          <li key={action.skill.id} className="property-action-item property-action-blocked">
            <div className="property-action-body">
              <strong>{action.skill.name}</strong>
              <span className="property-action-reason">{action.reason}</span>
            </div>
            <span className="property-action-locked" aria-hidden>
              —
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
