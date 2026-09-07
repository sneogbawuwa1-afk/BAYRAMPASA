// sw.js — Keşan Bayi Takip Paneli Service Worker
//
// VERSİYON NUMARALANDIRMA KURALI: APP_VERSION bu dosyada güncellendiğinde, index.html
// üzerindeki tüm ".app-version-label" rozetleri (ör. "V3.4") otomatik olarak buradaki
// değerle eşleşir — index.html'i elle düzenlemeye GEREK YOKTUR. Eşleşme, index.html'deki
// script'in bu worker'a postMessage({type:'GET_VERSION'}) göndermesi ve buradaki mesaj
// dinleyicisinin postMessage({type:'VERSION', version:APP_VERSION}) ile cevap vermesiyle
// sağlanır (bkz. dosya sonundaki 'message' olay dinleyicisi).
//
// Yeni bir sürüm yayınlarken yapılması gereken TEK şey: APP_VERSION'ı artırmak.
// CACHE_NAME de APP_VERSION'dan türediği için otomatik olarak yeni bir cache alanı açılır
// ve activate aşamasında eski sürümün cache'i silinir — statik dosyalarda manuel cache
// temizliği gerekmez.
const APP_VERSION = '15';
const CACHE_NAME = 'kesan-bayi-takip-v' + APP_VERSION;

// Uygulama kabuğu: ilk yüklemede önbelleğe alınır, çevrimdışı açılışı mümkün kılar.
// Yalnızca AYNI ORİJİNDEN (bu sunucudan) servis edilen dosyalar burada listelenir —
// Firebase/Google Fonts/FontAwesome/xlsx gibi dış CDN kaynakları bilerek DAHİL EDİLMEZ
// (bkz. aşağıdaki fetch stratejisi notu).
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/01-cekirdek-ve-arsiv.js',
  './js/02-bulut-ve-auth.js',
  './js/03-veri-yukleme-ve-senkron.js',
  './js/04-genel-bakis.js',
  './js/05-musteri-ve-tablolar.js',
  './js/06-senet-ve-detay.js',
  './js/07-analiz-raporlari.js',
  './js/08-kanal-raporlari.js',
  './js/09-stok-gun.js',
  './js/10-uygulama-ve-gorunumler.js',
  './js/11-prim.js',
  './js/12-sap-kontrol-export.js',
  './js/13-arsiv-degisiklik-raporu.js',
  './js/14-rut-plani.js',
  './Kitap6.xlsx',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// --- INSTALL: yeni sürüm indirilir indirilmez uygulama kabuğunu önbelleğe alır ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Bir dosya (ör. henüz yüklenmemiş bir ikon) eksikse install'ın tamamen
      // başarısız olup worker'ın hiç etkinleşmemesini önlemek için hatayı yutuyoruz —
      // eksik dosya sonraki fetch'te ağdan normal şekilde alınır.
    })
  );
});

// --- ACTIVATE: eski sürümlere ait cache'leri temizler, yeni worker'ı hemen devreye alır ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((isimler) =>
      Promise.all(
        isimler
          .filter((isim) => isim.startsWith('kesan-bayi-takip-v') && isim !== CACHE_NAME)
          .map((isim) => caches.delete(isim))
      )
    ).then(() => self.clients.claim())
  );
});

// --- FETCH STRATEJİSİ ---
// index.html sık güncellenen, canlı veriyle çalışan bir tek-sayfa uygulama olduğundan
// KENDİ ORİJİNİMİZDEN gelen istekler için "network-first, cache fallback" kullanılır:
// önce ağdan güncel dosya denenir, başarılı olursa hem kullanıcıya verilir hem cache
// güncellenir; ağ yoksa (çevrimdışı) en son önbelleğe alınmış sürüm gösterilir.
// Dış CDN istekleri (Firebase, Google Fonts, FontAwesome, xlsx vb.) service worker'a
// hiç dokunulmadan tarayıcının kendi ağ/HTTP cache davranışına bırakılır — bu yüzden
// event.respondWith çağrılmadan erken return edilir.
self.addEventListener('fetch', (event) => {
  const istekUrl = new URL(event.request.url);
  if (istekUrl.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((yanit) => {
        const kopya = yanit.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopya)).catch(() => {});
        return yanit;
      })
      .catch(() =>
        caches.match(event.request).then((onbellek) => onbellek || caches.match('./index.html'))
      )
  );
});

// --- MESAJLAŞMA: index.html ile sürüm sorgusu / güncelleme tetikleme protokolü ---
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    // Kullanıcı "Şimdi yenile" butonuna bastığında index.html bu mesajı gönderir;
    // bekleyen (waiting) worker hemen aktifleşir → controllerchange tetiklenir →
    // index.html sayfayı otomatik yeniler.
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    // index.html hem sayfa yüklendiğinde (aktif worker için) hem yeni bir worker
    // "waiting" durumuna geçtiğinde (güncelleme bildirimi için) bu isteği gönderir.
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});
