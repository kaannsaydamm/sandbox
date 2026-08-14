import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'node_modules/edge-tts-universal';
const from = 'audio-24khz-48kbitrate-mono-mp3';
const to = 'audio-16khz-32kbitrate-mono-mp3';
let changed = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(js|mjs|cjs|ts)$/.test(name)) continue;
    const src = readFileSync(path, 'utf8');
    if (!src.includes(from)) continue;
    writeFileSync(path, src.split(from).join(to));
    changed += 1;
  }
}

walk(root);
console.log(`patched neural TTS bitrate in ${changed} files`);
if (!changed) process.exit(2);
