'use client';

import { CloseOutlined } from '@ant-design/icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWorkspace } from '@/stores/workspace-store';
import { useTabDrag } from './use-tab-drag';
import { useWorkspaceNav } from './use-workspace-nav';

/** Characters of a label that stay visible however crowded the strip gets. */
const MIN_VISIBLE_CHARS = 8;
/** Horizontal chrome of a closable tab: label padding (12 + 4) + × slot (20 + 6 margin). */
const INACTIVE_TAB_CHROME_PX = 42;

/**
 * Measures label widths with the tab's real font (canvas measureText — no DOM reflow).
 * Returns null until the web font has loaded, so first paint falls back to CSS.
 */
function useLabelWidth(scrollerRef: React.RefObject<HTMLDivElement | null>) {
  const [font, setFont] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      const sample = scrollerRef.current?.querySelector('[role=tab]');
      if (!cancelled && sample) setFont(getComputedStyle(sample).font);
    });
    return () => {
      cancelled = true;
    };
  }, [scrollerRef]);
  return useMemo(() => {
    if (!font) return null;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    ctx.font = font;
    const cache = new Map<string, number>();
    return (text: string) => {
      let w = cache.get(text);
      if (w === undefined) {
        w = Math.ceil(ctx.measureText(text).width);
        cache.set(text, w);
      }
      return w;
    };
  }, [font]);
}

/**
 * Chrome-style workspace tab strip.
 *
 * - Tabs are sized to their own label (max 220px). When space runs out they shrink in
 *   proportion to their width, but each tab's minimum comes from its content: short labels
 *   never truncate and longer ones keep their first few characters. The active tab keeps
 *   its full label. Only when every tab is at its own minimum does the strip scroll.
 * - The scrollbar is hidden; soft shadow fades on the left/right edges appear only when
 *   there is more to scroll in that direction. The mouse wheel scrolls horizontally and
 *   the active tab is always scrolled into view.
 * - Tabs can be dragged to reorder them (see useTabDrag), or moved with Alt+Shift+←/→.
 * - Switching is instant (store first, URL via History API — see useWorkspaceNav); the
 *   underline is a per-tab CSS transform, so it never slides from a stale position.
 */
export function TabBar({ leading }: { leading?: ReactNode }) {
  const tabs = useWorkspace((s) => s.tabs);
  const activeId = useWorkspace((s) => s.activeId);
  const dirty = useWorkspace((s) => s.dirty);
  const moveTab = useWorkspace((s) => s.moveTab);
  const { openTab, closeTab } = useWorkspaceNav();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const labelWidth = useLabelWidth(scrollerRef);
  const { draggingId, onPointerDown, onClickCapture, styleFor } = useTabDrag(
    scrollerRef,
    tabs,
    moveTab,
  );
  // Titles change after data loads (e.g. "Ticket" → "BL-1004 · Diya"), resizing tabs.
  const titlesKey = tabs.map((t) => t.title).join('|');
  const activeTitle = tabs.find((t) => t.id === activeId)?.title;

  /** Content-based minimum width for an inactive tab (null → CSS fallback). */
  const minWidthFor = (title: string, isDirty: boolean): number | null => {
    if (!labelWidth) return null;
    const visible =
      title.length <= MIN_VISIBLE_CHARS
        ? labelWidth(title)
        : Math.min(
            labelWidth(title),
            labelWidth(`${title.slice(0, MIN_VISIBLE_CHARS).trimEnd()}…`),
          );
    return visible + INACTIVE_TAB_CHROME_PX + (isDirty ? 12 : 0);
  };

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Re-measure when the strip resizes (window, sidebar collapse) or tabs change.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, tabs.length, titlesKey]);

  // Vertical mouse wheel scrolls the strip sideways (needs a non-passive listener).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the active tab fully visible — also after its title (and width) changes.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, activeTitle]);

  return (
    <div className="sticky top-0 z-20 flex items-end border-b border-line bg-surface pt-3">
      {leading ? <div className="mb-1.5 shrink-0 pl-3">{leading}</div> : null}
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Open workspaces"
          onScroll={measure}
          onClickCapture={onClickCapture}
          className="flex gap-1 overflow-x-auto scroll-smooth scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab, index) => {
            const active = tab.id === activeId;
            // Chrome-style separator on the right of inactive tabs, hidden next to the active tab.
            const nextIsActive = tabs[index + 1]?.id === activeId;
            const dragging = tab.id === draggingId;
            const separator =
              !draggingId && !active && !nextIsActive && index < tabs.length - 1
                ? 'tab-separator'
                : '';
            const minWidth =
              tab.closable && !active ? minWidthFor(tab.title, Boolean(dirty[tab.id])) : null;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                ref={active ? activeRef : undefined}
                style={{ ...(minWidth === null ? null : { minWidth }), ...styleFor(index, tab.id) }}
                onPointerDown={(e) => onPointerDown(e, index)}
                className={`group relative flex items-center rounded-t-lg select-none transition-colors duration-100 ${
                  dragging ? 'cursor-grabbing bg-surface shadow-md' : ''
                } ${
                  tab.closable && !active
                    ? // Content-sized (max 220px); shrinks in proportion to its width when
                      // space runs out, down to its own content-based minimum (inline style).
                      // 4.5rem is only the fallback until the font has been measured.
                      `max-w-[220px] flex-[0_1_auto] ${minWidth === null ? 'min-w-[4.5rem]' : ''}`
                    : // Active (and pinned) tabs keep their full label, up to 220px.
                      'max-w-[220px] shrink-0'
                } ${active ? 'bg-page text-ink' : 'text-ink-muted hover:bg-brand-50 hover:text-ink'} ${separator}`}
                onAuxClick={(e) => {
                  if (e.button === 1 && tab.closable) {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="flex min-w-0 flex-auto items-center gap-1.5 py-2.5 pr-1 pl-3 text-[13px] font-medium"
                  onClick={() => openTab(tab)}
                  onKeyDown={(e) => {
                    if (!tab.closable || !e.altKey || !e.shiftKey) return;
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                    e.preventDefault();
                    moveTab(tab.id, index + (e.key === 'ArrowLeft' ? -1 : 1));
                  }}
                  aria-keyshortcuts={
                    tab.closable ? 'Alt+Shift+ArrowLeft Alt+Shift+ArrowRight' : undefined
                  }
                  title={tab.title}
                >
                  {dirty[tab.id] ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"
                      aria-label="Unsaved changes"
                    />
                  ) : null}
                  <span className="truncate">{tab.title}</span>
                </button>
                {tab.closable ? (
                  <button
                    type="button"
                    data-tab-close
                    aria-label={`Close ${tab.title}`}
                    onClick={() => closeTab(tab.id)}
                    // Every closable tab reserves the × slot (like Chrome). On inactive tabs the
                    // × fades in on hover/focus inside that slot, so it never covers the title
                    // and hovering never resizes the tab.
                    className={`mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-ink-subtle transition-opacity duration-100 hover:bg-line hover:text-ink ${
                      active
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <CloseOutlined />
                  </button>
                ) : (
                  <span className="w-2 shrink-0" />
                )}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded bg-brand-500 transition-transform duration-150 ease-out ${
                    active ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Edge shadows: visible only when there are more tabs in that direction. */}
        <div
          aria-hidden="true"
          className={`tabstrip-edge tabstrip-edge-left transition-opacity duration-150 ${edges.left ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          aria-hidden="true"
          className={`tabstrip-edge tabstrip-edge-right transition-opacity duration-150 ${edges.right ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  );
}
