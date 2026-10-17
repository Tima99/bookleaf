'use client';

import { InboxOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Select, Upload, type UploadFile } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { CreateTicketRequestSchema, TICKET_LIMITS } from '@bookleaf/contracts';
import { PageHeader, PageTransition, Section } from '@/components/ui/primitives';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';

const GENERAL = '__general__';

/** Form schema reuses the shared API rules; the book select uses a sentinel for "General". */
const FormSchema = z.object({
  bookId: z.string().min(1, 'Choose a book or "General / Account level"'),
  subject: CreateTicketRequestSchema.shape.subject,
  description: CreateTicketRequestSchema.shape.description,
});
type FormValues = z.infer<typeof FormSchema>;

function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [files, setFiles] = useState<UploadFile[]>([]);

  const booksQuery = { page: 1, pageSize: 100 };
  const books = useQuery({
    queryKey: queryKeys.author.books(booksQuery),
    queryFn: () => endpoints.author.books(booksQuery),
  });

  const { control, handleSubmit, setError, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { bookId: params.get('book') ?? '', subject: '', description: '' },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      endpoints.tickets.create({
        bookId: values.bookId === GENERAL ? null : values.bookId,
        subject: values.subject,
        description: values.description,
      }),
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.author.all });
      message.success(`Ticket ${ticket.reference} created — we'll get back to you soon.`);
      router.push(`/author/tickets/${ticket.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        for (const d of err.details) {
          if (d.path === 'subject' || d.path === 'description' || d.path === 'bookId')
            setError(d.path, { message: d.message });
        }
      }
    },
  });

  // The production-stage notice uses the book's real status — no guessing from text.
  const watchedBook = useWatch({ control, name: 'bookId' });
  const selectedBook = books.data?.items.find((b) => b.bookCode === watchedBook);

  return (
    <PageTransition>
      <PageHeader
        title="Raise a support query"
        description="Tell us what's happening — the more detail, the faster we can help."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Section>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
            <Form layout="vertical" component={false}>
              <Controller
                name="bookId"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={field.name}
                    label="Which book is this about?"
                    required
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Select
                      {...field}
                      id={field.name}
                      loading={books.isPending}
                      placeholder="Select a book"
                      options={[
                        { label: 'General / Account level', value: GENERAL },
                        ...(books.data?.items ?? []).map((b) => ({
                          label: `${b.title}${b.stage === 'IN_PRODUCTION' ? ' (in production)' : ''}`,
                          value: b.bookCode,
                        })),
                      ]}
                    />
                  </Form.Item>
                )}
              />
              {selectedBook?.stage === 'IN_PRODUCTION' ? (
                <Alert
                  className="!mb-4"
                  type="info"
                  showIcon
                  title={`"${selectedBook.title}" is currently at the ${selectedBook.productionStage ?? 'production'} stage.`}
                />
              ) : null}
              <Controller
                name="subject"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={field.name}
                    label="Subject"
                    required
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={fieldState.error?.message}
                  >
                    <Input
                      {...field}
                      id={field.name}
                      maxLength={TICKET_LIMITS.subjectMax}
                      showCount
                      placeholder="e.g. Royalty for last quarter not received"
                    />
                  </Form.Item>
                )}
              />
              <Controller
                name="description"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={field.name}
                    label="Describe the issue"
                    required
                    validateStatus={fieldState.error ? 'error' : ''}
                    help={
                      fieldState.error?.message ??
                      'Include dates, platforms, order numbers or amounts if relevant.'
                    }
                  >
                    <Input.TextArea
                      {...field}
                      id={field.name}
                      rows={7}
                      maxLength={TICKET_LIMITS.descriptionMax}
                      showCount
                    />
                  </Form.Item>
                )}
              />
              <Form.Item label="Attachments (optional)">
                <Upload.Dragger
                  multiple
                  fileList={files}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => setFiles(fileList.slice(-3))}
                  accept="image/*,.pdf"
                >
                  <p className="text-2xl text-ink-subtle">
                    <InboxOutlined />
                  </p>
                  <p className="text-sm">Click or drag screenshots / photos here</p>
                </Upload.Dragger>
                <p className="mt-2 text-xs text-ink-subtle">
                  File upload isn&apos;t enabled yet — attachments are <strong>not sent</strong>{' '}
                  with your ticket. If we need photos, our team will ask you to share them.
                </p>
              </Form.Item>

              {create.isError &&
              !(create.error instanceof ApiClientError && create.error.details.length) ? (
                <Alert className="!mb-4" type="error" showIcon title={errorMessage(create.error)} />
              ) : null}

              <div className="flex justify-end gap-2">
                <Button onClick={() => router.back()} disabled={create.isPending}>
                  Cancel
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={create.isPending || formState.isSubmitting}
                  disabled={create.isSuccess}
                >
                  Submit ticket
                </Button>
              </div>
            </Form>
          </form>
        </Section>

        <aside className="flex flex-col gap-4">
          <Section title="What happens next">
            <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm text-ink-muted">
              <li>Your ticket is categorised and prioritised automatically.</li>
              <li>A BookLeaf support specialist reviews it and replies here.</li>
              <li>You&apos;ll see replies instantly on the ticket page — no refresh needed.</li>
            </ol>
          </Section>
        </aside>
      </div>
    </PageTransition>
  );
}

export default function NewTicketPage() {
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}
