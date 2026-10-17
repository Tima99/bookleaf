import type { AppConfig } from './config/env';
import { BackgroundJobs } from './common/jobs';
import type { Logger } from './common/logger';
import { InProcessEventBus, type TicketEventBus } from './events/event-bus';
import { AdminService } from './modules/admin/admin.service';
import { createLlmClient, type LlmClient } from './modules/ai/providers';
import { AiRunService } from './modules/ai/services/ai-run.service';
import { ResponseDraftService } from './modules/ai/services/response-draft.service';
import { StrategyTestService } from './modules/ai/services/strategy-test.service';
import { StrategyService } from './modules/ai/services/strategy.service';
import { TriageService } from './modules/ai/services/triage.service';
import { AuditService } from './modules/audit/audit.service';
import { AuthService } from './modules/auth/auth.service';
import { BookService } from './modules/books/book.service';
import { AdminTicketService } from './modules/tickets/admin-ticket.service';
import { AuthorTicketService } from './modules/tickets/author-ticket.service';

export interface ContainerOverrides {
  /** Inject a fake LLM in tests (never call a real provider from the test suite). */
  llm?: LlmClient;
  events?: TicketEventBus;
  now?: () => Date;
}

/**
 * Composition root: wires every service with explicit constructor dependencies.
 * No service imports another service's instance directly, so each is testable in
 * isolation and swappable (LLM provider, event bus, clock).
 */
export function buildContainer(
  config: AppConfig,
  logger: Logger,
  overrides: ContainerOverrides = {},
) {
  const llm = overrides.llm ?? createLlmClient(config, logger);
  const events = overrides.events ?? new InProcessEventBus();
  const jobs = new BackgroundJobs(logger);
  const audit = new AuditService(logger);
  const auth = new AuthService({
    jwtSecret: config.jwtSecret,
    sessionTtlHours: config.sessionTtlHours,
  });
  const books = new BookService(overrides.now);

  const strategies = new StrategyService(audit);
  const runs = new AiRunService(logger);
  const triage = new TriageService({ llm, strategies, runs, events, logger });
  const drafts = new ResponseDraftService({ llm, strategies, runs, logger, now: overrides.now });
  const tester = new StrategyTestService({ strategies, triage, drafts, runs, llm });

  const authorTickets = new AuthorTicketService({ triage, audit, events, jobs });
  const adminTickets = new AdminTicketService({ triage, drafts, audit, events });
  const admin = new AdminService({ audit, runs, llm });

  return {
    config,
    logger,
    llm,
    events,
    jobs,
    audit,
    auth,
    books,
    strategies,
    runs,
    triage,
    drafts,
    tester,
    authorTickets,
    adminTickets,
    admin,
  };
}

export type Container = ReturnType<typeof buildContainer>;
