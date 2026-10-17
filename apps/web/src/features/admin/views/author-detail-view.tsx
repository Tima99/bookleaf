'use client';

import { useQuery } from '@tanstack/react-query';
import { Table, Tag } from 'antd';
import { useEffect } from 'react';
import type { BookDto } from '@bookleaf/contracts';
import { formatDate, formatINR, formatNumber } from '@bookleaf/utils';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
  StatCard,
} from '@/components/ui/primitives';
import { BookStageTag } from '@/components/ui/tags';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { useWorkspace } from '@/stores/workspace-store';
import { AdminTicketTable } from '../components/admin-ticket-table';

export function AuthorDetailView({ authorId, tabId }: { authorId: string; tabId: string }) {
  const setTitle = useWorkspace((s) => s.setTitle);
  const detail = useQuery({
    queryKey: queryKeys.admin.author(authorId),
    queryFn: () => endpoints.admin.author(authorId),
  });

  useEffect(() => {
    if (detail.data) setTitle(tabId, detail.data.author.name);
  }, [detail.data, tabId, setTitle]);

  if (detail.isPending) return <LoadingBlock rows={8} />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const { author, books, tickets, totals } = detail.data;

  return (
    <div>
      <PageHeader
        title={author.name}
        description={`${author.authorCode} · ${author.email}${author.city ? ` · ${author.city}` : ''} · joined ${formatDate(author.joinedDate)}`}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Copies sold" value={formatNumber(totals.totalCopiesSold)} />
        <StatCard
          label="Royalty earned"
          value={formatINR(totals.totalRoyaltyEarned)}
          tone="brand"
        />
        <StatCard label="Royalty paid" value={formatINR(totals.royaltyPaid)} tone="success" />
        <StatCard
          label="Royalty pending"
          value={formatINR(totals.royaltyPending)}
          tone={totals.royaltyPending ? 'warning' : 'default'}
        />
      </div>

      <Section title={`Books (${books.length})`} className="mt-6">
        <Table<BookDto>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={books}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Title',
              key: 'title',
              render: (_, b) => <span className="font-medium">{b.title}</span>,
            },
            {
              title: 'ISBN',
              dataIndex: 'isbn',
              render: (v: string | null) => <span className="font-mono text-xs">{v ?? '—'}</span>,
            },
            {
              title: 'Status',
              key: 'status',
              render: (_, b) => (
                <BookStageTag stage={b.stage} productionStage={b.productionStage} />
              ),
            },
            { title: 'Sold', dataIndex: 'totalCopiesSold', align: 'right' },
            {
              title: 'Earned',
              dataIndex: 'totalRoyaltyEarned',
              align: 'right',
              render: (v: number) => formatINR(v),
            },
            {
              title: 'Pending',
              dataIndex: 'royaltyPending',
              align: 'right',
              render: (v: number) => formatINR(v),
            },
            {
              title: 'Last payout',
              dataIndex: 'lastRoyaltyPayoutDate',
              render: (v: string | null) => formatDate(v, 'None yet'),
            },
            {
              title: 'Platforms',
              dataIndex: 'availableOn',
              render: (v: string[]) => v.map((p) => <Tag key={p}>{p}</Tag>),
            },
          ]}
        />
      </Section>

      <Section title={`Tickets (${tickets.length})`} className="mt-6">
        <AdminTicketTable
          compact
          tickets={tickets}
          emptyText={<EmptyState title="No tickets from this author" />}
        />
      </Section>
    </div>
  );
}
