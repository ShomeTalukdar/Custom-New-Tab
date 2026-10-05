/**
 * Groq Provider for Sentinel
 * Ultra-fast inference provider offering generous 100% free tier access
 * to Llama 3.3 70B, Llama 3.1 8B, and Mixtral.
 */

import { AIProvider, TestConnectionResult } from '../provider';

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
];

export class GroqProvider implements AIProvider {
  public readonly id = 'groq';
  public readonly name = 'Groq (Free & Ultra Fast)';

  private defaultModel = 'llama-3.3-70b-versatile';

  public async testConnection(apiKey: string, model?: string): Promise<TestConnectionResult> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'No API key provided.' };
    }

    if (key.startsWith('AIza')) {
      return {
        success: false,
        message: 'Google Gemini key detected',
        details: 'This key begins with "AIzaSy...", which belongs to Google Gemini. Groq keys begin with "gsk_". You can generate a free Groq key at console.groq.com/keys, or switch AI Provider to "Google Gemini".',
      };
    }
    if (key.startsWith('sk-or-')) {
      return {
        success: false,
        message: 'OpenRouter key detected',
        details: 'This key begins with "sk-or-", which belongs to OpenRouter. Switch AI Provider to "OpenRouter" or get a free Groq key at console.groq.com/keys.',
      };
    }

    const targetModel = model && model !== 'auto' ? model : this.defaultModel;

    try {
      // Validate key via models list (consumes 0 tokens)
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (res.ok) {
        return {
          success: true,
          message: `Connected (${targetModel})`,
          modelUsed: targetModel,
          details: `Connected to Groq Cloud. Using ${targetModel} at ultra-high speed (Free Tier with auto-fallback).`,
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          message: 'Invalid API key.',
          details: 'Groq rejected this API key. Verify or generate a free key at console.groq.com/keys',
        };
      }

      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { success: false, message: `Groq error (${res.status})`, details: msg };
    } catch (err: unknown) {
      return {
        success: false,
        message: 'Network error reaching Groq.',
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

    const preferredModel = model && model !== 'auto' ? model : this.defaultModel;

    // Candidate fallback list for Groq
    const candidates = Array.from(new Set([
      preferredModel,
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ]));

    let lastErrorMsg = '';

    for (const candidateModel of candidates) {
      try {
        const messages = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
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
          throw new Error('The configured Groq API key was rejected (HTTP 401). Verify your key at console.groq.com/keys (starts with "gsk_").');
        }

        const data = await response.json().catch(() => ({}));
        const msg = data?.error?.message || `HTTP ${response.status}`;
        lastErrorMsg = msg;
        console.warn(`Groq model "${candidateModel}" failed: ${msg}. Attempting fallback...`);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('401')) {
          throw err;
        }
        lastErrorMsg = err instanceof Error ? err.message : String(err);
      }
    }

    throw new Error(`Groq error: ${lastErrorMsg}`);
  }
}
