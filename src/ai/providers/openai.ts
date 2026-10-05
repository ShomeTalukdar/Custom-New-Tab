/**
 * OpenAI Provider for Sentinel
 * Directly calls OpenAI's Chat Completions endpoint.
 */

import { AIProvider, TestConnectionResult } from '../provider';

export class OpenAIProvider implements AIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
  private model = 'gpt-4o-mini';

  public async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'No API key provided.' };
    }

    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (res.ok) {
        return { success: true, message: 'Connected' };
      }

      if (res.status === 401) {
        return { success: false, message: 'Invalid API key.' };
      }

      return { success: false, message: `Rejected: HTTP ${res.status}` };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Network error reaching OpenAI.',
      };
    }
  }

  public async generateResponse(
    prompt: string,
    apiKey: string,
    systemPrompt?: string
  ): Promise<string> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error('Configure an AI provider to continue.');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('The configured API key was rejected.');
      }
      const data = await response.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Unable to reach OpenAI: ${msg}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from OpenAI.');
    }

    return content.trim();
  }
}
