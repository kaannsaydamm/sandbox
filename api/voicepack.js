import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { EdgeTTS } from 'edge-tts-universal';

const MANIFEST = JSON.parse(readFileSync(new URL('../tts_manifest.json', import.meta.url), 'utf8'));
let PACK_PROMISE = null;

function compactOpus(input) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ['-hide_banner','-loglevel','error','-i','pipe:0','-vn','-ac','1','-ar','24000','-c:a','libopus','-b:a','16k','-vbr','on','-compression_level','10','-f','ogg','pipe:1']);
    const out=[]; const err=[];
    ff.stdout.on('data',d=>out.push(d)); ff.stderr.on('data',d=>err.push(d)); ff.on('error',reject);
    ff.on('close',c=>c===0?resolve(Buffer.concat(out)):reject(new Error(Buffer.concat(err).toString()||`ffmpeg ${c}`)));
    ff.stdin.end(input);
  });
}

async function synth(seg) {
  const tts = new EdgeTTS(seg.text, seg.voice, {
    rate:`${seg.rate>=0?'+':''}${seg.rate}%`,
    pitch:`${seg.pitch>=0?'+':''}${seg.pitch}Hz`, volume:'+0%'
  });
  const r=await tts.synthesize();
  return compactOpus(Buffer.from(await r.audio.arrayBuffer()));
}

async function buildPack() {
  const chunks=[]; const entries=[]; let offset=0;
  for (const seg of MANIFEST) {
    const audio=await synth(seg);
    entries.push({id:seg.id,start:seg.start,max:seg.max,speaker:seg.speaker,offset,length:audio.length});
    chunks.push(audio); offset += audio.length;
  }
  const header=Buffer.from(JSON.stringify({version:1,codec:'ogg/opus',entries}),'utf8');
  const prefix=Buffer.alloc(4); prefix.writeUInt32BE(header.length,0);
  return Buffer.concat([prefix,header,...chunks]);
}

export default async function handler(req,res){
  try {
    if (!PACK_PROMISE) PACK_PROMISE=buildPack().catch(e=>{PACK_PROMISE=null;throw e;});
    const pack=await PACK_PROMISE;
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');

    if(String(req.query.binary??'')==='1') {
      res.setHeader('Content-Type','application/octet-stream');
      res.setHeader('Content-Disposition','attachment; filename="aluclu_neural_voicepack.bin"');
      res.setHeader('Content-Length',String(pack.length));
      return res.status(200).send(pack);
    }

    const b64=pack.toString('base64');
    const chunkSize=Math.max(20000,Math.min(160000,Number(req.query.chunk_size)||160000));
    const count=Math.ceil(b64.length/chunkSize);
    if(String(req.query.meta??'')==='1') return res.status(200).json({bytes:pack.length,base64_length:b64.length,chunk_size:chunkSize,chunk_count:count,segments:MANIFEST.length});
    const index=Math.max(0,Math.min(count-1,Number(req.query.chunk)||0));
    return res.status(200).json({index,chunk_count:count,data:b64.slice(index*chunkSize,(index+1)*chunkSize)});
  }catch(e){console.error('voicepack failed',e);return res.status(502).json({error:'voice pack failed'});}
}
