'use client';

import {
  BookOutlined,
  DashboardOutlined,
  EllipsisOutlined,
  ExperimentOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Tooltip } from 'antd';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ClientTicketEvent } from '@bookleaf/contracts';
import { LiveIndicator } from '@/components/ui/live-indicator';
import { useAuth } from '@/features/auth/auth-provider';
import { TabBar } from '@/features/admin/workspace/tab-bar';
import { useWorkspaceNav } from '@/features/admin/workspace/use-workspace-nav';
import { useTicketEvents } from '@/hooks/use-ticket-events';
import { queryKeys } from '@/lib/endpoints';
import { tabFor, tabFromPath, useWorkspace, type TabKind } from '@/stores/workspace-store';
import { BrandMark } from './brand';
import { tokens } from '@/styles/tokens';
import { LiveStatusContext } from './live-context';

const NAV: Array<{
  key: TabKind;
  label: string;
  icon: ReactNode;
  tab: () => ReturnType<typeof tabFor.dashboard>;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardOutlined />, tab: tabFor.dashboard },
  { key: 'queue', label: 'Ticket queue', icon: <InboxOutlined />, tab: tabFor.queue },
  { key: 'authors', label: 'Authors', icon: <TeamOutlined />, tab: tabFor.authors },
  { key: 'ai', label: 'AI settings', icon: <ExperimentOutlined />, tab: tabFor.ai },
  { key: 'knowledge', label: 'Knowledge base', icon: <BookOutlined />, tab: tabFor.knowledge },
];

const KIND_TO_NAV: Partial<Record<TabKind, TabKind>> = {
  ticket: 'queue',
  author: 'authors',
  strategy: 'ai',
};

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { openTab } = useWorkspaceNav();
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const activeTab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeId));
  const openInStore = useWorkspace((s) => s.open);
  const pathname = usePathname();

  // The URL is the source of truth: Back/Forward and deep links activate the matching tab.
  useEffect(() => {
    const tab = tabFromPath(pathname);
    if (tab) openInStore(tab);
  }, [pathname, openInStore]);

  const onEvent = useCallback(
    (event: ClientTicketEvent) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ticketsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.ticket(event.ticketId) });
      if (event.type === 'ticket.created') {
        notification.info({
          title: `New ticket ${event.reference}`,
          description: (
            <Button
              size="small"
              type="link"
              className="!px-0"
              onClick={() => openTab(tabFor.ticket(event.ticketId, event.reference))}
            >
              Open in a tab
            </Button>
          ),
          placement: 'bottomRight',
        });
      }
    },
    [queryClient, notification, openTab],
  );
  const live = useTicketEvents('/admin/events', onEvent);

  const selectedNav = activeTab ? (KIND_TO_NAV[activeTab.kind] ?? activeTab.kind) : 'dashboard';

  /** Sidebar body shared by the desktop sider and the mobile drawer. */
  const sidebar = (mode: 'sider' | 'drawer') => {
    const isCollapsed = mode === 'sider' && collapsed;
    const toggleLabel =
      mode === 'drawer' ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    return (
      <div className="flex h-full flex-col">
        {/* Logo doubles as the collapse / expand control. */}
        <Tooltip title={toggleLabel} placement="right" mouseEnterDelay={0.6}>
          <button
            type="button"
            aria-label={toggleLabel}
            aria-expanded={mode === 'sider' ? !collapsed : undefined}
            onClick={() => (mode === 'drawer' ? setDrawerOpen(false) : setCollapsed((c) => !c))}
            className={`mx-3 mt-4 mb-3 flex items-center rounded-xl py-2 text-left transition-colors hover:bg-brand-50 ${
              isCollapsed ? 'justify-center px-0' : 'px-2'
            }`}
          >
            <BrandMark compact={isCollapsed} />
          </button>
        </Tooltip>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Menu
            theme="light"
            mode="inline"
            inlineCollapsed={isCollapsed}
            selectedKeys={[selectedNav]}
            items={NAV.map((n) => ({ key: n.key, icon: n.icon, label: n.label }))}
            onClick={({ key }) => {
              const item = NAV.find((n) => n.key === key);
              if (item) openTab(item.tab());
              setDrawerOpen(false);
            }}
            className="!border-0 !bg-transparent px-2"
          />
        </div>

        {/* Footer: live-update status + profile menu. */}
        <div
          className={`flex flex-col gap-2 border-t border-line p-3 ${isCollapsed ? 'items-center' : ''}`}
        >
          <div className={isCollapsed ? '' : 'px-1'}>
            <LiveIndicator status={live} compact={isCollapsed} />
          </div>
          <Dropdown
            trigger={['click']}
            placement={isCollapsed ? 'topLeft' : 'top'}
            menu={{
              items: [
                {
                  key: 'who',
                  label: (
                    <span className="flex flex-col">
                      <span className="font-medium text-ink">{user?.name}</span>
                      <span className="text-xs text-ink-muted">{user?.email}</span>
                    </span>
                  ),
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Sign out',
                  onClick: () => void logout(),
                },
              ],
            }}
          >
            <button
              type="button"
              aria-label="Account menu"
              className={`flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-brand-100 ${
                isCollapsed ? 'justify-center' : ''
              }`}
            >
              <Avatar style={{ backgroundColor: tokens.color.brand[500], flexShrink: 0 }}>
                {user?.name.charAt(0)}
              </Avatar>
              {!isCollapsed && (
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold text-ink">{user?.name}</span>
                  <span className="truncate text-xs text-ink-muted">{user?.email}</span>
                </span>
              )}
              {!isCollapsed && <EllipsisOutlined className="text-ink-subtle" />}
            </button>
          </Dropdown>
        </div>
      </div>
    );
  };

  return (
    <LiveStatusContext.Provider value={live}>
      <Layout className="min-h-screen">
        {!isMobile && (
          <Layout.Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            width={248}
            collapsedWidth={76}
            trigger={null}
            className="!sticky top-0 h-screen border-r border-line !bg-gradient-to-b from-surface to-brand-50"
          >
            {sidebar('sider')}
          </Layout.Sider>
        )}
        <Drawer
          open={isMobile && drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          size={268}
          styles={{ body: { padding: 0 }, header: { display: 'none' } }}
        >
          {sidebar('drawer')}
        </Drawer>

        <Layout className="min-w-0">
          <TabBar
            leading={
              isMobile ? (
                <Button
                  type="text"
                  aria-label="Open navigation"
                  icon={<MenuOutlined />}
                  onClick={() => setDrawerOpen(true)}
                />
              ) : null
            }
          />
          <Layout.Content className="min-w-0 p-4 sm:p-6">{children}</Layout.Content>
        </Layout>
      </Layout>
    </LiveStatusContext.Provider>
  );
}
