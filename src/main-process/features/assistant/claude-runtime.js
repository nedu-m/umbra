const ClaudeService = require('../../../services/ai/claude-service');
const OllamaService = require('../../../services/ai/ollama-service');
const {
  resolveAiProvider,
  getAiProviders,
  getDefaultAiProvider,
  getDefaultOllamaBaseUrl,
  getDefaultOllamaModel,
  resolveClaudeModel,
  resolveProgrammingLanguage,
  getClaudeModels,
  getDefaultClaudeModel,
  getProgrammingLanguages,
  getDefaultProgrammingLanguage
} = require('../../../config');

const CLAUDE_ALL_KEYS_UNAVAILABLE_ERROR_CODE = 'CLAUDE_ALL_KEYS_UNAVAILABLE';

function normalizeClaudeApiKeys(keys) {
  const sourceValues = Array.isArray(keys)
    ? keys
    : String(keys ?? '').split(',');
  const seen = new Set();
  const nextKeys = [];

  for (const rawValue of sourceValues) {
    const key = String(rawValue || '').trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    nextKeys.push(key);
  }

  return nextKeys;
}

function createClaudeRuntime() {
  let claudeService = null;
  let ollamaService = null;
  let activeAiProvider = getDefaultAiProvider();
  let activeClaudeModel = getDefaultClaudeModel();
  let activeProgrammingLanguage = getDefaultProgrammingLanguage();
  let activeOllamaBaseUrl = getDefaultOllamaBaseUrl();
  let activeOllamaModel = getDefaultOllamaModel();
  let claudeApiKeys = [];
  let activeApiKeyIndex = 0;
  let activeKeyIndexChangeHandler = null;

  function notifyActiveKeyIndexChanged(index) {
    if (typeof activeKeyIndexChangeHandler !== 'function') {
      return;
    }
    try {
      activeKeyIndexChangeHandler(index);
    } catch (error) {
      console.error('Failed to persist active Claude API key index:', error);
    }
  }

  function normalizeKeyIndex(index) {
    if (claudeApiKeys.length === 0) {
      return 0;
    }
    const parsedIndex = Number.parseInt(String(index ?? ''), 10);
    const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;
    const maxIndex = claudeApiKeys.length - 1;
    return Math.min(Math.max(safeIndex, 0), maxIndex);
  }

  function setActiveApiKeyIndex(index, options = {}) {
    const nextIndex = normalizeKeyIndex(index);
    const shouldNotify = options.notify !== false;
    const changed = nextIndex !== activeApiKeyIndex;
    activeApiKeyIndex = nextIndex;

    if (changed && shouldNotify) {
      notifyActiveKeyIndexChanged(activeApiKeyIndex);
    }

    return activeApiKeyIndex;
  }

  function getActiveApiKey() {
    if (claudeApiKeys.length === 0) {
      return '';
    }
    return claudeApiKeys[activeApiKeyIndex] || '';
  }

  function hasApiKeys() {
    return claudeApiKeys.length > 0;
  }

  function initializeClaudeService(
    apiKey = getActiveApiKey(),
    modelName = activeClaudeModel,
    programmingLanguage = activeProgrammingLanguage
  ) {
    activeClaudeModel = resolveClaudeModel(modelName);
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);

    try {
      if (!apiKey) {
        console.error('Claude API key not configured in app settings');
        claudeService = null;
        return null;
      }

      console.log(
        'Initializing Claude AI Service with model and language:',
        activeClaudeModel,
        activeProgrammingLanguage
      );

      if (claudeService) {
        claudeService.updateConfiguration({
          apiKey,
          modelName: activeClaudeModel,
          programmingLanguage: activeProgrammingLanguage
        });
      } else {
        claudeService = new ClaudeService(apiKey, {
          modelName: activeClaudeModel,
          programmingLanguage: activeProgrammingLanguage
        });
      }

      console.log('Claude AI Service initialized successfully');
      return claudeService;
    } catch (error) {
      claudeService = null;
      console.error('Failed to initialize Claude AI Service:', error);
      return null;
    }
  }

  function setKeys(apiKeys, preferredIndex = 0) {
    claudeApiKeys = normalizeClaudeApiKeys(apiKeys);

    if (!hasApiKeys()) {
      setActiveApiKeyIndex(0);
      claudeService = null;
      return {
        claudeApiKeys: [],
        activeApiKeyIndex: 0,
        activeApiKey: ''
      };
    }

    setActiveApiKeyIndex(preferredIndex);

    return {
      claudeApiKeys: [...claudeApiKeys],
      activeApiKeyIndex,
      activeApiKey: getActiveApiKey()
    };
  }

  function getApiKeys() {
    return [...claudeApiKeys];
  }

  function switchToNextKey() {
    if (!hasApiKeys()) {
      return { switched: false, activeApiKeyIndex, activeApiKey: '' };
    }

    if (claudeApiKeys.length === 1) {
      return { switched: false, activeApiKeyIndex, activeApiKey: getActiveApiKey() };
    }

    const previousIndex = activeApiKeyIndex;
    const nextIndex = (activeApiKeyIndex + 1) % claudeApiKeys.length;
    setActiveApiKeyIndex(nextIndex);

    if (nextIndex === previousIndex) {
      return { switched: false, activeApiKeyIndex, activeApiKey: getActiveApiKey() };
    }

    initializeClaudeService(getActiveApiKey(), activeClaudeModel, activeProgrammingLanguage);

    return { switched: true, activeApiKeyIndex, activeApiKey: getActiveApiKey() };
  }

  function isSwitchEligibleError(error) {
    if (!error) {
      return false;
    }
    if (claudeService?.isQuotaExhaustedError?.(error)) {
      return true;
    }
    if (claudeService?.isAuthenticationError?.(error)) {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();
    const status = error?.status;
    return (
      status === 401 ||
      status === 403 ||
      status === 429 ||
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('invalid api key') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    );
  }

  function createAllKeysUnavailableError(cause) {
    const err = new Error(
      'All configured Claude API keys are currently unavailable due to quota or authentication errors.'
    );
    err.code = CLAUDE_ALL_KEYS_UNAVAILABLE_ERROR_CODE;
    err.isAllKeysUnavailable = true;
    if (cause) {
      err.cause = cause;
    }
    return err;
  }

  function isAllKeysUnavailableError(error) {
    return Boolean(
      error && (
        error.code === CLAUDE_ALL_KEYS_UNAVAILABLE_ERROR_CODE ||
        error.isAllKeysUnavailable === true
      )
    );
  }

  async function executeWithKeyFailover(operation) {
    if (typeof operation !== 'function') {
      throw new Error('AI failover operation must be a function.');
    }

    // Ollama path — no key failover
    if (activeAiProvider === 'ollama') {
      if (!ollamaService) {
        initializeOllamaService();
      }
      if (!ollamaService) {
        throw new Error('Ollama service not available. Check that Ollama is running.');
      }
      return await operation(ollamaService, {
        activeApiKeyIndex: 0,
        activeApiKey: '',
        attempt: 1,
        totalKeys: 0
      });
    }

    if (!hasApiKeys()) {
      throw new Error('No Claude API key configured. Add it in Settings.');
    }

    const totalKeys = claudeApiKeys.length;
    const startIndex = activeApiKeyIndex;
    let attemptedKeys = 0;
    let lastSwitchEligibleError = null;

    while (attemptedKeys < totalKeys) {
      const activeApiKey = getActiveApiKey();
      if (!activeApiKey) {
        break;
      }

      if (!claudeService || claudeService.apiKey !== activeApiKey) {
        initializeClaudeService(activeApiKey, activeClaudeModel, activeProgrammingLanguage);
      }

      try {
        return await operation(claudeService, {
          activeApiKeyIndex,
          activeApiKey,
          attempt: attemptedKeys + 1,
          totalKeys
        });
      } catch (error) {
        if (!isSwitchEligibleError(error)) {
          throw error;
        }

        lastSwitchEligibleError = error;
        attemptedKeys += 1;

        if (attemptedKeys >= totalKeys) {
          if (activeApiKeyIndex !== startIndex) {
            setActiveApiKeyIndex(startIndex);
            initializeClaudeService(getActiveApiKey(), activeClaudeModel, activeProgrammingLanguage);
          }
          throw createAllKeysUnavailableError(lastSwitchEligibleError);
        }

        switchToNextKey();
      }
    }

    throw createAllKeysUnavailableError(lastSwitchEligibleError);
  }

  function initializeOllamaService(
    baseUrl = activeOllamaBaseUrl,
    modelName = activeOllamaModel,
    programmingLanguage = activeProgrammingLanguage
  ) {
    activeOllamaBaseUrl = String(baseUrl || getDefaultOllamaBaseUrl()).replace(/\/+$/, '');
    activeOllamaModel = String(modelName || getDefaultOllamaModel()).trim();
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);

    try {
      console.log(
        'Initializing Ollama AI Service with model and language:',
        activeOllamaModel,
        activeProgrammingLanguage
      );

      if (ollamaService) {
        ollamaService.updateConfiguration({
          baseUrl: activeOllamaBaseUrl,
          modelName: activeOllamaModel,
          programmingLanguage: activeProgrammingLanguage
        });
      } else {
        ollamaService = new OllamaService({
          baseUrl: activeOllamaBaseUrl,
          modelName: activeOllamaModel,
          programmingLanguage: activeProgrammingLanguage
        });
      }

      console.log('Ollama AI Service initialized successfully');
      return ollamaService;
    } catch (error) {
      ollamaService = null;
      console.error('Failed to initialize Ollama AI Service:', error);
      return null;
    }
  }

  function initializeAiService() {
    if (activeAiProvider === 'ollama') {
      return initializeOllamaService(activeOllamaBaseUrl, activeOllamaModel, activeProgrammingLanguage);
    }
    return initializeClaudeService(getActiveApiKey(), activeClaudeModel, activeProgrammingLanguage);
  }

  function setActiveAiProvider(providerName) {
    activeAiProvider = resolveAiProvider(providerName);
    return activeAiProvider;
  }

  function getActiveAiProvider() {
    return activeAiProvider;
  }

  function setActiveOllamaBaseUrl(baseUrl) {
    activeOllamaBaseUrl = String(baseUrl || getDefaultOllamaBaseUrl()).replace(/\/+$/, '');
    return activeOllamaBaseUrl;
  }

  function getActiveOllamaBaseUrl() {
    return activeOllamaBaseUrl;
  }

  function setActiveOllamaModel(modelName) {
    activeOllamaModel = String(modelName || getDefaultOllamaModel()).trim();
    return activeOllamaModel;
  }

  function getActiveOllamaModel() {
    return activeOllamaModel;
  }

  function getService() {
    if (activeAiProvider === 'ollama') {
      return ollamaService;
    }
    return claudeService;
  }

  function getActiveClaudeModel() {
    return activeClaudeModel;
  }

  function getActiveProgrammingLanguage() {
    return activeProgrammingLanguage;
  }

  function setActiveClaudeModel(modelName) {
    activeClaudeModel = resolveClaudeModel(modelName);
    return activeClaudeModel;
  }

  function setActiveProgrammingLanguage(language) {
    activeProgrammingLanguage = resolveProgrammingLanguage(language);
    return activeProgrammingLanguage;
  }

  function setActiveKeyIndexChangeHandler(handler) {
    activeKeyIndexChangeHandler = typeof handler === 'function' ? handler : null;
  }

  return {
    initializeClaudeService,
    initializeOllamaService,
    initializeAiService,
    setKeys,
    getApiKeys,
    hasApiKeys,
    getActiveApiKey,
    getActiveApiKeyIndex: () => activeApiKeyIndex,
    switchToNextKey,
    executeWithKeyFailover,
    isAllKeysUnavailableError,
    setActiveKeyIndexChangeHandler,
    getService,
    getAiProviders,
    getDefaultAiProvider,
    getActiveAiProvider,
    setActiveAiProvider,
    getClaudeModels,
    getDefaultClaudeModel,
    getActiveClaudeModel,
    setActiveClaudeModel,
    getDefaultOllamaBaseUrl,
    getDefaultOllamaModel,
    getActiveOllamaBaseUrl,
    setActiveOllamaBaseUrl,
    getActiveOllamaModel,
    setActiveOllamaModel,
    getProgrammingLanguages,
    getDefaultProgrammingLanguage,
    getActiveProgrammingLanguage,
    setActiveProgrammingLanguage
  };
}

module.exports = {
  CLAUDE_ALL_KEYS_UNAVAILABLE_ERROR_CODE,
  createClaudeRuntime
};
