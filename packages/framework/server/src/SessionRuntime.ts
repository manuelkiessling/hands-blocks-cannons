/**
 * @fileoverview Framework session runtime for two-participant applications.
 *
 * Handles:
 * - 2-participant admission
 * - Connection registry
 * - Lifecycle gating (waiting → playing → finished → reset)
 * - Ready-state management
 * - Play-again voting and reset coordination
 * - Message routing (sender/opponent/all)
 */

import type {
  FrameworkClientMessage,
  ParticipantId,
  ParticipantNumber,
  SessionEndedReason,
  SessionPhase,
} from '@gesture-app/framework-protocol';

type FrameworkWelcomeMessage<TWelcomeData> = {
  type: 'welcome';
  participantId: ParticipantId;
  participantNumber: ParticipantNumber;
  sessionPhase: SessionPhase;
  appData: TWelcomeData;
};

type FrameworkOpponentJoinedMessage<TOpponentJoinedData> = {
  type: 'opponent_joined';
  appData?: TOpponentJoinedData;
};

type FrameworkOpponentLeftMessage = {
  type: 'opponent_left';
};

type FrameworkSessionStartedMessage = {
  type: 'session_started';
};

type FrameworkSessionEndedMessage<TSessionEndedData> = {
  type: 'session_ended';
  reason: SessionEndedReason;
  winnerId?: ParticipantId;
  winnerNumber?: ParticipantNumber;
  appData?: TSessionEndedData;
};

type FrameworkPlayAgainStatusMessage = {
  type: 'play_again_status';
  votedParticipantIds: ParticipantId[];
  totalParticipants: number;
};

type FrameworkSessionResetMessage<TResetData> = {
  type: 'session_reset';
  appData?: TResetData;
};

type FrameworkErrorMessage = {
  type: 'error';
  message: string;
};

type FrameworkServerMessage<TWelcomeData, TResetData, TOpponentJoinedData, TSessionEndedData> =
  | FrameworkWelcomeMessage<TWelcomeData>
  | FrameworkOpponentJoinedMessage<TOpponentJoinedData>
  | FrameworkOpponentLeftMessage
  | FrameworkSessionStartedMessage
  | FrameworkSessionEndedMessage<TSessionEndedData>
  | FrameworkPlayAgainStatusMessage
  | FrameworkSessionResetMessage<TResetData>
  | FrameworkErrorMessage;

type SessionServerMessage<
  TWelcomeData,
  TResetData,
  TOpponentJoinedData,
  TSessionEndedData,
  TAppServerMessage,
> =
  | FrameworkServerMessage<TWelcomeData, TResetData, TOpponentJoinedData, TSessionEndedData>
  | TAppServerMessage;

/**
 * WebSocket-like interface for connection abstraction.
 * Allows testing without real WebSocket connections.
 */
export interface Connection {
  /** Send a message to this connection */
  send(data: string): void;
  /** Close this connection */
  close(): void;
  /** Connection state (1 = OPEN) */
  readonly readyState: number;
  /** WebSocket OPEN constant */
  readonly OPEN: number;
}

/**
 * Participant state tracked by the framework.
 */
export interface Participant {
  readonly id: ParticipantId;
  readonly number: ParticipantNumber;
  /** Whether this participant is ready (e.g., raised hand) */
  readonly isReady: boolean;
  /** Whether this participant is a bot */
  readonly isBot: boolean;
  /** Whether this participant voted to play again */
  readonly wantsPlayAgain: boolean;
}

/**
 * Message routing targets.
 */
export type MessageTarget = 'sender' | 'opponent' | 'all';

/**
 * Response to be sent after handling a message.
 */
export interface MessageResponse<TMessage> {
  readonly target: MessageTarget;
  readonly message: TMessage;
}

/**
 * Application hooks interface.
 * Apps implement this to integrate with the session runtime.
 */
export interface AppHooks<
  TAppClientMessage extends { type: string },
  TAppServerMessage extends { type: string },
  TWelcomeData,
  TResetData = undefined,
  TOpponentJoinedData = undefined,
  TSessionEndedData = undefined,
> {
  /**
   * Generate participant ID.
   * @param participantNumber - 1 or 2
   */
  generateParticipantId(participantNumber: ParticipantNumber): ParticipantId;

  /**
   * Called when a participant joins.
   * Return data to include in the welcome message.
   */
  onParticipantJoin(participant: Participant): TWelcomeData;

  /**
   * Called when a participant leaves.
   */
  onParticipantLeave(participantId: ParticipantId): void;

  /**
   * Handle an incoming app-specific message.
   * @returns Updated responses to send
   */
  onMessage(
    message: TAppClientMessage,
    senderId: ParticipantId,
    phase: SessionPhase
  ): MessageResponse<TAppServerMessage>[];

  /**
   * Called when the session starts (both participants ready).
   */
  onSessionStart(): void;

  /**
   * Called when all participants vote to play again.
   * Return data for the reset message.
   */
  onReset(): TResetData;

  /**
   * Called when a participant joins and an opponent notification will be sent.
   * Return data to include in the opponent_joined message.
   */
  onOpponentJoined?(joiningParticipant: Participant): TOpponentJoinedData | undefined;

  /**
   * Called when the session ends, before sending session_ended.
   * Return data to include in the session_ended message.
   */
  onSessionEnd?(info: {
    winnerId: ParticipantId;
    winnerNumber: ParticipantNumber;
    reason: SessionEndedReason;
  }): TSessionEndedData | undefined;

  /**
   * Called on each tick (if tick-based updates are enabled).
   * @param deltaTime - Time since last tick in seconds
   * @returns Messages to broadcast
   */
  onTick?(deltaTime: number): TAppServerMessage[];

  /**
   * Check if the session should end (app-specific win/end condition).
   * @returns End data if session should end, null otherwise
   */
  checkSessionEnd?(): {
    winnerId: ParticipantId;
    winnerNumber: ParticipantNumber;
    appData?: TSessionEndedData;
  } | null;
}

/**
 * Session runtime configuration.
 */
export interface SessionRuntimeConfig {
  /** Maximum participants (always 2) */
  readonly maxParticipants: 2;
  /** Enable tick-based updates */
  readonly tickEnabled: boolean;
  /** Tick interval in milliseconds (if enabled) */
  readonly tickIntervalMs: number;
}

/**
 * Default session runtime configuration.
 */
export const DEFAULT_RUNTIME_CONFIG: SessionRuntimeConfig = {
  maxParticipants: 2,
  tickEnabled: false,
  tickIntervalMs: 16,
};

/**
 * Session runtime manages the lifecycle of a two-participant session.
 */
export class SessionRuntime<
  TAppClientMessage extends { type: string },
  TAppServerMessage extends { type: string },
  TWelcomeData,
  TResetData = undefined,
  TOpponentJoinedData = undefined,
  TSessionEndedData = undefined,
> {
  private readonly connections = new Map<Connection, ParticipantId>();
  private readonly participants = new Map<ParticipantId, Participant>();
  private phase: SessionPhase = 'waiting';
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = Date.now();

  private static readonly FRAMEWORK_CLIENT_MESSAGE_TYPES = new Set([
    'participant_ready',
    'bot_identify',
    'play_again_vote',
  ]);

  constructor(
    private readonly config: SessionRuntimeConfig,
    private readonly hooks: AppHooks<
      TAppClientMessage,
      TAppServerMessage,
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData
    >,
    private readonly serializeMessage: (
      message: SessionServerMessage<
        TWelcomeData,
        TResetData,
        TOpponentJoinedData,
        TSessionEndedData,
        TAppServerMessage
      >
    ) => string,
    private readonly parseMessage: (
      data: string
    ) => FrameworkClientMessage | TAppClientMessage | null
  ) {}

  // ============ Connection Management ============

  /**
   * Handle a new connection.
   * @returns Participant info if joined, null if rejected
   */
  handleConnection(conn: Connection): Participant | null {
    const participantNumber = this.getNextParticipantNumber();

    if (participantNumber === null) {
      // Session is full
      this.sendTo(conn, {
        type: 'error',
        message: 'Session is full. Only 2 participants allowed.',
      });
      conn.close();
      return null;
    }

    const participantId = this.hooks.generateParticipantId(participantNumber);

    const participant: Participant = {
      id: participantId,
      number: participantNumber,
      isReady: false,
      isBot: false,
      wantsPlayAgain: false,
    };

    this.participants.set(participantId, participant);
    this.connections.set(conn, participantId);

    // Get app-specific welcome data
    const welcomeData = this.hooks.onParticipantJoin(participant);

    // Send welcome message
    this.sendTo(conn, {
      type: 'welcome',
      participantId,
      participantNumber,
      sessionPhase: this.phase,
      appData: welcomeData,
    });

    // Notify opponent with optional app payload
    const opponentData = this.hooks.onOpponentJoined?.(participant);
    this.broadcastToOthers(conn, {
      type: 'opponent_joined',
      appData: opponentData,
    });

    return participant;
  }

  /**
   * Handle a connection closing.
   */
  handleDisconnection(conn: Connection): void {
    const participantId = this.connections.get(conn);
    if (!participantId) return;

    this.hooks.onParticipantLeave(participantId);
    this.participants.delete(participantId);
    this.connections.delete(conn);

    const remainingParticipant = [...this.participants.values()].find(
      (p) => p.id !== participantId
    );

    if (this.phase === 'playing') {
      const winnerId = remainingParticipant?.id;
      const winnerNumber = remainingParticipant?.number;
      this.endSession(winnerId, winnerNumber, 'participant_left');
    }

    // Notify remaining participant(s)
    this.broadcastToOthers(conn, {
      type: 'opponent_left',
    });
  }

  /**
   * Handle an incoming message.
   */
  handleMessage(conn: Connection, rawData: string): void {
    const participantId = this.connections.get(conn);
    if (!participantId) return;

    const message = this.parseFrameworkOrAppMessage(rawData);
    if (!message) {
      this.sendTo(conn, {
        type: 'error',
        message: 'Invalid message format',
      });
      return;
    }

    // Handle framework-level messages
    if (this.isFrameworkClientMessage(message)) {
      this.handleFrameworkMessage(conn, participantId, message);
      return;
    }

    // Delegate to app handler
    const responses = this.hooks.onMessage(message as TAppClientMessage, participantId, this.phase);
    this.sendResponses(conn, responses);
  }

  private isFrameworkClientMessage(
    message: FrameworkClientMessage | TAppClientMessage
  ): message is FrameworkClientMessage {
    return SessionRuntime.FRAMEWORK_CLIENT_MESSAGE_TYPES.has(message.type);
  }

  private parseFrameworkOrAppMessage(
    rawData: string
  ): FrameworkClientMessage | TAppClientMessage | null {
    try {
      const parsed = JSON.parse(rawData) as { type?: string };
      if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
        if (this.isFrameworkClientMessage(parsed as FrameworkClientMessage)) {
          return parsed as FrameworkClientMessage;
        }
      }
    } catch {
      // fall through to app parser
    }

    return this.parseMessage(rawData);
  }

  // ============ Framework Message Handlers ============

  /**
   * Handle framework-level messages.
   * @returns true if message was handled, false to delegate to app
   */
  private handleFrameworkMessage(
    _conn: Connection,
    participantId: ParticipantId,
    message: FrameworkClientMessage
  ): void {
    switch (message.type) {
      case 'participant_ready':
        this.handleParticipantReady(participantId);
        return;

      case 'bot_identify':
        this.handleBotIdentify(participantId);
        return;

      case 'play_again_vote':
        this.handlePlayAgainVote(participantId);
        return;
    }
  }

  /**
   * Mark a participant as ready.
   */
  private handleParticipantReady(participantId: ParticipantId): void {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    this.participants.set(participantId, {
      ...participant,
      isReady: true,
    });

    this.checkAndStartSession();
  }

  /**
   * Mark a participant as a bot (automatically ready).
   */
  private handleBotIdentify(participantId: ParticipantId): void {
    const participant = this.participants.get(participantId);
    if (!participant) return;

    this.participants.set(participantId, {
      ...participant,
      isBot: true,
      isReady: true,
    });

    this.checkAndStartSession();
  }

  /**
   * Handle a play-again vote.
   */
  private handlePlayAgainVote(participantId: ParticipantId): void {
    if (this.phase !== 'finished') return;

    const participant = this.participants.get(participantId);
    if (!participant) return;

    this.participants.set(participantId, {
      ...participant,
      wantsPlayAgain: true,
    });

    // Broadcast vote status
    const votedIds = this.getPlayAgainVoters();
    this.broadcastToAll({
      type: 'play_again_status',
      votedParticipantIds: votedIds,
      totalParticipants: this.participants.size,
    });

    // Check if all want to play again
    if (this.allParticipantsWantPlayAgain()) {
      this.resetSession();
    }
  }

  // ============ Lifecycle Management ============

  /**
   * Check if session should start and start it.
   */
  private checkAndStartSession(): void {
    if (this.phase !== 'waiting') return;

    const allReady = this.areAllParticipantsReady();
    if (!allReady) return;

    this.phase = 'playing';
    this.hooks.onSessionStart();

    this.broadcastToAll({
      type: 'session_started',
    });

    // Start tick loop if enabled
    if (this.config.tickEnabled) {
      this.startTickLoop();
    }
  }

  /**
   * End the session with a winner.
   */
  endSession(
    winnerId: ParticipantId | undefined,
    winnerNumber: ParticipantNumber | undefined,
    reason: SessionEndedReason,
    appDataFromCaller?: TSessionEndedData
  ): void {
    if (this.phase !== 'playing') return;

    this.phase = 'finished';
    this.stopTickLoop();

    let appData = appDataFromCaller;

    if (!appData && winnerId && winnerNumber) {
      const hookData = this.hooks.onSessionEnd?.({ winnerId, winnerNumber, reason });
      if (hookData !== undefined) {
        appData = hookData as TSessionEndedData;
      }
    }

    this.broadcastToAll({
      type: 'session_ended',
      winnerId,
      winnerNumber,
      reason,
      appData,
    });
  }

  /**
   * Reset the session for a new round.
   */
  private resetSession(): void {
    // Get reset data from app
    const resetData = this.hooks.onReset();

    // Reset participant states
    for (const [id, p] of this.participants) {
      this.participants.set(id, {
        ...p,
        isReady: p.isBot, // Bots stay ready
        wantsPlayAgain: false,
      });
    }

    // Transition to waiting
    this.phase = 'waiting';

    // Broadcast reset
    this.broadcastToAll({
      type: 'session_reset',
      appData: resetData,
    });
  }

  // ============ Tick Loop ============

  private startTickLoop(): void {
    this.lastTickTime = Date.now();
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      if (this.phase !== 'playing') return;

      // Call app tick hook
      const messages = this.hooks.onTick?.(deltaTime) ?? [];
      for (const msg of messages) {
        this.broadcastToAll(msg);
      }

      // Check for session end
      const endResult = this.hooks.checkSessionEnd?.();
      if (endResult) {
        this.endSession(
          endResult.winnerId,
          endResult.winnerNumber,
          'app_condition',
          endResult.appData
        );
      }
    }, this.config.tickIntervalMs);
  }

  private stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Stop the session runtime.
   */
  stop(): void {
    this.stopTickLoop();
  }

  // ============ Message Routing ============

  private sendTo(
    conn: Connection,
    message: SessionServerMessage<
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData,
      TAppServerMessage
    >
  ): void {
    if (conn.readyState === conn.OPEN) {
      conn.send(this.serializeMessage(message));
    }
  }

  private broadcastToAll(
    message: SessionServerMessage<
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData,
      TAppServerMessage
    >
  ): void {
    const serialized = this.serializeMessage(message);
    for (const conn of this.connections.keys()) {
      if (conn.readyState === conn.OPEN) {
        conn.send(serialized);
      }
    }
  }

  private broadcastToOthers(
    senderConn: Connection,
    message: SessionServerMessage<
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData,
      TAppServerMessage
    >
  ): void {
    const serialized = this.serializeMessage(message);
    for (const conn of this.connections.keys()) {
      if (conn !== senderConn && conn.readyState === conn.OPEN) {
        conn.send(serialized);
      }
    }
  }

  private sendResponses(
    senderConn: Connection,
    responses: MessageResponse<TAppServerMessage>[]
  ): void {
    for (const response of responses) {
      switch (response.target) {
        case 'sender':
          this.sendTo(senderConn, response.message);
          break;
        case 'opponent':
          this.broadcastToOthers(senderConn, response.message);
          break;
        case 'all':
          this.broadcastToAll(response.message);
          break;
      }
    }
  }

  // ============ Queries ============

  private getNextParticipantNumber(): ParticipantNumber | null {
    const numbers = new Set([...this.participants.values()].map((p) => p.number));
    if (!numbers.has(1)) return 1;
    if (!numbers.has(2)) return 2;
    return null;
  }

  private areAllParticipantsReady(): boolean {
    if (this.participants.size < 2) return false;
    return [...this.participants.values()].every((p) => p.isReady);
  }

  private getPlayAgainVoters(): ParticipantId[] {
    return [...this.participants.values()].filter((p) => p.wantsPlayAgain).map((p) => p.id);
  }

  private allParticipantsWantPlayAgain(): boolean {
    if (this.participants.size === 0) return false;
    return [...this.participants.values()].every((p) => p.wantsPlayAgain);
  }

  // ============ Public Queries ============

  /** Get current session phase */
  getPhase(): SessionPhase {
    return this.phase;
  }

  /** Get participant count */
  getParticipantCount(): number {
    return this.participants.size;
  }

  /** Get a participant by ID */
  getParticipant(id: ParticipantId): Participant | undefined {
    return this.participants.get(id);
  }

  /** Get all participants */
  getAllParticipants(): Participant[] {
    return [...this.participants.values()];
  }

  /** Get connection for a participant */
  getConnection(participantId: ParticipantId): Connection | undefined {
    for (const [conn, id] of this.connections) {
      if (id === participantId) return conn;
    }
    return undefined;
  }

  /** Send a message to a specific participant */
  sendToParticipant(
    participantId: ParticipantId,
    message: SessionServerMessage<
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData,
      TAppServerMessage
    >
  ): void {
    const conn = this.getConnection(participantId);
    if (conn) {
      this.sendTo(conn, message);
    }
  }

  /** Broadcast a message to all participants */
  broadcast(
    message: SessionServerMessage<
      TWelcomeData,
      TResetData,
      TOpponentJoinedData,
      TSessionEndedData,
      TAppServerMessage
    >
  ): void {
    this.broadcastToAll(message);
  }
}
