/** Human-friendly activity text — never expose raw tool names in the UI. */
export function formatAgentActivity(input?: {
  status?: string;
  toolName?: string;
  thinking?: boolean;
  skillId?: string;
}): string {
  const zillow = input?.skillId === 'zillow-import';
  if (input?.thinking) return zillow ? 'Reading the listing…' : 'Thinking…';

  const status = input?.status?.trim();
  if (status) {
    const lower = status.toLowerCase();
    if (lower === 'thinking') return zillow ? 'Reading the listing…' : 'Thinking…';
    if (lower === 'started' || lower === 'initializing') {
      return zillow ? 'Starting Zillow import…' : 'Starting…';
    }
    if (lower === 'running') {
      return input.toolName ? formatToolActivity(input.toolName, zillow) : zillow ? 'Importing from Zillow…' : 'Working…';
    }
    if (looksLikeBrowser(lower)) {
      return zillow ? 'Opening a Chrome window to read Zillow…' : 'Opening a Chrome window…';
    }
    if (/^tool:\s*/i.test(status)) {
      return formatToolActivity(status.replace(/^tool:\s*/i, ''), zillow);
    }
    return status;
  }

  if (input?.toolName) {
    return formatToolActivity(input.toolName, zillow);
  }

  return zillow ? 'Importing from Zillow…' : 'Working…';
}

function looksLikeBrowser(text: string): boolean {
  return /playwright|chromium|chrom(e|ium)|puppeteer|browser_/.test(text);
}

function formatToolActivity(toolName: string, zillow = false): string {
  const name = toolName.toLowerCase();

  if (looksLikeBrowser(name) || name.includes('navigate') || name.includes('snapshot') || name.includes('screenshot')) {
    return zillow ? 'Opening a Chrome window to read Zillow…' : 'Using the browser…';
  }

  if (name.includes('click') || name.includes('type') || name.includes('press') || name.includes('hover')) {
    return zillow ? 'Working in the Zillow page…' : 'Using the browser…';
  }

  if (
    name.includes('bash') ||
    name.includes('shell') ||
    name.includes('terminal') ||
    name === 'run_terminal_cmd'
  ) {
    return zillow ? 'Working in the property folder…' : 'Running commands…';
  }

  if (
    name.includes('read') ||
    name.includes('glob') ||
    name.includes('grep') ||
    name.includes('list') ||
    name.includes('search')
  ) {
    return zillow ? 'Checking files already saved for this property…' : 'Reviewing project files…';
  }

  if (
    name.includes('write') ||
    name.includes('edit') ||
    name.includes('patch') ||
    name.includes('replace') ||
    name.includes('create')
  ) {
    return zillow ? 'Saving listing facts and photos…' : 'Updating files…';
  }

  if (name.includes('fetch') || name.includes('web') || name.includes('http')) {
    return zillow ? 'Fetching listing data…' : 'Fetching data…';
  }

  return zillow ? 'Importing from Zillow…' : 'Working…';
}
