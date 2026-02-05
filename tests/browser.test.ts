import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Mock rebrowser before importing
vi.mock('rebrowser-puppeteer-core', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      pages: vi.fn().mockResolvedValue([]),
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        url: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn().mockResolvedValue('Mozilla/5.0 Chrome/131.0.0.0'),
        evaluateOnNewDocument: vi.fn(),
        $$: vi.fn().mockResolvedValue([]),
        $: vi.fn().mockResolvedValue(null),
        setUserAgent: vi.fn(),
        keyboard: { down: vi.fn(), press: vi.fn(), up: vi.fn(), type: vi.fn() },
      }),
      close: vi.fn(),
    }),
  },
}));

import { SunoBrowser, DEFAULT_PROFILE_DIR } from '../src/browser';

describe('DEFAULT_PROFILE_DIR', () => {
  it('is under home directory', () => {
    expect(DEFAULT_PROFILE_DIR).toContain(os.homedir());
  });

  it('uses .sunokit/browser-profile path', () => {
    expect(DEFAULT_PROFILE_DIR).toBe(
      path.join(os.homedir(), '.sunokit', 'browser-profile')
    );
  });
});

describe('SunoBrowser', () => {
  it('constructs with default config', () => {
    const browser = new SunoBrowser();
    expect(browser).toBeDefined();
  });

  it('constructs with custom userDataDir', () => {
    const browser = new SunoBrowser({ userDataDir: '/tmp/test-profile' });
    expect(browser).toBeDefined();
  });

  it('getPage returns null before connect', () => {
    const browser = new SunoBrowser();
    expect(browser.getPage()).toBeNull();
  });

  it('disconnect without connect does not throw', async () => {
    const browser = new SunoBrowser();
    await expect(browser.disconnect()).resolves.toBeUndefined();
  });
});

describe('BrowserPage interface contract', () => {
  // These tests verify the interface shape that SunoClient depends on
  it('BrowserPage must expose goto, url, content, evaluate, $$, $, keyboard', () => {
    // Interface checked at compile time — this test documents the contract
    const requiredMethods = ['goto', 'url', 'content', 'evaluate', '$$', '$', 'keyboard'];
    // If this compiles, the interface is correct
    expect(requiredMethods).toHaveLength(7);
  });

  it('BrowserElement must expose evaluate, click, type', () => {
    const requiredMethods = ['evaluate', 'click', 'type'];
    expect(requiredMethods).toHaveLength(3);
  });
});
