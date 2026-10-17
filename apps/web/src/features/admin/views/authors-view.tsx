'use client';

import { SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Input, Table } from 'antd';
import { useState } from 'react';
import type { AdminAuthorListItemDto } from '@bookleaf/contracts';
import { formatDate } from '@bookleaf/utils';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui/primitives';
import type { ColumnsType } from 'antd/es/table';
import { useColumnVisibility } from '@/components/ui/column-visibility';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { tabFor } from '@/stores/workspace-store';
import { tokens } from '@/styles/tokens';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

export function AuthorsView() {
  const { openTab } = useWorkspaceNav();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const query = { page, pageSize: 20, search: debounced || undefined };
  const authors = useQuery({
    queryKey: queryKeys.admin.authors(query),
    queryFn: () => endpoints.admin.authors(query),
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<AdminAuthorListItemDto> = [
    {
      title: 'Author',
      key: 'name',
      render: (_, a) => (
        <div>
          <p className="font-medium">{a.name}</p>
          <p className="text-xs text-ink-subtle">{a.authorCode}</p>
        </div>
      ),
    },
    { title: 'Email', key: 'email', dataIndex: 'email', responsive: ['md'] },
    {
      title: 'City',
      key: 'city',
      dataIndex: 'city',
      responsive: ['lg'],
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Joined',
      key: 'joinedDate',
      dataIndex: 'joinedDate',
      responsive: ['lg'],
      render: (v: string | null) => formatDate(v),
    },
    { title: 'Books', key: 'bookCount', dataIndex: 'bookCount', align: 'right', width: 90 },
    {
      title: 'Open tickets',
      key: 'openTicketCount',
      dataIndex: 'openTicketCount',
      align: 'right',
      width: 120,
      render: (v: number) =>
        v ? (
          <Badge count={v} color={tokens.color.brand[500]} />
        ) : (
          <span className="text-ink-subtle">0</span>
        ),
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('admin-authors', columns, {
    locked: ['name'],
  });

  return (
    <div>
      <PageHeader
        title="Authors"
        description="Everyone publishing with BookLeaf, with their books and open tickets."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-ink-subtle" />}
          placeholder="Search name, email, author ID or city"
          className="sm:!max-w-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search authors"
        />
        {columnSettings}
      </div>
      {authors.isError ? (
        <ErrorState error={authors.error} onRetry={() => void authors.refetch()} />
      ) : (
        <div className="surface-card overflow-hidden">
          <Table<AdminAuthorListItemDto>
            scroll={{ x: 'max-content' }}
            rowKey="id"
            loading={authors.isFetching}
            dataSource={authors.data?.items ?? []}
            onRow={(a) => ({
              onClick: () => openTab(tabFor.author(a.id, a.name)),
              className: 'cursor-pointer',
            })}
            locale={{ emptyText: <EmptyState title="No authors found" /> }}
            pagination={{
              current: page,
              pageSize: 20,
              total: authors.data?.meta.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={visibleColumns}
          />
        </div>
      )}
    </div>
  );
}
