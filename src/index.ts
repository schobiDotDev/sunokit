#!/usr/bin/env node
import { Command } from 'commander';
import { SunoClient } from './client';
import { GenerateOptions, DownloadFormat, VocalGender, LyricsMode, ModelVersion, SampleType } from './types';

const program = new Command();

program
  .name('sunokit')
  .description('CLI for Suno.com music generation via browser automation')
  .version('1.0.0');

// Generate command with all options
program
  .command('generate')
  .description('Generate a song from a text prompt')
  .argument('<prompt>', 'Song description or lyrics prompt')
  .option('-o, --output <path>', 'Download output path (auto-downloads after generation)')
  .option('-f, --format <format>', 'Download format: mp3, wav, video', 'wav')
  .option('-i, --instrumental', 'Instrumental only (no vocals)')
  .option('-m, --mode <mode>', 'Generation mode: simple or custom', 'simple')
  .option('--model <model>', 'Model: v5, v4.5, v4, v3.5, v3, v2', 'v5')
  .option('--headless', 'Run browser in headless mode (no window)')
  // Audio reference
  .option('-a, --audio <path>', 'Audio file to use as reference/inspiration')
  // Persona & Inspiration
  .option('--persona <name>', 'Persona to use (custom mode)')
  .option('--inspo <tags>', 'Inspiration style tags, comma-separated (e.g., "booming 808s,epic pop")')
  // Custom mode options
  .option('-l, --lyrics <lyrics>', 'Custom lyrics text')
  .option('-s, --styles <styles>', 'Style tags, comma-separated (custom mode)')
  .option('--exclude-styles <styles>', 'Styles to exclude (custom mode)')
  .option('--title <title>', 'Song title (auto-generated from prompt if not set)')
  .option('--vocal-gender <gender>', 'Vocal gender: male or female (custom mode)')
  .option('--lyrics-mode <mode>', 'Lyrics mode: manual or auto (custom mode)', 'manual')
  .option('--weirdness <percent>', 'Weirdness/creativity 0-100 (custom mode)', '50')
  .option('--style-influence <percent>', 'Style influence strength 0-100 (custom mode)', '50')
  .action(async (prompt, options) => {
    const client = new SunoClient();

    try {
      await client.connect({ headless: options.headless });

      // Auto-switch to custom mode if custom options are provided
      const hasCustomOptions = options.styles || options.excludeStyles ||
                               options.title || options.vocalGender || options.persona ||
                               options.weirdness !== '50' || options.styleInfluence !== '50';

      const mode = options.mode === 'custom' || hasCustomOptions ? 'custom' : 'simple';

      const generateOptions: GenerateOptions = {
        prompt,
        mode,
        instrumental: options.instrumental || false,
        model: options.model as ModelVersion,
        audioPath: options.audio,
        persona: options.persona,
        inspo: options.inspo ? options.inspo.split(',').map((s: string) => s.trim()) : undefined,
        // Custom mode options
        lyrics: options.lyrics,
        styles: options.styles,
        excludeStyles: options.excludeStyles,
        title: options.title,
        vocalGender: options.vocalGender as VocalGender,
        lyricsMode: options.lyricsMode as LyricsMode,
        weirdness: parseInt(options.weirdness),
        styleInfluence: parseInt(options.styleInfluence),
      };

      console.log(`\n🎵 Generating: "${prompt}"`);
      if (mode === 'custom') {
        console.log(`   Mode: Custom`);
        if (options.styles) console.log(`   Styles: ${options.styles}`);
        if (options.persona) console.log(`   Persona: ${options.persona}`);
      }
      if (options.inspo) console.log(`   Inspo: ${options.inspo}`);
      if (options.audio) console.log(`   Audio reference: ${options.audio}`);
      if (options.instrumental) console.log(`   Instrumental: Yes`);
      if (options.model !== 'v5') console.log(`   Model: ${options.model}`);
      console.log('');

      const songs = await client.generate(generateOptions);

      console.log(`\n📋 Generated ${songs.length} song(s):`);
      for (const song of songs) {
        console.log(`   • ${song.title}`);
        console.log(`     ${song.id}`);
        console.log(`     ${song.url}`);
      }

      // Auto-download if output specified
      if (options.output && songs.length > 0) {
        console.log('');
        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          const outputPath = songs.length > 1
            ? options.output.replace(/(\.\w+)$/, `-${i + 1}$1`)
            : options.output;

          await SunoClient.downloadCDN(song.id, outputPath, options.format as DownloadFormat);
        }
      }

      console.log('\n✨ Done!\n');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await client.disconnect();
    }
  });

// Sample command for generating short sound samples
program
  .command('sample')
  .description('Generate a short sound sample (one-shot, loop, effect)')
  .argument('<description>', 'Description of the sound (e.g., "punchy kick drum")')
  .option('-o, --output <path>', 'Download output path')
  .option('-f, --format <format>', 'Download format: mp3, wav', 'wav')
  .option('-t, --type <type>', 'Sample type: one-shot, loop', 'one-shot')
  .option('--bpm <bpm>', 'BPM for loops (1-300)')
  .option('--key <key>', 'Musical key (e.g., C, D#, Am)')
  .option('--headless', 'Run browser in headless mode')
  .action(async (description, options) => {
    const client = new SunoClient();

    try {
      await client.connect({ headless: options.headless });

      console.log(`\n🔊 Generating sample: "${description}"`);
      console.log(`   Type: ${options.type}`);
      if (options.bpm) console.log(`   BPM: ${options.bpm}`);
      if (options.key) console.log(`   Key: ${options.key}`);
      console.log('');

      const songs = await client.generateSample({
        prompt: description,
        type: options.type as SampleType,
        bpm: options.bpm ? parseInt(options.bpm) : undefined,
        key: options.key,
      });

      console.log(`\n📋 Generated ${songs.length} sample(s):`);
      for (const song of songs) {
        console.log(`   • ${song.id}`);
        console.log(`     ${song.url}`);
      }

      if (options.output && songs.length > 0) {
        console.log('');
        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          const outputPath = songs.length > 1
            ? options.output.replace(/(\.\w+)$/, `-${i + 1}$1`)
            : options.output;

          await SunoClient.downloadCDN(song.id, outputPath, options.format as DownloadFormat);
        }
      }

      console.log('\n✨ Done!\n');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await client.disconnect();
    }
  });

// Download command
program
  .command('download')
  .description('Download an existing song by ID')
  .argument('<song-id>', 'Song ID (UUID from URL)')
  .option('-o, --output <path>', 'Output file path', './song.wav')
  .option('-f, --format <format>', 'Format: mp3, wav, video', 'wav')
  .option('-q, --quiet', 'Suppress progress output')
  .action(async (songId, options) => {
    try {
      await SunoClient.downloadCDN(songId, options.output, options.format as DownloadFormat, { quiet: options.quiet });
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List songs command
program
  .command('list')
  .description('List songs in your workspace')
  .option('-n, --limit <number>', 'Number of songs to list', '20')
  .option('--headless', 'Run browser in headless mode')
  .action(async (options) => {
    const client = new SunoClient();
    try {
      await client.connect({ headless: options.headless });
      const songs = await client.listSongs(parseInt(options.limit));

      console.log(`\n🎵 Songs in workspace:\n`);
      for (const song of songs) {
        console.log(`   ${song.title.substring(0, 40).padEnd(40)} ${song.id}`);
      }
      console.log('');
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await client.disconnect();
    }
  });

// Credits command
program
  .command('credits')
  .description('Check remaining credits')
  .option('--headless', 'Run browser in headless mode')
  .action(async (options) => {
    const client = new SunoClient();
    try {
      await client.connect({ headless: options.headless });
      const credits = await client.getCredits();
      console.log(`\n💳 Credits: ${credits}\n`);
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      await client.disconnect();
    }
  });

program.parse();
