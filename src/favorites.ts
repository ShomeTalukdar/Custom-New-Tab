/**
 * Favorites Manager
 * Handles local storage persistence, DOM rendering, keyboard selection,
 * and high-resolution favicon resolution.
 */

export interface FavoriteItem {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  createdAt: number;
}

const STORAGE_KEY = 'monochrome_favorites_v1';

export const DEFAULT_FAVORITES: Omit<FavoriteItem, 'id' | 'createdAt'>[] = [
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'YouTube', url: 'https://youtube.com' },
  { title: 'ChatGPT', url: 'https://chatgpt.com' },
  { title: 'Figma', url: 'https://figma.com' },
  { title: 'Linear', url: 'https://linear.app' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Vercel', url: 'https://vercel.com' },
  { title: 'Discord', url: 'https://discord.com' },
  { title: 'X', url: 'https://x.com' },
];

export class FavoritesManager {
  private favorites: FavoriteItem[] = [];
  private listElement: HTMLUListElement;
  private countElement: HTMLElement | null;
  private selectedIndex = -1;

  public onEditRequest?: (fav: FavoriteItem) => void;

  constructor(listElement: HTMLUListElement, countElement: HTMLElement | null = null) {
    this.listElement = listElement;
    this.countElement = countElement;
    this.load();
    this.render();
  }

  public getItems(): FavoriteItem[] {
    return [...this.favorites];
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.favorites = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load favorites from localStorage', err);
    }

    // Initialize with defaults if empty
    this.favorites = DEFAULT_FAVORITES.map((item, index) => ({
      ...item,
      id: `fav_${Date.now()}_${index}`,
      createdAt: Date.now() + index,
    }));
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites));
    } catch (err) {
      console.warn('Failed to save favorites to localStorage', err);
    }
  }

  public addFavorite(title: string, rawUrl: string): FavoriteItem {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const newItem: FavoriteItem = {
      id: `fav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim() || this.extractDomain(url),
      url,
      createdAt: Date.now(),
    };

    this.favorites.push(newItem);
    this.save();
    this.render();
    return newItem;
  }

  public updateFavorite(id: string, title: string, rawUrl: string): boolean {
    const index = this.favorites.findIndex((f) => f.id === id);
    if (index === -1) return false;

    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    this.favorites[index].title = title.trim() || this.extractDomain(url);
    this.favorites[index].url = url;
    this.save();
    this.render();
    return true;
  }

  public removeFavorite(id: string): void {
    this.favorites = this.favorites.filter((f) => f.id !== id);
    if (this.selectedIndex >= this.favorites.length) {
      this.selectedIndex = this.favorites.length - 1;
    }
    this.save();
    this.render();
  }

  public getFaviconUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
    } catch {
      return '';
    }
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  public selectNext(): void {
    if (this.favorites.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.favorites.length;
    this.updateSelectionClasses();
  }

  public selectPrev(): void {
    if (this.favorites.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.favorites.length) % this.favorites.length;
    this.updateSelectionClasses();
  }

  public clearSelection(): void {
    this.selectedIndex = -1;
    this.updateSelectionClasses();
  }

  public openSelected(inNewTab = false): boolean {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.favorites.length) {
      const fav = this.favorites[this.selectedIndex];
      if (inNewTab) {
        window.open(fav.url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = fav.url;
      }
      return true;
    }
    return false;
  }

  private updateSelectionClasses(): void {
    const items = this.listElement.querySelectorAll<HTMLElement>('.fav-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('keyboard-selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('keyboard-selected');
      }
    });
  }

  public render(): void {
    this.listElement.innerHTML = '';

    if (this.countElement) {
      this.countElement.textContent = String(this.favorites.length);
    }

    this.favorites.forEach((fav, index) => {
      const li = document.createElement('li');
      li.className = 'fav-item-container';

      const a = document.createElement('a');
      a.className = 'fav-item';
      a.href = fav.url;
      a.dataset.id = fav.id;
      a.dataset.index = String(index);

      if (index === this.selectedIndex) {
        a.classList.add('keyboard-selected');
      }

      // Favicon wrapper
      const iconWrap = document.createElement('span');
      iconWrap.className = 'fav-icon-wrapper';

      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = this.getFaviconUrl(fav.url);

      // Graceful fallback for broken favicons
      img.onerror = () => {
        img.style.display = 'none';
        const fallbackText = document.createElement('span');
        fallbackText.style.fontSize = '9px';
        fallbackText.style.fontFamily = 'var(--font-mono)';
        fallbackText.style.color = 'var(--text-muted)';
        fallbackText.textContent = fav.title.slice(0, 1).toUpperCase();
        iconWrap.appendChild(fallbackText);
      };

      iconWrap.appendChild(img);

      // Title
      const titleSpan = document.createElement('span');
      titleSpan.className = 'fav-title';
      titleSpan.textContent = fav.title;

      // Quick action buttons (Edit, Delete)
      const actionsSpan = document.createElement('span');
      actionsSpan.className = 'fav-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'fav-action-btn';
      editBtn.title = 'Edit';
      editBtn.setAttribute('aria-label', `Edit ${fav.title}`);
      editBtn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;

      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onEditRequest) {
          this.onEditRequest(fav);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'fav-action-btn';
      delBtn.title = 'Remove';
      delBtn.setAttribute('aria-label', `Remove ${fav.title}`);
      delBtn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;

      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeFavorite(fav.id);
      });

      actionsSpan.appendChild(editBtn);
      actionsSpan.appendChild(delBtn);

      a.appendChild(iconWrap);
      a.appendChild(titleSpan);
      a.appendChild(actionsSpan);

      // On hover, reset keyboard selected index
      a.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelectionClasses();
      });

      li.appendChild(a);
      this.listElement.appendChild(li);
    });
  }
}
