/**
 * Lobby frontend application.
 * Allows users to select an application and start a session.
 */

/** Application manifest from the registry */
interface AppManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: readonly string[];
  supportsBot?: boolean;
}

/** Response from fetching available apps */
interface AppsResponse {
  apps: AppManifest[];
}

/** Response from creating a session */
interface CreateSessionResponse {
  sessionId: string;
  appId: string;
  gameUrl: string;
  joinUrl: string | null;
}

// Screen management
const screens = {
  appSelect: document.getElementById('app-select-screen'),
  start: document.getElementById('start-screen'),
  botSettings: document.getElementById('bot-settings'),
  loading: document.getElementById('loading-screen'),
  gameReady: document.getElementById('game-ready'),
  error: document.getElementById('error-screen'),
} as const;

function showScreen(screenId: keyof typeof screens): void {
  for (const [id, element] of Object.entries(screens)) {
    if (element) {
      element.classList.toggle('active', id === screenId);
    }
  }
}

// State
let availableApps: AppManifest[] = [];
let selectedApp: AppManifest | null = null;
let currentSession: CreateSessionResponse | null = null;

// Elements
const appGrid = document.getElementById('app-grid');
const selectedAppName = document.getElementById('selected-app-name');
const backToAppsBtn = document.getElementById('back-to-apps');
const playBotBtn = document.getElementById('play-bot');
const playHumanBtn = document.getElementById('play-human');
const backFromBotBtn = document.getElementById('back-from-bot');
const startBotGameBtn = document.getElementById('start-bot-game');
const difficultySlider = document.getElementById('difficulty') as HTMLInputElement | null;
const loadingText = document.getElementById('loading-text');
const shareSection = document.getElementById('share-section');
const shareUrlInput = document.getElementById('share-url') as HTMLInputElement | null;
const copyUrlBtn = document.getElementById('copy-url');
const cancelGameBtn = document.getElementById('cancel-game');
const joinGameBtn = document.getElementById('join-game');
const errorMessage = document.getElementById('error-message');
const tryAgainBtn = document.getElementById('try-again');

// API functions
async function fetchApps(): Promise<AppManifest[]> {
  const response = await fetch('/api/sessions/apps');
  if (!response.ok) {
    throw new Error('Failed to fetch applications');
  }
  const data: AppsResponse = await response.json();
  return data.apps;
}

async function createSession(
  appId: string,
  opponentType: 'bot' | 'human',
  botDifficulty?: number
): Promise<CreateSessionResponse> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, opponentType, botDifficulty }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create session');
  }

  return response.json();
}

async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

// Render functions
function renderAppCards(apps: AppManifest[]): void {
  if (!appGrid) return;

  if (apps.length === 0) {
    appGrid.innerHTML = `
      <div class="no-apps">
        <p>No applications available</p>
      </div>
    `;
    return;
  }

  appGrid.innerHTML = apps
    .map(
      (app) => `
      <button class="app-card" data-app-id="${app.id}">
        <span class="app-name">${app.name}</span>
        ${app.description ? `<span class="app-desc">${app.description}</span>` : ''}
        ${
          app.tags && app.tags.length > 0
            ? `<div class="app-tags">${app.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}</div>`
            : ''
        }
      </button>
    `
    )
    .join('');

  // Add click listeners to app cards
  for (const card of appGrid.querySelectorAll('.app-card')) {
    card.addEventListener('click', () => {
      const appId = card.getAttribute('data-app-id');
      const app = apps.find((a) => a.id === appId);
      if (app) {
        handleSelectApp(app);
      }
    });
  }
}

// Event handlers
function handleSelectApp(app: AppManifest): void {
  selectedApp = app;
  if (selectedAppName) {
    selectedAppName.textContent = app.name;
  }
  // Show/hide bot button based on app support
  if (playBotBtn) {
    if (app.supportsBot) {
      playBotBtn.classList.remove('hidden');
    } else {
      playBotBtn.classList.add('hidden');
    }
  }
  showScreen('start');
}

function handleBackToApps(): void {
  selectedApp = null;
  showScreen('appSelect');
}

function handlePlayBot(): void {
  showScreen('botSettings');
}

function handlePlayHuman(): void {
  startSession('human');
}

function handleBackFromBot(): void {
  showScreen('start');
}

function handleStartBotGame(): void {
  const difficulty = difficultySlider ? Number(difficultySlider.value) / 100 : 0.5;
  startSession('bot', difficulty);
}

// Countdown duration in seconds before Join button is enabled
const CONTAINER_READY_DELAY_SECONDS = 4;

async function startSession(opponentType: 'bot' | 'human', botDifficulty?: number): Promise<void> {
  if (!selectedApp) {
    showError('No application selected');
    return;
  }

  showScreen('loading');
  if (loadingText) {
    loadingText.textContent = 'Creating session...';
  }

  try {
    currentSession = await createSession(selectedApp.id, opponentType, botDifficulty);

    // Show game ready screen
    showScreen('gameReady');

    // Show share section for human games
    if (shareSection && shareUrlInput) {
      if (opponentType === 'human' && currentSession.joinUrl) {
        shareSection.classList.remove('hidden');
        shareUrlInput.value = currentSession.joinUrl;
      } else {
        shareSection.classList.add('hidden');
      }
    }

    // Disable Join button and show countdown while container starts
    startJoinCountdown();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'An unexpected error occurred');
  }
}

function startJoinCountdown(): void {
  if (!joinGameBtn) return;

  // Disable button and start countdown
  joinGameBtn.setAttribute('disabled', 'true');
  let secondsLeft = CONTAINER_READY_DELAY_SECONDS;

  const updateButtonText = (): void => {
    if (joinGameBtn) {
      joinGameBtn.textContent = `Preparing... ${secondsLeft}s`;
    }
  };

  updateButtonText();

  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      if (joinGameBtn) {
        joinGameBtn.removeAttribute('disabled');
        joinGameBtn.textContent = 'Join';
      }
    } else {
      updateButtonText();
    }
  }, 1000);
}

function handleCopyUrl(): void {
  if (shareUrlInput) {
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
      const originalText = copyUrlBtn?.textContent;
      if (copyUrlBtn) {
        copyUrlBtn.textContent = '✓';
        setTimeout(() => {
          copyUrlBtn.textContent = originalText ?? '📋';
        }, 2000);
      }
    });
  }
}

async function handleCancelGame(): Promise<void> {
  if (currentSession) {
    try {
      await deleteSession(currentSession.sessionId);
    } catch {
      // Ignore errors when canceling
    }
    currentSession = null;
  }
  showScreen('start');
}

function handleJoinGame(): void {
  if (currentSession) {
    window.location.href = currentSession.gameUrl;
  }
}

function showError(message: string): void {
  if (errorMessage) {
    errorMessage.textContent = message;
  }
  showScreen('error');
}

function handleTryAgain(): void {
  currentSession = null;
  if (selectedApp) {
    showScreen('start');
  } else {
    showScreen('appSelect');
  }
}

// Attach event listeners
backToAppsBtn?.addEventListener('click', handleBackToApps);
playBotBtn?.addEventListener('click', handlePlayBot);
playHumanBtn?.addEventListener('click', handlePlayHuman);
backFromBotBtn?.addEventListener('click', handleBackFromBot);
startBotGameBtn?.addEventListener('click', handleStartBotGame);
copyUrlBtn?.addEventListener('click', handleCopyUrl);
cancelGameBtn?.addEventListener('click', handleCancelGame);
joinGameBtn?.addEventListener('click', handleJoinGame);
tryAgainBtn?.addEventListener('click', handleTryAgain);

// Initialize
async function init(): Promise<void> {
  showScreen('appSelect');

  try {
    availableApps = await fetchApps();
    renderAppCards(availableApps);
  } catch (err) {
    if (appGrid) {
      appGrid.innerHTML = `
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <p>Failed to load applications</p>
          <button class="btn primary" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

init();
