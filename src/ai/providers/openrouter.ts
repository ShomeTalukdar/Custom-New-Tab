/**
 * OpenRouter Provider for Sentinel
 * Provides unified access to free AI models with automatic fallback
 * across active free endpoints (OpenRouter Free Router, Google Gemma 4 31B Free, etc.).
 */

import { AIProvider, TestConnectionResult } from '../provider';

export const OPENROUTER_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'liquid/lfm-2.5-2.6b:free',
];

export class OpenRouterProvider implements AIProvider {
  public readonly id = 'openrouter';
  public readonly name = 'OpenRouter (Free Models)';

  private defaultModel = 'openrouter/free';

  private sanitizeModel(model?: string): string {
    if (!model || model === 'auto') return this.defaultModel;
    // Migrate retired or paid free-tier slugs to dynamic free router
    if (
      model.includes('llama-3.3-70b-instruct') ||
      model.includes('deepseek-r1:free') ||
      model.includes('mistral-7b-instruct') ||
      model.includes('gemini-2.0-flash-exp:free')
    ) {
      return this.defaultModel;
    }
    return model;
  }

  public async testConnection(apiKey: string, model?: string): Promise<TestConnectionResult> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'No API key provided.' };
    }

    // Prefix validation to catch pasted keys from other vendors
    if (key.startsWith('AIza')) {
      return {
        success: false,
        message: 'Google Gemini key detected',
        details: 'This key begins with "AIzaSy...", which belongs to Google Gemini. OpenRouter keys begin with "sk-or-". You can generate a free OpenRouter key at openrouter.ai/keys, or switch AI Provider to "Google Gemini".',
      };
    }
    if (key.startsWith('gsk_')) {
      return {
        success: false,
        message: 'Groq key detected',
        details: 'This key begins with "gsk_...", which belongs to Groq. Switch AI Provider to "Groq" or get an OpenRouter key at openrouter.ai/keys.',
      };
    }
    if (key.startsWith('sk-ant-')) {
      return {
        success: false,
        message: 'Anthropic Claude key detected',
        details: 'This key begins with "sk-ant-...", which belongs to Anthropic Claude. Switch AI Provider to "Anthropic Claude".',
      };
    }

    const targetModel = this.sanitizeModel(model);

    try {
      // Authenticate via OpenRouter's official auth/key endpoint
      const authRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (authRes.ok) {
        const authData = await authRes.json().catch(() => ({}));
        const label = authData?.data?.label ? ` (${authData.data.label})` : '';
        const shortName = targetModel === 'openrouter/free'
          ? 'Auto Free Router'
          : (targetModel.split('/')[1] || targetModel);

        return {
          success: true,
          message: `Connected (${shortName})`,
          modelUsed: targetModel,
          details: `Authenticated with OpenRouter${label}. Model: ${targetModel} (Free Tier with auto-fallback enabled).`,
        };
      }

      if (authRes.status === 401) {
        return {
          success: false,
          message: 'Invalid OpenRouter API key',
          details: 'OpenRouter rejected this API key. Verify or create a free key at openrouter.ai/keys (should start with "sk-or-").',
        };
      }

      const data = await authRes.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${authRes.status}`;
      return { success: false, message: `OpenRouter error (${authRes.status})`, details: msg };
    } catch (err: unknown) {
      return {
        success: false,
        message: 'Network error reaching OpenRouter.',
        details: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async generateResponse(
    prompt: string,
    apiKey: string,
    systemPrompt?: string,
    model?: string
  ): Promise<string> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error('Configure an AI provider to continue.');
    }

    if (key.startsWith('AIza')) {
      throw new Error('The configured API key is a Google Gemini key, but the provider is set to OpenRouter. Please switch AI Provider to Google Gemini or paste an OpenRouter key from openrouter.ai/keys.');
    }
    if (key.startsWith('gsk_')) {
      throw new Error('The configured API key is a Groq key, but the provider is set to OpenRouter. Please switch AI Provider to Groq or paste an OpenRouter key from openrouter.ai/keys.');
    }

    const preferredModel = this.sanitizeModel(model);

    // Build ordered list of candidate free models to try in case one is decommissioned or busy
    const candidates = Array.from(new Set([
      preferredModel,
      'openrouter/free',
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3.5-lightning:free',
      'liquid/lfm-2.5-2.6b:free',
    ]));

    let lastErrorMsg = '';

    for (const candidateModel of candidates) {
      try {
        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': window.location.origin || 'http://localhost:5173',
            'X-Title': 'Sentinel Custom New Tab',
          },
          body: JSON.stringify({
            model: candidateModel,
            messages,
            max_tokens: 800,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content && content.trim().length > 0) {
            return content.trim();
          }
        }

        if (response.status === 401) {
          throw new Error('The OpenRouter API key was rejected (HTTP 401). Verify your key at openrouter.ai/keys (starts with "sk-or-").');
        }

        const data = await response.json().catch(() => ({}));
        const msg = data?.error?.message || `HTTP ${response.status}`;
        lastErrorMsg = msg;

        console.warn(`OpenRouter model "${candidateModel}" failed: ${msg}. Attempting fallback to next free model...`);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('401')) {
          throw err;
        }
        lastErrorMsg = err instanceof Error ? err.message : String(err);
      }
    }

    throw new Error(`OpenRouter free models unavailable (${lastErrorMsg}). You can also switch AI Provider to Groq (100% Free) or Google Gemini.`);
  }
}
