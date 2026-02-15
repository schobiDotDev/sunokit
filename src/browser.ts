/**
 * Browser automation for Suno.com
 *
 * Uses rebrowser-puppeteer-core (patched CDP to evade bot detection)
 * with real Chrome for maximum stealth.
 */

import rebrowser from 'rebrowser-puppeteer-core';
import { Browser, Page, ElementHandle } from 'rebrowser-puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ─── Interfaces ──────────────────────────────────────────────

export interface BrowserPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  url(): string;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
  $$(selector: string): Promise<BrowserElement[]>;
  $(selector: string): Promise<BrowserElement | null>;
  keyboard: {
    down(key: string): Promise<void>;
    press(key: string): Promise<void>;
    up(key: string): Promise<void>;
  };
  /** Create a Chrome DevTools Protocol session for low-level browser control */
  createCDPSession(): Promise<CDPSession>;
}

export interface CDPSession {
  send(method: string, params?: Record<string, any>): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  detach(): Promise<void>;
}

export interface BrowserElement {
  evaluate<T>(fn: (el: Element, ...args: any[]) => T, ...args: any[]): Promise<T>;
  /** Click the element */
  click(): Promise<void>;
  /** Type text into the element (real keyboard events — works with React) */
  type(text: string, options?: { delay?: number }): Promise<void>;
  uploadFile?(filePath: string): Promise<void>;
}

// ─── Chrome Discovery ────────────────────────────────────────

/**
 * Find system Chrome installation.
 * Prefers real Chrome over Chromium — real Chrome has authentic fingerprints
 * and is less likely to be flagged by bot detection.
 */
function findChromePath(): string | undefined {
  const platform = os.platform();
  const candidates: string[] = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    );
    try {
      const p = execSync('which google-chrome 2>/dev/null || which chromium 2>/dev/null', { encoding: 'utf8' }).trim();
      if (p) candidates.push(p);
    } catch {}
  } else if (platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  }

  return candidates.find(c => fs.existsSync(c));
}

// ─── Page & Element Wrappers ─────────────────────────────────

class PuppeteerPageWrapper implements BrowserPage {
  constructor(private page: Page) {}

  async goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void> {
    await this.page.goto(url, {
      waitUntil: (options?.waitUntil as any) || 'domcontentloaded',
      timeout: options?.timeout || 60000,
    });
  }

  url(): string {
    return this.page.url();
  }

  async content(): Promise<string> {
    return this.page.content();
  }

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
    return this.page.evaluate(fn, ...args);
  }

  async $$(selector: string): Promise<BrowserElement[]> {
    const elements = await this.page.$$(selector);
    return elements.map(el => new PuppeteerElementWrapper(el, this.page));
  }

  async $(selector: string): Promise<BrowserElement | null> {
    const element = await this.page.$(selector);
    return element ? new PuppeteerElementWrapper(element, this.page) : null;
  }

  get keyboard() {
    return this.page.keyboard;
  }

  async createCDPSession(): Promise<CDPSession> {
    return await this.page.createCDPSession() as unknown as CDPSession;
  }
}

class PuppeteerElementWrapper implements BrowserElement {
  constructor(private element: ElementHandle, private page: Page) {}

  async evaluate<T>(fn: (el: Element, ...args: any[]) => T, ...args: any[]): Promise<T> {
    return this.element.evaluate(fn, ...args);
  }

  async click(): Promise<void> {
    await this.element.click();
  }

  async type(text: string, options?: { delay?: number }): Promise<void> {
    await this.element.click();
    await new Promise(r => setTimeout(r, 200));
    await this.page.keyboard.type(text, { delay: options?.delay ?? 30 });
  }

  async uploadFile(filePath: string): Promise<void> {
    await (this.element as any).uploadFile(filePath);
  }
}

// ─── Main Browser Class ──────────────────────────────────────

export const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.sunokit', 'browser-profile');

export class SunoBrowser {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userDataDir: string;

  constructor(config?: { userDataDir?: string }) {
    this.userDataDir = config?.userDataDir || DEFAULT_PROFILE_DIR;
  }

  async connect(options: { headless?: boolean } = {}): Promise<void> {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    const chromePath = findChromePath();

    if (chromePath) {
      console.log(`🚀 Starting browser (real Chrome: ${path.basename(chromePath)})...`);
    } else {
      console.log('🚀 Starting browser (bundled Chromium — install Chrome for better stealth)...');
    }

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
      '--window-position=100,100',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-extensions-except=',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-site-isolation-trials',
      '--enable-webgl',
      '--enable-gpu-rasterization',
    ];

    const launchOptions: any = {
      headless: options.headless ?? false,
      userDataDir: this.userDataDir,
      args: launchArgs,
      ignoreDefaultArgs: [
        '--enable-automation',
        '--enable-blink-features=IdleDetection',
      ],
      defaultViewport: null,
    };

    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }

    this.browser = await rebrowser.launch(launchOptions);

    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();

    await this.applyPageStealth(this.page);
  }

  private async applyPageStealth(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true,
      });

      const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (originalQuery) {
        (window.navigator.permissions as any).query = (parameters: any) => {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission } as any);
          }
          return originalQuery(parameters);
        };
      }

      if (!(window as any).chrome) {
        (window as any).chrome = {};
      }
      if (!(window as any).chrome.runtime) {
        (window as any).chrome.runtime = {
          connect: () => {},
          sendMessage: () => {},
        };
      }

      Object.defineProperty(screen, 'availWidth', { get: () => window.screen.width });
      Object.defineProperty(screen, 'availHeight', { get: () => window.screen.height - 40 });
    });

    const ua = await page.evaluate(() => navigator.userAgent);
    if (ua.includes('HeadlessChrome') || ua.includes('Headless')) {
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  getPage(): BrowserPage | null {
    return this.page ? new PuppeteerPageWrapper(this.page) : null;
  }
}
