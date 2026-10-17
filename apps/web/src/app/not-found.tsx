import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="section-title">404</p>
      <h1 className="page-title">This page doesn&apos;t exist</h1>
      <p className="text-ink-muted">The link may be outdated, or you may not have access to it.</p>
      <Link href="/" className="font-medium text-brand-700 hover:underline">
        Back to BookLeaf Support
      </Link>
    </div>
  );
}
