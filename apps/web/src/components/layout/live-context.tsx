'use client';

import { createContext, useContext } from 'react';
import type { LiveStatus } from '@/hooks/use-ticket-events';

/** Shares the shell's single SSE connection status with pages (for polling fallback). */
export const LiveStatusContext = createContext<LiveStatus>('connecting');

export function useLiveStatus(): LiveStatus {
  return useContext(LiveStatusContext);
}
