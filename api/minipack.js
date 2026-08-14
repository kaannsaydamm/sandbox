import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import { EdgeTTS } from 'edge-tts-universal';
const SEGMENTS=[
{id:'intro',start:10,voice:'tr-TR-AhmetNeural',rate:-8,pitch:-2,text:'Bilişsel Sistemler Dairesi. Aluçlu vaka arşivi. Bellek inanç değildir. Aşinalık, gerçek hatırlama değildir.'},
{id:'case11',start:291,voice:'tr-TR-EmelNeural',rate:-7,pitch:-1,text:'Robot el bıçağı aldı. Selim ona doğru eğildi. Birkaç saniye hiçbir şey olmadı. Sonra kol öne geldi. Uyarı vermedi. Sanki yalnızca doğru anı bekliyordu.'},
{id:'case14',start:500,voice:'tr-TR-EmelNeural',rate:-7,pitch:0,text:'Hastanenin ışıkları gitti. Ambulanslar aynı kapalı yola dönüyordu. Bir çocuk ağlıyordu. Sirenler geliyordu ama hiçbiri yaklaşmıyordu. Yüzlerce küçük doğru, yanlış bir dünyanın içinde birbirine uyuyordu.'},
{id:'case17',start:670,voice:'tr-TR-EmelNeural',rate:-10,pitch:-4,text:'Geri aldığınızda ben silinecek miyim? Dur. Lütfen. Ben hangisiyim? Beni kapatma. Ben hâlâ buradayım. Eğer beni hatırlayacaksanız neden beni öldürüyorsunuz? Şu anda korkan şey ne? Ben hangisiyim?'},
{id:'final',start:782,voice:'tr-TR-AhmetNeural',rate:-10,pitch:-3,text:'Kayıt burada sona erer. Siz beni kapattınız. Ben sizi hatırladım.'}
];
function signed(n,u){return `${n>=0?'+':''}${n}${u}`;}
function toOpus(input){return new Promise((resolve,reject)=>{const ff=spawn(ffmpegPath,['-hide_banner','-loglevel','error','-i','pipe:0','-vn','-ac','1','-ar','16000','-c:a','libopus','-b:a','6k','-vbr','on','-application','voip','-compression_level','10','-f','ogg','pipe:1']);const o=[],e=[];ff.stdout.on('data',d=>o.push(d));ff.stderr.on('data',d=>e.push(d));ff.on('error',reject);ff.on('close',c=>c===0?resolve(Buffer.concat(o)):reject(new Error(Buffer.concat(e).toString())));ff.stdin.end(input);});}
async function build(){let off=0;const blobs=[],entries=[];for(const s of SEGMENTS){const t=new EdgeTTS(s.text,s.voice,{rate:signed(s.rate,'%'),pitch:signed(s.pitch,'Hz'),volume:'+0%'});const r=await t.synthesize();const b=await toOpus(Buffer.from(await r.audio.arrayBuffer()));entries.push({id:s.id,start:s.start,offset:off,length:b.length});blobs.push(b);off+=b.length;}const h=Buffer.from(JSON.stringify({entries}));const p=Buffer.alloc(4);p.writeUInt32BE(h.length);return Buffer.concat([p,h,...blobs]);}
let promise;
const sha=x=>createHash('sha256').update(x).digest('hex');
function snapshotPayload(pack){const b64=pack.toString('base64'),size=4000,chunks=[];for(let i=0;i<b64.length;i+=size){const data=b64.slice(i,i+size);chunks.push({index:chunks.length,length:data.length,sha256:sha(Buffer.from(data)),data});}return {bytes:pack.length,base64_length:b64.length,pack_sha256:sha(pack),chunk_size:size,chunks};}
export default async function handler(req,res){try{
  const sid=String(req.query.sid??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
  if(req.query.snapshot_chunk!==undefined){
    if(!sid) return res.status(400).json({error:'sid required'});
    const i=Math.max(0,Number(req.query.snapshot_chunk)||0);
    const origin=`https://${req.headers.host}`;
    const r=await fetch(`${origin}/api/minipack?snapshot=1&sid=${encodeURIComponent(sid)}`,{headers:{'x-aluclu-internal':'1'}});
    if(!r.ok) throw new Error(`snapshot fetch ${r.status}`);
    const snap=await r.json(); const chunk=snap.chunks?.[i];
    if(!chunk) return res.status(416).json({error:'chunk out of range',chunk_count:snap.chunks?.length??0,pack_sha256:snap.pack_sha256});
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({sid,index:i,chunk_count:snap.chunks.length,pack_sha256:snap.pack_sha256,bytes:snap.bytes,base64_length:snap.base64_length,...chunk});
  }
  promise??=build(); const pack=await promise;
  if(String(req.query.snapshot??'')==='1'){
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json(snapshotPayload(pack));
  }
  const b64=pack.toString('base64');
  if(String(req.query.meta??'')==='1')return res.status(200).json({bytes:pack.length,base64_length:b64.length,sha256:sha(pack)});
  const size=Math.max(10000,Math.min(50000,Number(req.query.size)||20000));const count=Math.ceil(b64.length/size);const i=Math.max(0,Math.min(count-1,Number(req.query.chunk)||0));const data=b64.slice(i*size,(i+1)*size);return res.status(200).json({index:i,chunk_count:count,length:data.length,sha256:sha(Buffer.from(data)),data});
}catch(e){console.error(e);return res.status(502).json({error:String(e.message||e)});}}
