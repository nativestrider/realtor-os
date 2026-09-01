'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
  /** Hide the add-property control (e.g. on property detail). */
  hideAddProperty?: boolean;
  addPropertySlot?: ReactNode;
};

export function AppShell({ children, hideAddProperty, addPropertySlot }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <Link href="/" className="app-shell-brand">
          <span className="app-shell-logo">RealtorOS</span>
          <span className="app-shell-tagline">Properties you are selling</span>
        </Link>
        <div className="app-shell-actions">
          <Link href="/settings" className="app-shell-settings">
            Settings
          </Link>
          {!hideAddProperty && addPropertySlot ? addPropertySlot : null}
        </div>
      </header>
      <main className="app-shell-main">{children}</main>
    </div>
  );
}
