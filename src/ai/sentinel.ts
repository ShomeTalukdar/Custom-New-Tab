/**
 * Sentinel Core Intelligence Coordinator
 * Coordinates providers, local intent detection, privacy-first BYOK settings,
 * and error formatting.
 */

import { AIProvider, TestConnectionResult } from './provider';
import { GeminiProvider } from './providers/gemini';
import { OpenAIProvider } from './providers/openai';
import { ClaudeProvider } from './providers/claude';
import { GroqProvider } from './providers/groq';
import { OpenRouterProvider } from './providers/openrouter';
import { SENTINEL_SYSTEM_PROMPT } from './prompt';
import { IntentDetector, IntentResult } from './intent';
import { SentinelSettingsManager } from '../storage/sentinel-settings';
import { FavoritesManager } from '../favorites';

export interface SentinelProcessResult {
  handledLocally: boolean;
  text: string;
  error?: boolean;
}

export class SentinelService {
  private providers: Map<string, AIProvider> = new Map();
  private settingsManager: SentinelSettingsManager;
  private intentDetector: IntentDetector;

  constructor(favoritesManager?: FavoritesManager) {
    this.settingsManager = new SentinelSettingsManager();
    this.intentDetector = new IntentDetector(favoritesManager);

    // Register supported providers
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new GroqProvider());
    this.registerProvider(new OpenRouterProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new ClaudeProvider());
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getSettingsManager(): SentinelSettingsManager {
    return this.settingsManager;
  }

  public async getActiveProvider(): Promise<AIProvider> {
    const settings = await this.settingsManager.getSettings();
    const provider = this.providers.get(settings.provider);
    return provider || this.providers.get('gemini')!;
  }

  public async testConnection(providerId: string, apiKey: string, model?: string): Promise<TestConnectionResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return { success: false, message: `Unknown provider "${providerId}".` };
    }
    return provider.testConnection(apiKey, model);
  }

  public async isConfigured(): Promise<boolean> {
    return this.settingsManager.hasKey();
  }

  /**
   * Process a prompt: first evaluates local intent, then invokes configured AI provider.
   */
  public async query(prompt: string): Promise<SentinelProcessResult> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return { handledLocally: true, text: 'No input provided.' };
    }

    // Phase 7: Local Intent Detection
    const intent: IntentResult = this.intentDetector.detect(trimmed);

    if (intent.handledLocally) {
      if (intent.action) {
        // Execute action (e.g. navigation or favorite update)
        setTimeout(() => {
          intent.action?.();
        }, 400);
      }
      return {
        handledLocally: true,
        text: intent.message || '',
      };
    }

    // Check BYOK configuration
    const settings = await this.settingsManager.getSettings();
    if (!settings.apiKey || settings.apiKey.trim().length === 0) {
      return {
        handledLocally: false,
        error: true,
        text: 'Sentinel is offline.\n\nConfigure an AI provider to continue.',
      };
    }

    const provider = this.providers.get(settings.provider);
    if (!provider) {
      return {
        handledLocally: false,
        error: true,
        text: `Sentinel is offline.\n\nProvider "${settings.provider}" is unavailable.`,
      };
    }

    try {
      const response = await provider.generateResponse(
        trimmed,
        settings.apiKey,
        SENTINEL_SYSTEM_PROMPT,
        settings.model
      );

      return {
        handledLocally: false,
        text: response,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('invalid api key')) {
        return {
          handledLocally: false,
          error: true,
          text: `Sentinel is offline.\n\n${msg}`,
        };
      }

      if (msg.toLowerCase().includes('configure an ai provider')) {
        return {
          handledLocally: false,
          error: true,
          text: 'Sentinel is offline.\n\nConfigure an AI provider to continue.',
        };
      }

      return {
        handledLocally: false,
        error: true,
        text: `Unable to complete request.\n\n${msg}`,
      };
    }
  }
}
