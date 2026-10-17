'use client';

import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Input, Pagination, Select } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from '@bookleaf/contracts';
import { useLiveStatus } from '@/components/layout/live-context';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  PageTransition,
} from '@/components/ui/primitives';
import { AuthorTicketRow } from '@/features/tickets/author-ticket-row';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { endpoints, queryKeys } from '@/lib/endpoints';

export default function MyTicketsPage() {
  const live = useLiveStatus();
  const [status, setStatus] = useState<TicketStatus[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const query = { page, pageSize: 10, status, search: debounced || undefined };

  const tickets = useQuery({
    queryKey: queryKeys.author.tickets(query),
    queryFn: () => endpoints.tickets.listMine(query),
    placeholderData: keepPreviousData,
    refetchInterval: pollIntervalFor(live),
  });
  const filtered = status.length > 0 || !!debounced;

  return (
    <PageTransition>
      <PageHeader
        title="My Tickets"
        description="Every question you've raised and the BookLeaf team's replies. Updates appear automatically."
        actions={
          <Link href="/author/tickets/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New ticket
            </Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-ink-subtle" />}
          placeholder="Search subject or ticket number (BL-1001)"
          className="sm:!max-w-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search tickets"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="All statuses"
          className="sm:min-w-64"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={TICKET_STATUSES.map((s) => ({ label: TICKET_STATUS_LABELS[s], value: s }))}
          aria-label="Filter by status"
        />
      </div>

      <div className="surface-card p-3">
        {tickets.isPending ? (
          <div className="p-3">
            <LoadingBlock rows={6} />
          </div>
        ) : tickets.isError ? (
          <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
        ) : tickets.data.items.length === 0 ? (
          <EmptyState
            title={
              filtered ? 'No tickets match your filters' : "You haven't raised any tickets yet"
            }
            description={
              filtered
                ? 'Try clearing the search or status filter.'
                : 'Need help with royalties, ISBNs, printing or distribution? Ask us anything.'
            }
            action={
              !filtered ? (
                <Link href="/author/tickets/new">
                  <Button type="primary">Raise a query</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col divide-y divide-divider">
            {tickets.data.items.map((t) => (
              <AuthorTicketRow key={t.id} ticket={t} />
            ))}
          </div>
        )}
      </div>
      {tickets.data && tickets.data.meta.total > 10 ? (
        <div className="mt-4 flex justify-end">
          <Pagination
            current={page}
            pageSize={10}
            total={tickets.data.meta.total}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      ) : null}
    </PageTransition>
  );
}
