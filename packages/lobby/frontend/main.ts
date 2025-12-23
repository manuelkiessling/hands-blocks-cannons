/**
 * Lobby frontend application.
 */

interface CreateSessionResponse {
  sessionId: string;
  gameUrl: string;
  joinUrl: string | null;
}

// Screen management
const screens = {
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
let currentSession: CreateSessionResponse | null = null;

// Elements
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
async function createSession(
  opponentType: 'bot' | 'human',
  botDifficulty?: number
): Promise<CreateSessionResponse> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opponentType, botDifficulty }),
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

// Event handlers
function handlePlayBot(): void {
  showScreen('botSettings');
}

function handlePlayHuman(): void {
  startGame('human');
}

function handleBackFromBot(): void {
  showScreen('start');
}

function handleStartBotGame(): void {
  const difficulty = difficultySlider ? Number(difficultySlider.value) / 100 : 0.5;
  startGame('bot', difficulty);
}

async function startGame(opponentType: 'bot' | 'human', botDifficulty?: number): Promise<void> {
  showScreen('loading');
  if (loadingText) {
    loadingText.textContent = 'Creating game session...';
  }

  try {
    currentSession = await createSession(opponentType, botDifficulty);

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
  } catch (err) {
    showError(err instanceof Error ? err.message : 'An unexpected error occurred');
  }
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
  showScreen('start');
}

// Attach event listeners
playBotBtn?.addEventListener('click', handlePlayBot);
playHumanBtn?.addEventListener('click', handlePlayHuman);
backFromBotBtn?.addEventListener('click', handleBackFromBot);
startBotGameBtn?.addEventListener('click', handleStartBotGame);
copyUrlBtn?.addEventListener('click', handleCopyUrl);
cancelGameBtn?.addEventListener('click', handleCancelGame);
joinGameBtn?.addEventListener('click', handleJoinGame);
tryAgainBtn?.addEventListener('click', handleTryAgain);

// Initialize
showScreen('start');
