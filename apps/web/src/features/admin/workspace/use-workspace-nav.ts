'use client';

import { App } from 'antd';
import { useCallback } from 'react';
import { useWorkspace, type WorkspaceTab } from '@/stores/workspace-store';

/**
 * Updates the URL for a workspace tab with the native History API. Next.js syncs
 * `usePathname` with it, but — unlike `router.push` — it doesn't fetch the route or
 * re-render the document <head>, so switching tabs is instant and the browser tab's
 * title/favicon never flicker. Tab content is rendered client-side by WorkspaceHost.
 */
function syncUrl(href: string): void {
  if (window.location.pathname !== href) window.history.pushState(null, '', href);
}

/** Opening, switching and closing workspace tabs, kept in sync with the URL. */
export function useWorkspaceNav() {
  const { modal } = App.useApp();
  const open = useWorkspace((s) => s.open);
  const close = useWorkspace((s) => s.close);

  const openTab = useCallback(
    (tab: WorkspaceTab) => {
      open(tab);
      syncUrl(tab.href);
    },
    [open],
  );

  const closeTab = useCallback(
    (id: string) => {
      const doClose = () => {
        const next = close(id);
        if (next) syncUrl(next.href);
      };
      if (useWorkspace.getState().dirty[id]) {
        modal.confirm({
          title: 'Discard unsaved changes?',
          content:
            'This tab has text you haven’t sent or saved. Closing it will discard those changes.',
          okText: 'Discard and close',
          okButtonProps: { danger: true },
          cancelText: 'Keep editing',
          onOk: doClose,
        });
      } else {
        doClose();
      }
    },
    [close, modal],
  );

  return { openTab, closeTab };
}
