'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProperty, importFromFolder, importFromZillow } from '@/lib/api';

type Modal = 'menu' | 'zillow' | 'blank' | 'folder' | null;

export function AddPropertyMenu({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [zillowUrl, setZillowUrl] = useState('');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicatePropertyId, setDuplicatePropertyId] = useState<string | null>(null);

  function closeAll() {
    setOpen(false);
    setModal(null);
    setError(null);
    setDuplicatePropertyId(null);
    setZillowUrl('');
    setTitle('');
    setAddress('');
  }

  useEffect(() => {
    if (!open || modal) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, modal]);

  async function handleZillowImport(forceDuplicate = false) {
    if (!zillowUrl.trim() || busy) return;
    setBusy(true);
    setError(null);
    setDuplicatePropertyId(null);
    try {
      const result = await importFromZillow(zillowUrl.trim(), forceDuplicate ? 'duplicate' : 'default');
      if (result.existing && !forceDuplicate) {
        setDuplicatePropertyId(result.property.id);
        setBusy(false);
        return;
      }
      closeAll();
      onCreated?.();
      router.push(`/properties/${result.property.id}?autorun=zillow-import`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBlankCreate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const property = await createProperty({
        title: title.trim() || undefined,
        address: address.trim() || undefined,
      });
      closeAll();
      onCreated?.();
      router.push(`/properties/${property.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFolderSelect(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const property = await importFromFolder(files);
      closeAll();
      onCreated?.();
      router.push(`/properties/${property.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }

  return (
    <>
      <div className="add-property-menu" ref={menuRef}>
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            setOpen((v) => !v);
            setModal(null);
          }}
        >
          + Add property
        </button>
        {open && !modal ? (
          <div className="add-property-dropdown">
            <button type="button" onClick={() => setModal('zillow')}>
              Import from Zillow
            </button>
            <button type="button" onClick={() => setModal('blank')}>
              Blank property
            </button>
            <button type="button" onClick={() => setModal('folder')}>
              Import folder
            </button>
          </div>
        ) : null}
      </div>

      {modal ? (
        <div className="modal-backdrop" onClick={() => !busy && closeAll()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal === 'zillow' ? (
              <>
                <h2>Import from Zillow</h2>
                <p>Paste a Zillow homedetails URL. The agent will extract photos and listing facts.</p>
                <input
                  type="url"
                  value={zillowUrl}
                  onChange={(e) => setZillowUrl(e.target.value)}
                  placeholder="https://www.zillow.com/homedetails/..."
                  autoFocus
                />
                {duplicatePropertyId ? (
                  <div className="duplicate-notice">
                    <p>This listing is already in RealtorOS.</p>
                    <div className="modal-actions">
                      <button type="button" className="secondary-btn" onClick={() => void closeAll()}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => router.push(`/properties/${duplicatePropertyId}`)}
                      >
                        Open existing
                      </button>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => void handleZillowImport(true)}
                      >
                        Import again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="modal-actions">
                    <button type="button" className="secondary-btn" onClick={() => closeAll()} disabled={busy}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!zillowUrl.trim() || busy}
                      onClick={() => void handleZillowImport(false)}
                    >
                      {busy ? 'Checking…' : 'Import'}
                    </button>
                  </div>
                )}
              </>
            ) : null}

            {modal === 'blank' ? (
              <>
                <h2>New property</h2>
                <p>Create an empty workspace. Add photos and details later or run skills from the property page.</p>
                <label className="modal-field">
                  Title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. 123 Main St listing"
                    autoFocus
                  />
                </label>
                <label className="modal-field">
                  Address
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, city, state"
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => closeAll()} disabled={busy}>
                    Cancel
                  </button>
                  <button type="button" className="primary-btn" disabled={busy} onClick={() => void handleBlankCreate()}>
                    {busy ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </>
            ) : null}

            {modal === 'folder' ? (
              <>
                <h2>Import folder</h2>
                <p>
                  Select a folder that contains <code>property.json</code>, <code>images/</code>, or other workspace
                  files. They will be copied into a new property.
                </p>
                <input
                  ref={folderInputRef}
                  type="file"
                  className="folder-input"
                  // @ts-expect-error webkitdirectory is non-standard but widely supported
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={(e) => void handleFolderSelect(e.target.files)}
                />
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => closeAll()} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={busy}
                    onClick={() => folderInputRef.current?.click()}
                  >
                    {busy ? 'Importing…' : 'Choose folder'}
                  </button>
                </div>
              </>
            ) : null}

            {error ? <div className="connection-banner modal-error">{error}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
