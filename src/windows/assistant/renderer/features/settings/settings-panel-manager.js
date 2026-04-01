function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function createSettingsPanelManager({
    settingsPanel,
    settingAiProvider,
    claudeSettingsGroup,
    openaiSettingsGroup,
    ollamaSettingsGroup,
    settingClaudeKey,
    toggleClaudeKeyVisibilityBtn,
    settingClaudeModel,
    settingOpenaiKey,
    toggleOpenaiKeyVisibilityBtn,
    settingOpenaiModel,
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
    applySettingsShortcutConfig,
    showFeedback,
    onSettingsSaved
}) {
    function normalizeWindowOpacityLevel(value) {
        const parsedValue = Number.parseInt(String(value ?? ''), 10);

        if (!Number.isFinite(parsedValue)) {
            return 10;
        }

        return clamp(parsedValue, 1, 10);
    }

    function normalizePositiveInteger(value, fallbackValue, minValue = 1) {
        const parsedValue = Number.parseInt(String(value ?? ''), 10);

        if (!Number.isFinite(parsedValue)) {
            return fallbackValue;
        }

        return Math.max(minValue, parsedValue);
    }

    function updateWindowOpacityValueLabel(value) {
        if (!settingWindowOpacityValue) {
            return;
        }

        const opacityLevel = normalizeWindowOpacityLevel(value);
        settingWindowOpacityValue.textContent = `${opacityLevel}/10`;
    }

    function setApiKeyFieldVisibility(inputElement, toggleButton, providerName, visible) {
        if (!inputElement || !toggleButton) {
            return;
        }

        const shouldShow = Boolean(visible);
        inputElement.type = shouldShow ? 'text' : 'password';
        toggleButton.textContent = shouldShow ? 'Hide' : 'Show';
        toggleButton.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');
        toggleButton.setAttribute(
            'aria-label',
            `${shouldShow ? 'Hide' : 'Show'} ${providerName} API key`
        );
    }

    function bindApiKeyVisibilityToggle(inputElement, toggleButton, providerName) {
        if (!inputElement || !toggleButton) {
            return;
        }

        setApiKeyFieldVisibility(inputElement, toggleButton, providerName, false);
        toggleButton.addEventListener('click', () => {
            const nextVisible = inputElement.type !== 'text';
            setApiKeyFieldVisibility(inputElement, toggleButton, providerName, nextVisible);
        });
    }

    function updateProviderVisibility(provider) {
        const isClaude = provider === 'claude';
        const isOpenai = provider === 'openai';
        const isOllama = provider === 'ollama';

        if (claudeSettingsGroup) {
            claudeSettingsGroup.classList.toggle('hidden', !isClaude);
        }
        if (openaiSettingsGroup) {
            openaiSettingsGroup.classList.toggle('hidden', !isOpenai);
        }
        if (ollamaSettingsGroup) {
            ollamaSettingsGroup.classList.toggle('hidden', !isOllama);
        }
    }

    function bindProviderToggle() {
        if (!settingAiProvider) {
            return;
        }

        settingAiProvider.addEventListener('change', () => {
            updateProviderVisibility(settingAiProvider.value);
        });
    }

    async function fetchOllamaModels() {
        if (!settingOllamaBaseUrl || !settingOllamaModelSelect) {
            return;
        }

        const baseUrl = settingOllamaBaseUrl.value.trim() || 'http://localhost:11434';

        try {
            if (fetchOllamaModelsBtn) {
                fetchOllamaModelsBtn.textContent = '...';
                fetchOllamaModelsBtn.disabled = true;
            }

            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API returned ${response.status}`);
            }

            const data = await response.json();
            const models = Array.isArray(data.models) ? data.models : [];

            if (models.length === 0) {
                showFeedback?.('No models found. Pull a model first with: ollama pull <model>', 'error');
                return;
            }

            settingOllamaModelSelect.innerHTML = '';
            models.forEach((model) => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                settingOllamaModelSelect.appendChild(option);
            });

            // Pre-select current model if it's in the list
            const currentModel = settingOllamaModel ? settingOllamaModel.value.trim() : '';
            const modelNames = models.map((m) => m.name);
            if (currentModel && modelNames.includes(currentModel)) {
                settingOllamaModelSelect.value = currentModel;
            }

            settingOllamaModelSelect.classList.remove('hidden');

            // When user picks from dropdown, update the text input
            settingOllamaModelSelect.addEventListener('change', () => {
                if (settingOllamaModel) {
                    settingOllamaModel.value = settingOllamaModelSelect.value;
                }
            }, { once: false });

            showFeedback?.(`Found ${models.length} model(s). Select one from the dropdown.`, 'success');
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            showFeedback?.(`Could not reach Ollama at ${baseUrl}. Is it running?`, 'error');
        } finally {
            if (fetchOllamaModelsBtn) {
                fetchOllamaModelsBtn.textContent = 'Fetch';
                fetchOllamaModelsBtn.disabled = false;
            }
        }
    }

    function bindFetchOllamaModels() {
        if (!fetchOllamaModelsBtn) {
            return;
        }

        fetchOllamaModelsBtn.addEventListener('click', () => {
            fetchOllamaModels();
        });
    }

    function populateClaudeModelOptions(models, selectedModel) {
        if (!settingClaudeModel) {
            return;
        }

        settingClaudeModel.innerHTML = '';

        const configuredModels = Array.isArray(models) ? models : [];
        if (configuredModels.length === 0) {
            throw new Error('Claude models are not configured.');
        }

        configuredModels.forEach((modelName) => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            settingClaudeModel.appendChild(option);
        });

        settingClaudeModel.value = configuredModels.includes(selectedModel)
            ? selectedModel
            : configuredModels[0];
    }

    function populateOpenAiModelOptions(models, selectedModel) {
        if (!settingOpenaiModel) {
            return;
        }

        settingOpenaiModel.innerHTML = '';

        const configuredModels = Array.isArray(models) ? models : [];
        if (configuredModels.length === 0) {
            throw new Error('OpenAI models are not configured.');
        }

        configuredModels.forEach((modelName) => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            settingOpenaiModel.appendChild(option);
        });

        settingOpenaiModel.value = configuredModels.includes(selectedModel)
            ? selectedModel
            : configuredModels[0];
    }

    function renderProgrammingLanguageCheckboxes(allLanguages, selectedCsv, defaultSingle) {
        if (!settingProgrammingLanguage) {
            return;
        }

        settingProgrammingLanguage.innerHTML = '';

        const configuredLanguages = Array.isArray(allLanguages) ? allLanguages : [];
        if (configuredLanguages.length === 0) {
            throw new Error('Programming languages are not configured.');
        }

        const selected = new Set(
            String(selectedCsv || '').split(',').map((s) => s.trim()).filter(Boolean)
        );
        const fallback =
            defaultSingle && configuredLanguages.includes(defaultSingle)
                ? defaultSingle
                : configuredLanguages[0];

        for (const languageName of configuredLanguages) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = languageName;
            if (selected.size === 0) {
                input.checked = languageName === fallback;
            } else {
                input.checked = selected.has(languageName);
            }
            label.appendChild(input);
            label.appendChild(document.createTextNode(languageName));
            settingProgrammingLanguage.appendChild(label);
        }
    }

    function populateAssemblyAiSpeechModelOptions(models, selectedModel) {
        if (!settingAssemblyModel) {
            return;
        }

        settingAssemblyModel.innerHTML = '';

        const configuredModels = Array.isArray(models) ? models : [];
        if (configuredModels.length === 0) {
            throw new Error('AssemblyAI speech models are not configured.');
        }

        configuredModels.forEach((modelName) => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            settingAssemblyModel.appendChild(option);
        });

        settingAssemblyModel.value = configuredModels.includes(selectedModel)
            ? selectedModel
            : configuredModels[0];
    }

    async function openSettings() {
        if (!settingsPanel) {
            return;
        }

        try {
            const settings = await window.electronAPI.getSettings();
            if (settings && !settings.error) {
                applySettingsShortcutConfig?.(settings);

                // AI Provider
                const activeProvider = settings.aiProvider || 'claude';
                if (settingAiProvider) {
                    settingAiProvider.value = activeProvider;
                }
                updateProviderVisibility(activeProvider);

                // Claude settings
                if (settingClaudeKey) settingClaudeKey.value = settings.claudeApiKey || '';
                populateClaudeModelOptions(settings.claudeModels, settings.claudeModel || settings.defaultClaudeModel);

                if (settingOpenaiKey) settingOpenaiKey.value = settings.openaiApiKey || '';
                populateOpenAiModelOptions(settings.openaiModels, settings.openaiModel || settings.defaultOpenAiModel);

                // Ollama settings
                if (settingOllamaBaseUrl) settingOllamaBaseUrl.value = settings.ollamaBaseUrl || 'http://localhost:11434';
                if (settingOllamaModel) settingOllamaModel.value = settings.ollamaModel || 'llama3.2';
                if (settingOllamaModelSelect) settingOllamaModelSelect.classList.add('hidden');

                renderProgrammingLanguageCheckboxes(
                    settings.programmingLanguages,
                    settings.programmingLanguage || settings.defaultProgrammingLanguage,
                    settings.defaultProgrammingLanguage
                );
                if (settingAssemblyKey) settingAssemblyKey.value = settings.assemblyAiApiKey || '';
                populateAssemblyAiSpeechModelOptions(
                    settings.assemblyAiSpeechModels,
                    settings.assemblyAiSpeechModel || settings.defaultAssemblyAiSpeechModel
                );
                if (settingWindowOpacity) {
                    settingWindowOpacity.value = normalizeWindowOpacityLevel(settings.windowOpacityLevel);
                }
                updateWindowOpacityValueLabel(settings.windowOpacityLevel);
                if (settingAutoAnswerDebounceMs) {
                    settingAutoAnswerDebounceMs.value = normalizePositiveInteger(settings.autoAnswerDebounceMs, 1800, 250);
                }
                if (settingAutoAnswerCooldownMs) {
                    settingAutoAnswerCooldownMs.value = normalizePositiveInteger(settings.autoAnswerCooldownMs, 7000, 500);
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        setApiKeyFieldVisibility(settingClaudeKey, toggleClaudeKeyVisibilityBtn, 'Claude', false);
        setApiKeyFieldVisibility(settingOpenaiKey, toggleOpenaiKeyVisibilityBtn, 'OpenAI', false);
        setApiKeyFieldVisibility(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI', false);

        settingsPanel.classList.remove('hidden');
    }

    function closeSettings() {
        if (settingsPanel) {
            settingsPanel.classList.add('hidden');
        }

        setApiKeyFieldVisibility(settingClaudeKey, toggleClaudeKeyVisibilityBtn, 'Claude', false);
        setApiKeyFieldVisibility(settingOpenaiKey, toggleOpenaiKeyVisibilityBtn, 'OpenAI', false);
        setApiKeyFieldVisibility(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI', false);
    }

    async function saveSettings() {
        try {
            const aiProvider = settingAiProvider ? settingAiProvider.value : 'claude';

            if (aiProvider === 'claude') {
                if (!settingClaudeModel || settingClaudeModel.options.length === 0) {
                    throw new Error('Claude models are not configured.');
                }
            }

            if (aiProvider === 'openai') {
                if (!settingOpenaiModel || settingOpenaiModel.options.length === 0) {
                    throw new Error('OpenAI models are not configured.');
                }
            }

            const programmingCheckboxes = settingProgrammingLanguage
                ? settingProgrammingLanguage.querySelectorAll('input[type=checkbox]')
                : [];
            if (!settingProgrammingLanguage || programmingCheckboxes.length === 0) {
                throw new Error('Programming languages are not configured.');
            }

            const selectedProgrammingLanguages = Array.from(
                settingProgrammingLanguage.querySelectorAll('input[type=checkbox]:checked')
            ).map((input) => input.value);

            if (selectedProgrammingLanguages.length === 0) {
                showFeedback?.('Select at least one programming language.', 'error');
                return { success: false, error: 'Select at least one programming language.' };
            }

            if (!settingAssemblyModel || settingAssemblyModel.options.length === 0) {
                throw new Error('AssemblyAI speech models are not configured.');
            }

            const settings = {
                aiProvider,
                claudeApiKey: settingClaudeKey ? settingClaudeKey.value.trim() : '',
                openaiApiKey: settingOpenaiKey ? settingOpenaiKey.value.trim() : '',
                assemblyAiApiKey: settingAssemblyKey ? settingAssemblyKey.value.trim() : '',
                claudeModel: settingClaudeModel ? settingClaudeModel.value : '',
                openaiModel: settingOpenaiModel ? settingOpenaiModel.value : '',
                ollamaBaseUrl: settingOllamaBaseUrl ? settingOllamaBaseUrl.value.trim() : '',
                ollamaModel: settingOllamaModel ? settingOllamaModel.value.trim() : '',
                programmingLanguage: selectedProgrammingLanguages.join(','),
                assemblyAiSpeechModel: settingAssemblyModel.value,
                windowOpacityLevel: normalizeWindowOpacityLevel(settingWindowOpacity?.value),
                autoAnswerDebounceMs: normalizePositiveInteger(settingAutoAnswerDebounceMs?.value, 1800, 250),
                autoAnswerCooldownMs: normalizePositiveInteger(settingAutoAnswerCooldownMs?.value, 7000, 500)
            };

            const result = await window.electronAPI.saveSettings(settings);

            if (result.success) {
                showFeedback?.('Settings saved. Latest AI settings are active now; voice model applies next session.', 'success');
                onSettingsSaved?.(settings);
                closeSettings();
                return { success: true, settings };
            } else {
                showFeedback?.(`Failed to save: ${result.error}`, 'error');
                return { success: false, error: result.error || 'Failed to save settings' };
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            showFeedback?.('Failed to save settings', 'error');
            return { success: false, error: error.message || 'Failed to save settings' };
        }
    }

    bindApiKeyVisibilityToggle(settingClaudeKey, toggleClaudeKeyVisibilityBtn, 'Claude');
    bindApiKeyVisibilityToggle(settingOpenaiKey, toggleOpenaiKeyVisibilityBtn, 'OpenAI');
    bindApiKeyVisibilityToggle(settingAssemblyKey, toggleAssemblyKeyVisibilityBtn, 'AssemblyAI');
    bindProviderToggle();
    bindFetchOllamaModels();

    return {
        normalizeWindowOpacityLevel,
        updateWindowOpacityValueLabel,
        openSettings,
        closeSettings,
        saveSettings
    };
}
