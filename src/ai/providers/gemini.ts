/**
 * Google Gemini Provider for Sentinel
 * Directly calls Google's Generative Language REST API with dynamic model discovery,
 * Ultra / Pro model support, zero-quota key validation, and automatic quota recovery.
 */

import { AIProvider, TestConnectionResult } from '../provider';

export const GEMINI_CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro',
  'gemini-3.5-flash',
  'gemini-3.5-pro',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';

  // Default to Gemini 3.8 Flash
  private cachedModel: string | null = 'gemini-3.8-flash';

  private isQuotaOrRateLimitError(errMsg: string, status?: number): boolean {
    if (status === 429) return true;
    const lower = errMsg.toLowerCase();
    return (
      lower.includes('quota') ||
      lower.includes('rate') ||
      lower.includes('resource_exhausted') ||
      lower.includes('free_tier_requests') ||
      lower.includes('limit: 20') ||
      lower.includes('exceeded your current quota')
    );
  }

  /**
   * Fetches available models for this API key via ModelService.ListModels.
   * This is a metadata query and consumes 0 generateContent tokens/requests.
   */
  public async getAvailableModels(key: string): Promise<string[]> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        headers: {
          'x-goog-api-key': key,
        },
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const models: Array<{ name: string; supportedGenerationMethods?: string[] }> = data.models || [];
        const supported = models
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, ''));

        if (supported.length > 0) {
          return supported;
        }
      }
    } catch {
      // Ignore network errors and return defaults
    }
    return GEMINI_CANDIDATE_MODELS;
  }

  private async resolveModel(key: string, preferredModel?: string): Promise<string> {
    if (preferredModel && preferredModel !== 'auto') {
      this.cachedModel = preferredModel;
      return preferredModel;
    }

    if (this.cachedModel) {
      return this.cachedModel;
    }

    const available = await this.getAvailableModels(key);
    for (const cand of GEMINI_CANDIDATE_MODELS) {
      if (available.includes(cand)) {
        this.cachedModel = cand;
        return cand;
      }
    }

    const first = available[0] || 'gemini-3.8-flash';
    this.cachedModel = first;
    return first;
  }

  private async pingModel(model: string, key: string): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'hi' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2,
        },
      }),
    });
  }

  public async testConnection(apiKey: string, preferredModel?: string): Promise<TestConnectionResult> {
    const key = apiKey.trim();
    if (!key) {
      return { success: false, message: 'No API key provided.' };
    }

    try {
      // Step 1: Validate key with zero-quota ListModels query
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const listRes = await fetch(url, {
        headers: { 'x-goog-api-key': key },
      });

      if (!listRes.ok) {
        const listData = await listRes.json().catch(() => ({}));
        const listErr = listData?.error?.message || `HTTP ${listRes.status}`;
        if (listErr.toLowerCase().includes('api key not valid') || listErr.toLowerCase().includes('api_key_invalid')) {
          return {
            success: false,
            message: 'Invalid API key.',
            details: 'Google API rejected this key. Please verify your API key in Google AI Studio.',
          };
        }
        return {
          success: false,
          message: `Connection error (${listRes.status})`,
          details: listErr,
        };
      }

      // Read authorized models
      const listData = await listRes.json().catch(() => ({}));
      const modelsList: Array<{ name: string; supportedGenerationMethods?: string[] }> = listData.models || [];
      const supportedModels = modelsList
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));

      let targetModel = await this.resolveModel(key, preferredModel);

      // Step 2: Validate generateContent with targetModel
      let res = await this.pingModel(targetModel, key);

      if (res.ok) {
        this.cachedModel = targetModel;
        return {
          success: true,
          message: `Connected (${targetModel})`,
          modelUsed: targetModel,
        };
      }

      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${res.status}`;

      // Check if Google recommended a specific model in error message
      const recMatch = errMsg.match(/update your code to use models\/([a-zA-Z0-9.-]+)/i);
      if (recMatch && recMatch[1]) {
        targetModel = recMatch[1];
        const recRes = await this.pingModel(targetModel, key);
        if (recRes.ok) {
          this.cachedModel = targetModel;
          return {
            success: true,
            message: `Connected (${targetModel})`,
            modelUsed: targetModel,
          };
        }
      }

      // Step 3: If quota or rate-limit reached on targetModel, test alternate models
      const candidatesToTest = [...supportedModels, ...GEMINI_CANDIDATE_MODELS];
      const seen = new Set<string>([targetModel]);

      for (const cand of candidatesToTest) {
        if (seen.has(cand)) continue;
        seen.add(cand);

        const candRes = await this.pingModel(cand, key);
        if (candRes.ok) {
          this.cachedModel = cand;
          return {
            success: true,
            message: `Connected (${cand})`,
            modelUsed: cand,
            details: `Note: ${targetModel} is currently rate-limited on this key. Sentinel connected successfully using alternate model ${cand}.`,
          };
        }
      }

      // If all models hit quota limits
      const isQuota = this.isQuotaOrRateLimitError(errMsg, res.status);
      let helpfulDetails = errMsg;

      if (isQuota && errMsg.includes('free_tier_requests')) {
        helpfulDetails = `${errMsg}\n\n[Google Cloud Project Note]: Your API key is currently assigned to a Free Tier project in Google AI Studio (limit: 20 requests). If you have Gemini Ultra or a billing account, link your Google Cloud billing account in Google AI Studio (aistudio.google.com -> Plan & billing) to use your full quota.`;
      }

      return {
        success: false,
        message: isQuota ? `Quota reached (${targetModel})` : `Error with ${targetModel}`,
        details: helpfulDetails,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: 'Network error reaching Google API.',
        details: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async generateResponse(
    prompt: string,
    apiKey: string,
    systemPrompt?: string,
    preferredModel?: string
  ): Promise<string> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error('Configure an AI provider to continue.');
    }

    const primaryModel = await this.resolveModel(key, preferredModel);

    // Build ordered queue of models to try
    const available = await this.getAvailableModels(key);
    const modelsToTry: string[] = [primaryModel];

    for (const cand of GEMINI_CANDIDATE_MODELS) {
      if (!modelsToTry.includes(cand)) {
        modelsToTry.push(cand);
      }
    }
    for (const cand of available) {
      if (!modelsToTry.includes(cand)) {
        modelsToTry.push(cand);
      }
    }

    const callModel = async (targetModel: string): Promise<{ ok: boolean; text?: string; error?: string; status?: number; recommendedModel?: string }> => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(key)}`;

      const requestBody: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      };

      if (systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: systemPrompt }],
        };
      }

      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok && response.status === 400 && systemPrompt) {
        const fallbackBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nUser request: ${prompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        };

        const retryRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify(fallbackBody),
        });

        if (retryRes.ok) {
          response = retryRes;
        }
      }

      if (response.ok) {
        const data = await response.json();
        const candidate = data?.candidates?.[0];
        const textPart = candidate?.content?.parts?.[0]?.text;

        if (!textPart) {
          return { ok: false, error: 'No content received from Gemini.', status: response.status };
        }

        return { ok: true, text: textPart.trim(), status: response.status };
      }

      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;

      if (errMsg.toLowerCase().includes('api key not valid') || errMsg.toLowerCase().includes('api_key_invalid')) {
        throw new Error('The configured API key was rejected.');
      }

      const recMatch = errMsg.match(/update your code to use models\/([a-zA-Z0-9.-]+)/i);
      const recModel = recMatch ? recMatch[1] : undefined;

      return { ok: false, error: errMsg, status: response.status, recommendedModel: recModel };
    };

    let lastError = '';

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      const result = await callModel(model);

      if (result.ok && result.text) {
        this.cachedModel = model;
        return result.text;
      }

      lastError = result.error || 'Request failed';

      if (result.recommendedModel && !modelsToTry.includes(result.recommendedModel)) {
        modelsToTry.splice(i + 1, 0, result.recommendedModel);
      }

      if (this.isQuotaOrRateLimitError(lastError, result.status) || result.status === 404 || result.status === 503) {
        console.warn(`[Sentinel] Model ${model} returned (${lastError}). Trying alternate model...`);
        continue;
      }
    }

    throw new Error(`Gemini error: ${lastError || 'Unable to generate response.'}`);
  }
}
