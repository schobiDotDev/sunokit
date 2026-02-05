# sunokit

Generate AI music from the command line using [Suno.com](https://suno.com).

CLI tool and Node.js library with full Suno feature support: songs, samples, custom mode, audio references, personas, and direct CDN downloads.

## Disclaimer

**Unofficial** tool using browser automation. Not affiliated with Suno.

- May violate Suno's Terms of Service
- Your account could potentially be suspended
- Use at your own risk
- For educational and personal use only

## Features

- **Song generation** — simple prompts or full custom mode (styles, lyrics, vocal gender, weirdness)
- **Sample generation** — one-shots, loops, effects with BPM/key control
- **Audio upload** — use your own audio as reference
- **Personas & inspiration** — select personas, click inspo style chips
- **Model selection** — v5, v4.5, v4, v3.5, v3, v2
- **CDN download** — MP3, WAV, or video — no browser needed
- **Persistent login** — authenticate once, session saved
- **Headless mode** — run without browser window
- **Library exports** — use programmatically in your projects
- **Bot detection bypass** — rebrowser-puppeteer-core with real Chrome

## Installation

```bash
npm install sunokit
```

Or from source:

```bash
git clone https://github.com/schobiDotDev/sunokit.git
cd sunokit
npm install
npm run build
npm link  # makes 'sunokit' command available globally
```

**Requires**: Node.js >= 18, Google Chrome installed.

## Quick Start

```bash
# First run — browser opens for login
sunokit credits

# Generate a song
sunokit generate "upbeat jazz about coffee" -o jazz.wav

# Generate with custom styles
sunokit generate "epic track" --styles "orchestral, cinematic" -o epic.wav

# Generate a sample
sunokit sample "punchy kick drum" -o kick.wav

# Download existing song by ID
sunokit download 729b4292-610f-4169-b3bc-3cd92aa3968a -o song.wav
```

## Commands

### `sunokit generate <prompt>`

```bash
# Simple mode
sunokit generate "chill lo-fi beats" -o lofi.wav
sunokit generate "rock anthem" -i -o rock.wav  # instrumental

# With audio reference
sunokit generate "similar vibe" --audio ./reference.mp3 -o similar.wav

# Custom mode
sunokit generate "love song" \
  --styles "acoustic, emotional, piano" \
  --lyrics "Verse 1: In the morning light..." \
  --vocal-gender female \
  --weirdness 30 \
  --title "Morning Light" \
  -o love.wav

# Persona + inspiration chips
sunokit generate "summer vibes" \
  --persona "My Persona" \
  --inspo "booming 808s, epic pop" \
  -o summer.wav

# Different model
sunokit generate "retro synth" --model v4 -o retro.wav

# Headless (no browser window)
sunokit generate "ambient" --headless -o ambient.wav
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output` | Download path | - |
| `-f, --format` | `mp3`, `wav`, `video` | `wav` |
| `-i, --instrumental` | No vocals | `false` |
| `-a, --audio` | Audio file for reference | - |
| `--headless` | No browser window | `false` |
| `-m, --mode` | `simple` or `custom` | `simple` |
| `--model` | `v5`, `v4.5`, `v4`, `v3.5`, `v3`, `v2` | `v5` |
| `--persona` | Persona name (custom mode) | - |
| `--inspo` | Inspiration tags, comma-separated | - |
| `-l, --lyrics` | Custom lyrics | - |
| `-s, --styles` | Style tags | - |
| `--exclude-styles` | Styles to avoid | - |
| `--title` | Song title | auto from prompt |
| `--vocal-gender` | `male` / `female` | auto |
| `--lyrics-mode` | `manual` / `auto` | `manual` |
| `--weirdness` | 0-100 | `50` |
| `--style-influence` | 0-100 | `50` |

### `sunokit sample <description>`

```bash
sunokit sample "punchy kick drum" -o kick.wav
sunokit sample "funky bass loop" -t loop --bpm 120 -o bass.wav
sunokit sample "sci-fi laser" -o laser.wav
```

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output` | Download path | - |
| `-f, --format` | `mp3`, `wav` | `wav` |
| `-t, --type` | `one-shot`, `loop`, `effect` | `one-shot` |
| `--bpm` | BPM for loops (1-300) | - |
| `--key` | Musical key (e.g., C, D#, Am) | - |
| `--headless` | No browser window | `false` |

### `sunokit download <song-id>`

Downloads directly from CDN — no browser or auth needed.

```bash
sunokit download <uuid> -o song.wav
sunokit download <uuid> -f mp3 -o song.mp3
sunokit download <uuid> -f video -o song.mp4
```

### `sunokit list` / `sunokit credits`

```bash
sunokit list          # list songs in workspace
sunokit list -n 50    # more songs
sunokit credits       # check remaining credits
```

## Library Usage

```typescript
import { SunoClient, downloadSong, generateSong, generateSample } from 'sunokit';

// Quick download (no browser needed)
await downloadSong('song-uuid', './output.wav');

// Quick generation
const songs = await generateSong('epic orchestra', {
  output: './epic.wav',
  styles: 'orchestral, cinematic',
  instrumental: true,
  headless: true,
});

// Quick sample
const samples = await generateSample('punchy kick', {
  output: './kick.wav',
  type: 'one-shot',
  headless: true,
});

// Full client control
const client = new SunoClient();
await client.connect({ headless: true });

const songs = await client.generate({
  prompt: 'epic track',
  mode: 'custom',
  instrumental: true,
  model: 'v5',
  styles: 'orchestral, epic',
  weirdness: 70,
});

await client.disconnect();
```

## Authentication

On first run, Chrome opens for login (Google/Discord/etc). Session persists in `~/.sunokit/browser-profile/`.

To reset: `rm -rf ~/.sunokit/browser-profile`

## Testing

```bash
npm test              # unit tests (85 tests, no browser)
npm run test:smoke    # DOM smoke tests against live suno.com (~7s)
```

The smoke test verifies all DOM selectors still match Suno's UI — run it when generation breaks to check if Suno changed their frontend.

## Credits

- Songs: ~10 credits (generates 2 variants)
- Samples: ~5 credits
- Free tier: 50 credits/day

## Troubleshooting

**"Not logged in"** — Delete browser profile and re-login:
```bash
rm -rf ~/.sunokit/browser-profile
```

**Generation timeout** — Suno may be slow. Check credits, try `--headless`, or try off-peak hours.

**Command not found** — Run `npm link` after building.

## License

MIT
