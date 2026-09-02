'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type {
  AgentId,
  DetectedAgent,
  Property,
  PropertyAsset,
  PropertyComparable,
  PropertyStatus,
  SkillSummary,
} from '@realtor-os/contracts';
import { buildActionMessage } from '@/components/ActionGrid';
import { AppShell } from '@/components/AppShell';
import { PropertyChat, type PropertyChatHandle } from '@/components/PropertyChat';
import { PropertyMediaPanel } from '@/components/PropertyMediaPanel';
import { PropertyStatusSelect } from '@/components/PropertyStatusSelect';
import {
  buildPropertyActionContext,
  listAdmissibleSkills,
  type SkillAdmissibility,
} from '@/lib/property-actions';
import {
  fetchProperty,
  fetchSkills,
  formatPrice,
  getApiToken,
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
  const chatRef = useRef<PropertyChatHandle>(null);
  const [autorunTick, setAutorunTick] = useState(0);
  const [chatAgentId, setChatAgentId] = useState<AgentId>('claude');
  const [chatModel, setChatModel] = useState('default');
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);

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
    () =>
      actionContext
        ? listAdmissibleSkills(skills, actionContext, {
            agentId: chatAgentId,
            modelId: chatModel,
            agents: detectedAgents,
          })
        : [],
    [actionContext, skills, chatAgentId, chatModel, detectedAgents],
  );

  const handleSelectionChange = useCallback(
    (selection: { agentId: AgentId; model: string; agents: DetectedAgent[] }) => {
      setChatAgentId(selection.agentId);
      setChatModel(selection.model);
      setDetectedAgents(selection.agents);
    },
    [],
  );

  const runAction = useCallback((skillId: string, message: string) => {
    if (running) {
      setStatus('An action is already running — wait for it to finish.');
      return;
    }
    if (!chatRef.current) {
      setStatus('Chat is still loading…');
      return;
    }
    void chatRef.current.runSkill(skillId, message);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 3500);
    return () => window.clearInterval(id);
  }, [running, refresh]);

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

  const handleCompZillowImport = useCallback(
    (url: string) => {
      const skill = skills.find((s) => s.id === 'zillow-comp') ?? {
        id: 'zillow-comp',
        name: 'Import comparable from Zillow',
        description: '',
      };
      void runAction('zillow-comp', buildActionMessage(skill as SkillSummary, { zillowUrl: url }));
    },
    [runAction, skills],
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

    if (!chatRef.current) {
      window.setTimeout(() => setAutorunTick((n) => n + 1), 50);
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
  }, [autorun, autorunTick, assets, property, propertyId, router, runAction]);

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
            onCompZillowImport={handleCompZillowImport}
            onAssetChange={(asset) =>
              setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)))
            }
          />

          <div className="property-agent-column">
            <PropertyChat
              ref={chatRef}
              propertyId={property.id}
              propertyLabel={propertyLabel}
              onStatusChange={setStatus}
              onRunningChange={setRunning}
              onRunFinished={() => void refresh()}
              onSelectionChange={handleSelectionChange}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
