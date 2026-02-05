export type GenerationMode = 'simple' | 'custom';
export type SampleType = 'one-shot' | 'loop' | 'effect';
export type DownloadFormat = 'mp3' | 'wav' | 'video';
export type VocalGender = 'male' | 'female';
export type LyricsMode = 'manual' | 'auto';
export type ModelVersion = 'v5' | 'v4.5' | 'v4' | 'v3.5' | 'v3' | 'v2';

export interface GenerateOptions {
  /** Main prompt/description for the song */
  prompt: string;

  /** Generation mode: simple (prompt only) or custom (full control) */
  mode: GenerationMode;

  /** Instrumental only - no vocals */
  instrumental: boolean;

  /** Model version to use */
  model: ModelVersion;

  /** Path to audio file for reference/inspiration */
  audioPath?: string;

  /** Persona name to use (custom mode) */
  persona?: string;

  /** Inspiration style tags to click (e.g., ["booming 808s", "epic pop"]) */
  inspo?: string[];

  // === Custom Mode Options ===

  /** Custom lyrics text */
  lyrics?: string;

  /** Style tags (e.g., "jazz, piano, upbeat") */
  styles?: string;

  /** Styles to exclude */
  excludeStyles?: string;

  /** Song title (auto-generated from prompt if not provided, custom mode only) */
  title?: string;

  /** Vocal gender preference */
  vocalGender?: VocalGender;

  /** Lyrics mode: manual (use provided) or auto (AI generates) */
  lyricsMode?: LyricsMode;

  /** Weirdness/creativity level 0-100 (default 50) */
  weirdness?: number;

  /** Style influence strength 0-100 (default 50) */
  styleInfluence?: number;
}

export interface SampleOptions {
  /** Description of the sound/sample */
  prompt: string;

  /** Sample type: one-shot or loop */
  type: SampleType;

  /** BPM (1-300) - only for loops */
  bpm?: number;

  /** Musical key (e.g., "C", "D#", "Am") */
  key?: string;
}

export interface Song {
  id: string;
  title: string;
  duration: string | number;
  styles: string;
  model: string;
  createdAt: Date;
  url: string;

  // Extended metadata (optional, from getSongDetails())
  prompt?: string;
  plays?: number;
  likes?: number;
  isPublic?: boolean;
  audioUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
}

export interface SunoConfig {
  /** Browser profile directory */
  userDataDir?: string;

  /** Directory for downloads */
  downloadDir: string;

  /** Generation timeout in milliseconds */
  timeout: number;
}

export const DEFAULT_CONFIG: SunoConfig = {
  downloadDir: process.env.HOME + '/Downloads',
  timeout: 180000, // 3 minutes for generation
};

/** Default values for generation options */
export const DEFAULT_GENERATE_OPTIONS: Partial<GenerateOptions> = {
  mode: 'simple',
  instrumental: false,
  model: 'v5',
  weirdness: 50,
  styleInfluence: 50,
  lyricsMode: 'manual',
};
