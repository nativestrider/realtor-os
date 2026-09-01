import type { AgentId, SkillSummary } from '@realtor-os/contracts';

interface ActionGridProps {
  skills: SkillSummary[];
  running: boolean;
  onRun: (skill: SkillSummary) => void;
}

export function ActionGrid({ skills, running, onRun }: ActionGridProps) {
  const featured = skills.filter((s) => s.featured !== false);

  return (
    <div className="action-grid">
      <h2>Actions</h2>
      {featured.map((skill) => (
        <div key={skill.id} className="action-card">
          <div className="action-card-header">
            <h3>{skill.name}</h3>
            {skill.category ? <span className="action-category">{skill.category}</span> : null}
          </div>
          <p>{skill.description}</p>
          {skill.examplePrompt ? (
            <blockquote className="example-prompt">&ldquo;{skill.examplePrompt}&rdquo;</blockquote>
          ) : null}
          <button type="button" className="primary-btn" disabled={running} onClick={() => onRun(skill)}>
            Run
          </button>
        </div>
      ))}
    </div>
  );
}

export function getSkillCommandLabel(
  skill: SkillSummary,
  options?: { hasPhotos?: boolean; hasPropertyJson?: boolean },
): string {
  if (skill.id === 'zillow-import' && options?.hasPhotos && options?.hasPropertyJson) {
    return 'Verify / update from Zillow';
  }
  return skill.name;
}

export function buildActionMessage(
  skill: SkillSummary,
  options?: { zillowUrl?: string; hasPhotos?: boolean; hasPropertyJson?: boolean },
): string {
  const { zillowUrl, hasPhotos, hasPropertyJson } = options ?? {};

  if (skill.id === 'zillow-import' && zillowUrl) {
    if (hasPhotos && hasPropertyJson) {
      return [
        'Verify this listing against Zillow and update any stale fields in property.json.',
        '',
        `Zillow URL: ${zillowUrl}`,
        '',
        'property.json and images/ already exist in cwd. Do not run a full re-import unless I explicitly ask.',
        '',
        '1. Read property.json, images/, images/.meta/, and source.json on disk.',
        '2. Open the Zillow URL in the supervised browser (stop if CAPTCHA/login — ask me to complete it).',
        '3. Compare price, beds, baths, sqft, lot, year built, MLS, property type, and description to property.json.',
        '4. Update property.json only where Zillow differs (faithful copy — never invent facts).',
        '5. Do not re-download photos unless Zillow shows more gallery images than images/ on disk.',
        '6. Keep existing images/.meta/ classifications unless classifying newly added photos only.',
        '7. Add a Verification section to import-report.md and summarize findings in chat.',
      ].join('\n');
    }
    return `Import this Zillow listing: ${zillowUrl}\n\nFollow the zillow-import skill workflow. Save property.json and download all gallery images to images/.`;
  }

  if (skill.id === 'listing-copy') {
    return 'Read property.json and images/ in cwd. Write marketing copy to listing.md (headline, description, bullets). Use only facts already on disk — do not re-scrape Zillow.';
  }

  if (skill.id === 'virtual-staging') {
    return 'Read images/ in cwd. Pick the room the user cares about (or start with the living room). Describe a staging plan and save any staged outputs to staged/. Do not re-import the listing.';
  }

  return skill.examplePrompt ?? `Run the ${skill.name} workflow for this property.`;
}

export type ActionRunInput = {
  agentId: AgentId;
  model: string;
  message: string;
};
