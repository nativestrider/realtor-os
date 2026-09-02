/** Split agent scratchpad / chain-of-thought from the user-facing reply. */
export function partitionAssistantText(text: string): { thinking: string; content: string } {
  const raw = text.trim();
  if (!raw) return { thinking: '', content: '' };

  const headingAt = raw.search(/^#{1,3}\s+\S/m);
  if (headingAt > 0) {
    return {
      thinking: raw.slice(0, headingAt).trim(),
      content: raw.slice(headingAt).trim(),
    };
  }

  if (headingAt === 0) {
    return { thinking: '', content: raw };
  }

  const listAt = findNumberedListStart(raw);
  if (listAt === 0) {
    return { thinking: '', content: breakInlineNumberedList(raw) };
  }
  if (listAt > 0) {
    return {
      thinking: raw.slice(0, listAt).trim(),
      content: breakInlineNumberedList(raw.slice(listAt).trim()),
    };
  }

  const content = looksLikeScratchpad(raw) ? '' : raw;
  const thinking = content ? '' : raw;
  return { thinking, content: content ? breakInlineNumberedList(content) : '' };
}

/** First `1. item` — used when the model glued a catalog onto a preamble. */
function findNumberedListStart(text: string): number {
  const match = text.match(/1\.\s+(?:\S)/);
  return match?.index ?? -1;
}

/** Turn `1. foo 2. bar` into a markdown numbered list when newlines were omitted. */
export function breakInlineNumberedList(text: string): string {
  return text.replace(/(?<!^|\n)(?<!\d)(\d+\.\s+)/g, '\n$1').replace(/^\n/, '');
}

function looksLikeScratchpad(text: string): boolean {
  const cues = text.match(
    /Vou |I'll |I will |Let me |Antes de |Checking |Reading |O script |Página carregada|Factos principais|Todos os factos|O screenshot|comps\/ está|sem sinal de challenge|bot challenge/gi,
  );
  return (cues?.length ?? 0) >= 2;
}