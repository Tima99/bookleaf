import { tokens } from '@/styles/tokens';

/**
 * BookLeaf wordmark: pink square with a white slash, after the bookleafpub.in logo
 * (a drawn approximation — swap in the official logo asset for production).
 */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="3" fill={tokens.color.brand[500]} />
        <path d="M18.5 8 13.5 24" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[18px] font-bold text-ink">BookLeaf</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Author Support
          </span>
        </span>
      )}
    </span>
  );
}
