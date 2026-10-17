import { Tooltip } from 'antd';
import type { LiveStatus } from '@/hooks/use-ticket-events';

const META: Record<LiveStatus, { dot: string; label: string; tip: string }> = {
  connecting: { dot: 'bg-ink-subtle', label: 'Connecting', tip: 'Connecting to live updates…' },
  live: { dot: 'bg-success', label: 'Live', tip: 'Updates appear automatically' },
  reconnecting: {
    dot: 'bg-warning',
    label: 'Reconnecting',
    tip: 'Live updates interrupted — retrying. Data refreshes every 20s meanwhile.',
  },
  offline: {
    dot: 'bg-danger',
    label: 'Offline',
    tip: 'Live updates unavailable — data refreshes every 20s.',
  },
};

export function LiveIndicator({
  status,
  compact = false,
}: {
  status: LiveStatus;
  compact?: boolean;
}) {
  const meta = META[status];
  if (compact) {
    return (
      <Tooltip title={`${meta.label} — ${meta.tip}`} placement="right">
        <span className="inline-flex h-6 w-6 items-center justify-center" aria-label={meta.label}>
          <span
            className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${status === 'live' ? 'animate-pulse' : ''}`}
          />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={meta.tip}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-muted">
        <span
          className={`h-2 w-2 rounded-full ${meta.dot} ${status === 'live' ? 'animate-pulse' : ''}`}
        />
        {meta.label}
      </span>
    </Tooltip>
  );
}
