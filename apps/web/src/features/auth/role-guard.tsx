'use client';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { UserRole } from '@bookleaf/contracts';
import { homeFor, useAuth } from './auth-provider';

/**
 * Client-side routing guard for the author/admin layouts. This is UX only — every
 * request is authorised again by the API, which is the real security boundary.
 */
export function RoleGuard({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/login');
    else if (user.role !== role) router.replace(homeFor(user));
  }, [isLoading, user, role, router]);

  if (isLoading || !user || user.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }
  return <>{children}</>;
}
