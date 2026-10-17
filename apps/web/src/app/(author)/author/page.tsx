'use client';

import { BookOutlined, CalendarOutlined, MessageOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { formatDate, formatINR, formatNumber } from '@bookleaf/utils';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  PageTransition,
  Section,
  StatCard,
} from '@/components/ui/primitives';
import { BookStageTag } from '@/components/ui/tags';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthorTicketRow } from '@/features/tickets/author-ticket-row';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { useLiveStatus } from '@/components/layout/live-context';
import { endpoints, queryKeys } from '@/lib/endpoints';

export default function AuthorDashboardPage() {
  const { user } = useAuth();
  const live = useLiveStatus();
  const dashboard = useQuery({
    queryKey: queryKeys.author.dashboard,
    queryFn: endpoints.author.dashboard,
  });
  const recentQuery = { page: 1, pageSize: 5 };
  const recent = useQuery({
    queryKey: queryKeys.author.tickets(recentQuery),
    queryFn: () => endpoints.tickets.listMine(recentQuery),
    refetchInterval: pollIntervalFor(live),
  });

  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <PageTransition>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your books, royalties and conversations with the BookLeaf team."
        actions={
          <Link href="/author/tickets/new">
            <Button type="primary" icon={<PlusOutlined />}>
              Raise a support query
            </Button>
          </Link>
        }
      />

      {dashboard.isPending ? (
        <LoadingBlock rows={6} />
      ) : dashboard.isError ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total books"
              value={dashboard.data.totals.totalBooks}
              hint={`${dashboard.data.totals.publishedBooks} published · ${dashboard.data.totals.inProductionBooks} in production`}
              icon={<BookOutlined />}
            />
            <StatCard
              label="Copies sold"
              value={formatNumber(dashboard.data.totals.totalCopiesSold)}
              hint="Across all platforms"
            />
            <StatCard
              label="Royalty earned"
              value={formatINR(dashboard.data.totals.totalRoyaltyEarned)}
              tone="brand"
              hint="Lifetime, 80% net-profit share"
            />
            <StatCard
              label="Open tickets"
              value={dashboard.data.totals.openTickets}
              icon={<MessageOutlined />}
              hint="Open or in progress"
            />
            <StatCard
              label="Royalty paid"
              value={formatINR(dashboard.data.totals.royaltyPaid)}
              tone="success"
            />
            <StatCard
              label="Royalty pending"
              value={formatINR(dashboard.data.totals.royaltyPending)}
              tone={dashboard.data.totals.royaltyPending > 0 ? 'warning' : 'default'}
            />
            <StatCard label="Published" value={dashboard.data.totals.publishedBooks} />
            <StatCard label="In production" value={dashboard.data.totals.inProductionBooks} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Section
              title="Recent tickets"
              extra={
                <Link href="/author/tickets" className="text-sm text-brand-700">
                  View all
                </Link>
              }
            >
              {recent.isPending ? (
                <LoadingBlock />
              ) : recent.isError ? (
                <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
              ) : recent.data.items.length === 0 ? (
                <EmptyState
                  title="No support tickets yet"
                  description="Questions about royalties, ISBNs, printing or your book's status? We're here to help."
                  action={
                    <Link href="/author/tickets/new">
                      <Button type="primary">Raise a query</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="-mx-2 flex flex-col">
                  {recent.data.items.map((t) => (
                    <AuthorTicketRow key={t.id} ticket={t} compact />
                  ))}
                </div>
              )}
            </Section>

            <div className="flex flex-col gap-6">
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <CalendarOutlined /> Royalty calendar
                  </span>
                }
              >
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-muted">Current quarter</dt>
                  <dd className="text-right font-medium">
                    {dashboard.data.royaltyCalendar.currentQuarterLabel}
                  </dd>
                  <dt className="text-ink-muted">Last quarter&apos;s payout by</dt>
                  <dd className="text-right font-medium">
                    {formatDate(dashboard.data.royaltyCalendar.previousQuarterPayoutBy)}
                  </dd>
                  <dt className="text-ink-muted">This quarter&apos;s payout by</dt>
                  <dd className="text-right font-medium">
                    {formatDate(dashboard.data.royaltyCalendar.currentQuarterPayoutBy)}
                  </dd>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                  Royalties are calculated quarterly and paid by bank transfer within 45 days of
                  each quarter ending.
                </p>
                {dashboard.data.royaltyCalendar.pendingBelowThreshold ? (
                  <Alert
                    className="mt-3"
                    type="info"
                    showIcon
                    title={`Your pending balance is below the ${formatINR(dashboard.data.royaltyCalendar.payoutThreshold)} payout threshold, so it rolls over to the next quarter.`}
                  />
                ) : null}
              </Section>

              <Section
                title="Your books"
                extra={
                  <Link href="/author/books" className="text-sm text-brand-700">
                    Details
                  </Link>
                }
              >
                {dashboard.data.books.length === 0 ? (
                  <EmptyState title="No books yet" />
                ) : (
                  <ul className="flex flex-col divide-y divide-divider">
                    {dashboard.data.books.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{b.title}</p>
                          <p className="text-xs text-ink-subtle">
                            {b.stage === 'PUBLISHED'
                              ? `${formatINR(b.royaltyPending)} pending`
                              : 'Royalties start once published'}
                          </p>
                        </div>
                        <BookStageTag stage={b.stage} productionStage={b.productionStage} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
