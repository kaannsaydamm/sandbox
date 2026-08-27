const ASSETS = {
  config: 'https://huggingface.co/99eren99/piper-turkish-tts/resolve/main/config.json',
  model: 'https://huggingface.co/99eren99/piper-turkish-tts/resolve/main/model.onnx',
  runtime: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz'
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('GET only');
  const name = String(req.query.name || '');
  const url = ASSETS[name];
  if (!url) return res.status(400).send('unknown asset');
  const upstream = await fetch(url, { redirect: 'follow' });
  if (!upstream.ok || !upstream.body) return res.status(502).send(`upstream ${upstream.status}`);
  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  const len = upstream.headers.get('content-length');
  res.setHeader('Content-Type', ct);
  if (len) res.setHeader('Content-Length', len);
  res.setHeader('Cache-Control', 'no-store');
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once('drain', resolve));
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(502).send('proxy failed'); else res.destroy(err);
  }
}
