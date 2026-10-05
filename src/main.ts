import { ParticleClock } from './canvas-clock';
import { FavoritesManager, FavoriteItem } from './favorites';
import { SearchController } from './search';
import { SentinelService } from './ai/sentinel';
import { formatSentinelMarkdown } from './ai/markdown';

// State configuration keys
const PREF_24H_KEY = 'monochrome_pref_24h';
const PREF_SECONDS_KEY = 'monochrome_pref_sec';
const PREF_SIDEBAR_KEY = 'monochrome_pref_sidebar';

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // Preferences
  // --------------------------------------------------------------------------
  const is24Hour = localStorage.getItem(PREF_24H_KEY) !== 'false'; // default true
  const showSeconds = localStorage.getItem(PREF_SECONDS_KEY) === 'true'; // default false
  const isSidebarCollapsed = localStorage.getItem(PREF_SIDEBAR_KEY) === 'true';

  // --------------------------------------------------------------------------
  // DOM Elements
  // --------------------------------------------------------------------------
  const clockCanvas = document.getElementById('clock-canvas') as HTMLCanvasElement;
  const dateDisplay = document.getElementById('date-display') as HTMLElement;
  const fpsCounter = document.getElementById('fps-counter') as HTMLElement;
  const particleCounter = document.getElementById('particle-counter') as HTMLElement;

  const btnToggleFormat = document.getElementById('btn-toggle-format') as HTMLButtonElement;
  const formatLabel = document.getElementById('format-label') as HTMLElement;
  const btnToggleSeconds = document.getElementById('btn-toggle-seconds') as HTMLButtonElement;
  const secondsLabel = document.getElementById('seconds-label') as HTMLElement;
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar') as HTMLButtonElement;
  const btnOpenShortcuts = document.getElementById('btn-open-shortcuts') as HTMLButtonElement;

  const sidebar = document.getElementById('favorites-sidebar') as HTMLElement;
  const favoritesList = document.getElementById('favorites-list') as HTMLUListElement;
  const favoritesCount = document.getElementById('favorites-count') as HTMLElement;
  const btnAddFavorite = document.getElementById('btn-add-favorite') as HTMLButtonElement;

  const searchForm = document.getElementById('search-form') as HTMLFormElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchContainer = document.getElementById('search-container') as HTMLElement;
  const searchClearBtn = document.getElementById('search-clear-btn') as HTMLButtonElement;
  const searchKbdHint = document.getElementById('search-kbd-hint') as HTMLElement;

  // Sentinel Elements
  const appEl = document.getElementById('app') as HTMLElement;
  const clockContainer = document.getElementById('clock-container') as HTMLElement | null;
  const sentinelPromptText = document.getElementById('sentinel-prompt-text') as HTMLElement | null;
  const sentinelConfigureBtn = document.getElementById('sentinel-configure-btn') as HTMLButtonElement | null;
  const sentinelConfigStatusLabel = document.getElementById('sentinel-config-status-label') as HTMLElement | null;
  const sentinelResponseContainer = document.getElementById('sentinel-response-container') as HTMLElement;
  const sentinelQueryEcho = document.getElementById('sentinel-query-echo') as HTMLElement;
  const sentinelAnswerText = document.getElementById('sentinel-answer-text') as HTMLElement;
  const btnOpenSentinelSettings = document.getElementById('btn-open-sentinel-settings') as HTMLButtonElement;

  const sentinelModal = document.getElementById('sentinel-modal') as HTMLElement;
  const sentinelModalClose = document.getElementById('sentinel-modal-close-btn') as HTMLButtonElement;

  // Modals
  const favModal = document.getElementById('favorite-modal') as HTMLElement;
  const favModalTitle = document.getElementById('modal-title') as HTMLElement;
  const favModalForm = document.getElementById('favorite-form') as HTMLFormElement;
  const favIdInput = document.getElementById('fav-id') as HTMLInputElement;
  const favTitleInput = document.getElementById('fav-title') as HTMLInputElement;
  const favUrlInput = document.getElementById('fav-url') as HTMLInputElement;
  const favModalClose = document.getElementById('modal-close-btn') as HTMLButtonElement;
  const favModalCancel = document.getElementById('modal-cancel-btn') as HTMLButtonElement;

  const shortcutsModal = document.getElementById('shortcuts-modal') as HTMLElement;
  const shortcutsClose = document.getElementById('shortcuts-close-btn') as HTMLButtonElement;
  const scMeta = document.getElementById('sc-meta') as HTMLElement;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (scMeta) {
    scMeta.textContent = isMac ? '⌘' : 'Ctrl';
  }

  // --------------------------------------------------------------------------
  // Cursor Atmospheric Lighting & Proximity Awakening
  // --------------------------------------------------------------------------
  const topToolbar = document.getElementById('top-toolbar');
  const cursorGlow = document.getElementById('cursor-glow');

  let mouseRafScheduled = false;
  let lastClientX = window.innerWidth / 2;
  let lastClientY = window.innerHeight / 2;

  window.addEventListener(
    'mousemove',
    (e: MouseEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (!mouseRafScheduled) {
        mouseRafScheduled = true;
        requestAnimationFrame(() => {
          mouseRafScheduled = false;

          // Isolate style update to the dedicated glow layer
          if (cursorGlow) {
            cursorGlow.style.setProperty('--cursor-x', `${lastClientX}px`);
            cursorGlow.style.setProperty('--cursor-y', `${lastClientY}px`);
          }

          // Proximity awakening for favorites sidebar
          if (sidebar) {
            if (lastClientX < 260) {
              sidebar.classList.add('near-cursor');
            } else {
              sidebar.classList.remove('near-cursor');
            }
          }

          // Proximity awakening for top-right controls
          if (topToolbar) {
            if (window.innerWidth - lastClientX < 240 && lastClientY < 90) {
              topToolbar.classList.add('near-cursor');
            } else {
              topToolbar.classList.remove('near-cursor');
            }
          }
        });
      }
    },
    { passive: true }
  );

  // --------------------------------------------------------------------------
  // Particle Clock
  // --------------------------------------------------------------------------
  let current24Hour = is24Hour;
  let currentShowSeconds = showSeconds;

  const updateToolbarLabels = () => {
    formatLabel.textContent = current24Hour ? '24H' : '12H';
    if (btnToggleFormat) {
      btnToggleFormat.classList.toggle('active', current24Hour);
    }
    secondsLabel.textContent = currentShowSeconds ? 'SEC ON' : 'SEC';
    if (btnToggleSeconds) {
      btnToggleSeconds.classList.toggle('active', currentShowSeconds);
    }
  };

  updateToolbarLabels();

  const clock = new ParticleClock(clockCanvas, {
    is24Hour: current24Hour,
    showSeconds: currentShowSeconds,
    onFpsUpdate: (fps) => {
      if (fpsCounter) fpsCounter.textContent = `${fps} FPS`;
    },
    onParticleCountUpdate: (count) => {
      if (particleCounter) particleCounter.textContent = `${count} PTS`;
    },
  });

  const toggleTimeFormat = () => {
    current24Hour = !current24Hour;
    localStorage.setItem(PREF_24H_KEY, String(current24Hour));
    clock.set24Hour(current24Hour);
    updateToolbarLabels();
  };

  const toggleSecondsDisplay = () => {
    currentShowSeconds = !currentShowSeconds;
    localStorage.setItem(PREF_SECONDS_KEY, String(currentShowSeconds));
    clock.setShowSeconds(currentShowSeconds);
    updateToolbarLabels();
  };

  btnToggleFormat.addEventListener('click', toggleTimeFormat);
  btnToggleSeconds.addEventListener('click', toggleSecondsDisplay);

  // --------------------------------------------------------------------------
  // Date Display
  // --------------------------------------------------------------------------
  const updateDate = () => {
    const now = new Date();
    const dayName = now.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase();
    const monthName = now.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
    const dayNumber = now.getDate();

    dateDisplay.textContent = `${dayName} · ${monthName} ${dayNumber}`;
  };

  updateDate();
  setInterval(updateDate, 30000);

  // --------------------------------------------------------------------------
  // Search Controller
  // --------------------------------------------------------------------------
  const search = new SearchController(
    searchForm,
    searchInput,
    searchContainer,
    searchClearBtn,
    searchKbdHint
  );

  // --------------------------------------------------------------------------
  // Favorites Manager
  // --------------------------------------------------------------------------
  const favorites = new FavoritesManager(favoritesList, favoritesCount);

  // --------------------------------------------------------------------------
  // Sentinel AI Integration & Intent Coordination
  // --------------------------------------------------------------------------
  const sentinel = new SentinelService(favorites);

  const sentinelSettingsForm = document.getElementById('sentinel-settings-form') as HTMLFormElement;
  const sentinelProviderSelect = document.getElementById('sentinel-provider-select') as HTMLSelectElement;
  const sentinelModelSelect = document.getElementById('sentinel-model-select') as HTMLSelectElement | null;
  const sentinelApiKey = document.getElementById('sentinel-api-key') as HTMLInputElement;
  const sentinelBtnTest = document.getElementById('sentinel-btn-test') as HTMLButtonElement;
  const sentinelBtnClear = document.getElementById('sentinel-btn-clear') as HTMLButtonElement;
  const sentinelConnectionStatus = document.getElementById('sentinel-connection-status') as HTMLElement;
  const sentinelStatusLabel = document.getElementById('sentinel-status-label') as HTMLElement;
  const sentinelStatusDetails = document.getElementById('sentinel-status-details') as HTMLElement | null;
  const sentinelKeyHelpLink = document.getElementById('sentinel-key-help-link') as HTMLAnchorElement | null;

  const PROVIDER_METADATA: Record<string, {
    helpUrl: string;
    helpText: string;
    placeholder: string;
    models: Array<{ value: string; label: string }>;
  }> = {
    groq: {
      helpUrl: 'https://console.groq.com/keys',
      helpText: 'Get free Groq key ↗',
      placeholder: 'Paste your free Groq API key (gsk_...)...',
      models: [
        { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended Free - Smart & Fast)' },
        { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Instant Speed - 100% Free)' },
        { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (32k Context - 100% Free)' },
        { value: 'gemma2-9b-it', label: 'Google Gemma 2 9B (100% Free)' },
      ],
    },
    openrouter: {
      helpUrl: 'https://openrouter.ai/keys',
      helpText: 'Get free OpenRouter key ↗',
      placeholder: 'Paste your free OpenRouter key (sk-or-...)...',
      models: [
        { value: 'openrouter/free', label: 'Auto Free Router (Always Active & Free)' },
        { value: 'google/gemma-4-31b-it:free', label: 'Google Gemma 4 31B Free' },
        { value: 'google/gemma-4-26b-a4b-it:free', label: 'Google Gemma 4 26B Free' },
        { value: 'nvidia/nemotron-3.5-lightning:free', label: 'NVIDIA Nemotron 3.5 Lightning Free' },
        { value: 'liquid/lfm-2.5-2.6b:free', label: 'LiquidAI LFM 2.6B Free' },
      ],
    },
    gemini: {
      helpUrl: 'https://aistudio.google.com/apikey',
      helpText: 'Get free Gemini key ↗',
      placeholder: 'Paste your Google AI Studio API key (AIzaSy...)...',
      models: [
        { value: 'auto', label: 'Auto-Detect / Adaptive Fallback (Free Tier Guaranteed)' },
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fast & Free Tier)' },
        { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (High Performance)' },
        { value: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro (Ultra / Flagship Quality)' },
        { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { value: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      ],
    },
    openai: {
      helpUrl: 'https://platform.openai.com/api-keys',
      helpText: 'Get key ↗',
      placeholder: 'Paste your OpenAI API key (sk-...)...',
      models: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Cheap)' },
        { value: 'gpt-4o', label: 'GPT-4o (Flagship)' },
      ],
    },
    claude: {
      helpUrl: 'https://console.anthropic.com/settings/keys',
      helpText: 'Get key ↗',
      placeholder: 'Paste your Anthropic API key (sk-ant-...)...',
      models: [
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)' },
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Intelligent)' },
      ],
    },
  };

  const updateProviderUI = (selectedModel?: string) => {
    const provider = sentinelProviderSelect.value;
    const meta = PROVIDER_METADATA[provider] || PROVIDER_METADATA.gemini;

    if (sentinelKeyHelpLink) {
      sentinelKeyHelpLink.href = meta.helpUrl;
      sentinelKeyHelpLink.textContent = meta.helpText;
    }
    if (sentinelApiKey) {
      sentinelApiKey.placeholder = meta.placeholder;
    }

    if (sentinelModelSelect) {
      sentinelModelSelect.innerHTML = meta.models
        .map((m) => `<option value="${m.value}">${m.label}</option>`)
        .join('');
      if (selectedModel && meta.models.some((m) => m.value === selectedModel)) {
        sentinelModelSelect.value = selectedModel;
      } else {
        sentinelModelSelect.value = meta.models[0].value;
      }
    }
  };

  if (sentinelProviderSelect) {
    sentinelProviderSelect.addEventListener('change', async () => {
      const selectedProvider = sentinelProviderSelect.value;
      updateProviderUI();
      const providerKey = await sentinel.getSettingsManager().getKeyForProvider(selectedProvider);
      if (sentinelApiKey) {
        sentinelApiKey.value = providerKey;
      }
      if (sentinelStatusDetails) {
        sentinelStatusDetails.textContent = '';
        sentinelStatusDetails.classList.remove('visible');
      }
      if (sentinelStatusLabel) {
        sentinelStatusLabel.textContent = providerKey ? '● Configured' : 'No key configured';
      }
      if (sentinelConnectionStatus) {
        sentinelConnectionStatus.className = providerKey ? 'sentinel-connection-status connected' : 'sentinel-connection-status';
      }
    });
  }

  // --------------------------------------------------------------------------
  // Sentinel State Transitions & Mode Integration
  // --------------------------------------------------------------------------
  const updateSentinelButtonStatus = async () => {
    const isConfigured = await sentinel.isConfigured();
    const settings = await sentinel.getSettingsManager().getSettings();
    if (sentinelConfigStatusLabel) {
      if (isConfigured) {
        sentinelConfigStatusLabel.textContent = `${settings.provider.toUpperCase()} READY`;
      } else {
        sentinelConfigStatusLabel.textContent = 'Configure AI';
      }
    }
    if (sentinelConfigureBtn) {
      sentinelConfigureBtn.classList.toggle('ready', isConfigured);
      sentinelConfigureBtn.title = isConfigured
        ? `Sentinel Ready (${settings.provider.toUpperCase()}) - Click to configure`
        : 'Configure Sentinel AI (API Key & Provider)';
    }
    return isConfigured;
  };

  // Initialize status on boot
  updateSentinelButtonStatus();

  const activateSentinelMode = async () => {
    if (clock.isSentinelActive()) return;

    // Check BYOK readiness & update status
    const isReady = await updateSentinelButtonStatus();
    if (!isReady) {
      if (sentinelPromptText) {
        sentinelPromptText.textContent = 'Sentinel offline';
      }
    } else {
      if (sentinelPromptText) {
        sentinelPromptText.textContent = 'What do you require?';
      }
    }

    // Activate particle orb front and center above the search bar
    clock.activateSentinel();
    appEl.classList.add('sentinel-active');
    if (clockContainer) {
      clockContainer.title = 'Click particles to return to Clock';
    }
    search.setMode('sentinel');
    search.focus();
  };

  const deactivateSentinelMode = () => {
    if (!clock.isSentinelActive()) return;

    clock.deactivateSentinel();
    appEl.classList.remove('sentinel-active');
    if (clockContainer) {
      clockContainer.title = 'Click particles to activate Sentinel AI';
    }
    search.setMode('search');
    search.clear();
    search.blur();

    // Reset response stage
    if (sentinelResponseContainer) {
      sentinelResponseContainer.classList.remove('visible');
    }
    if (sentinelPromptText) {
      sentinelPromptText.textContent = 'What do you require?';
    }
  };

  const toggleSentinelMode = () => {
    if (clock.isTransitioning()) return;

    if (clock.isSentinelActive()) {
      deactivateSentinelMode();
    } else {
      activateSentinelMode();
    }
  };

  // Direct particle interaction: Click clock particles to activate Sentinel, click Sentinel particles to return
  if (clockCanvas) {
    clockCanvas.addEventListener('click', () => {
      toggleSentinelMode();
    });
  }

  // Handle Sentinel input query submission
  search.onSentinelSubmit = async (query) => {
    clock.setSentinelThinking(true);
    if (sentinelPromptText) {
      sentinelPromptText.textContent = 'thinking';
    }
    if (sentinelResponseContainer) {
      sentinelResponseContainer.classList.add('visible');
    }
    if (sentinelQueryEcho) {
      sentinelQueryEcho.textContent = query;
    }
    if (sentinelAnswerText) {
      sentinelAnswerText.textContent = '';
    }
    search.clear();

    const result = await sentinel.query(query);

    clock.setSentinelThinking(false);
    if (sentinelPromptText) {
      sentinelPromptText.textContent = '';
    }
    if (sentinelAnswerText) {
      sentinelAnswerText.innerHTML = formatSentinelMarkdown(result.text);
    }
    if (sentinelResponseContainer) {
      sentinelResponseContainer.scrollTop = 0;
    }
    await updateSentinelButtonStatus();
  };

  // --------------------------------------------------------------------------
  // Sentinel BYOK Settings Modal
  // --------------------------------------------------------------------------
  const openSentinelModal = async () => {
    if (!sentinelModal) return;

    const settings = await sentinel.getSettingsManager().getSettings();
    if (sentinelProviderSelect) sentinelProviderSelect.value = settings.provider;
    updateProviderUI(settings.model);
    if (sentinelApiKey) sentinelApiKey.value = settings.apiKey;
    if (sentinelStatusDetails) {
      sentinelStatusDetails.textContent = '';
      sentinelStatusDetails.classList.remove('visible');
    }

    if (settings.apiKey) {
      if (sentinelStatusLabel) sentinelStatusLabel.textContent = '● Connected';
      if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status connected';
    } else {
      if (sentinelStatusLabel) sentinelStatusLabel.textContent = 'No key configured';
      if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status';
    }

    sentinelModal.classList.add('open');
    sentinelModal.setAttribute('aria-hidden', 'false');
    if (sentinelApiKey) sentinelApiKey.focus();
  };

  const closeSentinelModal = async () => {
    if (sentinelModal) {
      const apiKey = sentinelApiKey ? sentinelApiKey.value.trim() : '';
      if (apiKey && sentinelProviderSelect) {
        const provider = sentinelProviderSelect.value as any;
        const model = sentinelModelSelect ? sentinelModelSelect.value : 'auto';
        await sentinel.getSettingsManager().saveSettings({ provider, apiKey, model });
        await updateSentinelButtonStatus();
      }
      sentinelModal.classList.remove('open');
      sentinelModal.setAttribute('aria-hidden', 'true');
    }
  };

  if (btnOpenSentinelSettings) {
    btnOpenSentinelSettings.addEventListener('click', openSentinelModal);
  }
  if (sentinelModalClose) {
    sentinelModalClose.addEventListener('click', closeSentinelModal);
  }
  if (sentinelConfigureBtn) {
    sentinelConfigureBtn.addEventListener('click', openSentinelModal);
  }
  if (sentinelModal) {
    sentinelModal.addEventListener('click', (e) => {
      if (e.target === sentinelModal) closeSentinelModal();
    });
  }

  if (sentinelBtnTest) {
    sentinelBtnTest.addEventListener('click', async () => {
      const providerId = sentinelProviderSelect.value as any;
      const key = sentinelApiKey.value.trim();
      const model = sentinelModelSelect ? sentinelModelSelect.value : 'auto';

      if (sentinelStatusLabel) sentinelStatusLabel.textContent = 'Testing connection...';
      if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status';
      if (sentinelStatusDetails) {
        sentinelStatusDetails.textContent = '';
        sentinelStatusDetails.classList.remove('visible');
      }

      const res = await sentinel.testConnection(providerId, key, model);
      if (res.success) {
        // Automatically save verified working key and model
        await sentinel.getSettingsManager().saveSettings({
          provider: providerId,
          apiKey: key,
          model: res.modelUsed || model,
        });
        await updateSentinelButtonStatus();
        if (sentinelStatusLabel) sentinelStatusLabel.textContent = `● ${res.message} & Saved`;
        if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status connected';
        if (res.details && sentinelStatusDetails) {
          sentinelStatusDetails.textContent = res.details;
          sentinelStatusDetails.classList.add('visible');
        }
      } else {
        if (sentinelStatusLabel) sentinelStatusLabel.textContent = res.message;
        if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status error';
        if (res.details && sentinelStatusDetails) {
          sentinelStatusDetails.textContent = res.details;
          sentinelStatusDetails.classList.add('visible');
        }
      }
    });
  }

  if (sentinelBtnClear) {
    sentinelBtnClear.addEventListener('click', async () => {
      await sentinel.getSettingsManager().clearKey();
      if (sentinelApiKey) sentinelApiKey.value = '';
      if (sentinelStatusLabel) sentinelStatusLabel.textContent = 'No key configured';
      if (sentinelConnectionStatus) sentinelConnectionStatus.className = 'sentinel-connection-status';
      if (sentinelStatusDetails) {
        sentinelStatusDetails.textContent = '';
        sentinelStatusDetails.classList.remove('visible');
      }
      await updateSentinelButtonStatus();
    });
  }

  if (sentinelSettingsForm) {
    sentinelSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provider = sentinelProviderSelect.value as any;
      const apiKey = sentinelApiKey.value.trim();
      const model = sentinelModelSelect ? sentinelModelSelect.value : 'auto';

      await sentinel.getSettingsManager().saveSettings({ provider, apiKey, model });
      await updateSentinelButtonStatus();
      closeSentinelModal();

      if (clock.isSentinelActive()) {
        if (apiKey) {
          if (sentinelPromptText) sentinelPromptText.textContent = 'ONLINE';
          setTimeout(() => {
            if (sentinelPromptText && sentinelPromptText.textContent === 'ONLINE') {
              sentinelPromptText.textContent = 'What do you require?';
            }
          }, 1000);
        } else {
          if (sentinelPromptText) sentinelPromptText.textContent = 'Sentinel offline';
        }
      }
    });
  }


  // --------------------------------------------------------------------------
  // Favorites Sidebar
  // --------------------------------------------------------------------------
  if (isSidebarCollapsed) {
    sidebar.classList.add('collapsed');
  }

  const toggleSidebar = () => {
    const isNowCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem(PREF_SIDEBAR_KEY, String(isNowCollapsed));
  };

  btnToggleSidebar.addEventListener('click', toggleSidebar);

  // Modal open helpers
  const openAddFavoriteModal = () => {
    favModalTitle.textContent = 'Add Favorite';
    favIdInput.value = '';
    favTitleInput.value = '';
    favUrlInput.value = '';
    favModal.classList.add('open');
    favModal.setAttribute('aria-hidden', 'false');
    favTitleInput.focus();
  };

  const openEditFavoriteModal = (fav: FavoriteItem) => {
    favModalTitle.textContent = 'Edit Favorite';
    favIdInput.value = fav.id;
    favTitleInput.value = fav.title;
    favUrlInput.value = fav.url;
    favModal.classList.add('open');
    favModal.setAttribute('aria-hidden', 'false');
    favTitleInput.focus();
  };

  const closeFavoriteModal = () => {
    favModal.classList.remove('open');
    favModal.setAttribute('aria-hidden', 'true');
    favModalForm.reset();
  };

  favorites.onEditRequest = (fav) => {
    openEditFavoriteModal(fav);
  };

  btnAddFavorite.addEventListener('click', openAddFavoriteModal);
  favModalClose.addEventListener('click', closeFavoriteModal);
  favModalCancel.addEventListener('click', closeFavoriteModal);

  favModalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = favIdInput.value.trim();
    const title = favTitleInput.value.trim();
    const url = favUrlInput.value.trim();

    if (!url) return;

    if (id) {
      favorites.updateFavorite(id, title, url);
    } else {
      favorites.addFavorite(title, url);
    }
    closeFavoriteModal();
  });

  // --------------------------------------------------------------------------
  // Shortcuts Modal
  // --------------------------------------------------------------------------
  const openShortcutsModal = () => {
    shortcutsModal.classList.add('open');
    shortcutsModal.setAttribute('aria-hidden', 'false');
  };

  const closeShortcutsModal = () => {
    shortcutsModal.classList.remove('open');
    shortcutsModal.setAttribute('aria-hidden', 'true');
  };

  btnOpenShortcuts.addEventListener('click', openShortcutsModal);
  shortcutsClose.addEventListener('click', closeShortcutsModal);

  // Close modals clicking on backdrop
  favModal.addEventListener('click', (e) => {
    if (e.target === favModal) closeFavoriteModal();
  });
  shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) closeShortcutsModal();
  });

  // --------------------------------------------------------------------------
  // Global Keyboard Shortcuts
  // --------------------------------------------------------------------------
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const isInputActive =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;

    // Cmd+K or Ctrl+K -> Focus Search / Sentinel
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      search.focus();
      return;
    }

    // Ctrl+N -> Add new favorite
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openAddFavoriteModal();
      return;
    }

    // Ctrl+A or Cmd+A -> Shift to Sentinel AI (Toggle)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      const isInModal = sentinelModal?.classList.contains('open') || favModal.classList.contains('open');
      if (!isInModal) {
        const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
        const isSearchInputFocused = document.activeElement === searchInput;
        const hasText = searchInput && searchInput.value.length > 0;

        // If search input has text and user is inside it, allow standard select-all
        if (isSearchInputFocused && hasText && clock.isSentinelActive()) {
          return;
        }

        e.preventDefault();
        if (clock.isTransitioning()) return;
        if (clock.isSentinelActive()) {
          deactivateSentinelMode();
        } else {
          activateSentinelMode();
        }
        return;
      }
    }

    // Escape handling
    if (e.key === 'Escape') {
      if (sentinelModal && sentinelModal.classList.contains('open')) {
        closeSentinelModal();
        return;
      }
      if (favModal.classList.contains('open')) {
        closeFavoriteModal();
        return;
      }
      if (shortcutsModal.classList.contains('open')) {
        closeShortcutsModal();
        return;
      }
      // If Sentinel is active or transitioning, Escape exits Sentinel and reconstructs clock
      if (clock.isSentinelBusy()) {
        deactivateSentinelMode();
        return;
      }
      if (search.isFocused()) {
        search.clear();
        search.blur();
        return;
      }
      favorites.clearSelection();
      return;
    }

    // Keys when NOT editing inside any input/modal
    if (!isInputActive) {
      // '/' to focus search
      if (e.key === '/') {
        e.preventDefault();
        search.focus();
        return;
      }

      // '?' to open shortcuts modal
      if (e.key === '?') {
        e.preventDefault();
        openShortcutsModal();
        return;
      }

      // 'T' to toggle time format
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTimeFormat();
        return;
      }

      // 'S' to toggle seconds
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        toggleSecondsDisplay();
        return;
      }

      // 'B' to toggle sidebar
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Arrow navigation for favorites
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        favorites.selectNext();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        favorites.selectPrev();
        return;
      }

      // Enter to open selected favorite
      if (e.key === 'Enter') {
        if (favorites.getSelectedIndex() >= 0) {
          e.preventDefault();
          favorites.openSelected(e.metaKey || e.ctrlKey);
          return;
        }
      }
    }
  });
});

