'use client';

import type { SkillAdmissibility } from '@/lib/property-actions';

interface PropertyActionsProps {
  actions: SkillAdmissibility[];
  running: boolean;
  onRun: (action: SkillAdmissibility) => void;
  embedded?: boolean;
}

export function PropertyActions({ actions, running, onRun, embedded }: PropertyActionsProps) {
  if (actions.length === 0) return null;

  return (
    <section
      className={`property-actions${embedded ? ' property-actions-embedded' : ''}`}
      aria-label="Property actions"
    >
      <h3 className="property-actions-title">Actions</h3>
      <p className="property-actions-hint">
        Chat is free-form. Run workflows here — each action lists which agents can run it.
      </p>

      <ul className="property-actions-list">
        {actions.map((action) => (
          <li
            key={action.skill.id}
            className={`property-action-item property-action-${action.availability}`}
          >
            <div className="property-action-body">
              <strong>{action.skill.name}</strong>
              <span className="property-action-reason">{action.reason}</span>
              <span className="property-action-meta">Runs on {action.allowedAgentsLabel}</span>
            </div>
            {action.availability === 'blocked' ? (
              <span className="property-action-locked" aria-hidden>
                —
              </span>
            ) : (
              <button
                type="button"
                className={action.availability === 'done' ? 'secondary-btn btn-sm' : 'primary-btn btn-sm'}
                disabled={running}
                onClick={() => onRun(action)}
                title={action.availability === 'done' ? 'Re-run only if you need to verify or refresh' : undefined}
              >
                {action.runLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
