'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { SSE_EVENT_NAME, type ClientTicketEvent } from '@bookleaf/contracts';
import { API_URL } from '@/lib/api-client';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/**
 * Subscribes to the API's Server-Sent Events stream with exponential-backoff reconnect.
 * Events carry ids only — handlers re-fetch through the authorised REST API. When the
 * stream is down, callers fall back to polling (see `pollIntervalFor`).
 */
export function useTicketEvents(
  path: string | null,
  onEvent: (event: ClientTicketEvent) => void,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Always calls the latest handler without re-subscribing when it changes.
  const handleEvent = useEffectEvent(onEvent);

  useEffect(() => {
    if (!path) return;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`${API_URL}/api/v1${path}`, { withCredentials: true });
      source.addEventListener('ready', () => {
        attempt = 0;
        setStatus('live');
      });
      source.addEventListener(SSE_EVENT_NAME, (e) => {
        try {
          handleEvent(JSON.parse((e as MessageEvent<string>).data) as ClientTicketEvent);
        } catch {
          // Ignore malformed frames; the next fetch will reconcile state.
        }
      });
      source.onerror = () => {
        source?.close();
        if (disposed) return;
        attempt += 1;
        setStatus(attempt > 5 ? 'offline' : 'reconnecting');
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [path]);

  return status;
}

/** Polling fallback: only poll while the live stream is unavailable. */
export function pollIntervalFor(status: LiveStatus): number | false {
  return status === 'live' ? false : 20_000;
}
