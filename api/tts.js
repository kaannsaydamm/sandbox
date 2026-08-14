import { EdgeTTS } from 'edge-tts-universal';

const VOICES = new Set([
  'tr-TR-AhmetNeural',
  'tr-TR-EmelNeural',
]);

function clampNumber(raw, min, max, fallback = 0) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }

  const text = String(req.query.text ?? '').trim();
  if (!text || text.length > 1800) {
    return res.status(400).json({ error: 'text must be 1..1800 characters' });
  }

  const requestedVoice = String(req.query.voice ?? 'tr-TR-AhmetNeural');
  const voice = VOICES.has(requestedVoice) ? requestedVoice : 'tr-TR-AhmetNeural';
  const rate = clampNumber(req.query.rate, -35, 35, 0);
  const pitch = clampNumber(req.query.pitch, -25, 25, 0);
  const encoding = String(req.query.encoding ?? 'binary');

  try {
    const tts = new EdgeTTS(text, voice, {
      rate: `${rate >= 0 ? '+' : ''}${rate}%`,
      pitch: `${pitch >= 0 ? '+' : ''}${pitch}Hz`,
      volume: '+0%',
    });
    const result = await tts.synthesize();
    const audio = Buffer.from(await result.audio.arrayBuffer());

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ALUCLU-TTS-Voice', voice);
    res.setHeader('X-ALUCLU-TTS-Bytes', String(audio.length));

    if (encoding === 'base64') {
      const b64 = audio.toString('base64');
      const chunkSize = Math.trunc(clampNumber(req.query.chunk_size, 1000, 180000, 120000));
      const chunkCount = Math.ceil(b64.length / chunkSize);
      const requestedChunk = req.query.chunk;

      if (String(req.query.meta ?? '') === '1') {
        return res.status(200).json({
          voice,
          bytes: audio.length,
          base64_length: b64.length,
          chunk_size: chunkSize,
          chunk_count: chunkCount,
        });
      }

      if (requestedChunk !== undefined) {
        const index = Math.trunc(clampNumber(requestedChunk, 0, Math.max(0, chunkCount - 1), 0));
        return res.status(200).json({
          voice,
          bytes: audio.length,
          base64_length: b64.length,
          chunk_size: chunkSize,
          chunk_count: chunkCount,
          index,
          data: b64.slice(index * chunkSize, (index + 1) * chunkSize),
        });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(b64);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    return res.status(200).send(audio);
  } catch (error) {
    console.error('tts failed', error);
    return res.status(502).json({ error: 'neural tts synthesis failed' });
  }
}
