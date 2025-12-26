/**
 * @fileoverview Hello Hands client with camera-based hand tracking.
 *
 * Uses MediaPipe to track hand positions and gestures, then shares them
 * with another participant via WebSocket.
 */

import { resolveSessionConfig, SessionClient } from '@gesture-app/framework-client';
import { drawCameraPreview as drawCameraPreviewFramework } from '@gesture-app/framework-input';
import type { ParticipantId } from '@gesture-app/framework-protocol';
import type {
  ClientMessage,
  HandState,
  HelloHandsResetData,
  HelloHandsWelcomeData,
  ServerMessage,
} from '../src/shared/protocol.js';
import { PARTICIPANT_COLORS } from '../src/shared/types.js';
import {
  extractLandmarks2D,
  HAND_CONNECTIONS,
  HandTracker,
  isHandRaised,
  isPinching,
  LANDMARKS,
  type Point2D,
  type TrackedHand,
} from './input/HandTracker.js';

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

/** Extended hand state with landmarks for local visualization */
interface LocalHandState extends HandState {
  landmarks?: { x: number; y: number }[];
}

interface AppState {
  handTracker: HandTracker | null;
  participantId: ParticipantId | null;
  participantNumber: 1 | 2 | null;
  myColor: number;
  friendColor: number;
  phase: 'connecting' | 'camera' | 'waiting' | 'ready' | 'playing' | 'finished';
  myHandState: LocalHandState | null;
  friendHandState: HandState | null;
  hasOpponent: boolean;
  isHandRaised: boolean;
  lastWaveTime: number;
}

const state: AppState = {
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

// Session client (framework-managed WebSocket)
const sessionClient = new SessionClient<
  ClientMessage,
  ServerMessage,
  HelloHandsWelcomeData,
  undefined,
  HelloHandsResetData
>({
  onConnectionStateChange: handleConnectionStateChange,
  onSessionJoin: handleSessionJoin,
  onOpponentJoined: handleOpponentJoined,
  onOpponentLeft: handleOpponentLeft,
  onSessionStart: handleSessionStart,
  onSessionEnd: handleSessionEnd,
  onSessionReset: handleSessionReset,
  onAppMessage: handleAppMessage,
  onError: handleError,
});

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
  cameraCanvas.width = 240;
  cameraCanvas.height = 180;
}

// ============ Connection ============

async function tryAutoConnect(): Promise<void> {
  const configResult = await resolveSessionConfig();
  if (configResult.mode === 'session') {
    const { wsUrl, lobbyUrl } = configResult.config;
    if (lobbyUrl) {
      lobbyLink.href = lobbyUrl;
    }
    connect(wsUrl);
    return;
  }

  // Local development mode
  connectionStatus.textContent = 'Local development mode';
  manualConnect.style.display = 'flex';
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

  sessionClient.connect(url);
}

function send(message: ClientMessage): void {
  sessionClient.sendAppMessage(message);
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

    // Now initialize and start hand tracking (single-hand mode)
    state.handTracker = new HandTracker(cameraFeed, { maxHands: 1 });
    await state.handTracker.initialize(handleHandsUpdate);
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

function handleHandsUpdate(hands: readonly TrackedHand[]): void {
  // Get first hand if any detected
  const hand = hands[0];

  // Update tracking indicator
  if (hand) {
    trackingIndicator.className = 'detected';
    trackingText.textContent = 'Hand detected';

    // Extract hand state using framework utilities
    const landmarks2D = extractLandmarks2D(hand.landmarks);
    const wrist = hand.landmarks[LANDMARKS.WRIST];
    const indexTip = hand.landmarks[LANDMARKS.INDEX_TIP];
    const middleTip = hand.landmarks[LANDMARKS.MIDDLE_TIP];

    // Calculate palm center
    const position: Point2D =
      wrist && indexTip && middleTip
        ? {
            x: (wrist.x + indexTip.x + middleTip.x) / 3,
            y: (wrist.y + indexTip.y + middleTip.y) / 3,
          }
        : { x: 0.5, y: 0.5 };

    state.myHandState = {
      position,
      isPinching: isPinching(hand.landmarks),
      isRaised: isHandRaised(hand.landmarks),
      landmarks: landmarks2D,
    };

    // Check for raised hand (auto-ready)
    if (state.myHandState.isRaised && !state.isHandRaised && state.phase === 'ready') {
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
  } else {
    trackingIndicator.className = 'lost';
    trackingText.textContent = 'No hand detected';
    state.myHandState = null;
  }

  // Draw camera preview with hand overlay
  drawCameraPreviewLocal(hands[0] ?? null);
}

function drawCameraPreviewLocal(hand: TrackedHand | null): void {
  if (!cameraCtx) return;

  // Extract 2D landmarks if hand detected
  const landmarks2D = hand ? extractLandmarks2D(hand.landmarks) : null;
  const handIsRaised = hand ? isHandRaised(hand.landmarks) : false;
  const handIsPinching = hand ? isPinching(hand.landmarks) : false;

  // Use framework camera preview utility
  drawCameraPreviewFramework(cameraCtx, cameraFeed, landmarks2D, {
    color: handIsRaised ? '#4ecdc4' : '#ff6b6b',
    isPinching: handIsPinching,
  });
}

// ============ Message Handling ============

function handleConnectionStateChange(
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error'
): void {
  switch (connectionState) {
    case 'connecting':
      connectionStatus.textContent = 'Connecting...';
      break;
    case 'connected':
      connectionStatus.textContent = 'Connected! Requesting camera access...';
      break;
    case 'disconnected':
      connectionStatus.textContent = 'Disconnected';
      manualConnect.style.display = 'flex';
      state.phase = 'connecting';
      showOverlay('connection');
      break;
    case 'error':
      connectionStatus.textContent = 'Connection error';
      manualConnect.style.display = 'flex';
      break;
  }
}

function handleSessionJoin(data: {
  participantId: ParticipantId;
  participantNumber: 1 | 2;
  sessionPhase: string;
  appData: HelloHandsWelcomeData;
}): void {
  state.participantId = data.participantId;
  state.participantNumber = data.participantNumber;
  state.myColor = data.appData.color;

  if (data.appData.opponentColor) {
    state.friendColor = data.appData.opponentColor;
    state.hasOpponent = true;
  } else {
    state.friendColor = PARTICIPANT_COLORS[data.participantNumber === 1 ? 2 : 1];
  }

  // Update color indicators
  myColorIndicator.style.backgroundColor = colorToCSS(state.myColor);
  friendColorIndicator.style.backgroundColor = colorToCSS(state.friendColor);

  participantInfo.textContent = `You are participant ${data.participantNumber}`;

  // Show camera permission overlay
  state.phase = 'camera';
  showOverlay('camera');
}

function handleOpponentJoined(_appData?: unknown): void {
  state.hasOpponent = true;
  if (state.phase === 'waiting') {
    state.phase = 'ready';
    showOverlay('ready');
    if (state.myHandState?.isRaised && !state.isHandRaised) {
      state.isHandRaised = true;
      sendReady();
    }
  }
}

function handleOpponentLeft(): void {
  state.hasOpponent = false;
  state.friendHandState = null;
  if (state.phase === 'playing' || state.phase === 'ready') {
    state.phase = 'waiting';
    showOverlay('waiting');
  }
}

function handleSessionStart(): void {
  state.phase = 'playing';
  showOverlay(null);
  controls.style.display = 'flex';
  lobbyLink.style.display = 'block';
}

function handleSessionEnd(): void {
  state.phase = 'finished';
}

function handleSessionReset(appData?: HelloHandsResetData): void {
  state.phase = 'ready';
  state.friendHandState = null;
  state.isHandRaised = false;
  if (appData?.message) {
    readyStatus.textContent = appData.message;
  }
  showOverlay('ready');
}

function handleAppMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'hand_broadcast':
      state.friendHandState = message.handState;
      break;
    case 'wave_broadcast':
      showWaveNotification();
      break;
  }
}

function handleError(message: string): void {
  console.error('Server error:', message);
  connectionStatus.textContent = `Error: ${message}`;
}

// ============ Actions ============

function sendReady(): void {
  sessionClient.sendReady();
  readyStatus.textContent = 'You raised your hand! Waiting for friend...';
}

function handleWave(): void {
  const now = Date.now();
  if (now - state.lastWaveTime < 1000) return; // Debounce waves
  state.lastWaveTime = now;

  sessionClient.sendAppMessage({ type: 'wave' });

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
    // Draw friend's hand first (behind) - no landmarks, just position circle
    if (state.friendHandState) {
      drawHand(
        state.friendHandState.position.x * canvas.width,
        state.friendHandState.position.y * canvas.height,
        state.friendColor,
        state.friendHandState.isPinching,
        'Friend',
        undefined, // Friend's landmarks not sent over network
        false
      );
    }

    // Draw my hand (in front) with full skeleton
    if (state.myHandState) {
      drawHand(
        (1 - state.myHandState.position.x) * canvas.width, // Mirror X
        state.myHandState.position.y * canvas.height,
        state.myColor,
        state.myHandState.isPinching,
        'You',
        state.myHandState.landmarks, // Full skeleton for local hand
        true // Mirror for webcam view
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

function drawHand(
  x: number,
  y: number,
  color: number,
  isPinching: boolean,
  label: string,
  landmarks?: { x: number; y: number }[],
  mirror = false
): void {
  const cssColor = colorToCSS(color);
  const w = canvas.width;
  const h = canvas.height;

  // If we have landmarks, draw the full skeleton
  if (landmarks && landmarks.length >= 21) {
    // Draw connections (bones) with glow
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow layer
    ctx.strokeStyle = `${cssColor}44`;
    ctx.lineWidth = 16;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (pa && pb) {
        const x1 = (mirror ? 1 - pa.x : pa.x) * w;
        const y1 = pa.y * h;
        const x2 = (mirror ? 1 - pb.x : pb.x) * w;
        const y2 = pb.y * h;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Main skeleton
    ctx.strokeStyle = cssColor;
    ctx.lineWidth = 6;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (pa && pb) {
        const x1 = (mirror ? 1 - pa.x : pa.x) * w;
        const y1 = pa.y * h;
        const x2 = (mirror ? 1 - pb.x : pb.x) * w;
        const y2 = pb.y * h;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;

      const lx = (mirror ? 1 - lm.x : lm.x) * w;
      const ly = lm.y * h;

      // Fingertips are larger and brighter
      const isTip =
        i === LANDMARKS.THUMB_TIP ||
        i === LANDMARKS.INDEX_TIP ||
        i === LANDMARKS.MIDDLE_TIP ||
        i === LANDMARKS.RING_TIP ||
        i === LANDMARKS.PINKY_TIP;

      const jointRadius = isTip ? 12 : 6;

      // Glow for tips
      if (isTip) {
        const tipGlow = ctx.createRadialGradient(lx, ly, 0, lx, ly, jointRadius + 15);
        tipGlow.addColorStop(0, `${cssColor}88`);
        tipGlow.addColorStop(1, `${cssColor}00`);
        ctx.beginPath();
        ctx.arc(lx, ly, jointRadius + 15, 0, Math.PI * 2);
        ctx.fillStyle = tipGlow;
        ctx.fill();
      }

      // Joint
      ctx.beginPath();
      ctx.arc(lx, ly, jointRadius, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#fff' : cssColor;
      ctx.fill();

      // Inner highlight on tips
      if (isTip) {
        ctx.beginPath();
        ctx.arc(lx - 2, ly - 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }
    }

    // Pinch indicator
    if (isPinching) {
      const thumb = landmarks[LANDMARKS.THUMB_TIP];
      const index = landmarks[LANDMARKS.INDEX_TIP];
      if (thumb && index) {
        const mx = (mirror ? 1 - (thumb.x + index.x) / 2 : (thumb.x + index.x) / 2) * w;
        const my = ((thumb.y + index.y) / 2) * h;

        // Pinch glow
        const pinchGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 30);
        pinchGlow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        pinchGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        pinchGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(mx, my, 30, 0, Math.PI * 2);
        ctx.fillStyle = pinchGlow;
        ctx.fill();

        // Pinch ring
        ctx.beginPath();
        ctx.arc(mx, my, 18, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Label at wrist
    const wrist = landmarks[LANDMARKS.WRIST];
    if (wrist) {
      const labelX = (mirror ? 1 - wrist.x : wrist.x) * w;
      const labelY = wrist.y * h + 50;
      ctx.font = 'bold 18px "Segoe UI", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(label, labelX, labelY);
      ctx.shadowBlur = 0;
    }
  } else {
    // Fallback: draw simple circle if no landmarks
    const radius = isPinching ? 25 : 35;

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
}

// ============ Start ============

init();
