'use client';

import { ClearOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Select } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminTicketListParams,
} from '@bookleaf/contracts';
import { useLiveStatus } from '@/components/layout/live-context';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/primitives';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { DEFAULT_QUEUE_FILTERS, useWorkspace } from '@/stores/workspace-store';
import { AdminTicketTable } from '../components/admin-ticket-table';

const SORT_OPTIONS = [
  { value: 'urgency', label: 'Most urgent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'priority', label: 'Priority, newest' },
];

export function TicketQueueView() {
  const live = useLiveStatus();
  const filters = useWorkspace((s) => s.queueFilters);
  const setFilters = useWorkspace((s) => s.setQueueFilters);
  const reset = useWorkspace((s) => s.resetQueueFilters);
  const [search, setSearch] = useState(filters.search ?? '');
  const debounced = useDebouncedValue(search, 350);
  const lastPushed = useRef(filters.search ?? '');

  // Typing → store (debounced).
  useEffect(() => {
    if (debounced === lastPushed.current) return;
    lastPushed.current = debounced;
    setFilters({ search: debounced || undefined });
  }, [debounced, setFilters]);
  // Store changed elsewhere (reset, dashboard shortcut) → input.
  useEffect(() => {
    const external = filters.search ?? '';
    if (external !== lastPushed.current) {
      lastPushed.current = external;
      setSearch(external);
    }
  }, [filters.search]);

  const admins = useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: endpoints.admin.users,
    staleTime: 10 * 60_000,
  });
  const query: AdminTicketListParams = { ...filters };
  const tickets = useQuery({
    queryKey: queryKeys.admin.tickets(query),
    queryFn: () => endpoints.admin.tickets(query),
    placeholderData: keepPreviousData,
    refetchInterval: pollIntervalFor(live),
  });

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_QUEUE_FILTERS);

  return (
    <div>
      <PageHeader
        title="Ticket queue"
        description="All author tickets. Unresolved, most urgent and oldest tickets surface first by default."
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void tickets.refetch()}
            loading={tickets.isRefetching}
          >
            Refresh
          </Button>
        }
      />

      <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-ink-subtle" />}
          placeholder="Subject, author, email or BL-number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search tickets"
          className="xl:col-span-2"
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          placeholder="Any status"
          value={filters.status ?? []}
          onChange={(v) => setFilters({ status: v.length ? v : undefined })}
          options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))}
          aria-label="Status"
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          placeholder="Any priority"
          value={filters.priority ?? []}
          onChange={(v) => setFilters({ priority: v.length ? v : undefined })}
          options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] }))}
          aria-label="Priority"
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          placeholder="Any category"
          value={filters.category ?? []}
          onChange={(v) => setFilters({ category: v.length ? v : undefined })}
          options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
          aria-label="Category"
          className="xl:col-span-2"
        />
        <Select
          allowClear
          placeholder="Any assignee"
          value={filters.assignee}
          onChange={(v) => setFilters({ assignee: v })}
          options={[
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
            ...(admins.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          aria-label="Assignee"
        />
        <DatePicker.RangePicker
          value={[
            filters.createdFrom ? dayjs(filters.createdFrom) : null,
            filters.createdTo ? dayjs(filters.createdTo) : null,
          ]}
          onChange={(range) =>
            setFilters({
              createdFrom: range?.[0]?.format('YYYY-MM-DD'),
              createdTo: range?.[1]?.format('YYYY-MM-DD'),
            })
          }
          allowEmpty={[true, true]}
          aria-label="Created between"
        />
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4">
          <span className="text-sm text-ink-muted">Sort</span>
          <Select
            value={filters.sort}
            onChange={(v) => setFilters({ sort: v })}
            options={SORT_OPTIONS}
            className="min-w-48"
            aria-label="Sort"
          />
          <Button icon={<ClearOutlined />} onClick={reset} disabled={isDefault} className="ml-auto">
            Reset filters
          </Button>
        </div>
      </div>

      {tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : (
        <div className="surface-card overflow-hidden">
          <AdminTicketTable
            columnStorageKey="admin-ticket-queue"
            toolbar={
              tickets.data
                ? `${tickets.data.meta.total} ticket${tickets.data.meta.total === 1 ? '' : 's'}`
                : null
            }
            tickets={tickets.data?.items ?? []}
            loading={tickets.isFetching && !tickets.isRefetching}
            emptyText={
              <EmptyState
                title={isDefault ? 'No unresolved tickets' : 'No tickets match these filters'}
                description={
                  isDefault
                    ? 'New author tickets will appear here in real time.'
                    : 'Try widening the filters.'
                }
              />
            }
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total: tickets.data?.meta.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (total) => `${total} ticket${total === 1 ? '' : 's'}`,
            }}
            onChange={(p) =>
              setFilters({ page: p.current ?? 1, pageSize: p.pageSize ?? filters.pageSize })
            }
          />
        </div>
      )}
    </div>
  );
}
