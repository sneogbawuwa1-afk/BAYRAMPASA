// ================= BULUTSUZ TEST MODU =================
// Bu bayrak TRUE iken: hiçbir Firebase/bulut isteği yapılmaz (okuma/yazma/senkronizasyon/auth
// hepsi atlanır). Uygulama YALNIZCA cihazdaki (IndexedDB) veriyle çalışır — giriş ekranı istemez,
// doğrudan açılır. Test bittiğinde bu satırı `false` yapmak (veya bu bloğu silmek) bulutu geri
// getirir; başka HİÇBİR yerde değişiklik gerekmez.
// GÜNCELLEME: Firebase projesiyle (bayrampasa-3d357) canlı buluta geçildi — bulut AÇIK.
const BULUTSUZ_TEST = false;
function cloudEnabled(){ if(BULUTSUZ_TEST) return false; return !!(CLOUD.dbUrl && CLOUD.dbUrl.trim()); }

// Çıplak fetch() çağrılarının varsayılan bir zaman aşımı yoktur: ağ yavaşsa, DNS/ISP tarafında
// bulut adresi engelleniyorsa veya bağlantı sessizce düşüyorsa, tarayıcı isteği süresiz olarak
// beklemede tutabilir. Bu da "Bulut verisi kontrol ediliyor…" durumunun ekranda asılı kalmasına
// (hiç sonuçlanmamasına) yol açar. Bulut ile ilgili TÜM istekler bu sarmalayıcıdan geçer; belirli
// bir süre (varsayılan 15 sn) içinde yanıt gelmezse istek iptal edilir ve normal bir hata olarak
// fırlatılır, böylece çağıran taraftaki try/catch bloğu devreye girip yerel/mevcut veriye döner.
// Bir Promise'i zaman aşımıyla yarıştırır: süre dolarsa verilen yedek değerle (varsayılan null)
// çözülür — asla reddetmez. Açılış gibi kritik akışların, tek bir takılan bulut isteği yüzünden
// SONSUZA KADAR beklememesi için kullanılır (donma yerine "elimizdekiyle devam et").
function zamanAsimliYaris(promise, ms, yedekDeger){
  return Promise.race([
    Promise.resolve(promise).catch(()=> yedekDeger),
    new Promise(resolve=> setTimeout(()=> resolve(yedekDeger), ms)),
  ]);
}

async function cloudFetch(url, options, timeoutMs){
  timeoutMs = timeoutMs || 15000;
  const controller = new AbortController();
  const timer = setTimeout(()=> controller.abort(), timeoutMs);
  try{
    // ÖNEMLİ: cache:'no-store' ZORUNLUDUR. Tarayıcı, Firebase Realtime Database REST API'sinin
    // GET yanıtlarını (bazı durumlarda döndürdüğü Cache-Control başlıklarına göre) HTTP
    // önbelleğinde tutabiliyor — bu da F5/normal sayfa yenilemesinde (hard-refresh/Ctrl+Shift+R
    // DEĞİL) fetch()'in ağa hiç gitmeden ESKİ, önbellekteki yanıtı döndürmesine yol açabiliyor.
    // Sonuç: 2. cihazda F5 yapılsa bile bulutta yeni girilen veri (ör. çek/senet onayı sonrası
    // güncellenmiş rapor) görünmüyordu — "Diğer Cihazdan Güncelle" bazen çalışıyor gibi görünmesi
    // de zamanlama/önbellek geçerlilik süresinin rastgele dolmuş olmasından kaynaklanıyor olabilir,
    // güvenilir bir davranış değildi. cache:'no-store' ile HER istek ağa gider, tarayıcı önbelleği
    // asla devreye girmez — hem GET (okuma) hem PUT/PATCH (yazma) istekleri için geçerlidir.
    const nihaiOptions = Object.assign({cache: 'no-store'}, options||{}, {signal: controller.signal});
    return await fetch(url, nihaiOptions);
  }catch(err){
    if(err && err.name === 'AbortError'){
      throw new Error('Bulut isteği zaman aşımına uğradı (' + Math.round(timeoutMs/1000) + ' sn)');
    }
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

// ============================================================================
// VERİMLİ BULUT SENKRONİZASYONU (meta zaman damgası ile "değişmemişse indirme")
// ============================================================================
// Önceden her veri türü (ana rapor, Müşteri Master, Sell Out, Modern Kanal, Bayi Hakediş,
// Malzemeler) uygulama her açıldığında büyük JSON'ının TAMAMINI buluttan indiriyordu — cihazdaki
// veri buluttakiyle birebir aynı olsa bile. Bu, gereksiz veri trafiği/gecikme yaratıyordu.
// Artık her büyük veri, kaydedilirken YANINDA çok küçük bir "_meta/{veriTuru}" kaydına da bir
// updatedAt zaman damgası yazıyor. Yükleme sırasında önce SADECE bu küçük zaman damgası
// okunuyor; cihazda saklanan son bilinen zaman damgasıyla AYNIYSA, büyük veri hiç indirilmeden
// doğrudan cihazdaki (IndexedDB) kopya kullanılıyor. Farklıysa (başka bir cihazdan güncellenmiş),
// büyük veri normal şekilde indirilip hem state'e hem cihaza yazılıyor.
const CLOUD_META_LOCAL_KEY = 'noktaCariTakip_cloudMetaZamanlari_v1';
let cloudMetaZamanCache = null; // {veriTuru: updatedAt} - cihazda bilinen son zaman damgaları, bellekte önbelleklenir

async function cloudMetaZamanlariniYukle(){
  if(cloudMetaZamanCache) return cloudMetaZamanCache;
  try{ cloudMetaZamanCache = (await idbGet(CLOUD_META_LOCAL_KEY)) || {}; }
  catch(err){ cloudMetaZamanCache = {}; }
  return cloudMetaZamanCache;
}
async function cloudMetaZamaniKaydet(veriTuru, zaman){
  const harita = await cloudMetaZamanlariniYukle();
  harita[veriTuru] = zaman;
  cloudMetaZamanCache = harita;
  await idbSet(CLOUD_META_LOCAL_KEY, harita).catch(()=>{});
}
// Buluttaki küçük meta kaydını okur ({updatedAt: number} formatında). Ağ hatasında null döner.
async function cloudMetaOkuUzaktan(cloudPath){
  if(!cloudEnabled()) return null; // BULUTSUZ modda hiç istek atma
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/_meta/${cloudPath}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){
    console.error('Meta zaman damgası okunamadı ('+cloudPath+'):', err);
    return null;
  }
}
// Meta kaydını buluta yazar — asıl veriyi kaydeden fonksiyonlar (saveXToCloud), veriyi
// yazdıktan hemen sonra bunu çağırır.
async function cloudMetaYazUzaktan(cloudPath, zaman){
  if(!cloudEnabled()) return false; // BULUTSUZ modda hiç istek atma
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/_meta/${cloudPath}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({updatedAt: zaman}),
    });
    return !!(res && res.ok);
  }catch(err){ console.error('Meta zaman damgası yazılamadı ('+cloudPath+'):', err); return false; }
}
// Ana verimli yükleme sarmalayıcısı: önce küçük meta zaman damgasını kontrol eder, cihazdaki
// bilinen zamanla aynıysa büyük veriyi HİÇ İNDİRMEDEN cihazdaki kopyayı döndürür; farklıysa
// (veya meta hiç yoksa/ağ hatasıysa, güvenli tarafta kalmak için) büyük veriyi normal şekilde
// indirip hem cihaza hem bellek önbelleğine yazar.
// - veriTuru: meta kaydının anahtarı (genelde cloudPath ile aynı, kısa/benzersiz bir isim)
// - loadCloudDataFn: büyük veriyi buluttan çeken mevcut fonksiyon (ör. loadReportFromCloud)
// - loadLocalDataFn: büyük veriyi cihazdan (IndexedDB) çeken mevcut fonksiyon
async function cloudVeriVerimliYukle(veriTuru, loadCloudDataFn, loadLocalDataFn){
  const bilinenZamanlar = await cloudMetaZamanlariniYukle();
  const bilinenZaman = bilinenZamanlar[veriTuru];
  const uzakMeta = await cloudMetaOkuUzaktan(veriTuru);
  if(uzakMeta && bilinenZaman!=null && uzakMeta.updatedAt === bilinenZaman){
    // Bulut hiç değişmemiş — büyük veriyi indirmeye gerek yok, cihazdaki kopya yeterli.
    const yerelVeri = await loadLocalDataFn();
    if(yerelVeri) return {data: yerelVeri, source: 'local-uptodate'};
    // Cihazda beklenmedik şekilde veri yoksa (ör. cihaz değişmiş), yine de buluttan indir.
  }
  const uzakVeri = await loadCloudDataFn();
  if(uzakVeri){
    // Meta bilgisi varsa onu kullan, yoksa (eski kayıtlarda meta hiç yazılmamışsa) "şimdi"yi
    // bilinen zaman olarak işaretle — bir sonraki açılışta en azından bu andan itibaren
    // karşılaştırma yapılabilsin.
    await cloudMetaZamaniKaydet(veriTuru, uzakMeta ? uzakMeta.updatedAt : Date.now());
    return {data: uzakVeri, source: 'cloud'};
  }
  return {data: null, source: 'none'};
}

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCFZzzbL7NqJ_OmY1_sUqC7CrM_VUkD1U0',
  authDomain: 'bayrampasa-3d357.firebaseapp.com',
  databaseURL: CLOUD.dbUrl,
  projectId: 'bayrampasa-3d357',
  storageBucket: 'bayrampasa-3d357.firebasestorage.app',
  messagingSenderId: '965287599513',
  appId: '1:965287599513:web:951cece4edc78bcc8a8708',
  measurementId: 'G-W2R9LDQ847',
};

let authAktif = false;
// BULUTSUZ TEST MODU: Firebase auth'u hiç başlatma — giriş ekranı istenmez, uygulama doğrudan açılır.
if(!BULUTSUZ_TEST){
try{
  if(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'BURAYA_FIREBASE_API_KEY_YAPIŞTIRIN' && window.firebaseAuthAPI){
    // Modüler SDK: initializeApp/getAuth doğrudan çağrılan fonksiyonlardır (namespaced
    // firebase.initializeApp() yerine) — sonucu window.firebaseAuthAPI.authInstance'a
    // yazıyoruz, aşağıdaki tüm auth işlemleri bu instance üzerinden yapılır.
    const app = window.firebaseAuthAPI.initializeApp(FIREBASE_CONFIG);
    window.firebaseAuthAPI.authInstance = window.firebaseAuthAPI.getAuth(app);
    authAktif = true;
  }
}catch(err){ console.error('Firebase Authentication başlatılamadı:', err); }
}

// PERFORMANS DÜZELTMESİ: Açılışta 10 bulut isteği paralel (Promise.all ile) tetiklendiğinde,
// her biri authQuery() çağırıp KENDİ getIdToken(true) isteğini atıyordu — yani aynı anda 10 ayrı
// "taze token" isteği Firebase Auth sunucusuna gidiyordu, hepsi de pratikte aynı token'ı
// döndürecekken. Aşağıdaki kısa ömürlü paylaşımlı önbellek (AUTH_TOKEN_TAZELIK_MS içinde),
// eşzamanlı/art arda gelen çağrıların TEK bir getIdToken(true) isteğini paylaşmasını sağlıyor.
// 401 riskini azaltan asıl davranış (her birkaç saniyede bir taze token) korunuyor; sadece aynı
// anda başlayan onlarca isteğin birbirini kopyalaması önleniyor.
const AUTH_TOKEN_TAZELIK_MS = 4000;
let authTokenOnbellek = null; // {token, alinanZaman}
let authTokenBekleyenIstek = null; // devam eden getIdToken(true) Promise'i (varsa)
async function authQuery(){
  if(!authAktif) return '';
  try{
    const user = window.firebaseAuthAPI.authInstance.currentUser;
    if(!user) return '';
    const simdi = Date.now();
    if(authTokenOnbellek && (simdi - authTokenOnbellek.alinanZaman) < AUTH_TOKEN_TAZELIK_MS){
      return '?auth=' + authTokenOnbellek.token;
    }
    // Zaten devam eden bir yenileme isteği varsa (paralel çağrılar), onun sonucunu paylaş —
    // ikinci bir getIdToken(true) daha başlatma.
    if(!authTokenBekleyenIstek){
      // getIdToken() (parametresiz) SDK'nın önbellekteki token'ını döndürür; süresi dolmuşsa normalde
      // otomatik yeniler ama nadiren (saat kayması, arka arkaya çok sayıda eşzamanlı çağrı vb.) bunu
      // atlayıp süresi geçmiş bir token döndürebilir — bu da TÜM bulut isteklerinin aynı anda 401
      // almasına yol açar. getIdToken(true) her seferinde sunucudan taze bir token ister, bu riski ortadan kaldırır.
      //
      // KRİTİK DÜZELTME (açılış donması): getIdToken(true) bir AĞ isteğidir ve kendi başına
      // TIMEOUT'U YOKTUR. Ağ kötüyse / Firebase Auth yanıt vermezse bu Promise hiç resolve olmaz;
      // authQuery her bulut isteğinde çağrıldığı için açılıştaki Promise.all SONSUZA KADAR asılı
      // kalır (kullanıcıda "sürekli yükleniyor, hata yok" belirtisi). Aşağıdaki yarış (race), token
      // AUTH_TOKEN_TIMEOUT_MS içinde gelmezse isteği reddeder — böylece bulut isteği "auth'suz"
      // devam eder (veya üstteki catch boş döndürür) ve uygulama donmak yerine cihazdaki veriyle açılır.
      const AUTH_TOKEN_TIMEOUT_MS = 10000;
      const tokenIstegi = user.getIdToken(true)
        .then(token=>{ authTokenOnbellek = {token, alinanZaman: Date.now()}; return token; });
      const zamanAsimi = new Promise((_, reject)=> setTimeout(()=> reject(new Error('auth-token-timeout')), AUTH_TOKEN_TIMEOUT_MS));
      authTokenBekleyenIstek = Promise.race([tokenIstegi, zamanAsimi])
        .finally(()=>{ authTokenBekleyenIstek = null; });
    }
    const token = await authTokenBekleyenIstek;
    return '?auth=' + token;
  }catch(err){ return ''; }
}

function girisEkraniGoster(){
  document.getElementById('authGate').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('authLogoutBtn').style.display = 'none';
}
function girisEkraniGizle(){
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('authLogoutBtn').style.display = 'inline-block';
  // ERTELEME DÜZELTMESİ: uygulamayiBaslat, 03-veri-yukleme-ve-senkron.js'de tanımlıdır — bu dosya
  // (02) henüz o script yüklenmeden ÖNCE (defer sırasına göre) top-level'da çalışabilir/çağrılabilir.
  // Doğrudan çağrı "uygulamayiBaslat is not defined" ile patlıyordu (BULUTSUZ_TEST kapalıyken bile,
  // kullanıcı fiilen giriş yaptığında). window.addEventListener('load') tüm script'ler ve DOM
  // tamamen hazır olduktan sonra çalışır — bu, tarayıcı sekmesi tamamen yüklendiğinde (image/css
  // dahil her şey biter) tetiklenen en son olay olduğundan güvenli bir erteleme noktasıdır.
  if(document.readyState === 'complete') uygulamayiBaslat();
  else window.addEventListener('load', ()=> uygulamayiBaslat(), {once:true});
}

if(authAktif){
  // Modüler API'de onAuthStateChanged(auth, callback) şeklinde çağrılır — namespaced
  // firebase.auth().onAuthStateChanged(callback) yerine, auth instance'ı ilk parametre olur.
  window.firebaseAuthAPI.onAuthStateChanged(window.firebaseAuthAPI.authInstance, user=>{
    if(user) girisEkraniGizle(); else girisEkraniGoster();
  });
}else{
  dwarn('Firebase Authentication yapılandırılmadı veya BULUTSUZ_TEST açık — giriş ekranı devre dışı.');
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  // Auth atlandığında uygulamayı doğrudan başlat (girisEkraniGizle normalde bunu yapardı).
  // Aynı erteleme düzeltmesi burada da gereklidir — bkz. girisEkraniGizle'deki not.
  if(document.readyState === 'complete') uygulamayiBaslat();
  else window.addEventListener('load', ()=> uygulamayiBaslat(), {once:true});
}

const KULLANICI_KODU_UZANTISI = '@kullanici.noktacari';
function kullaniciKoduEmaile(kod){
  return String(kod||'').trim() + KULLANICI_KODU_UZANTISI;
}

document.getElementById('authLoginBtn').addEventListener('click', async ()=>{
  const kod = document.getElementById('authKullaniciKodu').value.trim();
  const pass = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  const statusEl = document.getElementById('authStatus');
  errEl.style.display = 'none';
  if(!kod || !pass){
    errEl.textContent = 'Kullanıcı kodu ve şifre gerekli.';
    errEl.style.display = 'block';
    return;
  }
  statusEl.textContent = 'Giriş yapılıyor…';
  statusEl.style.display = 'block';
  try{
    // Modüler API'de signInWithEmailAndPassword(auth, email, pass) — auth instance'ı ilk parametre.
    await window.firebaseAuthAPI.signInWithEmailAndPassword(window.firebaseAuthAPI.authInstance, kullaniciKoduEmaile(kod), pass);
    statusEl.style.display = 'none';
  }catch(err){
    statusEl.style.display = 'none';
    errEl.textContent = 'Giriş başarısız: kullanıcı kodu veya şifre hatalı.';
    errEl.style.display = 'block';
  }
});
document.getElementById('authPassword').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('authLoginBtn').click();
});
document.getElementById('authLogoutBtn').addEventListener('click', ()=>{
  if(authAktif) window.firebaseAuthAPI.signOut(window.firebaseAuthAPI.authInstance);
});

async function saveReportToCloud(report){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CLOUD.path}.json${await authQuery()}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(report),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    // Veri kaydedildikten hemen sonra küçük meta zaman damgası da yazılır — bir sonraki
    // yüklemede (bu cihazdan veya başka bir cihazdan) büyük veri hiç indirilmeden "değişmiş
    // mi" kontrolü yapılabilsin diye.
    const simdi = Date.now();
    // META GÜVENİLİRLİK DÜZELTMESİ: Rapor PUT'u başarılı ama meta yazımı başarısız olursa, diğer
    // cihazların 20 sn'lik otomatik senkron kontrolü (yalnızca meta damgasını karşılaştırır)
    // değişikliği HİÇ göremiyordu. Meta yazılamazsa bir kez daha denenir; yine olmazsa veri zaten
    // bulutta güvende olduğundan işlem başarılı sayılır ama konsola hata düşer (tam yükleme
    // akışları meta olmadan da güvenli tarafta kalıp veriyi indirir — bkz. cloudVeriVerimliYukle).
    let metaOk = await cloudMetaYazUzaktan(CLOUD.path, simdi);
    if(!metaOk) metaOk = await cloudMetaYazUzaktan(CLOUD.path, simdi);
    await cloudMetaZamaniKaydet(CLOUD.path, simdi);
    // Otomatik arka plan senkronizasyonuna (bkz. otomatikBulutSenkronizasyonuKontrolEt) bu
    // yazmanın KENDİ cihazımızdan geldiğini bildiriyoruz — aksi halde bir sonraki polling turu
    // "değişiklik var" sanıp raporu gereksiz yere tekrar indirir (zararsız ama gereksiz trafik).
    if(typeof otomatikSenkronBilinenZaman !== 'undefined') otomatikSenkronBilinenZaman = simdi;
    return {ok:true};
  }catch(err){
    console.error('Rapor buluta kaydedilemedi:', err);
    return {ok:false, reason:err.message};
  }
}

async function loadReportFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CLOUD.path}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    });
  }catch(err){
    console.error('Bulut verisi okunamadı:', err);
    return null;
  }
}

const MUSTERI_MASTER_CLOUD_PATH = CLOUD.path + '_musteriMaster';
const MUSTERI_MASTER_LOCAL_KEY = 'noktaCariTakip_musteriMaster_v1';
// Senet basımı için müşteri detayı (Tabela Adı, Vergi No/TC Kimlik No, Adres, İl) — aynı Müşteri
// Master dosyasından, temsilci haritasıyla birlikte ama AYRI bir kayıt olarak saklanır.
const MUSTERI_MASTER_DETAY_CLOUD_PATH = CLOUD.path + '_musteriMasterDetay';
const MUSTERI_MASTER_DETAY_LOCAL_KEY = 'noktaCariTakip_musteriMasterDetay_v1';
// Sell Out Raporu'nda FKNS (Fatura Kesilen Nokta Sayısı) hesaplaması için, Müşteri Master
// dosyasındaki nokta durumu (Aktif/Pasif) — temsilci haritasıyla birlikte ama AYRI kaydedilir.
const MUSTERI_MASTER_DURUM_CLOUD_PATH = CLOUD.path + '_musteriMasterDurum';
const MUSTERI_MASTER_DURUM_LOCAL_KEY = 'noktaCariTakip_musteriMasterDurum_v1';
// Açık Kanal / Kapalı Kanal FKNS ayrımı için, Müşteri Master dosyasındaki "Satış Kanalı Tanımı"
// kolonu — temsilci/durum haritalarıyla birlikte ama AYRI kaydedilir (aynı desen).
const MUSTERI_MASTER_KANAL_CLOUD_PATH = CLOUD.path + '_musteriMasterKanal';
const MUSTERI_MASTER_KANAL_LOCAL_KEY = 'noktaCariTakip_musteriMasterKanal_v1';
// Müşteri -> temsilci -> SSM ilişkisinin tek kaynağı da Müşteri Master'dır. Bu kayıt hem müşteri
// bazlı kesin eşlemeyi hem temsilci bazlı toplu raporların kullanacağı eşlemeyi birlikte tutar.
// Yeni master yüklendiğinde PUT ile tamamı değiştirilir; böylece eski SSM/temsilci ilişkileri kalmaz.
const MUSTERI_MASTER_SSM_CLOUD_PATH = CLOUD.path + '_musteriMasterSsm';
const MUSTERI_MASTER_SSM_LOCAL_KEY = 'noktaCariTakip_musteriMasterSsm_v1';

const SSM_KOLON_ADAYLARI = ['Dist Satış Şefi Adı','Satış Müdürü Adı','Saha Satış Müdürü','Saha Satış Müdürü Adı','SSM'];
// İki aşamalı oran filtresi: masterın toplam benzersiz müşterilerinin %1'inden azına bağlı satış
// şefleri genel anomali sayılıp tamamen yok sayılır. Kalan geçerli şefler içinde de bir temsilcinin
// müşteri tabanının %5'inden azında görünen farklı şef adı o temsilci için veri anomalisi sayılır.
const SSM_ASGARI_GENEL_MUSTERI_PAYI = 0.01;
const SSM_ASGARI_MUSTERI_PAYI = 0.05;
function musteriMasterSsmKolonunuBul(headers){
  const set = new Set((headers||[]).map(h=>String(h||'').trim()));
  return SSM_KOLON_ADAYLARI.find(k=>set.has(k)) || null;
}

function buildMusteriMasterSsmIliskileri(rows, headers){
  const musteriMap = new Map();
  const musteriTemsilciMap = new Map();
  const temsilciSsmMusterileri = new Map();
  const kolon = musteriMasterSsmKolonunuBul(headers || (rows && rows[0] ? Object.keys(rows[0]) : []));
  if(!kolon) return {musteriMap, temsilciMap:new Map(), iliskiMap:new Map(), kolon:null};

  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    const temsilci = String(r['Satış Temsilcisi Adı']||'').trim();
    const ssm = String(r[kolon]||'').trim();
    if(musteri && ssm) musteriMap.set(musteri, ssm);
    if(musteri && temsilci) musteriTemsilciMap.set(musteri, normalizeAdSoyad(temsilci));
    if(!musteri || !temsilci || !ssm) return;
    const temsilciKey = normalizeAdSoyad(temsilci);
    const ikiliKey = temsilciKey+'\u0000'+ssm;
    if(!temsilciSsmMusterileri.has(ikiliKey)) temsilciSsmMusterileri.set(ikiliKey, new Set());
    temsilciSsmMusterileri.get(ikiliKey).add(musteri);
  });

  const kazananlar = new Map();
  const temsilciMap = new Map();
  const tumSsmMusterileri = new Map();
  const tumSsmMusteriSeti = new Set();
  temsilciSsmMusterileri.forEach((musteriler, ikiliKey)=>{
    const ssm = ikiliKey.slice(ikiliKey.indexOf('\u0000')+1);
    if(!tumSsmMusterileri.has(ssm)) tumSsmMusterileri.set(ssm, new Set());
    musteriler.forEach(m=>{ tumSsmMusterileri.get(ssm).add(m); tumSsmMusteriSeti.add(m); });
  });
  // Temsilcisi boş (Key Account) müşteriler de genel satış şefi oranının paydasına ve sayımına girer.
  musteriMap.forEach((ssm,musteri)=>{
    if(!tumSsmMusterileri.has(ssm)) tumSsmMusterileri.set(ssm, new Set());
    tumSsmMusterileri.get(ssm).add(musteri);
    tumSsmMusteriSeti.add(musteri);
  });
  const gecerliSatisSefleri = new Set();
  tumSsmMusterileri.forEach((musteriler,ssm)=>{
    if(musteriler.size / (tumSsmMusteriSeti.size||1) >= SSM_ASGARI_GENEL_MUSTERI_PAYI) gecerliSatisSefleri.add(ssm);
  });

  // Genel oran filtresinden geçen adaylar arasından temsilcinin baskın satış şefini yeniden seç.
  kazananlar.clear();
  temsilciSsmMusterileri.forEach((musteriler, ikiliKey)=>{
    const ayir = ikiliKey.indexOf('\u0000');
    const temsilciKey = ikiliKey.slice(0, ayir);
    const ssm = ikiliKey.slice(ayir+1);
    if(!gecerliSatisSefleri.has(ssm)) return;
    const adet = musteriler.size;
    const mevcut = kazananlar.get(temsilciKey);
    if(!mevcut || adet > mevcut.adet) kazananlar.set(temsilciKey, {ssm, adet});
  });
  kazananlar.forEach((v,k)=>temsilciMap.set(k,v.ssm));

  // Düşük paylı SSM adlarını müşteri bazlı kesin haritadan da çıkar: aksi halde temsilci toplamı
  // doğru görünse bile o tekil müşterinin detayında eski/yanlış müdür yeniden görünebilirdi.
  const temsilciToplamlari = new Map();
  temsilciSsmMusterileri.forEach((musteriler, ikiliKey)=>{
    const temsilciKey = ikiliKey.slice(0, ikiliKey.indexOf('\u0000'));
    temsilciToplamlari.set(temsilciKey, (temsilciToplamlari.get(temsilciKey)||0) + musteriler.size);
  });
  musteriMap.forEach((ssm, musteri)=>{
    const temsilciKey = musteriTemsilciMap.get(musteri);
    const baskinSsm = temsilciMap.get(temsilciKey);
    if(!gecerliSatisSefleri.has(ssm)){
      if(baskinSsm) musteriMap.set(musteri, baskinSsm); else musteriMap.delete(musteri);
      return;
    }
    if(!temsilciKey || !baskinSsm || ssm===baskinSsm) return;
    const ikiliMusterileri = temsilciSsmMusterileri.get(temsilciKey+'\u0000'+ssm);
    const pay = (ikiliMusterileri ? ikiliMusterileri.size : 0) / (temsilciToplamlari.get(temsilciKey)||1);
    if(pay < SSM_ASGARI_MUSTERI_PAYI) musteriMap.set(musteri, baskinSsm);
  });

  const iliskiMap = new Map();
  const musteriTemsilci = buildMusteriMasterMap(rows);
  musteriTemsilci.forEach((satisTemsilcisi, musteri)=>{
    const satisSefi = musteriMap.get(musteri) || temsilciMap.get(normalizeAdSoyad(satisTemsilcisi)) || 'Tanımsız';
    iliskiMap.set(musteri, {satisTemsilcisi, satisSefi});
    if(satisSefi!=='Tanımsız') musteriMap.set(musteri, satisSefi);
  });
  return {musteriMap, temsilciMap, iliskiMap, kolon};
}

function buildMusteriMasterMap(rows){
  const map = new Map();
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    let temsilci = String(r['Satış Temsilcisi Adı']||'').trim();
    if(!temsilci) temsilci = 'Key Account';
    map.set(musteri, temsilci);
  });
  return map;
}
// Müşteri Master dosyasındaki "Müşteri Adı" sütunu genellikle aynı ismi iki kez art arda içerir
// (örn. "SEVİM ÇAVUŞ Sevim Çavuş" — önce büyük harf, sonra normal yazım). Kelime sayısı çift ve
// ilk yarı ile ikinci yarı (Türkçe harf duyarlılığı gözetilerek) aynıysa yalnızca ilk yarı bırakılır;
// eşleşmiyorsa (örn. gerçekten farklı iki kelime/şirket adıysa) metin olduğu gibi korunur.
function musteriAdiTekillestir(ad){
  const temiz = String(ad||'').trim().replace(/\s+/g,' ');
  if(!temiz) return temiz;
  const kelimeler = temiz.split(' ');
  if(kelimeler.length < 2 || kelimeler.length % 2 !== 0) return temiz;
  const yari = kelimeler.length / 2;
  const ilkYari = kelimeler.slice(0, yari).join(' ');
  const ikinciYari = kelimeler.slice(yari).join(' ');
  return ilkYari.toLocaleUpperCase('tr-TR') === ikinciYari.toLocaleUpperCase('tr-TR') ? ilkYari : temiz;
}

// Senet basımında kullanılacak müşteri kimlik/adres bilgileri. Vergi No varsa (tüzel kişi) o, yoksa
// TC Kimlik No (şahıs) kullanılır. "İl" alanı, senetteki "Keşide Yeri" için de kullanılır.
function buildMusteriMasterDetay(rows){
  const map = new Map();
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    map.set(musteri, {
      tabelaAdi: String(r['Tabela Adı']||'').trim(),
      musteriAdi: musteriAdiTekillestir(r['Müşteri Adı']),
      vergiNo: String(r['Vergi No']||'').trim(),
      tcKimlikNo: String(r['TC Kimlik No']||'').trim(),
      adres: String(r['Sevk Adresi']||'').trim(),
      il: String(r['İl']||'').trim(),
      ilce: String(r['İlçe']||'').trim(),
    });
  });
  return map;
}
function musteriMasterMapToObj(map){ const o={}; map.forEach((v,k)=>{ o[k]=v; }); return o; }
function musteriMasterObjToMap(obj){ return new Map(Object.entries(obj||{})); }

// Müşteri Master dosyasında nokta durumunu (Aktif/Pasif) taşıyan kolonun adı dosyadan dosyaya
// değişebilir — bu yüzden bilinen aday kolon adları sırayla denenir, ilk bulunan kullanılır.
// Gerçek dosyanızdaki kolon adı bu listede yoksa, buraya eklemeniz yeterlidir.
const DURUM_KOLON_ADAYLARI = ['Durum','Statü','Müşteri Statüsü','Müşteri Durumu','Hesap Durumu','Nokta Durumu','Aktiflik Durumu','Status','Cari Durum'];
function musteriDurumKolonunuBul(headers){
  const set = new Set((headers||[]).map(h=>String(h||'').trim()));
  return DURUM_KOLON_ADAYLARI.find(k=>set.has(k)) || null;
}
function buildMusteriMasterDurumMap(rows, headers){
  const map = new Map();
  const kolon = musteriDurumKolonunuBul(headers || (rows && rows[0] ? Object.keys(rows[0]) : []));
  if(!kolon) return map; // Durum kolonu bulunamadı — harita boş döner, FKNS hesaplamasında tüm noktalar aktif varsayılır.
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    const ham = String(r[kolon]||'').trim();
    const normalize = ham.toLocaleUpperCase('tr-TR');
    map.set(musteri, normalize === 'AKTİF' || normalize === 'AKTIF' ? 'Aktif' : (ham || 'Pasif'));
  });
  return map;
}
// Açık Kanal / Kapalı Kanal FKNS ayrımı için Müşteri Master'daki "Satış Kanalı Tanımı" kolonu —
// aynı ham değer kümesi Sell Out dosyasındaki "Müşteri Kanalı Tnm." ile birebir örtüşüyor (Standart
// Açık/Standart Kapalı/Otel/Horeca/Ekomini), bu yüzden aynı eşleme (sellOutKanalSinifla'nın temel
// KAPALI_KANAL_DEGERLERI/ACIK_KANAL_DEGERLERI kümeleri, bkz. 08-kanal-raporlari.js) burada da
// kullanılır. "Key Account" gibi bu kümelerin dışında kalan değerler kasıtlı olarak null döner —
// bu müşteriler ne Açık ne Kapalı Kanal FKNS paydasına dahil edilmez, sadece Toplam FKNS'ye girer
// (kullanıcı kararı).
function musteriMasterKanalSinifla(satisKanaliTanimiRaw){
  const v = String(satisKanaliTanimiRaw||'').trim();
  // KAPALI_KANAL_DEGERLERI / ACIK_KANAL_DEGERLERI, js/08-kanal-raporlari.js içinde tanımlıdır
  // (Sell Out dosyasındaki aynı isimli sınıflandırma için); bu fonksiyon sadece kullanıcı bir
  // yükleme/rapor işlemi tetiklediğinde (tüm script dosyaları çoktan yüklenmiş haldeyken) çağrıldığı
  // için script sırası burada sorun yaratmaz.
  if(KAPALI_KANAL_DEGERLERI.has(v)) return 'Kapalı Kanal';
  if(ACIK_KANAL_DEGERLERI.has(v)) return 'Açık Kanal';
  return null;
}
function buildMusteriMasterKanalMap(rows){
  const map = new Map();
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    const kanal = musteriMasterKanalSinifla(r['Satış Kanalı Tanımı']);
    if(kanal) map.set(musteri, kanal);
  });
  return map;
}
// Nokta statüsü "Pasif" veya "İptal" (yazım/boşluk farklarına toleranslı) ise true döner — Sell Out
// Raporu'nda bu noktalar hem "Fatura kesilmeyen aktif noktalar" listesinden hem de FKNS
// hesaplamasından (payda/pay) tamamen çıkarılır. Durum metninde geçen başka ifadeler (örn. "Beklemede",
// "Yeni Nokta" gibi Aktif dışı ama Pasif/İptal de olmayan statüler) burada elenmez — sadece açıkça
// Pasif veya İptal olanlar hesap dışına alınır.
function noktaPasifVeyaIptalMi(durum){
  if(!durum) return false;
  const n = String(durum).trim().toLocaleUpperCase('tr-TR');
  if(!n) return false;
  return n.includes('PASİF') || n.includes('PASIF') || n.includes('İPTAL') || n.includes('IPTAL');
}

async function saveMusteriMasterToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master cihaza kaydedilemedi.');
}
async function loadMusteriMasterFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

async function saveMusteriMasterDetayToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DETAY_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_DETAY_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_DETAY_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master Detay buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterDetayFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DETAY_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master Detay buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterDetayToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_DETAY_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master Detay cihaza kaydedilemedi.');
}
async function loadMusteriMasterDetayFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_DETAY_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_DETAY_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

// Çek/Senet Tahsil Edildi onayları — cihaza (IndexedDB) VE bulut açıksa (BULUTSUZ_TEST=false)
// Firebase'e de kaydedilir. Set halinde tutulan senetAnahtari değerleri (hem çek hem senet
// kayıtları için), kayıt için diziye çevrilip saklanır. Eski anahtar adı (v1) geriye dönük
// okunur, yeni anahtarla (v2) yazılır.
const CEK_SENET_TAHSIL_ONAY_LOCAL_KEY = 'noktaCariTakip_cekSenetTahsilOnaylari_v2';
const CEK_SENET_TAHSIL_ONAY_LOCAL_KEY_ESKI = 'noktaCariTakip_senetTahsilOnaylari_v1';
const CEK_SENET_TAHSIL_ONAY_CLOUD_PATH = CLOUD.path + '_cekSenetTahsilOnaylari';
async function saveSenetTahsilOnaylariToCloud(arr){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CEK_SENET_TAHSIL_ONAY_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(arr),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Çek/Senet tahsil onayları buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadSenetTahsilOnaylariFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CEK_SENET_TAHSIL_ONAY_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Çek/Senet tahsil onayları buluttan okunamadı:', err); return null; }
}
async function saveSenetTahsilOnaylariToLocal(){
  const arr = Array.from(state.cekSenetTahsilOnaylari||[]);
  try{
    const ok = await idbSet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY, arr);
    if(!ok) console.error('Çek/Senet tahsil onayları cihaza kaydedilemedi.');
  }catch(err){ console.error(err); }
  // Bulut açıksa aynı anda oraya da yazılır — cihaz kaydı başarısız olsa bile bulut denemesi
  // ayrıca yapılır (biri diğerini engellemesin diye ayrı try/catch, Promise.all ile paralel).
  if(cloudEnabled()){
    const sonuc = await saveSenetTahsilOnaylariToCloud(arr);
    if(!sonuc.ok) console.error('UYARI: Çek/Senet tahsil onayı buluta yazılamadı, sadece cihazda kaldı.');
    return sonuc.ok;
  }
  return true;
}
async function loadSenetTahsilOnaylariFromLocal(){
  try{
    // Bulut açıksa ÖNCE bulut denenir (diğer cihazlarda/tarayıcılarda yapılan onaylar da görünsün);
    // bulut yoksa/erişilemezse cihazdaki (IndexedDB) son bilinen haline düşülür.
    let arr = cloudEnabled() ? await loadSenetTahsilOnaylariFromCloud() : null;
    if(!Array.isArray(arr) || !arr.length){
      arr = await idbGet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY);
    }
    if(!Array.isArray(arr) || !arr.length){
      // Geriye dönük uyumluluk: önceden sadece Senet onayları bu eski anahtarla kaydedilmişti.
      const eski = await idbGet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY_ESKI);
      if(Array.isArray(eski) && eski.length) arr = eski;
    }
    state.cekSenetTahsilOnaylari = new Set(Array.isArray(arr) ? arr : []);
    // Cihazdaki kopyayı bulutla/eski anahtarla senkron tut (bir sonraki açılış hızlı olsun).
    if(Array.isArray(arr) && arr.length) idbSet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY, arr).catch(()=>{});
  }catch(err){ console.error(err); state.cekSenetTahsilOnaylari = new Set(); }
}

// Malzemeler (anlık depo stoğu) — son yüklenen dosya buluta kaydedilir, yeni biri yüklenene
// kadar kullanılmaya devam eder (Müşteri Master ile aynı desen). Stok Gün sekmesi açıldığında
// bu kayıt otomatik geri yüklenir, kullanıcı her seferinde dosyayı tekrar yüklemek zorunda kalmaz.
// Kullanıcı isteği (24.07.2026, genişletme): işaretli satırlar Bayi Hakediş içinde ayrı bir
// "Faturası Alınanlar" alt-sekmesinde, Temsilci/Müşteri filtreli olarak tam detaylarıyla (kaynak,
// belge no, tutar, tarih, temsilci) listelenir. Bu yüzden artık sadece belgeNo değil, işaretleme
// ANINDAKİ tam satır detayı saklanır — rapor daha sonra değişse/silinse bile bu liste kendi başına
// eksiksiz kalır. Yapı: {[belgeNo]: {belgeNo, musteriKod, musteriAdi, temsilci, kaynak, tarih(ISO),
// tutarHaric, tutarKdvli, isaretlemeZamani(ISO)}} — düz obje, ciroPrimiArsivi ile aynı mimari
// (JSON/Firebase uyumlu, buluta öncelikli). Tıklanan satıra tekrar tıklanırsa kayıt SİLİNİR (toggle).
const HAKEDIS_FATURA_ALINDI_LOCAL_KEY = 'noktaCariTakip_hakedisFaturaAlindi_v2';
const HAKEDIS_FATURA_ALINDI_CLOUD_PATH = CLOUD.path + '_hakedisFaturaAlindi';
async function saveHakedisFaturaAlindiToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${HAKEDIS_FATURA_ALINDI_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Hakediş fatura alındı işaretleri buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadHakedisFaturaAlindiFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${HAKEDIS_FATURA_ALINDI_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Hakediş fatura alındı işaretleri buluttan okunamadı:', err); return null; }
}
async function saveHakedisFaturaAlindiToLocal(){
  const obj = state.hakedisFaturaAlindi || {};
  try{
    const ok = await idbSet(HAKEDIS_FATURA_ALINDI_LOCAL_KEY, obj);
    if(!ok) console.error('Hakediş fatura alındı işaretleri cihaza kaydedilemedi.');
  }catch(err){ console.error(err); }
  if(cloudEnabled()){
    const sonuc = await saveHakedisFaturaAlindiToCloud(obj);
    if(!sonuc.ok){
      console.error('UYARI: Hakediş fatura alındı işareti buluta yazılamadı, sadece cihazda kaldı.');
      alert('UYARI: Bu işaretleme buluta kaydedilemedi — diğer cihazlarda görünmeyebilir. Bağlantınızı kontrol edip tekrar deneyin.');
    }
    return sonuc.ok;
  }
  return true;
}
async function loadHakedisFaturaAlindiFromLocal(){
  try{
    let obj = cloudEnabled() ? await loadHakedisFaturaAlindiFromCloud() : null;
    if(!obj || typeof obj !== 'object' || Array.isArray(obj) || !Object.keys(obj).length){
      const cihazVeri = await idbGet(HAKEDIS_FATURA_ALINDI_LOCAL_KEY);
      if(cihazVeri && typeof cihazVeri === 'object' && !Array.isArray(cihazVeri)) obj = cihazVeri;
    }
    const yuklenen = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    state.hakedisFaturaAlindi = typeof hakedisFaturaAlindiKayitlariniNormalizeEt === 'function'
      ? hakedisFaturaAlindiKayitlariniNormalizeEt(yuklenen)
      : yuklenen;
    if(Object.keys(state.hakedisFaturaAlindi).length) idbSet(HAKEDIS_FATURA_ALINDI_LOCAL_KEY, state.hakedisFaturaAlindi).catch(()=>{});
  }catch(err){ console.error(err); state.hakedisFaturaAlindi = {}; }
}
// Bir hakediş satırını işaretle/kaldır (toggle) ve kalıcı hale getir. `detay` yalnızca YENİ
// işaretlemede kullanılır (kaldırırken gerekmez). DÖNÜŞ: yeni durum (true=işaretli).
async function hakedisFaturaAlindiToggle(belgeNo, detay){
  if(!belgeNo) return false;
  const key = typeof hakedisBelgeNoAnahtari === 'function' ? hakedisBelgeNoAnahtari(belgeNo) : String(belgeNo).trim();
  if(!key) return false;
  if(!state.hakedisFaturaAlindi) state.hakedisFaturaAlindi = {};
  const simdiIsaretliMi = !!state.hakedisFaturaAlindi[key];
  if(simdiIsaretliMi){
    delete state.hakedisFaturaAlindi[key];
  } else {
    state.hakedisFaturaAlindi[key] = Object.assign({belgeNo:key, isaretlemeZamani:new Date().toISOString()}, detay||{});
  }
  await saveHakedisFaturaAlindiToLocal();
  return !simdiIsaretliMi;
}

const MALZEMELER_STOK_CLOUD_PATH = CLOUD.path + '_malzemelerStok';
const MALZEMELER_STOK_LOCAL_KEY = 'noktaCariTakip_malzemelerStok_v1';
async function saveMalzemelerStokToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MALZEMELER_STOK_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MALZEMELER_STOK_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MALZEMELER_STOK_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Malzemeler stoğu buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMalzemelerStokFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MALZEMELER_STOK_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Malzemeler stoğu buluttan okunamadı:', err); return null; }
}
async function saveMalzemelerStokToLocal(obj){
  const ok = await idbSet(MALZEMELER_STOK_LOCAL_KEY, obj);
  if(!ok) console.error('Malzemeler stoğu cihaza kaydedilemedi.');
}
async function loadMalzemelerStokFromLocal(){
  try{ return await idbGet(MALZEMELER_STOK_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function malzemelerStokYenile(){
  let obj = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(MALZEMELER_STOK_CLOUD_PATH, loadMalzemelerStokFromCloud, loadMalzemelerStokFromLocal);
    obj = sonuc.data;
  }
  if(!obj) obj = await loadMalzemelerStokFromLocal();
  state.malzemelerStok = musteriMasterObjToMap(obj);
  return state.malzemelerStok;
}
async function malzemelerStokKaydet(map){
  state.malzemelerStok = map;
  const obj = musteriMasterMapToObj(map);
  await saveMalzemelerStokToLocal(obj);
  if(cloudEnabled()){
    const sonuc = await saveMalzemelerStokToCloud(obj);
    if(!sonuc.ok){
      // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez.
      console.error('Malzemeler Stok buluta kaydedilemedi:', sonuc.reason);
      alert('UYARI: Malzemeler Stok verisi buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur: ' + (sonuc.reason||'bilinmeyen hata'));
    }
  }
}

// ============================== GRUP A "TEK-SLOT" DOSYA KALICILIĞI ==============================
// Ana ekrandaki A Grubu dosyalarından Kalemler DIŞINDAKİ dördü (Ticari Stok, Çek/Senet Riski,
// Ciro Primi, Dönemsel İskonto) günlük olarak yeniden yüklenmesi beklenen ama HER GÜN mutlaka
// yüklenmesi gerekmeyen dosyalardır — Müşteri Master ve Malzemeler (Stok Gün) ile TAMAMEN AYNI
// deseni kullanırlar: en son yüklenen dosyanın HAM satırları (rows) + kolon başlıkları (headers)
// buluta (ve cihaza) tek bir slotta kaydedilir; yeni bir dosya yüklendiğinde öncekinin üzerine
// yazılır. "Raporu Oluştur" sırasında o dosya seçilmemişse, buluttan/cihazdan geri yüklenen en
// son bilinen hali otomatik olarak kullanılır — kullanıcı her gün bu 4 dosyayı yeniden yüklemek
// zorunda kalmaz. Kaydedilen obje şekli: {data: rows[], headers: string[], adi: string, tarih: ISO}.
const GRUP_A_TEKIL_DOSYA_TANIMLARI = {
  ticariStok: { cloudPath: CLOUD.path + '_ticariStokDosya', localKey: 'noktaCariTakip_ticariStokDosya_v1' },
  cekSenet: { cloudPath: CLOUD.path + '_cekSenetDosya', localKey: 'noktaCariTakip_cekSenetDosya_v1' },
  ciroPrimi: { cloudPath: CLOUD.path + '_ciroPrimiDosya', localKey: 'noktaCariTakip_ciroPrimiDosya_v1' },
  donemselIskonto: { cloudPath: CLOUD.path + '_donemselIskontoDosya', localKey: 'noktaCariTakip_donemselIskontoDosya_v1' },
  // Kalemler DE bu tek-slot desene dahildir. Kullanıcı gün içinde Kalemler'i SADECE BİR KEZ yükleyip
  // diğer dosyaları (Sipariş/Tahsilat/Fatura vb.) gün içinde birden çok kez güncelliyor — bu yüzden
  // Kalemler'in HAM (ham satırlar + başlıklar) hali burada saklanıp, o gün yeniden seçilmemişse
  // otomatik geri yükleniyor. Bu, Trend Analizi/Finansal Analiz'in kullandığı GÜN-GÜN musteriSnapshot
  // arşivini (bkz. faturaKontrolArsivineKaydetVeSenkronizeEt) HİÇ ETKİLEMEZ — o arşiv tamamen ayrı,
  // bağımsız bir mekanizma ve her "Raporu Oluştur/Veri Güncelle" işleminde günün altına eklenmeye
  // devam eder, hiçbir zaman silinmez/üzerine yazılmaz. Buradaki tek-slot kayıt SADECE
  // "buildReport()'un çalışabilmesi için gereken EN GÜNCEL HAM Kalemler verisi"ni saklar.
  kalemler: { cloudPath: CLOUD.path + '_kalemlerDosya', localKey: 'noktaCariTakip_kalemlerDosya_v1' },
  // GRUP B (Sipariş/Tahsilat/Fatura/Bayi Hakediş/Yükleme): Bu dosyalar da artık kalıcı
  // tek-slot arşivinde tutulur. Önceden yalnızca bellekteydi (state.files); sayfa yenilenip yeni
  // Kalemler yüklenince buildReport bunları bulamayıp müşteri kartlarından SİLİYORDU. Artık EN SON
  // yüklenen hali (tarih fark etmeksizin — toplu/çok-günlü dosyalar dahil, olduğu gibi) kalıcı
  // saklanır ve buildReport'a otomatik geri yüklenir. Bu, GÜN-GÜN faturaArsiv arşivini HİÇ ETKİLEMEZ
  // (o ayrı mekanizma; her satırı kendi gününe dağıtıp Belge No bazlı temizlikle biriktirmeye devam
  // eder). Buradaki tek-slot sadece "canlı kartların (Genel Rapor/Sevk) en son yüklenen dosyayı
  // yansıtabilmesi" içindir — kullanıcının onayladığı davranış: canlı kartlar en son yüklenen dosyayı
  // gösterir, geçmiş günler zaten arşivde/Fatura Kontrol'de kalıcı durur.
  siparis: { cloudPath: CLOUD.path + '_siparisDosya', localKey: 'noktaCariTakip_siparisDosya_v1' },
  tahsilat: { cloudPath: CLOUD.path + '_tahsilatDosya', localKey: 'noktaCariTakip_tahsilatDosya_v1' },
  fatura: { cloudPath: CLOUD.path + '_faturaDosya', localKey: 'noktaCariTakip_faturaDosya_v1' },
  bayiHakedis: { cloudPath: CLOUD.path + '_bayiHakedisHamDosya', localKey: 'noktaCariTakip_bayiHakedisHamDosya_v1' },
  yukleme: { cloudPath: CLOUD.path + '_yuklemeDosya', localKey: 'noktaCariTakip_yuklemeDosya_v1' },
  cariEkstre: { cloudPath: CLOUD.path + '_cariEkstreDosya', localKey: 'noktaCariTakip_cariEkstreDosya_v1' },
  rutPlani: { cloudPath: CLOUD.path + '_rutPlaniDosya', localKey: 'noktaCariTakip_rutPlaniDosya_v1' },
};

async function grupATekilDosyaKaydet(tip, data, headers, adi){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim) return {ok:false, reason:'Dosya türü tanımlı değil.'};
  // Cihaza (IndexedDB) düz obje olarak kaydedilir — orada anahtar kısıtlaması yoktur.
  const obj = { data: data||[], headers: headers||[], adi: adi||'', tarih: new Date().toISOString() };
  const ok = await idbSet(tanim.localKey, obj);
  if(!ok) console.error(LABELS[tip] + ' cihaza kaydedilemedi.');
  if(!cloudEnabled()) return {ok:true, localOnly:true, tarih:obj.tarih};
  try{
    // KRİTİK (HTTP 400 düzeltmesi): Firebase Realtime Database, ANAHTAR isimlerinde '.', '$', '#',
    // '[', ']', '/' karakterlerini yasaklar. Excel kolon başlıkları (ör. "Faturadan Sonr.Gün",
    // "Çek/Senet Numarası", "Depoda Kalan Mk.") doğrudan JSON anahtarı olarak yazılınca Firebase
    // PUT'u 400 Bad Request ile REDDEDİYORDU — bu yüzden hiçbir Grup A/C dosyası buluta yazılamıyordu.
    // Çözüm: data ve headers'ı tek bir JSON STRING olarak (dataJson/headersJson alanlarında) yaz —
    // string bir DEĞERdir, içindeki noktalar/slash'lar anahtar olmadığı için Firebase'i ilgilendirmez.
    const bulutObj = {
      dataJson: JSON.stringify(data||[]),
      headersJson: JSON.stringify(headers||[]),
      adi: adi||'',
      tarih: obj.tarih,
      format: 'json-string-v1', // okuma tarafı bu bayrakla yeni formatı tanır (eski kayıtlar düz obje)
    };
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${tanim.cloudPath}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bulutObj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(tanim.cloudPath, simdi);
    await cloudMetaZamaniKaydet(tanim.cloudPath, simdi);
    return {ok:true, tarih:obj.tarih};
  }catch(err){
    console.error(LABELS[tip] + ' buluta kaydedilemedi:', err);
    return {ok:false, reason:err && err.message ? err.message : String(err)};
  }
}

// Buluttan gelen Grup A tek-slot kaydını normalize eder: yeni format (dataJson/headersJson string)
// VEYA eski format (düz data/headers dizisi) — ikisini de {data, headers, adi, tarih} olarak döndürür.
function grupATekilKaydiCoz(ham){
  if(!ham || typeof ham !== 'object') return null;
  if(ham.format === 'json-string-v1' || typeof ham.dataJson === 'string'){
    let data = [], headers = [];
    try{ data = JSON.parse(ham.dataJson || '[]'); }catch(_){ data = []; }
    try{ headers = JSON.parse(ham.headersJson || '[]'); }catch(_){ headers = []; }
    return { data, headers, adi: ham.adi || '', tarih: ham.tarih || null };
  }
  // Eski (düz) format — geriye dönük uyumluluk.
  return { data: ham.data || [], headers: ham.headers || [], adi: ham.adi || '', tarih: ham.tarih || null };
}

async function grupATekilDosyaYerelOku(tip){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim) return null;
  try{ return await idbGet(tanim.localKey); }catch(err){ console.error(err); return null; }
}

async function grupATekilDosyaBuluttanOku(tip){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim || !cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${tanim.cloudPath}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    // Yeni (json-string-v1) VEYA eski (düz) formatı normalize et.
    return grupATekilKaydiCoz(JSON.parse(text));
  }catch(err){ console.error(LABELS[tip] + ' buluttan okunamadı:', err); return null; }
}

// Ticari Stok/Çek-Senet/Ciro Primi/Dönemsel İskonto için: bugün yeniden seçilmemişse, ne kadar eski
// olursa olsun en son bilinen hal sorgusuz kullanılır (bu dosyalar "her gün yüklenmesi gerekmez").
// KALEMLER ARTIK BU LİSTEYE DAHİL (kullanıcı kararı — büyük mimari değişiklik): "Kalemleri
// yüklemediği hiçbir gün veri yüklemesi yapamamalı" kuralı KALDIRILDI. Artık kart oluşturma
// Müşteri Master'a, bakiye Cari Ekstre'ye bağlı; Kalemler yalnızca (varsa) açık fatura detayı
// ekler ve diğer Grup A/B dosyaları gibi en son yüklenen hali kalıcı kalıp güne bakılmaksızın
// kullanılmaya devam eder (bkz. buildReport'taki yeni kart oluşturma mantığı).
const GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR = new Set(['ticariStok','ciroPrimi','donemselIskonto','kalemler',
  // Grup B de tarih kısıtlaması OLMADAN saklanır: en son yüklenen (çok-günlü/toplu dosyalar dahil)
  // tarih fark etmeksizin geri yüklenir. Yalnızca Kalemler bugüne-özeldi (artık değil).
  'siparis','tahsilat','fatura','bayiHakedis','yukleme','cariEkstre','rutPlani']);

// Bu dosyaların hepsini paralel olarak yükler; her biri için o gün ekranda yeni bir dosya SEÇİLMİŞSE
// (state.files[tip] doluysa) o veri KULLANILIR ve aynı zamanda yeni "son bilinen hal" olarak kaydedilir;
// seçilmemişse buluttan/cihazdan en son bilinen hal geri getirilip state.files[tip]'e (buildReport'un
// beklediği {data, headers} şekliyle) yerleştirilir — böylece buildReport çağrısı her zaman aynı arayüzü
// görür, dosyanın "bugün mü yüklendi yoksa önceki gün mü kaldı" farkını bilmesine gerek kalmaz.
//
// KALEMLER_BUGUN_ZORUNLU KALDIRILDI (kullanıcı kararı — büyük mimari değişiklik): Kalemler artık
// diğer Grup A/B dosyaları gibi davranır — en son yüklenen hali, günü ne olursa olsun, yeni bir
// dosya seçilene kadar kalıcı kullanılır. Kart oluşturma artık Müşteri Master'a, bakiye Cari
// Ekstre'ye bağlı olduğundan Kalemler'in "her gün zorunlu" olması gerekmiyor — Kalemler yalnızca
// (varsa) açık fatura detayı ekleyen opsiyonel bir kaynak. "Kalemler yüklendi mi?" durumunu
// güvenilir biçimde belirler ve state.bugunKalemlerHazir'a yazar (isim tarihsel nedenlerle
// korunmuştur, artık "bugüne özel" değil "herhangi bir zamanda yüklendi mi" anlamına gelir). İki
// kaynağa bakar: (1) bu oturumda bellekteki state.files.kalemler, (2) tek-slot Kalemler arşivinde
// (tarihi ne olursa olsun) bir kayıt var mı.
async function bugunKalemlerDurumTazele(){
  // 1) Bellekte bu oturumda yüklü mü?
  if(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length){
    state.bugunKalemlerHazir = true;
    return true;
  }
  // 2) Tek-slot arşivinde bir Kalemler kaydı var mı (tarihi ne olursa olsun)?
  try{
    let kayit = cloudEnabled() ? await grupATekilDosyaBuluttanOku('kalemler') : null;
    if(!kayit) kayit = await grupATekilDosyaYerelOku('kalemler');
    const varMi = !!(kayit && kayit.data && kayit.data.length);
    state.bugunKalemlerHazir = varMi;
    return varMi;
  }catch(_){
    // Hata durumunda mevcut bilineni koru (yanlışlıkla kilitlememek için).
    return state.bugunKalemlerHazir;
  }
}

async function grupATekilDosyalariHazirla(){
  const tipler = Object.keys(GRUP_A_TEKIL_DOSYA_TANIMLARI);
  const bugunKey = dateKeyLocal(new Date());
  await Promise.all(tipler.map(async (tip)=>{
    if(state.files[tip] && state.files[tip].data && state.files[tip].data.length){
      // Bu oturumda kullanıcı yeni bir dosya seçti — bunu "son bilinen hal" olarak sakla.
      await grupATekilDosyaKaydet(tip, state.files[tip].data, state.files[tip].headers, state.files[tip].name);
      return;
    }
    // Yeni seçim yok — önce buluttan (varsa), yoksa cihazdaki önbellekten en son bilinen hali getir.
    let kayit = cloudEnabled() ? await grupATekilDosyaBuluttanOku(tip) : null;
    if(!kayit) kayit = await grupATekilDosyaYerelOku(tip);
    if(!kayit || !kayit.data || !kayit.data.length) return;
    if(!GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR.has(tip)){
      // Kalemler (tarih kısıtlaması olan tek dosya): kaydın tarihi bugüne ait değilse KASITLI
      // OLARAK doldurmadan çık — güvenlik kontrolü bunu "bugün için Kalemler yok" olarak yakalasın.
      const kayitGunKey = kayit.tarih ? dateKeyLocal(new Date(kayit.tarih)) : null;
      if(kayitGunKey !== bugunKey) return;
    }
    state.files[tip] = { name: kayit.adi || (LABELS[tip]+' (önceki yükleme)'), headers: kayit.headers||[], data: kayit.data };
  }));
}

async function saveMusteriMasterDurumToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DURUM_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_DURUM_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_DURUM_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master Durum buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterDurumFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DURUM_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master Durum buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterDurumToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_DURUM_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master Durum cihaza kaydedilemedi.');
}
async function loadMusteriMasterDurumFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_DURUM_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_DURUM_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

async function saveMusteriMasterKanalToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_KANAL_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_KANAL_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_KANAL_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master Kanal buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterKanalFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_KANAL_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master Kanal buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterKanalToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_KANAL_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master Kanal cihaza kaydedilemedi.');
}
async function loadMusteriMasterKanalFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_KANAL_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_KANAL_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

async function saveMusteriMasterSsmToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_SSM_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_SSM_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_SSM_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master SSM buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterSsmFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_SSM_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master SSM buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterSsmToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_SSM_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master SSM cihaza kaydedilemedi.');
}
async function loadMusteriMasterSsmFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_SSM_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_SSM_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

function musteriMasterSsmObjesiniUygula(obj){
  state.musteriMasterSsmHazir = Boolean(obj && obj.kolon);
  state.musteriMasterIliski = musteriMasterObjToMap(obj && obj.iliskiler);
  if(state.musteriMasterIliski.size){
    const musteriMap = new Map();
    const musteriSsm = new Map();
    state.musteriMasterIliski.forEach((iliski,musteri)=>{
      if(iliski && iliski.satisTemsilcisi) musteriMap.set(musteri, iliski.satisTemsilcisi);
      if(iliski && iliski.satisSefi && iliski.satisSefi!=='Tanımsız') musteriSsm.set(musteri, iliski.satisSefi);
    });
    // Üçlü ilişki kaydı atomiktir ve varsa eski ayrı müşteri->temsilci kaydından daha günceldir.
    state.musteriMasterMap = musteriMap;
    state.musteriMasterSsm = musteriSsm;
  }else{
    state.musteriMasterSsm = musteriMasterObjToMap(obj && obj.musteri);
  }
  state.temsilciSsmMap = new Map(obj && Array.isArray(obj.temsilciListe)
    ? obj.temsilciListe
    : Object.entries((obj && obj.temsilci)||{}));
}

async function musteriMasterYenile(){
  // Aşağıdaki beş veri (Master/Detay/Durum/Kanal/SSM) birbirinden bağımsız — hepsi aynı anda kontrol
  // edilip indirilir (bkz. uygulamayiBaslat'taki Promise.all açıklaması, aynı mantık).
  const [masterSonuc, detaySonuc, durumSonuc, kanalSonuc, ssmSonuc] = await Promise.all([
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_CLOUD_PATH, loadMusteriMasterFromCloud, loadMusteriMasterFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_DETAY_CLOUD_PATH, loadMusteriMasterDetayFromCloud, loadMusteriMasterDetayFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_DURUM_CLOUD_PATH, loadMusteriMasterDurumFromCloud, loadMusteriMasterDurumFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_KANAL_CLOUD_PATH, loadMusteriMasterKanalFromCloud, loadMusteriMasterKanalFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_SSM_CLOUD_PATH, loadMusteriMasterSsmFromCloud, loadMusteriMasterSsmFromLocal) : Promise.resolve(null),
  ]);

  let obj = masterSonuc ? masterSonuc.data : null;
  if(!obj) obj = await loadMusteriMasterFromLocal();
  state.musteriMasterMap = musteriMasterObjToMap(obj);

  let detayObj = detaySonuc ? detaySonuc.data : null;
  if(!detayObj) detayObj = await loadMusteriMasterDetayFromLocal();
  state.musteriMasterDetay = musteriMasterObjToMap(detayObj);

  let durumObj = durumSonuc ? durumSonuc.data : null;
  if(!durumObj) durumObj = await loadMusteriMasterDurumFromLocal();
  state.musteriMasterDurum = musteriMasterObjToMap(durumObj);

  let kanalObj = kanalSonuc ? kanalSonuc.data : null;
  if(!kanalObj) kanalObj = await loadMusteriMasterKanalFromLocal();
  state.musteriMasterKanal = musteriMasterObjToMap(kanalObj);

  let ssmObj = ssmSonuc ? ssmSonuc.data : null;
  if(!ssmObj) ssmObj = await loadMusteriMasterSsmFromLocal();
  musteriMasterSsmObjesiniUygula(ssmObj);
  tumYukluVerilerdeMusteriIliskileriniGuncelle();

  return state.musteriMasterMap;
}

// Dönüş: {map, hatalar: string[]} — cihaz depolama kapalı olduğundan (kullanıcı isteği), buluta
// yazma başarısız olan alt-veriler artık HİÇBİR YERE kalıcı kaydedilmez. Eskiden bu hatalar
// sessizce yutulup sadece console.error'a düşüyordu; artık çağıran tarafa (raporuOlusturVeyaGuncelleAkisiniCalistir)
// bildirilip kullanıcıya gösterilebiliyor.
async function musteriMasterKaydet(rows, headers){
  const hatalar = [];
  const map = buildMusteriMasterMap(rows);
  state.musteriMasterMap = map;
  const obj = musteriMasterMapToObj(map);
  await saveMusteriMasterToLocal(obj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterToCloud(obj);
    if(!sonuc.ok) hatalar.push('Müşteri Master buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const detayMap = buildMusteriMasterDetay(rows);
  state.musteriMasterDetay = detayMap;
  const detayObj = musteriMasterMapToObj(detayMap);
  await saveMusteriMasterDetayToLocal(detayObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterDetayToCloud(detayObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master Detay buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const durumMap = buildMusteriMasterDurumMap(rows, headers);
  state.musteriMasterDurum = durumMap;
  const durumObj = musteriMasterMapToObj(durumMap);
  await saveMusteriMasterDurumToLocal(durumObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterDurumToCloud(durumObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master Durum buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const kanalMap = buildMusteriMasterKanalMap(rows);
  state.musteriMasterKanal = kanalMap;
  const kanalObj = musteriMasterMapToObj(kanalMap);
  await saveMusteriMasterKanalToLocal(kanalObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterKanalToCloud(kanalObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master Kanal buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const ssmIliskileri = buildMusteriMasterSsmIliskileri(rows, headers);
  state.musteriMasterSsm = ssmIliskileri.musteriMap;
  state.temsilciSsmMap = ssmIliskileri.temsilciMap;
  state.musteriMasterIliski = ssmIliskileri.iliskiMap;
  // SSM kolonu mevcutsa boş haritalar bile otoritatiftir: eski sabit ilişkiler geri gelmemelidir.
  state.musteriMasterSsmHazir = Boolean(ssmIliskileri.kolon);
  tumYukluVerilerdeMusteriIliskileriniGuncelle();
  const ssmObj = {
    musteri:musteriMasterMapToObj(ssmIliskileri.musteriMap),
    // Temsilci adlarını Firebase anahtarı yapmak yerine çiftler dizisi olarak sakla; gelecekte
    // ad içinde nokta/eğik çizgi gibi Firebase'in anahtarda yasakladığı karakterler bulunabilir.
    temsilciListe:Array.from(ssmIliskileri.temsilciMap.entries()),
    iliskiler:musteriMasterMapToObj(ssmIliskileri.iliskiMap),
    kolon:ssmIliskileri.kolon || '',
  };
  await saveMusteriMasterSsmToLocal(ssmObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterSsmToCloud(ssmObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master SSM buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  if(hatalar.length) console.error('musteriMasterKaydet: bazı veriler buluta yazılamadı:', hatalar);
  map.__kaydetmeHatalari = hatalar;
  return map;
}

const BAYI_HAKEDIS_CLOUD_PATH = CLOUD.path + '_bayiHakedis';
const BAYI_HAKEDIS_LOCAL_KEY = 'noktaCariTakip_bayiHakedis_v1';

function bayiHakedisReviver(key, value){
  if(key==='tarih' && typeof value === 'string'){
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}
async function saveBayiHakedisToCloud(rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${BAYI_HAKEDIS_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(BAYI_HAKEDIS_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(BAYI_HAKEDIS_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Bayi Hakediş buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadBayiHakedisFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${BAYI_HAKEDIS_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text, bayiHakedisReviver);
  }catch(err){ console.error('Bayi Hakediş buluttan okunamadı:', err); return null; }
}
async function saveBayiHakedisToLocal(rapor){
  const ok = await idbSet(BAYI_HAKEDIS_LOCAL_KEY, rapor);
  if(!ok) console.error('Bayi Hakediş cihaza kaydedilemedi.');
}
async function loadBayiHakedisFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(BAYI_HAKEDIS_LOCAL_KEY, bayiHakedisReviver);
    return await idbGet(BAYI_HAKEDIS_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}
async function bayiHakedisYenile(){
  let rapor = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(BAYI_HAKEDIS_CLOUD_PATH, loadBayiHakedisFromCloud, loadBayiHakedisFromLocal);
    rapor = sonuc.data;
  }
  if(!rapor) rapor = await loadBayiHakedisFromLocal();
  state.bayiHakedisReport = rapor;
  return rapor;
}
async function bayiHakedisKaydet(rapor){
  await saveBayiHakedisToLocal(rapor);
  if(cloudEnabled()){
    const sonuc = await saveBayiHakedisToCloud(rapor);
    // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez. Kullanıcı
    // isteği: bu durum artık sessiz kalmasın, ana rapor uyarılarıyla aynı tutarlılıkta alert de
    // gösterilsin (konsol logu da korunur).
    if(!sonuc.ok){
      console.error('UYARI: Bayi Hakediş raporu buluta kaydedilemedi, hiçbir yerde kalıcı değil:', sonuc.reason);
      alert('UYARI: Bayi Hakediş raporu buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
    }
  }
}

const FATURA_ARSIV_CLOUD_PATH = CLOUD.path + '_faturaKontrolArsiv';


async function loadFaturaKontrolArsivFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return faturaKontrolArsivSnapshotlariUzat(JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    }));
  }catch(err){
    console.error('Fatura Kontrol arşivi buluttan okunamadı:', err);
    return null;
  }
}

// authQuery() ile aynı token'ı döndürür ama '?auth=' önekini eklemez — shallow/orderBy gibi başka
// sorgu parametreleriyle birlikte kullanılabilmesi için.
async function authTokenParam(){
  if(!authAktif) return '';
  try{
    const user = window.firebaseAuthAPI.authInstance.currentUser;
    if(!user) return '';
    return await user.getIdToken(true);
  }catch(err){ return ''; }
}

// Arşivin TAMAMINI değil, yalnızca üst seviye gün ANAHTARLARINI çeker (Firebase'in shallow=true
// parametresiyle); değerler indirilmediği için veri hacmi kaç gün arşivlenmiş olursa olsun birkaç
// KB'ı geçmez. Ay dropdown'unu doldurmak veya "kaç gün arşivlenmiş" bilgisini göstermek için
// arşivin tamamını indirmeye gerek bırakmaz.
async function loadFaturaKontrolArsivGunAnahtarlariFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const params = new URLSearchParams({shallow:'true'});
    const token = await authTokenParam();
    if(token) params.set('auth', token);
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json?${params.toString()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return [];
    const obj = JSON.parse(text); // { "2026-07-01": true, "2026-07-02": true, ... }
    return Object.keys(obj).sort();
  }catch(err){
    console.error('Fatura Kontrol arşivi gün anahtarları okunamadı:', err);
    return null;
  }
}

// Yalnızca [baslangicGunKey, bitisGunKey] (uçlar dahil) aralığındaki günleri buluttan çeker.
// Firebase Realtime Database'in orderBy="$key"&startAt=...&endAt=... sorgu parametreleri sunucu
// tarafında filtreleme yapar; aralık dışındaki günlerin verisi ağa hiç inmez. Örn. Tahsilat
// Verimliliği bir ay açtığında, yıllarca birikmiş arşivin tamamı yerine yalnızca o ayın (ve
// önceki bakiye karşılaştırması için gereken birkaç günün) verisi çekilir.
async function loadFaturaKontrolArsivAraligiFromCloud(baslangicGunKey, bitisGunKey){
  if(!cloudEnabled()) return null;
  try{
    const params = new URLSearchParams({
      orderBy: '"$key"',
      startAt: `"${baslangicGunKey}"`,
      endAt: `"${bitisGunKey}"`,
    });
    const token = await authTokenParam();
    if(token) params.set('auth', token);
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json?${params.toString()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return {};
    return faturaKontrolArsivSnapshotlariUzat(JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    }));
  }catch(err){
    console.error('Fatura Kontrol arşivi aralığı okunamadı:', err);
    return null;
  }
}

// Yalnızca DEĞİŞEN gün(ler)i buluttaki arşive PATCH eder — Firebase'in "çoklu konum güncellemesi"
// özelliğiyle, her anahtar arşiv ağacında ayrı bir alt yol olarak güncellenir; diğer günlere
// dokunulmaz. Bir günün değeri `null` verilirse o gün buluttan kalıcı olarak silinir. Bu, "Raporu
// Oluştur" her tıklandığında TÜM arşivin yeniden indirilip yeniden yazılmasının yerini alır.
async function saveFaturaKontrolArsivGunleriToCloud(guncellemeler){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  if(!guncellemeler || !Object.keys(guncellemeler).length) return {ok:true};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(guncellemeler),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){
    console.error('Fatura Kontrol arşivi (kısmi) buluta kaydedilemedi:', err);
    return {ok:false, reason:err.message};
  }
}

// İki arşiv nesnesini (gün -> kayıt) karşılaştırır ve yalnızca içeriği değişmiş günlerin listesini
// döndürür. Yeni tarafta artık olmayan bir gün varsa değeri `null` olur (bulutta silinmesi için).
// Kullanım: sıkıştırma/temizlik gibi TÜM arşivi tarayan işlemlerden sonra, değişikliği buluta
// yazarken artık tüm ağacı değil sadece gerçekten değişen günleri PATCH etmek için.
function faturaKontrolArsivGunFarkiniBul(eskiArsiv, yeniArsiv){
  const fark = {};
  const tumGunler = new Set([...Object.keys(eskiArsiv||{}), ...Object.keys(yeniArsiv||{})]);
  tumGunler.forEach(g=>{
    const eskiVar = eskiArsiv && Object.prototype.hasOwnProperty.call(eskiArsiv, g);
    const yeniVar = yeniArsiv && Object.prototype.hasOwnProperty.call(yeniArsiv, g);
    const eskiJson = eskiVar ? JSON.stringify(eskiArsiv[g]) : null;
    const yeniJson = yeniVar ? JSON.stringify(yeniArsiv[g]) : null;
    if(eskiJson !== yeniJson){
      fark[g] = yeniVar ? yeniArsiv[g] : null;
    }
  });
  return fark;
}

const SAHA_MUDUR_MAP = {
  'Sıtkı Berkay Katrancı': 'Uğur Ergin',
  'Alican Akbaş': 'Uğur Ergin',
  'Altuğ Aksu': 'Mertcan Çınar',
  'Ali Yüksel': 'Mertcan Çınar',
  'Mehmetcan Yılmaz': 'Mertcan Çınar',
  'Berk Kutay Korkmaz': 'Mertcan Çınar',
  'Doğuş Ark': 'Yusuf Akdoğan',
  'Ferhat Fatih İrkin': 'Yusuf Akdoğan',
  'Hasan Akel': 'Yusuf Akdoğan',
};
function normalizeAdSoyad(s){
  return String(s||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('tr');
}
const SAHA_MUDUR_LOOKUP = {};
Object.keys(SAHA_MUDUR_MAP).forEach(k=>{ SAHA_MUDUR_LOOKUP[normalizeAdSoyad(k)] = SAHA_MUDUR_MAP[k]; });
function getSahaMuduru(temsilci, musteriKod){
  if(!temsilci || temsilci==='—') return 'Tanımsız';
  // Önce müşteri bazlı kesin ilişkiyi, sonra aynı güncel masterdan çoğunlukla türetilen temsilci
  // ilişkisini kullan. Güncel SSM kaydı varsa eski sabit listeye ASLA dönme; aksi halde masterdan
  // çıkarılmış eski müdürler yeniden rapora sızar ve yeni temsilciler Tanımsız kalır.
  if(state.musteriMasterSsmHazir){
    const musteriSsm = musteriKod && state.musteriMasterSsm && state.musteriMasterSsm.get(String(musteriKod).trim());
    if(musteriSsm) return musteriSsm;
    return (state.temsilciSsmMap && state.temsilciSsmMap.get(normalizeAdSoyad(temsilci))) || 'Tanımsız';
  }
  // Sadece yeni SSM kaydı henüz hiç oluşmamış eski kurulumlar için geriye dönük uyumluluk.
  return SAHA_MUDUR_LOOKUP[normalizeAdSoyad(temsilci)] || 'Tanımsız';
}

function guncelMusteriIliskisi(musteriKod){
  if(!musteriKod || !state.musteriMasterIliski) return null;
  return state.musteriMasterIliski.get(String(musteriKod).trim()) || null;
}

// Arşivdeki parasal/tarihsel değerleri değiştirmeden yalnız organizasyon etiketlerini günceller.
// Böylece geçmiş günün tutarı/vadesi geçmişte kalır, fakat müşteri güncel Master'daki temsilci ve
// satış şefi altında gösterilir. Yalnız müşteri kodu taşıyan satırlara dokunulur; müşteri kırılımı
// bulunmayan eski toplulaştırılmış snapshotlar güvenli biçimde yeniden dağıtılamaz.
function musteriMasterIliskileriniDerinGuncelle(kok){
  if(!kok || typeof kok!=='object') return 0;
  const gorulen = new WeakSet();
  let degisen = 0;
  const gez = deger=>{
    if(!deger || typeof deger!=='object' || deger instanceof Date || deger instanceof Map || deger instanceof Set || gorulen.has(deger)) return;
    gorulen.add(deger);
    if(Array.isArray(deger)){ deger.forEach(gez); return; }
    const kod = deger.musteri ?? deger.musteriKod ?? deger.musteriNo ?? deger['Müşteri'] ?? deger['Müşteri No'];
    const iliski = guncelMusteriIliskisi(kod);
    if(iliski){
      ['temsilci','satisTemsilcisi','satisTemsilcisiAdi','Satış Temsilcisi Adı'].forEach(alan=>{
        if(Object.prototype.hasOwnProperty.call(deger, alan) && deger[alan]!==iliski.satisTemsilcisi){ deger[alan]=iliski.satisTemsilcisi; degisen++; }
      });
      ['ssm','muduru','satisSefi','Satış Müdürü Adı','Dist Satış Şefi Adı'].forEach(alan=>{
        if(Object.prototype.hasOwnProperty.call(deger, alan) && deger[alan]!==iliski.satisSefi){ deger[alan]=iliski.satisSefi; degisen++; }
      });
    }
    Object.keys(deger).forEach(k=>gez(deger[k]));
  };
  gez(kok);
  return degisen;
}

function tumYukluVerilerdeMusteriIliskileriniGuncelle(){
  let degisen = 0;
  ['report','faturaArsivCache','yuklemeReport','yuklemeArsivCache','cekSenetArsivi','tahsilatArsivi',
    'ciroPrimiArsivi','donemselIskontoArsivi','devirBakiyeArsivi','bayiHakedisReport','primSnapshotlar']
    .forEach(alan=>{ degisen += musteriMasterIliskileriniDerinGuncelle(state[alan]); });
  return degisen;
}

const TL = n => (Math.round(n||0)).toLocaleString('tr-TR') + ' ₺';
// Kuruşu kuruşuna TL biçimlendirme — SADECE Bayi Hakediş ekranında kullanılır (kullanıcı kararı:
// hakediş tutarları TL()'nin yaptığı gibi tam sayıya yuvarlanmasın, kuruş hassasiyeti korunsun).
// AKILLI ONDALIK (kullanıcı isteği): tutarın küsuratı VARSA (örn. 285,50) o küsurat gösterilir;
// küsuratı YOKSA (örn. 285,00 yerine) gereksiz ",00" eklenmeden düz tam sayı (285) gösterilir —
// maximumFractionDigits:2 ile minimumFractionDigits:0 birlikte kullanılarak toLocaleString'in
// kendisi anlamsız sıfırları otomatik olarak basmaz. Uygulamanın geri kalanındaki tüm diğer
// tutarlar (KPI'lar, müşteri kartları, diğer tablolar) TL() ile tam sayıya yuvarlanmaya devam
// eder — bu bilinçli bir istisna, genel bir değişiklik değil.
const TLKurus = n => (Number(n)||0).toLocaleString('tr-TR', {minimumFractionDigits:0, maximumFractionDigits:2}) + ' ₺';
const NUM = n => (Math.round(n||0)).toLocaleString('tr-TR');
const MK = n => NUM(n) + ' Mk.';
const LT = n => NUM(n) + ' Lt.';
const fmtDate = d => d instanceof Date && !isNaN(d) ? d.toLocaleDateString('tr-TR') : '—';
// EFES gibi dahili/şirket-içi kayıtlar gerçek bir cari değildir — Fatura Dökümü, Tahsilat Dökümü,
// Sipariş Dökümü ve Bayi Hak Ediş dosyalarındaki İLGİLİ satırlar bu fonksiyonla TUTARLI şekilde
// filtrelenir (tek bir yerde tanımlı, her dosya döngüsünde aynı kural).
const GECERSIZ_MUSTERI_KODLARI = new Set(['EFES']);
function musteriGecerliMi(musteriNo){
  const kod = String(musteriNo||'').trim().toUpperCase();
  if(!kod) return false;
  return !GECERSIZ_MUSTERI_KODLARI.has(kod);
}

function dateKeyLocal(d){
  if(!(d instanceof Date) || isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Verilen gün anahtarları (YYYY-MM-DD) listesinden, hedef güne (yine YYYY-MM-DD) GÜN OLARAK EN
// YAKIN olanını döndürür (geçmiş veya gelecek fark etmez, en küçük mutlak gün farkı kazanır;
// eşitlik durumunda geçmişteki gün tercih edilir — veri zaten gerçekleşmiş kabul edilir). Liste
// boşsa veya hedef günü yoksa null döner.
function enYakinGunKey(gunListesi, hedefGunKey){
  if(!gunListesi || !gunListesi.length || !hedefGunKey) return null;
  const hedefMs = new Date(hedefGunKey+'T00:00:00Z').getTime();
  if(isNaN(hedefMs)) return null;
  let enYakinGun = null, enKucukFark = Infinity, enYakinMs = null;
  gunListesi.forEach(g=>{
    const ms = new Date(g+'T00:00:00Z').getTime();
    if(isNaN(ms)) return;
    const fark = Math.abs(ms - hedefMs);
    if(fark < enKucukFark || (fark === enKucukFark && (enYakinMs===null || ms < enYakinMs))){
      enKucukFark = fark; enYakinGun = g; enYakinMs = ms;
    }
  });
  return enYakinGun;
}

const SIGNATURES = {
  kalemler: [['Kalan Borç','Faturadan Sonr.Gün','Borç/alacak']],
  siparis: [['Sipariş Toplam Tutar','Teslimat Durumu']],
  // YENİ TAHSİLAT FORMATI (kullanıcı isteği — eski Format A/B ayrımı tamamen kaldırıldı, tek dosya
  // tipine indirgendi): Belge Numarası + Ters Kayıt Belge Numarası kombinasyonu bu dosyaya özgüdür,
  // başka hiçbir dosyada birlikte bulunmaz.
  tahsilat: [
    ['Belge Numarası','Ters Kayıt Belge Numarası','Tarih'],
  ],
  cekSenet: [['Esas Borçlu','Çek/Senet Numarası']],
  ticariStok: [['Depoda Kalan Mk.','Depoda Kalan Lt.','Malzeme Kodu']],
  fatura: [['Ödenecek Tutar','Toplam Litre','Fatura Numarası']],
  bayiHakedis: [['Bayi Tutar','Efes Payı %','Müşteri Alacak Dekont No']],
  yukleme: [['Müşteri Numarası','Litre Total','Yükleme Tarihi']],
  musteriMaster: [['Müşteri','Tabela Adı','Kredi limiti']],
  ciroPrimi: [['Grup Tanım','Efpa Payı Tutar','Net Tutar']],
  donemselIskonto: [['Nokta Kodu','Hakediş Tutar','Perid']],
  sellOut: [['Müşteri Kanalı Tnm.','Açık/Otel Tnm.','Hacim Segmenti Tnm.']],
  // Cari Hesap Ekstre Özet: müşteri bazlı gerçek cari bakiye (Borç/Alacak/Bakiye). "Müşteri Ünvan"
  // + "Bakiye" kombinasyonu bu dosyaya özgüdür — başka hiçbir dosyada birlikte bulunmaz.
  cariEkstre: [['Müşteri Ünvan','Bakiye','Müşteri Ad']],
  rutPlani: [['Maya Müşteri Kodu','Müşteri Durumu','Frekans','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']],
  // NOT: "depozitoTahsilat" tipi (Depozito Tahsilat dosyası) SİSTEMDEN TAMAMEN KALDIRILDI (kullanıcı
  // kararı) — Depozito İade artık yalnızca Fatura Dökümü'ndeki "Depozito İade Faturası" türünden
  // geliyor (bkz. buildReport'taki İade Grubu mantığı). Bu satır kasıtlı olarak silindi ki eskiden bu
  // sütun imzasına uyan bir dosya yanlışlıkla yüklenirse artık HİÇBİR tipe eşleşmesin (detectType
  // "tanınmayan dosya" uyarısı versin) — sessizce yok sayılan bir "hayalet" tip olarak kalmasın.
};
const LABELS = { kalemler:'Kalemler (Fatura / Bakiye)', siparis:'Sipariş Dökümü', tahsilat:'Tahsilat Dökümü', cekSenet:'Çek / Senet Riski', ticariStok:'Ticari Stok', fatura:'Fatura Dökümü', bayiHakedis:'Bayi Hak Ediş', yukleme:'Yükleme Raporu', musteriMaster:'Müşteri Master', rutPlani:'Rut Planı', ciroPrimi:'Ciro Primi', donemselIskonto:'Dönemsel İskonto', sellOut:'Sell Out Raporu', cariEkstre:'Cari Hesap Ekstre' };

// "Vadesi gelmiş" fatura eşiği (TEK KAYNAK): bir faturanın "Faturadan Sonr. Gün" değeri bu eşik
// ve üstündeyse kalan borcu "vadesi gelmiş" sayılır; altındaysa "vadesi gelmemiş" kabul edilir.
// İş kuralı değişirse yalnızca burası güncellenir (önceden 23 sayısı üç ayrı yere gömülüydü).
const VADE_ESIGI_GUN = 23;

// GRUP B: bu dosya tipleri artık ana ekran dropzone/checklist'inde DEĞİL, üst panelde
// ("Günlük Veri Yükle" — bkz. #gvyPanel) yükleniyor. Aynı state.files yapısı ve aynı
// handleFiles/detectType mekanizması kullanılır — sadece dosya SEÇİMİNİN yapıldığı arayüz
// ayrı bir yere taşınmıştır; buildReport ve arşivleme mantığına dokunulmamıştır.
const GVY_DOSYA_TIPLERI = ['siparis','tahsilat','fatura','bayiHakedis','yukleme','cariEkstre','cekSenet'];
// Grup C ("Günlük Veri Yükle"): gün içinde sürekli güncellenebilen, son yüklenen hali kalıcı
// tek-slot arşivde saklanan dosyalar. Bunlar GRUP_A_TEKIL_DOSYA_TANIMLARI'nda zaten kayıtlı
// (aynı kalıcı mekanizmayı kullanır) ve GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR üyesidir — yani
// tarih fark etmeksizin en son yüklenen hali otomatik geri getirilir.
// "cekSenet" ARTIK Grup C'de DEĞİL (kullanıcı isteği) — Çek/Senet Riski dosyası kaldırıldı; bu
// bilgi artık doğrudan Tahsilat Dökümü'ndeki "Alınan Çek"/"Alınan Senet" satırlarından (bkz.
// buildReport'taki tahsilatArsiv/cekSenetMap) besleniyor, ayrı bir dosya yüklemeye gerek yok.
const GRUP_C_DOSYA_TIPLERI = ['ticariStok','ciroPrimi','donemselIskonto'];
// Grup C'de o an ekranda seçili (henüz kaydedilmemiş) dosya sayısı — buton kilidi için.
function GRUP_C_HAZIR_SAYISI(){ return GRUP_C_DOSYA_TIPLERI.filter(t=>state.filesC && state.filesC[t]).length; }

function detectType(headers){
  const set = new Set(headers.map(h=>String(h||'').trim()));
  for(const type of Object.keys(SIGNATURES)){
    if(SIGNATURES[type].some(sig=>sig.every(k=>set.has(k)))) return type;
  }
  return null;
}

function sheetToObjects(ws){
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  if(!rows.length) return {headers:[], data:[]};
  const headers = rows[0].map(h=>String(h||'').trim());
  const data = [];
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(r.every(v=>v===null||v==='')) continue;
    const obj = {};
    headers.forEach((h,idx)=>{ if(h) obj[h] = r[idx]===undefined?null:r[idx]; });
    data.push(obj);
  }
  return {headers, data};
}

function excelDateToJS(v){
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(typeof v === 'number'){
    const d = XLSX.SSF.parse_date_code(v);
    if(d) return new Date(Date.UTC(d.y,d.m-1,d.d));
  }
  // GÜVENLİK AĞI: bazı satırlarda SheetJS'in cellDates dönüşümü (kaynak SAP dosyasındaki karma/
  // özel hücre biçimleri nedeniyle) tarihi Date/sayı yerine METİN olarak bırakabiliyor — bu
  // durumda "Tarih" sütunu sessizce "—" görünüyordu (Gün/Vade sütunları zaten dosyadaki hazır
  // sayısal alanlardan geldiği için etkilenmiyordu). Böyle bir string gelirse önce ISO/olağan
  // tarih biçimleriyle, olmazsa gün.ay.yıl (tr) biçimiyle ayrıştırmayı dener.
  if(typeof v === 'string' && v.trim()){
    const s = v.trim();
    const isoDenemesi = new Date(s);
    if(!isNaN(isoDenemesi.getTime())) return isoDenemesi;
    const trEslesme = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
    if(trEslesme){
      let [, gun, ay, yil] = trEslesme;
      if(yil.length===2) yil = '20'+yil;
      const d = new Date(Date.UTC(Number(yil), Number(ay)-1, Number(gun)));
      if(!isNaN(d.getTime())) return d;
    }
  }
  return null;
}
function turkiyeSimdi(){
  return new Date(Date.now() + 3*60*60*1000);
}
function turkiyeBugun(){
  const t = turkiyeSimdi();
  // BİLİNEN KISIT (bilinçli): Dönen değer UTC gece yarısına çapalıdır ama uygulama genelinde
  // dateKeyLocal()/getDate() gibi YEREL erişimcilerle okunur. Cihaz saat dilimi UTC+0 veya
  // pozitifse (Türkiye dahil, +3) gün DOĞRU çıkar; yalnızca NEGATİF ofsetli bir cihazda
  // (ör. Amerika kıtası) gün 1 geri kayar. Kullanıcılar Türkiye'de olduğundan ve bu anahtarlar
  // arşivde tarihsel olarak bu şekilde yazıldığından, geriye dönük uyumluluk adına DEĞİŞTİRMEYİN.
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
function excelDateToJSArti1Gun(v){
  // 28.07.2026 KRİTİK DÜZELTME (kullanıcı bulgusu — gerçek SAP Cari Hesap
  // Detay ekstresiyle çapraz doğrulandı): bu fonksiyon önceden +1 gün
  // EKLİYORDU, "Türkiye +3 saat dilimi düzeltmesi" gerekçesiyle. Ama bu
  // gerekçe YANLIŞTI: excelDateToJS() zaten Date.UTC(d.y,d.m-1,d.d) ile
  // SAAT BİLEŞENİ OLMAYAN bir tarihi doğru gün olarak kodluyor — üstüne
  // +1 gün eklemek, gerçek İşlem Tarihi'nden HER ZAMAN 1 gün İLERİ bir
  // tarih üretiyordu (kanıt: aynı belge numaralarının panel/SAP export
  // tarihi ile SAP'ın kendi Cari Hesap Detay ekstresindeki İşlem Tarihi
  // karşılaştırıldığında, TUTARLI ŞEKİLDE +1 gün fark bulundu — hem Fatura
  // hem Tahsilat tarafında, birden fazla belge üzerinden doğrulandı).
  //
  // SONUÇ ETKİSİ: bu hatalı kayma, "aynı güne ait TÜM kayıtları SİLİP
  // yeniden yazan" arşiv dağıtım mantığıyla (arsivGunlereDagitVeDegistir,
  // tahsilatKredisiGunlereEkleVeDegistir) birleşince gerçek veri KAYBINA
  // yol açabiliyordu — bir kayıt farklı yüklemelerde farklı güne düşünce,
  // o günün arşivi baştan yazıldığı için kayıt kaybolabiliyordu.
  //
  // DÜZELTME: artık +1 gün eklenmiyor, düzeltmesiz excelDateToJS ile aynı
  // sonucu döndürür. Fonksiyon SİLİNMEDİ (17 çağrı yerini tek tek
  // değiştirmek yerine burada merkezi düzeltme yapıldı) — ama artık "Arti1Gun"
  // adı yanıltıcı, kod içinde arama yapan biri bu yorumu görsün diye
  // bilinçli olarak silinmedi.
  return excelDateToJS(v);
}

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadError = document.getElementById('uploadError');
const buildBtn = document.getElementById('buildBtn');
// Ana Veri sekmesindeki (Veri Yükle panelindeki) ikinci "Raporu Oluştur" butonu — dropzone'daki
// buildBtn ile AYNI akışı tetikler, aynı disabled/textContent durumunu senkron gösterir (bkz.
// updateUploadUI ve raporuOlusturVeyaGuncelleAkisiniCalistir).
const gvyAnaBuildBtn = document.getElementById('gvyAnaBuildBtn');
const statusPill = document.getElementById('statusPill');
const statusPillMsg = document.getElementById('statusPillMsg');
const resetBtn = document.getElementById('resetBtn');
const syncBtn = document.getElementById('syncBtn');

// Sidebar'daki (sbResetBtn/sbSyncBtn/sbLogoutBtn) ikon butonları, gerçek topbar butonlarının
// (resetBtn/syncBtn/authLogoutBtn) görünürlüğünü ve tıklama davranışını birebir yansıtır —
// böylece iki ayrı görünürlük durumu elle senkron tutulmak zorunda kalınmaz.
function syncSidebarFooterButtons(){
  const pairs = [['sbResetBtn','resetBtn'], ['sbSyncBtn','syncBtn'], ['sbLogoutBtn','authLogoutBtn']];
  pairs.forEach(([sbId, realId])=>{
    const sb = document.getElementById(sbId);
    const real = document.getElementById(realId);
    if(!sb || !real) return;
    sb.style.display = (real.style.display==='none' || getComputedStyle(real).display==='none') ? 'none' : 'inline-flex';
  });
}
['sbResetBtn','sbSyncBtn','sbLogoutBtn'].forEach((sbId,i)=>{
  const realId = ['resetBtn','syncBtn','authLogoutBtn'][i];
  document.getElementById(sbId)?.addEventListener('click', ()=> document.getElementById(realId)?.click());
});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('resetBtn'), {attributes:true, attributeFilter:['style']});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('syncBtn'), {attributes:true, attributeFilter:['style']});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('authLogoutBtn'), {attributes:true, attributeFilter:['style']});
syncSidebarFooterButtons();

// Üst action bar'daki durum rozeti (statusPillMain), asıl statusPill ile birebir aynı metni ve
// "ok" (başarılı) durumunu gösterir — tek bir yerden (statusPillMsg/statusPill) güncellenen
// mevcut mantığı iki kez yazmak yerine burada pasif olarak yansıtıyoruz.
function syncStatusPillMain(){
  const mainMsg = document.getElementById('statusPillMainMsg');
  const mainPill = document.getElementById('statusPillMain');
  if(!mainMsg || !mainPill) return;
  mainMsg.textContent = statusPillMsg.textContent;
  mainPill.classList.toggle('ok', statusPill.classList.contains('ok'));
}
new MutationObserver(syncStatusPillMain).observe(statusPillMsg, {characterData:true, childList:true, subtree:true});
new MutationObserver(syncStatusPillMain).observe(statusPill, {attributes:true, attributeFilter:['class']});
syncStatusPillMain();

dropzone.addEventListener('click', ()=>fileInput.click());
dropzone.addEventListener('keydown', e=>{
  if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){
    e.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', e=>{e.preventDefault(); dropzone.classList.add('drag');});
dropzone.addEventListener('dragleave', ()=>dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e=>{
  e.preventDefault(); dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e=>handleFiles(e.target.files));

function showError(msg){
  uploadError.textContent = msg;
  uploadError.style.display = 'block';
}
function clearError(){ uploadError.style.display='none'; uploadError.textContent=''; }

// Kabul edilen dosya uzantıları ve maksimum güvenli boyut (ana iş parçacığında okunduğu için
// aşırı büyük dosyalar UI'ı dondurabilir — üstünde uyarı verilir ama okuma yine denenir).
const KABUL_EDILEN_UZANTILAR = ['.xlsx', '.xls'];
const MAKS_DOSYA_BOYUTU_MB = 25;

// Bir çalışma kitabındaki TÜM sekmeleri sırayla deneyip başlıkları tanınabilen (detectType
// bir tip döndüren) İLK sekmeyi döndürür. Böylece veri ilk sekmede değil de ikinci/üçüncü
// sekmedeyse ya da ilk sekme boş bir kapak sayfasıysa dosya sessizce boş okunmaz.
// Hiçbir sekme tanınamazsa, teşhis için ilk sekmenin başlıklarıyla birlikte null tip döner.
function ilkUygunSayfayiSec(wb){
  let ilkParse = null;
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    if(!ws) continue;
    const parsed = sheetToObjects(ws);
    if(ilkParse === null) ilkParse = {...parsed, sheetName};
    const type = detectType(parsed.headers);
    if(type) return {type, headers:parsed.headers, data:parsed.data, sheetName};
  }
  // Tanınan sekme yok: en azından ilk (boş olmayan) sekmenin başlıklarını teşhise geri ver.
  return ilkParse ? {type:null, headers:ilkParse.headers, data:ilkParse.data, sheetName:ilkParse.sheetName}
                  : {type:null, headers:[], data:[], sheetName:null};
}

// Tek bir dosyayı okur ve {file, durum, mesaj} döndürür (durum: 'ok' | 'bos' | 'taninmadi' | 'hata').
// Hiçbir yan etki (state/DOM) YOK — çağıran, tüm dosyalar bitince tek seferde uygular ve özetler.
function dosyaOku(file){
  return new Promise(resolve=>{
    // 1) Uzantı doğrulaması: .xlsx/.xls dışındaki dosyalar (ör. sürüklenen bir .pdf/.png) XLSX.read'e
    //    hiç gitmeden erken, anlaşılır bir mesajla reddedilir.
    const ad = String(file.name||'');
    const uzantiUygun = KABUL_EDILEN_UZANTILAR.some(u=>ad.toLowerCase().endsWith(u));
    if(!uzantiUygun){
      resolve({file, durum:'hata', mesaj:'"'+ad+'" bir Excel dosyası değil (yalnızca '+KABUL_EDILEN_UZANTILAR.join(' / ')+' desteklenir).'});
      return;
    }
    // 2) Boyut uyarısı (okuma yine denenir).
    const buyukMu = file.size && file.size > MAKS_DOSYA_BOYUTU_MB*1024*1024;

    const reader = new FileReader();
    reader.onerror = ()=> resolve({file, durum:'hata', mesaj:'Dosya okunamadı: '+ad});
    reader.onload = ev => {
      try{
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
        const {type, headers, data} = ilkUygunSayfayiSec(wb);
        if(!type){
          // En yakın imzayı ve eksik kolonları göstererek teşhisi hızlandır.
          const headerSet = new Set(headers.map(h=>String(h||'').trim()));
          let enYakinTip = null, enYakinEksik = null, enAzEksikSayisi = Infinity;
          Object.keys(SIGNATURES).forEach(tip=>{
            SIGNATURES[tip].forEach(sig=>{
              const eksik = sig.filter(k=>!headerSet.has(k));
              if(eksik.length < enAzEksikSayisi){
                enAzEksikSayisi = eksik.length; enYakinTip = tip; enYakinEksik = eksik;
              }
            });
          });
          const ipucu = (enYakinTip && enAzEksikSayisi>0 && enAzEksikSayisi<=2)
            ? ' "'+(LABELS[enYakinTip]||enYakinTip)+'" dosyasına en çok benziyor ama şu kolon(lar) eksik: '+enYakinEksik.join(', ')+'.'
            : ' Bulunan kolonlar: '+headers.slice(0,8).join(', ')+(headers.length>8?'…':'')+'.';
          resolve({file, durum:'taninmadi', mesaj:'"'+ad+'" tanınamadı ve atlandı.'+ipucu+' Beklenen kolon başlıklarını içeren bir SAP dışa aktarım dosyası olduğundan emin olun.'});
          return;
        }
        // Başarılı: veriyi taşı (state değişikliği burada yapılır; tek dosya = tek yazma, yarış yok).
        state.files[type] = {name:ad, headers, data};
        const bosMu = !data.length;
        let mesaj = null;
        if(bosMu){
          mesaj = '"'+ad+'" '+(LABELS[type]||type)+' olarak tanındı ancak içinde hiç veri satırı yok (yalnızca başlık satırı bulundu). Dosyanın doğru/filtrelenmemiş SAP dışa aktarımı olduğundan emin olun.';
        } else if(buyukMu){
          mesaj = '"'+ad+'" '+(LABELS[type]||type)+' olarak işlendi (dosya '+MAKS_DOSYA_BOYUTU_MB+' MB üzerinde olduğundan işlem biraz sürebilir).';
        }
        resolve({file, durum:bosMu?'bos':'ok', tip:type, mesaj});
      }catch(err){
        resolve({file, durum:'hata', mesaj:'Dosya okunamadı: '+ad+' — '+err.message});
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Birden fazla dosya aynı anda yüklendiğinde her biri kendi asenkron onload'ında showError
// çağırıp öncekini EZİYORDU (yalnızca son biten mesaj görünüyordu). Artık tüm okumalar
// Promise.all ile toplanır ve bittiğinde TEK BİRLEŞİK özet gösterilir.
// xlsx kütüphanesi yüklendi mi? (CDN erişilemezse veya onerror tetiklendiyse false.)
function xlsxHazirMi(){
  return typeof XLSX !== 'undefined' && !window.__xlsxYuklenemedi;
}

function handleFiles(fileList){
  clearError();
  const files = Array.from(fileList);
  if(!files.length) return;
  // KRİTİK: Excel okuma kütüphanesi (xlsx) yüklenemediyse, dosyalar sessizce/anlamsız hatayla
  // çökmesin — kullanıcıya net bir açıklama göster ve işlemi durdur.
  if(!xlsxHazirMi()){
    showError('Excel okuma bileşeni (xlsx) yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin. Sorun sürerse ağ, CDN erişimini (cdnjs.cloudflare.com) engelliyor olabilir.');
    return;
  }
  Promise.all(files.map(dosyaOku)).then(sonuclar=>{
    const basarili = sonuclar.filter(s=>s.durum==='ok');
    const bos      = sonuclar.filter(s=>s.durum==='bos');
    const atlanan  = sonuclar.filter(s=>s.durum==='taninmadi');
    const hatali   = sonuclar.filter(s=>s.durum==='hata');

    // DOM'u tek seferde güncelle.
    updateChecklist();
    if(typeof updateGvyPanel === 'function') updateGvyPanel();

    // Birleşik özet mesajı. Sorunlu (boş/atlanan/hatalı) dosyalar tek tek ayrıntılı listelenir;
    // sadece başarı varsa hata alanı temiz bırakılır.
    const sorunlar = [...bos, ...atlanan, ...hatali];
    if(!sorunlar.length){ clearError(); return; }

    const parcalar = [];
    if(basarili.length) parcalar.push(basarili.length+' dosya sorunsuz tanındı.');
    sorunlar.forEach(s=>{ if(s.mesaj) parcalar.push(s.mesaj); });
    showError(parcalar.join(' '));
  });
}

function updateChecklist(){
  Object.keys(state.files).forEach(type=>{
    const item = document.querySelector('.check-item[data-type="'+type+'"]');
    // Grup B dosyaları (Sipariş/Tahsilat/Fatura/Bayi Hak Ediş) artık ana ekran
    // checklist'inde DEĞİL, üst panelde "Günlük Veri Yükle" panelinde gösteriliyor — bu tipler için
    // ana ekranda karşılık gelen bir .check-item elementi yok, o yüzden burada güvenle atlanır.
    if(!item) return;
    const meta = item.querySelector('.check-meta');
    const info = state.files[type];
    if(info){
      // 0 satırlık dosyalar teknik olarak "yüklendi" sayılsa da (kullanıcı bilerek devam
      // edebilir, bkz. handleFiles'daki showError uyarısı), checklist'te normal bir "✓ tamam"
      // ile aynı yeşil görünüme sahip olmaları kullanıcının bu satırı atlamasına neden
      // olabiliyordu. Boşsa "done" yerine ayrı bir uyarı sınıfı ve ikonuyla gösteriyoruz.
      const bosDosya = info.data.length === 0;
      item.classList.toggle('done', !bosDosya);
      item.classList.toggle('bos-veri-uyari', bosDosya);
      item.querySelector('.check-icon').innerHTML = bosDosya
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      meta.textContent = info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır' + (bosDosya ? ' — ⚠️ veri boş' : '');
    }else{
      item.classList.remove('done');
    }
  });
  // Ana Veri sekmesindeki (Veri Yükle panelindeki) Kalemler/Müşteri Master özet metinlerini de
  // aynı state.files verisiyle senkron tutar — dropzone'daki checklist ile AYNI bilgiyi gösterir.
  const gvyAnaKalemlerSub = document.getElementById('gvyAnaKalemlerSub');
  if(gvyAnaKalemlerSub){
    const info = state.files.kalemler;
    gvyAnaKalemlerSub.textContent = info ? (info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır') : 'Dosya seçilmedi';
  }
  const gvyAnaMasterSub = document.getElementById('gvyAnaMasterSub');
  if(gvyAnaMasterSub){
    const info = state.files.musteriMaster;
    gvyAnaMasterSub.textContent = info ? (info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır') : 'Dosya seçilmedi';
  }
  // Ana ekran (Grup A): Kalemler + Müşteri Master gösterir. KALEMLER ARTIK ZORUNLU DEĞİL (kullanıcı
  // kararı — büyük mimari değişiklik, bkz. GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR ve
  // raporuOlusturVeyaGuncelleAkisiniCalistir'deki kaldırılan güvenlik kontrolü notu). Bu ekranın
  // GÖRSEL yeniden düzenlemesi (yeni "Ana Veri" sekmesi: Kalemler + Müşteri Master + Cari Ekstre)
  // ayrı bir adımda yapılacak — burada yalnızca FONKSİYONEL kısıt (buton kilidi) kaldırılıyor.
  const anaEkranTipleri = ['kalemler','musteriMaster'];
  const kalemlerLoaded = Boolean(state.files.kalemler);
  const total = anaEkranTipleri.length;
  const loadedCount = anaEkranTipleri.filter(t=> Boolean(state.files[t])).length;
  const allLoaded = loadedCount === total;
  // KİLİT KALDIRILDI: Rapor artık Kalemler olmadan da (Müşteri Master + Cari Ekstre ile) oluşabilir.
  buildBtn.disabled = false;
  buildBtn.textContent = 'Raporu Oluştur';
  if(gvyAnaBuildBtn){ gvyAnaBuildBtn.disabled = false; gvyAnaBuildBtn.textContent = 'Raporu Oluştur'; }
  statusPillMsg.textContent = allLoaded
    ? (total+'/'+total+' dosya hazır')
    : (kalemlerLoaded
        ? (loadedCount+'/'+total+' dosya · Kalemler hazır (Müşteri Master opsiyonel)')
        : (loadedCount+'/'+total+' dosya · Kalemler ve Müşteri Master opsiyonel'));
  if(kalemlerLoaded) statusPill.classList.add('ok');
}

// "Raporu Oluştur" (ana ekran) ve "Veri Güncelle" (Grup B / Günlük Veri Yükle paneli) AYNI akışı
// kullanır — hesaplama/arşivleme mantığı tek bir yerde (burada) yaşar, iki farklı buton bunu
// tetikler. Bu sayede Grup B paneli için ayrı/bağımsız bir hesaplama motoru yazmaya gerek kalmaz.
async function raporuOlusturVeyaGuncelleAkisiniCalistir(){
  try{
    let musteriMasterMapKullanilacak = state.musteriMasterMap;
    if(state.files.musteriMaster){
      musteriMasterMapKullanilacak = buildMusteriMasterMap(state.files.musteriMaster.data);
      state.musteriMasterMap = musteriMasterMapKullanilacak;
      const kaydedilenMap = await musteriMasterKaydet(state.files.musteriMaster.data, state.files.musteriMaster.headers);
      if(kaydedilenMap.__kaydetmeHatalari && kaydedilenMap.__kaydetmeHatalari.length){
        // Cihaz depolama kapalı — Müşteri Master buluta yazılamazsa bu veri HİÇBİR YERDE
        // kalıcı değildir, sayfa yenilenirse kaybolur. Rapor oluşturmayı durdurmuyoruz (Kalemler
        // zaten işlenecek) ama kullanıcıyı açıkça uyarıyoruz.
        alert('UYARI: Müşteri Master verisi buluta kaydedilemedi (cihaza da kaydedilmiyor, bu özellik kapalı) — sayfa yenilenirse bu veri kaybolur:\n\n' + kaydedilenMap.__kaydetmeHatalari.join('\n'));
      }
    }
    // Ticari Stok/Çek-Senet/Ciro Primi/Dönemsel İskonto: bugün yeniden seçilmemişse en son bilinen
    // hali (ne kadar eski olursa olsun) otomatik getirir. Kalemler için ise SADECE BUGÜNE ait bir
    // kayıt varsa doldurulur — aynı gün içinde tekrar seçmenize gerek kalmaz, ama YENİ bir güne
    // geçilip Kalemler o gün için hiç yüklenmediyse bilerek BOŞ bırakılır (bkz.
    // grupATekilDosyalariHazirla ve KALEMLER_BUGUN_ZORUNLU açıklaması).
    await grupATekilDosyalariHazirla();
    // GÜVENLİK KONTROLÜ KALDIRILDI (kullanıcı kararı — büyük mimari değişiklik): Önceden Kalemler
    // hiç yüklenmemişse burada hata fırlatılıp TÜM işlem durduruluyordu. Artık kart oluşturma
    // Müşteri Master'a, bakiye Cari Ekstre'ye bağlı olduğundan Kalemler'in varlığı ZORUNLU değil —
    // Kalemler yalnızca (varsa) mevcut kartlara açık fatura detayı ekler. state.files.kalemler boş
    // olsa bile buildReport artık normal şekilde çalışabilir (bkz. buildReport'un başındaki
    // "files.kalemler || {data:[]}" güvenli varsayılanı).
    // ARŞİV DEĞİŞİKLİK RAPORU (kullanıcı isteği, 23.07.2026): Bu yüklemede arşivde SESSİZCE
    // silinen/güncellenen/eklenen HER kaydı tek bir yerde topluyoruz — ters kayıt eşleşmesi, ön
    // kayıt yaşam döngüsü, sipariş iptal/mükerrer temizliği, çek/senet eksik kalanları. Rapor
    // oluşturma akışı bittikten sonra (varsa) kullanıcıya gösterilir (bkz. renderArsivDegisiklikRaporu).
    const buYuklemeArsivDegisiklikleri = [];

    // ÇEK/SENET RİSKİ — ARŞİV BİRLEŞTİRME (kullanıcı isteği): buildReport'tan ÖNCE, bu oturumda
    // yeni bir Çek/Senet Riski dosyası seçildiyse (state.files.cekSenet doluysa) kalıcı arşivle
    // birleştirilir — yeni/güncellenen kayıtlar arşive işlenir, eski arşivde olup bu dosyada
    // OLMAYAN kayıtlar SİLİNMEZ, cekSenetEksikKalanlar listesine düşer (aşağıda rapor
    // oluşturulduktan sonra kullanıcıya "Tahsil Edildi mi, İptal mi?" olarak sorulur).
    if(state.files.cekSenet && state.files.cekSenet.data && state.files.cekSenet.data.length){
      const {arsiv, eksikKalanlar, degisiklikler: cekSenetDegisiklikleri} = cekSenetArsiviniBirlestir(state.cekSenetArsivi, state.files.cekSenet.data);
      state.cekSenetArsivi = arsiv;
      state.cekSenetEksikKalanlar = eksikKalanlar;
      await cekSenetArsiviniKaydet(arsiv);
      cekSenetDegisiklikleri.forEach(d=> buYuklemeArsivDegisiklikleri.push(Object.assign({kaynak:'cekSenet'}, d)));
      eksikKalanlar.forEach(k=>{
        if(k.durum === 'tahsilEdildi') return; // zaten karar verilmiş, gürültü olmasın
        buYuklemeArsivDegisiklikleri.push({
          tur:'eksik', sebep:'Çek/Senet — önceki yüklemede vardı, bu dosyada yok (karar bekliyor)',
          belgeNo:k.no||'', musteriKod:k.musteriKod||'', musteriAdi:k.musteriAdi||'', tutar:k.tutar||0, tarih:k.belgeTarihi||null,
          kaynak:'cekSenet',
        });
      });
    }
    // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT, KALICI ARŞİV (kullanıcı isteği): çek/senetle BİREBİR AYNI
    // desen. buildReport'tan ÖNCE, bu oturumda yeni bir Tahsilat Dökümü dosyası seçildiyse kalıcı
    // arşivle birleştirilir (belge no bazlı ekle/güncelle + Ters Kayıt ile sil + Ön Kayıt yaşam
    // döngüsü temizliği — bkz. 01-cekirdek-ve-arsiv.js: tahsilatArsiviniBirlestir). Bu, YIL
    // BOYUNCA tek seferde toplu yüklenen bir dosyanın her satırının kendi Tarih gününe doğru
    // dağıtılabilmesini sağlar; sonraki kısmi (ör. son hafta) yüklemeler diğer günlere dokunmaz.
    if(state.files.tahsilat && state.files.tahsilat.data && state.files.tahsilat.data.length){
      const {arsiv: yeniTahsilatArsivi, degisiklikler: tahsilatDegisiklikleri} = tahsilatArsiviniBirlestir(state.tahsilatArsivi, state.files.tahsilat.data);
      state.tahsilatArsivi = yeniTahsilatArsivi;
      await tahsilatArsiviniKaydet(state.tahsilatArsivi);
      tahsilatDegisiklikleri.forEach(d=> buYuklemeArsivDegisiklikleri.push(Object.assign({kaynak:'tahsilat'}, d)));
      // DEVİR BAKİYE AKTARIM (kullanıcı kararı, 17.07.2026): aynı Tahsilat Dökümü dosyasında
      // Belge Türü='Devir Bakiye Aktarım' olan satırlar varsa (bkz. 01-cekirdek-ve-arsiv.js'teki
      // devirBakiyeSatirlariniAyikla açıklaması), bunlar tahsilat DEĞİL, kendi Belge Tarihi'nde bir
      // BORÇ/fatura kaydı olarak ayrı kalıcı arşive işlenir — computeMusteriAylikOzetPeriyot bu
      // arşivi de `faturalar` listesine dahil eder.
      state.devirBakiyeArsivi = devirBakiyeArsiviniBirlestir(state.devirBakiyeArsivi, state.files.tahsilat.data);
      await devirBakiyeArsiviniKaydet(state.devirBakiyeArsivi);
    }
    // CİRO PRİMİ / DÖNEMSEL İSKONTO — KALICI ARŞİV (kullanıcı isteği, 24.07.2026): buildReport'tan
    // ÖNCE, Çek/Senet ve Tahsilat ile AYNI noktada — Bayi Hak Ediş (Müşteri Alacak Dekont No) ile
    // çapraz kontrol edilerek ödenen kayıtlar arşivden silinir, ödenmeyip kaynaktan kaybolanlar
    // "Karar Bekliyor" olarak işaretlenir. bayiHakedisRaporuOlustur (aşağıda) artık bu iki arşivin
    // aktif kayıtlarından okur — tek slotluk state.files.ciroPrimi/donemselIskonto'dan DEĞİL.
    const {degisiklikler: ciroPrimiDegisiklikleri} = await ciroPrimiVeDonemselIskontoArsiviniGuncelle();
    // kaynak alanı sebep metnindeki önekten (ör. "Ciro Primi — ...") türetilir; her satırın kendi
    // kaynağını (ciroPrimi/donemselIskonto) doğru taşıması Arşiv Değişiklik Raporu filtresi içindir.
    ciroPrimiDegisiklikleri.forEach(d=>{
      const kaynak = String(d.sebep||'').startsWith('Dönemsel İskonto') ? 'donemselIskonto' : 'ciroPrimi';
      buYuklemeArsivDegisiklikleri.push(Object.assign({kaynak}, d));
    });
    state.arsivDegisiklikRaporu = buYuklemeArsivDegisiklikleri;
    state.report = buildReport(state.files, musteriMasterMapKullanilacak);
    // Bu noktada Kalemler kesinlikle yüklü ve grupATekilDosyalariHazirla ile bugünün tarihiyle
    // tek-slot arşivine kaydedildi — Grup B/C panellerinin "Kalemler yok" sanmaması için bayrağı set et.
    state.bugunKalemlerHazir = true;
    await bayiHakedisRaporuOlustur();
    await sellOutRaporuOlustur();
    renderReport(state.report);
    document.getElementById('uploadCard').style.display='none';
    document.getElementById('reportSection').style.display='block';
    document.body.classList.add('has-sidebar');
    resetBtn.style.display='inline-block';
    // ÖNEMLİ: Cihaz depolama (IndexedDB) tamamen devre dışı (kullanıcı isteği) — saveReportToStorage
    // artık gerçekte HİÇBİR YERE yazmayan bir no-op'tur, her zaman true döner. Bu yüzden onun
    // sonucuna güvenip "kaydedildi" demek YANLIŞ OLURDU; gerçek kalıcılık YALNIZCA bulut yazması
    // (saveReportToCloud) başarılı olursa vardır. Aşağıdaki mesajlar buna göre düzenlenmiştir.
    await saveReportToStorage(state.report);
    // NOT: Bu çağrı artık await EDİLİYOR (öncesinde fire-and-forget'ti) — sipariş arşiv temizliği
    // bu fonksiyonun İÇİNDE state.arsivDegisiklikRaporu'na kendi kayıtlarını ekliyor (bkz.
    // 01-cekirdek-ve-arsiv.js), ve aşağıdaki "Arşiv Değişiklik Raporu" modalının TÜM kategorileri
    // (çek/senet, tahsilat, sipariş) eksiksiz görebilmesi için bu işlemin bitmiş olması gerekir.
    await faturaKontrolArsivineKaydetVeSenkronizeEt(state.report);
    await yuklemeRaporuOlusturVeArsivle();
    // ARŞİV DEĞİŞİKLİK RAPORU (kullanıcı isteği, 23.07.2026): rapor başarıyla oluşturulup ekrana
    // yansıdıktan SONRA, çek/senet eksik uyarısıyla AYNI noktada, ama ondan hemen önce gösterilir
    // (kullanıcı önce "bu yüklemede ne değişti"yi görsün, sonra çek/senet kararı versin). Sadece
    // gerçekten bir değişiklik varsa açılır — sessiz/temiz bir yükleme kullanıcıyı rahatsız etmesin.
    if(state.arsivDegisiklikRaporu && state.arsivDegisiklikRaporu.length && typeof arsivDegisiklikRaporuModalAc==='function'){
      arsivDegisiklikRaporuModalAc(state.arsivDegisiklikRaporu);
    }
    // ÇEK/SENET EKSİK KALAN UYARISI: rapor başarıyla oluşturulup ekrana yansıdıktan SONRA tetiklenir
    // (kullanıcı isteği: "dosya yüklenip rapor tekrar oluştuktan sonra tetiklenecek"). Modal, arşivde
    // kalan ama son yüklenen Çek/Senet Riski dosyasında olmayan kayıtları listeler.
    if(state.cekSenetEksikKalanlar && state.cekSenetEksikKalanlar.length){
      cekSenetEksikOnayModalAc(state.cekSenetEksikKalanlar);
    }
    document.getElementById('storageNote').style.display = 'block';
    if(cloudEnabled()){
      syncBtn.style.display = 'inline-block';
      statusPillMsg.textContent = 'Rapor oluşturuldu, buluta yükleniyor…';
      const res = await saveReportToCloud(state.report);
      if(res.ok){
        statusPillMsg.textContent = 'Rapor buluta yüklendi — diğer cihazlarda da görünecek';
        statusPill.classList.add('ok');
        document.getElementById('storageNoteMsg').textContent = 'Bu rapor buluta yüklendi; aynı bağlantıyı kullanan diğer cihazlar sayfayı açtığında (veya "Diğer Cihazdan Güncelle" ile) otomatik görecek.';
        // iOS'ta kullanıcı ilk raporunu başarıyla oluşturduğunda — uygulamayı ana ekrana
        // eklemeye en istekli olduğu an — kurulum ipucunu (bir kereye mahsus) gösteriyoruz.
        if(typeof window.iosKurulumIpucunuGoster === 'function') window.iosKurulumIpucunuGoster(true);
      }else{
        // Cihaz depolama olmadığı için bulut yazması başarısız olursa rapor HİÇBİR YERDE kalıcı
        // DEĞİLDİR — sayfa yenilenirse kaybolur. Bunu kullanıcıdan gizlemek yerine açıkça belirtiyoruz.
        statusPillMsg.textContent = 'UYARI: Rapor buluta kaydedilemedi — sayfa yenilenirse kaybolur!';
        statusPill.classList.remove('ok');
        document.getElementById('storageNoteMsg').textContent = 'Bulut bağlantısı/yetkisi başarısız olduğu için bu rapor HİÇBİR YERE kalıcı kaydedilmedi (cihaz depolama kapalı). Lütfen giriş durumunuzu ve internet bağlantınızı kontrol edip "Diğer Cihazdan Güncelle" veya tekrar "Raporu Oluştur" ile yeniden deneyin.';
        alert('UYARI: Rapor buluta kaydedilemedi. Cihaza da kaydedilmiyor (bu özellik kapalı) — sayfayı yenilerseniz bu rapor kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
      }
    }else{
      // Bulut kapalıyken (BULUTSUZ_TEST açık veya CLOUD yapılandırması eksik) veri kesinlikle
      // hiçbir yere kalıcı yazılamaz — kullanıcıyı yanıltmamak için net şekilde uyarıyoruz.
      statusPillMsg.textContent = 'UYARI: Bulut bağlantısı kapalı — rapor kalıcı kaydedilmedi!';
      statusPill.classList.remove('ok');
      document.getElementById('storageNoteMsg').textContent = 'Bulut bağlantısı şu an kapalı (cihaz depolama da devre dışı) — bu rapor hiçbir yere kalıcı kaydedilmedi, sayfa yenilenirse kaybolur.';
    }
  }catch(err){
    showError('Rapor oluşturulurken hata oluştu: ' + err.message);
    console.error(err);
    throw err; // Grup B panelinin "Veri Güncelle" butonu da bu hatayı yakalayıp kendi durum mesajında gösterebilsin diye yeniden fırlatılır.
  }
}
buildBtn.addEventListener('click', raporuOlusturVeyaGuncelleAkisiniCalistir);
if(gvyAnaBuildBtn) gvyAnaBuildBtn.addEventListener('click', raporuOlusturVeyaGuncelleAkisiniCalistir);

syncBtn.addEventListener('click', async ()=>{
  if(!cloudEnabled()) return;
  if(!(await ortakSifreDogrula('Diğer cihazdan güncellemek için şifreyi girin:'))) return;
  syncBtn.disabled = true;
  const prevText = syncBtn.textContent;
  syncBtn.textContent = '🔄 Güncelleniyor…';
  try{
    // Bu 6 çağrı da (uygulamayiBaslat'taki gibi) birbirinden bağımsız — paralel çalıştırılır.
    const [cloudReport] = await Promise.all([
      loadReportFromCloud(),
      faturaArsivYenile(true),
      musteriMasterYenile(),
      bayiHakedisYenile(),
      sellOutHedefYenile(),
      sellOutYenile(),
      sellOutArsivYenile(true),
      (typeof rutPlaniYenile==='function' ? rutPlaniYenile(true) : Promise.resolve()),
    ]);
    if(typeof tumYukluVerilerdeMusteriIliskileriniGuncelle==='function') tumYukluVerilerdeMusteriIliskileriniGuncelle();
    if(document.getElementById('bayiHakedisView') && document.getElementById('bayiHakedisView').style.display !== 'none') renderBayiHakedisView();
    if(document.getElementById('sellOutView') && document.getElementById('sellOutView').style.display !== 'none') renderSellOutView();
    if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
    if(cloudReport && cloudReport.musteriler && cloudReport.musteriler.length){
      musteriMasterIliskileriniDerinGuncelle(cloudReport);
      raporuNormalizeEt(cloudReport); // eksik alanlara dayanıklılık
      state.report = cloudReport;
      state.expanded.clear();
      await saveReportToStorage(cloudReport);
      canliGunlerleGuncelle(cloudReport);
      renderReport(cloudReport);
      statusPillMsg.textContent = 'Buluttan güncellendi (' + fmtDate(cloudReport.asOf) + ')';
      statusPill.classList.add('ok');
    }else{
      statusPillMsg.textContent = 'Buluttan veri alınamadı, mevcut rapor gösteriliyor';
    }
  }catch(err){
    console.error('Diğer cihazdan güncelleme başarısız:', err);
    alert('Güncelleme sırasında bir hata oluştu: ' + err.message + '\n\nLütfen tekrar deneyin.');
  }finally{
    syncBtn.disabled = false;
    syncBtn.textContent = prevText;
  }
});
