import { ParticleClock } from './canvas-clock';
import { FavoritesManager, FavoriteItem } from './favorites';
import { SearchController } from './search';

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
  window.addEventListener('mousemove', (e: MouseEvent) => {
    document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);

    // Proximity awakening for favorites sidebar
    if (sidebar) {
      if (e.clientX < 260) {
        sidebar.classList.add('near-cursor');
      } else {
        sidebar.classList.remove('near-cursor');
      }
    }

    // Proximity awakening for top-right controls
    if (topToolbar) {
      if (window.innerWidth - e.clientX < 240 && e.clientY < 90) {
        topToolbar.classList.add('near-cursor');
      } else {
        topToolbar.classList.remove('near-cursor');
      }
    }
  });

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

  const favorites = new FavoritesManager(favoritesList, favoritesCount);

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

    // Cmd+K or Ctrl+K -> Focus Search
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

    // Escape handling
    if (e.key === 'Escape') {
      if (favModal.classList.contains('open')) {
        closeFavoriteModal();
        return;
      }
      if (shortcutsModal.classList.contains('open')) {
        closeShortcutsModal();
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
