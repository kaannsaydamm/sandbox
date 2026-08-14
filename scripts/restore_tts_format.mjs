import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root='node_modules/edge-tts-universal';
const good='audio-24khz-48kbitrate-mono-mp3';
const bad='audio-16khz-32kbitrate-mono-mp3';
let found=0;
function walk(dir){for(const name of readdirSync(dir)){const p=join(dir,name);const s=statSync(p);if(s.isDirectory()){walk(p);continue;}if(!/\.(js|mjs|cjs|ts)$/.test(name))continue;let x=readFileSync(p,'utf8');if(x.includes(bad)){x=x.split(bad).join(good);writeFileSync(p,x);found++;}}}
walk(root); console.log(`restored neural TTS format in ${found} cached files`);
