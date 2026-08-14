import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { EdgeTTS } from 'edge-tts-universal';

const VOICES = new Set(['tr-TR-AhmetNeural', 'tr-TR-EmelNeural']);
const MANIFEST = JSON.parse(readFileSync(new URL('../tts_manifest.json', import.meta.url), 'utf8'));
const SEGMENTS = new Map(MANIFEST.map((segment) => [segment.id, segment]));

function clampNumber(raw, min, max, fallback = 0) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function transcodeOpus(input) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'libopus',
      '-b:a', '16k', '-vbr', 'on', '-compression_level', '10',
      '-f', 'ogg', 'pipe:1'
    ]);
    const out = []; const err = [];
    ff.stdout.on('data', d => out.push(d));
    ff.stderr.on('data', d => err.push(d));
    ff.on('error', reject);
    ff.on('close', code => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString() || `ffmpeg ${code}`)));
    ff.stdin.end(input);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'GET only'}); }
  const segment = SEGMENTS.get(String(req.query.id ?? ''));
  const text = String(segment?.text ?? req.query.text ?? '').trim();
  if (!text || text.length > 1800) return res.status(400).json({error:'text must be 1..1800 characters'});
  const requestedVoice = String(segment?.voice ?? req.query.voice ?? 'tr-TR-AhmetNeural');
  const voice = VOICES.has(requestedVoice) ? requestedVoice : 'tr-TR-AhmetNeural';
  const rate = clampNumber(segment?.rate ?? req.query.rate,-35,35,0);
  const pitch = clampNumber(segment?.pitch ?? req.query.pitch,-25,25,0);
  const encoding = String(req.query.encoding ?? 'binary');
  const compact = String(req.query.compact ?? '') === '1';
  try {
    const tts = new EdgeTTS(text, voice, { rate:`${rate>=0?'+':''}${rate}%`, pitch:`${pitch>=0?'+':''}${pitch}Hz`, volume:'+0%' });
    const result = await tts.synthesize();
    const original = Buffer.from(await result.audio.arrayBuffer());
    const audio = compact ? await transcodeOpus(original) : original;
    const mime = compact ? 'audio/ogg' : 'audio/mpeg';
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-ALUCLU-TTS-Voice',voice); res.setHeader('X-ALUCLU-TTS-Bytes',String(audio.length));
    if (encoding === 'base64') {
      const b64=audio.toString('base64'); const chunkSize=Math.trunc(clampNumber(req.query.chunk_size,1000,180000,60000)); const chunkCount=Math.ceil(b64.length/chunkSize);
      if (String(req.query.meta ?? '') === '1') return res.status(200).json({id:segment?.id??null,voice,compact,mime,bytes:audio.length,base64_length:b64.length,chunk_size:chunkSize,chunk_count:chunkCount});
      if (req.query.chunk !== undefined) { const index=Math.trunc(clampNumber(req.query.chunk,0,Math.max(0,chunkCount-1),0)); return res.status(200).json({id:segment?.id??null,voice,compact,mime,bytes:audio.length,base64_length:b64.length,chunk_size:chunkSize,chunk_count:chunkCount,index,data:b64.slice(index*chunkSize,(index+1)*chunkSize)}); }
      res.setHeader('Content-Type','text/plain; charset=utf-8'); return res.status(200).send(b64);
    }
    res.setHeader('Content-Type',mime); res.setHeader('Content-Length',String(audio.length)); return res.status(200).send(audio);
  } catch (error) { console.error('tts failed', error); return res.status(502).json({error:'neural tts synthesis failed'}); }
}
