/**
 * Sentinel Local Intent Detection Engine
 * Evaluates queries before hitting the AI model to:
 * 1. Perform instant local arithmetic calculations
 * 2. Directly open explicit or known URLs
 * 3. Route explicit search intents
 * 4. Manage browser favorites seamlessly
 * 5. Delegate complex queries, explanations, and advice to AI
 */

import { FavoritesManager } from '../favorites';

export type IntentType =
  | 'calculation'
  | 'direct_url'
  | 'navigation'
  | 'web_search'
  | 'favorites_add'
  | 'favorites_remove'
  | 'ai_query';

export interface IntentResult {
  type: IntentType;
  handledLocally: boolean;
  message?: string;
  action?: () => void;
  originalQuery: string;
}

export class IntentDetector {
  private favoritesManager?: FavoritesManager;

  constructor(favoritesManager?: FavoritesManager) {
    this.favoritesManager = favoritesManager;
  }

  public detect(input: string): IntentResult {
    const raw = input.trim();
    if (!raw) {
      return { type: 'ai_query', handledLocally: false, originalQuery: raw };
    }

    // 1. Math calculation detection (e.g. "284 * 17", "25 + 18", "1024 / 8", "15% of 240")
    const calcResult = this.tryCalculate(raw);
    if (calcResult !== null) {
      return {
        type: 'calculation',
        handledLocally: true,
        message: calcResult,
        originalQuery: raw,
      };
    }

    // 2. Explicit or domain URL detection (e.g. "https://github.com", "youtube.com")
    const urlResult = this.tryUrl(raw);
    if (urlResult !== null) {
      return {
        type: 'direct_url',
        handledLocally: true,
        message: `Navigating to ${urlResult}...`,
        action: () => {
          window.location.href = urlResult;
        },
        originalQuery: raw,
      };
    }

    // 3. Navigation command (e.g. "open youtube", "go to github", "launch figma")
    const navResult = this.tryNavigation(raw);
    if (navResult !== null) {
      return {
        type: 'navigation',
        handledLocally: true,
        message: `Opening ${navResult.title}...`,
        action: () => {
          window.location.href = navResult.url;
        },
        originalQuery: raw,
      };
    }

    // 4. Favorites manipulation (e.g. "add github to favorites", "remove discord from favorites")
    const favResult = this.tryFavorites(raw);
    if (favResult !== null) {
      return favResult;
    }

    // 5. Explicit Web Search (e.g. "search for Blender tutorials", "google quantum computing")
    const searchResult = this.trySearch(raw);
    if (searchResult !== null) {
      return {
        type: 'web_search',
        handledLocally: true,
        message: `Searching Google for "${searchResult}"...`,
        action: () => {
          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(searchResult)}`;
        },
        originalQuery: raw,
      };
    }

    // 6. Natural AI query
    return {
      type: 'ai_query',
      handledLocally: false,
      originalQuery: raw,
    };
  }

  /**
   * Evaluates mathematical expressions securely without eval()
   */
  private tryCalculate(query: string): string | null {
    const trimmed = query.replace(/[?=\s]+$/, '').trim();

    // Percentage pattern: "15% of 240"
    const percentMatch = trimmed.match(/^([0-9.]+)\s*%\s*(?:of)\s*([0-9.]+)$/i);
    if (percentMatch) {
      const p = parseFloat(percentMatch[1]);
      const n = parseFloat(percentMatch[2]);
      if (!isNaN(p) && !isNaN(n)) {
        const res = (p / 100) * n;
        return `${p}% of ${n} = ${Number(res.toFixed(6))}`;
      }
    }

    // Strict math pattern: numbers and +, -, *, /, ^, %, (, )
    // Must contain at least one operator to not trigger on plain numbers
    const isMathPattern = /^[-+*/^%0-9().\s]+$/.test(trimmed);
    const hasOperator = /[+\-*/^%]/.test(trimmed);
    const hasDigits = /[0-9]/.test(trimmed);

    if (isMathPattern && hasOperator && hasDigits) {
      try {
        const sanitized = trimmed.replace(/\^/g, '**');
        // Safe evaluation through Function with null context and strictly validated characters
        // Validated by regex: only numbers, whitespace, and basic math operators
        const fn = new Function(`"use strict"; return (${sanitized});`);
        const value = fn();
        if (typeof value === 'number' && isFinite(value)) {
          return `${trimmed} = ${Number(value.toFixed(6))}`;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Checks for direct URL structure
   */
  private tryUrl(query: string): string | null {
    if (/^https?:\/\//i.test(query)) {
      return query;
    }

    // Standard domains: e.g. "youtube.com", "news.ycombinator.com/item"
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(query)) {
      return `https://${query}`;
    }

    if (/^localhost(:[0-9]+)?(\/.*)?$/i.test(query)) {
      return `http://${query}`;
    }

    return null;
  }

  /**
   * Checks for "open <service>" or "go to <service>"
   */
  private tryNavigation(query: string): { title: string; url: string } | null {
    const match = query.match(/^(?:open|go\s+to|launch)\s+([a-zA-Z0-9._ -]+)$/i);
    if (!match) return null;

    const target = match[1].trim().toLowerCase();

    // Check against favorites if manager available
    if (this.favoritesManager) {
      const items = this.favoritesManager.getItems();
      const favMatch = items.find(
        (f) => f.title.toLowerCase() === target || f.url.toLowerCase().includes(target)
      );
      if (favMatch) {
        return { title: favMatch.title, url: favMatch.url };
      }
    }

    // Known common developer & web platforms
    const COMMON_SERVICES: Record<string, string> = {
      youtube: 'https://youtube.com',
      github: 'https://github.com',
      twitter: 'https://x.com',
      x: 'https://x.com',
      figma: 'https://figma.com',
      linear: 'https://linear.app',
      gmail: 'https://mail.google.com',
      chatgpt: 'https://chatgpt.com',
      reddit: 'https://reddit.com',
      discord: 'https://discord.com',
      vercel: 'https://vercel.com',
      notion: 'https://notion.so',
      spotify: 'https://open.spotify.com',
      netflix: 'https://netflix.com',
      amazon: 'https://amazon.com',
      stackoverflow: 'https://stackoverflow.com',
    };

    if (COMMON_SERVICES[target]) {
      return { title: target.toUpperCase(), url: COMMON_SERVICES[target] };
    }

    // If it looks like a single domain name, try https://target.com
    if (/^[a-zA-Z0-9-]+$/.test(target)) {
      return { title: target, url: `https://${target}.com` };
    }

    return null;
  }

  /**
   * Handles "add <title> to favorites" or "remove <title> from favorites"
   */
  private tryFavorites(query: string): IntentResult | null {
    if (!this.favoritesManager) return null;

    // Pattern: "add <name> to favorites" or "add <name> <url> to favorites"
    const addMatch = query.match(/^add\s+(.+?)(?:\s+(https?:\/\/[^\s]+))?\s+(?:to\s+(?:my\s+)?favorites)$/i);
    if (addMatch) {
      const rawTitle = addMatch[1].trim();
      const rawUrl = addMatch[2]?.trim() || `https://${rawTitle.toLowerCase().replace(/\s+/g, '')}.com`;

      return {
        type: 'favorites_add',
        handledLocally: true,
        message: `Added "${rawTitle}" to favorites.`,
        action: () => {
          this.favoritesManager?.addFavorite(rawTitle, rawUrl);
        },
        originalQuery: query,
      };
    }

    // Pattern: "remove <name> from favorites" or "delete <name> from favorites"
    const removeMatch = query.match(/^(?:remove|delete)\s+(.+?)(?:\s+from\s+(?:my\s+)?favorites)?$/i);
    if (removeMatch) {
      const name = removeMatch[1].trim().toLowerCase();
      const items = this.favoritesManager.getItems();
      const target = items.find(
        (f) => f.title.toLowerCase() === name || f.url.toLowerCase().includes(name)
      );

      if (target) {
        return {
          type: 'favorites_remove',
          handledLocally: true,
          message: `Removed "${target.title}" from favorites.`,
          action: () => {
            this.favoritesManager?.removeFavorite(target.id);
          },
          originalQuery: query,
        };
      }
    }

    // Pattern: "clear favorites" or "remove all favorites" or "delete all favorites"
    if (/^(?:clear|remove\s+all|delete\s+all)\s+(?:favorites|my\s+favorites)$/i.test(query)) {
      return {
        type: 'favorites_remove',
        handledLocally: true,
        message: 'Cleared all favorites.',
        action: () => {
          this.favoritesManager?.clearAll();
        },
        originalQuery: query,
      };
    }

    return null;
  }

  /**
   * Checks for explicit search commands (e.g. "search for X", "google X")
   */
  private trySearch(query: string): string | null {
    const match = query.match(/^(?:search\s+for|search\s+google\s+for|google|search)\s+(.+)$/i);
    if (match) {
      return match[1].trim();
    }
    return null;
  }
}
