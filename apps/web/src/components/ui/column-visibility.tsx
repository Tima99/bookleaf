'use client';

import { SettingOutlined } from '@ant-design/icons';
import { Button, Checkbox, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState, type ReactNode } from 'react';

const STORAGE_PREFIX = 'bookleaf:columns:';

interface Options {
  /** Column keys that can't be hidden (e.g. the primary identifier column). */
  locked?: readonly string[];
  /** Column keys hidden until the viewer turns them on. */
  defaultHidden?: readonly string[];
}

function readHidden(storageKey: string, fallback: readonly string[]): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [...fallback];
  } catch {
    // Storage unavailable (private mode, blocked site data) — use defaults.
    return [...fallback];
  }
}

function writeHidden(storageKey: string, hidden: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(hidden));
  } catch {
    // Non-critical per-viewer preference; ignore when storage is unavailable.
  }
}

function columnKey<T>(column: ColumnsType<T>[number]): string {
  return String(column.key ?? ('dataIndex' in column ? column.dataIndex : ''));
}

function columnLabel<T>(column: ColumnsType<T>[number]): string {
  return typeof column.title === 'string' && column.title ? column.title : columnKey(column);
}

/**
 * Show/hide table columns from a "Columns" dropdown. The choice is a per-viewer
 * convenience remembered in localStorage (per table), never sent to the server.
 *
 * Every column must have a stable `key`; columns without a title (e.g. action buttons)
 * are always shown and not listed.
 */
export function useColumnVisibility<T>(
  storageKey: string,
  columns: ColumnsType<T>,
  options: Options = {},
): { visibleColumns: ColumnsType<T>; columnSettings: ReactNode } {
  const { locked = [], defaultHidden = [] } = options;
  const [hidden, setHidden] = useState<string[]>(() =>
    typeof window === 'undefined' ? [...defaultHidden] : readHidden(storageKey, defaultHidden),
  );
  const [open, setOpen] = useState(false);

  const toggleable = columns.filter((c) => columnLabel(c) && typeof c.title === 'string');

  const update = (next: string[]) => {
    setHidden(next);
    writeHidden(storageKey, next);
  };

  const visibleColumns = useMemo(
    () => columns.filter((c) => locked.includes(columnKey(c)) || !hidden.includes(columnKey(c))),
    [columns, hidden, locked],
  );

  const hiddenCount = toggleable.filter((c) => hidden.includes(columnKey(c))).length;

  const columnSettings = (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={(next, info) => {
        // Keep the panel open while checkboxes are toggled.
        if (info.source === 'trigger' || !next) setOpen(next);
      }}
      placement="bottomRight"
      popupRender={() => (
        <div
          className="min-w-52 rounded-lg border border-line bg-surface p-3 shadow-lg"
          role="dialog"
          aria-label="Show or hide columns"
        >
          <p className="section-title mb-2">Show columns</p>
          <div className="flex flex-col gap-1.5">
            {toggleable.map((c) => {
              const key = columnKey(c);
              const isLocked = locked.includes(key);
              return (
                <Checkbox
                  key={key}
                  checked={isLocked || !hidden.includes(key)}
                  disabled={isLocked}
                  onChange={(e) =>
                    update(e.target.checked ? hidden.filter((h) => h !== key) : [...hidden, key])
                  }
                >
                  {columnLabel(c)}
                </Checkbox>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between gap-2 border-t border-divider pt-2">
            <Button size="small" type="link" className="!px-0" onClick={() => update([])}>
              Show all
            </Button>
            <Button
              size="small"
              type="link"
              className="!px-0"
              onClick={() => update([...defaultHidden])}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    >
      <Button icon={<SettingOutlined />} aria-label="Choose visible columns">
        Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ''}
      </Button>
    </Dropdown>
  );

  return { visibleColumns, columnSettings };
}
