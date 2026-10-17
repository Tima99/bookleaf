'use client';

import { UserAddOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Select, Tooltip } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import {
  TICKET_STATUS_LABELS,
  type AdminTicketDetailDto,
  type TicketStatus,
  type UpdateTicketRequest,
} from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { useLiveStatus } from '@/components/layout/live-context';
import { ErrorState, LoadingBlock, Section } from '@/components/ui/primitives';
import { CategoryTag, PriorityTag, StatusTag } from '@/components/ui/tags';
import { useAuth } from '@/features/auth/auth-provider';
import { Conversation } from '@/features/tickets/conversation';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { useWorkspace } from '@/stores/workspace-store';
import { ContextPanel } from '../ticket/context-panel';
import { NotesPanel } from '../ticket/notes-panel';
import { ResponseComposer } from '../ticket/response-composer';
import { TriagePanel } from '../ticket/triage-panel';

/** Full ticket workspace (one per ticket tab; kept mounted while the tab is open). */
export function TicketWorkspaceView({ ticketId, tabId }: { ticketId: string; tabId: string }) {
  const { user } = useAuth();
  const live = useLiveStatus();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const setTitle = useWorkspace((s) => s.setTitle);
  const setDirty = useWorkspace((s) => s.setDirty);
  const dirtyParts = useRef({ reply: false, note: false });

  const ticket = useQuery({
    queryKey: queryKeys.admin.ticket(ticketId),
    queryFn: () => endpoints.admin.ticket(ticketId),
    refetchInterval: pollIntervalFor(live),
  });

  useEffect(() => {
    if (ticket.data)
      setTitle(tabId, `${ticket.data.reference} · ${ticket.data.author.name.split(' ')[0]}`);
  }, [ticket.data, tabId, setTitle]);

  const updateDirty = useCallback(
    (part: 'reply' | 'note', value: boolean) => {
      dirtyParts.current[part] = value;
      setDirty(tabId, dirtyParts.current.reply || dirtyParts.current.note);
    },
    [setDirty, tabId],
  );
  const onReplyDirty = useCallback((v: boolean) => updateDirty('reply', v), [updateDirty]);
  const onNoteDirty = useCallback((v: boolean) => updateDirty('note', v), [updateDirty]);

  const applyDetail = useCallback(
    (detail: AdminTicketDetailDto) => {
      queryClient.setQueryData(queryKeys.admin.ticket(ticketId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ticketsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard });
    },
    [queryClient, ticketId],
  );

  const update = useMutation({
    mutationFn: (patch: UpdateTicketRequest) => endpoints.admin.updateTicket(ticketId, patch),
    onSuccess: (detail) => {
      applyDetail(detail);
      message.success('Ticket updated');
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => endpoints.admin.assign(ticketId, assigneeId),
    onSuccess: applyDetail,
    onError: (err) => message.error(errorMessage(err)),
  });
  const retriage = useMutation({
    mutationFn: () => endpoints.admin.retriage(ticketId),
    onSuccess: (detail) => {
      applyDetail(detail);
      message.success(
        detail.triage.source === 'AI'
          ? 'Re-classified by AI'
          : 'AI unavailable — kept rule-based classification',
      );
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  if (ticket.isPending) return <LoadingBlock rows={10} />;
  if (ticket.isError)
    return <ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} />;
  const t = ticket.data;
  const mine = t.assignee?.id === user?.id;

  const statusOptions = [t.status, ...t.allowedTransitions].map((s: TicketStatus) => ({
    value: s,
    label: TICKET_STATUS_LABELS[s],
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-subtle">
            {t.reference} · opened {formatDateTime(t.createdAt)} · last activity{' '}
            {formatDateTime(t.lastActivityAt)}
          </p>
          <h1 className="page-title mt-1">{t.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusTag status={t.status} />
            <PriorityTag priority={t.priority} />
            <CategoryTag category={t.category} />
            {t.awaitingTeamReply ? (
              <span className="text-xs font-medium text-brand-700">· Awaiting our reply</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={t.status}
            options={statusOptions}
            onChange={(status: TicketStatus) => update.mutate({ status })}
            loading={update.isPending && !!update.variables?.status}
            className="min-w-40"
            aria-label="Ticket status"
          />
          {mine ? (
            <Tooltip title="Unassign yourself">
              <Button
                icon={<UserDeleteOutlined />}
                loading={assign.isPending}
                onClick={() => assign.mutate(null)}
              >
                Assigned to you
              </Button>
            </Tooltip>
          ) : (
            <Button
              type={t.assignee ? 'default' : 'primary'}
              icon={<UserAddOutlined />}
              loading={assign.isPending}
              onClick={() => user && assign.mutate(user.id)}
            >
              {t.assignee ? `Take over from ${t.assignee.name.split(' ')[0]}` : 'Assign to me'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Conversation">
            <Conversation
              perspective="ADMIN"
              opening={{
                authorName: t.authorProfile.name,
                body: t.description,
                createdAt: t.createdAt,
              }}
              messages={t.messages}
            />
          </Section>
          <ResponseComposer ticket={t} onSent={applyDetail} onDirtyChange={onReplyDirty} />
          <NotesPanel ticket={t} onSaved={applyDetail} onDirtyChange={onNoteDirty} />
        </div>
        <div className="flex flex-col gap-6">
          <TriagePanel
            ticket={t}
            onOverride={(patch) => update.mutate(patch)}
            onRetriage={() => retriage.mutate()}
            updating={update.isPending}
            retriaging={retriage.isPending}
          />
          <ContextPanel ticket={t} />
        </div>
      </div>
    </div>
  );
}
