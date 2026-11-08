import type { ServerEvent } from '../../shared/types.ts';

export type SseClient = (event: ServerEvent) => void;

/** Fan-out of server events to every open `/api/events` stream. */
export class SseHub {
  private readonly clients = new Set<SseClient>();

  add(client: SseClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  broadcast(event: ServerEvent): void {
    for (const client of this.clients) client(event);
  }

  get size(): number {
    return this.clients.size;
  }
}
