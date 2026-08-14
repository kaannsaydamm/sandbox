import fs from 'fs/promises';
import path from 'path';
import { EdgeTTS } from 'edge-tts-universal';

const manifest = JSON.parse(await fs.readFile('tts_manifest.json', 'utf8'));
await fs.mkdir('tts_out', { recursive: true });

for (const item of manifest) {
  const rate = `${item.rate >= 0 ? '+' : ''}${item.rate ?? 0}%`;
  const pitch = `${item.pitch >= 0 ? '+' : ''}${item.pitch ?? 0}Hz`;
  const tts = new EdgeTTS(item.text, item.voice, { rate, pitch, volume: '+0%' });
  const result = await tts.synthesize();
  const buf = Buffer.from(await result.audio.arrayBuffer());
  const out = path.join('tts_out', `${item.id}.mp3`);
  await fs.writeFile(out, buf);
  console.log(`${item.id}: ${buf.length} bytes -> ${out}`);
}
