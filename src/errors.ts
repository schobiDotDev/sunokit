/**
 * Error Types for sunokit
 * 
 * Provides specific error classes for different failure modes.
 */

export class SunoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SunoError';
  }
}

export class AuthenticationError extends SunoError {
  constructor(message: string = 'Not logged in to Suno') {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class GenerationTimeoutError extends SunoError {
  constructor(message: string = 'Generation timeout - songs may still be processing') {
    super(message, 'GENERATION_TIMEOUT');
    this.name = 'GenerationTimeoutError';
  }
}

export class RateLimitError extends SunoError {
  constructor(message: string = 'Rate limit exceeded - please wait and try again') {
    super(message, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class ElementNotFoundError extends SunoError {
  constructor(element: string) {
    super(`Could not find UI element: ${element}`, 'ELEMENT_NOT_FOUND');
    this.name = 'ElementNotFoundError';
  }
}

export class BrowserError extends SunoError {
  constructor(message: string) {
    super(`Browser error: ${message}`, 'BROWSER_ERROR');
    this.name = 'BrowserError';
  }
}

export class ValidationError extends SunoError {
  constructor(message: string) {
    super(`Validation error: ${message}`, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Check if error is a known Suno error type
 */
export function isSunoError(error: unknown): error is SunoError {
  return error instanceof SunoError;
}

/**
 * Get user-friendly error message with recovery suggestions
 */
export function getErrorGuidance(error: unknown): string {
  if (!isSunoError(error)) {
    return 'An unexpected error occurred. Please try again.';
  }

  switch (error.code) {
    case 'AUTH_ERROR':
      return `${error.message}

Recovery steps:
1. Clear browser profile: rm -rf ~/.sunokit/browser-profile
2. Run command again - browser will open for login
3. Log in to Suno manually
4. Session will be saved for future use`;

    case 'GENERATION_TIMEOUT':
      return `${error.message}

Recovery steps:
1. Check Suno.com manually to see if songs are still generating
2. Wait a few minutes and check your library
3. Try again with a shorter prompt
4. Check your credit balance (might be exhausted)`;

    case 'RATE_LIMIT':
      return `${error.message}

Recovery steps:
1. Wait 5-10 minutes
2. Check credit balance: suno credits
3. Try again`;

    case 'ELEMENT_NOT_FOUND':
      return `${error.message}

This usually means Suno's UI has changed.

Recovery steps:
1. Update sunokit: npm update sunokit
2. Report issue: https://github.com/schobiDotDev/sunokit/issues
3. Include error message and steps to reproduce`;

    case 'BROWSER_ERROR':
      return `${error.message}

Recovery steps:
1. Kill any stuck browser processes
2. Remove browser lock: rm -f ~/.sunokit/browser-profile/SingletonLock
3. Try again`;

    default:
      return error.message;
  }
}
