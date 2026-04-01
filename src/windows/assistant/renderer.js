/// <reference path="./renderer-globals.d.ts" />

import { createMessageStore } from './renderer/features/ai-context/message-store.js';
import { buildFilteredAiContextBundle as buildAiContextBundle } from './renderer/features/ai-context/context-bundle.js';
import { updateMessageAiToggleUi as syncMessageAiToggleUi } from './renderer/features/ai-context/toggle-ui.js';
import { createChatUiManager } from './renderer/features/chat/chat-ui-manager.js';
import { createWindowAdjustmentManager } from './renderer/features/layout/window-adjustments.js';
import { setupEventListeners as setupEventListenersModule } from './renderer/features/listeners/event-listeners.js';
import { setupIpcListeners as setupIpcListenersModule } from './renderer/features/listeners/ipc-listeners.js';
import { createShortcutManager } from './renderer/features/settings/shortcut-manager.js';
import { createSettingsPanelManager } from './renderer/features/settings/settings-panel-manager.js';
import { createTranscriptionManager } from './renderer/features/transcription/transcription-manager.js';

import {
    createTranscriptionSourceState,
    normalizeSource as normalizeAssemblySource,
    sourceLabel as resolveSourceLabel
} from './renderer/features/assembly-ai/source-state.js';
import { createAudioPipeline } from './renderer/features/assembly-ai/audio-pipeline.js';
import { createTranscriptBufferManager } from './renderer/features/assembly-ai/transcript-buffer.js';
// Renderer with AssemblyAI Streaming Transcription - Real-time & Accurate!
// Uses AssemblyAI WebSocket API for live speech-to-text

let screenshotsCount = 0;
let isAnalyzing = false;
let stealthHideTimeout = null;
const THEME_STORAGE_KEY = 'assistant-theme';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';
let activeTheme = THEME_LIGHT;
const AUTO_ANSWER_STORAGE_KEY = 'assistant-auto-answer-mode';
const AUTO_ANSWER_OFF = 'off';
const AUTO_ANSWER_TRANSCRIPT = 'transcript';
const AUTO_ANSWER_TRANSCRIPT_SCREEN = 'transcript-screen';
const AUTO_ANSWER_RETRY_MS = 1200;
const DEFAULT_AUTO_ANSWER_DEBOUNCE_MS = 1800;
const DEFAULT_AUTO_ANSWER_COOLDOWN_MS = 7000;
const COMPACT_MODE_STORAGE_KEY = 'assistant-compact-mode';
const COMPACT_WINDOW_HEIGHT = 72;
const EXPANDED_WINDOW_HEIGHT = 380;
let autoAnswerMode = AUTO_ANSWER_TRANSCRIPT;
let autoAnswerTimeout = null;
let autoAnswerLastTranscriptAt = 0;
let autoAnswerLastCompletedAt = 0;
let autoAnswerRunning = false;
let autoAnswerScheduledSource = null;
let autoAnswerDebounceMs = DEFAULT_AUTO_ANSWER_DEBOUNCE_MS;
let autoAnswerCooldownMs = DEFAULT_AUTO_ANSWER_COOLDOWN_MS;
const AI_CONTEXT_CHAR_BUDGET = 12000;
const messageStore = createMessageStore();
let chatMessagesArray = messageStore.getMessages();
const transcriptionSourceState = createTranscriptionSourceState();

// Source selection state (default: host/system on, mic off)
const selectedSources = transcriptionSourceState.selectedSources;

const audioPipeline = createAudioPipeline({
    sendAudioChunk: (source, audioBuffer) => {
        window.electronAPI.sendAudioChunk(source, audioBuffer);
    },
    addMonitorLog: (...args) => addMonitorLog(...args)
});

const transcriptBufferManager = createTranscriptBufferManager({
    mergeWindowMs: 900,
    onBuffer: ({ source, text, segments }) => {
        addMonitorLog('info', 'final-buffer', 'Buffered transcript segment', source, {
            segments,
            chars: text.length
        });
    },
    onFlush: ({ source, text, reason, segments }) => {
        if (source === 'system') {
            addChatMessage('voice-system', text);
        } else {
            addChatMessage('voice-mic', text);
        }

        addMonitorLog('info', 'final-flush', 'Merged transcript committed', source, {
            reason,
            segments,
            chars: text.length
        });
        showFeedback('Captured', 'success');
        scheduleAutoAnswerFromTranscript(source);
    }
});


// DOM elements
const statusText = document.getElementById('status-text');
const screenshotCount = document.getElementById('screenshot-count');
const resultsPanel = document.getElementById('results-panel');
const resultText = document.getElementById('result-text');
const emergencyOverlay = document.getElementById('emergency-overlay');
const chatContainer = document.getElementById('chat-container');
const chatMessagesElement = document.getElementById('chat-messages');
const chatComposer = document.getElementById('chat-composer');
const chatManualInput = document.getElementById('chat-manual-input');
const chatManualSend = document.getElementById('chat-manual-send');
const transcriptionToggle = document.getElementById('transcription-toggle');
const sourceSystemToggle = document.getElementById('source-system-toggle');
const sourceMicToggle = document.getElementById('source-mic-toggle');
const monitorMasterState = document.getElementById('monitor-master-state');
const monitorStatusSystem = document.getElementById('monitor-status-system');
const monitorStatusMic = document.getElementById('monitor-status-mic');
const monitorLiveSystem = document.getElementById('monitor-live-system');
const monitorLiveMic = document.getElementById('monitor-live-mic');
const monitorLogList = document.getElementById('monitor-log-list');
const windowResizeHandles = document.querySelectorAll('[data-resize-handle]');

const screenshotBtn = document.getElementById('screenshot-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const screenAiBtn = document.getElementById('screen-ai-btn');
const clearBtn = document.getElementById('clear-btn');
const hideBtn = document.getElementById('hide-btn');
const closeResultsBtn = document.getElementById('close-results');
const closeAppBtn = document.getElementById('close-app-btn');
const moveAppBtn = document.getElementById('move-app-btn');
const hideAppBtn = document.getElementById('hide-app-btn');
const closeConfirmationDialog = document.getElementById('close-confirmation-dialog');
const cancelCloseBtn = document.getElementById('cancel-close-btn');
const confirmCloseBtn = document.getElementById('confirm-close-btn');

// Toolbar buttons
const suggestBtn = document.getElementById('suggest-btn');
const autoAnswerBtn = document.getElementById('auto-answer-btn');
const notesBtn = document.getElementById('notes-btn');
const insightsBtn = document.getElementById('insights-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const toolbarMenuBtn = document.getElementById('toolbar-menu-btn');
const toolbarMenu = document.getElementById('toolbar-menu');
const chatTabBtn = document.getElementById('chat-tab-btn');

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingAiProvider = document.getElementById('setting-ai-provider');
const claudeSettingsGroup = document.getElementById('claude-settings-group');
const ollamaSettingsGroup = document.getElementById('ollama-settings-group');
const settingClaudeKey = document.getElementById('setting-claude-key');
const toggleClaudeKeyVisibilityBtn = document.getElementById('toggle-claude-key-visibility');
const settingClaudeModel = document.getElementById('setting-claude-model');
const settingOllamaBaseUrl = document.getElementById('setting-ollama-base-url');
const settingOllamaModel = document.getElementById('setting-ollama-model');
const settingOllamaModelSelect = document.getElementById('setting-ollama-model-select');
const fetchOllamaModelsBtn = document.getElementById('fetch-ollama-models');
const settingProgrammingLanguage = document.getElementById('setting-programming-language');
const settingAssemblyKey = document.getElementById('setting-assembly-key');
const toggleAssemblyKeyVisibilityBtn = document.getElementById('toggle-assembly-key-visibility');
const settingAssemblyModel = document.getElementById('setting-assembly-model');
const settingWindowOpacity = document.getElementById('setting-window-opacity');
const settingWindowOpacityValue = document.getElementById('setting-window-opacity-value');
const settingAutoAnswerDebounceMs = document.getElementById('setting-auto-answer-debounce-ms');
const settingAutoAnswerCooldownMs = document.getElementById('setting-auto-answer-cooldown-ms');
const settingsShortcutsList = document.getElementById('settings-shortcuts-list');

// Timer
let startTime = Date.now();
let timerInterval;
const MIN_WINDOW_WIDTH = 600;
const MIN_WINDOW_HEIGHT = 72;
const MAX_CHAT_INPUT_HEIGHT = 88;

let isCloseConfirmationOpen = false;
let hasClaudeApiKeysConfigured = false;
let hasAssemblyAiApiKeyConfigured = false;
let isCompactMode = true;
let lastExpandedWindowBounds = null;
const aiActionInFlightState = {
    askAi: false,
    screenAi: false,
    suggest: false,
    notes: false,
    insights: false
};
const shortcutManager = createShortcutManager({ settingsShortcutsList });
const windowAdjustmentManager = createWindowAdjustmentManager({
    windowResizeHandles,
    moveDragHandle: moveAppBtn,
    chatContainer,
    minWindowWidth: MIN_WINDOW_WIDTH,
    minWindowHeight: MIN_WINDOW_HEIGHT,
    onViewportResize: () => {
        autoResizeManualInput();
    }
});
const chatUiManager = createChatUiManager({
    chatContainer,
    chatMessagesElement,
    chatComposer,
    chatManualInput,
    chatManualSend,
    messageStore,
    maxChatInputHeight: MAX_CHAT_INPUT_HEIGHT,
    escapeHtml: (value) => escapeHtml(value),
    updateUi: () => updateUI(),
    onMessagesChanged: (messages) => {
        chatMessagesArray = messages;
    },
    showFeedback: (message, type) => showFeedback(message, type),
    addMonitorLog: (...args) => addMonitorLog(...args)
});
const settingsPanelManager = createSettingsPanelManager({
    settingsPanel,
    settingAiProvider,
    claudeSettingsGroup,
    ollamaSettingsGroup,
    settingClaudeKey,
    toggleClaudeKeyVisibilityBtn,
    settingClaudeModel,
    settingProgrammingLanguage,
    settingOllamaBaseUrl,
    settingOllamaModel,
    settingOllamaModelSelect,
    fetchOllamaModelsBtn,
    settingAssemblyKey,
    toggleAssemblyKeyVisibilityBtn,
    settingAssemblyModel,
    settingWindowOpacity,
    settingWindowOpacityValue,
    settingAutoAnswerDebounceMs,
    settingAutoAnswerCooldownMs,
    applySettingsShortcutConfig: (settings) => applySettingsShortcutConfig(settings),
    showFeedback: (message, type) => showFeedback(message, type),
    onSettingsSaved: (settings) => {
        applyApiKeyAvailabilityFromSettings(settings);
        applyAutoAnswerTimingFromSettings(settings);
        updateUI();
    }
});
const transcriptionManager = createTranscriptionManager({
    transcriptionSourceState,
    normalizeSourceRule: normalizeAssemblySource,
    sourceLabelRule: resolveSourceLabel,
    audioPipeline,
    transcriptBufferManager,
    chatMessagesElement,
    transcriptionToggle,
    sourceSystemToggle,
    sourceMicToggle,
    monitorMasterState,
    monitorStatusSystem,
    monitorStatusMic,
    monitorLiveSystem,
    monitorLiveMic,
    monitorLogList,
    addChatMessage: (type, content, options) => addChatMessage(type, content, options),
    showFeedback: (message, type) => showFeedback(message, type)
});

// Initialize
async function init() {
    console.log('Initializing renderer with Vosk Live Transcription...');

    if (typeof window.electronAPI !== 'undefined') {
        console.log('electronAPI is available');
    } else {
        console.error('electronAPI not available');
        showFeedback('electronAPI not available', 'error');
    }

    const settings = await loadShortcutConfig();
    loadCompactModePreference();
    loadAutoAnswerMode();
    setupEventListeners();
    setupToolbarMenu();
    setupIpcListeners();
    setupWindowAdjustments();
    applyTheme(resolveInitialThemePreference(settings), { persist: false });
    updateUI();
    transcriptionManager.updateTranscriptionUI();
    transcriptionManager.renderMonitorState();
    startTimer();

    document.body.style.visibility = 'visible';
    document.body.style.display = 'block';
    const app = document.getElementById('app');
    if (app) {
        app.style.visibility = 'visible';
        app.style.display = 'flex';
    }

    console.log('Renderer initialized - Ready for live transcription!');
    showFeedback('Ready - click transcription to start', 'success');
    addMonitorLog('info', 'init', 'Renderer initialized');
    addMonitorLog('info', 'source-defaults', 'Default sources: Meeting on, You on');

    window.setTimeout(() => {
        applyCompactMode(isCompactMode, { skipResize: false }).catch((error) => {
            console.error('Failed to apply compact mode:', error);
        });
    }, 0);
}

function updateWindowOpacityValueLabel(value) {
    settingsPanelManager.updateWindowOpacityValueLabel(value);
}

function parseThemePreference(theme) {
    return theme === THEME_DARK || theme === THEME_LIGHT ? theme : null;
}

function normalizeTheme(theme) {
    return theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
}

function loadStoredThemePreference() {
    try {
        const savedTheme = window.localStorage?.getItem(THEME_STORAGE_KEY) || '';
        return parseThemePreference(savedTheme) || THEME_LIGHT;
    } catch (error) {
        console.warn('Failed to read saved theme preference:', error);
        return THEME_LIGHT;
    }
}

function resolveInitialThemePreference(settings) {
    const settingsTheme = parseThemePreference(String(settings?.themePreference || '').trim().toLowerCase());
    if (settingsTheme) {
        saveThemePreference(settingsTheme);
        return settingsTheme;
    }

    return loadStoredThemePreference();
}

function saveThemePreference(theme) {
    try {
        window.localStorage?.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
    } catch (error) {
        console.warn('Failed to save theme preference:', error);
    }
}

function persistThemePreference(theme) {
    const normalizedTheme = normalizeTheme(theme);
    saveThemePreference(normalizedTheme);

    const setThemePreference = window.electronAPI?.setThemePreference;
    if (typeof setThemePreference === 'function') {
        setThemePreference(normalizedTheme).catch((error) => {
            console.warn('Failed to persist theme preference to app state:', error);
        });
    }
}

function updateThemeToggleUi() {
    if (!themeToggleBtn) {
        return;
    }

    const isDarkMode = activeTheme === THEME_DARK;
    const nextThemeLabel = isDarkMode ? 'light' : 'dark';
    const ariaLabel = `Switch to ${nextThemeLabel} mode`;

    themeToggleBtn.classList.toggle('is-dark', isDarkMode);
    themeToggleBtn.setAttribute('aria-pressed', isDarkMode ? 'true' : 'false');
    themeToggleBtn.setAttribute('aria-label', ariaLabel);
    themeToggleBtn.removeAttribute('title');
}

function applyTheme(theme, options = {}) {
    const { persist = true, announce = false } = options;
    activeTheme = normalizeTheme(theme);

    document.body.classList.toggle('theme-dark', activeTheme === THEME_DARK);
    document.documentElement.setAttribute('data-theme', activeTheme);
    updateThemeToggleUi();

    if (persist) {
        persistThemePreference(activeTheme);
    }

    if (announce) {
        showFeedback(activeTheme === THEME_DARK ? 'Dark mode enabled' : 'Light mode enabled', 'info');
    }
}

function toggleThemeMode() {
    const nextTheme = activeTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    applyTheme(nextTheme, { persist: true, announce: true });
}

function applySettingsShortcutConfig(settings) {
    shortcutManager.applySettingsShortcutConfig(settings);
}

function isShortcutPressed(event, shortcutId) {
    return shortcutManager.isShortcutPressed(event, shortcutId);
}

function isAiActionInFlight(actionId) {
    return Boolean(aiActionInFlightState[actionId]);
}

function isAnyAiActionInFlight() {
    return Object.values(aiActionInFlightState).some(Boolean);
}

function setAiActionInFlight(actionId, inFlight) {
    if (!Object.prototype.hasOwnProperty.call(aiActionInFlightState, actionId)) {
        return;
    }

    const nextValue = Boolean(inFlight);
    if (aiActionInFlightState[actionId] === nextValue) {
        return;
    }

    aiActionInFlightState[actionId] = nextValue;
    updateUI();
}

async function runAiActionWithLock(actionId, action) {
    if (isAiActionInFlight(actionId)) {
        return false;
    }

    setAiActionInFlight(actionId, true);
    try {
        await action();
        return true;
    } finally {
        setAiActionInFlight(actionId, false);
    }
}

let activeScreenAiStream = null;

function createStreamHandler(actionId) {
    let accumulatedText = '';
    let messageRecord = null;
    let removeChunkListener = null;

    function start(headingPrefix) {
        accumulatedText = headingPrefix || '';
        messageRecord = addChatMessage('ai-response', accumulatedText || '...');

        removeChunkListener = window.electronAPI.onAiStreamChunk((data) => {
            if (data.actionId !== actionId) return;
            accumulatedText += data.text;
            if (messageRecord) {
                chatUiManager.updateChatMessageContent(messageRecord.id, accumulatedText);
            }
        });

        return messageRecord;
    }

    function finalize(finalText) {
        if (finalText && messageRecord) {
            chatUiManager.updateChatMessageContent(messageRecord.id, finalText);
        }
    }

    function cleanup() {
        if (removeChunkListener) {
            removeChunkListener();
            removeChunkListener = null;
        }
    }

    return { start, finalize, cleanup };
}

function hasConfiguredClaudeApiKeys(value) {
    const keys = String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    return keys.length > 0;
}

function hasConfiguredAssemblyAiApiKey(value) {
    return String(value ?? '').trim().length > 0;
}

function applyApiKeyAvailabilityFromSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        hasClaudeApiKeysConfigured = false;
        hasAssemblyAiApiKeyConfigured = false;
        return;
    }

    // Ollama doesn't require API keys, so treat it as always configured
    if (settings.aiProvider === 'ollama') {
        hasClaudeApiKeysConfigured = true;
    } else if (typeof settings.hasClaudeApiKeys === 'boolean') {
        hasClaudeApiKeysConfigured = settings.hasClaudeApiKeys;
    } else {
        hasClaudeApiKeysConfigured = hasConfiguredClaudeApiKeys(settings.claudeApiKey);
    }

    if (typeof settings.hasAssemblyAiApiKey === 'boolean') {
        hasAssemblyAiApiKeyConfigured = settings.hasAssemblyAiApiKey;
    } else {
        hasAssemblyAiApiKeyConfigured = hasConfiguredAssemblyAiApiKey(settings.assemblyAiApiKey);
    }
}

function parsePositiveIntegerSetting(value, fallbackValue, minValue = 1) {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsedValue)) {
        return fallbackValue;
    }

    return Math.max(minValue, parsedValue);
}

function applyAutoAnswerTimingFromSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        autoAnswerDebounceMs = DEFAULT_AUTO_ANSWER_DEBOUNCE_MS;
        autoAnswerCooldownMs = DEFAULT_AUTO_ANSWER_COOLDOWN_MS;
        return;
    }

    autoAnswerDebounceMs = parsePositiveIntegerSetting(
        settings.autoAnswerDebounceMs,
        DEFAULT_AUTO_ANSWER_DEBOUNCE_MS,
        250
    );
    autoAnswerCooldownMs = parsePositiveIntegerSetting(
        settings.autoAnswerCooldownMs,
        DEFAULT_AUTO_ANSWER_COOLDOWN_MS,
        500
    );
}

async function loadShortcutConfig() {
    if (!window.electronAPI?.getSettings) {
        applyApiKeyAvailabilityFromSettings(null);
        return null;
    }

    try {
        const settings = await window.electronAPI.getSettings();
        applySettingsShortcutConfig(settings);
        applyApiKeyAvailabilityFromSettings(settings);
        applyAutoAnswerTimingFromSettings(settings);
        return settings;
    } catch (error) {
        console.error('Failed to load shortcut config:', error);
        applyApiKeyAvailabilityFromSettings(null);
        applyAutoAnswerTimingFromSettings(null);
        return null;
    }
}

function setupWindowAdjustments() {
    windowAdjustmentManager.setupWindowAdjustments();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isMessageIncludedForAi(message) {
    return messageStore.isIncludedForAi(message);
}

function buildFilteredAiContextBundle({ charBudget = AI_CONTEXT_CHAR_BUDGET, emitTruncationLog = true } = {}) {
    return buildAiContextBundle({
        messages: chatMessagesArray,
        isMessageIncludedForAi,
        charBudget,
        emitTruncationLog,
        onTruncationLog: (dropped, budget) => {
            addMonitorLog(
                'info',
                'context-cap',
                `Trimmed ${dropped} older context message(s) to stay within ${budget} chars`
            );
        }
    });
}

function updateMessageAiToggleUi(message) {
    syncMessageAiToggleUi(chatMessagesElement, message);
}

function toggleChatMessageInclusion(messageId) {
    const message = messageStore.toggleInclusion(messageId);
    if (!message) return;

    chatMessagesArray = messageStore.getMessages();
    updateMessageAiToggleUi(message);
    updateUI();

    const stateText = message.includeInAi ? 'included in' : 'excluded from';
    addMonitorLog('info', 'ai-context-toggle', `Message ${stateText} AI context`, null, {
        id: message.id,
        type: message.type
    });
}

function addMonitorLog(level, event, message, source = null, meta = null, timestamp = Date.now()) {
    transcriptionManager.addMonitorLog(level, event, message, source, meta, timestamp);
}

function flushAllFinalTranscripts(reason = 'flush-all') {
    transcriptionManager.flushAllFinalTranscripts(reason);
}

function setSourceSelected(source, enabled) {
    return transcriptionManager.setSourceSelected(source, enabled);
}

async function toggleMasterTranscription() {
    if (!hasAssemblyAiApiKeyConfigured) {
        showFeedback('AssemblyAI API key missing. Add it in Settings.', 'error');
        return;
    }

    return transcriptionManager.toggleMasterTranscription();
}

// Screenshot functions
async function takeStealthScreenshot() {
    try {
        showFeedback('Taking screenshot...', 'info');
        await window.electronAPI.takeStealthScreenshot();
        return true;
    } catch (error) {
        console.error('Screenshot error:', error);
        showFeedback('Screenshot failed', 'error');
        return false;
    }
}

function buildAskAiContextPayload() {
    const bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
    return {
        mode: 'best-next-answer',
        contextString: bundle.contextString,
        transcriptContext: bundle.transcriptContext,
        sessionSummary: bundle.sessionSummary,
        enabledScreenshotIds: bundle.enabledScreenshotIds,
        screenshotCount: bundle.enabledScreenshotIds.length
    };
}

async function waitForScreenshotContext(timeoutMs = 1200) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const payload = buildAskAiContextPayload();
        if (payload.enabledScreenshotIds.length > 0) {
            return payload;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return buildAskAiContextPayload();
}

async function ensureScreenshotContext({ reason = 'ai-action' } = {}) {
    const existingPayload = buildAskAiContextPayload();
    if (existingPayload.enabledScreenshotIds.length > 0) {
        return true;
    }

    const feedbackMessage = reason === 'screen-ai'
        ? 'Capturing screen context for Screen AI...'
        : 'Capturing screen context for Ask AI...';

    showFeedback(feedbackMessage, 'info');
    const captured = await takeStealthScreenshot();
    if (!captured) {
        return false;
    }

    const payload = await waitForScreenshotContext();
    return payload.enabledScreenshotIds.length > 0;
}

function clearAutoAnswerSchedule() {
    if (autoAnswerTimeout) {
        clearTimeout(autoAnswerTimeout);
        autoAnswerTimeout = null;
    }
}

function queueAutoAnswerCheck(delayMs, source) {
    clearAutoAnswerSchedule();
    autoAnswerScheduledSource = source;
    updateAutoAnswerButtonUi({ pending: true });

    autoAnswerTimeout = setTimeout(() => {
        runAutoAnswerCycle(autoAnswerScheduledSource).catch((error) => {
            console.error('Auto answer cycle failed:', error);
        });
    }, Math.max(0, delayMs));
}

async function runAutoAnswerCycle(source) {
    clearAutoAnswerSchedule();

    if (autoAnswerMode === AUTO_ANSWER_OFF || !hasClaudeApiKeysConfigured) {
        updateAutoAnswerButtonUi();
        return;
    }

    if (autoAnswerRunning) {
        queueAutoAnswerCheck(AUTO_ANSWER_RETRY_MS, source);
        return;
    }

    const now = Date.now();
    const silenceRemaining = autoAnswerDebounceMs - (now - autoAnswerLastTranscriptAt);
    if (silenceRemaining > 0) {
        queueAutoAnswerCheck(silenceRemaining, source);
        return;
    }

    const cooldownRemaining = autoAnswerCooldownMs - (now - autoAnswerLastCompletedAt);
    if (autoAnswerLastCompletedAt > 0 && cooldownRemaining > 0) {
        queueAutoAnswerCheck(cooldownRemaining, source);
        return;
    }

    if (isAnalyzing || isAnyAiActionInFlight()) {
        queueAutoAnswerCheck(AUTO_ANSWER_RETRY_MS, source);
        return;
    }

    const bundle = buildFilteredAiContextBundle({
        charBudget: AI_CONTEXT_CHAR_BUDGET,
        emitTruncationLog: false
    });

    if (!bundle.transcriptContext) {
        updateAutoAnswerButtonUi();
        return;
    }

    autoAnswerRunning = true;
    const transcriptTimestampAtStart = autoAnswerLastTranscriptAt;
    updateAutoAnswerButtonUi();

    addMonitorLog('info', 'auto-answer-trigger', 'Refreshing answer from latest transcript context', source, {
        mode: autoAnswerMode
    });

    try {
        if (autoAnswerMode === AUTO_ANSWER_TRANSCRIPT_SCREEN) {
            const captured = await ensureScreenshotContext({ reason: 'ask-ai' });
            if (!captured) {
                return;
            }
        }

        await askAiWithSessionContext({
            allowAutoCapture: false,
            autoTriggered: true
        });
    } catch (error) {
        console.error('Auto answer failed:', error);
        addMonitorLog('error', 'auto-answer-failed', error.message, source);
    } finally {
        autoAnswerRunning = false;
        autoAnswerLastCompletedAt = Date.now();

        if (autoAnswerLastTranscriptAt > transcriptTimestampAtStart) {
            queueAutoAnswerCheck(autoAnswerCooldownMs, source);
        } else {
            updateAutoAnswerButtonUi();
        }
    }
}

function scheduleAutoAnswerFromTranscript(source) {
    if (autoAnswerMode === AUTO_ANSWER_OFF || !hasClaudeApiKeysConfigured) {
        return;
    }

    autoAnswerLastTranscriptAt = Date.now();
    showFeedback('Auto Answer pending...', 'info');
    queueAutoAnswerCheck(autoAnswerDebounceMs, source);
}

async function askAiWithSessionContext(options = {}) {
    if (!hasClaudeApiKeysConfigured) {
        showFeedback('Claude API key missing. Add it in Settings.', 'error');
        return;
    }

    if (!window.electronAPI?.askAiWithSessionContext) {
        showFeedback('Feature not available', 'error');
        return;
    }

    const allowAutoCapture = options.allowAutoCapture !== false;
    const autoTriggered = options.autoTriggered === true;

    let payload = buildAskAiContextPayload();
    if (!payload.contextString && payload.enabledScreenshotIds.length === 0) {
        if (allowAutoCapture) {
            const captured = await ensureScreenshotContext({ reason: 'ask-ai' });
            if (!captured) {
                return;
            }

            payload = buildAskAiContextPayload();
        }
        if (!payload.contextString && payload.enabledScreenshotIds.length === 0) {
            showFeedback('No transcript or screenshots available yet', 'error');
            return;
        }
    }

    await runAiActionWithLock('askAi', async () => {
        const stream = createStreamHandler('askAi');
        try {
            setAnalyzing(true);
            stream.start('**Best Next Answer:**\n\n');

            const result = await window.electronAPI.askAiWithSessionContext(payload);

            if (result?.success && result?.text) {
                const heading = result.usedScreenshots
                    ? '**Best Next Answer (Transcript + Screen):**'
                    : '**Best Next Answer (Transcript):**';
                stream.finalize(`${heading}\n\n${result.text}`);
                showFeedback(autoTriggered ? 'Auto answer updated' : 'Ask AI ready', 'success');
            } else {
                throw new Error(result?.error || 'Ask AI failed');
            }
        } catch (error) {
            console.error('Ask AI error:', error);
            showFeedback('Ask AI failed', 'error');
            addChatMessage('system', `Error: ${error.message}`);
        } finally {
            stream.cleanup();
            setAnalyzing(false);
        }
    });
}

async function analyzeScreenshotsOnly() {
    if (!hasClaudeApiKeysConfigured) {
        showFeedback('Claude API key missing. Add it in Settings.', 'error');
        return;
    }

    let bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
    if (bundle.enabledScreenshotIds.length === 0) {
        const captured = await ensureScreenshotContext({ reason: 'screen-ai' });
        if (!captured) {
            return;
        }

        bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
        if (bundle.enabledScreenshotIds.length === 0) {
            showFeedback('No enabled screenshots to analyze', 'error');
            return;
        }
    }

    await runAiActionWithLock('screenAi', async () => {
        const stream = createStreamHandler('screenAi');
        activeScreenAiStream = stream;
        try {
            setAnalyzing(true);
            stream.start('');

            await window.electronAPI.analyzeStealthWithContext({
                contextString: bundle.contextString,
                enabledScreenshotIds: bundle.enabledScreenshotIds
            });
        } catch (error) {
            console.error('Analysis error:', error);
            showFeedback('Analysis failed', 'error');
            setAnalyzing(false);
            // Clean up on error since onAnalysisResult may not fire
            stream.cleanup();
            activeScreenAiStream = null;
        }
        // Don't cleanup in finally - onAnalysisResult handles it for success path
        // This avoids a race where the invoke resolves before the event is delivered
    });
}

async function clearStealthData() {
    try {
        await window.electronAPI.clearStealth();
        if (window.electronAPI.clearConversationHistory) {
            await window.electronAPI.clearConversationHistory();
        }
        screenshotsCount = 0;
        messageStore.clear();
        chatMessagesArray = messageStore.getMessages();
        chatMessagesElement.innerHTML = '';
        updateUI();
        showFeedback('Cleared', 'success');
    } catch (error) {
        console.error('Clear error:', error);
        showFeedback('Clear failed', 'error');
    }
}

async function emergencyHide() {
    try {
        await window.electronAPI.emergencyHide();
        showEmergencyOverlay();
    } catch (error) {
        console.error('Emergency hide error:', error);
    }
}

function openCloseConfirmation() {
    if (!closeConfirmationDialog) {
        closeApplication();
        return;
    }

    isCloseConfirmationOpen = true;
    closeConfirmationDialog.classList.remove('hidden');
    confirmCloseBtn?.focus();
}

function closeCloseConfirmation() {
    if (!closeConfirmationDialog) {
        return;
    }

    isCloseConfirmationOpen = false;
    closeConfirmationDialog.classList.add('hidden');
    closeAppBtn?.focus();
}

async function closeApplication() {
    try {
        console.log('Closing application...');
        flushAllFinalTranscripts('app-close');
        await window.electronAPI.closeApp();
    } catch (error) {
        console.error('Close application error:', error);
    }
}

async function minimizeWindow() {
    try {
        await window.electronAPI.minimizeWindow();
    } catch (error) {
        console.error('Minimize window error:', error);
    }
}

async function moveWindowNext() {
    try {
        // Drag behavior is handled by the move button pointer interaction.
    } catch (error) {
        console.error('Move window error:', error);
    }
}

async function hideWindow() {
    try {
        const nextCompactMode = !isCompactMode;
        await applyCompactMode(nextCompactMode);
        showFeedback(nextCompactMode ? 'Compact mode' : 'Expanded mode', 'info');
    } catch (error) {
        console.error('Hide window error:', error);
    }
}

async function toggleWindowFullscreen() {
    try {
        await window.electronAPI.toggleWindowFullscreen();
    } catch (error) {
        console.error('Toggle fullscreen error:', error);
    }
}

// NEW CLUELY-STYLE FEATURES

async function getResponseSuggestions() {
    if (!hasClaudeApiKeysConfigured) {
        showFeedback('Claude API key missing. Add it in Settings.', 'error');
        return;
    }

    if (!window.electronAPI || !window.electronAPI.suggestResponse) {
        showFeedback('Feature not available', 'error');
        return;
    }

    await runAiActionWithLock('suggest', async () => {
        const stream = createStreamHandler('suggest');
        try {
            showFeedback('Generating suggestions...', 'info');
            const bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
            const transcriptOnlyContext = String(bundle.transcriptContext || '').trim();
            if (!transcriptOnlyContext) {
                showFeedback('No enabled transcript context available for suggestions', 'error');
                return;
            }

            stream.start('**What should I say?**\n\n');

            const result = await window.electronAPI.suggestResponse({
                context: bundle.sessionSummary || 'Current meeting conversation',
                contextString: transcriptOnlyContext
            });

            if (result.success && result.suggestions) {
                stream.finalize(`**What should I say?**\n\n${result.suggestions}`);
                showFeedback('Suggestions generated', 'success');
            } else {
                throw new Error(result.error || 'Failed to generate suggestions');
            }
        } catch (error) {
            console.error('Error getting suggestions:', error);
            showFeedback('Failed to generate suggestions', 'error');
            addChatMessage('system', `Error: ${error.message}`);
        } finally {
            stream.cleanup();
        }
    });
}

async function generateMeetingNotes() {
    if (!hasClaudeApiKeysConfigured) {
        showFeedback('Claude API key missing. Add it in Settings.', 'error');
        return;
    }

    if (!window.electronAPI || !window.electronAPI.generateMeetingNotes) {
        showFeedback('Feature not available', 'error');
        return;
    }

    await runAiActionWithLock('notes', async () => {
        const stream = createStreamHandler('notes');
        try {
            showFeedback('Generating meeting notes...', 'info');
            setAnalyzing(true);
            const bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
            if (!bundle.contextString) {
                showFeedback('No enabled context available for notes', 'error');
                return;
            }

            stream.start('**Meeting Notes**\n\n');

            const result = await window.electronAPI.generateMeetingNotes({
                contextString: bundle.contextString
            });

            if (result.success && result.notes) {
                stream.finalize(`**Meeting Notes**\n\n${result.notes}`);
                showFeedback('Meeting notes generated', 'success');
            } else {
                throw new Error(result.error || 'Failed to generate notes');
            }
        } catch (error) {
            console.error('Error generating notes:', error);
            showFeedback('Failed to generate notes', 'error');
            addChatMessage('system', `Error: ${error.message}`);
        } finally {
            stream.cleanup();
            setAnalyzing(false);
        }
    });
}

async function getConversationInsights() {
    if (!hasClaudeApiKeysConfigured) {
        showFeedback('Claude API key missing. Add it in Settings.', 'error');
        return;
    }

    if (!window.electronAPI || !window.electronAPI.getConversationInsights) {
        showFeedback('Feature not available', 'error');
        return;
    }

    await runAiActionWithLock('insights', async () => {
        const stream = createStreamHandler('insights');
        try {
            showFeedback('Analyzing conversation...', 'info');
            setAnalyzing(true);
            const bundle = buildFilteredAiContextBundle({ charBudget: AI_CONTEXT_CHAR_BUDGET, emitTruncationLog: true });
            if (!bundle.contextString) {
                showFeedback('No enabled context available for insights', 'error');
                return;
            }

            stream.start('**Conversation Insights**\n\n');

            const result = await window.electronAPI.getConversationInsights({
                contextString: bundle.contextString
            });

            if (result.success && result.insights) {
                stream.finalize(`**Conversation Insights**\n\n${result.insights}`);
                showFeedback('Insights generated', 'success');
            } else {
                throw new Error(result.error || 'Failed to get insights');
            }
        } catch (error) {
            console.error('Error getting insights:', error);
            showFeedback('Failed to get insights', 'error');
            addChatMessage('system', `Error: ${error.message}`);
        } finally {
            stream.cleanup();
            setAnalyzing(false);
        }
    });
}

// SETTINGS FUNCTIONS

async function openSettings() {
    await settingsPanelManager.openSettings();
}

function closeSettings() {
    settingsPanelManager.closeSettings();
}

async function saveSettings() {
    const result = await settingsPanelManager.saveSettings();
    if (result?.success && result?.settings) {
        applyApiKeyAvailabilityFromSettings(result.settings);
        updateUI();
    }
}

// UI Helper functions
function setAnalyzing(analyzing) {
    isAnalyzing = analyzing;
    updateUI();
}

function updateUI() {
    if (screenshotCount) {
        screenshotCount.textContent = screenshotsCount;
    }

    const aiBundle = buildFilteredAiContextBundle({
        charBudget: AI_CONTEXT_CHAR_BUDGET,
        emitTruncationLog: false
    });
    const hasTranscriptContext = aiBundle.transcriptContext.length > 0;
    const hasEnabledScreenshots = aiBundle.enabledScreenshotIds.length > 0;
    const hasAiContext = hasTranscriptContext || hasEnabledScreenshots || aiBundle.contextString.length > 0;
    const canRunAiActions = hasClaudeApiKeysConfigured;
    const canRunTranscription = hasAssemblyAiApiKeyConfigured;
    const askAiInFlight = isAiActionInFlight('askAi');
    const screenAiInFlight = isAiActionInFlight('screenAi');
    const suggestInFlight = isAiActionInFlight('suggest');
    const notesInFlight = isAiActionInFlight('notes');
    const insightsInFlight = isAiActionInFlight('insights');

    if (analyzeBtn) {
        analyzeBtn.disabled = isAnalyzing || askAiInFlight || !canRunAiActions;
    }

    if (screenAiBtn) {
        screenAiBtn.disabled = isAnalyzing || screenAiInFlight || !canRunAiActions;
    }

    if (suggestBtn) {
        suggestBtn.disabled = isAnalyzing || suggestInFlight || !canRunAiActions || !hasTranscriptContext;
    }

    if (notesBtn) {
        notesBtn.disabled = isAnalyzing || notesInFlight || !canRunAiActions || !hasAiContext;
    }

    if (insightsBtn) {
        insightsBtn.disabled = isAnalyzing || insightsInFlight || !canRunAiActions || !hasAiContext;
    }

    if (transcriptionToggle) {
        transcriptionToggle.disabled = !canRunTranscription;
    }

    if (sourceSystemToggle) {
        sourceSystemToggle.disabled = !canRunTranscription;
    }

    if (sourceMicToggle) {
        sourceMicToggle.disabled = !canRunTranscription;
    }

    if (autoAnswerBtn) {
        autoAnswerBtn.disabled = !canRunAiActions;
        updateAutoAnswerButtonUi();
    }
}

function showFeedback(message, type = 'info') {
    console.log(`Feedback (${type}):`, message);

    if (statusText) {
        statusText.textContent = message;
        statusText.className = `status-text ${type} show`;
        statusText.style.display = 'block';

        setTimeout(() => {
            statusText.classList.remove('show');
            setTimeout(() => {
                statusText.style.display = 'none';
            }, 300);
        }, 3000);
    }
}

function loadAutoAnswerMode() {
    try {
        const savedMode = localStorage.getItem(AUTO_ANSWER_STORAGE_KEY);
        if (
            savedMode === AUTO_ANSWER_OFF ||
            savedMode === AUTO_ANSWER_TRANSCRIPT ||
            savedMode === AUTO_ANSWER_TRANSCRIPT_SCREEN
        ) {
            autoAnswerMode = savedMode;
        }
    } catch (_) {
        autoAnswerMode = AUTO_ANSWER_OFF;
    }
}

function loadCompactModePreference() {
    try {
        const savedValue = window.localStorage?.getItem(COMPACT_MODE_STORAGE_KEY);
        isCompactMode = savedValue == null ? true : savedValue === 'true';
    } catch (error) {
        console.warn('Failed to read compact mode preference:', error);
        isCompactMode = true;
    }
}

function saveCompactModePreference(nextValue) {
    try {
        window.localStorage?.setItem(COMPACT_MODE_STORAGE_KEY, nextValue ? 'true' : 'false');
    } catch (error) {
        console.warn('Failed to save compact mode preference:', error);
    }
}

async function applyCompactMode(nextCompactMode, { skipResize = false } = {}) {
    isCompactMode = Boolean(nextCompactMode);
    saveCompactModePreference(isCompactMode);
    document.body.classList.toggle('compact-mode', isCompactMode);

    if (skipResize || !window.electronAPI?.getWindowBounds || !window.electronAPI?.setWindowBounds) {
        return;
    }

    const currentBounds = await window.electronAPI.getWindowBounds();
    if (!currentBounds || currentBounds.error) {
        return;
    }

    if (isCompactMode) {
        if (currentBounds.height > COMPACT_WINDOW_HEIGHT) {
            lastExpandedWindowBounds = currentBounds;
        }

        await window.electronAPI.setWindowBounds({
            ...currentBounds,
            height: COMPACT_WINDOW_HEIGHT
        });
        return;
    }

    const expandedHeight = Math.max(
        EXPANDED_WINDOW_HEIGHT,
        Number(lastExpandedWindowBounds?.height || 0)
    );

    await window.electronAPI.setWindowBounds({
        ...currentBounds,
        height: expandedHeight
    });
}

function saveAutoAnswerMode() {
    try {
        localStorage.setItem(AUTO_ANSWER_STORAGE_KEY, autoAnswerMode);
    } catch (_) {
        // no-op
    }
}

function getAutoAnswerModeLabel() {
    if (autoAnswerMode === AUTO_ANSWER_TRANSCRIPT) {
        return 'Auto Answer: Transcript';
    }

    if (autoAnswerMode === AUTO_ANSWER_TRANSCRIPT_SCREEN) {
        return 'Auto Answer: Transcript + Screen';
    }

    return 'Auto Answer: Off';
}

function updateAutoAnswerButtonUi({ pending = false } = {}) {
    if (!autoAnswerBtn) {
        return;
    }

    const valueEl = autoAnswerBtn.querySelector('.menu-item-value');
    const shortLabel = autoAnswerMode === AUTO_ANSWER_TRANSCRIPT
        ? 'Transcript'
        : autoAnswerMode === AUTO_ANSWER_TRANSCRIPT_SCREEN
            ? 'Transcript + Screen'
            : 'Off';

    if (valueEl) {
        valueEl.textContent = pending ? `${shortLabel}...` : shortLabel;
    }
}

function cycleAutoAnswerMode() {
    if (autoAnswerMode === AUTO_ANSWER_OFF) {
        autoAnswerMode = AUTO_ANSWER_TRANSCRIPT;
    } else if (autoAnswerMode === AUTO_ANSWER_TRANSCRIPT) {
        autoAnswerMode = AUTO_ANSWER_TRANSCRIPT_SCREEN;
    } else {
        autoAnswerMode = AUTO_ANSWER_OFF;
    }

    if (autoAnswerMode === AUTO_ANSWER_OFF) {
        clearAutoAnswerSchedule();
        autoAnswerRunning = false;
    }

    saveAutoAnswerMode();
    updateAutoAnswerButtonUi();

    const feedbackMessage = autoAnswerMode === AUTO_ANSWER_OFF
        ? 'Auto Answer off'
        : autoAnswerMode === AUTO_ANSWER_TRANSCRIPT
            ? 'Auto Answer on: transcript only'
            : 'Auto Answer on: transcript plus screen';
    showFeedback(feedbackMessage, 'info');
    addMonitorLog('info', 'auto-answer-mode', feedbackMessage);
}

function setupToolbarMenu() {
    if (toolbarMenuBtn && toolbarMenu) {
        toolbarMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolbarMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!toolbarMenu.contains(e.target) && e.target !== toolbarMenuBtn) {
                toolbarMenu.classList.add('hidden');
            }
        });
    }

    // Close menu when any menu item is clicked
    if (toolbarMenu) {
        toolbarMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (item && item.id !== 'theme-toggle-btn' && item.id !== 'auto-answer-btn') {
                toolbarMenu.classList.add('hidden');
            }
        });
    }
}

function showEmergencyOverlay() {
    if (emergencyOverlay) {
        emergencyOverlay.classList.remove('hidden');
        setTimeout(() => {
            emergencyOverlay.classList.add('hidden');
        }, 2000);
    }
}

function hideResults() {
    if (resultsPanel) {
        resultsPanel.classList.add('hidden');
    }
}

async function writeTextToClipboard(text) {
    const value = String(text ?? '');

    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch (error) {
            console.warn('Clipboard API denied, using fallback copy path:', error);
        }
    }

    const copyListener = (event) => {
        event.preventDefault();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', value);
        }
    };

    document.addEventListener('copy', copyListener, true);
    try {
        const copiedViaEvent = document.execCommand('copy');
        if (copiedViaEvent) {
            return;
        }
    } finally {
        document.removeEventListener('copy', copyListener, true);
    }

    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = value;
    temporaryInput.setAttribute('readonly', '');
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.left = '-9999px';
    temporaryInput.style.top = '0';
    document.body.appendChild(temporaryInput);
    temporaryInput.select();

    const copiedViaSelection = document.execCommand('copy');
    document.body.removeChild(temporaryInput);

    if (!copiedViaSelection) {
        throw new Error('Clipboard write failed');
    }
}

async function copyChatMessageById(messageId) {
    const message = messageStore.findById(messageId);
    const content = String(message?.content || '');

    if (!content.trim()) {
        showFeedback('Nothing to copy', 'error');
        return;
    }

    try {
        await writeTextToClipboard(content);
        showFeedback('Message copied', 'success');
    } catch (error) {
        console.error('Message copy error:', error);
        showFeedback('Copy failed', 'error');
    }
}

// Chat message management
function addChatMessage(type, content, options = {}) {
    return chatUiManager.addChatMessage(type, content, options);
}

function autoResizeManualInput() {
    chatUiManager.autoResizeManualInput();
}

function updateManualComposerState() {
    chatUiManager.updateManualComposerState();
}

function submitManualContextMessage() {
    chatUiManager.submitManualContextMessage();
}

// Timer
function startTimer() {
    const timerElement = document.querySelector('.timer');
    if (!timerElement) return;

    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        timerElement.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

// Event listeners
function setupEventListeners() {
    setupEventListenersModule({
        windowApi: window.electronAPI,
        screenshotBtn,
        analyzeBtn,
        screenAiBtn,
        clearBtn,
        hideBtn,
        chatManualSend,
        chatManualInput,
        closeResultsBtn,
        transcriptionToggle,
        sourceSystemToggle,
        sourceMicToggle,
        closeAppBtn,
        moveAppBtn,
        hideAppBtn,
        cancelCloseBtn,
        confirmCloseBtn,
        closeConfirmationDialog,
        chatMessagesElement,
        suggestBtn,
        autoAnswerBtn,
        notesBtn,
        insightsBtn,
        themeToggleBtn,
        settingsBtn,
        closeSettingsBtn,
        saveSettingsBtn,
        settingWindowOpacity,
        selectedSources,
        isCloseConfirmationOpen: () => isCloseConfirmationOpen,
        isShortcutPressed,
        updateWindowOpacityValueLabel,
        takeStealthScreenshot,
        askAiWithSessionContext,
        analyzeScreenshotsOnly,
        clearStealthData,
        emergencyHide,
        copyChatMessageById,
        submitManualContextMessage,
        autoResizeManualInput,
        updateManualComposerState,
        hideResults,
        toggleMasterTranscription,
        addMonitorLog,
        setSourceSelected,
        openCloseConfirmation,
        closeCloseConfirmation,
        closeApplication,
        moveWindowNext,
        hideWindow,
        toggleChatMessageInclusion,
        getResponseSuggestions,
        cycleAutoAnswerMode,
        generateMeetingNotes,
        getConversationInsights,
        toggleThemeMode,
        openSettings,
        closeSettings,
        saveSettings
    });
}

// IPC listeners
function setupIpcListeners() {
    setupIpcListenersModule({
        windowApi: window.electronAPI,
        setScreenshotsCount: (nextCount) => {
            screenshotsCount = nextCount;
        },
        updateUi: updateUI,
        addChatMessage,
        setAnalyzing,
        showFeedback,
        showEmergencyOverlay,
        transcriptionManager,
        toggleMasterTranscription,
        askAiWithSessionContext,
        isAskAiShortcutEnabled: () => Boolean(analyzeBtn && !analyzeBtn.disabled),
        addMonitorLog,
        getActiveScreenAiStream: () => activeScreenAiStream,
        clearActiveScreenAiStream: () => {
            if (activeScreenAiStream) {
                activeScreenAiStream.cleanup();
                activeScreenAiStream = null;
            }
        }
    });
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
