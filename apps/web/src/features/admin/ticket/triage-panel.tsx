'use client';

import { ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Progress, Select, Tag, Tooltip } from 'antd';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type AdminTicketDetailDto,
  type TicketCategory,
  type TicketPriority,
} from '@bookleaf/contracts';
import { Section } from '@/components/ui/primitives';
import { PriorityTag, SourceBadge } from '@/components/ui/tags';
import { tokens } from '@/styles/tokens';

/** Plain-language reason AI couldn't sort the ticket (support staff aren't engineers). */
const AI_UNAVAILABLE_REASON: Record<string, string> = {
  NOT_CONFIGURED: 'AI is switched off',
  RATE_LIMITED: 'AI was busy',
  TIMEOUT: 'AI took too long to respond',
  PROVIDER_ERROR: 'AI ran into a problem',
  INVALID_OUTPUT: 'AI gave an unclear answer',
  CIRCUIT_OPEN: 'AI is paused for a moment after some errors',
};

/** Below this, the AI's own confidence is low enough to ask staff to double-check. */
const LOW_CONFIDENCE = 0.6;

/**
 * The ticket's category and priority, suggested automatically and editable by staff.
 * Changes made here are kept even if AI looks at the ticket again.
 */
export function TriagePanel({
  ticket,
  onOverride,
  onRetriage,
  updating,
  retriaging,
}: {
  ticket: AdminTicketDetailDto;
  onOverride: (patch: { category?: TicketCategory; priority?: TicketPriority }) => void;
  onRetriage: () => void;
  updating: boolean;
  retriaging: boolean;
}) {
  const t = ticket.triage;
  const pending = t.status === 'PENDING';
  const byAi = t.source === 'AI';
  const suggester = byAi ? 'AI suggested' : 'Automatic suggestion';

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <RobotOutlined /> Category &amp; priority
        </span>
      }
      extra={
        <Tooltip title="AI will look at this ticket again. Anything you've changed here stays as you set it.">
          <Button size="small" icon={<ReloadOutlined />} loading={retriaging} onClick={onRetriage}>
            Ask AI again
          </Button>
        </Tooltip>
      }
    >
      {pending ? (
        <Alert className="!mb-3" type="info" showIcon title="AI is reading this ticket…" />
      ) : t.source === 'RULES' ? (
        <Alert
          className="!mb-3"
          type={t.failureKind && t.failureKind !== 'NOT_CONFIGURED' ? 'warning' : 'info'}
          showIcon
          title={`${
            (t.failureKind && AI_UNAVAILABLE_REASON[t.failureKind]) ??
            "AI hasn't reviewed this ticket yet"
          }, so it was sorted automatically from key words in the ticket. Please check the category and priority.`}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="section-title">Category</span>
            <SourceBadge source={ticket.categorySource} />
          </div>
          <Select
            className="w-full"
            value={ticket.category ?? undefined}
            placeholder="Not sorted yet"
            disabled={updating}
            onChange={(category: TicketCategory) => onOverride({ category })}
            options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
            aria-label="Change category"
          />
          {t.category ? (
            <div className="mt-2 flex flex-col gap-1 text-xs text-ink-muted">
              {/* The dropdown shows the current value; only add what it can't show. */}
              {ticket.category !== t.category ? (
                <span>
                  {suggester}: <strong>{TICKET_CATEGORY_LABELS[t.category]}</strong>
                </span>
              ) : null}
              {byAi && t.categoryConfidence !== null ? (
                <Tooltip title="How sure AI is about this category, as reported by AI itself">
                  <Progress
                    percent={Math.round(t.categoryConfidence * 100)}
                    size="small"
                    className="!m-0"
                    strokeColor={
                      t.categoryConfidence < LOW_CONFIDENCE
                        ? tokens.color.warning
                        : tokens.color.brand[500]
                    }
                    format={(v) => `${v}% confidence`}
                    aria-label="Confidence"
                  />
                </Tooltip>
              ) : null}
              {byAi && t.rationale ? <p>{t.rationale}</p> : null}
              {byAi && t.categoryConfidence !== null && t.categoryConfidence < LOW_CONFIDENCE ? (
                <p className="text-warning">
                  AI wasn&apos;t sure about this — please double-check.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="section-title">Priority</span>
            <SourceBadge source={ticket.prioritySource} />
          </div>
          <Select
            className="w-full"
            value={ticket.priority ?? undefined}
            placeholder="Not set yet"
            disabled={updating}
            onChange={(priority: TicketPriority) => onOverride({ priority })}
            options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] }))}
            aria-label="Change priority"
          />
          {t.priority && ticket.priority !== t.priority ? (
            <p className="mt-2 text-xs text-ink-muted">
              {suggester}: <PriorityTag priority={t.priority} />
            </p>
          ) : null}
          {t.escalate ? (
            <Tooltip title="This looks like something the finance or production team should look at soon.">
              <Tag color="red" className="!mt-2">
                Needs a specialist team
              </Tag>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
