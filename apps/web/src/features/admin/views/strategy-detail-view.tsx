'use client';

import {
  DeleteOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AI_PROVIDERS,
  AI_STRATEGY_KIND_LABELS,
  AiStrategyConfigSchema,
  KNOWLEDGE_SECTION_IDS,
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

const FormSchema = z.object({
  name: z.string().trim().min(3).max(STRATEGY_LIMITS.nameMax),
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

/* ------------------------------ editor ------------------------------ */

function StrategyEditor({ strategy, tabId }: { strategy: AiStrategyDto; tabId: string }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const setDirty = useWorkspace((s) => s.setDirty);
  const { control, handleSubmit, reset, formState } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(FormSchema),
    defaultValues: toFormValues(strategy),
  });
  const floorRules = useFieldArray({ control, name: 'config.floorRules' });

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
      message.success(`Saved as version ${updated.activeVersion} (now active)`);
    },
  });

  const isResponse = strategy.kind === 'RESPONSE';
  const isPriority = strategy.kind === 'PRIORITY';
  const isClassification = strategy.kind === 'CLASSIFICATION';

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <Form layout="vertical" component={false}>
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            <Section title="Prompt">
              <Controller
                name="config.instructions"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={`${strategy.id}-${field.name}`}
                    label={isPriority ? 'Rubric heading' : 'System instructions'}
                    required
                    help={<FieldError message={fieldState.error?.message} />}
                  >
                    <Input.TextArea
                      {...field}
                      id={`${strategy.id}-${field.name}`}
                      autoSize={{ minRows: isPriority ? 2 : 10, maxRows: 28 }}
                      className="!font-mono !text-[12.5px]"
                      maxLength={STRATEGY_LIMITS.instructionsMax}
                      showCount
                    />
                  </Form.Item>
                )}
              />
              {!isPriority ? (
                <Controller
                  name="config.categoryInstructions"
                  control={control}
                  render={({ field }) => (
                    <Form.Item
                      htmlFor={`${strategy.id}-${field.name}`}
                      label={
                        isClassification
                          ? 'Additional classification guidance'
                          : 'Category-specific instructions'
                      }
                    >
                      <Input.TextArea
                        {...field}
                        id={`${strategy.id}-${field.name}`}
                        autoSize={{ minRows: 5, maxRows: 18 }}
                        className="!font-mono !text-[12.5px]"
                        maxLength={STRATEGY_LIMITS.categoryInstructionsMax}
                        showCount
                      />
                    </Form.Item>
                  )}
                />
              ) : null}
              {isResponse ? (
                <Controller
                  name="config.tone"
                  control={control}
                  render={({ field }) => (
                    <Form.Item htmlFor={`${strategy.id}-${field.name}`} label="Response tone">
                      <Input.TextArea
                        {...field}
                        id={`${strategy.id}-${field.name}`}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        maxLength={STRATEGY_LIMITS.toneMax}
                      />
                    </Form.Item>
                  )}
                />
              ) : null}
            </Section>

            {isPriority ? (
              <Section title="Priority rubric (sent to the model)">
                <Controller
                  name="config.priorityRules"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Form.Item
                      htmlFor={`${strategy.id}-${field.name}`}
                      help={<FieldError message={fieldState.error?.message} />}
                      extra="One rule per line."
                    >
                      <Input.TextArea
                        id={`${strategy.id}-${field.name}`}
                        value={(field.value ?? []).join('\n')}
                        onChange={(e) => field.onChange(e.target.value.split('\n'))}
                        onBlur={() =>
                          field.onChange((field.value ?? []).map((r) => r.trim()).filter(Boolean))
                        }
                        autoSize={{ minRows: 4, maxRows: 14 }}
                      />
                    </Form.Item>
                  )}
                />
              </Section>
            ) : null}

            {isPriority || isClassification ? (
              <Section
                title="Floor rules (deterministic)"
                extra={
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      floorRules.append({ label: '', keywords: [], minimumPriority: 'MEDIUM' })
                    }
                  >
                    Add rule
                  </Button>
                }
              >
                <p className="-mt-2 mb-4 text-xs text-ink-muted">
                  If any keyword appears in the ticket, its priority is raised to at least the
                  minimum — even if the model said lower.
                </p>
                <div className="flex flex-col gap-3">
                  {floorRules.fields.length === 0 ? (
                    <p className="text-sm text-ink-subtle">No floor rules.</p>
                  ) : null}
                  {floorRules.fields.map((f, index) => (
                    <div
                      key={f.id}
                      className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_2fr_140px_auto]"
                    >
                      <Controller
                        name={`config.floorRules.${index}.label`}
                        control={control}
                        render={({ field, fieldState }) => (
                          <div>
                            <Input
                              {...field}
                              id={`${strategy.id}-${field.name}`}
                              placeholder="Label"
                              aria-label="Rule label"
                              status={fieldState.error ? 'error' : ''}
                            />
                            <FieldError message={fieldState.error?.message} />
                          </div>
                        )}
                      />
                      <Controller
                        name={`config.floorRules.${index}.keywords`}
                        control={control}
                        render={({ field, fieldState }) => (
                          <div>
                            <Select
                              {...field}
                              id={`${strategy.id}-${field.name}`}
                              mode="tags"
                              placeholder="Keywords (Enter to add)"
                              tokenSeparators={[',']}
                              aria-label="Keywords"
                              status={fieldState.error ? 'error' : ''}
                              className="w-full"
                            />
                            <FieldError message={fieldState.error?.message} />
                          </div>
                        )}
                      />
                      <Controller
                        name={`config.floorRules.${index}.minimumPriority`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            id={`${strategy.id}-${field.name}`}
                            aria-label="Minimum priority"
                            options={TICKET_PRIORITIES.map((p) => ({
                              value: p,
                              label: `≥ ${TICKET_PRIORITY_LABELS[p]}`,
                            }))}
                          />
                        )}
                      />
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => floorRules.remove(index)}
                        aria-label="Remove rule"
                      />
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}
          </div>

          <div className="flex flex-col gap-6">
            <Section title="Details">
              <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Form.Item
                    htmlFor={`${strategy.id}-${field.name}`}
                    label="Name"
                    required
                    help={<FieldError message={fieldState.error?.message} />}
                  >
                    <Input {...field} id={`${strategy.id}-${field.name}`} />
                  </Form.Item>
                )}
              />
              <Controller
                name="purpose"
                control={control}
                render={({ field }) => (
                  <Form.Item htmlFor={`${strategy.id}-${field.name}`} label="Purpose">
                    <Input.TextArea
                      {...field}
                      id={`${strategy.id}-${field.name}`}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                    />
                  </Form.Item>
                )}
              />
            </Section>

            {!isPriority ? (
              <Section title="Model & budget">
                <div className="grid grid-cols-2 gap-x-3">
                  <Controller
                    name="config.provider"
                    control={control}
                    render={({ field }) => (
                      <Form.Item
                        htmlFor={`${strategy.id}-${field.name}`}
                        label="Provider"
                        extra="Must match the server's configured key"
                      >
                        <Select
                          {...field}
                          id={`${strategy.id}-${field.name}`}
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
                        htmlFor={`${strategy.id}-${field.name}`}
                        label="Model"
                        extra="Blank = server default"
                      >
                        <Input
                          {...field}
                          id={`${strategy.id}-${field.name}`}
                          placeholder={isResponse ? 'claude-opus-5-5' : 'claude-haiku-5-5'}
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    name="config.maxOutputTokens"
                    control={control}
                    render={({ field }) => (
                      <Form.Item htmlFor={`${strategy.id}-${field.name}`} label="Max output tokens">
                        <InputNumber
                          {...field}
                          id={`${strategy.id}-${field.name}`}
                          min={64}
                          max={4000}
                          step={50}
                          className="!w-full"
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    name="config.temperature"
                    control={control}
                    render={({ field }) => (
                      <Form.Item
                        htmlFor={`${strategy.id}-${field.name}`}
                        label="Temperature"
                        extra="Blank = model default"
                      >
                        <InputNumber
                          id={`${strategy.id}-${field.name}`}
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
                </div>
                {isResponse ? (
                  <>
                    <Controller
                      name="config.knowledgeSections"
                      control={control}
                      render={({ field }) => (
                        <Form.Item
                          htmlFor={`${strategy.id}-${field.name}`}
                          label="Pinned knowledge-base sections"
                          extra="Always included; other relevant sections are added by keyword match (max 3 total)."
                        >
                          <Select
                            {...field}
                            id={`${strategy.id}-${field.name}`}
                            mode="multiple"
                            options={KNOWLEDGE_SECTION_IDS.filter(
                              (k) => k !== 'communication-tone',
                            ).map((k) => ({ value: k, label: k }))}
                          />
                        </Form.Item>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-x-3">
                      <Controller
                        name="config.maxHistoryMessages"
                        control={control}
                        render={({ field }) => (
                          <Form.Item
                            htmlFor={`${strategy.id}-${field.name}`}
                            label="History messages"
                            extra="Latest N public messages"
                          >
                            <InputNumber
                              {...field}
                              id={`${strategy.id}-${field.name}`}
                              min={0}
                              max={20}
                              className="!w-full"
                            />
                          </Form.Item>
                        )}
                      />
                      <Controller
                        name="config.includeExamples"
                        control={control}
                        render={({ field }) => (
                          <Form.Item
                            htmlFor={`${strategy.id}-${field.name}`}
                            label="Calibration example"
                          >
                            <Switch
                              id={`${strategy.id}-${field.name}`}
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          </Form.Item>
                        )}
                      />
                    </div>
                  </>
                ) : null}
              </Section>
            ) : null}

            <Section>
              <Controller
                name="changeNote"
                control={control}
                render={({ field }) => (
                  <Form.Item htmlFor={`${strategy.id}-${field.name}`} label="Change note">
                    <Input
                      {...field}
                      id={`${strategy.id}-${field.name}`}
                      placeholder="What changed and why?"
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
              <div className="flex gap-2">
                <Button
                  htmlType="submit"
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={save.isPending}
                  disabled={!formState.isDirty}
                >
                  Save as v{strategy.latestVersion + 1}
                </Button>
                <Button onClick={() => reset(toFormValues(strategy))} disabled={!formState.isDirty}>
                  Discard
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                Saving creates a new immutable version and activates it for future tickets. Past AI
                results keep the version they used.
              </p>
            </Section>
          </div>
        </div>
      </Form>
    </form>
  );
}

/* --------------------------- test console --------------------------- */

const TestSchema = z.object({
  subject: z.string().trim().min(3, 'At least 3 characters').max(150),
  description: z.string().trim().min(10, 'At least 10 characters').max(5000),
  bookId: z.string().trim().max(40),
});
type TestValues = z.infer<typeof TestSchema>;

const SAMPLE: Record<string, TestValues> = {
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

function TestConsole({ strategy }: { strategy: AiStrategyDto }) {
  const [result, setResult] = useState<StrategyTestResultDto | null>(null);
  const { control, handleSubmit } = useForm<TestValues>({
    resolver: zodResolver(TestSchema),
    defaultValues: SAMPLE[strategy.category ?? 'ROYALTY_PAYMENTS'],
  });
  const run = useMutation({
    mutationFn: ({ values, dryRun }: { values: TestValues; dryRun: boolean }) =>
      endpoints.ai.test(strategy.id, {
        subject: values.subject,
        description: values.description,
        bookId: values.bookId || null,
        dryRun,
      }),
    onSuccess: setResult,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Section title="Sample ticket">
        <Form layout="vertical" component={false}>
          {(['subject', 'description', 'bookId'] as const).map((name) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field, fieldState }) => (
                <Form.Item
                  htmlFor={`${strategy.id}-${field.name}`}
                  label={
                    name === 'bookId'
                      ? 'Book ID (optional, e.g. BK001)'
                      : name === 'subject'
                        ? 'Subject'
                        : 'Description'
                  }
                  help={<FieldError message={fieldState.error?.message} />}
                >
                  {name === 'description' ? (
                    <Input.TextArea {...field} id={`${strategy.id}-${field.name}`} rows={6} />
                  ) : (
                    <Input {...field} id={`${strategy.id}-${field.name}`} />
                  )}
                </Form.Item>
              )}
            />
          ))}
        </Form>
        <p className="mb-3 text-xs text-ink-muted">
          Tests run the active version (v{strategy.activeVersion}). Save your edits first to test
          them.
        </p>
        <div className="flex gap-2">
          <Button
            icon={<EyeOutlined />}
            loading={run.isPending && run.variables?.dryRun}
            onClick={handleSubmit((values) => run.mutate({ values, dryRun: true }))}
          >
            Preview prompt
          </Button>
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            loading={run.isPending && !run.variables?.dryRun}
            onClick={handleSubmit((values) => run.mutate({ values, dryRun: false }))}
          >
            Run test
          </Button>
        </div>
      </Section>

      <div className="flex flex-col gap-4">
        {run.isError ? <Alert type="error" showIcon title={errorMessage(run.error)} /> : null}
        {!result ? (
          <Section>
            <p className="text-sm text-ink-muted">
              Preview shows the exact system and user prompt (with only the relevant knowledge-base
              sections). Run test calls the model and shows the structured output — nothing is
              written to tickets.
            </p>
          </Section>
        ) : (
          <>
            {result.failure ? (
              <Alert
                type="warning"
                showIcon
                title={`${result.failure.kind}: ${result.failure.message}`}
              />
            ) : null}
            {result.output?.kind === 'DRAFT' ? (
              <Section
                title="Draft output"
                extra={
                  <span className="text-xs text-ink-subtle">
                    {result.model} · {result.latencyMs} ms · {result.usage?.inputTokens ?? '?'} in /{' '}
                    {result.usage?.outputTokens ?? '?'} out
                  </span>
                }
              >
                <p className="prose-message rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm">
                  {result.output.draft.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Tag>Suggests: {result.output.draft.suggestedStatus}</Tag>
                  {result.output.draft.escalationRecommended ? (
                    <Tag color="red">Escalate</Tag>
                  ) : null}
                  {result.output.draft.knowledgeSectionsUsed.map((k) => (
                    <Tag key={k} color="blue">
                      {k}
                    </Tag>
                  ))}
                </div>
                {result.output.draft.verificationChecklist.length ? (
                  <ul className="mt-3 list-disc pl-5 text-sm text-warning">
                    {result.output.draft.verificationChecklist.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                ) : null}
              </Section>
            ) : null}
            {result.output?.kind === 'TRIAGE' ? (
              <Section
                title="Triage output"
                extra={
                  result.model ? (
                    <span className="text-xs text-ink-subtle">
                      {result.model} · {result.latencyMs} ms
                    </span>
                  ) : (
                    <Tag>Rules fallback</Tag>
                  )
                }
              >
                <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                  <dt className="text-ink-muted">Category</dt>
                  <dd>
                    {TICKET_CATEGORY_LABELS[result.output.triage.category]} (
                    {Math.round(result.output.triage.categoryConfidence * 100)}%)
                  </dd>
                  <dt className="text-ink-muted">Priority</dt>
                  <dd>
                    <PriorityTag priority={result.output.triage.priority} />
                  </dd>
                  <dt className="text-ink-muted">Rationale</dt>
                  <dd>{result.output.triage.rationale}</dd>
                  <dt className="text-ink-muted">Priority reason</dt>
                  <dd>{result.output.triage.priorityRationale}</dd>
                  {result.output.triage.rulesApplied.length ? (
                    <>
                      <dt className="text-ink-muted">Rules applied</dt>
                      <dd>{result.output.triage.rulesApplied.join('; ')}</dd>
                    </>
                  ) : null}
                </dl>
              </Section>
            ) : null}
            <Section
              title="Prompt composition"
              extra={
                <span className="text-xs text-ink-subtle">
                  ≈ {result.preview.estimatedInputTokens} input tokens
                </span>
              }
            >
              {result.preview.knowledgeSections.length ? (
                <p className="mb-2 text-xs text-ink-muted">
                  Knowledge sections included: {result.preview.knowledgeSections.join(', ')}
                </p>
              ) : null}
              <Collapse
                size="small"
                items={[
                  {
                    key: 'system',
                    label: 'System prompt',
                    children: (
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                        {result.preview.system}
                      </pre>
                    ),
                  },
                  {
                    key: 'prompt',
                    label: 'User prompt (ticket context)',
                    children: (
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                        {result.preview.prompt}
                      </pre>
                    ),
                  },
                ]}
                defaultActiveKey={['prompt']}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- versions ----------------------------- */

function VersionHistory({ strategy }: { strategy: AiStrategyDto }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const versions = useQuery({
    queryKey: queryKeys.ai.versions(strategy.id),
    queryFn: () => endpoints.ai.versions(strategy.id),
  });
  const activate = useMutation({
    mutationFn: (version: number) => endpoints.ai.activate(strategy.id, version),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ai.strategy(strategy.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.all });
      message.success(`Version ${updated.activeVersion} is now active`);
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  if (versions.isPending) return <LoadingBlock />;
  if (versions.isError) return <ErrorState error={versions.error} />;
  return (
    <div className="surface-card overflow-hidden">
      <Table<AiStrategyVersionDto>
        rowKey="version"
        dataSource={versions.data}
        pagination={false}
        columns={[
          {
            title: 'Version',
            key: 'v',
            width: 120,
            render: (_, v) => (
              <span>
                v{v.version} {v.isActive ? <Tag color="green">Active</Tag> : null}
              </span>
            ),
          },
          {
            title: 'Change note',
            dataIndex: 'changeNote',
            render: (n: string) => n || <span className="text-ink-subtle">—</span>,
          },
          {
            title: 'Author',
            dataIndex: 'createdBy',
            width: 160,
            render: (v: string | null) => v ?? 'System',
          },
          {
            title: 'Created',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => formatDateTime(v),
          },
          {
            title: '',
            key: 'action',
            width: 140,
            render: (_, v) =>
              v.isActive ? null : (
                <Button
                  size="small"
                  loading={activate.isPending && activate.variables === v.version}
                  onClick={() => activate.mutate(v.version)}
                >
                  {v.version < strategy.activeVersion ? 'Roll back to this' : 'Activate'}
                </Button>
              ),
          },
        ]}
      />
    </div>
  );
}

/* ------------------------------- view -------------------------------- */

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
            <Tag>{AI_STRATEGY_KIND_LABELS[s.kind]}</Tag>
            <span>{s.category ? TICKET_CATEGORY_LABELS[s.category] : 'All tickets'}</span>
            <span>·</span>
            <span>Active v{s.activeVersion}</span>
            {s.enabled ? <Tag color="green">Enabled</Tag> : <Tag>Disabled</Tag>}
            <span className="text-xs text-ink-subtle">
              {s.stats.runs} runs · {s.stats.failures} failures
              {s.stats.lastRunAt ? ` · last ${formatDateTime(s.stats.lastRunAt)}` : ''}
            </span>
          </span>
        }
      />
      <Tabs
        items={[
          // Keyed by active version so the form re-initialises after activating another version.
          {
            key: 'config',
            label: 'Configuration',
            children: (
              <StrategyEditor key={`${s.id}-${s.activeVersion}`} strategy={s} tabId={tabId} />
            ),
          },
          { key: 'test', label: 'Preview & test', children: <TestConsole strategy={s} /> },
          {
            key: 'versions',
            label: `Versions (${s.latestVersion})`,
            children: <VersionHistory strategy={s} />,
          },
        ]}
      />
    </div>
  );
}
