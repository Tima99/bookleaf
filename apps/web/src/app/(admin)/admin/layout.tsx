'use client';

import type { ReactNode } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';
import { RoleGuard } from '@/features/auth/role-guard';
import { WorkspaceHost } from '@/features/admin/workspace/workspace-host';

/**
 * Admin layout persists across /admin/* navigations. Route pages render
 * nothing; AdminShell activates the tab for the current URL and WorkspaceHost renders
 * the tabs themselves.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="ADMIN">
      <AdminShell>
        {children}
        <WorkspaceHost />
      </AdminShell>
    </RoleGuard>
  );
}
