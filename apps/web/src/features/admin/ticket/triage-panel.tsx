'use client';

import { ReloadOutlined, RobotOutlined, WarningOutlined } from '@ant-design/icons';
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
import { formatDateTime } from '@bookleaf/utils';
import { Section } from '@/components/ui/primitives';
import { PriorityTag, SourceBadge } from '@/components/ui/tags';
import { tokens } from '@/styles/tokens';

const FAILURE_TEXT: Record<string, string> = {
  NOT_CONFIGURED: 'AI is not configured — classified with keyword rules.',
  RATE_LIMITED: 'The AI provider was rate-limiting — classified with keyword rules.',
  TIMEOUT: 'The AI provider timed out — classified with keyword rules.',
  PROVIDER_ERROR: 'The AI provider returned an error — classified with keyword rules.',
  INVALID_OUTPUT: 'The model returned invalid output — classified with keyword rules.',
  CIRCUIT_OPEN: 'AI calls are paused after recent errors — classified with keyword rules.',
};

/**
 * AI classification + priority with provenance. Overrides are explicit admin decisions
 * (source "Admin") that later AI runs never overwrite; the model's own opinion stays
 * visible for comparison.
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

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <RobotOutlined /> AI triage
        </span>
      }
      extra={
        <Tooltip title="Re-run classification and priority scoring (admin overrides are kept)">
          <Button size="small" icon={<ReloadOutlined />} loading={retriaging} onClick={onRetriage}>
            Re-run
          </Button>
        </Tooltip>
      }
    >
      {pending ? (
        <Alert type="info" showIcon title="Classifying this ticket…" />
      ) : t.source === 'RULES' && t.failureKind ? (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={FAILURE_TEXT[t.failureKind] ?? 'Classified with keyword rules.'}
        />
      ) : t.source === 'RULES' ? (
        <Alert
          className="!mb-3"
          type="info"
          showIcon
          title={t.failureMessage ?? 'Classified with keyword rules.'}
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
            placeholder="Not classified yet"
            disabled={updating}
            onChange={(category: TicketCategory) => onOverride({ category })}
            options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
            aria-label="Override category"
          />
          {t.category ? (
            <div className="mt-2 text-xs text-ink-muted">
              <div className="flex flex-col gap-1">
                <span>
                  {t.source === 'AI' ? 'Model' : 'Rules'} suggested{' '}
                  <strong>{TICKET_CATEGORY_LABELS[t.category]}</strong>
                </span>
                {t.categoryConfidence !== null ? (
                  <Tooltip title="Self-reported confidence (not a calibrated probability)">
                    <Progress
                      percent={Math.round(t.categoryConfidence * 100)}
                      size="small"
                      className="!m-0 max-w-48"
                      strokeColor={tokens.color.brand[500]}
                      format={(v) => `${v}% confidence`}
                    />
                  </Tooltip>
                ) : null}
              </div>
              {t.rationale ? <p className="mt-1">{t.rationale}</p> : null}
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
            placeholder="Not scored yet"
            disabled={updating}
            onChange={(priority: TicketPriority) => onOverride({ priority })}
            options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] }))}
            aria-label="Override priority"
          />
          {t.priority ? (
            <div className="mt-2 text-xs text-ink-muted">
              <span>
                Suggested <PriorityTag priority={t.priority} />
              </span>
              {t.priorityRationale ? <p className="mt-1">{t.priorityRationale}</p> : null}
              {t.rulesApplied.length ? (
                <ul className="mt-1 list-disc pl-4">
                  {t.rulesApplied.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {t.escalate ? (
            <Tag color="red" className="!mt-2">
              Escalation suggested
            </Tag>
          ) : null}
        </div>

        {!pending ? (
          <div className="border-t border-divider pt-3 text-[11px] leading-relaxed text-ink-subtle">
            {t.model ? <p>Model: {t.model}</p> : null}
            {t.strategyVersions.map((s) => (
              <p key={`${s.strategyId}-${s.version}`}>
                Strategy: {s.name} · v{s.version}
              </p>
            ))}
            {t.completedAt ? (
              <p>
                Triaged {formatDateTime(t.completedAt)} · attempt {t.attempts}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
