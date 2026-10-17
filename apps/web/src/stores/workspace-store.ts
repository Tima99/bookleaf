'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AdminTicketListParams } from '@bookleaf/contracts';

/**
 * Admin tab workspace state (navigation only).
 *
 * - Server data lives in TanStack Query, never here.
 * - Unsaved form state lives inside each tab's (kept-mounted) component; the store only
 *   tracks a `dirty` flag per tab so closing/leaving can ask for confirmation.
 * - Tabs, the active tab and queue filters persist in sessionStorage so a refresh keeps
 *   the workspace; nothing sensitive (ticket content, drafts, tokens) is persisted.
 */
export type TabKind =
  'dashboard' | 'queue' | 'ticket' | 'authors' | 'author' | 'ai' | 'strategy' | 'knowledge';

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
  href: string;
  entityId?: string;
  closable: boolean;
}

export type QueueFilters = Required<Pick<AdminTicketListParams, 'page' | 'pageSize' | 'sort'>> &
  Pick<
    AdminTicketListParams,
    'search' | 'status' | 'category' | 'priority' | 'assignee' | 'createdFrom' | 'createdTo'
  >;

export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  page: 1,
  pageSize: 20,
  sort: 'urgency',
  status: ['OPEN', 'IN_PROGRESS'],
};

export const tabFor = {
  dashboard: (): WorkspaceTab => ({
    id: 'dashboard',
    kind: 'dashboard',
    title: 'Dashboard',
    href: '/admin',
    closable: false,
  }),
  queue: (): WorkspaceTab => ({
    id: 'queue',
    kind: 'queue',
    title: 'Ticket queue',
    href: '/admin/tickets',
    closable: true,
  }),
  ticket: (id: string, title = 'Ticket'): WorkspaceTab => ({
    id: `ticket:${id}`,
    kind: 'ticket',
    title,
    href: `/admin/tickets/${id}`,
    entityId: id,
    closable: true,
  }),
  authors: (): WorkspaceTab => ({
    id: 'authors',
    kind: 'authors',
    title: 'Authors',
    href: '/admin/authors',
    closable: true,
  }),
  author: (id: string, title = 'Author'): WorkspaceTab => ({
    id: `author:${id}`,
    kind: 'author',
    title,
    href: `/admin/authors/${id}`,
    entityId: id,
    closable: true,
  }),
  ai: (): WorkspaceTab => ({
    id: 'ai',
    kind: 'ai',
    title: 'AI settings',
    href: '/admin/ai',
    closable: true,
  }),
  strategy: (id: string, title = 'Strategy'): WorkspaceTab => ({
    id: `strategy:${id}`,
    kind: 'strategy',
    title,
    href: `/admin/ai/strategies/${id}`,
    entityId: id,
    closable: true,
  }),
  knowledge: (): WorkspaceTab => ({
    id: 'knowledge',
    kind: 'knowledge',
    title: 'Knowledge base',
    href: '/admin/ai/knowledge',
    closable: true,
  }),
};

/** Maps an /admin URL to its workspace tab (used for Back/Forward and deep links). */
export function tabFromPath(pathname: string): WorkspaceTab | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['admin', ...]
  if (parts[0] !== 'admin') return null;
  const [, section, id, sub] = parts;
  if (!section) return tabFor.dashboard();
  if (section === 'tickets') return id ? tabFor.ticket(id) : tabFor.queue();
  if (section === 'authors') return id ? tabFor.author(id) : tabFor.authors();
  if (section === 'ai') {
    if (id === 'knowledge') return tabFor.knowledge();
    if (id === 'strategies' && sub) return tabFor.strategy(sub);
    return tabFor.ai();
  }
  return null;
}

// Tabs shrink to fit (Chrome-style) before the strip scrolls; beyond this the oldest clean
// tab is evicted to keep memory bounded.
const MAX_TABS = 20;

interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeId: string;
  dirty: Record<string, boolean>;
  queueFilters: QueueFilters;
  /** Opens (or re-activates — never duplicates) a tab. */
  open: (tab: WorkspaceTab) => void;
  /** Removes a tab and returns the tab that should become active (if it was active). */
  close: (id: string) => WorkspaceTab | null;
  /** Moves a closable tab to a new position; pinned tabs (Dashboard) always stay first. */
  moveTab: (id: string, toIndex: number) => void;
  setTitle: (id: string, title: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
  setQueueFilters: (patch: Partial<QueueFilters>) => void;
  resetQueueFilters: () => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [tabFor.dashboard()],
      activeId: 'dashboard',
      dirty: {},
      queueFilters: DEFAULT_QUEUE_FILTERS,

      open: (tab) =>
        set((state) => {
          const existing = state.tabs.find((t) => t.id === tab.id);
          if (existing) {
            // Keep a better title we already learned (e.g. "BL-1042") over a placeholder.
            return state.activeId === tab.id ? state : { activeId: tab.id };
          }
          let tabs = [...state.tabs, tab];
          if (tabs.length > MAX_TABS) {
            // Evict the oldest clean, closable, inactive tab.
            const victim = tabs.find((t) => t.closable && t.id !== tab.id && !state.dirty[t.id]);
            if (victim) tabs = tabs.filter((t) => t.id !== victim.id);
          }
          return { tabs, activeId: tab.id };
        }),

      close: (id) => {
        const { tabs, activeId, dirty } = get();
        const index = tabs.findIndex((t) => t.id === id);
        const tab = tabs[index];
        if (!tab || !tab.closable) return null;
        const remaining = tabs.filter((t) => t.id !== id);
        const { [id]: _removed, ...restDirty } = dirty;
        let next: WorkspaceTab | null = null;
        if (activeId === id) {
          // Prefer the right-hand neighbour, then the left, then the dashboard.
          next = remaining[index] ?? remaining[index - 1] ?? remaining[0] ?? tabFor.dashboard();
        }
        set({
          tabs: remaining.length ? remaining : [tabFor.dashboard()],
          activeId: next ? next.id : activeId,
          dirty: restDirty,
        });
        return next;
      },

      moveTab: (id, toIndex) =>
        set((state) => {
          const from = state.tabs.findIndex((t) => t.id === id);
          if (from === -1 || !state.tabs[from]?.closable) return state;
          const pinned = state.tabs.filter((t) => !t.closable).length;
          const to = Math.max(pinned, Math.min(toIndex, state.tabs.length - 1));
          if (to === from) return state;
          const tabs = [...state.tabs];
          const [tab] = tabs.splice(from, 1);
          tabs.splice(to, 0, tab!);
          return { tabs };
        }),

      setTitle: (id, title) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id && t.title !== title ? { ...t, title } : t)),
        })),

      setDirty: (id, value) =>
        set((state) =>
          Boolean(state.dirty[id]) === value ? state : { dirty: { ...state.dirty, [id]: value } },
        ),

      setQueueFilters: (patch) =>
        set((state) => ({
          // Any change other than an explicit page change resets to page 1.
          queueFilters: { ...state.queueFilters, ...patch, page: patch.page ?? 1 },
        })),

      resetQueueFilters: () => set({ queueFilters: DEFAULT_QUEUE_FILTERS }),
    }),
    {
      name: 'bookleaf-admin-workspace',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeId: state.activeId,
        queueFilters: state.queueFilters,
      }),
    },
  ),
);

export function hasDirtyTabs(): boolean {
  return Object.values(useWorkspace.getState().dirty).some(Boolean);
}
