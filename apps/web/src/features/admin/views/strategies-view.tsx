'use client';

import { CopyOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
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
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type AiRunDto,
  type AiStrategyDto,
  type AiStrategyKind,
  type TicketCategory,
} from '@bookleaf/contracts';
import { formatDateTime, formatNumber } from '@bookleaf/utils';
import { useColumnVisibility } from '@/components/ui/column-visibility';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api-client';
import { endpoints, queryKeys } from '@/lib/endpoints';
import { tabFor } from '@/stores/workspace-store';
import { ACTIVITY_KIND, AI_PROBLEM, SETTING_GROUPS, type SettingGroup } from '../ai/plain-language';
import { useWorkspaceNav } from '../workspace/use-workspace-nav';

const GROUPS: SettingGroup[] = ['TRIAGE', 'RESPONSE'];

const kindFor = (group: SettingGroup): AiStrategyKind =>
  group === 'RESPONSE' ? 'RESPONSE' : 'CLASSIFICATION';

/** Sorting setting first, then categories in their usual order. */
function settingOrder(s: AiStrategyDto): number {
  return s.category ? TICKET_CATEGORIES.indexOf(s.category) + 1 : 0;
}

/** One plain sentence about whether AI is on — no providers, models or tokens. */
function AiStatusBanner() {
  const status = useQuery({
    queryKey: queryKeys.ai.status,
    queryFn: endpoints.ai.status,
    refetchInterval: 60_000,
  });
  if (!status.data) return null;
  const s = status.data;
  const helped = s.last24h.runs - s.last24h.failures;
  const state = !s.configured ? 'off' : s.circuitOpenUntil ? 'paused' : 'on';
  const dot = { on: 'bg-success', paused: 'bg-warning', off: 'bg-ink-subtle' }[state];
  const title = {
    on: 'AI is on',
    paused: 'AI is taking a short break after some errors',
    off: 'AI is switched off',
  }[state];
  const text =
    state === 'off'
      ? 'New tickets are sorted automatically from key words, and replies start from ready-made templates. Your settings here are kept and will be used as soon as AI is switched on.'
      : `In the last 24 hours AI helped ${formatNumber(helped)} time${helped === 1 ? '' : 's'}${
          s.last24h.failures
            ? `; ${s.last24h.failures} time${s.last24h.failures === 1 ? '' : 's'} it couldn't help and the ticket was handled automatically instead`
            : ''
        }.`;
  return (
    <div className="surface-card mb-6 flex items-start gap-3 px-4 py-3" role="status">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <RobotOutlined />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium text-ink">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {title}
        </p>
        <p className="text-sm text-ink-muted">{text}</p>
      </div>
    </div>
  );
}

/** "AI activity": what AI did recently, in plain words. Technical columns are opt-in. */
function AiActivity() {
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const query = { page, pageSize: 20, status: onlyProblems ? ('FAILED' as const) : undefined };
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
      width: 170,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: 'What AI did',
      key: 'kind',
      dataIndex: 'kind',
      render: (v: AiRunDto['kind']) => ACTIVITY_KIND[v],
    },
    {
      title: 'Ticket',
      key: 'ticket',
      width: 110,
      render: (_, r) => r.ticket?.reference ?? '—',
    },
    {
      title: 'Result',
      key: 'status',
      render: (_, r) =>
        r.status === 'SUCCESS' ? (
          <Tag color="green">Done</Tag>
        ) : (
          <Tag color="orange">{r.failureKind ? AI_PROBLEM[r.failureKind] : "Didn't work"}</Tag>
        ),
    },
    // Technical detail for whoever maintains the AI — hidden unless switched on.
    {
      title: 'Setting used',
      key: 'strategy',
      render: (_, r) => r.strategies.map((s) => `${s.name} (v${s.version})`).join(', '),
    },
    { title: 'Model', key: 'model', dataIndex: 'model', render: (v: string | null) => v ?? '—' },
    {
      title: 'Time taken',
      key: 'latencyMs',
      dataIndex: 'latencyMs',
      align: 'right',
      render: (v: number) => (v ? `${(v / 1000).toFixed(1)} s` : '—'),
    },
    {
      title: 'Tokens in / out',
      key: 'tokens',
      align: 'right',
      render: (_, r) =>
        r.inputTokens !== null ? `${r.inputTokens} / ${r.outputTokens ?? 0}` : '—',
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('ai-activity', columns, {
    locked: ['createdAt'],
    defaultHidden: ['strategy', 'model', 'latencyMs', 'tokens'],
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={onlyProblems ? 'problems' : 'all'}
          onChange={(v) => {
            setOnlyProblems(v === 'problems');
            setPage(1);
          }}
          options={[
            { label: 'Everything', value: 'all' },
            { label: "Only when AI couldn't help", value: 'problems' },
          ]}
        />
        {columnSettings}
      </div>
      <div className="surface-card overflow-hidden">
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
          scroll={{ x: 'max-content' }}
          columns={visibleColumns}
          locale={{ emptyText: 'No AI activity yet.' }}
        />
      </div>
    </div>
  );
}

/** Creates a new setting as an (inactive) copy of the one currently used for that area. */
function CreateSettingModal({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: AiStrategyDto[];
}) {
  const { openTab } = useWorkspaceNav();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<SettingGroup>('RESPONSE');
  const [category, setCategory] = useState<TicketCategory>('ROYALTY_PAYMENTS');
  const [name, setName] = useState('');
  const kind = kindFor(group);
  const scopeCategory = kind === 'CLASSIFICATION' ? null : category;
  const template =
    settings.find((s) => s.kind === kind && s.category === scopeCategory && s.enabled) ??
    settings.find((s) => s.kind === kind && s.category === scopeCategory);

  const create = useMutation({
    mutationFn: () => {
      if (!template) throw new Error('There is no existing setting to copy for this area.');
      return endpoints.ai.create({
        name: name.trim(),
        kind,
        category: scopeCategory,
        purpose: template.purpose,
        enabled: false,
        config: template.config,
        changeNote: `Copied from "${template.name}"`,
      });
    },
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
      title="Create a new setting"
      okText="Create"
      okButtonProps={{ disabled: name.trim().length < 3 || !template, loading: create.isPending }}
      onOk={() => create.mutate()}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3 py-2">
        <label className="text-sm">
          What should it control?
          <Select
            className="mt-1 w-full"
            value={group}
            onChange={setGroup}
            options={GROUPS.map((g) => ({ value: g, label: SETTING_GROUPS[g].label }))}
          />
        </label>
        {group === 'RESPONSE' ? (
          <label className="text-sm">
            For which category?
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
          It starts as a copy of the setting used today and stays <strong>off</strong> until you
          switch it on, so nothing changes for authors while you edit and try it.
        </p>
        {create.isError ? <Alert type="error" showIcon title={errorMessage(create.error)} /> : null}
      </div>
    </Modal>
  );
}

export function StrategiesView() {
  const { openTab } = useWorkspaceNav();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [group, setGroup] = useState<SettingGroup>('TRIAGE');
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
      message.success(`"${s.name}" is now ${s.enabled ? 'in use' : 'switched off'}`);
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

  /** Only one setting can be in use per area — explain what switching does before doing it. */
  const confirmToggle = (s: AiStrategyDto, enabled: boolean) => {
    modal.confirm({
      title: enabled ? `Start using "${s.name}"?` : `Stop using "${s.name}"?`,
      content: enabled
        ? 'It will be used from now on, and the setting used today for this area will be switched off.'
        : 'AI will fall back to BookLeaf’s standard behaviour for this area until another setting is switched on.',
      okText: enabled ? 'Start using it' : 'Stop using it',
      onOk: () => toggle.mutateAsync({ id: s.id, enabled }),
    });
  };

  const rows = (strategies.data ?? [])
    .filter((s) => SETTING_GROUPS[group].kinds.includes(s.kind))
    .sort((a, b) => settingOrder(a) - settingOrder(b));
  const columns: ColumnsType<AiStrategyDto> = [
    {
      title: 'Setting',
      key: 'name',
      render: (_, s) => (
        <div>
          <p className="font-medium">{s.name}</p>
          {s.purpose ? <p className="line-clamp-1 text-xs text-ink-subtle">{s.purpose}</p> : null}
        </div>
      ),
    },
    {
      title: 'Category',
      key: 'scope',
      width: 220,
      render: (_, s) => (s.category ? TICKET_CATEGORY_LABELS[s.category] : 'All tickets'),
    },
    {
      title: 'In use',
      key: 'enabled',
      width: 100,
      render: (_, s) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Tooltip title={s.enabled ? 'This setting is being used' : 'Not used right now'}>
            <Switch
              size="small"
              checked={s.enabled}
              loading={toggle.isPending && toggle.variables?.id === s.id}
              onChange={(enabled) => confirmToggle(s, enabled)}
              aria-label={`Use ${s.name}`}
            />
          </Tooltip>
        </span>
      ),
    },
    {
      title: 'Last changed',
      key: 'updated',
      width: 200,
      render: (_, s) => (
        <span className="text-xs text-ink-muted">
          {formatDateTime(s.updatedAt)}
          {s.updatedBy ? ` · ${s.updatedBy}` : ''}
        </span>
      ),
    },
    // Technical detail — hidden by default.
    { title: 'Version', key: 'version', width: 90, render: (_, s) => `v${s.activeVersion}` },
    {
      title: 'Times used',
      key: 'runs',
      width: 140,
      render: (_, s) => (
        <span className="tabular-nums">
          {s.stats.runs}
          {s.stats.failures ? (
            <span className="text-warning"> · {s.stats.failures} problems</span>
          ) : null}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, s) => (
        <Tooltip title="Make a copy to try changes safely">
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            loading={duplicate.isPending && duplicate.variables === s.id}
            onClick={(e) => {
              e.stopPropagation();
              duplicate.mutate(s.id);
            }}
            aria-label={`Make a copy of ${s.name}`}
          />
        </Tooltip>
      ),
    },
  ];
  const { visibleColumns, columnSettings } = useColumnVisibility('ai-settings', columns, {
    locked: ['name', 'enabled'],
    defaultHidden: ['version', 'runs'],
  });

  return (
    <div>
      <PageHeader
        title="AI settings"
        description="Choose how AI picks each new ticket's category and priority, and how it writes draft replies. Every change is kept in History, so you can always undo it."
        actions={
          <Button
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
            disabled={!strategies.data}
          >
            Create new setting
          </Button>
        }
      />
      <AiStatusBanner />
      <Tabs
        items={[
          {
            key: 'settings',
            label: 'Settings',
            children: strategies.isPending ? (
              <LoadingBlock />
            ) : strategies.isError ? (
              <ErrorState error={strategies.error} onRetry={() => void strategies.refetch()} />
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Segmented
                    value={group}
                    onChange={(v) => setGroup(v as SettingGroup)}
                    options={GROUPS.map((g) => ({ value: g, label: SETTING_GROUPS[g].label }))}
                  />
                  {columnSettings}
                </div>
                <p className="mb-3 text-sm text-ink-muted">{SETTING_GROUPS[group].explain}</p>
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
                <p className="mt-2 text-xs text-ink-subtle">Click a setting to see or change it.</p>
              </div>
            ),
          },
          { key: 'activity', label: 'AI activity', children: <AiActivity /> },
        ]}
      />
      <CreateSettingModal
        open={creating}
        onClose={() => setCreating(false)}
        settings={strategies.data ?? []}
      />
    </div>
  );
}
