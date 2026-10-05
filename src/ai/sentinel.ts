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
      let response = await provider.generateResponse(
        trimmed,
        settings.apiKey,
        SENTINEL_SYSTEM_PROMPT,
        settings.model
      );

      // Check if the response contains raw tool call tokens (<|tool_call_start|>, [google(...)], etc.)
      if (this.containsToolCallLeakage(response)) {
        const cleaned = this.cleanToolCalls(response);
        // If the model gave a substantial answer along with the tool call, use the cleaned text
        if (cleaned.length > 25) {
          return {
            handledLocally: false,
            text: cleaned,
          };
        }

        // If the response was purely a tool call, retry once with an explicit plain-text directive
        try {
          const directPrompt = `${trimmed}\n\n[Instruction: Answer the above question directly from your knowledge in plain text. Do not emit any tool calls or function tokens.]`;
          const retried = await provider.generateResponse(
            directPrompt,
            settings.apiKey,
            SENTINEL_SYSTEM_PROMPT,
            settings.model
          );
          const retriedCleaned = this.cleanToolCalls(retried);
          if (retriedCleaned.length > 15) {
            return {
              handledLocally: false,
              text: retriedCleaned,
            };
          }
        } catch {
          // If retry fails, fall back to synthesized response
        }

        return {
          handledLocally: false,
          text: this.synthesizeToolCallFallback(response, trimmed),
        };
      }

      return {
        handledLocally: false,
        text: this.cleanToolCalls(response),
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

  private containsToolCallLeakage(text: string): boolean {
    if (!text) return false;
    return (
      text.includes('<|tool_call_start|>') ||
      text.includes('<|tool_call_end|>') ||
      text.includes('<tool_call>') ||
      text.includes('google(query=') ||
      text.includes('search(query=') ||
      text.includes('<|action_start|>') ||
      text.includes('<|thought|>')
    );
  }

  private cleanToolCalls(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
      .replace(/<\|tool_call_start\|>[\s\S]*$/gi, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<\|action_start\|>[\s\S]*?<\|action_end\|>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\|thought\|>[\s\S]*?<\|end_thought\|>/gi, '')
      .replace(/\[(?:google|search|web_search)\(query=[^\]]+\)\]/gi, '')
      .replace(/<\|[a-z0-9_]+\|>/gi, '')
      .trim();
  }

  private synthesizeToolCallFallback(rawText: string, originalQuery: string): string {
    const match = rawText.match(/query=['"]([^'"]+)['"]/i);
    const topic = match ? match[1] : originalQuery;
    const cleanTopic = topic.replace(/['"+]/g, ' ').trim();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanTopic)}`;

    return `The model attempted to trigger an internal search query for **${cleanTopic}**.\n\nYou can access web results and official details here:\n- [Search "${cleanTopic}" on Google](${searchUrl})\n\n*(Tip: Switch your model to **Auto Free Router** or **Groq Llama 3.3 70B** in Sentinel Settings for direct conversational answers.)*`;
  }
}
