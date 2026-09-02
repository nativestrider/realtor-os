import type { AgentId, DetectedAgent, Property, PropertyAsset, SkillSummary } from '@realtor-os/contracts';
import { ACTION_CATALOG, actionAllowsSelection, formatAllowedAgents } from '@realtor-os/contracts';

const ACTION_ORDER = Object.keys(ACTION_CATALOG);

export type ActionAvailability = 'ready' | 'blocked' | 'done';

export interface PropertyActionContext {
  property: Property;
  photoCount: number;
  hasPhotos: boolean;
  hasPropertyJson: boolean;
  hasListingMd?: boolean;
}

export interface SkillAdmissibility {
  skill: SkillSummary;
  availability: ActionAvailability;
  reason: string;
  runLabel: string;
  allowedAgentsLabel: string;
}

export interface ActionAgentContext {
  agentId: AgentId;
  modelId?: string;
  agents?: DetectedAgent[];
}

export function buildPropertyActionContext(
  property: Property,
  assets: PropertyAsset[],
  options?: { hasListingMd?: boolean },
): PropertyActionContext {
  const photoCount = assets.filter((a) => a.kind === 'photo').length;
  return {
    property,
    photoCount,
    hasPhotos: photoCount > 0,
    hasPropertyJson: property.price != null,
    hasListingMd: options?.hasListingMd,
  };
}

function withRuntime(
  result: Omit<SkillAdmissibility, 'allowedAgentsLabel'>,
): SkillAdmissibility {
  return { ...result, allowedAgentsLabel: formatAllowedAgents(result.skill.id) };
}

function capabilitiesForSelection(agentCtx?: ActionAgentContext) {
  if (!agentCtx) return undefined;
  const agent = agentCtx.agents?.find((a) => a.id === agentCtx.agentId);
  const model = agent?.models.find((m) => m.id === (agentCtx.modelId ?? 'default'));
  return model?.capabilities ?? agent?.capabilities;
}

export function getSkillAdmissibility(
  skill: SkillSummary,
  ctx: PropertyActionContext,
  agentCtx?: ActionAgentContext,
): SkillAdmissibility {
  const { property, hasPhotos, hasPropertyJson } = ctx;

  if (agentCtx && !actionAllowsSelection(skill.id, agentCtx.agentId, capabilitiesForSelection(agentCtx))) {
    return withRuntime({
      skill,
      availability: 'blocked',
      reason: `Needs ${formatAllowedAgents(skill.id)}. Switch the Agent picker and try again.`,
      runLabel: 'Run',
    });
  }

  switch (skill.id) {
    case 'zillow-import': {
      if (!property.zillowUrl) {
        return withRuntime({
          skill,
          availability: 'blocked',
          reason: 'No Zillow URL on this property. Import from the dashboard with a Zillow link first.',
          runLabel: 'Run',
        });
      }
      if (hasPhotos && hasPropertyJson) {
        return withRuntime({
          skill,
          availability: 'done',
          reason:
            'Already imported. Use Verify to compare Zillow and update stale fields in property.json — not a full re-import.',
          runLabel: 'Verify / update',
        });
      }
      return withRuntime({
        skill,
        availability: 'ready',
        reason: 'Pull listing facts and photos from Zillow into this workspace.',
        runLabel: 'Import',
      });
    }
    case 'listing-copy': {
      if (!hasPropertyJson) {
        return withRuntime({
          skill,
          availability: 'blocked',
          reason: 'Import listing facts first (Zillow import or add property.json).',
          runLabel: 'Run',
        });
      }
      return withRuntime({
        skill,
        availability: 'ready',
        reason: 'Write marketing copy from saved facts and photos.',
        runLabel: 'Write copy',
      });
    }
    case 'virtual-staging': {
      if (!hasPhotos) {
        return withRuntime({
          skill,
          availability: 'blocked',
          reason: 'Import photos before staging.',
          runLabel: 'Run',
        });
      }
      return withRuntime({
        skill,
        availability: 'ready',
        reason: 'Ask which photo to stage, then write a furnished variant to staged/.',
        runLabel: 'Stage',
      });
    }
    case 'social-post': {
      if (!hasPropertyJson) {
        return withRuntime({
          skill,
          availability: 'blocked',
          reason: 'Import listing facts first.',
          runLabel: 'Run',
        });
      }
      return withRuntime({
        skill,
        availability: 'ready',
        reason: ctx.hasListingMd
          ? 'Draft a social post from listing.md and property facts.'
          : 'Draft a social post from property facts (listing copy helps).',
        runLabel: 'Draft post',
      });
    }
    default:
      return withRuntime({
        skill,
        availability: hasPropertyJson || hasPhotos ? 'ready' : 'blocked',
        reason: hasPropertyJson || hasPhotos ? skill.description : 'Add property data before running this action.',
        runLabel: 'Run',
      });
  }
}

export function listAdmissibleSkills(
  skills: SkillSummary[],
  ctx: PropertyActionContext,
  agentCtx?: ActionAgentContext,
): SkillAdmissibility[] {
  return skills
    .filter((s) => s.featured !== false)
    .map((skill) => getSkillAdmissibility(skill, ctx, agentCtx))
    .sort((a, b) => {
      const ai = ACTION_ORDER.indexOf(a.skill.id);
      const bi = ACTION_ORDER.indexOf(b.skill.id);
      return (ai === -1 ? ACTION_ORDER.length : ai) - (bi === -1 ? ACTION_ORDER.length : bi);
    });
}
