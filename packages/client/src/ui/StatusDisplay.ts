/**
 * @fileoverview DOM-based status display management.
 */

import type { ConnectionState, HandState } from '../types.js';

/**
 * Get a required DOM element by ID, throwing if not found.
 */
function getRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required DOM element not found: #${id}`);
  }
  return element;
}

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
    this.statusElement = getRequiredElement('status');
    this.connectionElement = getRequiredElement('connection-status');
    this.playerInfoElement = getRequiredElement('player-info');
    this.serverConfigElement = getRequiredElement('server-config');
    this.fallbackElement = getRequiredElement('fallback');
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
      handState === 'outside' ? ' (OUT OF BOUNDS)' : handState === 'warning' ? ' (near edge)' : '';
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
    const connectBtn = getRequiredElement('connect-btn');
    const serverUrlInput = getRequiredElement('server-url') as HTMLInputElement;

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
