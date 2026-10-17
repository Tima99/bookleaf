'use client';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useAuth } from '@/features/auth/auth-provider';

/** Entry point: route signed-in users to their portal, everyone else to sign-in. */
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading) router.replace(user ? homeFor(user) : '/login');
  }, [user, isLoading, router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spin size="large" />
    </div>
  );
}
