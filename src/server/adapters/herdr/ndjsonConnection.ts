import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

export interface NdjsonHandlers {
  onConnect: () => void;
  onMessage: (message: unknown) => void;
  /** `wasConnected` is false when the socket never opened (no herdr server). */
  onClose: (wasConnected: boolean, error: Error | null) => void;
}

/** A unix-socket connection that writes and reads one JSON value per line. */
export class NdjsonConnection {
  private readonly socket: Socket;
  private buffer = '';
  private wasConnected = false;
  private lastError: Error | null = null;

  constructor(socketPath: string, handlers: NdjsonHandlers) {
    this.socket = createConnection(socketPath);
    this.socket.setEncoding('utf8');
    this.socket.on('connect', () => {
      this.wasConnected = true;
      handlers.onConnect();
    });
    this.socket.on('data', (chunk: string) => this.consume(chunk, handlers.onMessage));
    this.socket.on('error', (error) => void (this.lastError = error));
    this.socket.on('close', () => handlers.onClose(this.wasConnected, this.lastError));
  }

  private consume(chunk: string, onMessage: (message: unknown) => void): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line !== '') this.parseLine(line, onMessage);
      newline = this.buffer.indexOf('\n');
    }
  }

  private parseLine(line: string, onMessage: (message: unknown) => void): void {
    try {
      onMessage(JSON.parse(line));
    } catch {
      // A malformed line from herdr is ignored rather than tearing down the connection.
    }
  }

  send(value: unknown): void {
    this.socket.write(`${JSON.stringify(value)}\n`);
  }

  close(): void {
    this.socket.destroy();
  }
}
