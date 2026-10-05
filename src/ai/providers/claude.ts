/**
 * Anthropic Claude Provider for Sentinel
 * Directly calls Anthropic's Messages REST API.
 */

import { AIProvider, TestConnectionResult } from '../provider';

export class ClaudeProvider implements AIProvider {
  public readonly id = 'claude';
  public readonly name = 'Anthropic Claude';
  private model = 'claude-3-5-haiku-20241022';

  public async testConnection(apiKey: string): Promise<TestConnectionResult> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'No API key provided.' };
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'dangerously-allow-browser': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
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
        message: err instanceof Error ? err.message : 'Network error reaching Claude.',
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

    const payload: Record<string, unknown> = {
      model: this.model,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('The configured API key was rejected.');
      }
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Unable to reach Claude: ${msg}`);
    }

    const data = await res.json();
    const content = data?.content?.[0]?.text;
    if (!content) {
      throw new Error('No content returned from Claude.');
    }

    return content.trim();
  }
}
