'use client';

import { SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Drawer, Input, Segmented, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useState } from 'react';
import type { BookDto, BookStage } from '@bookleaf/contracts';
import { formatDate, formatINR, formatNumber } from '@bookleaf/utils';
import { EmptyState, ErrorState, PageHeader, PageTransition } from '@/components/ui/primitives';
import { BookStageTag } from '@/components/ui/tags';
import { BookDetails } from '@/features/books/book-details';
import { useColumnVisibility } from '@/components/ui/column-visibility';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { endpoints, queryKeys } from '@/lib/endpoints';

const dash = (v: string | null) =>
  v ?? (
    <Tooltip title="Available once published">
      <span className="text-ink-subtle">—</span>
    </Tooltip>
  );

export default function MyBooksPage() {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<BookStage | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<BookDto | null>(null);
  const debounced = useDebouncedValue(search);

  const query = {
    page,
    pageSize,
    search: debounced || undefined,
    stage: stage === 'ALL' ? undefined : stage,
  };
  const books = useQuery({
    queryKey: queryKeys.author.books(query),
    queryFn: () => endpoints.author.books(query),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<BookDto> = [
    {
      title: 'Title',
      key: 'title',
      fixed: 'left',
      width: 240,
      render: (_, b) => (
        <div>
          <p className="font-medium text-ink">{b.title}</p>
          <p className="text-xs text-ink-subtle">{b.genre}</p>
        </div>
      ),
    },
    {
      title: 'ISBN',
      key: 'isbn',
      dataIndex: 'isbn',
      width: 170,
      render: (v: string | null) => <span className="font-mono text-xs">{v ?? '—'}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 210,
      render: (_, b) => <BookStageTag stage={b.stage} productionStage={b.productionStage} />,
    },
    {
      title: 'Published',
      key: 'publicationDate',
      dataIndex: 'publicationDate',
      width: 120,
      render: (v: string | null) => dash(v ? formatDate(v) : null),
    },
    {
      title: 'MRP',
      key: 'mrp',
      dataIndex: 'mrp',
      width: 90,
      align: 'right',
      render: (v: number | null) => dash(v !== null ? formatINR(v) : null),
    },
    {
      title: 'Copies sold',
      key: 'totalCopiesSold',
      dataIndex: 'totalCopiesSold',
      width: 110,
      align: 'right',
      render: (v: number) => formatNumber(v),
    },
    {
      title: 'Royalty earned',
      key: 'totalRoyaltyEarned',
      dataIndex: 'totalRoyaltyEarned',
      width: 130,
      align: 'right',
      render: (v: number) => formatINR(v),
    },
    {
      title: 'Paid',
      key: 'royaltyPaid',
      dataIndex: 'royaltyPaid',
      width: 110,
      align: 'right',
      render: (v: number) => formatINR(v),
    },
    {
      title: 'Pending',
      key: 'royaltyPending',
      dataIndex: 'royaltyPending',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <span className={v > 0 ? 'font-medium text-warning' : ''}>{formatINR(v)}</span>
      ),
    },
    {
      title: 'Print partner',
      key: 'printPartner',
      dataIndex: 'printPartner',
      width: 130,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Available on',
      key: 'availableOn',
      dataIndex: 'availableOn',
      width: 220,
      render: (v: string[]) =>
        v.length ? (
          <div className="flex flex-wrap gap-1">
            {v.map((p) => (
              <Tag key={p} className="!m-0">
                {p}
              </Tag>
            ))}
          </div>
        ) : (
          <span className="text-ink-subtle">Not listed yet</span>
        ),
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('author-books', columns, {
    locked: ['title'],
  });

  return (
    <PageTransition>
      <PageHeader
        title="My Books"
        description="Publication status, sales and royalties for each of your titles."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-ink-subtle" />}
          placeholder="Search by title, ISBN or genre"
          className="sm:!max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search books"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={stage}
            onChange={(v) => {
              setStage(v as BookStage | 'ALL');
              setPage(1);
            }}
            options={[
              { label: 'All', value: 'ALL' },
              { label: 'Published', value: 'PUBLISHED' },
              { label: 'In production', value: 'IN_PRODUCTION' },
            ]}
          />
          {columnSettings}
        </div>
      </div>

      {books.isError ? (
        <ErrorState error={books.error} onRetry={() => void books.refetch()} />
      ) : (
        <div className="surface-card overflow-hidden">
          <Table<BookDto>
            rowKey="id"
            columns={visibleColumns}
            dataSource={books.data?.items ?? []}
            loading={books.isFetching}
            scroll={{ x: 'max-content' }}
            onRow={(record) => ({
              onClick: () => setSelected(record),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <EmptyState
                  title={
                    debounced || stage !== 'ALL' ? 'No books match your filters' : 'No books yet'
                  }
                  description={
                    debounced || stage !== 'ALL'
                      ? 'Try a different search or filter.'
                      : 'Your published and in-production books will appear here.'
                  }
                />
              ),
            }}
            pagination={{
              current: page,
              pageSize,
              total: books.data?.meta.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              onChange: (p, s) => {
                setPage(p);
                setPageSize(s);
              },
              showTotal: (total) => `${total} book${total === 1 ? '' : 's'}`,
            }}
          />
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        size={480}
        title="Book details"
        extra={
          selected ? (
            <Link href={`/author/tickets/new?book=${selected.bookCode}`}>
              <Button type="primary" size="small">
                Ask about this book
              </Button>
            </Link>
          ) : null
        }
      >
        {selected ? <BookDetails book={selected} /> : null}
      </Drawer>
    </PageTransition>
  );
}
