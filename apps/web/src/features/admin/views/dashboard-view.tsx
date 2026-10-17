'use client';

import { RobotOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Timeline } from 'antd';
import { TICKET_CATEGORY_LABELS } from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { useLiveStatus } from '@/components/layout/live-context';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
  StatCard,
} from '@/components/ui/primitives';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { tabFor, useWorkspace } from '@/stores/workspace-store';
import { AdminTicketTable } from '../components/admin-ticket-table';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

function minutesLabel(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

export function AdminDashboardView() {
  const live = useLiveStatus();
  const { openTab } = useWorkspaceNav();
  const setQueueFilters = useWorkspace((s) => s.setQueueFilters);
  const dashboard = useQuery({
    queryKey: queryKeys.admin.dashboard,
    queryFn: endpoints.admin.dashboard,
    refetchInterval: pollIntervalFor(live),
  });

  const openQueue = (patch: Parameters<typeof setQueueFilters>[0]) => {
    setQueueFilters({
      search: undefined,
      category: undefined,
      priority: undefined,
      assignee: undefined,
      ...patch,
    });
    openTab(tabFor.queue());
  };

  if (dashboard.isPending) return <LoadingBlock rows={8} />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  const d = dashboard.data;
  const maxCategory = Math.max(1, ...d.unresolvedByCategory.map((c) => c.count));

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        description="What needs attention across all author support tickets."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <button
          type="button"
          className="h-full text-left"
          onClick={() => openQueue({ status: ['OPEN'] })}
        >
          <StatCard label="Open" value={d.counts.open} tone="brand" hint="Not yet picked up" />
        </button>
        <button
          type="button"
          className="h-full text-left"
          onClick={() => openQueue({ status: ['IN_PROGRESS'] })}
        >
          <StatCard label="In progress" value={d.counts.inProgress} />
        </button>
        <button
          type="button"
          className="h-full text-left"
          onClick={() =>
            openQueue({ status: ['OPEN', 'IN_PROGRESS'], priority: ['CRITICAL', 'HIGH'] })
          }
        >
          <StatCard
            label="Critical / High"
            value={`${d.counts.criticalUnresolved} / ${d.counts.highUnresolved}`}
            tone={d.counts.criticalUnresolved ? 'danger' : 'warning'}
            hint="Unresolved"
          />
        </button>
        <button
          type="button"
          className="h-full text-left"
          onClick={() => openQueue({ status: ['OPEN', 'IN_PROGRESS'], assignee: 'unassigned' })}
        >
          <StatCard
            label="Unassigned"
            value={d.counts.unassignedUnresolved}
            hint="Unresolved, no owner"
          />
        </button>
        <button
          type="button"
          className="h-full text-left"
          onClick={() => openQueue({ status: ['OPEN', 'IN_PROGRESS'], assignee: 'me' })}
        >
          <StatCard label="Assigned to me" value={d.counts.myUnresolved} />
        </button>
        <StatCard
          label="Awaiting our reply"
          value={d.counts.awaitingTeamReply}
          tone={d.counts.awaitingTeamReply ? 'warning' : 'default'}
        />
        <StatCard label="Resolved" value={d.counts.resolved} tone="success" />
        <StatCard label="Closed" value={d.counts.closed} />
        <StatCard label="Total tickets" value={d.counts.total} />
        <StatCard
          label="Avg. first response"
          value={minutesLabel(d.avgFirstResponseMinutes)}
          hint={
            d.avgFirstResponseMinutes === null ? 'No replies yet' : 'Creation → first public reply'
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Section
          title="Needs attention"
          extra={
            <Button
              size="small"
              onClick={() => openQueue({ status: ['OPEN', 'IN_PROGRESS'], sort: 'urgency' })}
            >
              Open queue
            </Button>
          }
        >
          <p className="-mt-2 mb-3 text-xs text-ink-subtle">
            Most urgent first, then oldest. Red age = unresolved for over 48 hours.
          </p>
          <AdminTicketTable
            compact
            tickets={d.needsAttention}
            emptyText={
              <EmptyState title="Inbox zero" description="No unresolved tickets right now." />
            }
          />
        </Section>

        <div className="flex flex-col gap-6">
          <Section title="Unresolved by category">
            {d.unresolvedByCategory.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing unresolved.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {d.unresolvedByCategory.map((c) => (
                  <li key={c.category ?? 'none'}>
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() =>
                        c.category &&
                        openQueue({ status: ['OPEN', 'IN_PROGRESS'], category: [c.category] })
                      }
                    >
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span>
                          {c.category ? TICKET_CATEGORY_LABELS[c.category] : 'Not yet classified'}
                        </span>
                        <span className="tabular-nums text-ink-muted">{c.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-divider">
                        <div
                          className="h-1.5 rounded-full bg-brand-500"
                          style={{ width: `${(c.count / maxCategory) * 100}%` }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2">
                <RobotOutlined /> AI assistant
              </span>
            }
            extra={
              <Button size="small" onClick={() => openTab(tabFor.ai())}>
                Configure
              </Button>
            }
          >
            {d.ai.configured ? (
              <p className="text-sm text-ink-muted">
                AI is on. It sorts new tickets and drafts replies for you to review
                {d.ai.failuresLast24h
                  ? ` (it couldn't help ${d.ai.failuresLast24h} time${d.ai.failuresLast24h === 1 ? '' : 's'} in the last day — those were sorted automatically instead)`
                  : ''}
                .
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                AI is switched off. New tickets are sorted automatically from key words, and replies
                start from ready-made templates.
              </p>
            )}
          </Section>

          <Section title="Recent activity">
            {d.recentActivity.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity yet.</p>
            ) : (
              <Timeline
                items={d.recentActivity.map((a) => ({
                  color:
                    a.actor.role === 'AUTHOR'
                      ? 'orange'
                      : a.actor.role === 'SYSTEM'
                        ? 'gray'
                        : 'blue',
                  content: (
                    <div className="text-[13px]">
                      {a.ticket ? (
                        <button
                          type="button"
                          className="text-left hover:text-brand-800"
                          onClick={() =>
                            a.ticket && openTab(tabFor.ticket(a.ticket.id, a.ticket.reference))
                          }
                        >
                          {a.summary}
                        </button>
                      ) : (
                        a.summary
                      )}
                      <p className="text-xs text-ink-subtle">{formatDateTime(a.createdAt)}</p>
                    </div>
                  ),
                }))}
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
