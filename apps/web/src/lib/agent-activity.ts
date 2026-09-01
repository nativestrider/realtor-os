/** Human-friendly activity text — never expose raw tool names in the UI. */
export function formatAgentActivity(input?: {
  status?: string;
  toolName?: string;
  thinking?: boolean;
}): string {
  if (input?.thinking) return 'Thinking…';

  const status = input?.status?.trim();
  if (status) {
    if (/^tool:\s*/i.test(status)) {
      return formatToolActivity(status.replace(/^tool:\s*/i, ''));
    }
    return status;
  }

  if (input?.toolName) {
    return formatToolActivity(input.toolName);
  }

  return 'Working…';
}

function formatToolActivity(toolName: string): string {
  const name = toolName.toLowerCase();

  if (
    name.includes('bash') ||
    name.includes('shell') ||
    name.includes('terminal') ||
    name === 'run_terminal_cmd'
  ) {
    return 'Running commands…';
  }

  if (
    name.includes('read') ||
    name.includes('glob') ||
    name.includes('grep') ||
    name.includes('list') ||
    name.includes('search')
  ) {
    return 'Reviewing project files…';
  }

  if (
    name.includes('write') ||
    name.includes('edit') ||
    name.includes('patch') ||
    name.includes('replace') ||
    name.includes('create')
  ) {
    return 'Updating files…';
  }

  if (
    name.includes('browser') ||
    name.includes('navigate') ||
    name.includes('click') ||
    name.includes('snapshot') ||
    name.includes('screenshot')
  ) {
    return 'Using the browser…';
  }

  if (name.includes('fetch') || name.includes('web') || name.includes('http')) {
    return 'Fetching data…';
  }

  return 'Working…';
}
