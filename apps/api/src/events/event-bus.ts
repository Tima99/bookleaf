import { EventEmitter } from 'node:events';
import type { TicketEvent } from '@bookleaf/contracts';

/**
 * Publish/subscribe abstraction for ticket events.
 *
 * The in-process implementation is enough for a single API instance. For horizontal
 * scaling, implement the same interface on Redis pub/sub or MongoDB change streams —
 * no caller needs to change.
 */
export interface TicketEventBus {
  publish(event: TicketEvent): void;
  subscribe(listener: (event: TicketEvent) => void): () => void;
}

export class InProcessEventBus implements TicketEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open SSE connection; lift the default cap of 10.
    this.emitter.setMaxListeners(0);
  }

  publish(event: TicketEvent): void {
    this.emitter.emit('ticket', event);
  }

  subscribe(listener: (event: TicketEvent) => void): () => void {
    this.emitter.on('ticket', listener);
    return () => this.emitter.off('ticket', listener);
  }

  listenerCount(): number {
    return this.emitter.listenerCount('ticket');
  }
}
