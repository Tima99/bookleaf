'use client';

import { CopyOutlined, PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Segmented,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import { useState } from 'react';
import {
  AI_STRATEGY_KIND_LABELS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type AiRunDto,
  type AiStrategyDto,
  type AiStrategyKind,
  type TicketCategory,
} from '@bookleaf/contracts';
import { formatDateTime, formatNumber } from '@bookleaf/utils';
import type { ColumnsType } from 'antd/es/table';
import { useColumnVisibility } from '@/components/ui/column-visibility';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { tabFor } from '@/stores/workspace-store';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

function AiStatusBanner() {
  const status = useQuery({
    queryKey: queryKeys.ai.status,
    queryFn: endpoints.ai.status,
    refetchInterval: 60_000,
  });
  if (!status.data) return null;
  const s = status.data;
  if (!s.configured) {
    return (
      <Alert
        className="!mb-6"
        type="warning"
        showIcon
        title="Manual mode — no AI provider configured"
        description="Set AI_PROVIDER and ANTHROPIC_API_KEY (or OPENAI_API_KEY) in the API environment. Until then tickets are triaged with keyword rules and replies start from policy templates. Strategy previews still work."
      />
    );
  }
  return (
    <div className="surface-card mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-sm">
      <span>
        <span className="text-ink-muted">Provider</span>{' '}
        <strong className="ml-1">{s.provider}</strong>
      </span>
      <span>
        <span className="text-ink-muted">Triage model</span>{' '}
        <strong className="ml-1">{s.defaultModels?.triage}</strong>
      </span>
      <span>
        <span className="text-ink-muted">Draft model</span>{' '}
        <strong className="ml-1">{s.defaultModels?.draft}</strong>
      </span>
      <span>
        <span className="text-ink-muted">Last 24h</span>{' '}
        <strong className="ml-1">
          {s.last24h.runs} calls · {s.last24h.failures} failed ·{' '}
          {formatNumber(s.last24h.inputTokens + s.last24h.outputTokens)} tokens
        </strong>
      </span>
      {s.circuitOpenUntil ? (
        <Tag color="orange">Paused until {formatDateTime(s.circuitOpenUntil)}</Tag>
      ) : null}
    </div>
  );
}

function RunLog() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FAILED'>('ALL');
  const query = {
    page,
    pageSize: 20,
    status: statusFilter === 'FAILED' ? ('FAILED' as const) : undefined,
  };
  const runs = useQuery({
    queryKey: queryKeys.ai.runs(query),
    queryFn: () => endpoints.ai.runs(query),
    placeholderData: keepPreviousData,
  });
  const columns: ColumnsType<AiRunDto> = [
    {
      title: 'When',
      key: 'createdAt',
      dataIndex: 'createdAt',
      render: (v: string) => formatDateTime(v),
      width: 170,
    },
    {
      title: 'Kind',
      key: 'kind',
      dataIndex: 'kind',
      width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'Result',
      key: 'status',
      width: 200,
      render: (_, r) =>
        r.status === 'SUCCESS' ? (
          <Tag color="green">Success</Tag>
        ) : (
          <Tooltip title={r.failureMessage}>
            <Tag color="red">{r.failureKind ?? 'Failed'}</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      width: 100,
      render: (_, r) => r.ticket?.reference ?? '—',
    },
    {
      title: 'Strategy',
      key: 'strategy',
      render: (_, r) => r.strategies.map((s) => `${s.name} v${s.version}`).join(', '),
    },
    {
      title: 'Model',
      key: 'model',
      dataIndex: 'model',
      width: 160,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Latency',
      key: 'latencyMs',
      dataIndex: 'latencyMs',
      width: 90,
      align: 'right',
      render: (v: number) => (v ? `${v} ms` : '—'),
    },
    {
      title: 'Tokens in/out',
      key: 'tokens',
      width: 120,
      align: 'right',
      render: (_, r) =>
        r.inputTokens !== null ? `${r.inputTokens} / ${r.outputTokens ?? 0}` : '—',
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('ai-run-log', columns, {
    locked: ['createdAt'],
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v as 'ALL' | 'FAILED');
            setPage(1);
          }}
          options={[
            { label: 'All runs', value: 'ALL' },
            { label: 'Failures', value: 'FAILED' },
          ]}
        />
        {columnSettings}
      </div>
      <Table<AiRunDto>
        rowKey="id"
        size="small"
        loading={runs.isFetching}
        dataSource={runs.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: runs.data?.meta.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        scroll={{ x: 900 }}
        columns={visibleColumns}
      />
    </div>
  );
}

function CreateStrategyModal({
  open,
  onClose,
  strategies,
}: {
  open: boolean;
  onClose: () => void;
  strategies: AiStrategyDto[];
}) {
  const { openTab } = useWorkspaceNav();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AiStrategyKind>('RESPONSE');
  const [category, setCategory] = useState<TicketCategory>('ROYALTY_PAYMENTS');
  const [name, setName] = useState('');
  const scopeCategory = kind === 'CLASSIFICATION' ? null : category;
  // New strategies start from the configuration currently active for the same scope.
  const template =
    strategies.find((s) => s.kind === kind && s.category === scopeCategory && s.enabled) ??
    strategies.find((s) => s.kind === kind && s.category === scopeCategory);

  const create = useMutation({
    mutationFn: () =>
      endpoints.ai.create({
        name: name.trim(),
        kind,
        category: scopeCategory,
        purpose: template?.purpose ?? '',
        enabled: false,
        config: template!.config,
        changeNote: template
          ? `Created from "${template.name}" v${template.activeVersion}`
          : 'Initial version',
      }),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.strategies });
      onClose();
      setName('');
      openTab(tabFor.strategy(s.id, s.name));
    },
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="New AI strategy"
      okText="Create (disabled)"
      okButtonProps={{ disabled: name.trim().length < 3 || !template, loading: create.isPending }}
      onOk={() => create.mutate()}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3 py-2">
        <label className="text-sm">
          Type
          <Select
            className="mt-1 w-full"
            value={kind}
            onChange={setKind}
            options={(['CLASSIFICATION', 'PRIORITY', 'RESPONSE'] as const).map((k) => ({
              value: k,
              label: AI_STRATEGY_KIND_LABELS[k],
            }))}
          />
        </label>
        {kind !== 'CLASSIFICATION' ? (
          <label className="text-sm">
            Category
            <Select
              className="mt-1 w-full"
              value={category}
              onChange={setCategory}
              options={TICKET_CATEGORIES.map((c) => ({
                value: c,
                label: TICKET_CATEGORY_LABELS[c],
              }))}
            />
          </label>
        ) : null}
        <label className="text-sm">
          Name
          <Input
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Royalty replies — festive season"
          />
        </label>
        <p className="text-xs text-ink-muted">
          The new strategy copies the active configuration for this scope and starts{' '}
          <strong>disabled</strong>. Edit and test it, then enable it to replace the current one.
        </p>
        {create.isError ? <Alert type="error" showIcon title={errorMessage(create.error)} /> : null}
      </div>
    </Modal>
  );
}

export function StrategiesView() {
  const { openTab } = useWorkspaceNav();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [kind, setKind] = useState<AiStrategyKind>('RESPONSE');
  const [creating, setCreating] = useState(false);
  const strategies = useQuery({
    queryKey: queryKeys.ai.strategies,
    queryFn: () => endpoints.ai.strategies(),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      endpoints.ai.update(id, { enabled, activate: true }),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.all });
      message.success(`${s.name} ${s.enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => endpoints.ai.duplicate(id),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ai.strategies });
      openTab(tabFor.strategy(s.id, s.name));
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const rows = (strategies.data ?? []).filter((s) => s.kind === kind);
  const columns: ColumnsType<AiStrategyDto> = [
    {
      title: 'Strategy',
      key: 'name',
      render: (_, s) => (
        <div>
          <p className="font-medium">
            {s.name} {s.isDefault ? <Tag className="!ml-1">Default</Tag> : null}
          </p>
          <p className="line-clamp-1 text-xs text-ink-subtle">{s.purpose}</p>
        </div>
      ),
    },
    {
      title: 'Scope',
      key: 'scope',
      width: 220,
      responsive: ['md'],
      render: (_, s) => (s.category ? TICKET_CATEGORY_LABELS[s.category] : 'All tickets'),
    },
    {
      title: 'Version',
      key: 'version',
      width: 100,
      render: (_, s) =>
        `v${s.activeVersion}${s.latestVersion > s.activeVersion ? ` (latest v${s.latestVersion})` : ''}`,
    },
    {
      title: 'Runs',
      key: 'runs',
      width: 110,
      responsive: ['lg'],
      render: (_, s) => (
        <span className="tabular-nums">
          {s.stats.runs}
          {s.stats.failures ? (
            <span className="text-danger"> · {s.stats.failures} failed</span>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Updated',
      key: 'updated',
      width: 170,
      responsive: ['xl'],
      render: (_, s) => (
        <span className="text-xs text-ink-muted">
          {formatDateTime(s.updatedAt)}
          {s.updatedBy ? ` · ${s.updatedBy}` : ''}
        </span>
      ),
    },
    {
      title: 'Enabled',
      key: 'enabled',
      width: 90,
      render: (_, s) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={s.enabled}
            loading={toggle.isPending && toggle.variables?.id === s.id}
            onChange={(enabled) => toggle.mutate({ id: s.id, enabled })}
            aria-label={`Enable ${s.name}`}
          />
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, s) => (
        <Tooltip title="Duplicate">
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            loading={duplicate.isPending && duplicate.variables === s.id}
            onClick={(e) => {
              e.stopPropagation();
              duplicate.mutate(s.id);
            }}
            aria-label={`Duplicate ${s.name}`}
          />
        </Tooltip>
      ),
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('ai-strategies', columns, {
    locked: ['name', 'enabled'],
  });

  return (
    <div>
      <PageHeader
        title="AI strategies"
        description="Configure how the assistant classifies, prioritises and drafts replies — per category, versioned, without code changes."
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
            disabled={!strategies.data}
          >
            New strategy
          </Button>
        }
      />
      <AiStatusBanner />
      <Tabs
        items={[
          {
            key: 'strategies',
            label: 'Strategies',
            children: strategies.isPending ? (
              <LoadingBlock />
            ) : strategies.isError ? (
              <ErrorState error={strategies.error} onRetry={() => void strategies.refetch()} />
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <Segmented
                    value={kind}
                    onChange={(v) => setKind(v as AiStrategyKind)}
                    options={(['CLASSIFICATION', 'PRIORITY', 'RESPONSE'] as const).map((k) => ({
                      value: k,
                      label: AI_STRATEGY_KIND_LABELS[k],
                    }))}
                  />
                  {columnSettings}
                </div>
                <p className="mb-3 text-xs text-ink-muted">
                  {kind === 'CLASSIFICATION'
                    ? 'One global strategy classifies every ticket. It runs in the same model call as priority scoring.'
                    : kind === 'PRIORITY'
                      ? 'Per-category rubric lines are given to the model; floor rules deterministically raise priority (never lower).'
                      : 'Per-category reply drafting: instructions, tone and which knowledge-base sections to ground on.'}{' '}
                  Exactly one strategy can be enabled per scope.
                </p>
                <div className="surface-card overflow-hidden">
                  <Table<AiStrategyDto>
                    scroll={{ x: 'max-content' }}
                    rowKey="id"
                    dataSource={rows}
                    pagination={false}
                    onRow={(s) => ({
                      onClick: () => openTab(tabFor.strategy(s.id, s.name)),
                      className: 'cursor-pointer',
                    })}
                    columns={visibleColumns}
                  />
                </div>
              </div>
            ),
          },
          { key: 'runs', label: 'Run log', children: <RunLog /> },
        ]}
      />
      <CreateStrategyModal
        open={creating}
        onClose={() => setCreating(false)}
        strategies={strategies.data ?? []}
      />
    </div>
  );
}
