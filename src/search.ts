/**
 * Search Controller
 * Handles query submission (direct URL or Google Search), keyboard navigation,
 * Google predictions, search history with clock icons, AI Mode toggle,
 * visual state management, and clear button behavior.
 */

export interface SuggestionItem {
  type: 'history' | 'suggest';
  text: string;
  subtext?: string;
}

export interface AttachedImage {
  file?: File;
  dataUrl: string;
  name: string;
  sizeFormatted: string;
}

const CLOCK_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const SEARCH_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const DELETE_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export class SearchController {
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private container: HTMLElement;
  private clearBtn: HTMLButtonElement;
  public kbdHint: HTMLElement;
  private aiModeBtn: HTMLButtonElement | null;
  private suggestionsContainer: HTMLElement | null;
  private suggestionsList: HTMLElement | null;

  // Image Attachment Elements
  private attachBtn: HTMLButtonElement | null;
  private fileInput: HTMLInputElement | null;
  private imagePreviewContainer: HTMLElement | null;
  private imageThumb: HTMLImageElement | null;
  private imageName: HTMLElement | null;
  private imageRemoveBtn: HTMLButtonElement | null;

  private currentAttachedImage: AttachedImage | null = null;
  private mode: 'search' | 'sentinel' = 'search';
  private selectedIndex: number = -1;
  private currentSuggestions: SuggestionItem[] = [];
  private originalQuery: string = '';
  private debounceTimer: number | null = null;
  private jsonpCounter: number = 0;
  private historyStorageKey = 'monochrome_search_history';
  private static suggestionCache = new Map<string, string[]>();

  public onSentinelSubmit?: (query: string, attachedImage?: AttachedImage | null) => void;
  public onToggleSentinel?: () => void;

  constructor(
    form: HTMLFormElement,
    input: HTMLInputElement,
    container: HTMLElement,
    clearBtn: HTMLButtonElement,
    kbdHint: HTMLElement,
    aiModeBtn?: HTMLButtonElement | null,
    suggestionsContainer?: HTMLElement | null,
    suggestionsList?: HTMLElement | null
  ) {
    this.form = form;
    this.input = input;
    this.container = container;
    this.clearBtn = clearBtn;
    this.kbdHint = kbdHint;
    this.aiModeBtn = aiModeBtn || container.querySelector('#search-ai-btn');
    this.suggestionsContainer = suggestionsContainer || container.querySelector('#search-suggestions');
    this.suggestionsList = suggestionsList || container.querySelector('#suggestions-list');

    // Query attachment elements
    this.attachBtn = container.querySelector('#search-attach-btn');
    this.fileInput = container.querySelector('#search-file-input');
    this.imagePreviewContainer = container.querySelector('#search-image-preview');
    this.imageThumb = container.querySelector('#search-image-thumb');
    this.imageName = container.querySelector('#search-image-name');
    this.imageRemoveBtn = container.querySelector('#search-image-remove');

    this.init();
  }

  private init(): void {
    // Input focus & blur styling
    const appEl = document.getElementById('app');
    this.input.addEventListener('focus', () => {
      this.container.classList.add('focused');
      if (appEl) appEl.classList.add('search-active');
      this.originalQuery = this.input.value;
      this.handleQueryChange(this.input.value);
    });

    this.input.addEventListener('blur', () => {
      this.container.classList.remove('focused');
      if (appEl) appEl.classList.remove('search-active');
    });

    // Handle typing input
    this.input.addEventListener('input', () => {
      this.originalQuery = this.input.value;
      this.updateClearBtnVisibility();
      this.handleQueryChange(this.input.value);
    });

    // Keyboard navigation (arrows, enter, escape)
    this.input.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Clear button action
    this.clearBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.clear();
      this.closeSuggestions();
      this.input.focus();
    });
    this.clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.clear();
      this.closeSuggestions();
      this.input.focus();
    });

    // AI Mode button toggle - Instant 1-click change
    if (this.aiModeBtn) {
      let lastTrigger = 0;
      const triggerToggle = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTrigger < 200) return;
        lastTrigger = now;
        if (this.onToggleSentinel) {
          this.onToggleSentinel();
        }
      };

      this.aiModeBtn.addEventListener('pointerdown', triggerToggle);
      this.aiModeBtn.addEventListener('mousedown', triggerToggle);
      this.aiModeBtn.addEventListener('click', triggerToggle);
    }

    // Dismiss suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeSuggestions();
      }
    });

    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.selectedIndex >= 0 && this.currentSuggestions[this.selectedIndex]) {
        this.executeSearch(this.currentSuggestions[this.selectedIndex].text);
      } else {
        this.executeSearch();
      }
    });

    // ------------------------------------------------------------------------
    // Image Attachment Handlers ("+" click, Drag & Drop, Clipboard Paste)
    // ------------------------------------------------------------------------

    // 1. "+" button triggers hidden file input
    if (this.attachBtn && this.fileInput) {
      this.attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.fileInput?.click();
      });

      this.fileInput.addEventListener('change', () => {
        if (this.fileInput?.files && this.fileInput.files.length > 0) {
          this.handleFile(this.fileInput.files[0]);
          this.fileInput.value = '';
        }
      });
    }

    // 2. Remove attached image button
    if (this.imageRemoveBtn) {
      this.imageRemoveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeAttachedImage();
        this.focus();
      });
    }

    // 3. Drag and Drop onto Search Container
    let dragCounter = 0;
    this.container.addEventListener('dragenter', (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter++;
        this.container.classList.add('drag-over');
      }
    });

    this.container.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.container.classList.add('drag-over');
      }
    });

    this.container.addEventListener('dragleave', (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        this.container.classList.remove('drag-over');
      }
    });

    this.container.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      this.container.classList.remove('drag-over');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          if (file.type.startsWith('image/')) {
            this.handleFile(file);
            break;
          }
        }
      }
    });

    // Window drag protection
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    });

    window.addEventListener('drop', (e) => {
      if (!this.container.contains(e.target as Node)) {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
        }
      }
    });

    // 4. Clipboard Image Paste (Ctrl+V)
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            this.handleFile(file);
          }
          break;
        }
      }
    };

    this.input.addEventListener('paste', handlePaste);
    window.addEventListener('paste', (e) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' && document.activeElement !== this.input) return;
      if (activeTag === 'textarea') return;
      handlePaste(e);
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.mode === 'sentinel') return;

    if (e.key === 'ArrowDown') {
      if (this.currentSuggestions.length === 0) return;
      e.preventDefault();
      if (!this.isSuggestionsOpen()) {
        this.openSuggestions();
      }
      this.selectedIndex = (this.selectedIndex + 1) % this.currentSuggestions.length;
      this.updateSelectionVisuals();
      this.input.value = this.currentSuggestions[this.selectedIndex].text;
      this.updateClearBtnVisibility();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (this.currentSuggestions.length === 0) return;
      e.preventDefault();
      if (this.selectedIndex <= 0) {
        this.selectedIndex = -1;
        this.input.value = this.originalQuery;
      } else {
        this.selectedIndex--;
        this.input.value = this.currentSuggestions[this.selectedIndex].text;
      }
      this.updateSelectionVisuals();
      this.updateClearBtnVisibility();
      return;
    }

    if (e.key === 'Backspace' && this.input.value.length === 0 && this.currentAttachedImage) {
      e.preventDefault();
      this.removeAttachedImage();
      return;
    }

    if (e.key === 'Escape') {
      if (this.isSuggestionsOpen()) {
        e.preventDefault();
        e.stopPropagation();
        this.closeSuggestions();
        this.input.value = this.originalQuery;
        return;
      }
    }
  }

  private updateSelectionVisuals(): void {
    if (!this.suggestionsList) return;
    const items = this.suggestionsList.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  private isSuggestionsOpen(): boolean {
    return this.suggestionsContainer?.classList.contains('visible') ?? false;
  }

  private handleQueryChange(query: string): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.mode === 'sentinel') {
      this.closeSuggestions();
      return;
    }

    const trimmed = query.trim();

    if (!trimmed) {
      // Empty input: display recent search history (max 4)
      const history = this.getSearchHistory().slice(0, 4);
      if (history.length > 0) {
        this.currentSuggestions = history.map((item) => ({
          type: 'history',
          text: item.text,
          subtext: item.subtext,
        }));
        this.selectedIndex = -1;
        this.renderSuggestions();
      } else {
        this.closeSuggestions();
      }
      return;
    }

    // If query is already cached, execute instantly; otherwise debounce network request
    const lowerTrimmed = trimmed.toLowerCase();
    const isCached = SearchController.suggestionCache.has(lowerTrimmed);
    const delay = isCached ? 0 : 75;

    this.debounceTimer = window.setTimeout(async () => {
      const history = this.getSearchHistory();
      const lowerQ = trimmed.toLowerCase();

      // Find matching history items
      const matchingHistory = history.filter((item) =>
        item.text.toLowerCase().includes(lowerQ)
      );

      // Fetch live predictions from Google
      const predictions = await this.fetchGoogleSuggestions(trimmed);

      // Build deduplicated suggestions list
      const combined: SuggestionItem[] = [];
      const seen = new Set<string>();

      // 1. Prioritize history items (with clock icon)
      matchingHistory.forEach((h) => {
        const key = h.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({
            type: 'history',
            text: h.text,
            subtext: h.subtext,
          });
        }
      });

      // 2. Add Google predictions (with magnifier icon)
      predictions.forEach((pred) => {
        const key = pred.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push({
            type: 'suggest',
            text: pred,
          });
        }
      });

      this.currentSuggestions = combined.slice(0, 4);
      this.selectedIndex = -1;
      this.renderSuggestions();
    }, delay);
  }

  private cacheSuggestions(q: string, results: string[]): void {
    SearchController.suggestionCache.set(q, results);
    if (SearchController.suggestionCache.size > 200) {
      const firstKey = SearchController.suggestionCache.keys().next().value;
      if (firstKey) SearchController.suggestionCache.delete(firstKey);
    }
  }

  private async fetchGoogleSuggestions(query: string): Promise<string[]> {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const cached = SearchController.suggestionCache.get(q);
    if (cached) {
      return cached;
    }

    // Tier 1: Same-origin /api/suggest proxy (Immune to ad-blockers & browser tracking shields on Vercel)
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        let results: string[] = [];
        if (Array.isArray(data)) {
          if (data.length > 1 && Array.isArray(data[1])) {
            results = data[1].map((item: any) => (typeof item === 'string' ? item : String(item)));
          } else {
            results = data.map((item: any) => (typeof item === 'string' ? item : String(item)));
          }
        }
        if (results.length > 0) {
          this.cacheSuggestions(q, results);
          return results;
        }
      }
    } catch {
      // Fallback to client-side strategies
    }

    // Tier 2: Direct Google Suggest JSONP (Works in unpacked Chrome Extension)
    try {
      const jsonpResults = await this.fetchJsonpSuggestions(q);
      if (jsonpResults.length > 0) {
        this.cacheSuggestions(q, jsonpResults);
        return jsonpResults;
      }
    } catch {
      // Fallback to Tier 3
    }

    // Tier 3: Open CORS Autocomplete (Guaranteed public web fallback for all browsers/ad-blockers)
    try {
      const ddgRes = await fetch(
        `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`
      );
      if (ddgRes.ok) {
        const ddgData = await ddgRes.json();
        if (Array.isArray(ddgData) && Array.isArray(ddgData[1])) {
          const results: string[] = ddgData[1].map((item: any) =>
            typeof item === 'string' ? item : String(item)
          );
          if (results.length > 0) {
            this.cacheSuggestions(q, results);
            return results;
          }
        }
      }
    } catch {
      // Ignore
    }

    return [];
  }

  private fetchJsonpSuggestions(q: string): Promise<string[]> {
    return new Promise((resolve) => {
      const callbackName = `googleSuggest_${Date.now()}_${++this.jsonpCounter}`;
      const script = document.createElement('script');

      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve([]);
      }, 1400);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        delete (window as any)[callbackName];
      };

      (window as any)[callbackName] = (data: any) => {
        cleanup();
        try {
          if (data && Array.isArray(data[1])) {
            const results: string[] = data[1].map((item: any) => {
              if (typeof item === 'string') return item;
              if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
              return String(item);
            });
            resolve(results);
          } else {
            resolve([]);
          }
        } catch {
          resolve([]);
        }
      };

      script.src = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(
        q
      )}&jsonp=${callbackName}`;
      script.onerror = () => {
        cleanup();
        resolve([]);
      };

      document.body.appendChild(script);
    });
  }

  private formatSuggestionHtml(text: string, query: string): string {
    const q = query.trim().toLowerCase();
    const t = text.toLowerCase();
    const escape = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (!q) {
      return escape(text);
    }

    if (t.startsWith(q)) {
      const matchPart = escape(text.substring(0, q.length));
      const restPart = escape(text.substring(q.length));
      return `<span class="suggest-match">${matchPart}</span><span class="suggest-rest">${restPart}</span>`;
    }

    const idx = t.indexOf(q);
    if (idx !== -1) {
      const before = escape(text.substring(0, idx));
      const match = escape(text.substring(idx, idx + q.length));
      const after = escape(text.substring(idx + q.length));
      return `<span class="suggest-rest">${before}</span><span class="suggest-match">${match}</span><span class="suggest-rest">${after}</span>`;
    }

    return escape(text);
  }

  private renderSuggestions(): void {
    if (!this.suggestionsList || !this.suggestionsContainer) return;

    if (this.currentSuggestions.length === 0 || this.mode === 'sentinel') {
      this.closeSuggestions();
      return;
    }

    this.suggestionsList.innerHTML = '';
    const currentQ = this.originalQuery || this.input.value;

    this.currentSuggestions.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-index', String(index));
      if (index === this.selectedIndex) {
        li.classList.add('active');
      }

      const mainDiv = document.createElement('div');
      mainDiv.className = 'suggestion-item-main';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'suggestion-icon';
      iconSpan.innerHTML = item.type === 'history' ? CLOCK_ICON_SVG : SEARCH_ICON_SVG;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'suggestion-content';

      const textSpan = document.createElement('span');
      textSpan.className = 'suggestion-text';
      textSpan.innerHTML = this.formatSuggestionHtml(item.text, currentQ);

      contentDiv.appendChild(textSpan);

      if (item.subtext) {
        const subSpan = document.createElement('span');
        subSpan.className = 'suggestion-subtext';
        subSpan.textContent = item.subtext;
        contentDiv.appendChild(subSpan);
      }

      mainDiv.appendChild(iconSpan);
      mainDiv.appendChild(contentDiv);
      li.appendChild(mainDiv);

      if (item.type === 'history') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'suggestion-delete-btn';
        delBtn.title = 'Remove from history';
        delBtn.innerHTML = DELETE_ICON_SVG;
        delBtn.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.removeSearchHistory(item.text);
          this.handleQueryChange(this.input.value);
        });
        li.appendChild(delBtn);
      }

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectAndSearch(item.text);
      });

      this.suggestionsList!.appendChild(li);
    });

    this.openSuggestions();
  }

  private openSuggestions(): void {
    if (!this.suggestionsContainer) return;
    this.suggestionsContainer.classList.add('visible');
    this.container.classList.add('suggestions-open');
  }

  public closeSuggestions(): void {
    if (!this.suggestionsContainer) return;
    this.suggestionsContainer.classList.remove('visible');
    this.container.classList.remove('suggestions-open');
    this.selectedIndex = -1;
  }

  private selectAndSearch(text: string): void {
    this.input.value = text;
    this.executeSearch(text);
  }

  private getSearchHistory(): Array<{ text: string; subtext?: string }> {
    try {
      const stored = localStorage.getItem(this.historyStorageKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const legacyQueries = new Set(['kolkata', 'kolkata station to howrah station', 'kolaghat']);
        return parsed
          .map((item) => (typeof item === 'string' ? { text: item } : item))
          .filter((item) => item && item.text && !legacyQueries.has(item.text.toLowerCase().trim()));
      }
    } catch {
      // ignore
    }
    return [];
  }

  private addToSearchHistory(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;

    try {
      const history = this.getSearchHistory().filter(
        (h) => h.text.toLowerCase() !== trimmed.toLowerCase()
      );
      history.unshift({ text: trimmed });
      const capped = history.slice(0, 25);
      localStorage.setItem(this.historyStorageKey, JSON.stringify(capped));
    } catch {
      // ignore
    }
  }

  private removeSearchHistory(text: string): void {
    try {
      const history = this.getSearchHistory().filter(
        (h) => h.text.toLowerCase() !== text.toLowerCase()
      );
      localStorage.setItem(this.historyStorageKey, JSON.stringify(history));
    } catch {
      // ignore
    }
  }

  public setMode(mode: 'search' | 'sentinel'): void {
    this.mode = mode;
    if (mode === 'sentinel') {
      this.input.placeholder = 'Ask Sentinel...';
      this.container.classList.add('sentinel-mode');
      this.closeSuggestions();
      if (this.aiModeBtn) {
        this.aiModeBtn.classList.add('active');
        this.aiModeBtn.title = 'Sentinel AI is active. Click to return to search (Ctrl+A)';
        const label = this.aiModeBtn.querySelector('.ai-label');
        if (label) label.textContent = 'Active';
      }
    } else {
      this.input.placeholder = 'Search the web or type a URL...';
      this.container.classList.remove('sentinel-mode');
      if (this.aiModeBtn) {
        this.aiModeBtn.classList.remove('active');
        this.aiModeBtn.title = 'Toggle Sentinel AI Mode (Ctrl+A)';
        const label = this.aiModeBtn.querySelector('.ai-label');
        if (label) label.textContent = 'AI';
      }
    }
  }

  public getMode(): 'search' | 'sentinel' {
    return this.mode;
  }

  public focus(): void {
    this.input.focus();
    this.input.select();
  }

  public blur(): void {
    this.input.blur();
    this.closeSuggestions();
  }

  public isFocused(): boolean {
    return document.activeElement === this.input;
  }

  public clear(): void {
    this.input.value = '';
    this.originalQuery = '';
    this.updateClearBtnVisibility();
  }

  public setValue(val: string): void {
    this.input.value = val;
    this.originalQuery = val;
    this.updateClearBtnVisibility();
  }

  private updateClearBtnVisibility(): void {
    if (this.input.value.trim().length > 0) {
      this.clearBtn.classList.add('visible');
    } else {
      this.clearBtn.classList.remove('visible');
    }
  }

  public handleFile(file: File): void {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      const sizeKB = Math.round(file.size / 1024);
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

      this.setAttachedImage({
        file,
        dataUrl,
        name: file.name || 'Pasted Image',
        sizeFormatted: sizeStr,
      });
    };
    reader.readAsDataURL(file);
  }

  public setAttachedImage(img: AttachedImage | null): void {
    this.currentAttachedImage = img;
    if (!this.imagePreviewContainer) return;

    if (img) {
      this.container.classList.add('has-image');
      this.imagePreviewContainer.style.display = 'flex';
      if (this.imageThumb) this.imageThumb.src = img.dataUrl;
      if (this.imageName) this.imageName.textContent = img.name;
      if (this.mode === 'sentinel') {
        this.input.placeholder = 'Ask Sentinel about this image...';
      } else {
        this.input.placeholder = 'Search with image or type query...';
      }
      this.focus();
    } else {
      this.container.classList.remove('has-image');
      this.imagePreviewContainer.style.display = 'none';
      if (this.imageThumb) this.imageThumb.src = '';
      if (this.imageName) this.imageName.textContent = '';
      if (this.mode === 'sentinel') {
        this.input.placeholder = 'Ask Sentinel...';
      } else {
        this.input.placeholder = 'Search the web or type a URL...';
      }
    }
  }

  public removeAttachedImage(): void {
    this.setAttachedImage(null);
  }

  public getAttachedImage(): AttachedImage | null {
    return this.currentAttachedImage;
  }

  public executeSearch(customQuery?: string): void {
    const query = (customQuery !== undefined ? customQuery : this.input.value).trim();
    const attachedImage = this.currentAttachedImage;

    // If neither query nor image is present, ignore
    if (!query && !attachedImage) return;

    this.closeSuggestions();

    if (this.mode === 'sentinel') {
      if (this.onSentinelSubmit) {
        this.onSentinelSubmit(query, attachedImage);
      }
      this.removeAttachedImage();
      return;
    }

    if (query) {
      this.addToSearchHistory(query);
    }

    if (attachedImage) {
      // Search by image via Google Lens or image search
      if (query) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.location.href = searchUrl;
      } else {
        window.location.href = 'https://lens.google.com/';
      }
      this.removeAttachedImage();
      return;
    }

    // Check if query is a URL or domain
    const isExplicitUrl = /^https?:\/\//i.test(query);
    const isDomainLike =
      /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(query) ||
      /^localhost(:[0-9]+)?(\/.*)?$/i.test(query);

    if (isExplicitUrl) {
      window.location.href = query;
    } else if (isDomainLike) {
      window.location.href = `https://${query}`;
    } else {
      // Perform Google Search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      window.location.href = searchUrl;
    }
  }
}
