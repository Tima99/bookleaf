'use client';

import { useQuery } from '@tanstack/react-query';
import { Tag } from 'antd';
import { TICKET_CATEGORY_LABELS } from '@bookleaf/contracts';
import { ErrorState, LoadingBlock, PageHeader, Section } from '@/components/ui/primitives';
import { endpoints, queryKeys } from '@/lib/endpoints';

/** Read-only view of the policy knowledge base the AI drafts from. */
export function KnowledgeBaseView() {
  const kb = useQuery({
    queryKey: queryKeys.ai.knowledgeBase,
    queryFn: endpoints.ai.knowledgeBase,
    staleTime: Infinity,
  });
  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="BookLeaf's policies that AI follows when it writes draft replies. They are not used to choose a ticket's category or priority."
      />
      {kb.isPending ? (
        <LoadingBlock rows={8} />
      ) : kb.isError ? (
        <ErrorState error={kb.error} onRetry={() => void kb.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {kb.data.map((s) => (
            <Section key={s.id} title={s.title}>
              <div className="mb-3 flex flex-wrap gap-1">
                {s.categories.length ? (
                  s.categories.map((c) => (
                    <Tag key={c} color="blue">
                      {TICKET_CATEGORY_LABELS[c]}
                    </Tag>
                  ))
                ) : (
                  <Tag>Used for every reply</Tag>
                )}
              </div>
              <p className="prose-message text-[13px] text-ink-muted">{s.content}</p>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
