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
          labelStyle={{ color: tokens.color.inkMuted, width: 110 }}
        >
          <Descriptions.Item label="Name">{a.name}</Descriptions.Item>
          <Descriptions.Item label="Author ID">{a.authorCode}</Descriptions.Item>
          <Descriptions.Item label="Email">
            <a href={`mailto:${a.email}`}>{a.email}</a>
          </Descriptions.Item>
          <Descriptions.Item label="Phone">{a.phone ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="City">{a.city ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Joined">{formatDate(a.joinedDate)}</Descriptions.Item>
        </Descriptions>
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
              labelStyle={{ color: tokens.color.inkMuted, width: 110 }}
            >
              <Descriptions.Item label="ISBN">
                <span className="font-mono text-xs">{b.isbn ?? '—'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Published">
                {formatDate(b.publicationDate, 'Not yet')}
              </Descriptions.Item>
              <Descriptions.Item label="MRP">{formatINR(b.mrp)}</Descriptions.Item>
              <Descriptions.Item label="Copies sold">
                {formatNumber(b.totalCopiesSold)}
              </Descriptions.Item>
              <Descriptions.Item label="Royalty earned">
                {formatINR(b.totalRoyaltyEarned)}
              </Descriptions.Item>
              <Descriptions.Item label="Paid">{formatINR(b.royaltyPaid)}</Descriptions.Item>
              <Descriptions.Item label="Pending">
                <span className={b.royaltyPending > 0 ? 'font-medium text-warning' : ''}>
                  {formatINR(b.royaltyPending)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Last payout">
                {formatDate(b.lastRoyaltyPayoutDate, 'None yet')}
              </Descriptions.Item>
              <Descriptions.Item label="Print partner">{b.printPartner ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Available on">
                {b.availableOn.length ? b.availableOn.join(', ') : 'Not listed'}
              </Descriptions.Item>
            </Descriptions>
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
