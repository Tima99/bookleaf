'use client';

import { ExclamationCircleFilled, UserOutlined } from '@ant-design/icons';
import { Table, Tooltip, type TableProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AdminTicketSummaryDto } from '@bookleaf/contracts';
import { formatAge, formatDate, formatDateTime, hoursSince } from '@bookleaf/utils';
import { useColumnVisibility } from '@/components/ui/column-visibility';
import { CategoryTag, PriorityTag, SourceBadge, StatusTag } from '@/components/ui/tags';
import { tabFor } from '@/stores/workspace-store';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

const SLA_HOURS = 48;

function isUnresolved(t: AdminTicketSummaryDto) {
  return t.status === 'OPEN' || t.status === 'IN_PROGRESS';
}

/**
 * Ticket table shared by the queue, dashboard and author detail. Rows open a workspace tab.
 * With `columnStorageKey`, a "Columns" dropdown lets the viewer show/hide columns.
 */
export function AdminTicketTable({
  tickets,
  loading,
  compact = false,
  pagination = false,
  onChange,
  emptyText,
  columnStorageKey,
  toolbar,
}: {
  tickets: AdminTicketSummaryDto[];
  loading?: boolean;
  compact?: boolean;
  pagination?: TableProps<AdminTicketSummaryDto>['pagination'];
  onChange?: TableProps<AdminTicketSummaryDto>['onChange'];
  emptyText?: React.ReactNode;
  /** Enables the column chooser and remembers the choice under this key. */
  columnStorageKey?: string;
  /** Extra content shown on the left of the table toolbar (e.g. result count). */
  toolbar?: React.ReactNode;
}) {
  const { openTab } = useWorkspaceNav();

  const columns: ColumnsType<AdminTicketSummaryDto> = [
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, t) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-subtle">{t.reference}</span>
            {t.awaitingTeamReply ? (
              <Tooltip title="Waiting for a reply from the team">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
              </Tooltip>
            ) : null}
          </div>
          <p className="truncate font-medium text-ink">{t.subject}</p>
          <p className="truncate text-xs text-ink-muted">
            {t.author.name}
            {t.book ? ` · ${t.book.title}` : ' · General'}
          </p>
        </div>
      ),
    },
    ...(compact
      ? []
      : ([
          {
            title: 'Author',
            key: 'author',
            render: (_, t) => (
              <div className="text-[13px]">
                <p>{t.author.name}</p>
                <p className="text-xs text-ink-subtle">{t.author.authorCode}</p>
              </div>
            ),
          },
          {
            title: 'Book',
            key: 'book',
            render: (_, t) =>
              t.book ? (
                <span className="text-[13px]">{t.book.title}</span>
              ) : (
                <span className="text-ink-subtle">General</span>
              ),
          },
        ] as ColumnsType<AdminTicketSummaryDto>)),
    {
      title: 'Category',
      key: 'category',
      width: 200,
      responsive: ['md'],
      render: (_, t) =>
        t.triageStatus === 'PENDING' && !t.category ? (
          <span className="text-ink-subtle">Classifying…</span>
        ) : (
          <span className="text-[13px]">
            <CategoryTag category={t.category} />
            <SourceBadge source={t.categorySource} />
          </span>
        ),
    },
    {
      title: 'Priority',
      key: 'priority',
      width: 130,
      render: (_, t) => (
        <span className="whitespace-nowrap">
          <PriorityTag priority={t.priority} />
          {t.prioritySource === 'ADMIN' ? <SourceBadge source="ADMIN" /> : null}
        </span>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, t) => <StatusTag status={t.status} />,
    },
    ...(compact
      ? []
      : ([
          {
            title: 'Assignee',
            key: 'assignee',
            width: 140,
            responsive: ['lg'],
            render: (_, t) =>
              t.assignee ? (
                <span className="inline-flex items-center gap-1 text-[13px]">
                  <UserOutlined className="text-ink-subtle" />
                  {t.assignee.name}
                </span>
              ) : (
                <span className="text-ink-subtle">Unassigned</span>
              ),
          },
        ] as ColumnsType<AdminTicketSummaryDto>)),
    {
      title: 'Age',
      key: 'age',
      width: 90,
      render: (_, t) => {
        const overdue = isUnresolved(t) && hoursSince(t.createdAt) > SLA_HOURS;
        return (
          <Tooltip
            title={`Created ${formatDateTime(t.createdAt)}${overdue ? ` — unresolved for over ${SLA_HOURS}h` : ''}`}
          >
            <span
              className={`inline-flex items-center gap-1 tabular-nums ${overdue ? 'font-semibold text-danger' : 'text-ink-muted'}`}
            >
              {overdue ? <ExclamationCircleFilled /> : null}
              {formatAge(t.createdAt)}
            </span>
          </Tooltip>
        );
      },
    },
    ...(compact
      ? []
      : ([
          {
            title: 'Created',
            key: 'created',
            render: (_, t) => (
              <span className="text-[13px] text-ink-muted">{formatDate(t.createdAt)}</span>
            ),
          },
          {
            title: 'Updated',
            key: 'updated',
            width: 150,
            responsive: ['xl'],
            render: (_, t) => (
              <span className="text-[13px] text-ink-muted">{formatDateTime(t.lastActivityAt)}</span>
            ),
          },
        ] as ColumnsType<AdminTicketSummaryDto>)),
  ];

  const { visibleColumns, columnSettings } = useColumnVisibility(
    columnStorageKey ?? 'admin-tickets-compact',
    columns,
    { locked: ['ticket'], defaultHidden: ['author', 'book', 'created'] },
  );

  const table = (
    <Table<AdminTicketSummaryDto>
      rowKey="id"
      scroll={{ x: 'max-content' }}
      size={compact ? 'small' : 'middle'}
      columns={columnStorageKey ? visibleColumns : columns}
      dataSource={tickets}
      loading={loading}
      pagination={pagination}
      onChange={onChange}
      locale={emptyText ? { emptyText } : undefined}
      rowClassName={(t) =>
        `cursor-pointer ${isUnresolved(t) && t.priority === 'CRITICAL' ? 'row-critical' : ''} ${isUnresolved(t) && t.priority === 'HIGH' ? 'row-high' : ''}`
      }
      onRow={(t) => ({
        onClick: () => openTab(tabFor.ticket(t.id, t.reference)),
        onKeyDown: (e) => {
          if (e.key === 'Enter') openTab(tabFor.ticket(t.id, t.reference));
        },
        tabIndex: 0,
      })}
    />
  );

  if (!columnStorageKey) return table;
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-2.5">
        <div className="text-sm text-ink-muted">{toolbar}</div>
        {columnSettings}
      </div>
      {table}
    </>
  );
}
