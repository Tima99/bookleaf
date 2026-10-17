import type { Logger } from './logger';

/**
 * Tracks fire-and-forget work (e.g. AI triage after ticket creation) so it can be
 * awaited on graceful shutdown and in tests. Failures are logged, never thrown into the
 * request that scheduled them.
 *
 * Production evolution: replace with a durable queue (BullMQ / SQS) so jobs survive
 * restarts — the call sites would not change.
 */
export class BackgroundJobs {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly logger: Logger) {}

  run(name: string, task: () => Promise<void>): void {
    const promise = task()
      .catch((err: unknown) => this.logger.error({ err, job: name }, 'Background job failed'))
      .finally(() => this.pending.delete(promise));
    this.pending.add(promise);
  }

  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
