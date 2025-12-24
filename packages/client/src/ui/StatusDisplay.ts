/**
 * @fileoverview DOM-based status display management.
 */

import type { ConnectionState } from '../types.js';

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
  private readonly handRaiseOverlay: HTMLElement;
  private readonly overlayWebcam: HTMLVideoElement;
  private readonly gameOverOverlay: HTMLElement;
  private readonly gameOverIcon: HTMLElement;
  private readonly gameOverTitle: HTMLElement;
  private readonly gameOverSubtitle: HTMLElement;
  private readonly playAgainBtn: HTMLButtonElement;
  private readonly votingStatus: HTMLElement;

  constructor() {
    this.statusElement = getRequiredElement('status');
    this.connectionElement = getRequiredElement('connection-status');
    this.playerInfoElement = getRequiredElement('player-info');
    this.serverConfigElement = getRequiredElement('server-config');
    this.fallbackElement = getRequiredElement('fallback');
    this.handRaiseOverlay = getRequiredElement('hand-raise-overlay');
    this.overlayWebcam = getRequiredElement('overlay-webcam') as HTMLVideoElement;
    this.gameOverOverlay = getRequiredElement('game-over-overlay');
    this.gameOverIcon = getRequiredElement('game-over-icon');
    this.gameOverTitle = getRequiredElement('game-over-title');
    this.gameOverSubtitle = getRequiredElement('game-over-subtitle');
    this.playAgainBtn = getRequiredElement('play-again-btn') as HTMLButtonElement;
    this.votingStatus = getRequiredElement('voting-status');
  }

  /**
   * Update the main status text.
   */
  updateStatus(text: string): void {
    this.statusElement.textContent = text;
  }

  /**
   * Update with opponent info.
   */
  updateInteractionStatus(interactionStatus: string, opponentConnected: boolean): void {
    const opponentText = opponentConnected ? '' : ' [waiting for opponent]';
    this.statusElement.textContent = interactionStatus + opponentText;
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
   * Show the hand raise overlay (waiting for hand to start game).
   */
  showHandRaiseOverlay(): void {
    this.handRaiseOverlay.classList.remove('hidden');
    this.handRaiseOverlay.classList.remove('fade-out');
  }

  /**
   * Sync the camera stream to the overlay webcam preview.
   */
  syncOverlayCamera(sourceVideo: HTMLVideoElement): void {
    if (sourceVideo.srcObject) {
      this.overlayWebcam.srcObject = sourceVideo.srcObject;
      this.overlayWebcam.play().catch(() => {
        // Ignore autoplay errors - user will see it when they interact
      });
    }
  }

  /**
   * Hide the hand raise overlay with a fade animation.
   */
  hideHandRaiseOverlay(): void {
    this.handRaiseOverlay.classList.add('fade-out');
    // Remove from DOM after animation completes
    setTimeout(() => {
      this.handRaiseOverlay.classList.add('hidden');
    }, 400);
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

  // Store current click handler so we can remove it properly
  private playAgainClickHandler: (() => void) | null = null;

  /**
   * Show the game over overlay.
   * @param isWinner - Whether the local player won
   * @param onPlayAgain - Callback when play again button is clicked
   */
  showGameOverOverlay(isWinner: boolean, onPlayAgain: () => void): void {
    if (isWinner) {
      this.gameOverIcon.textContent = '🏆';
      this.gameOverTitle.textContent = 'Victory!';
      this.gameOverTitle.className = 'victory';
      this.gameOverSubtitle.textContent = 'You destroyed all opponent blocks';
    } else {
      this.gameOverIcon.textContent = '💔';
      this.gameOverTitle.textContent = 'Defeat';
      this.gameOverTitle.className = 'defeat';
      this.gameOverSubtitle.textContent = 'All your blocks were destroyed';
    }

    this.votingStatus.textContent = '';
    this.playAgainBtn.disabled = false;

    // Remove any existing click handler from previous games
    if (this.playAgainClickHandler) {
      this.playAgainBtn.removeEventListener('click', this.playAgainClickHandler);
      this.playAgainClickHandler = null;
    }

    // Set up play again button handler
    this.playAgainClickHandler = (): void => {
      console.log('Play Again button clicked - sending vote');
      this.playAgainBtn.disabled = true;
      this.votingStatus.textContent = 'Waiting for opponent...';
      onPlayAgain();
    };
    this.playAgainBtn.addEventListener('click', this.playAgainClickHandler);

    this.gameOverOverlay.classList.remove('hidden');
    this.gameOverOverlay.classList.remove('fade-out');
  }

  /**
   * Update the play again voting status.
   */
  updatePlayAgainStatus(votedCount: number, totalPlayers: number): void {
    if (votedCount > 0 && votedCount < totalPlayers) {
      this.votingStatus.textContent = `${votedCount}/${totalPlayers} players want to play again...`;
    }
  }

  /**
   * Hide the game over overlay with a fade animation.
   */
  hideGameOverOverlay(): void {
    // Clean up click handler
    if (this.playAgainClickHandler) {
      this.playAgainBtn.removeEventListener('click', this.playAgainClickHandler);
      this.playAgainClickHandler = null;
    }

    this.gameOverOverlay.classList.add('fade-out');
    setTimeout(() => {
      this.gameOverOverlay.classList.add('hidden');
    }, 400);
  }
}
