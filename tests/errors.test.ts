import { describe, it, expect } from 'vitest';
import {
  SunoError,
  AuthenticationError,
  GenerationTimeoutError,
  RateLimitError,
  ElementNotFoundError,
  BrowserError,
  ValidationError,
  isSunoError,
  getErrorGuidance,
} from '../src/errors';

describe('Error classes', () => {
  it('SunoError has name and code', () => {
    const err = new SunoError('test', 'TEST_CODE');
    expect(err.name).toBe('SunoError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SunoError);
  });

  it('AuthenticationError has default message and AUTH_ERROR code', () => {
    const err = new AuthenticationError();
    expect(err.name).toBe('AuthenticationError');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.message).toBe('Not logged in to Suno');
  });

  it('AuthenticationError accepts custom message', () => {
    const err = new AuthenticationError('Session expired');
    expect(err.message).toBe('Session expired');
    expect(err.code).toBe('AUTH_ERROR');
  });

  it('GenerationTimeoutError has default message', () => {
    const err = new GenerationTimeoutError();
    expect(err.name).toBe('GenerationTimeoutError');
    expect(err.code).toBe('GENERATION_TIMEOUT');
    expect(err.message).toContain('timeout');
  });

  it('RateLimitError has default message', () => {
    const err = new RateLimitError();
    expect(err.name).toBe('RateLimitError');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.message).toContain('Rate limit');
  });

  it('ElementNotFoundError includes element name', () => {
    const err = new ElementNotFoundError('Create button');
    expect(err.name).toBe('ElementNotFoundError');
    expect(err.code).toBe('ELEMENT_NOT_FOUND');
    expect(err.message).toContain('Create button');
  });

  it('BrowserError prefixes message', () => {
    const err = new BrowserError('Chrome crashed');
    expect(err.name).toBe('BrowserError');
    expect(err.code).toBe('BROWSER_ERROR');
    expect(err.message).toBe('Browser error: Chrome crashed');
  });

  it('ValidationError prefixes message', () => {
    const err = new ValidationError('BPM must be 1-300');
    expect(err.name).toBe('ValidationError');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Validation error: BPM must be 1-300');
  });

  it('all error types are instanceof SunoError', () => {
    const errors = [
      new AuthenticationError(),
      new GenerationTimeoutError(),
      new RateLimitError(),
      new ElementNotFoundError('btn'),
      new BrowserError('crash'),
      new ValidationError('bad input'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(SunoError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('isSunoError', () => {
  it('returns true for SunoError instances', () => {
    expect(isSunoError(new SunoError('test', 'CODE'))).toBe(true);
    expect(isSunoError(new AuthenticationError())).toBe(true);
    expect(isSunoError(new BrowserError('crash'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isSunoError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isSunoError(null)).toBe(false);
    expect(isSunoError(undefined)).toBe(false);
    expect(isSunoError('string')).toBe(false);
    expect(isSunoError(42)).toBe(false);
    expect(isSunoError({})).toBe(false);
  });
});

describe('getErrorGuidance', () => {
  it('provides auth guidance for AuthenticationError', () => {
    const guidance = getErrorGuidance(new AuthenticationError());
    expect(guidance).toContain('browser-profile');
    expect(guidance).toContain('Log in');
  });

  it('provides timeout guidance for GenerationTimeoutError', () => {
    const guidance = getErrorGuidance(new GenerationTimeoutError());
    expect(guidance).toContain('still generating');
    expect(guidance).toContain('credit');
  });

  it('provides rate limit guidance for RateLimitError', () => {
    const guidance = getErrorGuidance(new RateLimitError());
    expect(guidance).toContain('Wait');
    expect(guidance).toContain('credit');
  });

  it('provides UI change guidance for ElementNotFoundError', () => {
    const guidance = getErrorGuidance(new ElementNotFoundError('Create button'));
    expect(guidance).toContain('UI has changed');
    expect(guidance).toContain('issue');
  });

  it('provides browser guidance for BrowserError', () => {
    const guidance = getErrorGuidance(new BrowserError('crash'));
    expect(guidance).toContain('SingletonLock');
  });

  it('returns generic message for non-SunoError', () => {
    const guidance = getErrorGuidance(new Error('unknown'));
    expect(guidance).toContain('unexpected error');
  });

  it('returns generic message for non-error values', () => {
    const guidance = getErrorGuidance('not an error');
    expect(guidance).toContain('unexpected error');
  });

  it('returns error message for unknown SunoError codes', () => {
    const err = new SunoError('custom message', 'UNKNOWN_CODE');
    const guidance = getErrorGuidance(err);
    expect(guidance).toBe('custom message');
  });
});
