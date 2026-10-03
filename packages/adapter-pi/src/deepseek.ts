import { ERROR_CODES, type ModelRef, type ResolvedModel } from '@ai-office/contracts';
import { OfficeFailure, type ModelProvider } from '@ai-office/core';

export interface DeepSeekProviderOptions {
  /** Environment variable PI reads the key from. Never stored, never logged. */
  apiKeyEnvVar?: string;
  /** Model ids this provider can resolve. */
  models?: string[];
  /** Injection point for tests; defaults to reading process.env. */
  env?: Record<string, string | undefined>;
}

const DEFAULT_MODELS = ['deepseek-flash', 'deepseek-v4-pro'];

/**
 * Resolves DeepSeek model references to launch-time configuration for the PI
 * harness. Credentials are read from the host environment at launch and are
 * never persisted in office data or returned over the API.
 */
export class DeepSeekModelProvider implements ModelProvider {
  readonly id = 'deepseek';
  readonly label = 'DeepSeek';

  private readonly apiKeyEnvVar: string;
  private readonly models: string[];
  private readonly env: Record<string, string | undefined>;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKeyEnvVar = options.apiKeyEnvVar ?? 'DEEPSEEK_API_KEY';
    this.models = options.models ?? DEFAULT_MODELS;
    this.env = options.env ?? process.env;
  }

  listModels(): string[] {
    return [...this.models];
  }

  /** True when a key is present. Reported by the runtime, never returned. */
  hasCredentials(): boolean {
    const value = this.env[this.apiKeyEnvVar];
    return typeof value === 'string' && value.trim().length > 0;
  }

  get credentialEnvVar(): string {
    return this.apiKeyEnvVar;
  }

  resolve(ref: ModelRef): ResolvedModel {
    if (ref.providerId !== this.id) {
      throw new OfficeFailure(
        ERROR_CODES.unknownAdapter,
        `Provider "${this.id}" cannot resolve a reference for "${ref.providerId}"`,
      );
    }
    if (!this.models.includes(ref.modelId)) {
      throw new OfficeFailure(ERROR_CODES.validation, `Unsupported DeepSeek model "${ref.modelId}"`, {
        supported: this.listModels(),
      });
    }
    return { providerId: this.id, modelId: ref.modelId, provider: 'deepseek', model: ref.modelId };
  }
}
