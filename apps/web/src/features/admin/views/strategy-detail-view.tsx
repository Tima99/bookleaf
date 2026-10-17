'use client';

import {
  DeleteOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import {
  AI_PROVIDERS,
  AiStrategyConfigSchema,
  STRATEGY_LIMITS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type AiStrategyDto,
  type AiStrategyVersionDto,
  type StrategyTestResultDto,
} from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { ErrorState, LoadingBlock, PageHeader, Section } from '@/components/ui/primitives';
import { PriorityTag } from '@/components/ui/tags';
import { errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { useWorkspace } from '@/stores/workspace-store';
import { AI_PROBLEM, HISTORY_OPTIONS, REPLY_LENGTHS, SETTING_KIND } from '../ai/plain-language';

/*
 * AI setting editor for non-technical staff.
 * The default view only shows plain-language choices; the underlying AI instructions,
 * model and limits are kept in a collapsed "Advanced" section for technical admins.
 */

const FormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Give it a name of at least 3 characters')
    .max(STRATEGY_LIMITS.nameMax),
  purpose: z.string().trim().max(STRATEGY_LIMITS.purposeMax),
  config: AiStrategyConfigSchema,
  changeNote: z.string().trim().max(STRATEGY_LIMITS.changeNoteMax),
});
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

function toFormValues(s: AiStrategyDto): FormInput {
  return { name: s.name, purpose: s.purpose, config: s.config, changeNote: '' };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="-mt-2 mb-4 text-sm text-ink-muted">{children}</p>;
}

/* --------------------------- "always urgent" rules --------------------------- */

function UrgencyRulesEditor({
  control,
  idPrefix,
  title,
}: {
  control: Control<FormInput>;
  idPrefix: string;
  title: string;
}) {
  const rules = useFieldArray({ control, name: 'config.floorRules' });
  return (
    <Section
      title={title}
      extra={
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => rules.append({ label: '', keywords: [], minimumPriority: 'HIGH' })}
        >
          Add a rule
        </Button>
      }
    >
      <Help>
        A simple safety net: if a ticket mentions any of the words, it is never less urgent than the
        level you choose — even if AI thinks otherwise.
      </Help>
      <div className="flex flex-col gap-3">
        {rules.fields.length === 0 ? (
          <p className="text-sm text-ink-subtle">No rules yet.</p>
        ) : null}
        {rules.fields.map((f, index) => (
          <div key={f.id} className="rounded-lg border border-line bg-surface-muted p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Controller
                name={`config.floorRules.${index}.label`}
                control={control}
                render={({ field, fieldState }) => (
                  <label className="text-sm" htmlFor={`${idPrefix}-rule-${index}-label`}>
                    Rule name
                    <Input
                      {...field}
                      id={`${idPrefix}-rule-${index}-label`}
                      className="mt-1"
                      placeholder="e.g. Wrong ISBN"
                      status={fieldState.error ? 'error' : ''}
                    />
                    <FieldError
                      message={fieldState.error ? 'Please give the rule a name' : undefined}
                    />
                  </label>
                )}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => rules.remove(index)}
                className="self-end"
              >
                Remove
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr]">
              <Controller
                name={`config.floorRules.${index}.keywords`}
                control={control}
                render={({ field, fieldState }) => (
                  <label className="text-sm" htmlFor={`${idPrefix}-rule-${index}-words`}>
                    If the ticket mentions any of these words
                    <Select
                      {...field}
                      id={`${idPrefix}-rule-${index}-words`}
                      mode="tags"
                      className="mt-1 w-full"
                      placeholder="Type a word and press Enter"
                      tokenSeparators={[',']}
                      status={fieldState.error ? 'error' : ''}
                    />
                    <FieldError message={fieldState.error ? 'Add at least one word' : undefined} />
                  </label>
                )}
              />
              <Controller
                name={`config.floorRules.${index}.minimumPriority`}
                control={control}
                render={({ field }) => (
                  <label className="text-sm" htmlFor={`${idPrefix}-rule-${index}-min`}>
                    …make it at least
                    <Select
                      {...field}
                      id={`${idPrefix}-rule-${index}-min`}
                      className="mt-1 w-full"
                      options={TICKET_PRIORITIES.map((p) => ({
                        value: p,
                        label: TICKET_PRIORITY_LABELS[p],
                      }))}
                    />
                  </label>
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------- editor --------------------------------- */

function SettingEditor({ strategy, tabId }: { strategy: AiStrategyDto; tabId: string }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const setDirty = useWorkspace((s) => s.setDirty);
  const id = (field: string) => `${strategy.id}-${field}`;
  const kb = useQuery({
    queryKey: queryKeys.ai.knowledgeBase,
    queryFn: endpoints.ai.knowledgeBase,
    staleTime: Infinity,
  });
  const { control, handleSubmit, reset, formState } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(FormSchema),
    defaultValues: toFormValues(strategy),
  });

  useEffect(() => setDirty(tabId, formState.isDirty), [formState.isDirty, setDirty, tabId]);

  const save = useMutation({
    mutationFn: (values: FormOutput) =>
      endpoints.ai.update(strategy.id, {
        name: values.name,
        purpose: values.purpose,
        config: values.config,
        changeNote: values.changeNote || undefined,
        activate: true,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ai.strategy(strategy.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.strategies });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.versions(strategy.id) });
      reset(toFormValues(updated));
      message.success('Saved. AI will use your changes for new tickets.');
    },
  });

  const isResponse = strategy.kind === 'RESPONSE';
  const isPriority = strategy.kind === 'PRIORITY';
  const isSorting = strategy.kind === 'CLASSIFICATION';
  const categoryName = strategy.category ? TICKET_CATEGORY_LABELS[strategy.category] : '';
  const policyOptions = (kb.data ?? [])
    .filter((k) => k.id !== 'communication-tone')
    .map((k) => ({ value: k.id, label: k.title }));

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <Form layout="vertical" component={false}>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* ------------------------- Writing replies ------------------------- */}
            {isResponse ? (
              <>
                <Section title={`What should AI keep in mind for ${categoryName} replies?`}>
                  <Help>
                    Write in plain English — one point per line works well. For example: “Always
                    give the exact payout date.” Your team still reviews every draft before it is
                    sent.
                  </Help>
                  <Controller
                    name="config.categoryInstructions"
                    control={control}
                    render={({ field }) => (
                      <Input.TextArea
                        {...field}
                        id={id('instructions')}
                        aria-label="Points for AI to keep in mind"
                        autoSize={{ minRows: 6, maxRows: 18 }}
                        maxLength={STRATEGY_LIMITS.categoryInstructionsMax}
                        showCount
                      />
                    )}
                  />
                </Section>

                <Section title="Tone of voice">
                  <Help>How the replies should sound to authors.</Help>
                  <Controller
                    name="config.tone"
                    control={control}
                    render={({ field }) => (
                      <Input.TextArea
                        {...field}
                        id={id('tone')}
                        aria-label="Tone of voice"
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        maxLength={STRATEGY_LIMITS.toneMax}
                      />
                    )}
                  />
                </Section>

                <Section title="Company policies AI should follow">
                  <Help>
                    AI always reads the policies you tick. It may also read another policy if the
                    author’s question is clearly about it. BookLeaf’s tone guidelines are always
                    included.
                  </Help>
                  <Controller
                    name="config.knowledgeSections"
                    control={control}
                    render={({ field }) => (
                      <Checkbox.Group
                        value={field.value ?? []}
                        onChange={(v) => field.onChange(v)}
                        options={policyOptions}
                        className="flex flex-col gap-2"
                      />
                    )}
                  />
                </Section>

                <Section title="Reply options">
                  <div className="flex flex-col gap-5">
                    <Controller
                      name="config.maxOutputTokens"
                      control={control}
                      render={({ field }) => {
                        const preset = REPLY_LENGTHS.some((r) => r.value === field.value);
                        return (
                          <div>
                            <p className="mb-1 text-sm font-medium">Reply length</p>
                            <Segmented
                              value={field.value}
                              onChange={(v) => field.onChange(Number(v))}
                              options={[
                                ...REPLY_LENGTHS.map((r) => ({ value: r.value, label: r.label })),
                                ...(preset || field.value === undefined
                                  ? []
                                  : [{ value: field.value, label: 'Custom' }]),
                              ]}
                            />
                          </div>
                        );
                      }}
                    />
                    <Controller
                      name="config.maxHistoryMessages"
                      control={control}
                      render={({ field }) => (
                        <label className="text-sm font-medium" htmlFor={id('history')}>
                          How much of the conversation AI reads
                          <Select
                            id={id('history')}
                            className="mt-1 !block w-full max-w-sm"
                            value={field.value}
                            onChange={field.onChange}
                            options={[
                              ...HISTORY_OPTIONS.map((h) => ({ value: h.value, label: h.label })),
                              ...(HISTORY_OPTIONS.some((h) => h.value === field.value) ||
                              field.value === undefined
                                ? []
                                : [
                                    {
                                      value: field.value,
                                      label: `The last ${field.value} messages`,
                                    },
                                  ]),
                            ]}
                          />
                        </label>
                      )}
                    />
                    <Controller
                      name="config.includeExamples"
                      control={control}
                      render={({ field }) => (
                        <label className="flex items-start gap-3 text-sm" htmlFor={id('examples')}>
                          <Switch
                            id={id('examples')}
                            checked={field.value}
                            onChange={field.onChange}
                          />
                          <span>
                            <span className="font-medium">
                              Use BookLeaf’s example answer as a guide
                            </span>
                            <span className="block text-ink-muted">
                              Shows AI how a similar question was answered well, so drafts match
                              your style.
                            </span>
                          </span>
                        </label>
                      )}
                    />
                  </div>
                </Section>
              </>
            ) : null}

            {/* ------------------------- Setting urgency ------------------------- */}
            {isPriority ? (
              <>
                <Section title={`When are ${categoryName} tickets urgent?`}>
                  <Help>
                    Describe it in plain words, one per line. For example: “No royalty for 6 months
                    or more → High”. AI uses these as guidance.
                  </Help>
                  <Controller
                    name="config.priorityRules"
                    control={control}
                    render={({ field, fieldState }) => (
                      <>
                        <Input.TextArea
                          id={id('urgency-guidance')}
                          aria-label="Urgency guidance"
                          value={(field.value ?? []).join('\n')}
                          onChange={(e) => field.onChange(e.target.value.split('\n'))}
                          onBlur={() =>
                            field.onChange((field.value ?? []).map((r) => r.trim()).filter(Boolean))
                          }
                          autoSize={{ minRows: 4, maxRows: 14 }}
                        />
                        <FieldError
                          message={
                            fieldState.error ? 'Each line should be a short sentence.' : undefined
                          }
                        />
                      </>
                    )}
                  />
                </Section>
                <UrgencyRulesEditor
                  control={control}
                  idPrefix={strategy.id}
                  title="Always at least this urgent when…"
                />
              </>
            ) : null}

            {/* ------------------------- Sorting tickets ------------------------- */}
            {isSorting ? (
              <>
                <UrgencyRulesEditor
                  control={control}
                  idPrefix={strategy.id}
                  title="For any category: always at least this urgent when…"
                />
                <Section title="Anything else AI should know when sorting tickets? (optional)">
                  <Help>
                    For example: “Questions about author copies are Printing & Quality, not
                    General.”
                  </Help>
                  <Controller
                    name="config.categoryInstructions"
                    control={control}
                    render={({ field }) => (
                      <Input.TextArea
                        {...field}
                        id={id('sorting-notes')}
                        aria-label="Extra guidance for sorting"
                        autoSize={{ minRows: 3, maxRows: 12 }}
                        maxLength={STRATEGY_LIMITS.categoryInstructionsMax}
                      />
                    )}
                  />
                </Section>
              </>
            ) : null}

            {/* ------------------------------ Advanced ----------------------------- */}
            <Collapse
              items={[
                {
                  key: 'advanced',
                  label: (
                    <span className="flex items-center gap-2">
                      <SettingOutlined /> Advanced settings — for technical admins
                    </span>
                  ),
                  children: (
                    <div className="flex flex-col gap-1">
                      <Alert
                        className="!mb-4"
                        type="warning"
                        showIcon
                        title="Changes here affect everything AI does in this area. Use “Try it” before saving."
                      />
                      <Controller
                        name="name"
                        control={control}
                        render={({ field, fieldState }) => (
                          <Form.Item
                            htmlFor={id('name')}
                            label="Setting name"
                            help={<FieldError message={fieldState.error?.message} />}
                          >
                            <Input {...field} id={id('name')} />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        name="purpose"
                        control={control}
                        render={({ field }) => (
                          <Form.Item htmlFor={id('purpose')} label="Description">
                            <Input.TextArea
                              {...field}
                              id={id('purpose')}
                              autoSize={{ minRows: 2, maxRows: 4 }}
                            />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        name="config.instructions"
                        control={control}
                        render={({ field, fieldState }) => (
                          <Form.Item
                            htmlFor={id('prompt')}
                            label="Main AI instructions (prompt)"
                            help={<FieldError message={fieldState.error?.message} />}
                          >
                            <Input.TextArea
                              {...field}
                              id={id('prompt')}
                              autoSize={{ minRows: 8, maxRows: 24 }}
                              className="!font-mono !text-[12.5px]"
                              maxLength={STRATEGY_LIMITS.instructionsMax}
                              showCount
                            />
                          </Form.Item>
                        )}
                      />
                      {!isPriority ? (
                        <div className="grid gap-x-3 sm:grid-cols-2">
                          <Controller
                            name="config.provider"
                            control={control}
                            render={({ field }) => (
                              <Form.Item
                                htmlFor={id('provider')}
                                label="AI provider"
                                extra="Must match the server's configured provider"
                              >
                                <Select
                                  {...field}
                                  id={id('provider')}
                                  options={AI_PROVIDERS.map((p) => ({ value: p, label: p }))}
                                />
                              </Form.Item>
                            )}
                          />
                          <Controller
                            name="config.model"
                            control={control}
                            render={({ field }) => (
                              <Form.Item
                                htmlFor={id('model')}
                                label="Model"
                                extra="Blank = server default"
                              >
                                <Input
                                  {...field}
                                  id={id('model')}
                                  placeholder={isResponse ? 'gpt-6.1-sol' : 'gpt-6-luna'}
                                />
                              </Form.Item>
                            )}
                          />
                          <Controller
                            name="config.temperature"
                            control={control}
                            render={({ field }) => (
                              <Form.Item
                                htmlFor={id('temperature')}
                                label="Temperature"
                                extra="Blank = model default"
                              >
                                <InputNumber
                                  id={id('temperature')}
                                  value={field.value ?? null}
                                  onChange={(v) => field.onChange(v ?? null)}
                                  min={0}
                                  max={1}
                                  step={0.1}
                                  className="!w-full"
                                />
                              </Form.Item>
                            )}
                          />
                          <Controller
                            name="config.maxOutputTokens"
                            control={control}
                            render={({ field }) => (
                              <Form.Item htmlFor={id('max-tokens')} label="Max output tokens">
                                <InputNumber
                                  {...field}
                                  id={id('max-tokens')}
                                  min={64}
                                  max={4000}
                                  step={50}
                                  className="!w-full"
                                />
                              </Form.Item>
                            )}
                          />
                        </div>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </div>

          {/* ------------------- Right column: save + about ------------------- */}
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
            <Section title="Save your changes">
              <Controller
                name="changeNote"
                control={control}
                render={({ field }) => (
                  <Form.Item htmlFor={id('change-note')} label="What did you change? (optional)">
                    <Input
                      {...field}
                      id={id('change-note')}
                      placeholder="e.g. Asked AI to always mention the payout date"
                      maxLength={STRATEGY_LIMITS.changeNoteMax}
                    />
                  </Form.Item>
                )}
              />
              {save.isError ? (
                <Alert className="!mb-3" type="error" showIcon title={errorMessage(save.error)} />
              ) : null}
              {Object.keys(formState.errors).length ? (
                <Alert
                  className="!mb-3"
                  type="error"
                  showIcon
                  title="Please fix the highlighted fields."
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  htmlType="submit"
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={save.isPending}
                  disabled={!formState.isDirty}
                >
                  Save changes
                </Button>
                <Button onClick={() => reset(toFormValues(strategy))} disabled={!formState.isDirty}>
                  Discard changes
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                Saving applies your changes to new tickets straight away. The previous version is
                kept in History, so you can always go back.
              </p>
            </Section>
            <Section title="About this setting">
              <p className="text-sm text-ink-muted">{SETTING_KIND[strategy.kind].explain}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-ink-subtle">Applies to</dt>
                <dd>{categoryName || 'All tickets'}</dd>
                <dt className="text-ink-subtle">Last changed</dt>
                <dd>
                  {formatDateTime(strategy.updatedAt)}
                  {strategy.updatedBy ? ` by ${strategy.updatedBy}` : ''}
                </dd>
              </dl>
              <p className="mt-3 text-xs text-ink-subtle">
                Not sure about a change? Save it, check it on the <strong>Try it</strong> tab, and
                go back from <strong>History</strong> if needed.
              </p>
            </Section>
          </aside>
        </div>
      </Form>
    </form>
  );
}

/* --------------------------------- Try it --------------------------------- */

const TryItSchema = z.object({
  subject: z.string().trim().min(3, 'At least 3 characters').max(150),
  description: z.string().trim().min(10, 'At least 10 characters').max(5000),
  bookId: z.string().trim().max(40),
});
type TryItValues = z.infer<typeof TryItSchema>;

const EXAMPLES: Record<string, TryItValues> = {
  ROYALTY_PAYMENTS: {
    subject: 'No royalty received yet',
    description:
      "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    bookId: 'BK005',
  },
  ISBN_METADATA: {
    subject: 'Different ISBN on Amazon',
    description: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    bookId: 'BK003',
  },
  PRINTING_QUALITY: {
    subject: 'Terrible print quality',
    description:
      'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
    bookId: 'BK001',
  },
  DISTRIBUTION_AVAILABILITY: {
    subject: 'Currently Unavailable on Amazon',
    description: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
    bookId: 'BK018',
  },
  BOOK_STATUS_PRODUCTION: {
    subject: 'Still in typesetting',
    description: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
    bookId: 'BK015',
  },
  GENERAL_INQUIRY: {
    subject: 'Update book description',
    description: "Can I update the description of my book on Amazon after it's already live?",
    bookId: '',
  },
};

function TryIt({ strategy }: { strategy: AiStrategyDto }) {
  const [result, setResult] = useState<StrategyTestResultDto | null>(null);
  const { control, handleSubmit } = useForm<TryItValues>({
    resolver: zodResolver(TryItSchema),
    defaultValues: EXAMPLES[strategy.category ?? 'ROYALTY_PAYMENTS'],
  });
  const run = useMutation({
    mutationFn: ({ values, dryRun }: { values: TryItValues; dryRun: boolean }) =>
      endpoints.ai.test(strategy.id, {
        subject: values.subject,
        description: values.description,
        bookId: values.bookId || null,
        dryRun,
      }),
    onSuccess: setResult,
  });
  const id = (field: string) => `${strategy.id}-try-${field}`;
  const out = result?.output;

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <Section title="An example question from an author">
        <Form layout="vertical" component={false}>
          {(
            [
              ['subject', 'Subject'],
              ['description', 'Message'],
              ['bookId', 'Book code (optional) — e.g. BK001, adds the book’s real details'],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field, fieldState }) => (
                <Form.Item
                  htmlFor={id(name)}
                  label={label}
                  help={<FieldError message={fieldState.error?.message} />}
                >
                  {name === 'description' ? (
                    <Input.TextArea {...field} id={id(name)} rows={6} />
                  ) : (
                    <Input {...field} id={id(name)} />
                  )}
                </Form.Item>
              )}
            />
          ))}
        </Form>
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          loading={run.isPending && !run.variables?.dryRun}
          onClick={handleSubmit((values) => run.mutate({ values, dryRun: false }))}
        >
          See what AI would do
        </Button>
        <p className="mt-2 text-xs text-ink-muted">
          This is only a test — nothing is sent to any author and no ticket is changed. It uses the
          saved version of this setting, so save your changes first.
        </p>
      </Section>

      <div className="flex flex-col gap-4">
        {run.isError ? <Alert type="error" showIcon title={errorMessage(run.error)} /> : null}
        {!result ? (
          <Section>
            <p className="text-sm text-ink-muted">
              Write or keep the example on the left, then click{' '}
              <strong>See what AI would do</strong>.
            </p>
          </Section>
        ) : (
          <>
            {result.failure ? (
              <Alert
                type="info"
                showIcon
                title={
                  out?.kind === 'TRIAGE'
                    ? `${AI_PROBLEM[result.failure.kind]} — this is what automatic sorting would do instead.`
                    : `${AI_PROBLEM[result.failure.kind]}, so it can't write a draft right now.`
                }
              />
            ) : null}

            {out?.kind === 'TRIAGE' ? (
              <Section title="What would happen">
                <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                  <dt className="text-ink-muted">Category</dt>
                  <dd className="font-medium">{TICKET_CATEGORY_LABELS[out.triage.category]}</dd>
                  <dt className="text-ink-muted">Urgency</dt>
                  <dd>
                    <PriorityTag priority={out.triage.priority} />
                  </dd>
                  {!result.failure ? (
                    <>
                      <dt className="text-ink-muted">Why</dt>
                      <dd>{out.triage.rationale}</dd>
                    </>
                  ) : null}
                </dl>
              </Section>
            ) : null}

            {out?.kind === 'DRAFT' ? (
              <Section title="The draft reply AI would suggest">
                <p className="prose-message rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm">
                  {out.draft.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {out.draft.escalationRecommended ? (
                    <Tag color="red">Needs a specialist team</Tag>
                  ) : null}
                  {out.draft.suggestedStatus === 'RESOLVED' ? (
                    <Tag color="green">Answers the question fully</Tag>
                  ) : null}
                </div>
                {out.draft.verificationChecklist.length ? (
                  <div className="mt-3 rounded-lg border border-note-border bg-note p-3 text-sm">
                    <p className="mb-1 font-semibold text-warning">
                      Your team would check before sending
                    </p>
                    <ul className="list-disc pl-5">
                      {out.draft.verificationChecklist.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Section>
            ) : null}
          </>
        )}

        <Collapse
          items={[
            {
              key: 'tech',
              label: 'Technical details — for technical admins',
              children: (
                <div className="flex flex-col gap-3 text-sm">
                  <Button
                    className="self-start"
                    loading={run.isPending && run.variables?.dryRun}
                    onClick={handleSubmit((values) => run.mutate({ values, dryRun: true }))}
                  >
                    Show what would be sent to AI (without asking AI)
                  </Button>
                  {result ? (
                    <>
                      <p className="text-xs text-ink-muted">
                        {result.model ? `Model ${result.model} · ` : ''}
                        {result.latencyMs
                          ? `${(result.latencyMs / 1000).toFixed(1)} s · `
                          : ''}≈ {result.preview.estimatedInputTokens} input tokens
                        {result.preview.knowledgeSections.length
                          ? ` · policies: ${result.preview.knowledgeSections.join(', ')}`
                          : ''}
                      </p>
                      <p className="font-medium">Instructions (system prompt)</p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface-muted p-3 text-xs">
                        {result.preview.system}
                      </pre>
                      <p className="font-medium">Ticket details sent</p>
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface-muted p-3 text-xs">
                        {result.preview.prompt}
                      </pre>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

/* --------------------------------- History --------------------------------- */

function History({ strategy }: { strategy: AiStrategyDto }) {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const versions = useQuery({
    queryKey: queryKeys.ai.versions(strategy.id),
    queryFn: () => endpoints.ai.versions(strategy.id),
  });
  const activate = useMutation({
    mutationFn: (version: number) => endpoints.ai.activate(strategy.id, version),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ai.strategy(strategy.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.all });
      message.success('Done — AI now uses that version.');
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  if (versions.isPending) return <LoadingBlock />;
  if (versions.isError) return <ErrorState error={versions.error} />;
  return (
    <div className="max-w-4xl">
      <p className="mb-3 text-sm text-ink-muted">
        Every time someone saves this setting, the previous version is kept here. Use an older
        version to undo a change.
      </p>
      <div className="surface-card overflow-hidden">
        <Table<AiStrategyVersionDto>
          rowKey="version"
          dataSource={versions.data}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Saved',
              key: 'when',
              width: 190,
              render: (_, v) => (
                <span>
                  {formatDateTime(v.createdAt)}
                  {v.isActive ? (
                    <Tag color="green" className="!ml-2">
                      In use
                    </Tag>
                  ) : null}
                </span>
              ),
            },
            {
              title: 'What changed',
              dataIndex: 'changeNote',
              render: (n: string) =>
                n === 'Built-in default'
                  ? 'BookLeaf’s original setting'
                  : n || <span className="text-ink-subtle">—</span>,
            },
            {
              title: 'By',
              dataIndex: 'createdBy',
              width: 160,
              render: (v: string | null) => v ?? 'BookLeaf',
            },
            {
              title: '',
              key: 'action',
              width: 170,
              render: (_, v) =>
                v.isActive ? null : (
                  <Button
                    size="small"
                    loading={activate.isPending && activate.variables === v.version}
                    onClick={() =>
                      modal.confirm({
                        title: 'Use this version again?',
                        content:
                          'AI will use this version for new tickets from now on. You can switch back at any time.',
                        okText: 'Use this version',
                        onOk: () => activate.mutateAsync(v.version),
                      })
                    }
                  >
                    Use this version
                  </Button>
                ),
            },
          ]}
        />
      </div>
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export function StrategyDetailView({ strategyId, tabId }: { strategyId: string; tabId: string }) {
  const setTitle = useWorkspace((s) => s.setTitle);
  const strategy = useQuery({
    queryKey: queryKeys.ai.strategy(strategyId),
    queryFn: () => endpoints.ai.strategy(strategyId),
  });

  useEffect(() => {
    if (strategy.data) setTitle(tabId, strategy.data.name);
  }, [strategy.data, tabId, setTitle]);

  if (strategy.isPending) return <LoadingBlock rows={10} />;
  if (strategy.isError)
    return <ErrorState error={strategy.error} onRetry={() => void strategy.refetch()} />;
  const s = strategy.data;

  return (
    <div>
      <PageHeader
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{SETTING_KIND[s.kind].label}</span>
            <span>·</span>
            <span>{s.category ? TICKET_CATEGORY_LABELS[s.category] : 'All tickets'}</span>
            {s.enabled ? <Tag color="green">In use</Tag> : <Tag>Not in use</Tag>}
          </span>
        }
      />
      <Tabs
        items={[
          {
            key: 'settings',
            label: 'Settings',
            // Keyed by version so the form refreshes after "Use this version".
            children: (
              <SettingEditor key={`${s.id}-${s.activeVersion}`} strategy={s} tabId={tabId} />
            ),
          },
          {
            key: 'try',
            label: (
              <span className="flex items-center gap-1.5">
                <ExperimentOutlined /> Try it
              </span>
            ),
            children: <TryIt strategy={s} />,
          },
          {
            key: 'history',
            label: (
              <span className="flex items-center gap-1.5">
                <HistoryOutlined /> History
              </span>
            ),
            children: <History strategy={s} />,
          },
        ]}
      />
    </div>
  );
}
