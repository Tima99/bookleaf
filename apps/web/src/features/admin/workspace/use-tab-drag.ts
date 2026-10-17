'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import type { WorkspaceTab } from '@/stores/workspace-store';

/** Pointer travel before a press becomes a drag, so ordinary clicks stay clicks. */
const DRAG_THRESHOLD_PX = 5;
/** Dragging this close to the strip's edge scrolls it. */
const AUTO_SCROLL_EDGE_PX = 32;
const AUTO_SCROLL_STEP_PX = 10;
/** Must match the strip's `gap-1`. */
const TAB_GAP_PX = 4;

interface DragState {
  id: string;
  from: number;
  to: number;
  /** How far the dragged tab follows the pointer. */
  dx: number;
  /** How far the tabs it passes move aside: its width plus the gap. */
  shift: number;
}

/**
 * Chrome-style drag to reorder for the workspace tab strip (mouse and pen; touch keeps
 * scrolling the strip). The dragged tab follows the pointer and the tabs it passes slide
 * aside; the store is only updated on drop. Esc cancels. Pinned tabs (Dashboard) can't
 * be moved and nothing can be dropped in front of them.
 */
export function useTabDrag(
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  tabs: WorkspaceTab[],
  moveTab: (id: string, toIndex: number) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, index: number) => {
      const tab = tabs[index];
      const scroller = scrollerRef.current;
      if (e.button !== 0 || e.pointerType === 'touch' || !tab?.closable || !scroller) return;
      if ((e.target as HTMLElement).closest('[data-tab-close]')) return;

      // Positions are captured once; scrolling during the drag is added back to dx, so
      // every comparison below happens in the same (start-of-drag) coordinate frame.
      const rects = Array.from(scroller.querySelectorAll<HTMLElement>('[data-tab-id]')).map((el) =>
        el.getBoundingClientRect(),
      );
      const pinned = tabs.filter((t) => !t.closable).length;
      const self = rects[index];
      const first = rects[pinned];
      const last = rects[rects.length - 1];
      if (!self || !first || !last) return;
      const startX = e.clientX;
      const startScroll = scroller.scrollLeft;
      let current: DragState | null = null;

      const onMove = (ev: PointerEvent) => {
        if (!current && Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX) return;
        const box = scroller.getBoundingClientRect();
        if (ev.clientX < box.left + AUTO_SCROLL_EDGE_PX) scroller.scrollLeft -= AUTO_SCROLL_STEP_PX;
        else if (ev.clientX > box.right - AUTO_SCROLL_EDGE_PX)
          scroller.scrollLeft += AUTO_SCROLL_STEP_PX;

        const raw = ev.clientX - startX + (scroller.scrollLeft - startScroll);
        const dx = Math.max(first.left - self.left, Math.min(raw, last.right - self.right));
        const centre = self.left + self.width / 2 + dx;
        let to = index;
        for (let j = index + 1; j < rects.length; j++) {
          const r = rects[j]!;
          if (centre > r.left + r.width / 2) to = j;
        }
        for (let j = index - 1; j >= pinned; j--) {
          const r = rects[j]!;
          if (centre < r.left + r.width / 2) to = j;
        }
        current = { id: tab.id, from: index, to, dx, shift: self.width + TAB_GAP_PX };
        setDrag(current);
      };

      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        if (!current) return;
        // A drag ends with a click on the tab; don't let it count as "open this tab".
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        if (commit && current.to !== current.from) moveTab(current.id, current.to);
        setDrag(null);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') finish(false);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
    },
    [moveTab, scrollerRef, tabs],
  );

  /** Swallows the click that ends a drag (attach as onClickCapture on the strip). */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    e.stopPropagation();
    e.preventDefault();
    suppressClick.current = false;
  }, []);

  /** Inline style for the tab at `index` while a drag is in progress. */
  const styleFor = (index: number, id: string): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (id === drag.id) return { transform: `translateX(${drag.dx}px)`, zIndex: 10 };
    let offset = 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) offset = -drag.shift;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) offset = drag.shift;
    return {
      transform: offset ? `translateX(${offset}px)` : undefined,
      transition: 'transform 150ms ease-out',
    };
  };

  return { draggingId: drag?.id ?? null, onPointerDown, onClickCapture, styleFor };
}
