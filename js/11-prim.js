/* =====================================================================
   PRİM MODÜLÜ — Temsilci Bazlı Aylık Prim Sistemi
   ---------------------------------------------------------------------
   Tasarım kararları (Prim_Sistemi_Tasarim.docx v1.0):
   - 4 boyut: Tahsilat(net erime) %40, Yaşlandırma %25, Cari Azaltma %20, Ciro %15
   - Net erime = ay içi tahsilat − ay içi (net) yeni fatura
   - Yaşlanan cari = ortalama vadesi 30 gün+ olan cariler
   - Çek/senet yalnızca tahsil edilince sayılır (tahsilat arşivi zaten böyle)
   - İade faturaları düşülür (net fatura); nakit ve çek/senet eşit sayılır
   - Prim tavanı 5.000 ₺, baraj (min puan) elle ayarlanabilir (varsayılan 50)
   - Temsilci ataması TEK kaynak: Müşteri Master (m.temsilci); ay içinde sabit
   - Ay içinde hiç hareketi olmayan / '—' temsilci gösterilmez
   - Ay başı verisi: kullanıcının aldığı "Ay Başı Snapshot" (buluta kaydedilir)
   Tüm katsayılar/ağırlıklar state.primAyarlari üzerinden ayarlanabilir.
   ===================================================================== */

// ---- Bulut / yerel saklama yolları (sellOutHedef desenini izler) ----
const PRIM_AYAR_CLOUD_PATH   = CLOUD.path + '_primAyarlari';
const PRIM_AYAR_LOCAL_KEY    = 'noktaCariTakip_primAyarlari_v1';
const PRIM_SNAPSHOT_CLOUD_PATH = CLOUD.path + '_primSnapshotlar'; // { [ayKey]: {kayitZamani, temsilciYok?, musteriler:[...] } }
const PRIM_SNAPSHOT_LOCAL_KEY  = 'noktaCariTakip_primSnapshotlar_v1';

// ---- Varsayılan prim ayarları ----
const PRIM_VARSAYILAN_AYAR = {
  agirlikTahsilat: 40, agirlikYaslandirma: 25, agirlikCari: 20, agirlikCiro: 15,
  yaslanmaEsigiGun: 30,      // ort. vade bu değerden büyükse "yaşlanmış" sayılır
  hedefNetOran: 10,          // ay başı carinin %10'unu net eritme hedefi
  primTavan: 5000,           // TL
  barajPuan: 50,             // bu puanın altı prim almaz
  ciroHedefOran: 100,        // ay içi ciro hedefi = referans (elle ayar için)
};

// state güvence (01-cekirdek state objesine sonradan eklenir)
if(typeof state !== 'undefined'){
  if(!state.primAyarlari) state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR);
  if(!state.primSnapshotlar) state.primSnapshotlar = {};
}

/* =====================================================================
   YARDIMCILAR
   ===================================================================== */
function primAyar(){ return Object.assign({}, PRIM_VARSAYILAN_AYAR, state.primAyarlari||{}); }
function primClamp(x,lo,hi){ lo=(lo==null?0:lo); hi=(hi==null?100:hi); return Math.max(lo, Math.min(hi, x)); }
function primAyKey(d){ // Date -> 'YYYY-MM'
  const dt = (d instanceof Date)? d : new Date();
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
}
function primAyBaslangicKey(ayKey){ return ayKey+'-01'; }
function primAySonuKey(ayKey){
  const [y,m]=ayKey.split('-').map(Number);
  const son=new Date(y, m, 0).getDate(); // ayın son günü
  return ayKey+'-'+String(son).padStart(2,'0');
}
function primFmtTL(n){
  const v=Math.round(Number(n)||0);
  return v.toLocaleString('tr-TR')+' ₺';
}
function primFmtM(n){ // milyon kısaltma
  const v=Number(n)||0;
  if(Math.abs(v)>=1e6) return (v/1e6).toLocaleString('tr-TR',{maximumFractionDigits:1})+'M';
  if(Math.abs(v)>=1e3) return (v/1e3).toLocaleString('tr-TR',{maximumFractionDigits:0})+'K';
  return v.toLocaleString('tr-TR');
}

/* =====================================================================
   BULUT / YEREL KAYIT (sellOutHedef dörtlüsü modeli)
   ===================================================================== */
async function savePrimAyarToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_AYAR_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Prim ayarı buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadPrimAyarFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_AYAR_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) return null;
    const t = await res.text();
    if(!t || t==='null') return null;
    return JSON.parse(t);
  }catch(err){ console.error('Prim ayarı buluttan okunamadı:', err); return null; }
}
async function savePrimSnapshotToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_SNAPSHOT_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Prim snapshot buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadPrimSnapshotFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_SNAPSHOT_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) return null;
    const t = await res.text();
    if(!t || t==='null') return null;
    return JSON.parse(t);
  }catch(err){ console.error('Prim snapshot buluttan okunamadı:', err); return null; }
}

async function primAyarKaydet(obj){
  state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR, obj);
  try{ localStorage.setItem(PRIM_AYAR_LOCAL_KEY, JSON.stringify(state.primAyarlari)); }catch(e){}
  if(cloudEnabled()){
    const s = await savePrimAyarToCloud(state.primAyarlari);
    if(!s.ok) throw new Error('Prim ayarı buluta kaydedilemedi: '+(s.reason||''));
  }
}
async function primAyarYenile(){
  let obj=null;
  if(cloudEnabled()) obj = await loadPrimAyarFromCloud();
  if(!obj){ try{ obj = JSON.parse(localStorage.getItem(PRIM_AYAR_LOCAL_KEY)||'null'); }catch(e){} }
  state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR, obj||{});
}
async function primSnapshotlariYenile(){
  let obj=null;
  if(cloudEnabled()) obj = await loadPrimSnapshotFromCloud();
  if(!obj){ try{ obj = JSON.parse(localStorage.getItem(PRIM_SNAPSHOT_LOCAL_KEY)||'null'); }catch(e){} }
  state.primSnapshotlar = obj || {};
}
async function primSnapshotKaydet(ayKey, snap){
  state.primSnapshotlar = state.primSnapshotlar || {};
  state.primSnapshotlar[ayKey] = snap;
  try{ localStorage.setItem(PRIM_SNAPSHOT_LOCAL_KEY, JSON.stringify(state.primSnapshotlar)); }catch(e){}
  if(cloudEnabled()){
    const s = await savePrimSnapshotToCloud(state.primSnapshotlar);
    if(!s.ok) throw new Error('Snapshot buluta kaydedilemedi: '+(s.reason||''));
  }
}

/* =====================================================================
   AY BAŞI SNAPSHOT — o anki report.musteriler'in prim alanlarını dondurur
   ===================================================================== */
function primSnapshotOlustur(report){
  const musteriler = (report && report.musteriler || []).filter(m=>m && m.temsilci && m.temsilci!=='—');
  // RİSK MEKANİZMASI (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23 revizyonu):
  // Risk Cezası formülü "Risk Artışı = Ay Sonu Risk − Ay Başı Risk" gerektirir. Ay başı çek/senet
  // riski (durum='risk' olan kayıtların, Belge Tarihi bu snapshot anına kadar olan toplamı),
  // musteriMasterMap üzerinden temsilciye dağıtılıp burada saklanır — önceden bu bilgi hiç
  // tutulmuyordu. ÖNEMLİ: Bu alan yalnızca BUNDAN SONRA alınan "Ay Başı Fotoğrafı"nda dolu olur;
  // geçmiş snapshotlarda cekSenetRiskToplam alanı olmayabilir (primRiskCezasi bunu 0 kabul eder).
  const masterMap = (typeof state !== 'undefined' && state.musteriMasterMap) ? state.musteriMasterMap : null;
  const cekSenetRiskByTemsilci = new Map();
  Object.values((typeof state !== 'undefined' && state.cekSenetArsivi) || {}).forEach(r=>{
    if(!r || r.durum!=='risk') return;
    const t = masterMap ? (masterMap.get(r.musteriKod)||null) : null;
    if(!t || t==='—') return;
    cekSenetRiskByTemsilci.set(t, (cekSenetRiskByTemsilci.get(t)||0) + (Number(r.tutar)||0));
  });
  return {
    kayitZamani: new Date().toISOString(),
    asOf: report && report.asOf ? report.asOf : null,
    musteriler: musteriler.map(m=>({
      musteri: m.musteri,
      temsilci: m.temsilci,
      kalanBorc: Number(m.kalanBorc)||0,
      avgVadeGun: Number(m.avgVadeGun)||0,
    })),
    cekSenetRiskByTemsilci: Object.fromEntries(cekSenetRiskByTemsilci),
  };
}

/* =====================================================================
   HESAP MOTORU — temsilci bazlı prim
   ===================================================================== */

// Ay başı snapshot'ından temsilci bazlı toplamlar (bakiye + yaşlanan bakiye)
function primSnapshotTemsilciTopla(snap, esikGun){
  const map = new Map();
  (snap && snap.musteriler || []).forEach(m=>{
    const t = m.temsilci; if(!t || t==='—') return;
    if(!map.has(t)) map.set(t, {bakiye:0, yaslanan:0, musteriSayisi:0});
    const o = map.get(t);
    o.bakiye += Number(m.kalanBorc)||0;
    if((Number(m.avgVadeGun)||0) > esikGun) o.yaslanan += Number(m.kalanBorc)||0;
    o.musteriSayisi++;
  });
  return map;
}

// Ay sonu (güncel report) temsilci bazlı toplamlar
function primReportTemsilciTopla(report, esikGun){
  const map = new Map();
  (report && report.musteriler || []).forEach(m=>{
    const t = m.temsilci; if(!t || t==='—') return;
    if(!map.has(t)) map.set(t, {bakiye:0, yaslanan:0, musteriSayisi:0});
    const o = map.get(t);
    o.bakiye += Number(m.kalanBorc)||0;
    if((Number(m.avgVadeGun)||0) > esikGun) o.yaslanan += Number(m.kalanBorc)||0;
    o.musteriSayisi++;
  });
  return map;
}

// Ay içi yeni fatura (net: iade türleri zaten faturaArsiv'e girmiyor) temsilci bazlı.
// KRİTİK DÜZELTME: önceden report.faturaArsiv kullanılıyordu — bu, SADECE o an/en son yüklenen
// Fatura Dökümü dosyasının ham satırlarıdır (bkz. buildReport, 03-veri-yukleme-ve-senkron.js),
// ay boyunca farklı günlerde yapılmış önceki yüklemeleri İÇERMEZ. Tahsilat ve Çek/Senet zaten
// kalıcı arşivden (state.tahsilatArsivi / state.cekSenetArsivi) okunuyordu; Fatura da aynı şekilde
// kalıcı arşiv olan state.faturaArsivCache'ten (gün bazlı, {[gunKey]:{faturaArsiv:[...]}} şeklinde)
// ay aralığı taranarak okunmalı — aksi halde ay içinde birden fazla gün fatura yüklendiğinde
// (arşivlendiğinde) sadece son yüklemenin faturaları sayılır, ay toplamı eksik/yanlış çıkar.
// KRİTİK DÜZELTME 2 (kullanıcı kararı, 2026-07-23 — gerçek verilerle simülasyon sonucu bulundu):
// Önceki düzeltme state.faturaArsivCache'i HAM olarak tarıyordu — bu, faturaKontrolArsivBirlestir()
// içindeki "kazanan yükleme günü" (tekilleştirme/gölge kayıt temizleme) mantığından GEÇMİYORDU. Bir
// takvim günü birden fazla kez arşivlenmişse (ör. aynı Fatura Dökümü dosyası günde birden fazla kez
// yüklendiyse), ham tarama o günün TÜM yüklemelerini toplarken, computeTahsilatVerimlilikAy
// (06-senet-ve-detay.js) zaten birlesikArsiv (faturaKontrolArsivBirlestirCached) üzerinden SADECE
// kazanan/en son yüklemeyi kullanıyordu — bu fark Prim ile Tahsilat Verimliliği arasında sistematik,
// küçük ama gerçek sapmalara yol açıyordu (gerçek veri testinde 1 gölge kayıt, ~10.000 ₺ fark
// olarak doğrulandı). ÇÖZÜM: Prim'in üç arşiv-taraması gereken fonksiyonu da (Fatura/Hakediş/
// İade) artık HAM state.faturaArsivCache yerine, computeTahsilatVerimlilikAy ile AYNI birlesikArsiv
// kaynağını kullanır (primHesapla içinde bir kez hesaplanıp parametre olarak geçirilir).
function primFaturaTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey){
  const map = new Map();
  (birlesikArsiv.faturaArsiv||[]).forEach(f=>{
    const t = f.temsilci; if(!t) return;
    const d = f.faturaTarihi instanceof Date ? f.faturaTarihi : (f.faturaTarihi? new Date(f.faturaTarihi):null);
    if(!d) return;
    const gk = dateKeyLocal(d);
    if(ilkGunKey && gk<ilkGunKey) return;
    if(sonGunKey && gk>sonGunKey) return;
    map.set(t, (map.get(t)||0) + (Number(f.tutar)||0));
  });
  return map;
}

// Ay içi tahsilat (çek/senet tahsil edilince zaten arşive girmiş) temsilci bazlı.
// KULLANICI KARARI (2026-07-23): Ödeme ve Virman kayıtları GERÇEK TAHSİLAT DEĞİLDİR (bakiye
// aktarımı/mahsup işlemidir) — computeTahsilatVerimlilikAy'daki AYNI kuralla tutarlı olması için
// burada da tahsilatKategori üzerinden hariç tutulur (TEK KAYNAK ilkesi — iki fonksiyon farklı
// mantık kullanırsa Prim ile Tahsilat Verimliliği raporları birbirinden sapar).
const PRIM_TAHSILAT_SAYILMAYAN_KATEGORILER = new Set(['Odeme', 'Virman']);
function primTahsilatTemsilciTopla(ilkGunKey, sonGunKey){
  const map = new Map();
  const dizi = tahsilatArsivindenAralikDiziyeCevir(state.tahsilatArsivi||{}, ilkGunKey, sonGunKey);
  dizi.forEach(r=>{
    const t = r.satisTemsilcisi; if(!t) return;
    if(PRIM_TAHSILAT_SAYILMAYAN_KATEGORILER.has(r.tahsilatKategori)) return;
    map.set(t, (map.get(t)||0) + (Number(r.tutar)||0));
  });
  return map;
}

// Ay içi ciro (faturaArsiv tutarları = satış cirosu) temsilci bazlı
function primCiroTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey){
  // ciro = ay içi net satış faturası tutarı (faturaArsiv). Fatura toplamıyla aynı kaynak.
  return primFaturaTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey);
}

// Ay içi Bayi Hak Ediş temsilci bazlı toplam. DÜZELTME 2: artık birlesikArsiv.bayiHakedisArsiv
// (tekilleştirilmiş, computeTahsilatVerimlilikAy ile AYNI kaynak) üzerinden okunur. Bu satırlarda
// temsilci alanı YOK, TEK KAYNAK kuralı gereği musteriMasterMap üzerinden musteriKod -> temsilci
// eşlemesi yapılır.
function primHakedisTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey){
  const map = new Map();
  const masterMap = (typeof state !== 'undefined' && state.musteriMasterMap) ? state.musteriMasterMap : null;
  (birlesikArsiv.bayiHakedisArsiv||[]).forEach(r=>{
    if(!r || !r.tahsilatTarihi) return;
    const gk = dateKeyLocal(new Date(r.tahsilatTarihi));
    if(ilkGunKey && gk<ilkGunKey) return;
    if(sonGunKey && gk>sonGunKey) return;
    const t = masterMap ? (masterMap.get(r.musteri)||null) : null;
    if(!t || t==='—') return;
    map.set(t, (map.get(t)||0) + (Number(r.tutar)||0));
  });
  return map;
}

// Ay içi Fatura İade (Bozuk/Sağlam/Depozito İade grubu, MÜŞTERİ TAHSİLATI olarak sayılır) temsilci
// bazlı toplam. DÜZELTME 2: artık birlesikArsiv.tahsilatArsiv (formatKaynagi==='FaturaIade',
// computeTahsilatVerimlilikAy ile AYNI tekilleştirilmiş kaynak) üzerinden okunur. Temsilci yine
// musteriMasterMap'ten (TEK KAYNAK kuralı).
function primFaturaIadeTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey){
  const map = new Map();
  const masterMap = (typeof state !== 'undefined' && state.musteriMasterMap) ? state.musteriMasterMap : null;
  (birlesikArsiv.tahsilatArsiv||[]).forEach(r=>{
    if(!r || r.formatKaynagi!=='FaturaIade' || !r.belgeTarihi) return;
    const gk = dateKeyLocal(new Date(r.belgeTarihi));
    if(ilkGunKey && gk<ilkGunKey) return;
    if(sonGunKey && gk>sonGunKey) return;
    const t = masterMap ? (masterMap.get(r.musteri)||null) : null;
    if(!t || t==='—') return;
    map.set(t, (map.get(t)||0) + (Number(r.tutar)||0));
  });
  return map;
}

// Ay içi Çek/Senet — DÜZELTME (kullanıcı kararı, 2026-07-23): ay içinde KESİLEN ama henüz
// 'tahsilEdildi' işaretlenmemiş (yani hâlâ 'risk' durumundaki) çek/senetler TAHSİLAT SAYILMAZ —
// bunlar zaten Cari Değişim'i etkiler (SAP kesildiği an bakiyeyi düşürür) ama RİSKTİR, TAHSİLAT
// DEĞİLDİR. Yalnızca kullanıcının manuel "Tahsil Edildi" işaretlediği kayıtlar (durum='tahsilEdildi')
// tahsilata sayılır — computeTahsilatVerimlilikAy'daki (06-senet-ve-detay.js) AYNI kuralla
// birebir tutarlı olması için Belge Tarihi yerine Vade Tarihi kullanılır (çekin KESİLDİĞİ değil
// ÖDENMESİ gereken tarih). Önceki sürümde "durum fark etmeksizin TÜM kesilen çek/senet" tahsilat
// sayılıyordu — bu, Prim'in Tahsilat Verimliliği'nden sistematik olarak daha yüksek çıkmasına
// (temsilcinin henüz tahsil edilmemiş riskli kağıtları bile "başarı" gibi görünmesine) yol açıyordu.
function primCekSenetTemsilciTopla(ilkGunKey, sonGunKey){
  const toplamMap = new Map();
  const riskMap = new Map();
  const masterMap = (typeof state !== 'undefined' && state.musteriMasterMap) ? state.musteriMasterMap : null;
  Object.values((typeof state !== 'undefined' && state.cekSenetArsivi) || {}).forEach(r=>{
    if(!r) return;
    const t = masterMap ? (masterMap.get(r.musteriKod)||null) : null;
    if(!t || t==='—') return;
    const tutar = Number(r.tutar)||0;
    if(r.durum === 'tahsilEdildi'){
      if(!r.vadeTarihi) return;
      const gk = dateKeyLocal(new Date(r.vadeTarihi));
      if(ilkGunKey && gk<ilkGunKey) return;
      if(sonGunKey && gk>sonGunKey) return;
      toplamMap.set(t, (toplamMap.get(t)||0) + tutar);
    }else if(r.durum === 'risk'){
      if(!r.belgeTarihi) return;
      const gk = dateKeyLocal(new Date(r.belgeTarihi));
      if(ilkGunKey && gk<ilkGunKey) return;
      if(sonGunKey && gk>sonGunKey) return;
      riskMap.set(t, (riskMap.get(t)||0) + tutar);
    }
  });
  return {toplamMap, riskMap};
}

// --- Puanlama fonksiyonları ---
function puanTahsilatNet(netErime, netHedef){
  if(netHedef<=0) return 50;
  const o = netErime/netHedef;
  if(o<0) return 0;                 // cari büyüdü
  if(o>=1) return primClamp(85+(o-1)/0.30*15);
  return primClamp(o*85);
}
// GERÇEKLEŞME ÇARPANI (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23 revizyonu):
// Son 3 ayın ORTALAMA tahsilat gerçekleşme oranına (netErime/netHedef) göre Risk Cezası'nı
// büyüten bir çarpan. Düşük gerçekleşme = temsilci zaten hedefini tutturamıyor demektir, bu
// durumda risk artışının cezası daha ağır uygulanır (kötü performans + artan risk = çifte sinyal).
// Geçmiş ayın "ay sonu" verisi, BİR SONRAKİ ayın "ay başı" snapshot'ından türetilir (ay N'in ay
// sonu = ay N+1'in ay başı). Yeterli geçmiş veri yoksa varsayılan olarak nötr çarpan (1.0) kullanılır
// (geriye dönük veri eksikliğinde temsilciyi cezalandırmamak için).
function primGerceklesmeCarpani(temsilci, ayKey, esikGun, ayar){
  const gecmisOranlar = [];
  const [y0,m0] = ayKey.split('-').map(Number);
  for(let i=1;i<=3;i++){
    const d = new Date(y0, m0-1-i, 1);
    const oncekiAyKey = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const sonrakiD = new Date(y0, m0-i, 1);
    const sonrakiAyKey = sonrakiD.getFullYear()+'-'+String(sonrakiD.getMonth()+1).padStart(2,'0');

    const ayBasiSnap = (state.primSnapshotlar||{})[oncekiAyKey];
    const aySonuSnap = (state.primSnapshotlar||{})[sonrakiAyKey]; // bir sonraki ayın ay başı = bu ayın ay sonu
    if(!ayBasiSnap || !aySonuSnap) continue;

    const ayBasiMap = primSnapshotTemsilciTopla(ayBasiSnap, esikGun);
    const aySonuMap = primSnapshotTemsilciTopla(aySonuSnap, esikGun);
    const ayBasi = ayBasiMap.get(temsilci);
    const aySonu = aySonuMap.get(temsilci);
    if(!ayBasi || ayBasi.bakiye<=0) continue;

    // Bu geçmiş ay için net hedef, o zamanki ay başı bakiyeye göre yeniden hesaplanır (aynı otomatik
    // hedef formülüyle) — gerçek tahsilat rakamına burada ihtiyaç yok, sadece BAKİYE DEĞİŞİMİ
    // (cari azalışı) net erimenin bir yaklaşıklığı olarak kullanılır (tahsilat arşivinin geçmişe
    // dönük her ay için ayrıca taranması yerine, zaten elde olan snapshot zincirinden ucuz bir
    // performans göstergesi türetilir).
    const netHedefGecmis = primOtomatikNetHedef(ayBasi.bakiye, ayBasi.bakiye>0 ? ayBasi.yaslanan/ayBasi.bakiye : 0, ayar);
    if(netHedefGecmis<=0) continue;
    const netErimeGecmis = ayBasi.bakiye - aySonu.bakiye;
    gecmisOranlar.push(netErimeGecmis/netHedefGecmis);
  }
  if(!gecmisOranlar.length) return 1.0; // geçmiş veri yoksa nötr çarpan
  const ortalamaOran = gecmisOranlar.reduce((a,b)=>a+b,0)/gecmisOranlar.length;
  const yuzde = ortalamaOran*100;
  if(yuzde>=85) return 1.0;
  if(yuzde>=70) return 1.3;
  if(yuzde>=50) return 1.8;
  if(yuzde>=30) return 2.5;
  return 3.5;
}

// RİSK CEZASI (kullanıcı kararı, 2026-07-23 revizyonu — İKİNCİ DÜZELTME): Risk Cezası artık
// MUTLAK tutar farkına (Risk Artışı) değil, RİSK ORANI farkına dayanır. Sebep (kullanıcı örneği):
// Ay 1'de 20M satış / 3M risk (oran %15), Ay 2'de 10M satış / 2M risk (oran %20) — mutlak risk
// azalmış (3M→2M) ama ORAN kötüleşmiş (%15→%20); temsilci aslında daha riskli davranıyor ama eski
// (mutlak fark) formül bunu "iyileşme" sayıp hiç ceza uygulamazdı. Formül:
//   Risk Cezası = [(Ay Sonu Risk/Ay Sonu Cari) − (Ay Başı Risk/Ay Başı Cari)] × 100 × 0.4 × Çarpan
// Oran farkı negatifse (yani risk oranı gerçekten iyileşmişse) ceza uygulanmaz (0 döner).
function primRiskCezasiYeni(ayBasiRisk, aySonuRisk, ayBasiBakiye, aySonuBakiye, gerceklesmeCarpani){
  const aySonuOran = (aySonuBakiye>0) ? (aySonuRisk||0)/aySonuBakiye : 0;
  const ayBasiOran = (ayBasiBakiye>0) ? (ayBasiRisk||0)/ayBasiBakiye : 0;
  const oranFarki = aySonuOran - ayBasiOran;
  if(oranFarki<=0) return 0;
  return oranFarki * 100 * 0.4 * gerceklesmeCarpani;
}

// PRİM TAVANI ESNEKLİĞİ (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23 revizyonu):
// Alt puan tavanı 100'den 150'ye çıkar (Risk Cezası puanı 0'ın altına düşürebildiği gibi, güçlü
// performans da 100'ün üstüne çıkabilir). Puan ≤120 ise prim tavanı normal (%100); 120-150 arası
// doğrusal olarak %130'a kadar artar; 150 ve üzeri sabit %130'da kalır.
function primTavanKatsayisi(toplamPuan){
  if(toplamPuan<=120) return 1.0;
  if(toplamPuan>=150) return 1.3;
  return 1.0 + (toplamPuan-120)/(150-120)*0.3;
}
function puanYaslandirma(basi, sonu){
  if(basi<=0) return (sonu<=0)?100:50;
  const d = (basi-sonu)/basi;
  return primClamp(40 + d/0.40*60);
}
function puanCariAzaltma(basi, sonu){
  if(basi<=0) return 50;
  const d = (basi-sonu)/basi;
  return primClamp(50 + d/0.25*50);
}
function puanCiro(ciro, hedef){
  if(hedef<=0) return 50;
  return primClamp(ciro/hedef*90);
}

// Otomatik net tahsilat hedefi: ay başı carinin %hedefNetOran'ı (yaşlanmaya göre hafif ayar)
function primOtomatikNetHedef(ayBasiBakiye, yaslanmaOrani, ayar){
  const taban = (ayar.hedefNetOran||10)/100;
  const zorluk = taban * (1 - (yaslanmaOrani||0)*0.4);
  return ayBasiBakiye * Math.max(zorluk, taban*0.5); // en fazla yarıya kadar hafifler
}

// Ana hesap: temsilci başına prim satırı listesi döndürür
async function primHesapla(report, ayKey){
  const ayar = primAyar();
  const esik = ayar.yaslanmaEsigiGun;
  const ilkGunKey = primAyBaslangicKey(ayKey);
  const sonGunKey = primAySonuKey(ayKey);

  // TEK KAYNAK (kullanıcı kararı, 2026-07-23 — 2. düzeltme): birlesikArsiv artık BİR KEZ burada
  // hesaplanıp Fatura/Hakediş/İade fonksiyonlarına PARAMETRE olarak geçirilir — bu,
  // computeTahsilatVerimlilikAy'ın (06-senet-ve-detay.js) kullandığı AYNI tekilleştirilmiş
  // (gölge kayıtlardan arındırılmış) kaynaktır. Önceden bu üç fonksiyon ham state.faturaArsivCache'i
  // ayrı ayrı tarıyordu — bu, gerçek veri testinde ~10.000 ₺'lik sistematik sapmaya yol açıyordu.
  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);

  const snap = (state.primSnapshotlar||{})[ayKey] || null;
  const ayBasiMap = snap ? primSnapshotTemsilciTopla(snap, esik) : null;
  const aySonuMap = primReportTemsilciTopla(report, esik);
  const faturaMap = primFaturaTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey);
  const tahsilatMap = primTahsilatTemsilciTopla(ilkGunKey, sonGunKey);
  const hakedisMap = primHakedisTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey);
  const faturaIadeMap = primFaturaIadeTemsilciTopla(birlesikArsiv, ilkGunKey, sonGunKey);
  const {toplamMap: cekSenetMap, riskMap: cekSenetRiskMap} = primCekSenetTemsilciTopla(ilkGunKey, sonGunKey);
  const ciroMap = faturaMap; // ay içi net satış = ciro

  // AKTİF temsilci = ay içinde GERÇEK HAREKETİ olan (fatura VEYA tahsilat).
  // Sadece bakiyesi olan ama ay içinde hiç fatura/tahsilat hareketi olmayan
  // temsilciler (ör. 'Ahmet Selçuk', 'Key Account', 'Hüseyin Edizarslan')
  // prim listesinde GÖSTERİLMEZ (kullanıcı kararı). Bu yüzden aySonuMap (bakiye
  // kaynağı) sete EKLENMEZ; yalnızca fatura ve tahsilat hareketi esas alınır.
  const temsilciSet = new Set();
  faturaMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  tahsilatMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  hakedisMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  faturaIadeMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  cekSenetMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  temsilciSet.delete('—'); temsilciSet.delete(''); temsilciSet.delete('Key Account');

  const satirlar = [];
  temsilciSet.forEach(t=>{
    const ayBasi = ayBasiMap ? (ayBasiMap.get(t)||{bakiye:0,yaslanan:0,musteriSayisi:0}) : null;
    const aySonu = aySonuMap.get(t) || {bakiye:0,yaslanan:0,musteriSayisi:0};
    // Tahsilat: Tahsilat Dökümü + Bayi Hak Ediş + Fatura İade (Bozuk/Sağlam/Depozito) — üçü de
    // müşteri cari bakiyesini azaltan birer tahsilat kredisidir (kullanıcı kararı).
    const tahsilatNormal = tahsilatMap.get(t)||0;
    const hakedis = hakedisMap.get(t)||0;
    const faturaIade = faturaIadeMap.get(t)||0;
    // Ay içi Çek/Senet: yalnızca MANUEL "Tahsil Edildi" işaretlenenler burada (bkz.
    // primCekSenetTemsilciTopla'daki güncel mantık — kullanıcı kararı, 2026-07-23).
    const ayIciCekSenet = cekSenetMap.get(t)||0;
    // KRİTİK DÜZELTME 3 (kullanıcı kararı, 2026-07-23 — gerçek Çek/Senet dosyasıyla simülasyonla
    // bulundu): "tahsilat" alanı önceden ayIciCekSenet'i İÇERMİYORDU — yalnızca netErime
    // hesabında kullanılıyordu ama Prim tablosundaki "Tahsilat" sütununa ve gösterge kartlarına hiç
    // yansımıyordu. Bu, bir temsilcinin o ay SADECE manuel tahsil edilmiş çek/senedi varsa (başka
    // normal tahsilat/hakediş/iade olmasa bile) Prim'in Tahsilat'ı YANLIŞLIKLA 0 göstermesine yol
    // açıyordu — computeTahsilatVerimlilikAy (Tahsilat Verimliliği) ise bu tutarı doğru gösteriyordu.
    const tahsilat = tahsilatNormal + hakedis + faturaIade + ayIciCekSenet;
    const yeniFatura = faturaMap.get(t)||0;
    const ciro = ciroMap.get(t)||0;
    // KRİTİK DÜZELTME 4 (kullanıcı kararı, 2026-07-23 — "çek senet riske sayarken sanki cariden
    // düşen bir değer gibi görmemekte" tespitiyle bulundu): Net Erime, gerçek Cari Değişim
    // (Ay Başı Bakiye - Ay Sonu Bakiye) ile TUTARLI olmalıdır. Ama önceden netErime = tahsilat -
    // yeniFatura formülü, ay içinde KESİLEN ama henüz "Tahsil Edildi" işaretlenmemiş (yani RİSK
    // durumundaki) çek/senetleri HİÇ hesaba katmıyordu — oysa bu tutar SAP'ta kesildiği an cariyi
    // zaten düşürür (kullanıcının netleştirdiği kural). Sonuç: risk durumundaki büyük bir çek/senet
    // varsa, Net Erime gerçek cari azalışını YANSITMIYOR, sanki cari hiç düşmemiş/büyümüş gibi
    // görünüyordu. ÇÖZÜM: cariyi düşüren TOPLAM tutar (riskCezasindan bağımsız olarak) hem manuel
    // tahsil edilmiş HEM risk durumundaki ay içi çek/senedi kapsar — riskMap bu ikinciyi zaten
    // Belge Tarihi'ne göre tutuyordu (bkz. primCekSenetTemsilciTopla). "Tahsilat" KPI'sına DAHİL
    // EDİLMEZ (risk hâlâ risktir, başarı sayılmaz) ama Net Erime'nin cari ile tutarlı olması için
    // buraya eklenir.
    const cekSenetRisk = cekSenetRiskMap.get(t)||0;
    const netErime = tahsilat + cekSenetRisk - yeniFatura;

    // ay başı yoksa (snapshot alınmamışsa) cari azaltma/yaşlandırma hesaplanamaz -> uyarı
    const ayBasiVar = !!ayBasi;
    const ayBasiBakiye = ayBasiVar ? ayBasi.bakiye : aySonu.bakiye;
    const yaslanmaOrani = ayBasiBakiye>0 ? (ayBasiVar?ayBasi.yaslanan:aySonu.yaslanan)/ayBasiBakiye : 0;

    // manuel hedef override kontrolü (state.primAyarlari.hedefOverride[temsilci])
    const override = (ayar.hedefOverride||{})[t];
    const netHedef = (override!=null && override>0) ? Number(override) : primOtomatikNetHedef(ayBasiBakiye, yaslanmaOrani, ayar);

    // RİSK CEZASI (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23 revizyonu):
    // Risk Cezası = (Risk Artışı / Ortalama Cari) × 100 × 0.4 × Gerçekleşme Çarpanı. Bu artık
    // tahsilat puanından (pT) DEĞİL, TOPLAM puandan düşülür (aşağıda). Ay başı risk, snapshot'ın
    // cekSenetRiskByTemsilci alanından okunur (yoksa 0 — eski snapshotlarda bu alan olmayabilir).
    const ayBasiRisk = (snap && snap.cekSenetRiskByTemsilci && snap.cekSenetRiskByTemsilci[t]) || 0;
    const gerceklesmeCarpani = primGerceklesmeCarpani(t, ayKey, esik, ayar);
    const riskCezasi = primRiskCezasiYeni(ayBasiRisk, cekSenetRisk, ayBasiBakiye, aySonu.bakiye, gerceklesmeCarpani);

    const pT = puanTahsilatNet(netErime, netHedef);
    const pY = ayBasiVar ? puanYaslandirma(ayBasi.yaslanan, aySonu.yaslanan) : 50;
    const pC = ayBasiVar ? puanCariAzaltma(ayBasi.bakiye, aySonu.bakiye) : 50;
    // ciro hedefi: ay başı carinin bir oranı (basit referans) — elle ayarlanabilir
    const ciroHedef = ayBasiBakiye>0 ? ayBasiBakiye*0.5 : (ciro||1);
    const pR = puanCiro(ciro, ciroHedef);

    // TAVAN 150 (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23 revizyonu): toplam
    // puan artık 0-100 değil 0-150 aralığında olabilir (Risk Cezası'nın toplamı düşürebilmesi VE
    // güçlü performansın 100'ün üstüne bonus alanına çıkabilmesi için alt tavan yükseltildi).
    const toplamHam = pT*(ayar.agirlikTahsilat/100) + pY*(ayar.agirlikYaslandirma/100)
                 + pC*(ayar.agirlikCari/100) + pR*(ayar.agirlikCiro/100);
    const toplam = Math.max(0, Math.min(150, toplamHam - riskCezasi));

    let prim = 0;
    if(toplam >= ayar.barajPuan){
      const oran = (toplam - ayar.barajPuan) / (100 - ayar.barajPuan);
      prim = ayar.primTavan * (0.20 + oran*0.80);
      // PRİM TAVANI ESNEKLİĞİ (kullanıcı kararı, önceki oturumda netleştirildi — 2026-07-23
      // revizyonu): puan ≤120 için normal tavan (%100), 120-150 arası doğrusal %130'a kadar,
      // 150+ sabit %130. Önceden prim hep primTavan'da sabitleniyordu (Math.min ile) — artık
      // yüksek performans tavanın ÜZERİNE çıkabilir.
      const tavanKatsayisi = primTavanKatsayisi(toplam);
      prim = Math.min(prim, ayar.primTavan * tavanKatsayisi);
    }
    const not = toplam>=80?'A': toplam>=70?'B': toplam>=55?'C':'D';

    // EK GÜVENCE: ay içi tahsilat, fatura, çek/senet ve cironun hepsi sıfırsa bu temsilci
    // ay içinde hiç iş yapmamış demektir -> listede gösterme (kullanıcı kararı).
    if(Math.abs(tahsilat)===0 && Math.abs(yeniFatura)===0 && Math.abs(ciro)===0 && Math.abs(ayIciCekSenet)===0) return;

    satirlar.push({
      temsilci:t, musteriSayisi: aySonu.musteriSayisi,
      ayBasiBakiye, aySonuBakiye: aySonu.bakiye,
      ayBasiYaslanan: ayBasiVar?ayBasi.yaslanan:null, aySonuYaslanan: aySonu.yaslanan,
      tahsilat, tahsilatNormal, hakedis, faturaIade, yeniFatura, ayIciCekSenet, cekSenetRisk,
      netErime, ciro, netHedef,
      pT,pY,pC,pR, riskCezasi, toplam, prim, not, ayBasiVar,
    });
  });

  satirlar.sort((a,b)=> b.toplam-a.toplam);
  return { satirlar, ayBasiVar: !!snap, snapZamani: snap?snap.kayitZamani:null };
}

/* =====================================================================
   ARAYÜZ
   ===================================================================== */
function primSecilenAyKey(){
  const sel = document.getElementById('primAySecici');
  if(sel && sel.value) return sel.value;
  return primAyKey(new Date());
}

function primNotRenk(not){
  return not==='A'?'var(--gb-good,#008300)': not==='B'?'#2a78d6': not==='C'?'#946400':'#b3261e';
}

async function renderPrimView(report){
  const kpiEl = document.getElementById('primKpiGrid');
  const listEl = document.getElementById('primTbody');
  const cntEl = document.getElementById('primCount');
  if(!listEl) return;
  if(!report){ listEl.innerHTML = '<div class="empty-state">Önce rapor oluşturun.</div>'; return; }

  // Fatura/Hak Ediş/Fatura İade artık kalıcı arşivden (state.faturaArsivCache) okunuyor — bu
  // önbelleğin güncel olduğundan emin olunur (diğer arşiv-bağımlı görünümlerle aynı desen).
  await faturaArsivYenile();

  const ayKey = primSecilenAyKey();
  const sonuc = await primHesapla(report, ayKey);
  const ayar = primAyar();
  const satirlar = sonuc.satirlar;

  if(cntEl) cntEl.textContent = satirlar.length + ' aktif temsilci · ' + ayKey;

  // --- KPI ---
  const toplamPrim = satirlar.reduce((s,r)=>s+r.prim,0);
  const ortPuan = satirlar.length? satirlar.reduce((s,r)=>s+r.toplam,0)/satirlar.length : 0;
  const toplamTahsilat = satirlar.reduce((s,r)=>s+r.tahsilat,0);
  const toplamNetErime = satirlar.reduce((s,r)=>s+r.netErime,0);
  if(kpiEl){
    kpiEl.innerHTML = [
      primKpiKart('Toplam Dağıtılan Prim', primFmtTL(toplamPrim), satirlar.length+' temsilci'),
      primKpiKart('Ortalama Puan', ortPuan.toFixed(1)+' / 100', 'Ekip geneli'),
      primKpiKart('Ay İçi Tahsilat', primFmtM(toplamTahsilat)+' ₺', 'Tüm ekip'),
      primKpiKart('Net Cari Erime', primFmtM(toplamNetErime)+' ₺', 'Tahsilat − yeni fatura'),
    ].join('');
  }

  // --- Ay başı uyarısı ---
  let uyari = '';
  if(!sonuc.ayBasiVar){
    uyari = '<div class="empty-state" style="border-left:3px solid #946400;text-align:left;padding:12px 16px;margin-bottom:14px;">'
      + '<b>Ay başı fotoğrafı alınmamış.</b> Bu ay ('+ayKey+') için "Ay Başı Prim Fotoğrafı" kaydı yok. '
      + 'Yaşlandırma ve cari azaltma puanları hesaplanamıyor (varsayılan 50 kullanılıyor). '
      + 'Ayın 1\'inde kalemler dosyasını yükleyip aşağıdaki <b>“Ay Başı Fotoğrafı Al”</b> butonuna basın.</div>';
  } else {
    const dt = new Date(sonuc.snapZamani);
    uyari = '<div class="as-of" style="margin-bottom:12px;">Ay başı fotoğrafı: '
      + dt.toLocaleDateString('tr-TR') + ' ' + dt.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})+'</div>';
  }

  // --- Toolbar (ay seçici + snapshot butonu + ayarlar) ---
  const simdiAy = primAyKey(new Date());
  const aylar = primAySeceneleri();
  const toolbar = '<div class="toolbar" style="gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">'
    + '<label style="font-size:13px;color:var(--text-secondary,#52514e);">Dönem: </label>'
    + '<select class="filter-select" id="primAySecici" onchange="renderPrimView(state.report)">'
    + aylar.map(a=>`<option value="${a}" ${a===ayKey?'selected':''}>${a}</option>`).join('')
    + '</select>'
    + '<button class="btn" id="primSnapshotBtn" onclick="primAyBasiFotografiAlHandler()"><i class="fa-solid fa-camera"></i> Ay Başı Fotoğrafı Al</button>'
    + (sonuc.ayBasiVar ? '<button class="btn" id="primSnapshotSilBtn" onclick="primSnapshotSilHandler()" style="color:#b3261e;"><i class="fa-solid fa-trash"></i> Fotoğrafı Sil</button>' : '')
    + '<button class="btn" id="primAyarBtn" onclick="primAyarPaneliAcKapat()"><i class="fa-solid fa-sliders"></i> Ayarlar</button>'
    + '</div>'
    + primAyarPaneliHTML(ayar);

  // --- Temsilci kartları ---
  let kartlar = '';
  if(!satirlar.length){
    kartlar = '<div class="empty-state">Bu dönemde aktif (hareketi olan) temsilci bulunamadı.</div>';
  } else {
    satirlar.forEach((r,i)=>{ kartlar += primTemsilciKart(r,i); });
  }

  // --- Detay tablo ---
  const tablo = satirlar.length ? primDetayTablo(satirlar, ayar) : '';

  listEl.innerHTML = toolbar + uyari
    + '<div class="cust-card-list" style="margin-bottom:20px;">'+kartlar+'</div>'
    + tablo;
}

function primKpiKart(lab, val, cap){
  return '<div class="gb-kpi-card">'
    + '<div class="gb-kpi-top"><i class="fa-solid fa-percent" aria-hidden="true"></i> '+lab+'</div>'
    + '<div class="gb-kpi-value">'+val+'</div>'
    + '<div class="gb-kpi-foot"><span class="gb-kpi-sub">'+(cap||'')+'</span></div>'
    + '</div>';
}

function primTemsilciKart(r,i){
  const renk = primNotRenk(r.not);
  const madalya = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
  const bar = (lab,puan,clr)=>'<div style="display:grid;grid-template-columns:96px 1fr 34px;gap:8px;align-items:center;font-size:12px;margin:5px 0;">'
    + '<span style="color:var(--text-secondary,#52514e);">'+lab+'</span>'
    + '<span style="height:8px;background:var(--surface-0,#f0f0ec);border-radius:5px;overflow:hidden;display:block;"><span style="display:block;height:100%;width:'+Math.round(puan)+'%;background:'+clr+';border-radius:5px;"></span></span>'
    + '<span style="text-align:right;font-weight:600;">'+Math.round(puan)+'</span></div>';
  const ayBasiNot = r.ayBasiVar? '' : ' <span style="font-size:11px;color:#946400;">(ay başı yok)</span>';
  return '<div class="htk-card" style="padding:16px 18px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
    +   '<div><div style="font-weight:700;font-size:16px;">'+primEsc(r.temsilci)+'</div>'
    +     '<div style="font-size:12px;color:var(--text-secondary,#52514e);">'+r.musteriSayisi+' cari'+ayBasiNot+'</div></div>'
    +   '<div style="text-align:right;"><span style="font-size:11px;font-weight:700;">'+madalya+'</span></div>'
    + '</div>'
    + '<div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px;">'
    +   '<span style="font-size:32px;font-weight:800;">'+r.toplam.toFixed(0)+'<span style="font-size:14px;color:var(--text-secondary,#52514e);">/100</span></span>'
    +   '<span style="font-size:12px;font-weight:700;padding:2px 9px;border-radius:8px;color:'+renk+';background:'+renk+'22;">'+r.not+'</span>'
    + '</div>'
    + '<div style="font-size:13px;margin:4px 0 10px;">Prim: <b style="font-size:15px;color:'+(r.prim>0?'var(--gb-good,#008300)':'#b3261e')+';">'+primFmtTL(r.prim)+'</b></div>'
    + (r.cekSenetRisk>0 ? '<div style="font-size:11.5px;margin:0 0 8px;color:#946400;"><i class="fa-solid fa-triangle-exclamation"></i> Risk (tahsil edilmemiş çek/senet): <b>'+primFmtM(r.cekSenetRisk)+' ₺</b>'+(r.riskCezasi>0?' · Puan cezası: −'+r.riskCezasi.toFixed(1):'')+'</div>' : '')
    + bar('Tahsilat', r.pT, '#2a78d6')
    + bar('Yaşlandırma', r.pY, '#eda100')
    + bar('Cari Azaltma', r.pC, '#1baf7a')
    + bar('Satış/Ciro', r.pR, '#4a3aa7')
    + '</div>';
}

function primDetayTablo(satirlar, ayar){
  const head = '<tr>'
    + ['Temsilci','Ay Başı Cari','Ay Sonu Cari','Tahsilat','Yeni Fatura','Çek/Senet (Ay İçi)','Risk (Çek/Senet)','Net Erime','Yaşlanan (B→S)','Puan','Not','Prim']
      .map(h=>'<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-secondary,#52514e);border-bottom:1px solid var(--border,#e3e2dc);">'+h+'</th>').join('')
    + '</tr>';
  const td=(c,al)=>'<td style="padding:9px 10px;text-align:'+(al||'right')+';border-bottom:1px solid var(--border,#e3e2dc);font-variant-numeric:tabular-nums;">'+c+'</td>';
  let rows='';
  satirlar.forEach(r=>{
    const dCari = r.aySonuBakiye - r.ayBasiBakiye;
    const dCariStr = r.ayBasiVar ? (dCari<=0?'<span style="color:#008300;">'+primFmtM(dCari)+'</span>':'<span style="color:#b3261e;">+'+primFmtM(dCari)+'</span>') : '—';
    const yasStr = r.ayBasiVar ? (primFmtM(r.ayBasiYaslanan)+' → '+primFmtM(r.aySonuYaslanan)) : '—';
    const netStr = r.netErime<0? '<span style="color:#b3261e;">'+primFmtM(r.netErime)+'</span>' : primFmtM(r.netErime);
    const riskStr = r.cekSenetRisk>0 ? '<span style="color:#946400;font-weight:600;">'+primFmtM(r.cekSenetRisk)+'</span>' : '—';
    rows += '<tr>'
      + td(primEsc(r.temsilci),'left')
      + td(r.ayBasiVar?primFmtM(r.ayBasiBakiye):'—')
      + td(primFmtM(r.aySonuBakiye))
      + td(primFmtM(r.tahsilat))
      + td(primFmtM(r.yeniFatura))
      + td(primFmtM(r.ayIciCekSenet))
      + td(riskStr)
      + td(netStr)
      + td(yasStr)
      + td(r.toplam.toFixed(1))
      + td('<span style="font-weight:700;color:'+primNotRenk(r.not)+';">'+r.not+'</span>')
      + td('<b>'+primFmtTL(r.prim)+'</b>')
      + '</tr>';
  });
  return '<div class="stok-section-divider"><span class="stok-section-divider-title">Ay Başı → Ay Sonu Detay</span></div>'
    + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
    + '<thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>';
}

/* ---- Ayar paneli ---- */
function primAyarPaneliHTML(ayar){
  const inp=(id,lab,val,step)=>'<div style="display:flex;flex-direction:column;gap:3px;">'
    + '<label style="font-size:12px;color:var(--text-secondary,#52514e);">'+lab+'</label>'
    + '<input type="number" class="filter-select" id="'+id+'" value="'+val+'" step="'+(step||1)+'" style="width:110px;"></div>';
  return '<div id="primAyarPaneli" style="display:none;background:var(--surface-1,#fcfcfb);border:1px solid var(--border,#e3e2dc);border-radius:12px;padding:16px 18px;margin-bottom:16px;">'
    + '<div style="font-weight:700;margin-bottom:12px;">Prim Ayarları</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:14px;">'
    +   inp('primAgTahsilat','Tahsilat ağırlığı %',ayar.agirlikTahsilat)
    +   inp('primAgYas','Yaşlandırma ağırlığı %',ayar.agirlikYaslandirma)
    +   inp('primAgCari','Cari ağırlığı %',ayar.agirlikCari)
    +   inp('primAgCiro','Ciro ağırlığı %',ayar.agirlikCiro)
    +   inp('primEsik','Yaşlanma eşiği (gün)',ayar.yaslanmaEsigiGun)
    +   inp('primHedefOran','Net hedef oranı %',ayar.hedefNetOran)
    +   inp('primTavan','Prim tavanı ₺',ayar.primTavan,100)
    +   inp('primBaraj','Baraj puanı',ayar.barajPuan)
    + '</div>'
    + '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">'
    +   '<button class="btn" onclick="primAyarKaydetHandler()"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button>'
    +   '<span style="font-size:12px;color:var(--text-secondary,#52514e);">Ağırlıklar toplamı 100 olmalıdır.</span>'
    + '</div></div>';
}
function primAyarPaneliAcKapat(){
  const p=document.getElementById('primAyarPaneli');
  if(p) p.style.display = (p.style.display==='none'?'block':'none');
}
async function primAyarKaydetHandler(){
  const g=id=>Number((document.getElementById(id)||{}).value)||0;
  const yeni={
    agirlikTahsilat:g('primAgTahsilat'), agirlikYaslandirma:g('primAgYas'),
    agirlikCari:g('primAgCari'), agirlikCiro:g('primAgCiro'),
    yaslanmaEsigiGun:g('primEsik'), hedefNetOran:g('primHedefOran'),
    primTavan:g('primTavan'), barajPuan:g('primBaraj'),
    hedefOverride: (state.primAyarlari||{}).hedefOverride||{},
  };
  const top=yeni.agirlikTahsilat+yeni.agirlikYaslandirma+yeni.agirlikCari+yeni.agirlikCiro;
  if(top!==100){ alert('Ağırlıklar toplamı 100 olmalı. Şu an: '+top); return; }
  if(!(await ortakSifreDogrula('Prim ayarlarını değiştirmek için şifreyi girin:'))) return;
  try{ await primAyarKaydet(yeni); }catch(e){ alert(e.message); return; }
  renderPrimView(state.report);
}

/* ---- Ay başı fotoğrafı al ---- */
async function primAyBasiFotografiAlHandler(){
  if(!state.report){ alert('Önce rapor oluşturun.'); return; }
  const ayKey = primSecilenAyKey();
  const mevcut = (state.primSnapshotlar||{})[ayKey];
  const mesaj = mevcut
    ? ayKey+' için zaten bir ay başı fotoğrafı var. ÜZERİNE YAZILSIN mı? Bu işlem geri alınamaz.'
    : ayKey+' dönemi için ay başı fotoğrafı alınacak. Bugünkü rapor "ay başı" referansı olarak kaydedilecek. Onaylıyor musunuz?';
  if(!confirm(mesaj)) return;
  if(!(await ortakSifreDogrula('Ay başı fotoğrafı almak için şifreyi girin:'))) return;
  const snap = primSnapshotOlustur(state.report);
  try{ await primSnapshotKaydet(ayKey, snap); }
  catch(e){ alert('Kaydedilemedi: '+e.message); return; }
  alert('Ay başı fotoğrafı kaydedildi ('+snap.musteriler.length+' cari).');
  renderPrimView(state.report);
}

/* ---- Ay başı fotoğrafını sil (test verisi temizleme) ---- */
async function primSnapshotSilHandler(){
  const ayKey = primSecilenAyKey();
  if(!(state.primSnapshotlar||{})[ayKey]){ alert(ayKey+' için silinecek bir fotoğraf yok.'); return; }
  if(!confirm(ayKey+' dönemine ait ay başı fotoğrafı SİLİNECEK. Bu işlem geri alınamaz. Onaylıyor musunuz?')) return;
  if(!(await ortakSifreDogrula('Fotoğrafı silmek için şifreyi girin:'))) return;
  const kopya = Object.assign({}, state.primSnapshotlar);
  delete kopya[ayKey];
  state.primSnapshotlar = kopya;
  try{
    localStorage.setItem(PRIM_SNAPSHOT_LOCAL_KEY, JSON.stringify(kopya));
    if(cloudEnabled()){ const s=await savePrimSnapshotToCloud(kopya); if(!s.ok) throw new Error(s.reason||''); }
  }catch(e){ alert('Silinemedi: '+e.message); return; }
  alert(ayKey+' fotoğrafı silindi.');
  renderPrimView(state.report);
}

/* ---- Ay seçenekleri: SADECE fotoğrafı olan aylar + içinde bulunulan ay ----
   Boş geçmiş aylar (fotoğrafı olmayan 4./5. ay gibi) LİSTELENMEZ (kullanıcı kararı). */
function primAySeceneleri(){
  const set = new Set();
  set.add(primAyKey(new Date()));  // içinde bulunulan ay (fotoğraf almak için)
  Object.keys(state.primSnapshotlar||{}).forEach(k=>set.add(k));  // fotoğrafı olan aylar
  return Array.from(set).sort().reverse();
}

/* ---- yardımcı ---- */
function primEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Açılışta ayar + snapshot yükle (uygulama başlatma akışına eklenir)
async function primVerileriniYukle(){
  try{ await primAyarYenile(); }catch(e){}
  try{ await primSnapshotlariYenile(); }catch(e){}
}
