import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEFAULT_GENERATE_OPTIONS,
  type GenerateOptions,
  type SampleOptions,
  type Song,
  type SunoConfig,
  type DownloadFormat,
  type GenerationMode,
  type SampleType,
  type ModelVersion,
  type VocalGender,
  type LyricsMode,
} from '../src/types';

describe('DEFAULT_CONFIG', () => {
  it('has a download directory under $HOME', () => {
    expect(DEFAULT_CONFIG.downloadDir).toContain('/Downloads');
  });

  it('has a 3 minute timeout', () => {
    expect(DEFAULT_CONFIG.timeout).toBe(180000);
  });

  it('has no default userDataDir', () => {
    expect(DEFAULT_CONFIG.userDataDir).toBeUndefined();
  });
});

describe('DEFAULT_GENERATE_OPTIONS', () => {
  it('defaults to simple mode', () => {
    expect(DEFAULT_GENERATE_OPTIONS.mode).toBe('simple');
  });

  it('defaults to non-instrumental', () => {
    expect(DEFAULT_GENERATE_OPTIONS.instrumental).toBe(false);
  });

  it('defaults to v5 model', () => {
    expect(DEFAULT_GENERATE_OPTIONS.model).toBe('v5');
  });

  it('defaults weirdness to 50', () => {
    expect(DEFAULT_GENERATE_OPTIONS.weirdness).toBe(50);
  });

  it('defaults styleInfluence to 50', () => {
    expect(DEFAULT_GENERATE_OPTIONS.styleInfluence).toBe(50);
  });

  it('defaults lyricsMode to manual', () => {
    expect(DEFAULT_GENERATE_OPTIONS.lyricsMode).toBe('manual');
  });
});

describe('type safety', () => {
  it('GenerateOptions requires prompt, mode, instrumental, model', () => {
    const opts: GenerateOptions = {
      prompt: 'test song',
      mode: 'simple',
      instrumental: false,
      model: 'v5',
    };
    expect(opts.prompt).toBe('test song');
    expect(opts.mode).toBe('simple');
  });

  it('GenerateOptions accepts all custom mode fields', () => {
    const opts: GenerateOptions = {
      prompt: 'test',
      mode: 'custom',
      instrumental: true,
      model: 'v4',
      audioPath: '/path/to/audio.mp3',
      persona: 'My Persona',
      inspo: ['epic pop', 'booming 808s'],
      lyrics: 'verse 1...',
      styles: 'jazz, piano',
      excludeStyles: 'metal',
      title: 'My Song',
      vocalGender: 'female',
      lyricsMode: 'auto',
      weirdness: 75,
      styleInfluence: 30,
    };
    expect(opts.persona).toBe('My Persona');
    expect(opts.inspo).toEqual(['epic pop', 'booming 808s']);
    expect(opts.vocalGender).toBe('female');
  });

  it('SampleOptions requires prompt and type', () => {
    const opts: SampleOptions = {
      prompt: 'punchy kick drum',
      type: 'one-shot',
    };
    expect(opts.prompt).toBe('punchy kick drum');
  });

  it('SampleOptions accepts optional bpm and key', () => {
    const opts: SampleOptions = {
      prompt: 'hi-hat loop',
      type: 'loop',
      bpm: 120,
      key: 'C',
    };
    expect(opts.bpm).toBe(120);
    expect(opts.key).toBe('C');
  });

  it('Song interface includes all fields', () => {
    const song: Song = {
      id: 'abc-123',
      title: 'Test Song',
      duration: '3:30',
      styles: 'pop, electronic',
      model: 'v5',
      createdAt: new Date('2024-01-01'),
      url: 'https://suno.com/song/abc-123',
    };
    expect(song.id).toBe('abc-123');
    expect(song.url).toContain('/song/');
  });

  it('Song accepts optional extended metadata', () => {
    const song: Song = {
      id: 'abc-123',
      title: 'Test',
      duration: 210,
      styles: '',
      model: 'v5',
      createdAt: new Date(),
      url: 'https://suno.com/song/abc-123',
      prompt: 'a test song',
      plays: 100,
      likes: 42,
      isPublic: true,
      audioUrl: 'https://cdn1.suno.ai/abc-123.mp3',
      videoUrl: 'https://cdn1.suno.ai/abc-123.mp4',
      imageUrl: 'https://cdn1.suno.ai/abc-123.png',
    };
    expect(song.plays).toBe(100);
    expect(song.audioUrl).toContain('.mp3');
  });

  it('DownloadFormat covers mp3, wav, video', () => {
    const formats: DownloadFormat[] = ['mp3', 'wav', 'video'];
    expect(formats).toHaveLength(3);
  });

  it('ModelVersion covers all versions', () => {
    const versions: ModelVersion[] = ['v5', 'v4.5', 'v4', 'v3.5', 'v3', 'v2'];
    expect(versions).toHaveLength(6);
  });

  it('merging defaults with user options works correctly', () => {
    const userOpts: Partial<GenerateOptions> = {
      prompt: 'epic song',
      mode: 'custom',
      weirdness: 80,
    };
    const merged = { ...DEFAULT_GENERATE_OPTIONS, ...userOpts };
    expect(merged.prompt).toBe('epic song');
    expect(merged.mode).toBe('custom');
    expect(merged.weirdness).toBe(80);
    // Defaults preserved for unset fields
    expect(merged.instrumental).toBe(false);
    expect(merged.model).toBe('v5');
    expect(merged.styleInfluence).toBe(50);
  });
});
