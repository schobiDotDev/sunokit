#!/usr/bin/env tsx
/**
 * Debug script for testing WAV download via browser.
 *
 * Usage:
 *   npx tsx scripts/debug-download.ts <song-uuid>
 *
 * Walks through each step with verbose logging:
 *   1. Connect browser
 *   2. Navigate to song page
 *   3. Inventory all buttons (to debug menu targeting)
 *   4. Click "More" menu
 *   5. Inventory menu items
 *   6. Click Download → WAV → Download File (with CDP interception)
 */

import { SunoClient } from '../src/client';
import * as fs from 'fs';
import * as path from 'path';

const songId = process.argv[2];
if (!songId) {
  console.error('Usage: npx tsx scripts/debug-download.ts <song-uuid>');
  process.exit(1);
}

const outputPath = path.resolve(`./debug-output-${songId.slice(0, 8)}.wav`);

async function main() {
  const client = new SunoClient();

  try {
    // ── Step 1: Connect ──────────────────────────────────────
    console.log('\n═══ Step 1: Connect browser ═══');
    await client.connect({ headless: false });
    console.log('✅ Connected\n');

    // ── Step 2: Download WAV via browser ──────────────────────
    console.log('═══ Step 2: Download WAV via browser ═══');
    console.log(`Output: ${outputPath}`);
    console.log('');

    await client.downloadBrowser(songId, outputPath, 'wav');

    // ── Verify ───────────────────────────────────────────────
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`\n✅ SUCCESS — File exists: ${outputPath}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      if (stats.size < 1000) {
        console.log('⚠️  WARNING: File is suspiciously small — might not be a valid WAV');
      }
    } else {
      console.log('\n❌ FAIL — Output file was not created');
    }

  } catch (err: any) {
    console.error(`\n❌ ERROR: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  } finally {
    console.log('\nDisconnecting...');
    await client.disconnect();
    console.log('Done.');
  }
}

main();
