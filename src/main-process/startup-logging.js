function logStartupConfiguration({
  appEnvironment,
  appState,
  claudeModels,
  defaultClaudeModel,
  openaiModels,
  defaultOpenAiModel,
  assemblyAiSpeechModels,
  defaultAssemblyAiSpeechModel,
  programmingLanguages,
  defaultProgrammingLanguage
}) {
  const claudeApiKey = typeof appState?.claudeApiKey === 'string' ? appState.claudeApiKey : '';
  const openaiApiKey = typeof appState?.openaiApiKey === 'string' ? appState.openaiApiKey : '';
  const assemblyAiApiKey = typeof appState?.assemblyAiApiKey === 'string' ? appState.assemblyAiApiKey : '';
  const claudeApiKeyCount = claudeApiKey
    ? claudeApiKey
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .length
    : 0;
  const openaiApiKeyCount = openaiApiKey
    ? openaiApiKey
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .length
    : 0;

  console.log('Loaded .env from:', appEnvironment.envPath);
  console.log('Startup configuration:');
  console.log(`  ANTHROPIC_API_KEY (UI state): ${claudeApiKey ? 'present' : 'missing'}`);
  console.log(`  ANTHROPIC_API_KEYS configured (UI state): ${claudeApiKeyCount}`);
  console.log(`  OPENAI_API_KEY (UI state): ${openaiApiKey ? 'present' : 'missing'}`);
  console.log(`  OPENAI_API_KEYS configured (UI state): ${openaiApiKeyCount}`);
  console.log(`  ASSEMBLY_AI_API_KEY (UI state): ${assemblyAiApiKey ? 'present' : 'missing'}`);
  console.log(`  HIDE_FROM_SCREEN_CAPTURE: ${appEnvironment.hideFromScreenCapture}`);
  console.log(`  MAX_SCREENSHOTS: ${appEnvironment.maxScreenshots}`);
  console.log(`  SCREENSHOT_DELAY: ${appEnvironment.screenshotDelay}`);
  console.log(`  AUTO_ANSWER_DEBOUNCE_MS: ${appEnvironment.autoAnswerDebounceMs}`);
  console.log(`  AUTO_ANSWER_COOLDOWN_MS: ${appEnvironment.autoAnswerCooldownMs}`);
  console.log(`  NODE_ENV: ${appEnvironment.nodeEnv}`);
  console.log(`  NODE_OPTIONS: ${appEnvironment.nodeOptions}`);
  console.log(`  Default Claude model: ${defaultClaudeModel}`);
  console.log(`  Claude models: ${claudeModels.join(', ')}`);
  console.log(`  Default OpenAI model: ${defaultOpenAiModel}`);
  console.log(`  OpenAI models: ${openaiModels.join(', ')}`);
  console.log(`  Default AssemblyAI speech model: ${defaultAssemblyAiSpeechModel}`);
  console.log(`  AssemblyAI speech models: ${assemblyAiSpeechModels.join(', ')}`);
  console.log(`  Default programming language: ${defaultProgrammingLanguage}`);
  console.log(`  Programming languages: ${programmingLanguages.join(', ')}`);
}

module.exports = {
  logStartupConfiguration
};
