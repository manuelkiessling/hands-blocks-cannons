/**
 * @fileoverview Mock WebSocket connection for testing SessionRuntime.
 */

/**
 * Mock connection interface that tracks sent messages.
 */
export interface MockConnection {
  /** Send a message (stores in sentMessages) */
  send(data: string): void;

  /** Close the connection (sets readyState to CLOSED) */
  close(): void;

  /** Current connection state (1 = OPEN, 3 = CLOSED) */
  readonly readyState: number;

  /** WebSocket OPEN constant */
  readonly OPEN: number;

  /** Messages that have been sent through this connection */
  readonly sentMessages: string[];

  /** Whether the connection has been closed */
  readonly isClosed: boolean;

  /** Parse all sent messages as JSON */
  getSentMessagesAsJson<T = unknown>(): T[];

  /** Get the last sent message as JSON */
  getLastMessageAsJson<T = unknown>(): T | undefined;

  /** Clear the sent messages array */
  clearSentMessages(): void;
}

/**
 * Create a mock WebSocket connection for testing.
 *
 * The mock connection:
 * - Starts in OPEN state (readyState = 1)
 * - Stores all sent messages in `sentMessages`
 * - Sets readyState to CLOSED (3) when `close()` is called
 * - Provides helper methods for inspecting messages
 *
 * @example
 * ```typescript
 * const conn = createMockConnection();
 * runtime.handleConnection(conn);
 *
 * // Check what messages were sent
 * expect(conn.sentMessages).toHaveLength(1);
 * const welcome = conn.getLastMessageAsJson();
 * expect(welcome.type).toBe('welcome');
 * ```
 */
export function createMockConnection(): MockConnection {
  const sentMessages: string[] = [];
  let readyState = 1; // OPEN
  let isClosed = false;

  return {
    send(data: string): void {
      if (readyState === 1) {
        sentMessages.push(data);
      }
    },

    close(): void {
      readyState = 3; // CLOSED
      isClosed = true;
    },

    get readyState(): number {
      return readyState;
    },

    get OPEN(): number {
      return 1;
    },

    get sentMessages(): string[] {
      return sentMessages;
    },

    get isClosed(): boolean {
      return isClosed;
    },

    getSentMessagesAsJson<T = unknown>(): T[] {
      return sentMessages.map((msg) => JSON.parse(msg) as T);
    },

    getLastMessageAsJson<T = unknown>(): T | undefined {
      const last = sentMessages[sentMessages.length - 1];
      return last ? (JSON.parse(last) as T) : undefined;
    },

    clearSentMessages(): void {
      sentMessages.length = 0;
    },
  };
}
