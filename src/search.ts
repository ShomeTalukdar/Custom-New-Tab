/**
 * Search Controller
 * Handles query submission (direct URL or Google Search), keyboard shortcuts,
 * visual state management, and clear button behavior.
 */

export class SearchController {
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private container: HTMLElement;
  private clearBtn: HTMLButtonElement;
  private kbdHint: HTMLElement;

  constructor(
    form: HTMLFormElement,
    input: HTMLInputElement,
    container: HTMLElement,
    clearBtn: HTMLButtonElement,
    kbdHint: HTMLElement
  ) {
    this.form = form;
    this.input = input;
    this.container = container;
    this.clearBtn = clearBtn;
    this.kbdHint = kbdHint;

    this.init();
  }

  private init(): void {
    // Detect OS for keyboard hint (⌘K vs Ctrl K)
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const metaKbd = this.kbdHint.querySelector('#kbd-meta');
    if (metaKbd) {
      metaKbd.textContent = isMac ? '⌘' : 'Ctrl';
    }

    // Input focus & blur styling with immersive peripheral dimming
    const appEl = document.getElementById('app');
    this.input.addEventListener('focus', () => {
      this.container.classList.add('focused');
      if (appEl) appEl.classList.add('search-active');
    });

    this.input.addEventListener('blur', () => {
      this.container.classList.remove('focused');
      if (appEl) appEl.classList.remove('search-active');
    });

    // Input changes (show/hide clear button)
    this.input.addEventListener('input', () => {
      this.updateClearBtnVisibility();
    });

    // Clear button action
    this.clearBtn.addEventListener('click', () => {
      this.clear();
      this.input.focus();
    });

    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.executeSearch();
    });
  }

  public focus(): void {
    this.input.focus();
    this.input.select();
  }

  public blur(): void {
    this.input.blur();
  }

  public isFocused(): boolean {
    return document.activeElement === this.input;
  }

  public clear(): void {
    this.input.value = '';
    this.updateClearBtnVisibility();
  }

  private updateClearBtnVisibility(): void {
    if (this.input.value.trim().length > 0) {
      this.clearBtn.classList.add('visible');
    } else {
      this.clearBtn.classList.remove('visible');
    }
  }

  private executeSearch(): void {
    const query = this.input.value.trim();
    if (!query) return;

    // Check if query is a URL or domain
    const isExplicitUrl = /^https?:\/\//i.test(query);
    const isDomainLike = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(query) || /^localhost(:[0-9]+)?(\/.*)?$/i.test(query);

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
