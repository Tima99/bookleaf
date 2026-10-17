'use client';

import {
  BookOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuOutlined,
  MessageOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Button, Drawer, Dropdown } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ClientTicketEvent } from '@bookleaf/contracts';
import { LiveIndicator } from '@/components/ui/live-indicator';
import { useAuth } from '@/features/auth/auth-provider';
import { useTicketEvents } from '@/hooks/use-ticket-events';
import { queryKeys } from '@/lib/endpoints';
import { BrandMark } from './brand';
import { tokens } from '@/styles/tokens';
import { LiveStatusContext } from './live-context';

const NAV = [
  { href: '/author', label: 'Dashboard', icon: <DashboardOutlined /> },
  { href: '/author/books', label: 'My Books', icon: <BookOutlined /> },
  { href: '/author/tickets', label: 'My Tickets', icon: <MessageOutlined /> },
];

function isActive(pathname: string, href: string) {
  return href === '/author' ? pathname === '/author' : pathname.startsWith(href);
}

export function AuthorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  // A reply usually also changes status; show one toast per ticket update, not two.
  const lastToastAt = useRef(new Map<string, number>());

  // One live connection for the whole author portal; events only carry ids, so we
  // simply refresh the affected queries through the authorised REST API.
  const onEvent = useCallback(
    (event: ClientTicketEvent) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.author.ticketsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.author.ticket(event.ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.author.dashboard });
      const recent = Date.now() - (lastToastAt.current.get(event.ticketId) ?? 0) < 3000;
      if (
        event.type === 'ticket.message.created' ||
        (event.type === 'ticket.status.changed' && !recent)
      ) {
        lastToastAt.current.set(event.ticketId, Date.now());
        notification.info({
          key: event.ticketId,
          title:
            event.type === 'ticket.message.created'
              ? `New update on ${event.reference}`
              : `${event.reference} status changed`,
          description: (
            <Link href={`/author/tickets/${event.ticketId}`} className="text-brand-700">
              Open ticket
            </Link>
          ),
          placement: 'bottomRight',
          duration: 5,
        });
      }
    },
    [queryClient, notification],
  );
  const live = useTicketEvents('/tickets/mine/events', onEvent);

  const navLinks = (onClick?: () => void) =>
    NAV.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive(pathname, item.href)
            ? // `!` — antd's global link colour would otherwise override Tailwind here.
              'bg-brand-100 !text-brand-700'
            : '!text-ink-muted hover:bg-brand-50 hover:!text-ink'
        }`}
      >
        {item.icon}
        {item.label}
      </Link>
    ));

  return (
    <LiveStatusContext.Provider value={live}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
            <Button
              type="text"
              className="md:!hidden"
              icon={<MenuOutlined />}
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            />
            <Link href="/author" aria-label="BookLeaf home">
              <BrandMark />
            </Link>
            <nav className="ml-6 hidden items-center gap-1 md:flex">{navLinks()}</nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline">
                <LiveIndicator status={live} />
              </span>
              <Link href="/author/tickets/new">
                <Button type="primary" icon={<PlusOutlined />}>
                  <span className="hidden sm:inline">Raise a query</span>
                </Button>
              </Link>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'who',
                      label: <span className="text-ink-muted">{user?.email}</span>,
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
                  className="flex items-center gap-2 rounded-full p-0.5"
                  aria-label="Account menu"
                >
                  <Avatar style={{ backgroundColor: tokens.color.brand[500] }}>
                    {user?.name.charAt(0)}
                  </Avatar>
                </button>
              </Dropdown>
            </div>
          </div>
        </header>

        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          placement="left"
          size={260}
          title={<BrandMark />}
        >
          <nav className="flex flex-col gap-1">{navLinks(() => setMobileOpen(false))}</nav>
          <div className="mt-6">
            <LiveIndicator status={live} />
          </div>
        </Drawer>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </LiveStatusContext.Provider>
  );
}
