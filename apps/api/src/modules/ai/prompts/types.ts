import type {
  AiStrategyConfig,
  AiStrategyKind,
  TicketCategory,
  TicketPriority,
} from '@bookleaf/contracts';

/** A strategy resolved to one concrete version (what the model actually runs with). */
export interface ResolvedStrategy {
  /** null when running the in-code default because no DB strategy is enabled. */
  strategyId: string | null;
  name: string;
  kind: AiStrategyKind;
  category: TicketCategory | null;
  version: number;
  config: AiStrategyConfig;
}

export interface ComposedPrompt {
  system: string;
  prompt: string;
}

export interface PromptBook {
  bookCode: string;
  title: string;
  isbn: string | null;
  genre: string;
  status: string;
  stage: 'PUBLISHED' | 'IN_PRODUCTION';
  productionStage: string | null;
  publicationDate: string | null;
  mrp: number | null;
  authorRoyaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
}

export interface PromptTicket {
  reference: string;
  subject: string;
  description: string;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  status: string;
  createdAt: string;
}

export interface PromptHistoryMessage {
  senderType: 'AUTHOR' | 'ADMIN';
  body: string;
  createdAt: string;
}
