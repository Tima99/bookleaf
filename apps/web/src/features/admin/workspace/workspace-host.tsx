'use client';

import { memo, useEffect } from 'react';
import { hasDirtyTabs, useWorkspace, type WorkspaceTab } from '@/stores/workspace-store';
import { AdminDashboardView } from '../views/dashboard-view';
import { AuthorDetailView } from '../views/author-detail-view';
import { AuthorsView } from '../views/authors-view';
import { KnowledgeBaseView } from '../views/knowledge-base-view';
import { StrategiesView } from '../views/strategies-view';
import { StrategyDetailView } from '../views/strategy-detail-view';
import { TicketQueueView } from '../views/ticket-queue-view';
import { TicketWorkspaceView } from '../views/ticket-workspace-view';

/**
 * Memoised: switching tabs only changes `active`, so hidden tabs (tables, editors) don't
 * re-render on every switch. A tab re-renders when its own descriptor changes.
 */
const TabContent = memo(function TabContent({ tab }: { tab: WorkspaceTab }) {
  switch (tab.kind) {
    case 'dashboard':
      return <AdminDashboardView />;
    case 'queue':
      return <TicketQueueView />;
    case 'ticket':
      return tab.entityId ? <TicketWorkspaceView ticketId={tab.entityId} tabId={tab.id} /> : null;
    case 'authors':
      return <AuthorsView />;
    case 'author':
      return tab.entityId ? <AuthorDetailView authorId={tab.entityId} tabId={tab.id} /> : null;
    case 'ai':
      return <StrategiesView />;
    case 'strategy':
      return tab.entityId ? <StrategyDetailView strategyId={tab.entityId} tabId={tab.id} /> : null;
    case 'knowledge':
      return <KnowledgeBaseView />;
  }
});

/**
 * Renders every open tab and keeps inactive ones mounted (hidden), so switching tabs
 * preserves scroll position, filters and unsaved text. Each tab is keyed by its stable
 * id, so the same ticket is never rendered twice.
 */
export function WorkspaceHost() {
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);

  // Warn before a full page unload while any tab has unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirtyTabs()) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          // Inactive panels use `content-visibility: hidden` (not display:none): the browser
          // keeps their rendered layout cached, so switching back doesn't re-layout big
          // tables. `inert` keeps them out of focus order and the accessibility tree.
          <div
            key={tab.id}
            role="tabpanel"
            aria-hidden={!active}
            inert={!active}
            className={active ? 'animate-[tab-in_120ms_ease-out]' : 'workspace-panel-hidden'}
          >
            <TabContent tab={tab} />
          </div>
        );
      })}
    </>
  );
}
