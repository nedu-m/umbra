// ============================================================================
// OPENAI AI SERVICE
// ============================================================================
// Uses the OpenAI Chat Completions API (gpt-4o family).
// Exposes the same interface as ClaudeService so the runtime can swap providers.
// ============================================================================

const OpenAI = require('openai');
const {
  resolveOpenAiModel,
  normalizeProgrammingLanguages,
  serializeProgrammingLanguages
} = require('../../config');
const {
  buildAnswerQuestionPrompt,
  buildAskAiSessionPrompt,
  buildFollowUpEmailPrompt,
  buildInsightsPrompt,
  buildMeetingNotesPrompt,
  buildScreenshotAnalysisPrompt,
  buildSuggestResponsePrompt
} = require('./prompts');

function toOpenAiImageContentParts(imageParts) {
  return (Array.isArray(imageParts) ? imageParts : []).map((part) => {
    if (part && part.inlineData) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      const data = part.inlineData.data;
      return {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${data}`
        }
      };
    }
    return null;
  }).filter(Boolean);
}

class OpenAiService {
  constructor(apiKey, options = {}) {
    this.apiKey = String(apiKey || '').trim();
    this.modelName = resolveOpenAiModel(options.modelName);
    this.programmingLanguage = serializeProgrammingLanguages(
      normalizeProgrammingLanguages(options.programmingLanguage)
    );

    this.maxRetries = 3;

    this.conversationHistory = [];
    this.maxHistoryLength = 20;

    this.model = this.modelName;

    this._initializeClient();
  }

  _initializeClient() {
    try {
      console.log('Initializing OpenAI client with model:', this.modelName);
      this.client = new OpenAI({ apiKey: this.apiKey });
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      this.client = null;
    }
  }

  updateConfiguration(options = {}) {
    const nextApiKey = String(options.apiKey ?? this.apiKey ?? '').trim();
    const nextModelName = resolveOpenAiModel(options.modelName ?? this.modelName);
    const nextLanguage = serializeProgrammingLanguages(
      normalizeProgrammingLanguages(options.programmingLanguage ?? this.programmingLanguage)
    );

    const apiKeyChanged = nextApiKey !== this.apiKey;
    const modelChanged = nextModelName !== this.modelName;
    const languageChanged = nextLanguage !== this.programmingLanguage;

    if (apiKeyChanged) {
      this.apiKey = nextApiKey;
      this._initializeClient();
    }

    if (modelChanged) {
      this.modelName = nextModelName;
      this.model = this.modelName;
    }

    this.programmingLanguage = nextLanguage;

    return { apiKeyChanged, modelChanged, programmingLanguageChanged: languageChanged };
  }

  isQuotaExhaustedError(error) {
    const message = String(error?.message || '').toLowerCase();
    const status = error?.status;
    return (
      status === 429 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota')
    );
  }

  isAuthenticationError(error) {
    const message = String(error?.message || '').toLowerCase();
    const status = error?.status;
    return (
      status === 401 ||
      status === 403 ||
      message.includes('invalid api key') ||
      message.includes('incorrect api key') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('invalid_api_key')
    );
  }

  isRetryableError(error) {
    const status = error?.status;
    return status === 500 || status === 502 || status === 503 || status === 529;
  }

  _buildUserContent(promptText, imageParts = []) {
    const imageContent = toOpenAiImageContentParts(imageParts);
    const content = [];
    if (imageContent.length > 0) {
      content.push(...imageContent);
    }
    content.push({ type: 'text', text: promptText });
    return content;
  }

  async _executeRequest({ promptText, imageParts = [], onChunk, requestType = 'text' }, retryCount = 0) {
    try {
      const userContent = this._buildUserContent(promptText, imageParts);

      if (typeof onChunk === 'function') {
        console.log(`[OpenAI API] Streaming ${requestType} request started`);
        const stream = await this.client.chat.completions.create({
          model: this.modelName,
          max_tokens: 8192,
          messages: [{ role: 'user', content: userContent }],
          stream: true
        });

        let fullText = '';
        let chunkIndex = 0;
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            chunkIndex += 1;
            onChunk({ text, index: chunkIndex });
          }
        }

        console.log(`[OpenAI API] Streaming ${requestType} completed (${chunkIndex} chunks, ${fullText.length} chars)`);
        return fullText;
      }

      console.log(`[OpenAI API] Non-streaming ${requestType} request started`);
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        max_tokens: 8192,
        messages: [{ role: 'user', content: userContent }]
      });

      const responseText = response.choices[0]?.message?.content || '';
      console.log(`[OpenAI API] Non-streaming ${requestType} completed (${responseText.length} chars)`);
      return responseText;
    } catch (error) {
      console.error(`OpenAI request error (attempt ${retryCount + 1}):`, error.message);

      if (this.isQuotaExhaustedError(error) || this.isAuthenticationError(error)) {
        throw error;
      }

      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const backoffTime = Math.pow(2, retryCount) * 2000;
        console.log(`Retrying in ${backoffTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
        return this._executeRequest({ promptText, imageParts, onChunk, requestType }, retryCount + 1);
      }

      throw error;
    }
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getContextString() {
    return this.conversationHistory
      .map((entry) => `${entry.role}: ${entry.content}`)
      .join('\n\n');
  }

  async analyzeScreenshots(imageParts, additionalContext = '', options = {}) {
    const contextString = typeof options.contextStringOverride === 'string'
      ? options.contextStringOverride
      : this.getContextString();
    const prompt = buildScreenshotAnalysisPrompt({
      contextString,
      additionalContext,
      programmingLanguage: this.programmingLanguage,
      screenshotCount: imageParts.length
    });

    const result = await this._executeRequest({
      promptText: prompt,
      imageParts,
      onChunk: options.onChunk,
      requestType: 'screenshot-analysis'
    });

    this.addToHistory('assistant', `Screenshot analysis: ${result}`);
    return result;
  }

  async analyzeScreenshot(imageBase64, additionalContext = '') {
    return this.analyzeScreenshots(
      [{ inlineData: { mimeType: 'image/png', data: imageBase64 } }],
      additionalContext
    );
  }

  async askAiWithSessionContext(options = {}) {
    const contextString = typeof options.contextString === 'string'
      ? options.contextString
      : this.getContextString();
    const prompt = buildAskAiSessionPrompt({
      contextString,
      transcriptContext: options.transcriptContext || '',
      sessionSummary: options.sessionSummary || '',
      screenshotCount: options.screenshotCount || 0,
      mode: options.mode || 'best-next-answer',
      programmingLanguage: this.programmingLanguage
    });

    const result = await this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'ask-ai'
    });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async askAiWithSessionContextAndScreenshots(imageParts, options = {}) {
    const contextString = typeof options.contextString === 'string'
      ? options.contextString
      : this.getContextString();
    const prompt = buildAskAiSessionPrompt({
      contextString,
      transcriptContext: options.transcriptContext || '',
      sessionSummary: options.sessionSummary || '',
      screenshotCount: options.screenshotCount || imageParts.length,
      mode: options.mode || 'best-next-answer',
      programmingLanguage: this.programmingLanguage
    });

    const result = await this._executeRequest({
      promptText: prompt,
      imageParts,
      onChunk: options.onChunk,
      requestType: 'ask-ai-with-screenshots'
    });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async suggestResponse(context, options = {}) {
    const contextString = typeof options.contextString === 'string'
      ? options.contextString
      : this.getContextString();
    const prompt = buildSuggestResponsePrompt({ contextString, context });
    return this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'suggest'
    });
  }

  async generateMeetingNotes(options = {}) {
    const contextString = typeof options.contextString === 'string'
      ? options.contextString
      : this.getContextString();
    if (!contextString.trim()) {
      return 'No conversation history to summarize.';
    }
    const prompt = buildMeetingNotesPrompt({ contextString });
    return this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'meeting-notes'
    });
  }

  async generateFollowUpEmail(options = {}) {
    if (this.conversationHistory.length === 0) {
      return 'No conversation history to create email from.';
    }
    const contextString = this.getContextString();
    const prompt = buildFollowUpEmailPrompt({ contextString });
    return this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'follow-up-email'
    });
  }

  async answerQuestion(question, options = {}) {
    const contextString = this.getContextString();
    const prompt = buildAnswerQuestionPrompt({
      contextString,
      question,
      programmingLanguage: this.programmingLanguage
    });
    const result = await this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'answer-question'
    });
    this.addToHistory('user', question);
    this.addToHistory('assistant', result);
    return result;
  }

  async getConversationInsights(options = {}) {
    const contextString = typeof options.contextString === 'string'
      ? options.contextString
      : this.getContextString();
    if (!contextString.trim()) {
      return 'Not enough conversation data for insights.';
    }
    const prompt = buildInsightsPrompt({ contextString });
    return this._executeRequest({
      promptText: prompt,
      onChunk: options.onChunk,
      requestType: 'insights'
    });
  }
}

module.exports = OpenAiService;
