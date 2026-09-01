import type { Property, PropertyAsset, SkillSummary } from '@realtor-os/contracts';

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

export function getSkillAdmissibility(
  skill: SkillSummary,
  ctx: PropertyActionContext,
): SkillAdmissibility {
  const { property, hasPhotos, hasPropertyJson } = ctx;

  switch (skill.id) {
    case 'zillow-import': {
      if (!property.zillowUrl) {
        return {
          skill,
          availability: 'blocked',
          reason: 'No Zillow URL on this property. Import from the dashboard with a Zillow link first.',
          runLabel: 'Run',
        };
      }
      if (hasPhotos && hasPropertyJson) {
        return {
          skill,
          availability: 'done',
          reason:
            'Already imported. Use Verify to compare Zillow and update stale fields in property.json — not a full re-import.',
          runLabel: 'Verify / update',
        };
      }
      return {
        skill,
        availability: 'ready',
        reason: 'Pull listing facts and photos from Zillow into this workspace.',
        runLabel: 'Import',
      };
    }
    case 'listing-copy': {
      if (!hasPropertyJson) {
        return {
          skill,
          availability: 'blocked',
          reason: 'Import listing facts first (Zillow import or add property.json).',
          runLabel: 'Run',
        };
      }
      return {
        skill,
        availability: 'ready',
        reason: 'Write marketing copy from saved facts and photos.',
        runLabel: 'Write copy',
      };
    }
    case 'virtual-staging': {
      if (!hasPhotos) {
        return {
          skill,
          availability: 'blocked',
          reason: 'Import photos before staging.',
          runLabel: 'Run',
        };
      }
      return {
        skill,
        availability: 'ready',
        reason: 'Plan staging from photos in images/.',
        runLabel: 'Stage',
      };
    }
    case 'social-post': {
      if (!hasPropertyJson) {
        return {
          skill,
          availability: 'blocked',
          reason: 'Import listing facts first.',
          runLabel: 'Run',
        };
      }
      return {
        skill,
        availability: 'ready',
        reason: ctx.hasListingMd
          ? 'Draft a social post from listing.md and property facts.'
          : 'Draft a social post from property facts (listing copy helps).',
        runLabel: 'Draft post',
      };
    }
    default:
      return {
        skill,
        availability: hasPropertyJson || hasPhotos ? 'ready' : 'blocked',
        reason: hasPropertyJson || hasPhotos ? skill.description : 'Add property data before running this action.',
        runLabel: 'Run',
      };
  }
}

export function listAdmissibleSkills(
  skills: SkillSummary[],
  ctx: PropertyActionContext,
): SkillAdmissibility[] {
  return skills
    .filter((s) => s.featured !== false)
    .map((skill) => getSkillAdmissibility(skill, ctx))
    .sort((a, b) => {
      const order = { ready: 0, done: 1, blocked: 2 };
      return order[a.availability] - order[b.availability];
    });
}
