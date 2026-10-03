import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@ai-office/contracts';
import { OfficeFailure } from '@ai-office/core';
import { DeepSeekModelProvider } from '@ai-office/adapter-pi';

describe('DeepSeek model provider', () => {
  it('lists the models it supports', () => {
    const provider = new DeepSeekModelProvider();
    expect(provider.listModels()).toEqual(['deepseek-flash', 'deepseek-v4-pro']);
  });

  it('resolves a supported model to launch-time configuration', () => {
    const provider = new DeepSeekModelProvider();
    expect(provider.resolve({ providerId: 'deepseek', modelId: 'deepseek-flash' })).toEqual({
      providerId: 'deepseek',
      modelId: 'deepseek-flash',
      provider: 'deepseek',
      model: 'deepseek-flash',
    });
  });

  it('lists the supported ids when a model is unsupported', () => {
    const provider = new DeepSeekModelProvider();
    try {
      provider.resolve({ providerId: 'deepseek', modelId: 'gpt-9' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OfficeFailure);
      expect((error as OfficeFailure).code).toBe(ERROR_CODES.validation);
      expect((error as OfficeFailure).details?.supported).toEqual([
        'deepseek-flash',
        'deepseek-v4-pro',
      ]);
    }
  });

  it('refuses a reference for a different provider', () => {
    const provider = new DeepSeekModelProvider();
    expect(() => provider.resolve({ providerId: 'openai', modelId: 'gpt-5' })).toThrow(
      /cannot resolve/,
    );
  });

  it('never puts credentials into the resolved configuration', () => {
    const provider = new DeepSeekModelProvider({
      env: { DEEPSEEK_API_KEY: 'sk-super-secret' },
    });
    const resolved = provider.resolve({ providerId: 'deepseek', modelId: 'deepseek-flash' });
    expect(JSON.stringify(resolved)).not.toContain('sk-super-secret');
    expect(Object.keys(resolved).sort()).toEqual(['model', 'modelId', 'provider', 'providerId']);
  });

  it('reports credential presence without exposing the value', () => {
    const withKey = new DeepSeekModelProvider({ env: { DEEPSEEK_API_KEY: 'sk-abc' } });
    const withoutKey = new DeepSeekModelProvider({ env: {} });
    expect(withKey.hasCredentials()).toBe(true);
    expect(withoutKey.hasCredentials()).toBe(false);
    expect(withKey.credentialEnvVar).toBe('DEEPSEEK_API_KEY');
  });
});
