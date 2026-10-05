/**
 * Sentinel AI Provider Interface
 * Clean abstraction layer allowing seamless interchange between Gemini, OpenAI, Claude, etc.
 */

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: string;
  modelUsed?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Validates the provided API key with the vendor endpoint.
   */
  testConnection(apiKey: string, model?: string): Promise<TestConnectionResult>;

  /**
   * Generates a textual response for the user prompt using the vendor API.
   */
  generateResponse(prompt: string, apiKey: string, systemPrompt?: string, model?: string): Promise<string>;
}
