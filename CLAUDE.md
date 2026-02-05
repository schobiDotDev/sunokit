# CLAUDE.md - sunokit

## Project Overview

CLI and library for generating music via Suno.com using browser automation.

## Quick Commands

```bash
sunokit generate "your prompt" -o output.wav
sunokit download <uuid> -o output.wav
sunokit list
sunokit credits
```

## Architecture

```
src/
├── index.ts    # CLI entry point (commander)
├── client.ts   # SunoClient — orchestrates browser automation
├── browser.ts  # SunoBrowser — Chrome launch, stealth, page/element wrappers
├── types.ts    # TypeScript interfaces and config
├── errors.ts   # Error classes with recovery guidance
└── lib.ts      # Library exports + convenience functions

tests/
├── types.test.ts     # Type defaults and config
├── errors.test.ts    # Error hierarchy and guidance
├── client.test.ts    # Client logic, regex patterns, URL construction
├── browser.test.ts   # Browser class, profile path
├── lib.test.ts       # Library exports and convenience functions
└── smoke.test.ts     # DOM smoke tests against live suno.com
```

## Key Components

### SunoBrowser (browser.ts)
- Launches real Chrome via `rebrowser-puppeteer-core` (patched CDP for bot evasion)
- Stealth measures: webdriver override, permissions mock, chrome.runtime shim
- Finds system Chrome (macOS/Linux/Windows)
- Session persists in `~/.sunokit/browser-profile/`

### SunoClient (client.ts)
- `connect(options)` — Launch browser, navigate to Suno, ensure logged in
- `generate(options)` — Fill form, click Create, wait for songs (simple or custom mode)
- `generateSample(options)` — Generate one-shots, loops, effects
- `listSongs(limit)` — Parse workspace for song links
- `getCredits()` — Parse page for credit count
- `downloadCDN(songId, path, format)` — Static CDN download (no browser)
- `disconnect()` — Close browser

### Library exports (lib.ts)
- `downloadSong(id, path, format)` — Quick download (no browser)
- `generateSong(prompt, options)` — Quick generation + download
- `generateSample(description, options)` — Quick sample generation

## How It Works

1. **Browser Automation**: rebrowser-puppeteer-core + real Chrome avoids bot detection
2. **Persistent Session**: Login saved in `~/.sunokit/browser-profile/`
3. **Generation**: Fills textarea, clicks Create, polls DOM for new song links (by ID tracking)
4. **Download**: Direct CDN at `https://cdn1.suno.ai/{uuid}.wav`

## Development

```bash
npm run build        # Compile TypeScript
npm run dev          # Run with tsx (hot reload)
npm test             # Unit tests (85 tests)
npm run test:smoke   # DOM smoke tests against live site
npm link             # Install CLI globally
```

## Notes

- First run requires manual login (session saved for future)
- Generation costs ~10 credits per run (2 songs)
- CDN download works without auth for all songs
- Headless mode works after first login
- Suno uses visibility:hidden textareas — code filters for visible ones only
- Suno caps visible songs in DOM — waitForGeneration tracks new IDs, not total count
