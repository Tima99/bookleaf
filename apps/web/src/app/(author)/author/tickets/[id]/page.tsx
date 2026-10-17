'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Steps } from 'antd';
import Link from 'next/link';
import { use } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  CreateMessageRequestSchema,
  TICKET_LIMITS,
  type CreateMessageRequest,
  type TicketStatus,
} from '@bookleaf/contracts';
import { formatDate } from '@bookleaf/utils';
import { useLiveStatus } from '@/components/layout/live-context';
import { LiveIndicator } from '@/components/ui/live-indicator';
import { ErrorState, LoadingBlock, PageTransition, Section } from '@/components/ui/primitives';
import { CategoryTag, PriorityTag, StatusTag } from '@/components/ui/tags';
import { useAuth } from '@/features/auth/auth-provider';
import { Conversation } from '@/features/tickets/conversation';
import { pollIntervalFor } from '@/hooks/use-ticket-events';
import { errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';

const STEP_INDEX: Record<TicketStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 3,
};

export default function AuthorTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const live = useLiveStatus();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const ticket = useQuery({
    queryKey: queryKeys.author.ticket(id),
    queryFn: () => endpoints.tickets.getMine(id),
    refetchInterval: pollIntervalFor(live),
  });

  const { control, handleSubmit, reset } = useForm<CreateMessageRequest>({
    resolver: zodResolver(CreateMessageRequestSchema),
    defaultValues: { body: '' },
  });

  const reply = useMutation({
    mutationFn: (values: CreateMessageRequest) => endpoints.tickets.reply(id, values.body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.author.ticket(id), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.author.ticketsAll });
      reset({ body: '' });
      message.success('Message sent');
    },
  });

  if (ticket.isPending) return <LoadingBlock rows={8} />;
  if (ticket.isError)
    return <ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} />;
  const t = ticket.data;

  return (
    <PageTransition>
      <Link
        href="/author/tickets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm !text-ink-muted hover:!text-brand-800"
      >
        <ArrowLeftOutlined /> All tickets
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs text-ink-subtle">{t.reference}</p>
          <h1 className="page-title">{t.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <StatusTag status={t.status} />
            <PriorityTag priority={t.priority} />
            <span>·</span>
            <CategoryTag category={t.category} />
            <span>·</span>
            <span>{t.book ? t.book.title : 'General / Account level'}</span>
            <span>·</span>
            <span>Opened {formatDate(t.createdAt)}</span>
          </div>
        </div>
        <LiveIndicator status={live} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-6">
          <Section>
            <Conversation
              perspective="AUTHOR"
              opening={{
                authorName: user?.name ?? 'You',
                body: t.description,
                createdAt: t.createdAt,
              }}
              messages={t.messages}
            />
            {t.messages.length === 0 ? (
              <p className="mt-6 rounded-lg bg-surface-muted px-4 py-3 text-sm text-ink-muted">
                Thanks for reaching out — a BookLeaf specialist will reply here. You&apos;ll see the
                response as soon as it&apos;s sent.
              </p>
            ) : null}
          </Section>

          {t.canReply ? (
            <Section
              title={
                t.status === 'RESOLVED'
                  ? 'Still need help? Reply to re-open this ticket'
                  : 'Add a reply'
              }
            >
              <form onSubmit={handleSubmit((v) => reply.mutate(v))} noValidate>
                <Controller
                  name="body"
                  control={control}
                  render={({ field, fieldState }) => (
                    <div>
                      <Input.TextArea
                        {...field}
                        rows={4}
                        maxLength={TICKET_LIMITS.messageMax}
                        placeholder="Write your message…"
                        status={fieldState.error ? 'error' : ''}
                        aria-label="Reply"
                      />
                      {fieldState.error ? (
                        <p className="mt-1 text-sm text-danger">{fieldState.error.message}</p>
                      ) : null}
                    </div>
                  )}
                />
                {reply.isError ? (
                  <Alert
                    className="!mt-3"
                    type="error"
                    showIcon
                    title={errorMessage(reply.error)}
                  />
                ) : null}
                <div className="mt-3 flex justify-end">
                  <Button type="primary" htmlType="submit" loading={reply.isPending}>
                    Send
                  </Button>
                </div>
              </form>
            </Section>
          ) : (
            <Alert
              type="info"
              showIcon
              title="This ticket is closed."
              description={
                <Link href="/author/tickets/new" className="text-brand-700">
                  Open a new ticket
                </Link>
              }
            />
          )}
        </div>

        <aside>
          <Section title="Progress">
            <Steps
              orientation="vertical"
              size="small"
              current={STEP_INDEX[t.status]}
              items={[
                { title: 'Received', content: 'Your query reached our team' },
                { title: 'In progress', content: 'A specialist is working on it' },
                { title: 'Resolved', content: 'Reply to re-open if needed' },
                { title: 'Closed' },
              ]}
            />
          </Section>
        </aside>
      </div>
    </PageTransition>
  );
}
