/**
 * sunokit - Library exports
 *
 * Full Suno.com automation: songs, samples, audio upload, custom mode
 *
 * ```typescript
 * import { SunoClient, downloadSong, generateSong } from 'sunokit';
 *
 * // Quick download (no browser needed)
 * await downloadSong('song-uuid', './output.mp3');
 *
 * // Generate with custom options
 * const songs = await generateSong('epic orchestra', {
 *   output: './epic.mp3',
 *   styles: 'orchestral, cinematic',
 *   instrumental: true,
 *   headless: true,
 * });
 * ```
 */

export { SunoClient } from './client';
export {
  GenerateOptions,
  SampleOptions,
  Song,
  DownloadFormat,
  GenerationMode,
  SampleType,
  ModelVersion,
  VocalGender,
  LyricsMode,
  SunoConfig,
  DEFAULT_CONFIG,
  DEFAULT_GENERATE_OPTIONS,
} from './types';
export {
  SunoError,
  AuthenticationError,
  GenerationTimeoutError,
  RateLimitError,
  ElementNotFoundError,
  BrowserError,
  ValidationError,
  isSunoError,
  getErrorGuidance,
} from './errors';
export {
  SunoBrowser,
  BrowserPage,
  BrowserElement,
  CDPSession,
} from './browser';

/**
 * Quick download — uses CDN for mp3/video, browser session for WAV
 * (Suno's CDN doesn't serve WAV; it requires authenticated UI flow)
 */
export async function downloadSong(
  songId: string,
  outputPath: string,
  format: 'mp3' | 'wav' | 'video' = 'wav'
): Promise<void> {
  const { SunoClient } = await import('./client');

  if (format === 'wav') {
    // WAV requires authenticated browser session
    const client = new SunoClient();
    try {
      await client.connect({ headless: true });
      await client.downloadBrowser(songId, outputPath, 'wav');
    } finally {
      await client.disconnect();
    }
  } else {
    return SunoClient.downloadCDN(songId, outputPath, format);
  }
}

/**
 * Quick song generation with all options
 */
export async function generateSong(
  prompt: string,
  options: {
    output?: string;
    format?: 'mp3' | 'wav' | 'video';
    instrumental?: boolean;
    headless?: boolean;
    audioPath?: string;
    styles?: string;
    excludeStyles?: string;
    lyrics?: string;
    title?: string;
    vocalGender?: 'male' | 'female';
    weirdness?: number;
    styleInfluence?: number;
  } = {}
): Promise<{ id: string; url: string; outputPath?: string }[]> {
  const { SunoClient } = await import('./client');
  const client = new SunoClient();

  const hasCustomOptions = options.styles || options.excludeStyles || options.lyrics ||
                           options.title || options.vocalGender ||
                           options.weirdness !== undefined || options.styleInfluence !== undefined;

  try {
    await client.connect({ headless: options.headless });
    const songs = await client.generate({
      prompt,
      mode: hasCustomOptions ? 'custom' : 'simple',
      instrumental: options.instrumental || false,
      model: 'v5',
      audioPath: options.audioPath,
      styles: options.styles,
      excludeStyles: options.excludeStyles,
      lyrics: options.lyrics,
      title: options.title,
      vocalGender: options.vocalGender,
      weirdness: options.weirdness,
      styleInfluence: options.styleInfluence,
    });

    const results: { id: string; url: string; outputPath?: string }[] = [];
    const downloadFormat = options.format || 'wav';

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      let outputPath: string | undefined;

      if (options.output) {
        outputPath = songs.length > 1
          ? options.output.replace(/(\.\w+)$/, `-${i + 1}$1`)
          : options.output;

        if (downloadFormat === 'wav') {
          // WAV requires authenticated browser session (CDN returns 403 for wav)
          await client.downloadBrowser(song.id, outputPath, 'wav');
        } else {
          await SunoClient.downloadCDN(song.id, outputPath, downloadFormat, { quiet: true });
        }
      }

      results.push({ id: song.id, url: song.url, outputPath });
    }

    return results;
  } finally {
    await client.disconnect();
  }
}

/**
 * Quick sample generation (one-shots, loops)
 */
export async function generateSample(
  description: string,
  options: {
    output?: string;
    format?: 'mp3' | 'wav';
    type?: 'one-shot' | 'loop';
    bpm?: number;
    key?: string;
    headless?: boolean;
  } = {}
): Promise<{ id: string; url: string; outputPath?: string }[]> {
  const { SunoClient } = await import('./client');
  const client = new SunoClient();

  try {
    await client.connect({ headless: options.headless });
    const songs = await client.generateSample({
      prompt: description,
      type: options.type || 'one-shot',
      bpm: options.bpm,
      key: options.key,
    });

    const results: { id: string; url: string; outputPath?: string }[] = [];
    const downloadFormat = options.format || 'wav';

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      let outputPath: string | undefined;

      if (options.output) {
        outputPath = songs.length > 1
          ? options.output.replace(/(\.\w+)$/, `-${i + 1}$1`)
          : options.output;

        if (downloadFormat === 'wav') {
          await client.downloadBrowser(song.id, outputPath, 'wav');
        } else {
          await SunoClient.downloadCDN(song.id, outputPath, downloadFormat, { quiet: true });
        }
      }

      results.push({ id: song.id, url: song.url, outputPath });
    }

    return results;
  } finally {
    await client.disconnect();
  }
}
