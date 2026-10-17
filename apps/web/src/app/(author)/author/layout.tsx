'use client';

import type { ReactNode } from 'react';
import { AuthorShell } from '@/components/layout/author-shell';
import { RoleGuard } from '@/features/auth/role-guard';

export default function AuthorLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="AUTHOR">
      <AuthorShell>{children}</AuthorShell>
    </RoleGuard>
  );
}
