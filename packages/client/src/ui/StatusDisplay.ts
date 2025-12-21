/**
 * @fileoverview DOM-based status display management.
 */

import type { ConnectionState, HandState } from '../types.js';

/**
 * Manages status displays in the DOM.
 */
export class StatusDisplay {
  private readonly statusElement: HTMLElement;
  private readonly connectionElement: HTMLElement;
  private readonly playerInfoElement: HTMLElement;
  private readonly serverConfigElement: HTMLElement;
  private readonly fallbackElement: HTMLElement;

  constructor() {
    this.statusElement = document.getElementById('status')!;
    this.connectionElement = document.getElementById('connection-status')!;
    this.playerInfoElement = document.getElementById('player-info')!;
    this.serverConfigElement = document.getElementById('server-config')!;
    this.fallbackElement = document.getElementById('fallback')!;
  }

  /**
   * Update the main status text.
   */
  updateStatus(text: string): void {
    this.statusElement.textContent = text;
  }

  /**
   * Update with hand state and opponent info.
   */
  updateInteractionStatus(
    interactionStatus: string,
    handState: HandState,
    opponentConnected: boolean
  ): void {
    const stateText =
      handState === 'outside'
        ? ' (OUT OF BOUNDS)'
        : handState === 'warning'
          ? ' (near edge)'
          : '';
    const opponentText = opponentConnected ? '' : ' [waiting for opponent]';
    this.statusElement.textContent = interactionStatus + stateText + opponentText;
  }

  /**
   * Update connection status display.
   */
  updateConnectionStatus(state: ConnectionState, extra?: string): void {
    let text = `Server: ${state}`;
    if (extra) {
      text += ` - ${extra}`;
    }
    this.connectionElement.textContent = text;
  }

  /**
   * Update player info display.
   */
  updatePlayerInfo(playerId: string, playerNumber: 1 | 2): void {
    this.playerInfoElement.textContent = `Player ${playerNumber} (${playerId})`;
  }

  /**
   * Show the server config dialog.
   */
  showServerConfig(): void {
    this.serverConfigElement.classList.remove('hidden');
  }

  /**
   * Hide the server config dialog.
   */
  hideServerConfig(): void {
    this.serverConfigElement.classList.add('hidden');
  }

  /**
   * Show the fallback screen (camera error).
   */
  showFallback(): void {
    this.fallbackElement.classList.remove('hidden');
  }

  /**
   * Hide the fallback screen.
   */
  hideFallback(): void {
    this.fallbackElement.classList.add('hidden');
  }

  /**
   * Set up connect button handler.
   */
  setupConnectButton(onConnect: (url: string) => void): void {
    const connectBtn = document.getElementById('connect-btn')!;
    const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;

    const handleConnect = (): void => {
      onConnect(serverUrlInput.value);
    };

    connectBtn.addEventListener('click', handleConnect);
    serverUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleConnect();
      }
    });
  }
}

