'use client';

import {
  CheckCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Input, Skeleton, Tag, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  TICKET_LIMITS,
  type AdminTicketDetailDto,
  type AiDraftDto,
  type DraftResultDto,
} from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { Section } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api-client';
import { endpoints } from '@/lib/endpoints';

const FAILURE_COPY: Record<string, string> = {
  NOT_CONFIGURED: 'AI drafting is not configured on this server.',
  RATE_LIMITED: 'The AI provider is rate-limiting requests right now.',
  TIMEOUT: 'The AI provider did not respond in time.',
  PROVIDER_ERROR: 'The AI provider returned an error.',
  INVALID_OUTPUT: 'The model returned an unusable draft.',
  CIRCUIT_OPEN: 'AI calls are briefly paused after recent errors.',
};

/**
 * Reply composer with the AI draft.
 *
 * - The draft is requested once when the workspace opens (cached server-side; tab
 *   switches never trigger new model calls). "Regenerate" forces a fresh call.
 * - The draft pre-fills the editor only while the editor is untouched.
 * - Sending asks for confirmation and flags unchecked verification items.
 */
export function ResponseComposer({
  ticket,
  onSent,
  onDirtyChange,
}: {
  ticket: AdminTicketDetailDto;
  onSent: (detail: AdminTicketDetailDto) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { modal, message } = App.useApp();
  // A fresh cached draft (if any) pre-fills the editor on first render.
  const initialDraft = ticket.draft && !ticket.draft.stale ? ticket.draft : null;
  const [text, setText] = useState(() => initialDraft?.body ?? '');
  const [appliedDraft, setAppliedDraft] = useState<AiDraftDto | null>(initialDraft);
  const [checked, setChecked] = useState<string[]>([]);
  const [result, setResult] = useState<DraftResultDto | null>(
    ticket.draft ? { draft: ticket.draft, failure: null, fromCache: true } : null,
  );
  const requested = useRef(false);
  const closed = ticket.status === 'CLOSED';

  const draftMutation = useMutation({
    mutationFn: (force: boolean) => endpoints.admin.draft(ticket.id, force),
    onSuccess: (data) => {
      setResult(data);
      // Pre-fill only while the admin hasn't typed anything of their own.
      if (data.draft && (text.trim() === '' || (appliedDraft && text === appliedDraft.body))) {
        setText(data.draft.body);
        setAppliedDraft(data.draft);
        setChecked([]);
      }
    },
  });
  const requestDraft = draftMutation.mutate;

  // Request a draft once per workspace if none exists or the conversation moved on.
  useEffect(() => {
    if (requested.current || closed) return;
    if (!ticket.draft || ticket.draft.stale || ticket.draft.source === 'TEMPLATE') {
      requested.current = true;
      requestDraft(false);
    }
  }, [ticket.draft, closed, requestDraft]);

  const draft = result?.draft ?? null;
  const aiUnavailable = result?.failure?.kind === 'NOT_CONFIGURED';

  const dirty = text.trim() !== '' && text !== appliedDraft?.body;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const send = useMutation({
    mutationFn: (statusAfter: 'IN_PROGRESS' | 'RESOLVED' | undefined) =>
      endpoints.admin.respond(ticket.id, {
        body: text,
        statusAfter,
        // The server compares the text with this draft to record provenance (edited / unedited).
        draftId: appliedDraft?.id ?? null,
      }),
    onSuccess: (detail) => {
      message.success('Reply sent — the author can see it now.');
      setText('');
      setAppliedDraft(null);
      setResult(null);
      setChecked([]);
      requested.current = true; // don't auto-draft right after replying
      onSent(detail);
    },
  });

  const confirmSend = (statusAfter?: 'IN_PROGRESS' | 'RESOLVED') => {
    const unchecked = (draft?.verificationChecklist ?? []).filter(
      (item) => !checked.includes(item),
    );
    modal.confirm({
      title: statusAfter === 'RESOLVED' ? 'Send reply and mark as resolved?' : 'Send this reply?',
      content: (
        <div className="text-sm">
          <p>{ticket.authorProfile.name} will see this message immediately.</p>
          {appliedDraft && text === appliedDraft.body && appliedDraft.source === 'AI' ? (
            <p className="mt-2 text-warning">You are sending the AI draft without any edits.</p>
          ) : null}
          {unchecked.length ? (
            <div className="mt-2">
              <p className="text-warning">Not yet verified:</p>
              <ul className="list-disc pl-5">
                {unchecked.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ),
      okText: 'Send',
      onOk: () => send.mutateAsync(statusAfter),
    });
  };

  if (closed) {
    return (
      <Section title="Reply">
        <Alert
          type="info"
          showIcon
          title="This ticket is closed. Re-open it (set status to In Progress) to reply."
        />
      </Section>
    );
  }

  return (
    <Section
      title="Reply to author"
      extra={
        <div className="flex gap-2">
          {appliedDraft && text !== appliedDraft.body ? (
            <Tooltip title="Replace the editor text with the draft">
              <Button
                size="small"
                icon={<UndoOutlined />}
                onClick={() => setText(appliedDraft.body)}
              >
                Restore draft
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip
            title={aiUnavailable ? 'AI drafting is not configured on the server' : undefined}
          >
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={draftMutation.isPending}
              disabled={aiUnavailable}
              onClick={() => draftMutation.mutate(true)}
            >
              {draft?.source === 'AI' ? 'Regenerate' : 'Try AI draft'}
            </Button>
          </Tooltip>
        </div>
      }
    >
      {draftMutation.isPending && !draft ? (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm text-brand-700">
            <RobotOutlined /> Drafting a reply from the knowledge base…
          </p>
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        </div>
      ) : null}

      {result?.failure ? (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          title={`${FAILURE_COPY[result.failure.kind] ?? 'AI drafting failed.'} ${draft?.source === 'TEMPLATE' ? 'A policy template was loaded instead — fill in the [bracketed] parts.' : 'Write your reply manually.'}`}
        />
      ) : null}
      {draftMutation.isError ? (
        <Alert className="!mb-3" type="error" showIcon title={errorMessage(draftMutation.error)} />
      ) : null}

      {draft ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Tag color={draft.source === 'AI' ? 'blue' : 'default'} className="!m-0">
            {draft.source === 'AI' ? (
              <>
                <RobotOutlined /> AI draft
              </>
            ) : (
              'Template'
            )}
          </Tag>
          {draft.model ? <span>{draft.model}</span> : null}
          {draft.strategy ? (
            <span>
              · {draft.strategy.name} v{draft.strategy.version}
            </span>
          ) : null}
          <span>· {formatDateTime(draft.generatedAt)}</span>
          {draft.stale ? (
            <Tag color="orange" className="!m-0">
              New messages since this draft
            </Tag>
          ) : null}
          {draft.escalationRecommended ? (
            <Tag color="red" className="!m-0">
              Escalation recommended
            </Tag>
          ) : null}
          {draft.suggestedStatus === 'RESOLVED' ? (
            <Tag color="green" className="!m-0">
              Suggests: resolve
            </Tag>
          ) : null}
          {draft.knowledgeSectionsUsed.length ? (
            <span>· KB: {draft.knowledgeSectionsUsed.join(', ')}</span>
          ) : null}
        </div>
      ) : null}

      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoSize={{ minRows: 8, maxRows: 22 }}
        maxLength={TICKET_LIMITS.messageMax}
        placeholder="Write a reply to the author…"
        aria-label="Reply to author"
      />

      {draft?.verificationChecklist.length ? (
        <div className="mt-3 rounded-lg border border-note-border bg-note p-3">
          <p className="mb-1.5 text-xs font-semibold text-warning">Check before sending</p>
          <Checkbox.Group
            value={checked}
            onChange={(v) => setChecked(v as string[])}
            className="flex flex-col gap-1"
          >
            {draft.verificationChecklist.map((item) => (
              <Checkbox key={item} value={item} className="text-[13px]">
                {item}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>
      ) : null}

      {send.isError ? (
        <Alert className="!mt-3" type="error" showIcon title={errorMessage(send.error)} />
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          icon={<CheckCircleOutlined />}
          disabled={!text.trim()}
          loading={send.isPending && send.variables === 'RESOLVED'}
          onClick={() => confirmSend('RESOLVED')}
        >
          Send &amp; resolve
        </Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          disabled={!text.trim()}
          loading={send.isPending && send.variables !== 'RESOLVED'}
          onClick={() => confirmSend()}
        >
          Send reply
        </Button>
      </div>
    </Section>
  );
}
