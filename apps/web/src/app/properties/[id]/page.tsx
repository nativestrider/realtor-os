'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Property, PropertyAsset, PropertyComparable, PropertyStatus, RunEvent, SkillSummary } from '@realtor-os/contracts';
import { buildActionMessage } from '@/components/ActionGrid';
import { AppShell } from '@/components/AppShell';
import { PropertyChat, useAgentDefaults } from '@/components/PropertyChat';
import { PropertyMediaPanel } from '@/components/PropertyMediaPanel';
import { PropertyStatusSelect } from '@/components/PropertyStatusSelect';
import {
  buildPropertyActionContext,
  listAdmissibleSkills,
  type SkillAdmissibility,
} from '@/lib/property-actions';
import { formatAgentActivity } from '@/lib/agent-activity';
import {
  fetchProperty,
  fetchSkills,
  formatPrice,
  getApiToken,
  streamPropertyAction,
  updateProperty,
} from '@/lib/api';

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = params.id;
  const autorun = searchParams.get('autorun');

  const [property, setProperty] = useState<Property | null>(null);
  const [assets, setAssets] = useState<PropertyAsset[]>([]);
  const [comparables, setComparables] = useState<PropertyComparable[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [photoTab, setPhotoTab] = useState<'original' | 'staged'>('original');
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const autorunDone = useRef(false);

  const { agentId, model } = useAgentDefaults();

  const refresh = useCallback(async () => {
    const data = await fetchProperty(propertyId);
    setProperty(data.property);
    setAssets(data.assets);
    setComparables(data.comparables ?? []);
  }, [propertyId]);

  useEffect(() => {
    if (!getApiToken()) {
      setConnectionError('Missing login token. Open the full link from your terminal.');
      return;
    }
    void Promise.all([refresh(), fetchSkills().then(setSkills)]).catch((err) => {
      setConnectionError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  const actionContext = useMemo(
    () => (property ? buildPropertyActionContext(property, assets) : null),
    [property, assets],
  );

  const admissibleActions = useMemo(
    () => (actionContext ? listAdmissibleSkills(skills, actionContext) : []),
    [actionContext, skills],
  );

  const runAction = useCallback(
    async (skillId: string, message: string) => {
      if (running) {
        setStatus('An action is already running — wait for it to finish.');
        return;
      }
      setRunning(true);
      setStatus(`Running ${skillId}…`);

      try {
        await streamPropertyAction(
          propertyId,
          skillId,
          { agentId, model, message },
          (event: RunEvent) => {
            if (event.type === 'status' && event.status) {
              setStatus(formatAgentActivity({ status: event.status }));
            }
            if (event.type === 'tool_call' && event.toolCall) {
              setStatus(formatAgentActivity({ toolName: event.toolCall.name }));
            }
            if (event.type === 'error') setStatus(event.message ?? 'Error');
            if (event.type === 'done') {
              setRunning(false);
              setStatus('');
              void refresh();
            }
          },
        );
      } catch (err) {
        setRunning(false);
        setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [agentId, model, propertyId, refresh, running],
  );

  const handleRunSkill = useCallback(
    (action: SkillAdmissibility) => {
      if (action.availability === 'blocked') return;
      const options = {
        zillowUrl: property?.zillowUrl,
        hasPhotos: assets.some((a) => a.kind === 'photo'),
        hasPropertyJson: property?.price != null,
      };
      void runAction(action.skill.id, buildActionMessage(action.skill, options));
    },
    [assets, property, runAction],
  );

  const handleZillowImportFromSetup = useCallback(
    (url: string) => {
      const skill = skills.find((s) => s.id === 'zillow-import') ?? {
        id: 'zillow-import',
        name: 'Import from Zillow',
        description: '',
      };
      void runAction(
        'zillow-import',
        buildActionMessage(skill as SkillSummary, {
          zillowUrl: url,
          hasPhotos: assets.some((a) => a.kind === 'photo'),
          hasPropertyJson: property?.price != null,
        }),
      );
    },
    [assets, property?.price, runAction, skills],
  );

  useEffect(() => {
    if (!property || autorunDone.current) return;
    if (autorun !== 'zillow-import' || !property.zillowUrl) return;

    const storageKey = `realtor-autorun-${propertyId}-zillow-import`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
      router.replace(`/properties/${propertyId}`);
      return;
    }

    const photoCount = assets.filter((a) => a.kind === 'photo').length;
    if (photoCount > 0 && property.price != null) {
      autorunDone.current = true;
      sessionStorage.setItem(storageKey, 'skipped');
      router.replace(`/properties/${propertyId}`);
      setStatus('Import already complete.');
      return;
    }

    autorunDone.current = true;
    if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, 'started');
    router.replace(`/properties/${propertyId}`);

    const skill = { id: 'zillow-import', name: 'Import from Zillow' } as SkillSummary;
    void runAction(
      'zillow-import',
      buildActionMessage(skill, {
        zillowUrl: property.zillowUrl,
        hasPhotos: photoCount > 0,
        hasPropertyJson: property.price != null,
      }),
    );
  }, [autorun, assets, property, propertyId, router, runAction]);

  if (!property && !connectionError) {
    return (
      <AppShell hideAddProperty>
        <div className="empty-state">Loading property…</div>
      </AppShell>
    );
  }

  if (!property) {
    return (
      <AppShell hideAddProperty>
        <div className="connection-banner">{connectionError}</div>
        <Link href="/">← Back to properties</Link>
      </AppShell>
    );
  }

  const propertyLabel = property.address || property.title;

  return (
    <AppShell hideAddProperty>
      <div className="property-detail">
        <header className="property-detail-header property-detail-header-compact">
          <Link href="/" className="back-link">
            ← Properties
          </Link>
          <div className="property-detail-title">
            <div className="property-detail-heading">
              <h1>{property.title}</h1>
              <p className="property-detail-address">{property.address}</p>
            </div>
            <PropertyStatusSelect
              status={property.status}
              disabled={statusSaving}
              onChange={(nextStatus: PropertyStatus) => {
                setStatusSaving(true);
                void updateProperty(property.id, { status: nextStatus })
                  .then((updated) => setProperty(updated))
                  .catch((err) =>
                    setConnectionError(err instanceof Error ? err.message : String(err)),
                  )
                  .finally(() => setStatusSaving(false));
              }}
            />
          </div>
          <div className="property-facts property-facts-inline">
            <span>{formatPrice(property.price)}</span>
            {property.beds != null && <span>{property.beds} bd</span>}
            {property.baths != null && <span>{property.baths} ba</span>}
            {property.sqft != null && <span>{property.sqft.toLocaleString()} sqft</span>}
          </div>
          {status ? <span className="status-pill detail-status">{status}</span> : null}
        </header>

        {connectionError ? <div className="connection-banner">{connectionError}</div> : null}

        <div className="property-detail-body">
          <PropertyMediaPanel
            property={property}
            assets={assets}
            comparables={comparables}
            photoTab={photoTab}
            onPhotoTabChange={setPhotoTab}
            onComparablesChange={() => void refresh()}
            actions={admissibleActions}
            actionsRunning={running}
            onRunAction={handleRunSkill}
            onPropertyUpdated={() => void refresh()}
            onZillowImport={handleZillowImportFromSetup}
            onAssetChange={(asset) =>
              setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)))
            }
          />

          <div className="property-agent-column">
            <PropertyChat
              propertyId={property.id}
              propertyLabel={propertyLabel}
              zillowUrl={property.zillowUrl}
              hasPhotos={assets.some((a) => a.kind === 'photo')}
              hasPropertyJson={property.price != null}
              onStatusChange={setStatus}
              onRunFinished={() => void refresh()}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
