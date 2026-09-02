import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyActionBinding, type SkillSummary } from '@realtor-os/contracts';
import {
  getBundledSkillsRoot,
  getUserSkillsRoot,
  stageSkillToWorkspace,
} from './property-workspace.js';
import { getDefaultDataDir } from './db.js';

interface SkillFrontmatter {
  name?: string;
  description?: string;
  examplePrompt?: string;
  category?: string;
  featured?: boolean;
}

function parseFrontmatter(content: string): { meta: SkillFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta: SkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === 'name') meta.name = value;
    if (key === 'description') meta.description = value;
    if (key === 'examplePrompt') meta.examplePrompt = value;
    if (key === 'category') meta.category = value;
    if (key === 'featured') meta.featured = value === 'true';
  }
  return { meta, body: match[2] };
}

function loadSkillFromDir(skillId: string, root: string): SkillSummary | null {
  const skillDir = join(root, skillId);
  const skillPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  const raw = readFileSync(skillPath, 'utf8');
  const { meta } = parseFrontmatter(raw);
  return {
    id: skillId,
    name: meta.name ?? skillId,
    description: meta.description ?? '',
    examplePrompt: meta.examplePrompt,
    category: meta.category,
    featured: meta.featured,
  };
}

function scanSkillsRoot(root: string): SkillSummary[] {
  if (!existsSync(root)) return [];
  const skills: SkillSummary[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = loadSkillFromDir(entry.name, root);
    if (skill) skills.push(skill);
  }
  return skills;
}

export function listSkills(dataDir = getDefaultDataDir()): SkillSummary[] {
  const bundled = scanSkillsRoot(getBundledSkillsRoot());
  const user = scanSkillsRoot(getUserSkillsRoot(dataDir));
  const byId = new Map<string, SkillSummary>();
  for (const skill of bundled) byId.set(skill.id, skill);
  for (const skill of user) byId.set(skill.id, skill);
  return Array.from(byId.values())
    .map(applyActionBinding)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveSkillRoot(skillId: string, dataDir = getDefaultDataDir()): string | null {
  const userPath = join(getUserSkillsRoot(dataDir), skillId, 'SKILL.md');
  if (existsSync(userPath)) return getUserSkillsRoot(dataDir);
  const bundledPath = join(getBundledSkillsRoot(), skillId, 'SKILL.md');
  if (existsSync(bundledPath)) return getBundledSkillsRoot();
  return null;
}

export function stageSkill(
  skillId: string,
  workspacePath: string,
  dataDir = getDefaultDataDir(),
): string | null {
  const root = resolveSkillRoot(skillId, dataDir);
  if (!root) return null;
  return stageSkillToWorkspace(root, skillId, workspacePath);
}

export function readStagedSkillBody(workspacePath: string, skillId: string): string | null {
  const skillPath = join(workspacePath, '.realtor-skills', skillId, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  const raw = readFileSync(skillPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  return body.trim();
}
