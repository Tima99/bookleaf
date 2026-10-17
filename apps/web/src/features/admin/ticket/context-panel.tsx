'use client';

import { Button, Descriptions, Timeline } from 'antd';
import type { AdminTicketDetailDto } from '@bookleaf/contracts';
import { formatDate, formatDateTime, formatINR, formatNumber } from '@bookleaf/utils';
import { Section } from '@/components/ui/primitives';
import { BookStageTag } from '@/components/ui/tags';
import { tabFor } from '@/stores/workspace-store';
import { tokens } from '@/styles/tokens';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

/** Author + book facts the agent needs while replying, and the ticket's audit trail. */
/** Muted, fixed-width labels for the fact lists (antd 6 semantic `styles`). */
const LABEL_STYLES = { label: { color: tokens.color.inkMuted, width: 110 } };

export function ContextPanel({ ticket }: { ticket: AdminTicketDetailDto }) {
  const { openTab } = useWorkspaceNav();
  const a = ticket.authorProfile;
  const b = ticket.bookDetail;

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Author"
        extra={
          <Button
            size="small"
            type="link"
            className="!px-0"
            onClick={() => openTab(tabFor.author(a.id, a.name))}
          >
            Open profile
          </Button>
        }
      >
        <Descriptions
          column={1}
          size="small"
          colon={false}
          styles={LABEL_STYLES}
          items={[
            { key: 'name', label: 'Name', children: a.name },
            { key: 'author-id', label: 'Author ID', children: a.authorCode },
            { key: 'email', label: 'Email', children: <a href={`mailto:${a.email}`}>{a.email}</a> },
            { key: 'phone', label: 'Phone', children: a.phone ?? '—' },
            { key: 'city', label: 'City', children: a.city ?? '—' },
            { key: 'joined', label: 'Joined', children: formatDate(a.joinedDate) },
          ]}
        />
      </Section>

      <Section title="Book">
        {b ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-medium">{b.title}</p>
              <p className="text-xs text-ink-subtle">
                {b.bookCode} · {b.genre}
              </p>
              <div className="mt-1.5">
                <BookStageTag stage={b.stage} productionStage={b.productionStage} />
              </div>
            </div>
            <Descriptions
              column={1}
              size="small"
              colon={false}
              styles={LABEL_STYLES}
              items={[
                {
                  key: 'isbn',
                  label: 'ISBN',
                  children: <span className="font-mono text-xs">{b.isbn ?? '—'}</span>,
                },
                {
                  key: 'published',
                  label: 'Published',
                  children: formatDate(b.publicationDate, 'Not yet'),
                },
                { key: 'mrp', label: 'MRP', children: formatINR(b.mrp) },
                {
                  key: 'copies-sold',
                  label: 'Copies sold',
                  children: formatNumber(b.totalCopiesSold),
                },
                {
                  key: 'royalty-earned',
                  label: 'Royalty earned',
                  children: formatINR(b.totalRoyaltyEarned),
                },
                { key: 'paid', label: 'Paid', children: formatINR(b.royaltyPaid) },
                {
                  key: 'pending',
                  label: 'Pending',
                  children: (
                    <span className={b.royaltyPending > 0 ? 'font-medium text-warning' : ''}>
                      {formatINR(b.royaltyPending)}
                    </span>
                  ),
                },
                {
                  key: 'last-payout',
                  label: 'Last payout',
                  children: formatDate(b.lastRoyaltyPayoutDate, 'None yet'),
                },
                { key: 'print-partner', label: 'Print partner', children: b.printPartner ?? '—' },
                {
                  key: 'available-on',
                  label: 'Available on',
                  children: b.availableOn.length ? b.availableOn.join(', ') : 'Not listed',
                },
              ]}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            General / account-level query — no specific book.
          </p>
        )}
      </Section>

      <Section title="Activity">
        {ticket.activity.length ? (
          <Timeline
            items={ticket.activity.map((e) => ({
              color:
                e.actor.role === 'AUTHOR' ? 'orange' : e.actor.role === 'SYSTEM' ? 'gray' : 'blue',
              content: (
                <div className="text-[13px]">
                  <p>{e.summary}</p>
                  <p className="text-xs text-ink-subtle">{formatDateTime(e.createdAt)}</p>
                </div>
              ),
            }))}
          />
        ) : (
          <p className="text-sm text-ink-muted">No activity yet.</p>
        )}
      </Section>
    </div>
  );
}
