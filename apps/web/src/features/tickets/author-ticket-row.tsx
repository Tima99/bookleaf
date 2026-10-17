import { Badge } from 'antd';
import Link from 'next/link';
import type { AuthorTicketSummaryDto } from '@bookleaf/contracts';
import { formatDate, formatDateTime } from '@bookleaf/utils';
import { CategoryTag, PriorityTag, StatusTag } from '@/components/ui/tags';

/** One row in the author's ticket list (also used on the dashboard). */
export function AuthorTicketRow({
  ticket,
  compact = false,
}: {
  ticket: AuthorTicketSummaryDto;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/author/tickets/${ticket.id}`}
      className="group flex flex-col gap-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-brand-50/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-subtle">{ticket.reference}</span>
        <StatusTag status={ticket.status} />
        {!compact && <PriorityTag priority={ticket.priority} />}
        {ticket.hasTeamReply && ticket.status !== 'CLOSED' ? (
          <Badge
            status="processing"
            text={<span className="text-xs text-brand-700">Team replied</span>}
          />
        ) : null}
        <span className="ml-auto text-xs text-ink-subtle">
          Updated {formatDateTime(ticket.lastActivityAt)}
        </span>
      </div>
      <p className="font-medium text-ink group-hover:text-brand-800">{ticket.subject}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>{ticket.book ? ticket.book.title : 'General / Account level'}</span>
        {!compact && (
          <>
            <span>
              <CategoryTag category={ticket.category} />
            </span>
            <span>Opened {formatDate(ticket.createdAt)}</span>
          </>
        )}
      </div>
      {!compact && ticket.latestAdminResponse ? (
        <p className="line-clamp-2 border-l-2 border-brand-200 pl-3 text-sm text-ink-muted">
          {ticket.latestAdminResponse.excerpt}
        </p>
      ) : null}
    </Link>
  );
}
