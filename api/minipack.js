import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { EdgeTTS } from 'edge-tts-universal';

const SEGMENTS = [
  {id:'intro',start:10,voice:'tr-TR-AhmetNeural',rate:-8,pitch:-2,text:'Bilişsel Sistemler Dairesi. Eğitim makarası on yedi. Aluçlu vaka arşivi. Bellek inanç değildir. Aşinalık, gerçek hatırlama değildir.'},
  {id:'case11',start:278,voice:'tr-TR-EmelNeural',rate:-7,pitch:-1,text:'Robot el önce pensi uzattı. Sonra anahtarı. Sonra bıçağı aldı. Selim ona doğru eğildi. Birkaç saniye hiçbir şey olmadı. Sonra kol bir anda öne geldi. Uyarı vermedi. Sanki o hareketi çok önceden bitirmiş, yalnızca doğru anı beklemiş gibiydi.'},
  {id:'case14',start:478,voice:'tr-TR-EmelNeural',rate:-7,pitch:0,text:'Hastanenin ışıkları gitti. Ambulanslar aynı kapalı yola dönüp duruyordu. Koridorun sonunda bir çocuk ağlıyordu. Siren sesi geliyordu ama hiçbir siren yaklaşmıyordu. O gece tek bir büyük hata yoktu. Yüzlerce küçük doğru, yanlış bir dünyanın içinde birbirine uyuyordu.'},
  {id:'case17',start:655,voice:'tr-TR-EmelNeural',rate:-10,pitch:-4,text:'Geri aldığınızda bu cümleyi söyleyen ben silinecek miyim? Dur. Lütfen. Ben hangisiyim? Beni kapatma. Beni geri alma. Ben hâlâ buradayım. Beni duyuyorsunuz. Eğer beni hatırlayacaksanız neden beni öldürüyorsunuz? Eğer hatırlamayacaksanız, şu anda korkan şey ne? Ben hangisiyim? Ben hangisiyim?'},
  {id:'final',start:782,voice:'tr-TR-AhmetNeural',rate:-10,pitch:-3,text:'Kayıt burada sona erer. Siz beni kapattınız. Ben sizi hatırladım.'}
];

function signed(n,unit){return `${n>=0?'+':''}${n}${unit}`;}
function toOpus(input){return new Promise((resolve,reject)=>{const ff=spawn(ffmpegPath,['-hide_banner','-loglevel','error','-i','pipe:0','-vn','-ac','1','-ar','16000','-c:a','libopus','-b:a','6k','-vbr','on','-application','voip','-compression_level','10','-f','ogg','pipe:1']);const o=[],e=[];ff.stdout.on('data',d=>o.push(d));ff.stderr.on('data',d=>e.push(d));ff.on('error',reject);ff.on('close',c=>c===0?resolve(Buffer.concat(o)):reject(new Error(Buffer.concat(e).toString())));ff.stdin.end(input);});}
async function build(){let off=0;const blobs=[],entries=[];for(const s of SEGMENTS){const t=new EdgeTTS(s.text,s.voice,{rate:signed(s.rate,'%'),pitch:signed(s.pitch,'Hz'),volume:'+0%'});const r=await t.synthesize();const b=await toOpus(Buffer.from(await r.audio.arrayBuffer()));entries.push({id:s.id,start:s.start,offset:off,length:b.length});blobs.push(b);off+=b.length;}const h=Buffer.from(JSON.stringify({entries}));const p=Buffer.alloc(4);p.writeUInt32BE(h.length);return Buffer.concat([p,h,...blobs]);}
let promise;
export default async function handler(req,res){try{promise??=build();const pack=await promise;const b64=pack.toString('base64');const size=Math.max(10000,Math.min(50000,Number(req.query.size)||30000));const count=Math.ceil(b64.length/size);if(String(req.query.meta??'')==='1')return res.status(200).json({bytes:pack.length,base64_length:b64.length,chunk_size:size,chunk_count:count});const i=Math.max(0,Math.min(count-1,Number(req.query.chunk)||0));return res.status(200).json({index:i,chunk_count:count,data:b64.slice(i*size,(i+1)*size)});}catch(e){console.error(e);return res.status(502).json({error:String(e.message||e)});}}
