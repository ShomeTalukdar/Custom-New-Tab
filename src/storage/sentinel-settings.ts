/**
 * Sentinel Storage Manager
 * BYOK (Bring Your Own Key) privacy-first local storage.
 * Stores credentials per provider to prevent cross-provider key collisions.
 */

export interface SentinelSettings {
  provider: 'gemini' | 'openai' | 'claude' | 'groq' | 'openrouter';
  apiKey: string;
  model?: string;
}

declare const chrome: any;

const STORAGE_KEY_PROVIDER = 'sentinel_pref_provider';
const STORAGE_KEY_API_KEY = 'sentinel_user_api_key'; // Legacy fallback
const STORAGE_KEY_MODEL = 'sentinel_pref_model';

export class SentinelSettingsManager {
  private hasChromeStorage(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      Boolean(chrome.storage) &&
      Boolean(chrome.storage.local)
    );
  }

  public async getKeyForProvider(provider: string): Promise<string> {
    const keyName = `sentinel_key_${provider}`;
    if (this.hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([keyName, STORAGE_KEY_API_KEY], (result: any) => {
          resolve(result[keyName] || (provider === 'gemini' ? result[STORAGE_KEY_API_KEY] : '') || '');
        });
      });
    }

    try {
      const stored = localStorage.getItem(keyName);
      if (stored) return stored;
      if (provider === 'gemini') {
        return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
      }
      return '';
    } catch {
      return '';
    }
  }

  public async getSettings(overrideProvider?: string): Promise<SentinelSettings> {
    if (this.hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY_PROVIDER, STORAGE_KEY_API_KEY, STORAGE_KEY_MODEL], async (result: any) => {
          const provider = (overrideProvider || result[STORAGE_KEY_PROVIDER] || 'gemini') as SentinelSettings['provider'];
          const apiKey = await this.getKeyForProvider(provider);
          let model = (result[STORAGE_KEY_MODEL] as string) || 'auto';
          if (provider === 'openrouter' && (model.includes('llama-3.3-70b-instruct') || model.includes('deepseek-r1:free') || model.includes('mistral-7b-instruct'))) {
            model = 'openrouter/free';
          }
          resolve({ provider, apiKey, model });
        });
      });
    }

    try {
      const provider = (overrideProvider || localStorage.getItem(STORAGE_KEY_PROVIDER) || 'gemini') as SentinelSettings['provider'];
      const apiKey = await this.getKeyForProvider(provider);
      let model = localStorage.getItem(STORAGE_KEY_MODEL) || 'auto';
      if (provider === 'openrouter' && (model.includes('llama-3.3-70b-instruct') || model.includes('deepseek-r1:free') || model.includes('mistral-7b-instruct'))) {
        model = 'openrouter/free';
      }
      return { provider, apiKey, model };
    } catch {
      return { provider: 'gemini', apiKey: '', model: 'auto' };
    }
  }

  public async saveSettings(settings: SentinelSettings): Promise<void> {
    const model = settings.model || 'auto';
    const keyName = `sentinel_key_${settings.provider}`;
    const cleanKey = settings.apiKey.trim();

    if (this.hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.set(
          {
            [STORAGE_KEY_PROVIDER]: settings.provider,
            [keyName]: cleanKey,
            [STORAGE_KEY_API_KEY]: cleanKey,
            [STORAGE_KEY_MODEL]: model,
          },
          () => resolve()
        );
      });
    }

    try {
      localStorage.setItem(STORAGE_KEY_PROVIDER, settings.provider);
      localStorage.setItem(keyName, cleanKey);
      localStorage.setItem(STORAGE_KEY_API_KEY, cleanKey);
      localStorage.setItem(STORAGE_KEY_MODEL, model);
    } catch (err) {
      console.warn('Failed to save Sentinel credentials to localStorage', err);
    }
  }

  public async clearKey(provider?: string): Promise<void> {
    const settings = await this.getSettings();
    const targetProvider = provider || settings.provider;
    const keyName = `sentinel_key_${targetProvider}`;

    if (this.hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([keyName, STORAGE_KEY_API_KEY], () => resolve());
      });
    }

    try {
      localStorage.removeItem(keyName);
      if (targetProvider === 'gemini') {
        localStorage.removeItem(STORAGE_KEY_API_KEY);
      }
    } catch (err) {
      console.warn('Failed to clear Sentinel key from localStorage', err);
    }
  }

  public async hasKey(): Promise<boolean> {
    const settings = await this.getSettings();
    return Boolean(settings.apiKey && settings.apiKey.trim().length > 0);
  }
}
