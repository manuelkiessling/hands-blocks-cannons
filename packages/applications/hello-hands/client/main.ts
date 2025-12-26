/**
 * @fileoverview Hello Hands client with camera-based hand tracking.
 *
 * Uses MediaPipe to track hand positions and gestures, then shares them
 * with another participant via WebSocket.
 */

import type { ParticipantId } from '@gesture-app/framework-protocol';
import type {
  ClientMessage,
  HandState,
  HelloHandsWelcomeData,
  ServerMessage,
} from '../src/shared/protocol.js';
import { PARTICIPANT_COLORS } from '../src/shared/types.js';
import { HandTracker, type HandState as TrackerHandState } from './input/HandTracker.js';

// ============ DOM Elements ============

const cameraFeed = document.getElementById('camera-feed') as HTMLVideoElement;
const connectionOverlay = document.getElementById('connection-overlay') as HTMLDivElement;
const cameraOverlay = document.getElementById('camera-overlay') as HTMLDivElement;
const waitingOverlay = document.getElementById('waiting-overlay') as HTMLDivElement;
const readyOverlay = document.getElementById('ready-overlay') as HTMLDivElement;
const waveNotification = document.getElementById('wave-notification') as HTMLDivElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const cameraPreview = document.getElementById('camera-preview') as HTMLDivElement;
const cameraCanvas = document.getElementById('camera-canvas') as HTMLCanvasElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const lobbyLink = document.getElementById('lobby-link') as HTMLAnchorElement;
const trackingStatus = document.getElementById('tracking-status') as HTMLDivElement;
const trackingIndicator = document.getElementById('tracking-indicator') as HTMLSpanElement;
const trackingText = document.getElementById('tracking-text') as HTMLSpanElement;

const connectionStatus = document.getElementById('connection-status') as HTMLDivElement;
const manualConnect = document.getElementById('manual-connect') as HTMLDivElement;
const wsUrlInput = document.getElementById('ws-url') as HTMLInputElement;
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const cameraBtn = document.getElementById('camera-btn') as HTMLButtonElement;
const participantInfo = document.getElementById('participant-info') as HTMLParagraphElement;
const readyStatus = document.getElementById('ready-status') as HTMLParagraphElement;
const waveBtn = document.getElementById('wave-btn') as HTMLButtonElement;
const myColorIndicator = document.getElementById('my-color') as HTMLDivElement;
const friendColorIndicator = document.getElementById('friend-color') as HTMLDivElement;

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Could not get 2D context from canvas');

const cameraCtx = cameraCanvas.getContext('2d');

// ============ State ============

interface AppState {
  ws: WebSocket | null;
  handTracker: HandTracker | null;
  participantId: ParticipantId | null;
  participantNumber: 1 | 2 | null;
  myColor: number;
  friendColor: number;
  phase: 'connecting' | 'camera' | 'waiting' | 'ready' | 'playing' | 'finished';
  myHandState: HandState | null;
  friendHandState: HandState | null;
  hasOpponent: boolean;
  isHandRaised: boolean;
  lastWaveTime: number;
}

const state: AppState = {
  ws: null,
  handTracker: null,
  participantId: null,
  participantNumber: null,
  myColor: PARTICIPANT_COLORS[1],
  friendColor: PARTICIPANT_COLORS[2],
  phase: 'connecting',
  myHandState: null,
  friendHandState: null,
  hasOpponent: false,
  isHandRaised: false,
  lastWaveTime: 0,
};

// Throttle hand updates to avoid flooding the server
const HAND_UPDATE_THROTTLE_MS = 50;
let lastHandUpdateTime = 0;

// ============ Initialization ============

function init(): void {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Button handlers
  connectBtn.addEventListener('click', handleManualConnect);
  cameraBtn.addEventListener('click', handleCameraPermission);
  waveBtn.addEventListener('click', handleWave);

  // Try auto-connect
  tryAutoConnect();

  // Start render loop
  requestAnimationFrame(render);
}

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  cameraCanvas.width = 160;
  cameraCanvas.height = 120;
}

// ============ Connection ============

async function tryAutoConnect(): Promise<void> {
  try {
    const response = await fetch('/session.json');
    if (response.ok) {
      const config = await response.json();
      if (config.wsUrl) {
        connect(config.wsUrl);
        if (config.lobbyUrl) {
          lobbyLink.href = config.lobbyUrl;
        }
        return;
      }
    }
  } catch {
    // Ignore fetch errors
  }

  // Local development mode
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    connectionStatus.textContent = 'Local development mode';
    manualConnect.style.display = 'flex';
  } else {
    const wsUrl = `wss://${location.host}/ws`;
    connect(wsUrl);
  }
}

function handleManualConnect(): void {
  const url = wsUrlInput.value.trim();
  if (url) {
    connect(url);
  }
}

function connect(url: string): void {
  connectionStatus.textContent = `Connecting to ${url}...`;
  manualConnect.style.display = 'none';

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    connectionStatus.textContent = 'Connected! Requesting camera access...';
  };

  state.ws.onmessage = (event) => {
    handleMessage(JSON.parse(event.data));
  };

  state.ws.onclose = () => {
    connectionStatus.textContent = 'Disconnected';
    manualConnect.style.display = 'flex';
    state.phase = 'connecting';
    showOverlay('connection');
  };

  state.ws.onerror = () => {
    connectionStatus.textContent = 'Connection failed';
    manualConnect.style.display = 'flex';
  };
}

function send(message: ClientMessage): void {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(message));
  }
}

// ============ Camera & Hand Tracking ============

async function handleCameraPermission(): Promise<void> {
  cameraBtn.textContent = 'Starting camera...';
  cameraBtn.disabled = true;

  try {
    // Set phase BEFORE starting hand tracker to avoid race condition
    if (state.hasOpponent) {
      state.phase = 'ready';
      showOverlay('ready');
    } else {
      state.phase = 'waiting';
      showOverlay('waiting');
    }

    // Show camera preview and tracking status
    cameraPreview.style.display = 'block';
    trackingStatus.style.display = 'flex';

    // Now initialize and start hand tracking
    state.handTracker = new HandTracker(cameraFeed);
    await state.handTracker.initialize(handleHandUpdate);
    state.handTracker.start();
  } catch (error) {
    console.error('Camera access failed:', error);
    cameraBtn.textContent = 'Camera access denied. Click to retry.';
    cameraBtn.disabled = false;
    // Reset phase on failure
    state.phase = 'camera';
    showOverlay('camera');
  }
}

function handleHandUpdate(hand: TrackerHandState | null): void {
  // Update tracking indicator
  if (hand) {
    trackingIndicator.className = 'detected';
    trackingText.textContent = 'Hand detected';

    state.myHandState = {
      position: hand.position,
      isPinching: hand.isPinching,
      isRaised: hand.isRaised,
    };

    // Check for raised hand (auto-ready)
    if (hand.isRaised && !state.isHandRaised && state.phase === 'ready') {
      state.isHandRaised = true;
      sendReady();
    }

    // Send hand update if playing (throttled)
    const now = Date.now();
    if (state.phase === 'playing' && now - lastHandUpdateTime > HAND_UPDATE_THROTTLE_MS) {
      lastHandUpdateTime = now;
      send({
        type: 'hand_update',
        handState: state.myHandState,
      });
    }

    // Detect wave gesture (rapid up-down motion while raised)
    // For simplicity, we'll use the wave button instead
  } else {
    trackingIndicator.className = 'lost';
    trackingText.textContent = 'No hand detected';
    state.myHandState = null;
  }

  // Draw camera preview with hand overlay
  drawCameraPreview(hand);
}

function drawCameraPreview(hand: TrackerHandState | null): void {
  if (!cameraCtx) return;

  // Draw camera feed
  cameraCtx.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);

  // Draw hand indicator if detected
  if (hand) {
    const x = (1 - hand.position.x) * cameraCanvas.width; // Mirror
    const y = hand.position.y * cameraCanvas.height;
    const radius = hand.isPinching ? 8 : 12;

    cameraCtx.beginPath();
    cameraCtx.arc(x, y, radius, 0, Math.PI * 2);
    cameraCtx.fillStyle = hand.isRaised ? '#4ecdc4' : '#ff6b6b';
    cameraCtx.fill();
    cameraCtx.strokeStyle = '#fff';
    cameraCtx.lineWidth = 2;
    cameraCtx.stroke();
  }
}

// ============ Message Handling ============

function handleMessage(message: ServerMessage | { type: string; [key: string]: unknown }): void {
  switch (message.type) {
    case 'welcome':
      handleWelcome(
        message as ServerMessage &
          HelloHandsWelcomeData & {
            participantId: ParticipantId;
            participantNumber: 1 | 2;
            sessionPhase: string;
          }
      );
      break;

    case 'opponent_joined':
      state.hasOpponent = true;
      if (state.phase === 'waiting') {
        state.phase = 'ready';
        showOverlay('ready');
        // If hand is already raised, send ready immediately
        if (state.myHandState?.isRaised && !state.isHandRaised) {
          state.isHandRaised = true;
          sendReady();
        }
      }
      break;

    case 'opponent_left':
      state.hasOpponent = false;
      state.friendHandState = null;
      if (state.phase === 'playing' || state.phase === 'ready') {
        state.phase = 'waiting';
        showOverlay('waiting');
      }
      break;

    case 'session_started':
      state.phase = 'playing';
      showOverlay(null);
      controls.style.display = 'flex';
      lobbyLink.style.display = 'block';
      break;

    case 'hand_broadcast':
      if ('handState' in message) {
        state.friendHandState = message.handState as HandState;
      }
      break;

    case 'wave_broadcast':
      showWaveNotification();
      break;

    case 'session_ended':
      state.phase = 'finished';
      break;

    case 'session_reset':
      state.phase = 'ready';
      state.friendHandState = null;
      state.isHandRaised = false;
      showOverlay('ready');
      break;

    case 'error':
      console.error('Server error:', message);
      break;
  }
}

function handleWelcome(message: {
  participantId: ParticipantId;
  participantNumber: 1 | 2;
  sessionPhase: string;
  color: number;
  opponentColor?: number;
}): void {
  state.participantId = message.participantId;
  state.participantNumber = message.participantNumber;
  state.myColor = message.color;

  if (message.opponentColor) {
    state.friendColor = message.opponentColor;
    state.hasOpponent = true;
  } else {
    state.friendColor = PARTICIPANT_COLORS[message.participantNumber === 1 ? 2 : 1];
  }

  // Update color indicators
  myColorIndicator.style.backgroundColor = colorToCSS(state.myColor);
  friendColorIndicator.style.backgroundColor = colorToCSS(state.friendColor);

  participantInfo.textContent = `You are participant ${message.participantNumber}`;

  // Show camera permission overlay
  state.phase = 'camera';
  showOverlay('camera');
}

// ============ Actions ============

function sendReady(): void {
  send({ type: 'participant_ready' } as unknown as ClientMessage);
  readyStatus.textContent = 'You raised your hand! Waiting for friend...';
}

function handleWave(): void {
  const now = Date.now();
  if (now - state.lastWaveTime < 1000) return; // Debounce waves
  state.lastWaveTime = now;

  send({ type: 'wave' });

  // Animate button
  waveBtn.style.transform = 'scale(1.2)';
  setTimeout(() => {
    waveBtn.style.transform = '';
  }, 200);
}

// ============ UI Helpers ============

function showOverlay(type: 'connection' | 'camera' | 'waiting' | 'ready' | null): void {
  connectionOverlay.style.display = type === 'connection' ? 'flex' : 'none';
  cameraOverlay.style.display = type === 'camera' ? 'flex' : 'none';
  waitingOverlay.style.display = type === 'waiting' ? 'flex' : 'none';
  readyOverlay.style.display = type === 'ready' ? 'flex' : 'none';

  if (type !== null) {
    controls.style.display = 'none';
  }
}

function showWaveNotification(): void {
  waveNotification.style.display = 'flex';
  setTimeout(() => {
    waveNotification.style.display = 'none';
  }, 2000);
}

function colorToCSS(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// ============ Rendering ============

function render(): void {
  // Clear canvas with gradient
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.phase === 'playing') {
    // Draw friend's hand first (behind)
    if (state.friendHandState) {
      drawHand(
        state.friendHandState.position.x * canvas.width,
        state.friendHandState.position.y * canvas.height,
        state.friendColor,
        state.friendHandState.isPinching,
        'Friend'
      );
    }

    // Draw my hand (in front, mirrored)
    if (state.myHandState) {
      drawHand(
        (1 - state.myHandState.position.x) * canvas.width, // Mirror X
        state.myHandState.position.y * canvas.height,
        state.myColor,
        state.myHandState.isPinching,
        'You'
      );
    }

    // Draw instructions if no hands
    if (!state.myHandState && !state.friendHandState) {
      ctx.font = '24px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('Move your hand in front of the camera!', canvas.width / 2, canvas.height / 2);
    }
  }

  requestAnimationFrame(render);
}

function drawHand(x: number, y: number, color: number, isPinching: boolean, label: string): void {
  const radius = isPinching ? 25 : 35;
  const cssColor = colorToCSS(color);

  // Outer glow
  const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, radius + 30);
  glowGradient.addColorStop(0, `${cssColor}66`);
  glowGradient.addColorStop(1, `${cssColor}00`);
  ctx.beginPath();
  ctx.arc(x, y, radius + 30, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = cssColor;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();

  // Pinch indicator (ring)
  if (isPinching) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Label
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + radius + 30);
}

// ============ Start ============

init();
