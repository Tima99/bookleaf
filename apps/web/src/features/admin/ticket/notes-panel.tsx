'use client';

import { LockOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Input } from 'antd';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  CreateNoteRequestSchema,
  TICKET_LIMITS,
  type AdminTicketDetailDto,
  type CreateNoteRequest,
} from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { errorMessage } from '@/lib/api-client';
import { endpoints } from '@/lib/endpoints';

/** Internal notes — visually distinct (amber, lock icon) and never shown to authors. */
export function NotesPanel({
  ticket,
  onSaved,
  onDirtyChange,
}: {
  ticket: AdminTicketDetailDto;
  onSaved: (detail: AdminTicketDetailDto) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { control, handleSubmit, reset } = useForm<CreateNoteRequest>({
    resolver: zodResolver(CreateNoteRequestSchema),
    defaultValues: { body: '' },
  });
  const body = useWatch({ control, name: 'body' });
  useEffect(() => onDirtyChange(body.trim() !== ''), [body, onDirtyChange]);

  const add = useMutation({
    mutationFn: (values: CreateNoteRequest) => endpoints.admin.addNote(ticket.id, values.body),
    onSuccess: (detail) => {
      reset({ body: '' });
      onSaved(detail);
    },
  });

  return (
    <section className="rounded-[12px] border border-note-border bg-note p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <LockOutlined /> Internal notes
      </h2>
      <p className="mb-4 text-xs text-ink-muted">
        Only visible to the BookLeaf team — never shown to the author.
      </p>

      {ticket.internalNotes.length ? (
        <ul className="mb-4 flex flex-col gap-3">
          {ticket.internalNotes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-note-border/70 bg-surface/70 px-3 py-2"
            >
              <p className="mb-1 text-xs text-ink-subtle">
                <span className="font-medium text-ink">{n.author.name}</span> ·{' '}
                {formatDateTime(n.createdAt)}
              </p>
              <p className="prose-message text-[13px]">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handleSubmit((v) => add.mutate(v))} noValidate>
        <Controller
          name="body"
          control={control}
          render={({ field, fieldState }) => (
            <>
              <Input.TextArea
                {...field}
                rows={2}
                maxLength={TICKET_LIMITS.noteMax}
                placeholder="Add a note for the team…"
                aria-label="Internal note"
                status={fieldState.error ? 'error' : ''}
              />
              {fieldState.error ? (
                <p className="mt-1 text-xs text-danger">{fieldState.error.message}</p>
              ) : null}
            </>
          )}
        />
        {add.isError ? (
          <Alert className="!mt-2" type="error" showIcon title={errorMessage(add.error)} />
        ) : null}
        <div className="mt-2 flex justify-end">
          <Button htmlType="submit" size="small" loading={add.isPending} disabled={!body.trim()}>
            Add internal note
          </Button>
        </div>
      </form>
    </section>
  );
}
