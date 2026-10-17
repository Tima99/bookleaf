import { Descriptions, Tag } from 'antd';
import type { BookDto } from '@bookleaf/contracts';
import { formatDate, formatINR, formatNumber } from '@bookleaf/utils';
import { BookStageTag } from '@/components/ui/tags';

const NOT_YET = <span className="text-ink-subtle">Available once published</span>;

/** Full book record; handles books in production (null MRP/date/royalty) gracefully. */
export function BookDetails({ book }: { book: BookDto }) {
  const published = book.stage === 'PUBLISHED';
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-xs text-ink-subtle">{book.bookCode}</p>
        <h3 className="font-display text-xl font-bold">{book.title}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <BookStageTag stage={book.stage} productionStage={book.productionStage} />
          <Tag>{book.genre}</Tag>
        </div>
      </div>

      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'isbn',
            label: 'ISBN',
            children: book.isbn ?? (
              <span className="text-ink-subtle">Assigned during production</span>
            ),
          },
          { key: 'status', label: 'Status', children: book.status },
          {
            key: 'publication-date',
            label: 'Publication date',
            children: book.publicationDate ? formatDate(book.publicationDate) : NOT_YET,
          },
          {
            key: 'mrp',
            label: 'MRP',
            children: book.mrp !== null ? formatINR(book.mrp) : NOT_YET,
          },
          {
            key: 'royalty-per-copy',
            label: 'Royalty per copy',
            children:
              book.authorRoyaltyPerCopy !== null ? formatINR(book.authorRoyaltyPerCopy) : NOT_YET,
          },
          {
            key: 'print-partner',
            label: 'Print partner',
            children: book.printPartner ?? (
              <span className="text-ink-subtle">Not assigned yet</span>
            ),
          },
          {
            key: 'available-on',
            label: 'Available on',
            children: book.availableOn.length ? (
              <div className="flex flex-wrap gap-1">
                {book.availableOn.map((p) => (
                  <Tag key={p}>{p}</Tag>
                ))}
              </div>
            ) : (
              <span className="text-ink-subtle">Not listed yet</span>
            ),
          },
        ]}
      />

      <div>
        <p className="section-title mb-2">Sales &amp; royalties</p>
        {published ? (
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Copies sold" value={formatNumber(book.totalCopiesSold)} />
            <Metric label="Royalty earned" value={formatINR(book.totalRoyaltyEarned)} />
            <Metric label="Royalty paid" value={formatINR(book.royaltyPaid)} tone="text-success" />
            <Metric
              label="Royalty pending"
              value={formatINR(book.royaltyPending)}
              tone={book.royaltyPending > 0 ? 'text-warning' : ''}
            />
            <div className="col-span-2 text-xs text-ink-subtle">
              Last payout:{' '}
              {book.lastRoyaltyPayoutDate
                ? formatDate(book.lastRoyaltyPayoutDate)
                : 'no payout yet'}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Sales and royalties will appear here once your book is published and live.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
