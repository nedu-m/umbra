const fs = require('fs');
const path = require('path');

const APP_STATE_DIR_NAME = 'cache';
const APP_STATE_FILE_NAME = 'app-state.json';

function getDefaultAppState() {
  return {
    aiProvider: null,
    claudeApiKey: null,
    openaiApiKey: null,
    assemblyAiApiKey: null,
    claudeApiKeyIndex: 0,
    openaiApiKeyIndex: 0,
    claudeModel: null,
    openaiModel: null,
    ollamaBaseUrl: null,
    ollamaModel: null,
    assemblyAiSpeechModel: null,
    programmingLanguage: null,
    windowOpacityLevel: 10,
    themePreference: null
  };
}

function sanitizeAppState(state) {
  const nextState = getDefaultAppState();

  if (state && typeof state === 'object' && !Array.isArray(state)) {
    const aiProvider = String(state.aiProvider ?? '').trim().toLowerCase();
    if (aiProvider === 'claude' || aiProvider === 'openai' || aiProvider === 'ollama') {
      nextState.aiProvider = aiProvider;
    }

    // Support migrating from the old 'geminiApiKey' field name.
    const claudeApiKeyRaw = state.claudeApiKey ?? state.geminiApiKey;
    if (typeof claudeApiKeyRaw === 'string') {
      const claudeApiKey = claudeApiKeyRaw.trim();
      nextState.claudeApiKey = claudeApiKey || null;
    }

    const openaiApiKeyRaw = state.openaiApiKey;
    if (typeof openaiApiKeyRaw === 'string') {
      const openaiApiKey = openaiApiKeyRaw.trim();
      nextState.openaiApiKey = openaiApiKey || null;
    }

    if (typeof state.assemblyAiApiKey === 'string') {
      const assemblyAiApiKey = state.assemblyAiApiKey.trim();
      nextState.assemblyAiApiKey = assemblyAiApiKey || null;
    }

    const claudeApiKeyIndex = Number.parseInt(
      String(state.claudeApiKeyIndex ?? state.geminiApiKeyIndex ?? ''), 10
    );
    if (Number.isFinite(claudeApiKeyIndex) && claudeApiKeyIndex >= 0) {
      nextState.claudeApiKeyIndex = claudeApiKeyIndex;
    }

    const openaiApiKeyIndex = Number.parseInt(
      String(state.openaiApiKeyIndex ?? ''), 10
    );
    if (Number.isFinite(openaiApiKeyIndex) && openaiApiKeyIndex >= 0) {
      nextState.openaiApiKeyIndex = openaiApiKeyIndex;
    }

    const claudeModelRaw = state.claudeModel ?? state.geminiModel;
    if (typeof claudeModelRaw === 'string' && claudeModelRaw.trim()) {
      nextState.claudeModel = claudeModelRaw.trim();
    }

    if (typeof state.openaiModel === 'string' && state.openaiModel.trim()) {
      nextState.openaiModel = state.openaiModel.trim();
    }

    if (typeof state.ollamaBaseUrl === 'string' && state.ollamaBaseUrl.trim()) {
      nextState.ollamaBaseUrl = state.ollamaBaseUrl.trim();
    }

    if (typeof state.ollamaModel === 'string' && state.ollamaModel.trim()) {
      nextState.ollamaModel = state.ollamaModel.trim();
    }

    if (typeof state.assemblyAiSpeechModel === 'string' && state.assemblyAiSpeechModel.trim()) {
      nextState.assemblyAiSpeechModel = state.assemblyAiSpeechModel.trim();
    }

    if (typeof state.programmingLanguage === 'string' && state.programmingLanguage.trim()) {
      nextState.programmingLanguage = state.programmingLanguage.trim();
    }

    const windowOpacityLevel = Number.parseInt(String(state.windowOpacityLevel ?? ''), 10);
    if (Number.isFinite(windowOpacityLevel)) {
      nextState.windowOpacityLevel = Math.min(Math.max(windowOpacityLevel, 1), 10);
    }

    const themePreference = String(state.themePreference ?? '').trim().toLowerCase();
    if (themePreference === 'dark' || themePreference === 'light') {
      nextState.themePreference = themePreference;
    }
  }

  return nextState;
}

function getAppStateBaseDir(app) {
  if (app && !app.isPackaged) {
    return path.join(__dirname, '..', '..', '..');
  }

  if (app) {
    return path.dirname(app.getPath('exe'));
  }

  return path.join(__dirname, '..', '..', '..');
}

function getAppStateDir(app) {
  return path.join(getAppStateBaseDir(app), APP_STATE_DIR_NAME);
}

function getAppStatePath(app) {
  return path.join(getAppStateDir(app), APP_STATE_FILE_NAME);
}

function ensureAppStateDir(app) {
  fs.mkdirSync(getAppStateDir(app), { recursive: true });
}

function writeAppStateFile(app, state) {
  ensureAppStateDir(app);
  fs.writeFileSync(
    getAppStatePath(app),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
}

function loadAppState(app) {
  const appStatePath = getAppStatePath(app);

  try {
    ensureAppStateDir(app);

    if (!fs.existsSync(appStatePath)) {
      const defaultState = getDefaultAppState();
      writeAppStateFile(app, defaultState);
      return defaultState;
    }

    const fileContent = fs.readFileSync(appStatePath, 'utf8');
    const sanitizedState = sanitizeAppState(JSON.parse(fileContent));
    writeAppStateFile(app, sanitizedState);
    return sanitizedState;
  } catch (error) {
    console.error('Failed to load app state:', error);
    return getDefaultAppState();
  }
}

function saveAppState(app, partialState = {}) {
  ensureAppStateDir(app);

  const currentState = loadAppState(app);
  const nextState = sanitizeAppState({
    ...currentState,
    ...partialState
  });

  writeAppStateFile(app, nextState);

  return nextState;
}

module.exports = {
  getDefaultAppState,
  getAppStatePath,
  loadAppState,
  saveAppState
};
