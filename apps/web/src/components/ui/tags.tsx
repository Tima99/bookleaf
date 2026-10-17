import { Tag, Tooltip } from 'antd';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type ValueSource,
} from '@bookleaf/contracts';

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'blue',
  IN_PROGRESS: 'gold',
  RESOLVED: 'green',
  CLOSED: 'default',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  CRITICAL: 'red',
  HIGH: 'volcano',
  MEDIUM: 'gold',
  LOW: 'default',
};

export function StatusTag({ status }: { status: TicketStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{TICKET_STATUS_LABELS[status]}</Tag>;
}

export function PriorityTag({ priority }: { priority: TicketPriority | null }) {
  if (!priority) return <Tag>Pending</Tag>;
  return <Tag color={PRIORITY_COLORS[priority]}>{TICKET_PRIORITY_LABELS[priority]}</Tag>;
}

export function CategoryTag({ category }: { category: TicketCategory | null }) {
  if (!category) return <span className="text-ink-subtle">Classifying…</span>;
  return <span className="text-ink">{TICKET_CATEGORY_LABELS[category]}</span>;
}

const SOURCE_META: Record<ValueSource, { label: string; className: string; tip: string }> = {
  AI: {
    label: 'AI',
    className: 'bg-brand-50 text-brand-700 border-brand-200',
    tip: 'Suggested by AI',
  },
  RULES: {
    label: 'Auto',
    className: 'bg-surface-muted text-ink-muted border-line',
    tip: 'Set automatically from key words in the ticket (AI was not available)',
  },
  ADMIN: {
    label: 'Edited',
    className: 'bg-accent-50 text-accent-500 border-accent-50',
    tip: 'Changed by a team member — AI will not change it back',
  },
};

/** Small badge showing who set this value: AI, automatic key-word sorting, or a team member. */
export function SourceBadge({ source }: { source: ValueSource | null }) {
  if (!source) return null;
  const meta = SOURCE_META[source];
  return (
    <Tooltip title={meta.tip}>
      <span
        className={`ml-1 inline-flex items-center rounded border px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide ${meta.className}`}
      >
        {meta.label}
      </span>
    </Tooltip>
  );
}

export function BookStageTag({
  stage,
  productionStage,
}: {
  stage: 'PUBLISHED' | 'IN_PRODUCTION';
  productionStage: string | null;
}) {
  return stage === 'PUBLISHED' ? (
    <Tag color="green">Published &amp; Live</Tag>
  ) : (
    <Tag color="processing">In production{productionStage ? ` · ${productionStage}` : ''}</Tag>
  );
}
