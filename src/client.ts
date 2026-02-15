import { GenerateOptions, Song, DownloadFormat, DEFAULT_CONFIG, SunoConfig, DEFAULT_GENERATE_OPTIONS, SampleOptions, SampleType } from './types';
import { SunoBrowser, BrowserPage } from './browser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

/**
 * SunoClient - Browser automation client for Suno.com
 * Supports all Suno features: songs, custom mode, samples, audio upload
 * 
 * Uses SunoBrowser for browser automation
 */
export class SunoClient {
  private config: SunoConfig;
  private browser: SunoBrowser;

  constructor(config: Partial<SunoConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browser = new SunoBrowser({
      userDataDir: this.config.userDataDir,
    });
  }

  /**
   * Connect to browser (via configured backend)
   */
  async connect(options: { headless?: boolean } = {}): Promise<void> {
    await this.browser.connect(options);

    const page = this.browser.getPage();
    if (!page) throw new Error('Backend did not provide a page');
    
    console.log('📡 Navigating to Suno...');
    await page.goto('https://suno.com/create', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.waitForPageReady();
    await this.ensureLoggedIn();
  }

  async disconnect(): Promise<void> {
    await this.browser.disconnect();
  }

  /**
   * Get the current browser page (throws if not connected)
   */
  private getPage(): BrowserPage {
    const page = this.browser.getPage();
    if (!page) throw new Error('Not connected - call connect() first');
    return page;
  }

  /**
   * Generate songs with the given options
   */
  async generate(options: GenerateOptions): Promise<Song[]> {
    const page = this.getPage();

    // Merge with defaults
    const opts = { ...DEFAULT_GENERATE_OPTIONS, ...options };

    await page.goto('https://suno.com/create', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.waitForPageReady();

    // Select model version (if not default v5)
    if (opts.model && opts.model !== 'v5') {
      await this.selectModel(opts.model as string);
    }

    // Upload audio if provided (works in both modes)
    if (opts.audioPath) {
      await this.uploadAudio(opts.audioPath);
    }

    if (opts.mode === 'custom') {
      await this.switchToCustomMode();

      // Persona (custom mode only — button appears after switching)
      if (opts.persona) {
        await this.selectPersona(opts.persona);
      }

      await this.fillCustomMode(opts);
    } else {
      await this.fillSimpleMode(opts);
    }

    // Click inspiration chips (works in both modes)
    if (opts.inspo && opts.inspo.length > 0) {
      await this.clickInspoChips(opts.inspo);
    }

    const initialSongs = await this.getSongIds();
    console.log(`📊 Current songs: ${initialSongs.size}`);

    console.log('🎵 Clicking Create button...');
    const clicked = await this.clickButtonByText('Create');

    if (clicked) {
      console.log('✅ Create button clicked!');
    } else {
      console.log('⚠️ Create button not found, trying keyboard shortcut...');
      await page.keyboard.down('Meta');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Meta');
    }

    // Use prompt as title in results
    const songTitle = opts.title || opts.prompt.substring(0, 60);
    const songs = await this.waitForGeneration(initialSongs, songTitle);
    return songs;
  }

  /**
   * Generate a sound sample (one-shot, loop, effect)
   */
  async generateSample(options: SampleOptions): Promise<Song[]> {
    const page = this.getPage();

    await page.goto('https://suno.com/create', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.waitForPageReady();

    console.log('🔊 Switching to Sample mode...');
    
    // Find and expand the Sound section
    await this.expandSection('Sound');
    await this.delay(500);

    // Fill the sound description
    console.log(`📝 Filling sound description: "${options.prompt.substring(0, 50)}..."`);
    await this.fillTextareaByPlaceholder('Describe the sound', options.prompt);
    await this.delay(800);

    // Open Advanced Options for type, BPM, key settings
    const needsAdvanced = options.type !== 'one-shot' || options.bpm || options.key;
    if (needsAdvanced) {
      await this.expandSection('Advanced Options');
      await this.delay(1000);
    }

    // Set sample type
    if (options.type && options.type !== 'one-shot') {
      console.log(`   • Setting type: ${options.type}...`);
      const typeMap: Record<SampleType, string> = {
        'one-shot': 'One-Shot',
        'loop': 'Loop',
        'effect': 'Effect'
      };
      await this.clickButtonByText(typeMap[options.type]);
      await this.delay(800);
    }

    // Set BPM (for loops)
    if (options.bpm) {
      console.log(`   • Setting BPM: ${options.bpm}...`);
      await this.fillNumberInput('BPM', options.bpm);
      await this.delay(800);
    }

    // Set Key
    if (options.key) {
      console.log(`   • Setting key: ${options.key}...`);
      await this.fillInputByPlaceholder('Auto', options.key);
      await this.delay(800);
    }

    const initialSongs = await this.getSongIds();
    console.log(`📊 Current samples: ${initialSongs.size}`);

    console.log('🎵 Clicking Create button...');
    await this.clickButtonByText('Create');
    
    const songs = await this.waitForGeneration(initialSongs, 120000); // Samples are faster
    return songs;
  }

  /**
   * Fill a number input by nearby label text
   */
  private async fillNumberInput(labelText: string, value: number): Promise<boolean> {
    const page = this.getPage();
    
    return await page.evaluate((label: string, val: number) => {
      // Find element containing the label text
      const allElements = document.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        if (el.textContent?.trim() === label) {
          // Look for nearby number input
          const parent = el.closest('div');
          if (parent) {
            const input = parent.querySelector('input[type="number"]') as HTMLInputElement;
            if (input) {
              input.focus();
              input.value = String(val);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
      }
      return false;
    }, labelText, value);
  }

  /**
   * Upload an audio file as reference
   */
  async uploadAudio(audioPath: string): Promise<void> {
    const page = this.getPage();

    const absolutePath = path.resolve(audioPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Audio file not found: ${absolutePath}`);
    }

    console.log(`🎵 Uploading audio: ${path.basename(audioPath)}...`);

    // Click the +Audio button to open upload dialog
    await this.clickButtonByText('Audio');
    await this.delay(1000);

    // Look for "Upload" option in the menu
    await this.clickButtonByText('Upload');
    await this.delay(500);

    // Find the file input and upload
    const fileInput = await page.$('input[type="file"][accept*="audio"]');
    if (fileInput && fileInput.uploadFile) {
      await fileInput.uploadFile(absolutePath);
      console.log('   ✓ Audio file uploaded!');
      await this.delay(2000); // Wait for processing
    } else {
      // Try finding any file input
      const anyFileInput = await page.$('input[type="file"]');
      if (anyFileInput && anyFileInput.uploadFile) {
        await anyFileInput.uploadFile(absolutePath);
        console.log('   ✓ Audio file uploaded!');
        await this.delay(2000);
      } else {
        console.log('   ⚠️ Could not find file upload input');
      }
    }
  }

  /**
   * List songs in workspace
   */
  async listSongs(limit: number = 20): Promise<Song[]> {
    const page = this.getPage();

    await page.goto('https://suno.com/create', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.waitForPageReady();

    const songs: Song[] = [];
    const songLinks = await page.$$('a[href*="/song/"]');
    
    for (const link of songLinks.slice(0, limit)) {
      try {
        const href = await link.evaluate(el => el.getAttribute('href'));
        const text = await link.evaluate(el => el.textContent);
        
        if (href) {
          const id = href.split('/song/')[1];
          songs.push({
            id,
            title: text?.trim() || 'Unknown',
            duration: '',
            styles: '',
            model: '',
            createdAt: new Date(),
            url: `https://suno.com/song/${id}`
          });
        }
      } catch {
        // Skip problematic elements
      }
    }

    return songs;
  }

  /**
   * Get detailed metadata for a specific song
   */
  async getSongDetails(songId: string): Promise<Song> {
    const page = this.getPage();

    // Navigate to song page
    await page.goto(`https://suno.com/song/${songId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.delay(2000);

    // Extract metadata from page
    const metadata = await page.evaluate(() => {
      // Helper to find text by label
      const findByLabel = (label: string): string => {
        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          if (el.textContent?.includes(label)) {
            const next = el.nextElementSibling;
            if (next) return next.textContent?.trim() || '';
          }
        }
        return '';
      };

      // Extract title
      const titleEl = document.querySelector('h1, [role="heading"]');
      const title = titleEl?.textContent?.trim() || 'Unknown';

      // Try to find prompt/description
      const prompt = findByLabel('Prompt') || 
                    findByLabel('Description') || 
                    document.querySelector('[class*="prompt"]')?.textContent?.trim() || '';

      // Extract other metadata (this is site-specific)
      const pageText = document.body.textContent || '';
      
      return {
        title,
        prompt,
        pageText
      };
    });

    // Parse creation date from page or use current time as fallback
    const createdAt = new Date(); // TODO: Extract actual creation date from page

    return {
      id: songId,
      title: metadata.title,
      prompt: metadata.prompt,
      styles: '', // TODO: Extract from page
      duration: 0, // TODO: Extract from page
      model: '', // TODO: Extract from page
      createdAt,
      url: `https://suno.com/song/${songId}`,
      plays: 0,
      likes: 0,
      isPublic: true,
      audioUrl: `https://cdn1.suno.ai/${songId}.mp3`,
      videoUrl: `https://cdn1.suno.ai/${songId}.mp4`,
      imageUrl: `https://cdn1.suno.ai/${songId}.png`
    };
  }

  /**
   * Get current credits
   */
  async getCredits(): Promise<number> {
    const page = this.getPage();

    const pageContent = await page.content();
    const creditMatch = pageContent.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*credits?/i);
    if (creditMatch) {
      return parseInt(creditMatch[1].replace(/,/g, ''));
    }
    return -1;
  }

  // ============= STATIC METHODS (no browser needed) =============

  /**
   * Download via CDN - fast, no browser needed
   */
  static async downloadCDN(
    songId: string, 
    outputPath: string, 
    format: DownloadFormat = 'mp3',
    options: { quiet?: boolean } = {}
  ): Promise<void> {
    const cdnUrls: Record<DownloadFormat, string> = {
      'mp3': `https://cdn1.suno.ai/${songId}.mp3`,
      'wav': `https://cdn1.suno.ai/${songId}.wav`,
      'video': `https://cdn1.suno.ai/${songId}.mp4`
    };
    
    const cdnUrl = cdnUrls[format];
    if (!options.quiet) console.log(`📥 Downloading from CDN...`);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      
      const makeRequest = (url: string) => {
        https.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              makeRequest(redirectUrl);
              return;
            }
          }
          
          if (response.statusCode !== 200) {
            fs.unlink(outputPath, () => {});
            reject(new Error(`CDN returned HTTP ${response.statusCode}. Try --browser flag.`));
            return;
          }
          
          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastProgress = -1;

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0 && !options.quiet) {
              const progress = Math.floor((downloadedBytes / totalBytes) * 100);
              if (progress !== lastProgress && progress % 10 === 0) {
                process.stdout.write(`\r   Progress: ${progress}%`);
                lastProgress = progress;
              }
            }
          });
          
          response.pipe(file);
          
          file.on('finish', () => {
            file.close();
            if (!options.quiet) process.stdout.write('\n');
            const stats = fs.statSync(outputPath);
            if (!options.quiet) {
              console.log(`✅ Downloaded: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            }
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(outputPath, () => {});
          reject(new Error(`Download error: ${err.message}`));
        });
      };
      
      makeRequest(cdnUrl);
    });
  }

  /**
   * Download via authenticated browser session (needed for WAV format).
   *
   * Uses Suno's internal API directly (discovered via network inspection):
   *   1. POST /api/gen/{id}/convert_wav/ — triggers server-side WAV conversion
   *   2. GET  /api/gen/{id}/wav_file/    — polls until WAV is ready, streams to disk
   *
   * The auth token is extracted from the browser's Clerk session, then API calls
   * are made from Node.js (bypassing CORS restrictions that block in-page fetch).
   */
  async downloadBrowser(
    songId: string,
    outputPath: string,
    format: DownloadFormat = 'wav'
  ): Promise<void> {
    const page = this.getPage();

    console.log(`📥 Browser download (${format}): ${songId}`);

    const absOutput = path.resolve(outputPath);
    const outputDir = path.dirname(absOutput);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Ensure we're on suno.com so we can extract the auth token
    if (!page.url().includes('suno.com')) {
      await page.goto('https://suno.com/create', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await this.delay(2000);
    }

    // Extract the Clerk session token — Suno's API requires Bearer auth.
    console.log('   • Extracting auth token...');
    const authToken = await page.evaluate(async () => {
      // Method 1: Clerk's getToken() via window.__clerk
      try {
        const clerk = (window as any).__clerk_frontend_api
          || (window as any).Clerk
          || (window as any).__clerk;
        if (clerk?.session?.getToken) {
          const token = await clerk.session.getToken();
          if (token) return token;
        }
      } catch {}

      // Method 2: Extract from __session cookie
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === '__session' && value) return value;
      }

      // Method 3: Look for token in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('clerk') && key.includes('session')) {
          const val = localStorage.getItem(key);
          if (val) return val;
        }
      }

      return null;
    });

    if (!authToken) {
      throw new Error('Could not extract auth token. Is the browser logged in to Suno?');
    }
    console.log('   • Auth token obtained');

    const API_HOST = 'studio-api.prod.suno.com';

    // 1. Trigger WAV conversion
    console.log('   • Triggering WAV conversion...');
    const convertRes = await this.apiRequest(API_HOST, `/api/gen/${songId}/convert_wav/`, 'POST', authToken);

    if (convertRes.status !== 200 && convertRes.status !== 204) {
      throw new Error(`WAV conversion failed: HTTP ${convertRes.status}. ${convertRes.body}`);
    }
    console.log('   • Conversion triggered, waiting for file...');

    // 2. Poll for WAV file readiness
    const wavPath = `/api/gen/${songId}/wav_file/`;
    const maxWait = 60000;
    const start = Date.now();
    let wavFileUrl: string | null = null;

    while (Date.now() - start < maxWait) {
      const pollRes = await this.apiRequest(API_HOST, wavPath, 'GET', authToken);

      if (pollRes.status === 200) {
        // Response is JSON with the CDN URL: {"wav_file_url": "https://cdn1.suno.ai/..."}
        try {
          const json = JSON.parse(pollRes.body);
          wavFileUrl = json.wav_file_url || json.url || null;
        } catch {}
        break;
      }

      process.stdout.write('.');
      await this.delay(2000);
    }

    if (!wavFileUrl) {
      throw new Error('WAV conversion timed out or no download URL returned. Try again later.');
    }

    // 3. Download the WAV file from CDN
    console.log('\n   • Downloading WAV...');
    await SunoClient.downloadFile(wavFileUrl, absOutput);

    const stats = fs.statSync(absOutput);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Downloaded: ${outputPath} (${sizeMB} MB)`);
  }

  /**
   * Make an authenticated HTTPS request to Suno's API from Node.js.
   * Returns status code and response body.
   */
  private apiRequest(
    host: string, urlPath: string, method: string, token: string
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: host,
        path: urlPath,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Generate and download in one call (convenience method)
   */
  async generateAndDownload(
    prompt: string, 
    outputPath: string,
    options: Partial<GenerateOptions> & { format?: DownloadFormat } = {}
  ): Promise<Song[]> {
    const songs = await this.generate({
      prompt,
      mode: options.mode || 'simple',
      instrumental: options.instrumental || false,
      model: options.model || 'v5',
      ...options
    });

    if (songs.length > 0) {
      const ext = options.format || 'mp3';
      const finalPath = outputPath.endsWith(`.${ext}`) ? outputPath : `${outputPath}.${ext}`;
      await SunoClient.downloadCDN(songs[0].id, finalPath, options.format || 'mp3');
    }

    return songs;
  }

  // ============= PRIVATE METHODS =============

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * Wait until the Suno create page is fully loaded, interactive, AND stable.
   * Suno's SPA often reloads 1-2 times after initial navigation (auth checks,
   * session restoration, etc.). This method waits for the page to be
   * continuously ready for STABLE_DURATION ms before returning.
   */
  private async waitForPageReady(timeout: number = 25000): Promise<void> {
    const page = this.getPage();
    const start = Date.now();
    let stableStart: number | null = null;
    const STABLE_DURATION = 3000; // Must be ready for 3 continuous seconds

    console.log('   ⏳ Waiting for page to stabilize...');

    while (Date.now() - start < timeout) {
      let ready = false;
      try {
        ready = await page.evaluate(() => {
          const hasCreateBtn = !!Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent?.includes('Create'));
          const hasTextarea = !!document.querySelector('textarea');
          return hasCreateBtn || hasTextarea;
        });
      } catch {
        // page.evaluate can fail if page is mid-navigation
        ready = false;
      }

      if (ready) {
        if (!stableStart) stableStart = Date.now();
        if (Date.now() - stableStart >= STABLE_DURATION) {
          console.log('   ✓ Page is stable and ready');
          return;
        }
      } else {
        if (stableStart) {
          console.log('   ↻ Page reloaded, resetting stability check...');
        }
        stableStart = null;
      }

      await this.delay(500);
    }
    console.log('⚠️  Page may not be fully stable, proceeding anyway...');
  }

  /**
   * Find the first visible, non-captcha textarea on the page.
   * On Suno's create page this is always the main prompt/lyrics field.
   */
  private async findFirstVisibleTextarea() {
    const page = this.getPage();
    const textareas = await page.$$('textarea');
    for (const ta of textareas) {
      const usable = await ta.evaluate(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        const id = el.id || '';
        const name = el.getAttribute('name') || '';
        const isCaptcha = id.includes('captcha') || name.includes('captcha');
        return rect.width > 0 && rect.height > 0 && !isCaptcha
          && cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      if (usable) return ta;
    }
    return null;
  }

  private async clickButtonByText(text: string): Promise<boolean> {
    const page = this.getPage();
    
    return await page.evaluate((searchText: string) => {
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      for (const btn of buttons) {
        if (btn.textContent?.includes(searchText) && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      const divs = Array.from(document.querySelectorAll('div[role="button"], [class*="button"]')) as HTMLElement[];
      for (const div of divs) {
        if (div.textContent?.includes(searchText)) {
          div.click();
          return true;
        }
      }
      return false;
    }, text);
  }

  /**
   * Click button by aria-label
   */
  private async clickButtonByAriaLabel(label: string): Promise<boolean> {
    const page = this.getPage();
    
    return await page.evaluate((ariaLabel: string) => {
      const btn = document.querySelector(`button[aria-label*="${ariaLabel}"]`) as HTMLButtonElement;
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    }, label);
  }

  /**
   * Fill a textarea by placeholder text
   */
  private async fillTextareaByPlaceholder(placeholderMatch: string, value: string): Promise<boolean> {
    const page = this.getPage();

    const textareas = await page.$$('textarea');
    for (const textarea of textareas) {
      const match = await textarea.evaluate((el, search) => {
        const cs = getComputedStyle(el as HTMLElement);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        const placeholder = el.getAttribute('placeholder') || '';
        return placeholder.toLowerCase().includes(search.toLowerCase());
      }, placeholderMatch);
      if (match) {
        await textarea.click();
        await textarea.type(value);
        return true;
      }
    }
    return false;
  }

  /**
   * Fill an input by placeholder text
   */
  private async fillInputByPlaceholder(placeholderMatch: string, value: string): Promise<boolean> {
    const page = this.getPage();

    const inputs = await page.$$('input[type="text"], input:not([type])');
    for (const input of inputs) {
      const placeholder = await input.evaluate(el => el.getAttribute('placeholder') || '');
      if (placeholder.toLowerCase().includes(placeholderMatch.toLowerCase())) {
        await input.click();
        await input.type(value);
        return true;
      }
    }
    return false;
  }

  /**
   * Set a slider value by aria-label
   */
  private async setSliderByLabel(label: string, value: number): Promise<boolean> {
    const page = this.getPage();
    
    return await page.evaluate((sliderLabel: string, sliderValue: number) => {
      const slider = document.querySelector(`[aria-label="${sliderLabel}"]`) as HTMLElement;
      if (!slider) return false;
      
      const rect = slider.getBoundingClientRect();
      const width = rect.width;
      const percentage = sliderValue / 100;
      const clickX = rect.left + (width * percentage);
      const clickY = rect.top + (rect.height / 2);
      
      const mouseDown = new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: clickX, clientY: clickY
      });
      const mouseUp = new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, clientX: clickX, clientY: clickY
      });
      const click = new MouseEvent('click', {
        bubbles: true, cancelable: true, clientX: clickX, clientY: clickY
      });
      
      slider.dispatchEvent(mouseDown);
      slider.dispatchEvent(mouseUp);
      slider.dispatchEvent(click);
      
      return true;
    }, label, value);
  }

  /**
   * Expand a collapsed section by clicking its header
   */
  private async expandSection(sectionName: string): Promise<boolean> {
    const page = this.getPage();
    
    return await page.evaluate((name: string) => {
      // Find section headers (both collapsed and expanded)
      const headers = document.querySelectorAll('[role="button"]');
      for (const header of Array.from(headers)) {
        if (header.textContent?.includes(name)) {
          const isExpanded = header.getAttribute('aria-expanded');
          // Only click if collapsed or no aria-expanded (to toggle)
          if (isExpanded !== 'true') {
            (header as HTMLElement).click();
            return true;
          }
          return true; // Already expanded
        }
      }
      return false;
    }, sectionName);
  }

  private async ensureLoggedIn(): Promise<void> {
    const page = this.getPage();

    const loggedIn = await page.$('[aria-label*="Profile"], [aria-label*="profile"], button[aria-label*="menu button"]');

    if (loggedIn) {
      console.log('✅ Already logged in!');
      return;
    }

    console.log('⚠️  Not logged in. Please log in manually in the browser window.');
    console.log('   Session will be saved for future use.');
    
    for (let i = 0; i < 60; i++) {
      await this.delay(5000);
      
      try {
        if (page.url().includes('suno.com')) {
          const nowLoggedIn = await page.$('[aria-label*="Profile"], [aria-label*="profile"], button[aria-label*="menu button"]');
          if (nowLoggedIn) {
            console.log('✅ Login detected!');
            await page.goto('https://suno.com/create', { 
              waitUntil: 'domcontentloaded',
              timeout: 60000 
            });
            await this.delay(2000);
            return;
          }
        }
      } catch {
        // Page might be navigating
      }
    }
    throw new Error('Login timeout. Please try again.');
  }

  private async fillSimpleMode(options: GenerateOptions): Promise<void> {
    const page = this.getPage();

    console.log(`📝 Filling prompt: "${options.prompt.substring(0, 50)}${options.prompt.length > 50 ? '...' : ''}"`);

    // Use the first visible, non-captcha textarea — that's always the main prompt field
    const promptTextarea = await this.findFirstVisibleTextarea();
    if (promptTextarea) {
      await promptTextarea.type(options.prompt);
    } else {
      throw new Error('Could not find prompt textarea on create page');
    }

    // Handle +Lyrics button in simple mode
    if (options.lyrics) {
      console.log('   • Adding lyrics...');
      await this.clickButtonByText('Lyrics');
      await this.delay(500);
      await this.fillTextareaByPlaceholder('lyrics', options.lyrics);
      await this.delay(800);
    }

    if (options.instrumental) {
      console.log('   • Setting instrumental...');
      await this.clickButtonByText('Instrumental');
      await this.delay(800);
    }
  }

  private async fillCustomMode(options: GenerateOptions): Promise<void> {
    const page = this.getPage();

    console.log('📝 Filling custom mode options...');

    // 0. Fill Song Description (the main prompt field — first visible textarea)
    console.log(`   • Setting song description: "${options.prompt.substring(0, 50)}${options.prompt.length > 50 ? '...' : ''}"`);
    const descTextarea = await this.findFirstVisibleTextarea();
    if (descTextarea) {
      await descTextarea.type(options.prompt);
    } else {
      throw new Error('Could not find Song Description textarea in custom mode');
    }
    await this.delay(800);

    // 1. Fill Lyrics
    if (options.lyrics) {
      console.log('   • Setting lyrics...');
      await this.fillTextareaByPlaceholder('lyrics', options.lyrics);
      await this.delay(800);
    }

    // 2. Fill Styles (the styles textarea is the second one on the page in custom mode)
    if (options.styles) {
      console.log('   • Setting styles...');
      const filled = await this.fillTextareaByPlaceholder('folk', options.styles) ||
                     await this.fillTextareaByPlaceholder('style', options.styles) ||
                     await this.fillTextareaByPlaceholder('genre', options.styles);
      if (!filled) {
        // Fallback: fill the second visible textarea (styles is after lyrics in custom mode)
        const textareas = await page.$$('textarea');
        const visible = [];
        for (const ta of textareas) {
          const isVisible = await ta.evaluate(el => {
            const cs = getComputedStyle(el as HTMLElement);
            return cs.visibility !== 'hidden' && cs.display !== 'none';
          });
          if (isVisible) visible.push(ta);
        }
        if (visible.length >= 2) {
          await visible[1].click();
          await visible[1].type(options.styles!);
        }
      }
      await this.delay(800);
    }

    // 3. Expand Advanced Options section if needed
    if (options.excludeStyles || options.vocalGender ||
        options.weirdness !== undefined || options.styleInfluence !== undefined ||
        options.lyricsMode) {
      console.log('   • Opening Advanced Options...');
      await this.expandSection('Advanced Options');
      await this.delay(1000);
    }

    // 4. Fill Exclude Styles
    if (options.excludeStyles) {
      console.log('   • Setting exclude styles...');
      await this.fillInputByPlaceholder('Exclude', options.excludeStyles);
      await this.delay(800);
    }

    // 5. Set Vocal Gender
    if (options.vocalGender) {
      console.log(`   • Setting vocal gender: ${options.vocalGender}...`);
      const genderText = options.vocalGender === 'male' ? 'Male' : 'Female';
      await this.clickButtonByText(genderText);
      await this.delay(800);
    }

    // 6. Set Lyrics Mode
    if (options.lyricsMode) {
      console.log(`   • Setting lyrics mode: ${options.lyricsMode}...`);
      const modeText = options.lyricsMode === 'auto' ? 'Auto' : 'Manual';
      await this.clickButtonByText(modeText);
      await this.delay(800);
    }

    // 7. Set Weirdness slider
    if (options.weirdness !== undefined && options.weirdness !== 50) {
      console.log(`   • Setting weirdness: ${options.weirdness}%...`);
      await this.setSliderByLabel('Weirdness', options.weirdness);
      await this.delay(800);
    }

    // 8. Set Style Influence slider
    if (options.styleInfluence !== undefined && options.styleInfluence !== 50) {
      console.log(`   • Setting style influence: ${options.styleInfluence}%...`);
      await this.setSliderByLabel('Style Influence', options.styleInfluence);
      await this.delay(800);
    }

    // 9. Set Title — auto-generate from prompt if not provided
    const title = options.title || options.prompt.substring(0, 60);
    console.log(`   • Setting title: "${title}"...`);
    await this.fillInputByPlaceholder('title', title);
    await this.delay(800);

    // 10. Set Instrumental if needed
    if (options.instrumental) {
      console.log('   • Setting instrumental...');
      await this.clickButtonByText('Instrumental');
      await this.delay(800);
    }

    console.log('   ✓ Custom mode options filled!');
  }

  private async selectModel(version: string): Promise<void> {
    const page = this.getPage();
    console.log(`🔧 Selecting model: ${version}...`);

    // Click the model version dropdown (button containing "v5", "v4", etc.)
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const modelBtn = btns.find(b => /^v\d/.test(b.textContent?.trim() || ''));
      if (modelBtn) { modelBtn.click(); return true; }
      return false;
    });

    if (!clicked) {
      console.log('   ⚠️  Model selector not found, using default');
      return;
    }
    await this.delay(500);

    // Click the desired version from the dropdown
    const selected = await page.evaluate((ver: string) => {
      // Look for menu items / options containing the version string
      const items = document.querySelectorAll('[role="menuitem"], [role="option"], [data-value], button');
      for (const item of Array.from(items)) {
        const text = item.textContent?.trim() || '';
        if (text.toLowerCase().includes(ver.toLowerCase())) {
          (item as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, version);

    if (selected) {
      console.log(`   ✓ Model set to ${version}`);
    } else {
      console.log(`   ⚠️  Model "${version}" not found in dropdown`);
    }
    await this.delay(300);
  }

  private async selectPersona(name: string): Promise<void> {
    const page = this.getPage();
    console.log(`👤 Selecting persona: ${name}...`);

    // Click "+ Persona" button
    const clicked = await this.clickButtonByText('Persona');
    if (!clicked) {
      console.log('   ⚠️  Persona button not found');
      return;
    }
    await this.delay(1000);

    // Find and click the persona by name in the list/modal that appears
    const selected = await page.evaluate((personaName: string) => {
      const items = document.querySelectorAll('button, [role="option"], [role="menuitem"], a');
      for (const item of Array.from(items)) {
        const text = item.textContent?.trim() || '';
        if (text.toLowerCase().includes(personaName.toLowerCase())) {
          (item as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, name);

    if (selected) {
      console.log(`   ✓ Persona "${name}" selected`);
    } else {
      console.log(`   ⚠️  Persona "${name}" not found`);
    }
    await this.delay(500);
  }

  private async clickInspoChips(tags: string[]): Promise<void> {
    const page = this.getPage();
    console.log(`💡 Clicking inspiration chips: ${tags.join(', ')}...`);

    for (const tag of tags) {
      const clicked = await page.evaluate((chipText: string) => {
        // Inspo chips are buttons with "+" icon and the tag text
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const text = btn.textContent?.trim() || '';
          if (text.toLowerCase().includes(chipText.toLowerCase()) && btn.offsetWidth > 0) {
            btn.click();
            return true;
          }
        }
        return false;
      }, tag);

      if (clicked) {
        console.log(`   ✓ Added: ${tag}`);
      } else {
        console.log(`   ⚠️  Chip not found: ${tag}`);
      }
      await this.delay(300);
    }
  }

  /**
   * Wait for a Suno context menu to render, then click the item matching `text`.
   * Suno renders context menus as React portals — they appear asynchronously.
   * Items use the class `context-menu-button`.
   */
  private async waitAndClickContextMenuItem(text: string, timeout: number = 10000): Promise<boolean> {
    const page = this.getPage();
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const result = await page.evaluate((searchText: string) => {
        const items = document.querySelectorAll('button.context-menu-button');
        const visible: string[] = [];
        for (const item of Array.from(items)) {
          const el = item as HTMLElement;
          if (el.offsetWidth > 0) {
            const itemText = (el.textContent || '').trim();
            visible.push(itemText);
            if (itemText.includes(searchText)) {
              el.click();
              return { clicked: true, items: visible };
            }
          }
        }
        return { clicked: false, items: visible };
      }, text);

      if (result.clicked) {
        console.log(`   • Clicked "${text}" (menu had: ${result.items.join(', ')})`);
        return true;
      }

      if (result.items.length > 0) {
        // Menu is open but doesn't have our item
        console.log(`   ⚠️  Menu items found: [${result.items.join(', ')}] — no "${text}"`);
        return false;
      }

      await this.delay(500);
    }
    return false;
  }

  private async switchToCustomMode(): Promise<void> {
    const page = this.getPage();
    console.log('🔧 Switching to Custom mode...');
    await this.clickButtonByText('Custom');
    await this.delay(2000);
  }

  /**
   * Click the song-specific "..." context menu button on a song page.
   *
   * Suno has multiple buttons with aria-label="More menu contents":
   *   - Song context menu: has data-context-menu-trigger attribute
   *   - Profile/playbar menus: no data-context-menu-trigger
   *
   * The song menu button has no visible text — just a three-dot SVG icon
   * inside a rounded pill (bg-background-tertiary, rounded-full).
   */
  private async clickSongMenuButton(): Promise<void> {
    const page = this.getPage();
    const clicked = await page.evaluate(() => {
      // Primary: aria-label="More menu contents" + data-context-menu-trigger (song context menu)
      const ctxBtn = document.querySelector(
        'button[aria-label="More menu contents"][data-context-menu-trigger]'
      ) as HTMLButtonElement | null;
      if (ctxBtn && ctxBtn.offsetWidth > 0) {
        ctxBtn.click();
        return 'context-menu-trigger';
      }

      // Fallback: any button with aria-label="More menu contents"
      const buttons = Array.from(document.querySelectorAll('button[aria-label="More menu contents"]')) as HTMLButtonElement[];
      for (const btn of buttons) {
        if (btn.offsetWidth > 0) {
          btn.click();
          return 'aria-fallback';
        }
      }

      return null;
    });

    if (!clicked) throw new Error('Could not find song menu button ("...")');
    console.log(`   (matched via: ${clicked})`);
  }

  /**
   * Click the first visible interactive element containing the given text.
   * Searches buttons, links, menu items, and role="button" elements.
   */
  private async clickVisibleText(text: string): Promise<boolean> {
    const page = this.getPage();
    return page.evaluate((searchText: string) => {
      const selectors = 'button, a, [role="menuitem"], [role="option"], [role="button"]';
      const elements = document.querySelectorAll(selectors);

      // Prefer exact match first
      for (const el of Array.from(elements)) {
        const elText = (el.textContent || '').trim();
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (elText === searchText && rect.width > 0 && rect.height > 0) {
          (el as HTMLElement).click();
          return true;
        }
      }

      // Then try contains (case-insensitive)
      for (const el of Array.from(elements)) {
        const elText = (el.textContent || '').trim();
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (elText.toLowerCase().includes(searchText.toLowerCase())
            && rect.width > 0 && rect.height > 0) {
          (el as HTMLElement).click();
          return true;
        }
      }

      return false;
    }, text);
  }

  /**
   * Wait until text appears anywhere on the page.
   */
  private async waitForVisibleText(text: string, timeout: number): Promise<boolean> {
    const page = this.getPage();
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const found = await page.evaluate((searchText: string) => {
        return (document.body.textContent || '').includes(searchText);
      }, text);
      if (found) return true;
      await this.delay(1000);
    }
    return false;
  }

  /**
   * Download a file from a URL to a local path (follows redirects).
   */
  static async downloadFile(url: string, outputPath: string): Promise<void> {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);

      const makeRequest = (requestUrl: string) => {
        https.get(requestUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              makeRequest(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            fs.unlink(outputPath, () => {});
            reject(new Error(`Download failed: HTTP ${response.statusCode} for ${requestUrl}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastProgress = -1;

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const progress = Math.floor((downloadedBytes / totalBytes) * 100);
              if (progress !== lastProgress && progress % 10 === 0) {
                process.stdout.write(`\r   Progress: ${progress}%`);
                lastProgress = progress;
              }
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            if (totalBytes > 0) process.stdout.write('\n');
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(outputPath, () => {});
          reject(new Error(`Download error: ${err.message}`));
        });
      };

      makeRequest(url);
    });
  }

  private async getSongIds(): Promise<Set<string>> {
    const page = this.getPage();

    const ids = new Set<string>();
    const links = await page.$$('a[href*="/song/"]');
    
    for (const link of links) {
      const href = await link.evaluate(el => el.getAttribute('href'));
      if (href) {
        const match = href.match(/\/song\/([a-f0-9-]+)/);
        if (match) ids.add(match[1]);
      }
    }
    return ids;
  }

  private async waitForGeneration(
    initialSongIds: Set<string>,
    titleOrTimeout?: string | number,
    timeout: number = 300000
  ): Promise<Song[]> {
    const title = typeof titleOrTimeout === 'string' ? titleOrTimeout : 'Generated Song';
    const actualTimeout = typeof titleOrTimeout === 'number' ? titleOrTimeout : timeout;

    const page = this.getPage();
    const startTime = Date.now();
    console.log('⏳ Waiting for generation (up to 5 minutes)...');

    let detected = false;
    let checkCount = 0;

    while (Date.now() - startTime < actualTimeout) {
      await this.delay(10000);
      checkCount++;
      process.stdout.write('.');

      // Check for new songs that have a visible duration (= finished rendering)
      // Duration text is in the parent container, not the <a> tag itself
      const completedNewIds = await page.evaluate((knownIds: string[]) => {
        const known = new Set(knownIds);
        const completed: string[] = [];

        const songLinks = document.querySelectorAll('a[href*="/song/"]');
        for (const link of Array.from(songLinks)) {
          const href = link.getAttribute('href') || '';
          const match = href.match(/\/song\/([a-f0-9-]+)/);
          if (!match) continue;

          const id = match[1];
          if (known.has(id)) continue;

          // Walk up to find the song card container (duration is ~5 levels up)
          let container: HTMLElement | null = link as HTMLElement;
          for (let i = 0; i < 6; i++) {
            if (container.parentElement) container = container.parentElement;
          }
          const containerText = container?.textContent || '';
          const hasDuration = /\d+:\d{2}/.test(containerText);
          if (hasDuration) {
            completed.push(id);
          }
        }
        return completed;
      }, [...initialSongIds]);

      if (completedNewIds.length >= 1 && !detected) {
        detected = true;
        console.log(`\n   🎵 ${completedNewIds.length} song(s) finished rendering...`);
      }

      // Wait for at least 2 completed songs (Suno generates pairs) or stable for 2 checks
      if (completedNewIds.length >= 2) {
        console.log(`✅ Generated ${completedNewIds.length} song(s)!`);
        return this.buildSongResults(completedNewIds, title);
      }

      // If we've been waiting a while and have at least 1, accept it
      if (completedNewIds.length >= 1 && Date.now() - startTime > 180000) {
        console.log(`✅ Generated ${completedNewIds.length} song(s)!`);
        return this.buildSongResults(completedNewIds, title);
      }
    }

    console.log(`\n❌ Timeout after ${checkCount} checks`);
    throw new Error('Generation timeout - songs may still be processing. Check Suno.com manually.');
  }

  private buildSongResults(ids: string[], title: string = 'Generated Song'): Song[] {
    const results = ids.slice(0, 2);
    return results.map((id, i) => ({
      id,
      title: results.length > 1 ? `${title} (${i + 1})` : title,
      duration: '',
      styles: '',
      model: '',
      createdAt: new Date(),
      url: `https://suno.com/song/${id}`
    }));
  }
}
