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
        description="BookLeaf policies used to ground AI drafts. Only the 1–3 sections relevant to a ticket are sent with each request."
      />
      {kb.isPending ? (
        <LoadingBlock rows={8} />
      ) : kb.isError ? (
        <ErrorState error={kb.error} onRetry={() => void kb.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {kb.data.map((s) => (
            <Section
              key={s.id}
              title={s.title}
              extra={<span className="text-xs text-ink-subtle">~{s.approxTokens} tokens</span>}
            >
              <div className="mb-3 flex flex-wrap gap-1">
                <Tag className="!font-mono">{s.id}</Tag>
                {s.categories.length ? (
                  s.categories.map((c) => (
                    <Tag key={c} color="blue">
                      {TICKET_CATEGORY_LABELS[c]}
                    </Tag>
                  ))
                ) : (
                  <Tag>System prompt (always)</Tag>
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
