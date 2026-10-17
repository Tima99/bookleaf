'use client';

import { Avatar, Tag, Tooltip } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import type { ResponseOrigin, TicketMessageDto } from '@bookleaf/contracts';
import { formatDateTime } from '@bookleaf/utils';
import { tokens } from '@/styles/tokens';

const ORIGIN_LABEL: Record<ResponseOrigin, { label: string; tip: string } | null> = {
  MANUAL: null,
  AI_DRAFT_EDITED: {
    label: 'AI draft · edited',
    tip: 'Started from an AI draft and edited before sending',
  },
  AI_DRAFT_UNEDITED: { label: 'AI draft', tip: 'Sent from an AI draft without edits' },
  TEMPLATE: { label: 'Template', tip: 'Started from a policy template' },
};

interface Message extends TicketMessageDto {
  origin?: ResponseOrigin | null;
}

/**
 * Chronological public conversation. The original query is shown first as the author's
 * opening message. `perspective` controls which side is "us" for alignment.
 */
export function Conversation({
  opening,
  messages,
  perspective,
}: {
  opening: { authorName: string; body: string; createdAt: string };
  messages: Message[];
  perspective: 'AUTHOR' | 'ADMIN';
}) {
  const all: Message[] = [
    {
      id: 'opening',
      senderType: 'AUTHOR',
      senderName: opening.authorName,
      body: opening.body,
      createdAt: opening.createdAt,
    },
    ...messages,
  ];
  return (
    <ol className="flex flex-col gap-4" aria-label="Conversation">
      <AnimatePresence initial={false}>
        {all.map((m, i) => {
          const mine = m.senderType === perspective;
          const team = m.senderType === 'ADMIN';
          const origin = m.origin ? ORIGIN_LABEL[m.origin] : null;
          return (
            <motion.li
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}
            >
              <Avatar
                size={32}
                style={{
                  backgroundColor: team ? tokens.color.brand[500] : tokens.color.accent[500],
                  flexShrink: 0,
                }}
              >
                {m.senderName.charAt(0)}
              </Avatar>
              <div className={`max-w-[85%] ${mine ? 'items-end text-right' : ''} flex flex-col`}>
                <div
                  className={`mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle ${mine ? 'justify-end' : ''}`}
                >
                  <span className="font-medium text-ink">{m.senderName}</span>
                  {team ? (
                    <Tag color="blue" className="!m-0 !text-[10px]">
                      BookLeaf team
                    </Tag>
                  ) : null}
                  {i === 0 ? <Tag className="!m-0 !text-[10px]">Original query</Tag> : null}
                  {origin ? (
                    <Tooltip title={origin.tip}>
                      <Tag className="!m-0 !text-[10px]">{origin.label}</Tag>
                    </Tooltip>
                  ) : null}
                  <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                </div>
                <div
                  className={`prose-message rounded-xl border px-4 py-3 text-left text-[14px] ${
                    team ? 'border-brand-100 bg-brand-50/70' : 'border-line bg-surface'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
