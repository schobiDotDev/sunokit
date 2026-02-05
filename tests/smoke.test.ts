/**
 * DOM Smoke Tests — Early warning system for Suno UI changes
 *
 * Launches a real browser, navigates to suno.com/create, and verifies
 * that the DOM selectors we depend on still exist. Does NOT generate
 * anything — zero credit cost.
 *
 * Run: npm run test:smoke
 *
 * There are two categories of checks:
 *   1. Hard assertions — elements that MUST be present (Create button, textareas)
 *   2. Diagnostic inventory — prints what's in the DOM so you can spot changes
 *
 * Suno's DOM varies between page loads (A/B testing, lazy rendering), so
 * only core elements get hard assertions. The inventory report is the main
 * value for maintenance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SunoBrowser, BrowserPage } from '../src/browser';

let browser: SunoBrowser;
let page: BrowserPage;
let isLoggedIn = false;

beforeAll(async () => {
  browser = new SunoBrowser();
  await browser.connect({ headless: true });

  const rawPage = browser.getPage();
  if (!rawPage) throw new Error('Browser did not provide a page');
  page = rawPage;

  await page.goto('https://suno.com/create', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  isLoggedIn = await page.evaluate(() => {
    const profileBtn = document.querySelector(
      '[aria-label*="Profile"], [aria-label*="profile"], button[aria-label*="menu button"]'
    );
    return !!profileBtn;
  });

  if (!isLoggedIn) {
    console.log('\n⚠️  Not logged in — auth-dependent checks will be skipped');
    console.log('   Run `suno credits` first to create a session\n');
  }
}, 45000);

afterAll(async () => {
  await browser.disconnect();
});

// ─── Hard Assertions: Core elements that must exist ────────────

describe('Page loads', () => {
  it('navigates to suno.com', () => {
    expect(page.url()).toContain('suno.com');
  });

  it('page has content', async () => {
    const html = await page.content();
    expect(html.length).toBeGreaterThan(1000);
  });
});

describe('Core create page elements', () => {
  it('has textareas on the page', async () => {
    if (!isLoggedIn) return;
    const textareas = await page.$$('textarea');
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('has a visible, usable textarea (prompt field)', async () => {
    if (!isLoggedIn) return;
    const textareas = await page.$$('textarea');
    let foundVisible = false;

    for (const ta of textareas) {
      const visible = await ta.evaluate((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        const rect = (el as HTMLElement).getBoundingClientRect();
        return (
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      if (visible) {
        foundVisible = true;
        break;
      }
    }
    expect(foundVisible).toBe(true);
  });

  it('has a Create button', async () => {
    if (!isLoggedIn) return;
    const hasCreate = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent?.includes('Create'));
    });
    expect(hasCreate).toBe(true);
  });

  it('has a Custom mode toggle', async () => {
    if (!isLoggedIn) return;
    const hasCustom = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent?.includes('Custom'));
    });
    expect(hasCustom).toBe(true);
  });

  it('has song links with /song/ href pattern', async () => {
    if (!isLoggedIn) return;
    const links = await page.$$('a[href*="/song/"]');
    if (links.length > 0) {
      const href = await links[0].evaluate((el) => el.getAttribute('href'));
      expect(href).toMatch(/\/song\/[a-f0-9-]+/);
    }
    // Zero songs is valid (empty workspace)
  });

  it('login detection selector works', async () => {
    if (!isLoggedIn) return;
    const hasProfile = await page.evaluate(() => {
      return !!document.querySelector(
        '[aria-label*="Profile"], [aria-label*="profile"], button[aria-label*="menu button"]'
      );
    });
    expect(hasProfile).toBe(true);
  });
});

// ─── Diagnostic Inventory: Reports what's in the DOM ───────────
// These tests always pass — their value is the console output.
// When Suno changes their UI, run `npm run test:smoke` and compare
// the inventory output to what client.ts expects.

describe('DOM inventory', () => {
  it('reports all textareas with placeholders and visibility', async () => {
    if (!isLoggedIn) { console.log('(skipped — not logged in)'); return; }

    const inventory = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('textarea')).map((ta) => {
        const cs = getComputedStyle(ta);
        const rect = ta.getBoundingClientRect();
        return {
          placeholder: ta.getAttribute('placeholder') || '(none)',
          visible: cs.visibility !== 'hidden' && cs.display !== 'none',
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        };
      });
    });

    console.log('\n📋 TEXTAREAS:');
    for (const ta of inventory) {
      const icon = ta.visible ? '✅' : '👻';
      console.log(`   ${icon} [${ta.size}] "${ta.placeholder}"`);
    }
  });

  it('reports all inputs with type, placeholder, and visibility', async () => {
    if (!isLoggedIn) { console.log('(skipped — not logged in)'); return; }

    const inventory = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map((inp) => {
        const cs = getComputedStyle(inp);
        return {
          type: inp.type,
          placeholder: inp.getAttribute('placeholder') || '(none)',
          visible: cs.visibility !== 'hidden' && cs.display !== 'none',
        };
      });
    });

    console.log('\n📋 INPUTS:');
    for (const inp of inventory) {
      const icon = inp.visible ? '✅' : '👻';
      console.log(`   ${icon} [${inp.type}] "${inp.placeholder}"`);
    }
  });

  it('reports all button labels', async () => {
    if (!isLoggedIn) { console.log('(skipped — not logged in)'); return; }

    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .map((b) => b.textContent?.trim() || '')
        .filter((t) => t.length > 0 && t.length < 50)
        .slice(0, 30); // Cap at 30 to avoid noise
    });

    console.log('\n📋 BUTTONS (first 30):');
    for (const label of buttons) {
      console.log(`   • "${label}"`);
    }
  });

  it('reports selector health for client.ts dependencies', async () => {
    if (!isLoggedIn) { console.log('(skipped — not logged in)'); return; }

    const health = await page.evaluate(() => {
      const checks: Record<string, boolean> = {};

      // Selectors client.ts depends on
      const btns = Array.from(document.querySelectorAll('button'));
      const textareas = Array.from(document.querySelectorAll('textarea'));

      checks['Create button'] = btns.some((b) => b.textContent?.includes('Create'));
      checks['Custom toggle'] = btns.some((b) => b.textContent?.includes('Custom'));
      checks['Instrumental toggle'] = btns.some((b) => b.textContent?.includes('Instrumental'));
      checks['Model selector (v*)'] = btns.some((b) => /^v\d/.test(b.textContent?.trim() || ''));
      checks['Visible textarea'] = textareas.some((ta) => {
        const cs = getComputedStyle(ta);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      checks['Lyrics textarea'] = textareas.some(
        (ta) => (ta.getAttribute('placeholder') || '').toLowerCase().includes('lyrics')
      );
      checks['Sound textarea'] = textareas.some(
        (ta) => (ta.getAttribute('placeholder') || '').toLowerCase().includes('sound')
      );
      checks['Exclude input'] = !!document.querySelector('input[placeholder*="Exclude" i]');
      checks['File input'] = !!document.querySelector('input[type="file"]');
      checks['Profile/login'] = !!document.querySelector(
        '[aria-label*="Profile"], [aria-label*="profile"], button[aria-label*="menu button"]'
      );
      checks['Song links'] = !!document.querySelector('a[href*="/song/"]');

      return checks;
    });

    console.log('\n🏥 SELECTOR HEALTH (client.ts dependencies):');
    let passing = 0;
    let total = 0;
    for (const [name, found] of Object.entries(health)) {
      total++;
      if (found) passing++;
      const icon = found ? '✅' : '❌';
      console.log(`   ${icon} ${name}`);
    }
    console.log(`\n   Score: ${passing}/${total} selectors found`);
  });
});
