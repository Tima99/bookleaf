'use client';

import { Alert, Button, Empty, Skeleton } from 'antd';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api-client';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="mt-1 text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'warning' | 'danger' | 'success';
  icon?: ReactNode;
}) {
  const toneClass = {
    default: 'text-ink',
    brand: 'text-brand-700',
    warning: 'text-warning',
    danger: 'text-danger',
    success: 'text-success',
  }[tone];
  return (
    <div className="surface-card flex h-full flex-col gap-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-muted">{label}</span>
        {icon ? <span className="text-ink-subtle">{icon}</span> : null}
      </div>
      <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
      {hint ? <span className="text-xs text-ink-subtle">{hint}</span> : null}
    </div>
  );
}

export function Section({
  title,
  extra,
  children,
  className = '',
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card min-w-0 p-5 ${className}`}>
      {title || extra ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : <span />}
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-10">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="flex flex-col gap-1">
            <span className="font-medium text-ink">{title}</span>
            {description ? <span className="text-ink-muted">{description}</span> : null}
          </div>
        }
      >
        {action}
      </Empty>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title="We couldn't load this"
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />;
}

/** Restrained page entrance (fade + 6px rise); disabled automatically for reduced motion. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
