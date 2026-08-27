import { EdgeTTS } from 'edge-tts-universal';

const SEGMENTS = [
  ['s00',0,"Bu bir savaş çağrısı değil; bir senaryo analizi. Varsayımımız sert ama basit: Yarın Türkiye ile İsrail arasında doğrudan, konvansiyonel bir savaş başlıyor. Nükleer silah yok. İlk anda NATO ya da Amerika doğrudan çatışmaya girmiyor. Peki kim üstün gelir? Savaş kaç gün sürer ve gerçekten kazanmak ne demektir?"],
  ['s01',26,"Bu savaşta klasik bir cephe hattı yok. İki ülkenin ortak kara sınırı bulunmuyor. Bu nedenle zaferi, diğer başkenti işgal etmek olarak tanımlamak gerçekçi değil. Daha makul ölçüt; karşı tarafın savaş hedeflerini engellemek, kendi kritik kapasiteni korumak ve ateşkes masasına daha güçlü oturmak. Yani taktik başarı ile stratejik zafer aynı şey olmayabilir."],
  ['s02',58,"Haritaya bakınca ilk büyük gerçek ortaya çıkıyor. Türkiye'nin geniş bir coğrafi derinliği var; İsrail ise çok daha kompakt. Fakat Türkiye'nin kara ordusunun büyüklüğü, ortak sınır olmadığı için otomatik bir üstünlüğe dönüşmüyor. Suriye hava sahası, Doğu Akdeniz ve uzun menzilli vuruş kapasitesi savaşın ana ekseni olur. Büyük kara işgalleri ise hem lojistik hem siyasi olarak son derece zor kalır."],
  ['s03',96,"İlk günlerde İsrail'in güçlü tarafı, yüksek teknolojiyle yoğunlaşmış hava gücü. F-35I Adir, F-15 ailesi, elektronik harp ve uzun süredir gerçek operasyonlarda kullanılan istihbarat zinciri; kısa ve keskin bir hava savaşında önemli avantaj yaratır. Türkiye tarafında ise NATO'nun en büyük F-16 filolarından biri, çok daha geniş bir üs ağı ve büyük bir hava sahası var. İlk haftanın sorusu şudur: İsrail kalite avantajını hızlı bir siyasi sonuca çevirebilir mi?"],
  ['s04',140,"İsrail'in en belirgin avantajlarından biri katmanlı hava ve füze savunması. Arrow üst katmanı, David's Sling orta katmanı, Iron Dome ve artık Iron Beam tamamlayıcı koruma sağlıyor. Türkiye de SİPER başta olmak üzere uzun menzilli hava savunma mimarisini büyütüyor. Ancak burada kritik fark yalnızca sistem adı değil; sensör ağı, mühimmat stoku, yeniden doldurma hızı ve yoğun saldırı altında sürdürülebilirlik."],
  ['s05',180,"Denizde tablo farklı. Türkiye, Doğu Akdeniz'e daha büyük bir filo çıkarabilir ve kendi kıyılarına yakın çalışır. İsrail donanması daha küçük olsa da denizaltılar, füze korvetleri ve hava kuvvetleriyle entegrasyon riski büyütür. Bu yüzden sayısal deniz üstünlüğü, İsrail kıyısına güvenle yaklaşmak anlamına gelmez. En değerli kazanım; ikmal yollarını korumak ve karşı tarafın hareket alanını daraltmaktır."],
  ['s06',216,"Savaş haftalardan aylara uzadığında platformların ilk gün performansından daha sıkıcı ama daha önemli konular belirleyici olur: mühimmat, yedek parça, bakım, üretim ve personel döngüsü. SIPRI'ye göre 2025'te İsrail'in askeri harcaması 48,3 milyar dolar; Türkiye'nin 30 milyar dolar. Buna karşın Türkiye'nin daha büyük nüfusu, daha geniş sanayi tabanı ve hızla büyüyen yerli savunma üretimi uzun yıpratma savaşında dayanıklılık sağlar."],
  ['s07',258,"Şimdi savaşı zamana bölelim. İlk yetmiş iki saatte sürpriz, istihbarat ve hazır mühimmat belirleyici; burada İsrail'e avantaj yazmak makul. Bir ila üç haftada hava savunmalarının tüketimi, uçak kayıpları ve üslerin operasyon temposu dengeyi belirler. Bir ila üç ayda ise Türkiye'nin ölçek ve coğrafi derinlik avantajı daha görünür hale gelir. Üç ayı aşan savaşta dış destek ve sanayi kapasitesi, savaşın kendisinden bile önemli olabilir."],
  ['s08',312,"Buradaki en büyük joker, iki ordudan biri değil; siyaset. Türkiye bir NATO üyesi. NATO'nun beşinci maddesi saldırıya uğrayan müttefike yardım yükümlülüğü doğuruyor, fakat her müttefik gerekli gördüğü eylemi kendisi belirliyor. Türkiye savaşı başlatırsa tablo başka; Türkiye toprakları açık bir saldırıya uğrarsa başka. Amerika'nın İsrail'le askeri bağı da çok güçlü. Bu nedenle gerçek dünyada saf bire bir savaş varsayımı çok hızlı bozulur."],
  ['s09',358,"Ağustos 2026'da Washington, Türkiye, İsrail ve Suriye arasında yanlış hesaplamayı önlemek için bir deconfliction mekanizması kurmaya çalışıyor. Reuters'ın aktardığına göre İsrail'in Suriye'deki Abu al-Duhur hava üssüne saldırısı, Türk konuşlanması endişeleriyle ilişkilendirildi ve Ankara saldırıyı kınadı. Bu, savaşın yakın olduğu anlamına gelmez; fakat Suriye'nin iki ülke arasındaki en hassas temas alanı olduğunu gösterir."],
  ['s10',392,"Kaba senaryo hükmü şu. Kısa, iki üç haftalık ve esas olarak hava-füze eksenli bir savaşta İsrail'in taktik üstünlük kurma ihtimali daha yüksek. Savaş aylarca sürerse Türkiye'nin ölçeği, coğrafi derinliği ve üretim dayanıklılığı dengeyi kendi lehine çevirebilir. Fakat iki durumda da diğer ülkeyi işgal edip teslim almak gerçekçi değil. En olası zafer, karşı tarafın hedefini boşa çıkarıp ateşkese daha güçlü girmektir."],
  ['s11',434,"Bu yüzden en olası final bir fetih sahnesi değil. Yoğun hava ve füze saldırıları, ekonomik şok, Doğu Akdeniz'de yüksek askeri tempo ve ardından Amerika, NATO, Avrupa ve bölge ülkelerinin ağır ateşkes baskısı. Net bir galip ilan etmek zor olabilir; iki taraf da kendi kamuoyuna farklı bir zafer anlatısı sunabilir. Bu senaryoda savaşın en gerçekçi süresi haftalar; en tehlikeli ihtimal ise yanlış hesaplamayla aylar süren bir yıpratma savaşına dönüşmesi."],
  ['s12',468,"Bu analiz; SIPRI, NATO, Türkiye Savunma Sanayii Başkanlığı, İsrail Savunma Bakanlığı, Lockheed Martin ve Reuters'ın açık kaynak verileri üzerine kuruldu. Yüzdeler bir istatistiksel tahmin değil; senaryo değerlendirmesi. Gerçek bir savaşın sonucu, ilk saldırının biçimi, dış destek, mühimmat stoku ve siyasi hedefler gibi bugün bilinmeyen değişkenlere bağlı olur."]
];

let PACK = null;
async function buildPack() {
  if (PACK) return PACK;
  const chunks=[]; const entries=[]; let offset=0;
  for (const [id,start,text] of SEGMENTS) {
    const tts = new EdgeTTS(text, 'tr-TR-AhmetNeural', {rate:'-4%', pitch:'-2Hz', volume:'+0%'});
    const result = await tts.synthesize();
    const audio = Buffer.from(await result.audio.arrayBuffer());
    entries.push({id,start,offset,length:audio.length});
    chunks.push(audio); offset += audio.length;
  }
  const header=Buffer.from(JSON.stringify({version:1,codec:'audio/mpeg',entries}),'utf8');
  const prefix=Buffer.alloc(4); prefix.writeUInt32BE(header.length,0);
  PACK=Buffer.concat([prefix,header,...chunks]);
  return PACK;
}

export const config = { maxDuration: 60 };

export default async function handler(req,res){
  try {
    const pack=await buildPack();
    res.setHeader('Cache-Control','public, s-maxage=3600');
    res.setHeader('Content-Type','application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename="turkiye_israil_docvoice.bin"');
    res.setHeader('Content-Length',String(pack.length));
    return res.status(200).send(pack);
  } catch(e) {
    console.error(e);
    return res.status(500).json({error:'docvoice generation failed'});
  }
}
