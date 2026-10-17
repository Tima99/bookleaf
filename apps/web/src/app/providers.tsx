'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import { MotionConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { AuthProvider } from '@/features/auth/auth-provider';
import { antdTheme } from '@/styles/theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry client errors (401/403/404/422) — only transient failures.
        retry: (count, error) =>
          !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) &&
          count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <AntdRegistry>
      <ConfigProvider theme={antdTheme} locale={enGB}>
        <AntApp>
          {/* Respect the OS "reduce motion" setting for every Framer Motion animation. */}
          <MotionConfig reducedMotion="user">
            <QueryClientProvider client={queryClient}>
              <AuthProvider>{children}</AuthProvider>
            </QueryClientProvider>
          </MotionConfig>
        </AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
