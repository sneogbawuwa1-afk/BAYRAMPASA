// ============================================================================
// STOK GÜN — Hedefli ve Dinamik Stok Yönetimi Metodolojisi
// ============================================================================
// 1. Aşama: son 6 ayın arşivlenmiş Sell Out verisinden (sellOutArsivCache), her ürünün
// (Malzeme Kodu) toplam litre payı çıkarılır; üst yönetim hedefi (temsilci Açık+Kapalı Kanal
// hedeflerinin toplamı) bu paylara göre ürünlere dağıtılır ("Gerekli Litre").
// 2. Aşama: her ürünün 6 aylık günlük satış verisi, o ayın 4 sabit haftalık dilimine
// (1-7 / 8-14 / 15-21 / 22-ay sonu) ayrılır; en yüksek toplam satışı olan dilim "yoğun hafta"
// seçilir, o dilimin GÜNLÜK ORTALAMASI ("Yoğun Dönem Günlük Hız") hesaplanır. Anlık depo stoğu
// (Malzemeler dosyası) bu hıza bölünerek "Dinamik Stok Günü" elde edilir.

const STOK_GUN_AY_SAYISI = 6; // "son 6 ay" — arşivden geriye doğru kaç ay taranacağı

// İSTATİSTİKSEL GÜVENLİK STOĞU sabitleri: SS = Z × σ_D × √LT
//  Z: hedeflenen servis seviyesi çarpanı (%95 bulunurluk ≈ 1.65). Ürün sınıfına göre
//     farklılaştırmak isterseniz (A/B/C sınıfı) bu sabiti ürün bazlı bir haritaya çevirebilirsiniz.
//  σ_D: günlük talebin standart sapması — artık MÜMKÜN OLDUĞUNDA gerçek gün-gün satış
//     verisinden ölçülüyor (bkz. stokGunGercekGunlukIstatistik). Yeterli günlük veri yoksa
//     (yeni/az geçmişli ürün) aylık değişkenlik katsayısına (cv) geri düşer.
//  LT: ortalama tedarik süresi (gün) — 3 gün olarak girildi (gerçek ortalama teslimat süreniz).
//     Tedarikçiye göre farklılık varsa (ör. bazı ürünler 3, bazıları 10 gün) bunu ürün/tedarikçi
//     bazlı bir haritaya çevirip haftaGunlukHizlari hesaplandığı yerde kullanabiliriz.
const STOK_GUN_SERVIS_SEVIYESI_Z = 1.65; // ~%95 hedef bulunurluk oranı
const STOK_GUN_VARSAYILAN_LEAD_TIME_GUN = 3; // Gerçek ortalama tedarik süresi

// Bir ayKey (YYYY-MM) için, o ayın 4 sabit haftalık dilimini (başlangıç/bitiş gün numarası ve
// dilimdeki gün sayısı) döndürür. Son dilim ayın gerçek gün sayısına göre 8-10 gün olabilir.
// TAKVİM ETKİSİ İNDEKSİ (E_t): resmi/dini tatil ve arife günlerinde B2B dağıtım hacmi normal
// güne göre nasıl değişiyor. Bunlar SATIŞ YASAĞI değil — Türkiye'de bayram günlerinde alkol
// satışını tamamen durduran bir yasal düzenleme yok (sadece 22:00-06:00 arası günlük satış
// saati kısıtı her gün geçerli). Buradaki düşük katsayılar, bayram günlerinde işyerlerinin/
// noktaların kapalı olması nedeniyle FATURALAMA/DAĞITIM hacminin fiilen durmasını yansıtır;
// yüksek katsayılar ise arife öncesi stoklama talebini yansıtır. DEĞERLER VARSAYIMDIR — ideal
// olan, geçen yılın aynı tarihlerindeki gerçek düşüş/artışın arşiv verisinden ölçülmesidir;
// yeterli geçmiş veri birikince stokGunGecmisTenOlcumluEt() ile güncellenebilir.
const STOK_GUN_TAKVIM_ETKISI_2026 = {
  '2026-01-01': 0.4,  // Yılbaşı
  '2025-12-30': 1.3, '2025-12-31': 1.5, // Yılbaşı öncesi stoklama
  '2026-03-18': 1.3, // Ramazan Bayramı öncesi stoklama
  '2026-03-19': 0.5, // Arife (yarım gün)
  '2026-03-20': 0.2, '2026-03-21': 0.2, '2026-03-22': 0.2, // Ramazan Bayramı
  '2026-04-23': 0.4, // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01': 0.4, // Emek ve Dayanışma Günü
  '2026-05-19': 0.4, // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-05-25': 1.4, // Kurban Bayramı öncesi stoklama
  '2026-05-26': 0.5, // Arife (yarım gün)
  '2026-05-27': 0.15, '2026-05-28': 0.15, '2026-05-29': 0.15, '2026-05-30': 0.15, // Kurban Bayramı
  '2026-07-15': 0.4, // Demokrasi ve Millî Birlik Günü
  '2026-08-30': 0.4, // Zafer Bayramı
  '2026-10-28': 0.6, // Cumhuriyet Bayramı arifesi (öğleden sonra yarım gün)
  '2026-10-29': 0.4, // Cumhuriyet Bayramı
};

// Verilen bir Date için takvim etkisi katsayısını döndürür; tanımlı değilse 1.0 (etkisiz).
function stokGunTakvimEtkisi(tarih){
  const gk = dateKeyLocal(tarih);
  return STOK_GUN_TAKVIM_ETKISI_2026[gk] != null ? STOK_GUN_TAKVIM_ETKISI_2026[gk] : 1.0;
}

function stokGunHaftaDilimleri(ayKey){
  const [yil, ay] = ayKey.split('-').map(Number);
  const ayinGunSayisi = new Date(yil, ay, 0).getDate();
  return [
    {baslangic:1, bitis:7, gunSayisi:7},
    {baslangic:8, bitis:14, gunSayisi:7},
    {baslangic:15, bitis:21, gunSayisi:7},
    {baslangic:22, bitis:ayinGunSayisi, gunSayisi: ayinGunSayisi-22+1},
  ];
}

// Son STOK_GUN_AY_SAYISI ay için arşivlenmiş Sell Out raporlarını (sellOutArsivCache) toplar,
// yoksa boş döner. Her ürün için: {kod, urunAdi, toplamLitre6Ay, toplamMiktar6Ay, gunler:[{gunKey,litre,miktar}]}.
function stokGunUrunVerileriniTopla(){
  const sellOutArsiv = state.sellOutArsivCache || {};
  const modernKanalArsiv = state.modernKanalArsivCache || {};
  const buAyKey = dateKeyLocal(turkiyeBugun()).slice(0,7);
  // İçinde bulunduğumuz ay yanlışlıkla (henüz tamamlanmadan) arşivlenmiş olsa bile burada
  // her zaman hariç tutulur — "geçmiş 6 ay" mantığı yalnızca TAMAMLANMIŞ aylarla anlamlı;
  // yarım kalmış bir ayın haftalık dağılımı gerçek deseni yanıltır. Geleneksel Kanal ve
  // Modern Kanal'ın arşivlenmiş ayları AYRI tutulur (ikisi farklı ritimde arşivlenebilir),
  // ama her ikisi de aynı "son 6 tamamlanmış ay" penceresine (kendi ay listesine göre) tabidir.
  const sellOutAylar = Object.keys(sellOutArsiv).filter(ay=> ay !== buAyKey).sort().slice(-STOK_GUN_AY_SAYISI);
  const modernKanalAylar = Object.keys(modernKanalArsiv).filter(ay=> ay !== buAyKey).sort().slice(-STOK_GUN_AY_SAYISI);
  // "sonAylar" (raporun üst bilgisinde gösterilen "6 ay: ...") iki kaynağın aylarının
  // BİRLEŞİMİDİR — kullanıcı hangi ayların hesaba katıldığını görebilsin diye.
  const sonAylar = Array.from(new Set([...sellOutAylar, ...modernKanalAylar])).sort();
  const urunMap = new Map(); // kod -> {urunAdi, marka, toplamLitre6Ay, toplamMiktar6Ay, gunler:[], aktifAylar:Set, kapsananAylar:Set, kanal:{sellOut:{...}, modernKanal:{...}}}

  // Her iki kaynaktan (Geleneksel Kanal + Modern Kanal) gelen ürün listelerini AYNI urunMap'e
  // TOPLAYARAK birleştirir — bir ürün her iki kanaldan da satılıyorsa (aynı Malzeme/Ürün Kodu),
  // BİRLEŞİK litre/miktar/gün verileri toplanır (aktifAylar/veriGuveni/istatistik hesapları için).
  // AYRICA, "kanal" alanı altında SELL OUT ve MODERN KANAL'ın kendi ayrı toplamLitre6Ay ve
  // gunler dizileri de AYRI AYRI tutulur — çünkü "pay" artık HER KANALIN KENDİ İÇİNDE ayrı
  // hesaplanıp kendi hedefine uygulanacak (bkz. computeStokGunRaporu): sadece Modern Kanal'dan
  // satılan bir ürünün payı, Modern Kanal'ın toplamı içindeki payı olmalı ve SADECE Modern
  // Kanal'ın (girilen) hedefine uygulanmalı — Sell Out'un (varsa) çok daha büyük hedefine göre
  // hesaplanıp yapay derecede büyük bir "Gerekli Litre" üretmemeli.
  function isle(kanalAdi, arsiv, aylar){
    aylar.forEach(ayKey=>{
      const rapor = arsiv[ayKey];
      if(!rapor || !Array.isArray(rapor.malzemeler)) return;
      rapor.malzemeler.forEach(u=>{
        // Marka, arşivde saklanan (o ay hesaplandığı andaki) değer yerine HER ZAMAN GÜNCEL
        // sellOutMarkaGrubu() mantığıyla yeniden hesaplanır. Böylece marka sınıflandırma kuralı
        // (ör. Distile/Bira anahtar kelime listesi) değiştiğinde, geçmişte arşivlenmiş aylar
        // yeniden arşivlenmeden/hiçbir dosya tekrar yüklenmeden, ekrandaki Stok Gün filtresi
        // her zaman en güncel kurala göre görünür.
        const guncelMarka = sellOutMarkaGrubu(u.marka || u.urunAdi || u.kod);
        // Ana Ürün / Parçalı Ürün birleştirme kuralı (bkz. PARCALI_ANA_URUN_ESLEME): Bira
        // grubunda parçalı kodun verisi ana koda toplanır (parçalı kod raporda görünmez);
        // Distile grubunda ise tam tersi, ana kodun verisi parçalı koda toplanır (ana kod
        // raporda görünmez). Gruplama anahtarı olarak u.kod yerine bu "hedef kod" kullanılır.
        const hedefKod = stokGunHedefKodBul(u.kod, guncelMarka);
        if(!urunMap.has(hedefKod)) urunMap.set(hedefKod, {
          kod:hedefKod, urunAdi: (hedefKod===u.kod ? u.urunAdi : null), marka:guncelMarka,
          toplamLitre6Ay:0, toplamMiktar6Ay:0, gunler:[], aktifAylar:new Set(), kapsananAylar:new Set(),
          kanal:{ sellOut:{toplamLitre6Ay:0, gunler:[]}, modernKanal:{toplamLitre6Ay:0, gunler:[]} },
        });
        const hedef = urunMap.get(hedefKod);
        // Ürün adı tercihen HEDEF KODUN kendi satırından gelsin (ör. Distile'de parçalı kodun
        // "70CL" gibi kendi adı, ana kodun "12X70CL" adından daha doğru temsil eder); o satır
        // henüz işlenmediyse geçici olarak eldeki isim kullanılır, hedef koda ait veri
        // geldiğinde üzerine yazılır.
        if(hedefKod===u.kod){
          if(u.urunAdi) hedef.urunAdi = u.urunAdi;
        } else if(!hedef.urunAdi){
          hedef.urunAdi = u.urunAdi; // hedef kendi satırı gelene kadar geçici isim
        }
        hedef.marka = guncelMarka;
        hedef.kapsananAylar.add(ayKey);
        const kanalHedef = hedef.kanal[kanalAdi];
        let buAyToplamLitre = 0;
        (u.gunler||[]).forEach(g=>{
          // LİTRE zaten gerçek fiziksel birimdir (bir adet parçalı ürünün de, bir adet ana
          // ürünün de kendi gerçek litre karşılığı önceden hesaplanmıştır) — bu yüzden doğrudan
          // toplanabilir, birim çevirme gerektirmez.
          hedef.toplamLitre6Ay += g.litre;
          // MİKTAR (adet) ise "1 adet ana" ile "1 adet parçalı" farklı fiziksel büyüklükte
          // olduğundan (ör. 1 koli = 12 şişe), hedef kodun kendi birimine ÇEVRİLEREK toplanır —
          // aksi halde litreMiktarOrani (Stok Gün'ün anlık stoğu litreye çevirmede kullandığı
          // oran) karışık birimden yanlış hesaplanır (bkz. stokGunMiktarBirimCevir).
          const donusmusMiktar = stokGunMiktarBirimCevir(g.miktar||0, u.kod, hedefKod);
          hedef.toplamMiktar6Ay += donusmusMiktar;
          hedef.gunler.push(g.miktar===donusmusMiktar ? g : Object.assign({}, g, {miktar:donusmusMiktar}));
          kanalHedef.toplamLitre6Ay += g.litre;
          kanalHedef.gunler.push(g.miktar===donusmusMiktar ? g : Object.assign({}, g, {miktar:donusmusMiktar}));
          buAyToplamLitre += g.litre;
        });
        if(buAyToplamLitre>0) hedef.aktifAylar.add(ayKey);
      });
    });
  }
  isle('sellOut', sellOutArsiv, sellOutAylar);
  isle('modernKanal', modernKanalArsiv, modernKanalAylar);

  const urunler = Array.from(urunMap.values()).map(u=>{
    const aktifAylarSirali = Array.from(u.aktifAylar).sort();
    const kapsananAylarSirali = Array.from(u.kapsananAylar).sort();
    const ilkSatisAy = aktifAylarSirali[0] || null;
    const aktifAySayisi = aktifAylarSirali.length;
    // "Yeni ürün": incelenen pencerenin (sonAylar) İLK ayında satışı yokken, sonraki bir ayda
    // satışa başlamış ürün — yani portföye pencere içinde sonradan girmiş demektir. Pencerenin
    // ilk ayından beri satılan ama arada satışsız ayı olan (mevsimsel/düzensiz) ürünler bu
    // etiketi almaz, ama onlar için de aktifAySayisi zaten doğru şekilde düşük çıkar.
    // "Yeni ürün" tespiti de ürünün KENDİ kapsananAylar penceresinin ilk ayına göre yapılır —
    // birleşik sonAylar[0]'a göre değil. Aksi halde sadece Modern Kanal'dan (daha kısa/farklı
    // takvimde arşivlenen) satılan aktif bir ürün, Sell Out'un daha eski bir ayı yüzünden
    // haksız yere "yeni ürün" damgalanabilirdi.
    const yeniUrun = !!(ilkSatisAy && kapsananAylarSirali.length && ilkSatisAy !== kapsananAylarSirali[0]);
    let veriGuveni = 'Yüksek';
    if(aktifAySayisi<=1) veriGuveni='Düşük';
    else if(aktifAySayisi<=3) veriGuveni='Orta';
    return Object.assign({}, u, {aktifAylar:aktifAylarSirali, kapsananAylar:kapsananAylarSirali, ilkSatisAy, aktifAySayisi, yeniUrun, veriGuveni});
  });
  return {sonAylar, urunler};
}

// Bir marka (mal grubu) için, o markadaki TÜM ürünlerin gün dizilerini birleştirip tek bir
// "marka geneli haftalık dağılım şekli" (4 dilimin toplam litre içindeki oranı) çıkarır.
// Yeni/az geçmişli ürünlerde kendi haftalık deseni (tek bir ayın gürültüsünden ibaret
// olabilir) yerine, aynı markadaki daha köklü ürünlerin ORTAK deseni referans alınarak daha
// istikrarlı bir tahmin elde edilir (bkz. stokGunOwnVeMarkaShapeKarisimi).
function stokGunMarkaHaftaSekilleri(urunler){
  const markaDilim = new Map(); // marka -> [4 dilim toplam litre]
  urunler.forEach(u=>{
    const d = stokGunHaftaDagilimi(u.gunler);
    if(!markaDilim.has(u.marka)) markaDilim.set(u.marka, [0,0,0,0]);
    const acc = markaDilim.get(u.marka);
    for(let i=0;i<4;i++) acc[i]+=d.litre[i];
  });
  const markaSekil = new Map(); // marka -> [4 dilim ORAN (toplam=1)]
  markaDilim.forEach((dilim, marka)=>{
    const toplam = dilim.reduce((a,b)=>a+b,0);
    markaSekil.set(marka, toplam>0 ? dilim.map(v=>v/toplam) : [0.25,0.25,0.25,0.25]);
  });
  return markaSekil;
}

// Bir ürünün KENDİ haftalık dağılım şeklini, veri güvenine göre markasının genel şekliyle
// harmanlar. aktifAySayisi arttıkça kendi verisine olan güven artar (3 aya ulaşınca %100 kendi
// verisi kullanılır); az geçmişli/yeni ürünlerde marka deseni ağırlık kazanarak tahmini
// gürültüden (tek bir ayın rastgele dalgalanmasından) korur. Dönüş: bu ürünün toplamLitre6Ay'ı
// üzerinden ölçeklenmiş, harmanlanmış 4 dilimlik litre dizisi (stokGunHaftaDagilimi ile aynı
// formatta) — böylece geri kalan hesap akışı değişmeden kullanılabilir.
function stokGunOwnVeMarkaShapeKarisimi(u, markaSekilleri){
  const ownDilim = stokGunHaftaDagilimi(u.gunler);
  const toplam = u.toplamLitre6Ay || ownDilim.litre.reduce((a,b)=>a+b,0);
  if(toplam<=0) return ownDilim;
  const ownSekil = ownDilim.litre.map(v=>v/toplam);
  const markaSekil = markaSekilleri.get(u.marka) || [0.25,0.25,0.25,0.25];
  const kendiAgirlik = Math.min(1, (u.aktifAySayisi||0)/3);
  const harmanSekil = ownSekil.map((v,i)=> kendiAgirlik*v + (1-kendiAgirlik)*markaSekil[i]);
  // ÖNEMLİ DÜZELTME: miktar dizisi önceden harmanlanmadan (ham ownDilim.miktar) dönüyordu —
  // litre dizisi marka şekliyle harmanlanmışken miktar harmanlanmamış kalması, ikisinin
  // birbirine göre tutarsız (farklı oranlarda ölçeklenmiş) olmasına yol açıyordu. Artık miktar
  // da AYNI dilim bazında, litredeki değişim oranıyla ölçekleniyor — böylece iki dizi arasındaki
  // litre/miktar oranı her dilimde tutarlı kalır.
  const harmanMiktar = ownDilim.litre.map((ownLitreDeger, i)=>{
    const yeniLitre = harmanSekil[i]*toplam;
    const oran = ownLitreDeger>0 ? (yeniLitre/ownLitreDeger) : 1;
    return (ownDilim.miktar[i]||0) * oran;
  });
  return {litre: harmanSekil.map(v=>v*toplam), miktar: harmanMiktar};
}

// Bir ürünün gün dizisini AY bazında toplayıp {ayKey -> litre} haritasına çevirir. Aşağıdaki
// üç fonksiyonun (ağırlıklı ortalama, değişkenlik katsayısı, ölü ürün tespiti) ortak girdisi.
function stokGunAylikOzet(u){
  const aylikLitre = new Map();
  (u.gunler||[]).forEach(g=>{
    const ayKey = g.gunKey.slice(0,7);
    aylikLitre.set(ayKey, (aylikLitre.get(ayKey)||0)+g.litre);
  });
  return aylikLitre;
}

// sonAylar dizisindeki her aya, sıradaki konumuna göre artan bir ağırlık atar (en eski ay=1,
// en güncel ay=sonAylar.length). ÖNEMLİ: Bu uygulamanın gerçek verisinde 6 ayda toplam satış
// hacmi ~4 katına çıkmış (Ocak 144binL → Haziran 600binL) — düz ortalama bu güncel ivmeyi
// maskeliyordu. Doğrusal artan ağırlık, güncel aylara daha fazla pay vererek hem "pay" hem
// "haftalık hız" hesabını şu anki satış temposuna daha yakın tutar.
function stokGunAyAgirlikHaritasi(sonAylar){
  const harita = new Map();
  sonAylar.forEach((ay,idx)=> harita.set(ay, idx+1));
  return harita;
}

// Bir ürünün aylık litrelerinin AĞIRLIKLI ortalamasını döndürür (düz ortalama yerine) — yalnızca
// ürünün gerçekten aktif olduğu aylar (aylikLitre içindeki) ve o ayların ağırlıkları kullanılır;
// böylece hem "yeni ürün" (az ay) hem "trend" (güncel aya yakınlık) etkisi birlikte hesaba katılır.
function stokGunAgirlikliAylikOrtalama(aylikLitre, ayAgirlik){
  let toplamAgirlikliLitre=0, toplamAgirlik=0;
  aylikLitre.forEach((litre, ayKey)=>{
    const w = ayAgirlik.get(ayKey) || 1;
    toplamAgirlikliLitre += litre*w;
    toplamAgirlik += w;
  });
  return toplamAgirlik>0 ? toplamAgirlikliLitre/toplamAgirlik : 0;
}

// Ürünün ay-ay satış hacmindeki OYNAKLIĞI (değişkenlik katsayısı = std sapma / ortalama)
// ölçer — güvenlik stoğu payının temeli. Tek aylık geçmişte gerçek varyans hesaplanamayacağı
// için, yeni/az geçmişli ürünlerde temkinli bir varsayılan (0.35) kullanılır. Üst sınır 1.5
// ile sınırlanır ki aşırı uç bir ay (ör. tek seferlik dev sipariş) hesabı komple bozmasın.
// GERÇEK GÜNLÜK DEĞİŞKENLİK: u.gunler'daki her kayıt bir SATIŞ OLAN gün — satış olmayan
// günler dizide hiç yer almıyor (o gün için satır üretilmediği için). Bu yüzden doğrudan
// gunler.map(g=>g.litre) üzerinden std sapma almak YANLIŞ olur: satışsız günleri (=0 litre)
// yok sayıp ortalamayı olduğundan yüksek, değişkenliği olduğundan düşük gösterir. Doğrusu,
// pencere içindeki (sonAylar) HER takvim gününü (satışlı/satışsız fark etmeksizin) sayıp
// eksik günleri 0 kabul ederek gerçek bir günlük seri oluşturmak. Dönüş: {ortalama, sigma,
// gunSayisi, cv} — cv, mevcut (aylık-türetilmiş) yaklaşık değerin yerine geçecek gerçek değer.
function stokGunGercekGunlukIstatistik(gunler, sonAylar){
  if(!gunler || !gunler.length || !sonAylar || !sonAylar.length) return {ortalama:0, sigma:0, gunSayisi:0, cv:null};
  // ÖNEMLİ: Ana Ürün/Parçalı Ürün birleştirmesi sonrası AYNI güne (gunKey) ait BİRDEN FAZLA
  // satır olabilir (ör. hem ana hem parçalı kodun o gün satışı varsa, ikisi de aynı hedef
  // kodun gunler dizisine ayrı satırlar olarak eklenir). new Map(gunler.map(...)) burada YANLIŞ
  // olurdu çünkü aynı anahtar (gunKey) tekrar geldiğinde ÖNCEKİ değeri SESSİZCE EZER, toplamaz
  // — bu da o günün litresini olduğundan düşük gösterirdi. Doğrusu, aynı gunKey'e sahip
  // satırların litrelerini TOPLAYARAK tek bir haritaya indirgemek.
  const litreMap = new Map();
  gunler.forEach(g=> litreMap.set(g.gunKey, (litreMap.get(g.gunKey)||0) + (g.litre||0)));
  const seri = [];
  sonAylar.forEach(ayKey=>{
    const [yil, ay] = ayKey.split('-').map(Number);
    const ayinGunSayisi = new Date(yil, ay, 0).getDate();
    for(let gun=1; gun<=ayinGunSayisi; gun++){
      const gk = ayKey + '-' + String(gun).padStart(2,'0');
      seri.push(litreMap.get(gk) || 0);
    }
  });
  const n = seri.length;
  if(n<2) return {ortalama:0, sigma:0, gunSayisi:n, cv:null};
  const ortalama = seri.reduce((a,b)=>a+b,0)/n;
  if(ortalama<=0) return {ortalama:0, sigma:0, gunSayisi:n, cv:null};
  const varyans = seri.reduce((a,v)=>a+Math.pow(v-ortalama,2),0)/n;
  const sigma = Math.sqrt(varyans);
  return {ortalama, sigma, gunSayisi:n, cv: sigma/ortalama};
}

function stokGunDegiskenlikKatsayisi(aylikLitre){
  const degerler = Array.from(aylikLitre.values());
  if(degerler.length<2) return 0.35;
  const ort = degerler.reduce((a,b)=>a+b,0)/degerler.length;
  if(ort<=0) return 0.35;
  const varyans = degerler.reduce((a,v)=>a+Math.pow(v-ort,2),0)/degerler.length;
  return Math.min(1.5, Math.sqrt(varyans)/ort);
}

// "Ölü ürün": geçmişte satışı olduğu halde, incelenen pencerenin SON 1-2 ayında hiç satışı
// olmayan ürün — "yeni ürün"ün tam tersi bir durum. Bu ürünler artık hedef dağıtımından
// (pay) çıkarılır — geçmiş hacimleri güncel talebi temsil etmediği için onlara sipariş hedefi
// üretmek yanlış olur; yine de tablo'da eski (organik) hızlarıyla referans amaçlı gösterilir.
function stokGunOluUrunMu(aylikLitre, sonAylar){
  if(!aylikLitre.size || !sonAylar.length) return false;
  const sonN = sonAylar.slice(-Math.min(2, sonAylar.length));
  return sonN.every(ay => !(aylikLitre.get(ay) > 0));
}

// Bir ürünün gün dizisinden (birden fazla ayı kapsayabilir), en yoğun haftalık dilimi ve o
// dilimin günlük ortalama hızını bulur. Her gün kendi ayının dilim sınırlarına göre
// gruplanır (ör. Mayıs'ın 3. haftası ile Haziran'ın 3. haftası ayrı dilimlerdir).
function stokGunBugununDilimIndex(){
  const bugun = turkiyeBugun();
  const gunNo = bugun.getDate();
  const ayKey = dateKeyLocal(bugun).slice(0,7);
  const dilimler = stokGunHaftaDilimleri(ayKey);
  const idx = dilimler.findIndex(d=> gunNo>=d.baslangic && gunNo<=d.bitis);
  return idx>=0 ? idx : 0;
}

// Bir urunun 6 aylik gun dizisini, AY BAGIMSIZ 4 hafta dilimine (0:1-7, 1:8-14, 2:15-21,
// 3:22-ay sonu) gore toplar - her ay kendi gun sayisina gore 4. dilime katkida bulunur ama
// hepsi tek bir "hafta 0/1/2/3" toplaminda birlesir. Boylece "6 ayin toplaminin yuzde kaci
// hangi haftaya ait" sorusu ay ay degil, TUM 6 ay uzerinden tek bir dagilim olarak cikar.
function stokGunHaftaDagilimi(gunler){
  const litreDilim = [0,0,0,0];
  const miktarDilim = [0,0,0,0];
  gunler.forEach(g=>{
    const ayKey = g.gunKey.slice(0,7);
    const gunNo = Number(g.gunKey.slice(8,10));
    const dilimler = stokGunHaftaDilimleri(ayKey);
    const idx = dilimler.findIndex(d=> gunNo>=d.baslangic && gunNo<=d.bitis);
    if(idx>=0){
      litreDilim[idx] += g.litre;
      miktarDilim[idx] += (g.miktar||0);
    }
  });
  return {litre:litreDilim, miktar:miktarDilim};
}

// Bugünden başlayarak, anlık stoğu GÜN GÜN düşüren simülasyon: her gün, o günün ait olduğu
// hafta diliminin (1-7/8-14/15-21/22-ay sonu) KENDİ günlük hızıyla tüketilir — haftalar
// arası geçişte hız değişir (ör. bugün 3. haftanın son 2 günündeyse önce 3. haftanın hızıyla,
// sonra 4. haftaya geçince 4. haftanın hızıyla devam eder). Stok sıfıra düştüğü gün sayısı
// (kesirli kısım dahil) döndürülür. haftaGunlukHizlari: [hafta0Hız, hafta1Hız, hafta2Hız, hafta3Hız]
// (litre/gün, her biri kendi haftasının kalan-hedefe göre ölçeklenmiş hızı).
// esikLitre (varsayılan 0): simülasyonun "bittiği" kabul edilen stok seviyesi. 0 ile
// çağrıldığında davranış eskisiyle birebir aynıdır (stok tamamen tükenene kadar sayar).
// Pozitif bir değer verilirse (örn. güvenlik stoğu litresi), stok o eşiğin ALTINA düştüğü
// gün sayısını döndürür — yani "kaç gün sonra yeniden sipariş noktasına düşer" sorusuna
// cevap verir (bkz. computeStokGunRaporu'daki stokGunuGuvenlikli hesabı).
function stokGunSimulasyonuYap(anlikStokLitre, haftaGunlukHizlari, maksGunSiniri, esikLitre){
  esikLitre = esikLitre || 0;
  if(anlikStokLitre==null || anlikStokLitre<=esikLitre) return 0;
  let kalanStok = anlikStokLitre;
  let gun = turkiyeBugun();
  const siniir = maksGunSiniri || 400; // sonsuz döngüye karşı güvenlik (stok hiç bitmiyorsa)
  for(let i=0; i<siniir; i++){
    const ayKey = dateKeyLocal(gun).slice(0,7);
    const gunNo = gun.getDate();
    const dilimler = stokGunHaftaDilimleri(ayKey);
    const dilimIndex = dilimler.findIndex(d=> gunNo>=d.baslangic && gunNo<=d.bitis);
    // Haftalık dilim hızı, o GÜNE ÖZEL takvim etkisiyle (tatil/arife/kampanya) ölçeklenir —
    // bkz. STOK_GUN_TAKVIM_ETKISI_2026. Böylece örn. bir bayram haftasının ortasındaki gün,
    // haftanın geri kalanından farklı (çok daha düşük) bir hızla tüketilir.
    const gunlukHiz = (haftaGunlukHizlari[dilimIndex>=0?dilimIndex:0] || 0) * stokGunTakvimEtkisi(gun);
    if(gunlukHiz<=0){
      // Bu haftanın hızı sıfırsa (o dilimde hiç geçmiş satış yoksa), o günü es geçip bir
      // sonraki güne devam edilir — sıfıra bölme veya sonsuz döngü oluşmaz.
      gun = new Date(gun.getTime()+86400000);
      continue;
    }
    if(kalanStok - gunlukHiz <= esikLitre){
      // Stok bu günün ortasında eşiğe (varsayılan: sıfır) iniyor — kesirli gün olarak ekle.
      return i + ((kalanStok-esikLitre)/gunlukHiz);
    }
    kalanStok -= gunlukHiz;
    gun = new Date(gun.getTime()+86400000);
  }
  return siniir; // 400 günden fazla yetiyorsa (pratik olarak "tükenmiyor" demek), tavan değer.
}

// Ürün×temsilci risk detayındaki temsilci adını (Sell Out kaynaklı, "Satış Temsilcisi Adı")
// Tahsilat Karnesi'ndeki temsilci adıyla (Cari/Aging kaynaklı, m.temsilci) eşleştirir. İki
// kaynak farklı dosyalardan geldiği için birebir aynı yazılmayabilir (büyük/küçük harf, fazla
// boşluk vb.) — bu yüzden önce tam eşleşme, olmazsa uygulamanın zaten kullandığı
// normalizeAdSoyad standardıyla (bkz. getSahaMuduru) karşılaştırma yapılır.
function karneTemsilciGerceklesmeBul(temsilciAdi){
  if(!state.karneTemsilciMap || !state.karneTemsilciMap.size || !temsilciAdi) return null;
  const direkt = state.karneTemsilciMap.get(temsilciAdi);
  if(direkt) return direkt.gerceklesme;
  const hedefKey = normalizeAdSoyad(temsilciAdi);
  for(const [k,v] of state.karneTemsilciMap.entries()){
    if(normalizeAdSoyad(k)===hedefKey) return v.gerceklesme;
  }
  return null;
}

function computeStokGunRaporu(){
  const {sonAylar, urunler} = stokGunUrunVerileriniTopla();
  if(!urunler.length || !state.malzemelerStok || !state.malzemelerStok.size){
    return {yok:true, sonAylar};
  }
  // Anlık stok (Malzemeler dosyasından, ham/bölünmemiş kodlarla gelir) da AYNI Ana Ürün/Parçalı
  // Ürün birleştirme kuralına göre toplanır: her ham kodun ait olduğu hedef kod, o ürünün
  // (urunler listesindeki) marka sınıflandırmasına göre stokGunHedefKodBul ile bulunur ve
  // miktarlar o hedef kodun altında TOPLANIR. Böylece "parçalı stok, Bira'da ana koda; ana
  // stok, Distile'de parçalı koda" kuralı anlık stok tarafında da geçerli olur.
  const kodMarkaHaritasi = new Map(urunler.map(u=>[u.kod, u.marka]));
  const malzemelerStokBirlesik = new Map();
  state.malzemelerStok.forEach((miktar, hamKod)=>{
    // Bu ham kodun kendi markasını bilmiyoruz (Malzemeler dosyasında marka yok) — ama eşleme
    // tablosundaki karşılığının (ana/parçalı) markasını urunler listesinden buluyoruz; bulunamazsa
    // (ör. henüz Stok Gün'de hiç satılmamış bir kod) ham kod olduğu gibi kullanılır.
    const bilgi = PARCALI_ANA_URUN_ESLEME[hamKod]; // hamKod parçalıysa
    const tersBilgi = ANA_PARCALI_URUN_ESLEME_TERS[hamKod]; // hamKod anaysa
    let hedefKod = hamKod;
    if(bilgi){
      const marka = kodMarkaHaritasi.get(hamKod) || kodMarkaHaritasi.get(bilgi.ana);
      hedefKod = stokGunHedefKodBul(hamKod, marka || 'Bira');
    } else if(tersBilgi){
      const marka = kodMarkaHaritasi.get(hamKod) || kodMarkaHaritasi.get(tersBilgi.parcali);
      hedefKod = stokGunHedefKodBul(hamKod, marka || 'Bira');
    }
    // Miktar, hamKod'un kendi biriminden hedefKod'un birimine ÇEVRİLEREK toplanır — aksi halde
    // ör. 15 adet parçalı miktar, 812 adet ana miktara doğrudan (birim uyuşmazlığıyla) eklenip
    // yanlış bir toplam (827) üretirdi; doğrusu 812 + (15/2) = 819,5 gibi birim-dönüştürülmüş
    // bir toplamdır (bkz. stokGunMiktarBirimCevir).
    const donusmusMiktar = stokGunMiktarBirimCevir(miktar||0, hamKod, hedefKod);
    malzemelerStokBirlesik.set(hedefKod, (malzemelerStokBirlesik.get(hedefKod)||0) + (donusmusMiktar||0));
  });
  const toplamLitre6Ay = urunler.reduce((a,u)=>a+u.toplamLitre6Ay, 0);
  if(toplamLitre6Ay<=0) return {yok:true, sonAylar};

  // ÖNEMLİ DÜZELTME 1 (yeni ürün / kısmi geçmiş): "pay" eskiden doğrudan 6 aylık TOPLAM litre
  // üzerinden hesaplanıyordu — ama 6 ayın tamamında satan köklü bir ürün ile, pencereye
  // sonradan girip sadece 1 ayda satan yeni bir ürün aynı havuzda karşılaştırıldığında, yeni
  // ürünün toplamı sırf daha az aya yayıldığı için küçük çıkıyor ve payı olduğundan düşük
  // hesaplanıyordu.
  // ÖNEMLİ DÜZELTME 2 (trend/ivme): Ayrıca düz ortalama, aylar arası büyük hacim değişimini
  // (bu veri setinde 6 ayda toplam satış ~4 katına çıkmış) maskeliyordu — eski/yeni ay farkı
  // gözetmeden eşit ağırlıklandırıyordu. Artık her ürünün aktif olduğu ayların litresi,
  // GÜNCELE YAKINLIĞA göre ağırlıklandırılmış ortalamayla birleştiriliyor (bkz.
  // stokGunAyAgirlikHaritasi/stokGunAgirlikliAylikOrtalama) — hem "az ay" hem "eski ay"
  // etkisi aynı anda düzeltilmiş oluyor.
  const ayAgirlik = stokGunAyAgirlikHaritasi(sonAylar);
  const urunEk = urunler.map(u=>{
    const aylikLitre = stokGunAylikOzet(u);
    const agirlikliOrtalama = stokGunAgirlikliAylikOrtalama(aylikLitre, ayAgirlik);
    const cv = stokGunDegiskenlikKatsayisi(aylikLitre);
    // Gerçek günlük satış verisinden (aylık ortalamadan türetilmiş yaklaşık cv YERİNE) doğrudan
    // ölçülmüş değişkenlik katsayısı — bkz. stokGunGercekGunlukIstatistik. Yeterli veri yoksa
    // (gercekGunlukCV.cv==null) aşağıda güvenlik stoğu hesabı aylık cv'ye geri düşer.
    // ÖNEMLİ DÜZELTME (farklı arşivleme takvimi): "sonAylar" iki kanalın (Sell Out + Modern
    // Kanal) arşivlenen aylarının BİRLEŞİMİdir — ama bir ürün sadece TEK bir kanaldan
    // satılıyorsa ve o kanal diğerinden daha az ay arşivlemişse, birleşik pencereyi kullanmak
    // veri toplanmamış ayları yanlışlıkla "0 satış günü" sayardı (gerçek hızı olduğundan çok
    // düşük gösterirdi). Bunun yerine, bu ürün için GERÇEKTEN veri toplanan aylar (u.kapsananAylar)
    // kullanılır.
    const gercekGunlukIstatistik = stokGunGercekGunlukIstatistik(u.gunler, u.kapsananAylar);
    // ÖNEMLİ DÜZELTME 3 (ölü ürün): "yeni ürün"ün tam tersi — son 1-2 ayda hiç satmayan ama
    // geçmişte satmış ürünler artık hedef dağıtımından (pay) TAMAMEN çıkarılır; eski
    // hacimleriyle sipariş hedefi üretmek yanlış olur. Yine de tabloda eski (organik)
    // hızlarıyla referans amaçlı gösterilmeye devam ederler (bkz. aşağıdaki olcekOrani dalı).
    // Aynı düzeltme burada da geçerli: "son 2 ay" birleşik sonAylar üzerinden değil, bu
    // ürünün GERÇEKTEN veri toplanan aylarının (kapsananAylar) son 2'si üzerinden bakılmalı —
    // aksi halde farklı arşivleme takvimine sahip bir kanaldan gelen aktif bir ürün, diğer
    // kanalın arşivlediği ama bu ürünün hiç var olmadığı sonraki aylar yüzünden yanlışlıkla
    // "ölü ürün" damgalanıp hedef dağıtımından haksız yere çıkarılabilirdi.
    const oluUrun = stokGunOluUrunMu(aylikLitre, u.kapsananAylar);
    // ============================================================================
    // KANAL BAZLI PAY DÜZELTMESİ (kritik): Bir ürünün "payı" artık BİRLEŞİK toplam üzerinden
    // değil, HER KANALIN KENDİ HAVUZU İÇİNDE ayrı ayrı hesaplanır. Örnek: bir ürün SADECE
    // Modern Kanal'dan satılıyorsa, payı SADECE Modern Kanal'ın toplam ağırlıklı ortalaması
    // içindeki payı olmalı ve SADECE Modern Kanal'ın (kullanıcının girdiği) hedefine
    // uygulanmalı — Sell Out'un (varsa çok daha büyük) hedefine göre hesaplanıp yapay
    // derecede büyük bir "Gerekli Litre" üretmemeli. Bu yüzden her kanal için ayrı
    // agirlikliOrtalama hesaplanır; toplamAgirlikliOrtalama da AŞAĞIDA her kanal için AYRI
    // toplanır (bkz. toplamAgirlikliOrtalamaSellOut / toplamAgirlikliOrtalamaModernKanal).
    const aylikLitreSellOut = stokGunAylikOzet(u.kanal.sellOut);
    const aylikLitreModernKanal = stokGunAylikOzet(u.kanal.modernKanal);
    const agirlikliOrtalamaSellOut = stokGunAgirlikliAylikOrtalama(aylikLitreSellOut, ayAgirlik);
    const agirlikliOrtalamaModernKanal = stokGunAgirlikliAylikOrtalama(aylikLitreModernKanal, ayAgirlik);
    return Object.assign({}, u, {aylikLitre, agirlikliOrtalama, cv, gunlukCV: gercekGunlukIstatistik.cv, oluUrun, agirlikliOrtalamaSellOut, agirlikliOrtalamaModernKanal});
  });
  // Ürünün BİRLEŞİK (iki kanal toplamı) ağırlıklı ortalaması ve bunun toplamı — sadece
  // tabloda gösterilen "Satış Payı" bilgilendirme kolonu için kullanılır; "Gerekli Litre"
  // hesabı bunu KULLANMAZ, o kanal bazlı ayrı toplamları (aşağıdaki SellOut/ModernKanal
  // olanları) kullanır.
  const toplamAgirlikliOrtalama = urunEk.reduce((a,u)=> a + (u.oluUrun ? 0 : u.agirlikliOrtalama), 0);
  // Her kanalın kendi toplam ağırlıklı ortalaması — pay hesabının paydası, KANAL BAZINDA ayrı.
  const toplamAgirlikliOrtalamaSellOut = urunEk.reduce((a,u)=> a + (u.oluUrun ? 0 : u.agirlikliOrtalamaSellOut), 0);
  const toplamAgirlikliOrtalamaModernKanal = urunEk.reduce((a,u)=> a + (u.oluUrun ? 0 : u.agirlikliOrtalamaModernKanal), 0);
  const markaSekilleri = stokGunMarkaHaftaSekilleri(urunler);

  const guncelRapor = state.sellOutReport ? applySellOutHedef(state.sellOutReport, state.sellOutHedef) : null;
  // ÖNEMLİ DÜZELTME: Önceden sellOutKanalOzeti'nin acikKalan/kapaliKalan alanları üzerinden
  // (toplamLitre + kalan) formülüyle hedefi türetiyorduk — ama hedef hiç girilmemişse
  // (acikHedef=kapaliHedef=0), Math.max(0, 0-satış) sıfıra düştüğü için formül "hedef =
  // mevcut satış" gibi yanlış bir sonuç veriyordu. Artık hedef doğrudan temsilcilerin
  // acikHedef/kapaliHedef alanlarının toplamından okunuyor — hedef gerçekten girilmemişse
  // 0 kalır ve rapor "hedef girilmemiş" boş durumunu gösterir, mevcut satışı hedef sanmaz.
  // NOT: sellOutHedefKendi ve modernKanalHedefKendi AYRI AYRI tutulur — "Gerekli Litre" artık
  // her kanalın kendi payı × kendi hedefi olarak hesaplanır (bkz. rows bloğu); ustYonetimHedefi
  // (ikisinin toplamı) yalnızca genel bilgi amaçlı (raporun üst şeridinde) kullanılır.
  const sellOutHedefKendi = guncelRapor && Array.isArray(guncelRapor.temsilciler)
    ? guncelRapor.temsilciler.reduce((a,t)=> a + (t.acikHedef||0) + (t.kapaliHedef||0), 0)
    : 0;
  const modernKanalHedefKendi = state.modernKanalHedef||0;
  const ustYonetimHedefi = sellOutHedefKendi + modernKanalHedefKendi;

  // Bu ayın GÜNCEL/CANLI Sell Out (+ Modern Kanal) verisinden, ürün (Malzeme/Ürün Kodu)
  // bazlı bu ay şimdiye kadar satılan litre çıkarılır — "Gerekli Litre" artık hedefin TAMAMI
  // Bu ayın GÜNCEL/CANLI verisinden, ürün (Malzeme/Ürün Kodu) bazlı bu ay şimdiye kadar
  // satılan litre KANAL BAZINDA AYRI çıkarılır — "Gerekli Litre" artık her kanalın kendi
  // hedefinin TAMAMI değil, o kanaldaki bu ana kadar satılan kısım düşüldükten sonra KALAN
  // hedef üzerinden hesaplanır (ör. Modern Kanal hedefinin %70'i zaten satıldıysa, kalan
  // %30'a göre günlük hız/stok günü belirlenir). Aynı ürün her iki kanaldan da satılıyorsa,
  // her kanalın kendi "bu ay satılan"ı kendi kalan hedefinden düşülür, sonra ikisi toplanır.
  // ÖNEMLİ: guncelRapor/state.modernKanalReport buradaki "malzemeler" HAM (bölünmemiş) ürün
  // koduyla gelir (stokGunUrunVerileriniTopla'nın arşiv okurken yaptığı Ana Ürün/Parçalı Ürün
  // birleştirmesi burada henüz uygulanmamıştır). Aşağıda bu haritalar da AYNI kurala göre HEDEF
  // KODA yönlendirilerek toplanır — aksi halde, ör. Bira grubunda bu ay parçalı koddan satış
  // olduğunda, kalan hedef hesaplaması (u.kod artık ana kod olduğu için) bu satışı hiç
  // bulamaz ve "bu ay satılan" olduğundan düşük çıkardı (kalan hedef/gerekli litre de buna
  // bağlı olarak yanlış hesaplanırdı). Litre birim çevirme GEREKMEZ (litre zaten fiziksel
  // birim), sadece hangi kod altında toplandığı değişir.
  const buAySatilanSellOutMap = new Map();
  if(guncelRapor && Array.isArray(guncelRapor.malzemeler)){
    guncelRapor.malzemeler.forEach(u=>{
      const marka = kodMarkaHaritasi.get(u.kod) || sellOutMarkaGrubu(u.marka || u.urunAdi || u.kod);
      const hedefKod = stokGunHedefKodBul(u.kod, marka);
      const toplam = (u.gunler||[]).reduce((a,g)=>a+(g.litre||0), 0);
      buAySatilanSellOutMap.set(hedefKod, (buAySatilanSellOutMap.get(hedefKod)||0) + toplam);
    });
  }
  const buAySatilanModernKanalMap = new Map();
  if(state.modernKanalReport && Array.isArray(state.modernKanalReport.malzemeler)){
    state.modernKanalReport.malzemeler.forEach(u=>{
      const marka = kodMarkaHaritasi.get(u.kod) || sellOutMarkaGrubu(u.marka || u.urunAdi || u.kod);
      const hedefKod = stokGunHedefKodBul(u.kod, marka);
      const toplam = (u.gunler||[]).reduce((a,g)=>a+(g.litre||0), 0);
      buAySatilanModernKanalMap.set(hedefKod, (buAySatilanModernKanalMap.get(hedefKod)||0) + toplam);
    });
  }
  // KRİTİK DÜZELTME (kalan hedefin YANLIŞ hesaplanması — kullanıcı tarafından tespit edildi):
  // Önceden "kalan hedef" ÜRÜN BAZINDA şöyle hesaplanıyordu:
  //   kalanModernKanal = max(0, ÜRÜNÜN_TAHMİNİ_PAYI - ÜRÜNÜN_BU_AY_SATIŞI)
  // Bu YANLIŞ: "tahmini pay" (ör. 100.000 L hedefin %0,7'si = 700 L), ayın SONUNA kadar
  // beklenen bir TAHMİN'dir, ürünün "hakkı" veya "kotası" değildir. Bir ürün bu tahminin
  // ÜZERİNDE satarsa (ör. ilk 10 günde 700 değil 1.000 L satmışsa), bu "hedefini doldurdu,
  // artık satmayacak" anlamına GELMEZ — tam tersine güçlü talebi gösterir. Eski formülle
  // kalanModernKanal = max(0, 700-1.000) = 0 çıkıyordu — yani hızlı satan ürünün kalan ay
  // için beklenen satışı (ve dolayısıyla Hedef Gereken Sipariş'i) YANLIŞLIKLA sıfıra
  // düşürülüyordu, halbuki payı hâlâ %0,7 ise kalan hedefin %0,7'si kadar satmaya devam
  // etmesi beklenir.
  //
  // DOĞRU YÖNTEM: Önce KANAL TOPLAMINDA (tüm ürünler birlikte) kalan hedef bir kez bulunur:
  //   kalanKanalHedefiToplam = max(0, KANAL_HEDEFİ - KANALIN_TÜM_ÜRÜNLERİNİN_BU_AY_TOPLAM_SATIŞI)
  // Sonra bu kalan, HER ÜRÜNE KENDİ PAYINA GÖRE yeniden dağıtılır:
  //   kalanModernKanal (ürün) = kalanKanalHedefiToplam × ürününPayı
  // Böylece kullanıcının verdiği örnekteki gibi (100.000 L hedef, 40.000 L kalan, %0,7 pay
  // → kalan pay 280 L) doğru sonuç üretilir; hızlı satan ürünler cezalandırılmaz, yavaş
  // satan ürünler de yapay olarak şişirilmez — pay her zaman KALAN toplam hedefe uygulanır.
  const buAySatilanSellOutToplam = Array.from(buAySatilanSellOutMap.values()).reduce((a,b)=>a+b, 0);
  const buAySatilanModernKanalToplam = Array.from(buAySatilanModernKanalMap.values()).reduce((a,b)=>a+b, 0);
  const kalanSellOutKanalToplam = Math.max(0, sellOutHedefKendi - buAySatilanSellOutToplam);
  const kalanModernKanalKanalToplam = Math.max(0, modernKanalHedefKendi - buAySatilanModernKanalToplam);

  // Ürün kodu -> bu ayı en çok satan temsilciler (litre payına göre) — ürün×temsilci risk
  // detayının ham girdisi, sadece BU AYIN canlı Sell Out verisinden (guncelRapor) gelir.
  // Burada da AYNI Ana Ürün/Parçalı Ürün birleştirme kuralı uygulanır — aksi halde parçalı/ana
  // kod farkı yüzünden bu ürünün temsilci-payı listesi, birleştirilmiş satırla (u.kod artık
  // hedef kod) hiç eşleşmez ve ürün×temsilci risk detayı o ürün için boş görünürdü.
  const malzemeTemsilciPayMap = new Map();
  if(guncelRapor && Array.isArray(guncelRapor.malzemeler)){
    guncelRapor.malzemeler.forEach(u=>{
      const marka = kodMarkaHaritasi.get(u.kod) || sellOutMarkaGrubu(u.marka || u.urunAdi || u.kod);
      const hedefKod = stokGunHedefKodBul(u.kod, marka);
      const mevcut = malzemeTemsilciPayMap.get(hedefKod) || [];
      malzemeTemsilciPayMap.set(hedefKod, mevcut.concat(u.temsilciPay||[]));
    });
  }

  const bugunHaftaIndex = stokGunBugununDilimIndex();
  const haftaEtiketleri = ['1-7','8-14','15-21','22-ay sonu'];

  const rows = urunEk.map(u=>{
    // "Satış Payı" (tabloda gösterilen, bilgilendirme amaçlı) — ürünün BİRLEŞİK (iki kanal
    // toplamı) ağırlıklı ortalamasının, BİRLEŞİK toplam içindeki payı. Bu değer sadece
    // görüntüleme amaçlıdır; "Gerekli Litre" hesabı bunu KULLANMAZ (aşağıya bakınız).
    const pay = (!u.oluUrun && toplamAgirlikliOrtalama>0) ? (u.agirlikliOrtalama / toplamAgirlikliOrtalama) : 0;

    // ============================================================================
    // KANAL BAZLI GEREKLİ LİTRE (kritik düzeltme): Her kanalın kendi payı SADECE o kanalın
    // kendi hedefine uygulanır, sonra ikisi TOPLANIR. Böylece sadece Modern Kanal'dan satılan
    // bir ürünün Gerekli Litre'si, girilen Modern Kanal hedefini ASLA aşamaz (matematiksel
    // garanti: Σ tüm ürünlerin Modern Kanal payı = 1, dolayısıyla Σ Modern Kanal Gerekli
    // Litre'leri = Modern Kanal hedefi). Aynı şekilde sadece Sell Out'tan satılan bir ürün de
    // sadece Sell Out'un hedefine göre pay alır. Ortak (her iki kanaldan da satılan) ürünlerde
    // iki katkı toplanır.
    const paySellOut = (!u.oluUrun && toplamAgirlikliOrtalamaSellOut>0) ? (u.agirlikliOrtalamaSellOut / toplamAgirlikliOrtalamaSellOut) : 0;
    const payModernKanal = (!u.oluUrun && toplamAgirlikliOrtalamaModernKanal>0) ? (u.agirlikliOrtalamaModernKanal / toplamAgirlikliOrtalamaModernKanal) : 0;
    const gerekliLitreSellOutToplam = (!u.oluUrun && sellOutHedefKendi>0) ? sellOutHedefKendi * paySellOut : 0;
    const gerekliLitreModernKanalToplam = (!u.oluUrun && modernKanalHedefKendi>0) ? modernKanalHedefKendi * payModernKanal : 0;
    const toplamGerekliLitre = (!u.oluUrun && (sellOutHedefKendi>0 || modernKanalHedefKendi>0))
      ? (gerekliLitreSellOutToplam + gerekliLitreModernKanalToplam)
      : null;
    // ÖNEMLİ DÜZELTME: Malzemeler dosyasındaki "Tahditsiz Kullanılabilir" değeri MİKTAR
    // (koli/adet) cinsindendir, litre değil — bu yüzden doğrudan gunlukHiz'e (litre/gün)
    // bölmek birim uyuşmazlığı yüzünden anlamsız bir sonuç veriyordu (ör. 1116 miktar / 268
    // litre-gün). Anlık stok önce litreMiktarOrani ile litreye çevrilip (1116 × 12 = 13.392 L),
    // ancak öyle günlük litre hızına bölünüyor. Bu blok, "Hedef Gereken Sipariş" hesabının
    // (aşağıda) depo stoğunu düşebilmesi için ARTIK BURAYA (gerekliLitre'den ÖNCEYE) taşındı.
    const litreMiktarOraniOnHesap = u.toplamMiktar6Ay>0 ? (u.toplamLitre6Ay/u.toplamMiktar6Ay) : null;
    const anlikStokMiktar = malzemelerStokBirlesik.get(u.kod);
    const anlikStokLitre = (anlikStokMiktar!=null && litreMiktarOraniOnHesap>0) ? (anlikStokMiktar*litreMiktarOraniOnHesap) : null;
    const anlikStok = anlikStokMiktar;
    // KRİTİK DÜZELTME (kullanıcı tarafından tespit edilen mantık hatası): "Kalan hedef" artık
    // ürünün KENDİ tahmini payından KENDİ satışının çıkarılmasıyla DEĞİL — önce KANAL
    // TOPLAMINDA bir kez hesaplanan kalan hedefin (kalanSellOutKanalToplam/kalanModernKanalKanalToplam,
    // yukarıda tanımlı), ürünün payına göre YENİDEN DAĞITILMASIYLA bulunur. Eskiden bir ürün
    // kendi tahmini payından (ör. 700 L) daha FAZLA satarsa (ör. 1.000 L), "kalan hedefi" max(0,
    // 700-1.000)=0 çıkıyordu — güçlü satan bir ürünün sipariş ihtiyacı YANLIŞLIKLA sıfırlanıyordu.
    // Artık kalan hedef, payın KALAN toplam hedefe uygulanmasıyla bulunuyor — ürün beklenenden
    // hızlı satsa bile payı %0,7 ise kalan ayın kalan hedefinin %0,7'si kadar satmaya devam
    // etmesi beklenir (bkz. kullanıcının 100.000L→40.000L kalan, %0,7 pay → 280L örneği).
    const buAySatilanSellOut = buAySatilanSellOutMap.get(u.kod) || 0;
    const buAySatilanModernKanal = buAySatilanModernKanalMap.get(u.kod) || 0;
    const kalanSellOut = kalanSellOutKanalToplam * paySellOut;
    const kalanModernKanal = kalanModernKanalKanalToplam * payModernKanal;
    // KULLANICI KARARI: "Hedef Gereken Sipariş" artık mevcut Depo Stoğu (anlikStokLitre) DÜŞÜLEREK
    // hesaplanır — zaten elde olan stok kadar daha az sipariş verilmesi gerektiği için. Depo
    // stoğu, iki kanalın kalan hedefinden ORANLARINA göre (kalanSellOut/kalanModernKanal'ın
    // toplam içindeki payı kadar) düşülür — böylece stok, hangi kanaldan daha çok satılıyorsa o
    // kanalın kalan hedefinden daha fazla düşer (mantıksal olarak tutarlı bir dağıtım).
    const kalanToplamStoksuz = kalanSellOut + kalanModernKanal;
    const depoStokDususu = anlikStokLitre!=null ? Math.min(anlikStokLitre, kalanToplamStoksuz) : 0;
    const depoStokDususSellOut = (depoStokDususu>0 && kalanToplamStoksuz>0) ? depoStokDususu * (kalanSellOut/kalanToplamStoksuz) : 0;
    const depoStokDususModernKanal = depoStokDususu - depoStokDususSellOut;
    const kalanSellOutStoksuz = Math.max(0, kalanSellOut - depoStokDususSellOut);
    const kalanModernKanalStoksuz = Math.max(0, kalanModernKanal - depoStokDususModernKanal);
    const gerekliLitre = toplamGerekliLitre!=null ? (kalanSellOutStoksuz + kalanModernKanalStoksuz) : null;
    // Litre/Miktar oranı (bir "miktar" biriminin kaç litreye denk geldiği) — Sell Out
    // verisindeki aynı satırlarda hem Litre hem Miktar birlikte geldiği için, 6 aylık
    // toplamlardan çıkarılan bu oran ürüne özgü sabit bir çevrim katsayısı olarak kullanılır.
    const litreMiktarOrani = litreMiktarOraniOnHesap;
    const gerekliMiktar = (gerekliLitre!=null && litreMiktarOrani>0) ? (gerekliLitre/litreMiktarOrani) : null;

    // Bu urunun 6 aylik toplaminin, 4 hafta dilimine gore yuzdesel dagilimi. Bugun hangi
    // dilimdeysek onu ayri gostermek yerine, ARTIK T\u00dcM 4 haftanin kendi gunluk hizi
    // ayri ayri hesaplaniyor - cunku stok tukenene kadar gecen sure genelde birden fazla
    // haftaya yayiliyor (or. bugun 3. haftanin son 2 gunundeyse, stok o 2 gunden sonra
    // 4. haftaya gecip FARKLI bir hizla tukenmeye devam ediyor).
    // Az geçmişli/yeni ürünlerde (aktifAySayisi<3) kendi haftalık deseni tek başına
    // gürültülü olabileceğinden, markanın genel deseniyle harmanlanmış hali kullanılır
    // (bkz. stokGunOwnVeMarkaShapeKarisimi) — 3+ aylık geçmişi olan ürünlerde bu, kendi
    // gerçek deseniyle pratikte aynı sonucu verir (kendiAgirlik=1).
    const haftaDagilimi = stokGunOwnVeMarkaShapeKarisimi(u, markaSekilleri);
    // ============================================================================
    // KANAL BAZLI HAFTALIK ÖLÇEKLEME (kritik düzeltme): haftaDagilimi.litre, ürünün BİRLEŞİK
    // (iki kanal karışık) geçmiş deseninin ŞEKLİNİ (hangi hafta ne kadar yoğun) veriyor — bu
    // şekli birleşik olarak kullanmak makul (iki kanalın mevsimsel deseni genelde benzerdir).
    // AMA önceden bu şekle TEK bir "olcekOrani" (kalan hedef toplamı / geçmiş toplam) uygulanıyordu
    // — bu, ortak ürünlerde (hem Sell Out hem Modern Kanal'dan satılan) YANLIŞ sonuç verirdi:
    // örneğin Modern Kanal hedefi geçmişin 4 katına çıkarken Sell Out hedefi geçmişin sadece
    // %40'ına düşmüşse, "birleşik ortalama" oran (ör. 0.73) HİÇBİR kanalın gerçek değişimini
    // yansıtmaz. Artık haftalık şekil (oran olarak) her kanalın KENDİ kalan hedefine ayrı ayrı
    // uygulanıyor, sonra iki kanalın o haftaki litresi TOPLANIYOR — böylece her kanal kendi
    // gerçek büyüme/küçülme oranıyla ölçeklenmiş oluyor.
    const haftaSekilOrani = u.toplamLitre6Ay>0 ? haftaDagilimi.litre.map(v=>v/u.toplamLitre6Ay) : [0.25,0.25,0.25,0.25];
    const haftaGunlukHizlari = haftaSekilOrani.map((oran, i)=>{
      if(u.oluUrun){
        // ÖLÜ ÜRÜN istisnası: hedefe dahil olmadığı için (gerekliLitre=null) kanal bazlı kalan
        // hedeflerden pay almaz — bunun yerine ürünün KENDİ eski (organik, birleşik) haftalık
        // hızı gösterilir. Böylece stok günü "artık pratikte tükenmiyor" gibi yapay bir değer
        // değil, "eski hızıyla devam etseydi kaç günde biterdi" gibi anlamlı bir referans olur.
        return haftaDagilimi.litre[i]/7;
      }
      const haftaLitreSellOut = oran*kalanSellOut;
      const haftaLitreModernKanal = oran*kalanModernKanal;
      const hedefTemelliHiz = (haftaLitreSellOut + haftaLitreModernKanal)/7;
      // KRİTİK DÜZELTME (denetim bulgusu #6 — kullanıcı onayıyla düzeltildi): "kalan hedef"
      // (kalanSellOut/kalanModernKanal) o kanal için hedef hiç girilmemişse VEYA bu ayki satış
      // zaten ürünün payına düşen hedefi karşılamış/aşmışsa sıfıra düşer — bu durumda hedef
      // temelli hız da 0 çıkıp STOK GÜNÜ simülasyonunun bu ürünü "artık satılmıyormuş" gibi
      // ele almasına, dolayısıyla gerçekte hızlı satan/riskli bir üründe bile yanıltıcı bir
      // "~400 gün stok var" güveni vermesine yol açıyordu (ürün gerçekte satılmaya devam
      // ediyor, sadece hedef "kotası" dolmuş sayılıyor). "Kalan Hedef"/"Gerekli Litre" (sipariş
      // ihtiyacı) BURADAN ETKİLENMEZ, hâlâ doğru şekilde hedef karşılandıysa 0 kalır — sadece
      // STOK GÜNÜ hesabında kullanılan tüketim hızı için, hedef temelli hız 0 (veya negatif)
      // çıktığında, ölü ürün istisnasıyla birebir aynı, zaten kanıtlanmış formülle ürünün
      // GERÇEK geçmiş haftalık hızına geri dönülür.
      return hedefTemelliHiz > 0 ? hedefTemelliHiz : haftaDagilimi.litre[i]/7;
    });
    const gunlukHiz = haftaGunlukHizlari[bugunHaftaIndex] || 0; // tabloda "bugünün hızı" olarak gösterilmeye devam eder
    const gunlukMiktar = litreMiktarOrani>0 ? (gunlukHiz/litreMiktarOrani) : null;
    // anlikStokMiktar/anlikStokLitre/anlikStok artık YUKARIDA (gerekliLitre hesabından önce)
    // tanımlanıyor — bkz. o bloktaki not (kullanıcı kararı: Hedef Gereken Sipariş depo stoğunu
    // düşsün diye taşındı). Burada tekrar tanımlanmıyor, aynı isimlerle yukarıdan kullanılıyor.
    // STOK GÜNÜ artık tek bir sabit hıza bölünmüyor — bugünden başlayarak GÜN GÜN
    // düşürülüyor, her gün kendi haftasının hızıyla tüketiliyor (bkz. stokGunSimulasyonuYap).
    // Böylece stok günü 7'yi aşıp başka bir haftaya taştığında, o sonraki haftanın
    // (muhtemelen farklı) hızına doğru şekilde geçiş yapılmış olur.
    const stokGunu = anlikStokLitre!=null ? stokGunSimulasyonuYap(anlikStokLitre, haftaGunlukHizlari) : null;
    // İSTATİSTİKSEL GÜVENLİK STOĞU: SS = Z × σ_D × √LT (bkz. dosya başındaki sabit tanımları).
    // σ_D artık MÜMKÜN OLDUĞUNDA gerçek gün-gün satış verisinden ölçülüyor (u.gunlukCV, bkz.
    // stokGunGercekGunlukIstatistik) — aylık toplamlardan türetilen yaklaşık cv SADECE yeterli
    // günlük veri yoksa (yeni ürün, kısa geçmiş) yedek olarak kullanılır. Ölçülen CV, güncel
    // (bugünkü) günlük hıza uygulanarak bugünün ölçeğinde bir σ_D elde edilir — böylece hem
    // "gerçek oynaklık" hem "güncel satış temposu" birlikte yansıtılmış olur.
    const kullanilanCV = u.gunlukCV!=null ? u.gunlukCV : u.cv;
    const gunlukCVKaynagi = u.gunlukCV!=null ? 'gerçek günlük veriden ölçüldü' : 'yeterli günlük veri yok, aylık yaklaşık değer kullanıldı';
    const gunlukHizOrtalamasi = haftaGunlukHizlari.reduce((a,b)=>a+b,0)/4;
    const sigmaD = gunlukHizOrtalamasi * kullanilanCV;
    const guvenlikStoguLitre = STOK_GUN_SERVIS_SEVIYESI_Z * sigmaD * Math.sqrt(STOK_GUN_VARSAYILAN_LEAD_TIME_GUN);
    const stokGunuGuvenlikli = anlikStokLitre!=null
      ? stokGunSimulasyonuYap(anlikStokLitre, haftaGunlukHizlari, null, guvenlikStoguLitre)
      : null;

    // ÜRÜN×TEMSİLCİ RİSK DETAYI: bu ürünü bu ay en çok satan temsilciler + (varsa) tahsilat
    // karnesi gerçekleşme yüzdeleri. state.karneTemsilciMap artık "Temsilci Karnesi" sekmesi
    // ziyaret edilmeden de doludur — renderStokGunView, computeStokGunRaporu'yu çağırmadan
    // ÖNCE bu haritayı bağımsız olarak (Sell Out raporu üzerinden) doldurur (bkz.
    // renderStokGunView). Sell Out raporu hiç yoksa (henüz veri yüklenmemişse) harita boş
    // kalır ve tahsilatGerceklesme null döner, arayüzde "tahsilat verisi yok" gösterilir.
    // NOT: t.pay burada YENİDEN hesaplanmıyor — buildSellOutRaporu'da top-5'e kesilmeden ÖNCE,
    // ürünün TÜM temsilcileri üzerinden hesaplanmış gerçek pay kullanılıyor (bkz. temsilciPay
    // tanımı). Sadece burada top-5'ten en çok satan ilk 3'ü gösteriyoruz.
    const temsilciPay = malzemeTemsilciPayMap.get(u.kod) || [];
    const temsilciRiskDetayi = temsilciPay.slice(0,3).map(t=>({
      temsilci: t.ad,
      pay: t.pay,
      tahsilatGerceklesme: karneTemsilciGerceklesmeBul(t.ad),
    }));

    return {
      kod: u.kod, urunAdi: u.urunAdi, marka: u.marka, pay: pay*100, gerekliLitre, gerekliMiktar,
      paySellOut: paySellOut*100, payModernKanal: payModernKanal*100,
      yogunHaftaEtiket: haftaEtiketleri[bugunHaftaIndex] + ' (bugünün dilimi)',
      gunlukHiz, gunlukMiktar, anlikStok, stokGunu, stokGunuGuvenlikli, guvenlikStoguLitre, gunlukCVKaynagi, cv: u.cv,
      aktifAySayisi: u.aktifAySayisi, ilkSatisAy: u.ilkSatisAy, yeniUrun: u.yeniUrun, veriGuveni: u.veriGuveni,
      oluUrun: u.oluUrun, temsilciRiskDetayi,
    };
  }).sort((a,b)=>{
    if(a.stokGunu==null && b.stokGunu==null) return b.pay-a.pay;
    if(a.stokGunu==null) return 1;
    if(b.stokGunu==null) return -1;
    return a.stokGunu-b.stokGunu;
  });

  // KANAL BAZLI DAĞITILAMAYAN HEDEF UYARISI: Bir kanal için hedef girilmiş (>0) olsa bile, o
  // kanaldan son 6 ayda HİÇ satış verisi yoksa (toplamAgirlikliOrtalama...=0), pay hesabı her
  // üründe 0 döner ve hedef hiçbir ürüne dağıtılamaz — kullanıcı hedefi girer ama "Gerekli
  // Litre" hiç değişmez, nedeni belirsiz kalır. Bu durumu burada tespit edip UI'da açıkça
  // uyarı olarak göstermek için işaretliyoruz.
  const sellOutHedefDagitilamadi = sellOutHedefKendi>0 && toplamAgirlikliOrtalamaSellOut<=0;
  const modernKanalHedefDagitilamadi = modernKanalHedefKendi>0 && toplamAgirlikliOrtalamaModernKanal<=0;

  return {yok:false, sonAylar, rows, ustYonetimHedefi, toplamLitre6Ay, sellOutHedefDagitilamadi, modernKanalHedefDagitilamadi};
}

function stokGunRenkSeviyesi(stokGunu){
  if(stokGunu==null) return {renk:'var(--ink-faint)', bg:'var(--line-soft)'};
  if(stokGunu < 7) return {renk:'var(--danger)', bg:'var(--danger-soft)'};
  if(stokGunu < 14) return {renk:'var(--warn)', bg:'var(--warn-soft)'};
  return {renk:'var(--success)', bg:'var(--success-soft)'};
}

async function renderStokGunView(){
  const bosPanel = document.getElementById('stokGunBosPanel');
  const bosMesaj = document.getElementById('stokGunBosMesaj');
  const icerik = document.getElementById('stokGunIcerik');

  // "Kim satıyor?" detayındaki tahsilat gerçekleşme yüzdesi (state.karneTemsilciMap) eskiden
  // SADECE kullanıcı "Temsilci Karnesi" sekmesini en az bir kez ziyaret ettiğinde doluyordu —
  // aksi halde kartlarda hep "tahsilat verisi yok" görünüyordu. Artık Stok Gün paneli bu veriye
  // BAĞIMSIZ olarak kendi ihtiyacı için ulaşır: harita boşsa ve hesaplamak için gereken ana rapor
  // (state.report — Fatura/Kalemler/Tahsilat verisi, computeTemsilciKarnesi'nin gerçekte
  // beklediği kaynak; Sell Out raporu DEĞİL) mevcutsa, kart listesi çizilmeden önce burada bir
  // kere hesaplanıp doldurulur.
  if((!state.karneTemsilciMap || !state.karneTemsilciMap.size) && state.report){
    try{
      const karne = await computeTemsilciKarnesi(state.report, false);
      if(karne && !karne.yok && karne.rows){
        state.karneTemsilciMap = new Map(karne.rows.map(r=>[r.temsilci, r]));
      }
    }catch(err){
      console.error('Stok Gün: temsilci karnesi bağımsız hesaplanırken hata:', err);
    }
  }

  const veri = computeStokGunRaporu();

  if(veri.yok){
    icerik.style.display = 'none';
    bosPanel.style.display = 'block';
    const bosBaslik = document.getElementById('stokGunBosBaslik');
    const eylemBtn = document.getElementById('stokGunBosEylemBtn');
    // Yol gösteren boş durum: eksik olan ADIM'a göre başlık/mesaj/eylem değişir.
    if(!veri.sonAylar || !veri.sonAylar.length){
      bosBaslik.textContent = 'Önce en az bir ay arşivlenmeli';
      bosMesaj.textContent = 'Stok Gün hesabı, arşivlenmiş aylık satış hızına dayanır. Geleneksel Kanal sekmesinde "Bu Ayı Arşivle" ile başlayın — arşivlenen her ay burada 6 aya kadar birikir.';
      eylemBtn.style.display = 'inline-flex';
      eylemBtn.innerHTML = '<i class="fa-solid fa-box-archive" aria-hidden="true" style="margin-right:7px;"></i>Geleneksel Kanal\'a git';
      eylemBtn.onclick = ()=> setActiveView('sellOut');
    } else if(!state.malzemelerStok || !state.malzemelerStok.size){
      bosBaslik.textContent = 'Bir adım kaldı: Malzemeler dosyası';
      bosMesaj.textContent = 'Sell Out arşivi hazır (' + veri.sonAylar.length + ' ay) ✓ — yalnızca Malzemeler (anlık depo stoğu) dosyası eksik. Yükleyince rapor otomatik hesaplanır.';
      eylemBtn.style.display = 'inline-flex';
      eylemBtn.innerHTML = '<i class="fa-solid fa-file-arrow-up" aria-hidden="true" style="margin-right:7px;"></i>Malzemeler dosyasını seç';
      eylemBtn.onclick = ()=>{ const inp = document.getElementById('stokGunKendiDosyaInput'); if(inp) inp.click(); };
    } else {
      bosBaslik.textContent = 'Litre bilgisi bulunamadı';
      bosMesaj.textContent = 'Arşivlenmiş Sell Out verisinde ürün bazlı litre bilgisi bulunamadı — arşivlenen ayların ürün detayı içerdiğinden emin olun.';
      eylemBtn.style.display = 'none';
      eylemBtn.onclick = null;
    }
    return;
  }

  bosPanel.style.display = 'none';
  icerik.style.display = 'block';
  const hedefUyarisi = veri.ustYonetimHedefi>0
    ? ''
    : ' — ⚠️ Bu ay için henüz hiçbir temsilciye Açık/Kapalı Kanal hedefi girilmemiş; "Gerekli Litre" hesaplanamıyor, günlük hız geçmiş gerçek satışa göre (hedefsiz) gösteriliyor.';
  // Hedef girilmiş ama o kanaldan hiç geçmiş satış verisi yoksa, pay hesaplanamadığı için hedef
  // hiçbir ürüne dağıtılamıyor — kullanıcı bunu fark edemeyebileceğinden ayrıca uyarıyoruz.
  const kanalDagitimUyarilari = [];
  if(veri.sellOutHedefDagitilamadi) kanalDagitimUyarilari.push('Geleneksel Kanal (Sell Out)');
  if(veri.modernKanalHedefDagitilamadi) kanalDagitimUyarilari.push('Modern Kanal');
  const kanalUyarisi = kanalDagitimUyarilari.length
    ? ' — ⚠️ ' + kanalDagitimUyarilari.join(' ve ') + ' için hedef girilmiş ancak son 6 ayda bu kanal(lar)dan hiç satış verisi yok; bu hedef(ler) hiçbir ürüne dağıtılamadı ve "Gerekli Litre" hesabına yansımadı.'
    : '';
  document.getElementById('stokGunAsOf').textContent = 'Veri kaynağı: Sell Out arşivi (' + veri.sonAylar.length + ' ay: ' + veri.sonAylar.map(ayEtiketi).join(', ') + ') + Malzemeler (anlık stok) — Üst yönetim hedefi: ' + Math.round(veri.ustYonetimHedefi).toLocaleString('tr-TR') + ' L' + hedefUyarisi + kanalUyarisi;

  // Arama kutusu (ürün adı veya kodu, büyük/küçük harf duyarsız — Türkçe İ/ı ayrımı için
  // toLocaleLowerCase('tr-TR') kullanılıyor, sistemin geri kalanındaki arama kutularıyla tutarlı).
  state.stokGunTumRows = veri.rows;

  // Mal Grubu (marka) filtre dropdown'ını mevcut ürün listesindeki benzersiz markalarla
  // doldur — seçili değeri (varsa) korur, listeyi tekrar oluşturunca sıfırlamaz.
  const markaSel = document.getElementById('stokGunMarkaFilter');
  if(markaSel){
    const oncekiSecim = markaSel.value;
    const markalar = Array.from(new Set(veri.rows.map(r=>r.marka).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'tr'));
    markaSel.innerHTML = '<option value="">Tüm mal grupları</option>' + markalar.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    if(oncekiSecim && markalar.includes(oncekiSecim)) markaSel.value = oncekiSecim;
  }

  stokGunKritikUyariGuncelle(veri.rows);
  stokGunSekmeSayilariniGuncelle(veri.rows);
  stokGunTabloyuFiltreleyipCiz();
}

// KRİTİK EŞİK BİLDİRİMİ: stok günü eşiğin altına düşen (ve hedefe dahil, yani ölü olmayan)
// ürünleri sidebar/tab menüsündeki rozetlerde ve panel üstündeki banner'da gösterir. Gerçek
// push bildirimi (sekme kapalıyken de ulaşan) sunucu taraflı altyapı gerektirir; burada panel
// açıkken görünen bir uyarı + tarayıcı izni varsa Notification API kullanılır.
const STOK_GUN_KRITIK_ESIK_GUN = 7; // stokGunRenkSeviyesi'ndeki kırmızı (danger) eşiğiyle aynı
// (Not: eskiden burada bildirim tekrarını önlemek için bir "son bildirim anahtarı" tutuluyordu;
// Notification API kaldırıldığı için o değişkene artık gerek yok.)
function stokGunKritikUyariGuncelle(rows){
  const kritikler = (rows||[]).filter(r => r.stokGunu!=null && r.stokGunu <= STOK_GUN_KRITIK_ESIK_GUN && !r.oluUrun)
    .sort((a,b)=>a.stokGunu-b.stokGunu);

  ['sbbtn-stokGun','tabbtn-stokGun'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(kritikler.length) el.setAttribute('data-badge', kritikler.length>99?'99+':kritikler.length);
    else el.removeAttribute('data-badge');
  });

  const banner = document.getElementById('stokGunKritikBanner');
  if(banner){
    if(!kritikler.length){
      banner.innerHTML = '';
    } else {
      const ilkUc = kritikler.slice(0,3).map(r=>`${escapeHtml(r.urunAdi)} (${Math.round(r.stokGunu)} gün)`).join(', ');
      const kalanMetin = kritikler.length>3 ? ` ve ${kritikler.length-3} ürün daha` : '';
      banner.innerHTML = `<div class="alert-banner" id="stokGunKritikBannerIc" style="margin-bottom:16px;">
        <div class="alert-banner-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
        <div class="alert-banner-text"><strong>${kritikler.length} ürün kritik stok seviyesinde</strong> (${STOK_GUN_KRITIK_ESIK_GUN} günden az) — ${ilkUc}${kalanMetin}.</div>
        <div class="alert-banner-cta" id="stokGunKritikGorBtn">Kritik Sekmesini Aç</div>
      </div>`;
      document.getElementById('stokGunKritikGorBtn')?.addEventListener('click', ()=> stokGunSekmeDegistir('kritik'));
    }
  }

  // Not: Kritik stok listesi değiştiğinde tarayıcı bildirimi (Notification API) gösterme
  // özelliği kaldırıldı — panel üstündeki banner ve sekme rozetleri yeterli uyarıyı veriyor.
}

// Sekme başlıklarındaki sayıları (Tümü/Kritik/Yeni/Ölü) güncelle.
function stokGunSekmeSayilariniGuncelle(rows){
  const kritikSayi = (rows||[]).filter(r=>r.stokGunu!=null && r.stokGunu<=STOK_GUN_KRITIK_ESIK_GUN && !r.oluUrun).length;
  const yeniSayi = (rows||[]).filter(r=>r.yeniUrun).length;
  const oluSayi = (rows||[]).filter(r=>r.oluUrun).length;
  const setTxt = (id, etiket, sayi)=>{ const el=document.getElementById(id); if(el) el.innerHTML = `${etiket} <span class="sekme-count">${sayi}</span>`; };
  setTxt('stokGunSekmeTumu', 'Tümü', (rows||[]).length);
  setTxt('stokGunSekmeKritik', `Kritik (<${STOK_GUN_KRITIK_ESIK_GUN} gün)`, kritikSayi);
  setTxt('stokGunSekmeYeni', 'Yeni Ürünler', yeniSayi);
  setTxt('stokGunSekmeOlu', 'Ölü Ürünler', oluSayi);
}

function stokGunSekmeDegistir(sekme){
  state.stokGunSekme = sekme;
  document.querySelectorAll('.stokgun-sekme-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.sekme===sekme);
  });
  stokGunTabloyuFiltreleyipCiz();
}

function stokGunTabloyuFiltreleyipCiz(){
  const rows = state.stokGunTumRows || [];
  const q = (document.getElementById('stokGunSearchInput')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const markaFiltre = document.getElementById('stokGunMarkaFilter')?.value || '';
  const sekme = state.stokGunSekme || 'tumu';
  let filtreli = rows.filter(r=>{
    if(q && !(String(r.urunAdi).toLocaleLowerCase('tr-TR').includes(q) || String(r.kod).toLocaleLowerCase('tr-TR').includes(q))) return false;
    if(markaFiltre && r.marka !== markaFiltre) return false;
    if(sekme==='kritik' && !(r.stokGunu!=null && r.stokGunu<=STOK_GUN_KRITIK_ESIK_GUN && !r.oluUrun)) return false;
    if(sekme==='yeni' && !r.yeniUrun) return false;
    if(sekme==='olu' && !r.oluUrun) return false;
    return true;
  });

  const {key, dir} = state.stokGunSort;
  filtreli = filtreli.slice().sort((a,b)=>{
    const av = a[key], bv = b[key];
    // null/undefined değerler (hesaplanamayan satırlar) sıralama yönünden bağımsız
    // olarak HER ZAMAN en sonda kalır — aksi halde "büyükten küçüğe" sıralamada
    // en üste çıkıp anlamsız görünürlerdi.
    if(av==null && bv==null) return 0;
    if(av==null) return 1;
    if(bv==null) return -1;
    if(typeof av==='string') return dir * String(av).localeCompare(String(bv), 'tr');
    return dir * (av - bv);
  });

  // Kart rengi (kırmızı/sarı/yeşil kenarlık ve stok-gün rozeti) stokGunRenkSeviyesi'nden gelen
  // aynı eşiklere göre belirlenir — sadece tablo hücresi yerine artık kartın kendisine uygulanır.
  function stokGunSeviyeSinifi(stokGunu){
    if(stokGunu==null) return '';
    if(stokGunu < 7) return 'stokgun-crit';
    if(stokGunu < 14) return 'stokgun-warn';
    return 'stokgun-ok';
  }

  // Hedef kutusundaki "ayın X. günü hızıyla hesaplandı" notu için yogunHaftaEtiket'i
  // ("1-7 (bugünün dilimi)" gibi) okunabilir kısa metne çevirir. Sayısal aralıklarda
  // ("1-7", "8-14"...) sonuna "günü" eklenir; "22-ay sonu" gibi sayısal olmayan son
  // dilimde "günü" eklenmez, çünkü "22-ay sonu. günü" anlamsız olurdu.
  function stokGunHizDilimMetni(yogunHaftaEtiket){
    const temiz = String(yogunHaftaEtiket||'').replace(' (bugünün dilimi)','').trim();
    return /^\d+-\d+$/.test(temiz) ? (temiz + '. günü') : temiz;
  }

  document.getElementById('stokGunKartListe').innerHTML = filtreli.map(r=>{
    const renk = stokGunRenkSeviyesi(r.stokGunu);
    const seviyeSinifi = stokGunSeviyeSinifi(r.stokGunu);
    // Yeni ürün rozeti + veri güveni ipucu: pencere içinde sonradan satışa başlayan ürünler
    // "Yeni" etiketiyle, az geçmişli (Düşük/Orta güven) ürünler ise gri bir güven notuyla
    // işaretlenir — kullanıcı bu kartlardaki rakamların daha az veriye dayandığını görür.
    const yeniRozet = r.yeniUrun ? ' <span title="Bu ürün son 6 aylık pencerede sonradan satışa başladı (ilk satış: '+escapeHtml(ayEtiketi(r.ilkSatisAy)||'')+')" style="display:inline-block;padding:1px 7px;border-radius:100px;font-size:9.5px;font-weight:700;color:var(--accent-deep);background:var(--accent-soft);">YENİ</span>' : '';
    // Ölü ürün rozeti: son 1-2 ayda hiç satışı olmayan ama geçmişte satmış ürünler — bu
    // kartlarda "Gerekli Litre" bilinçli olarak boş (—) kalır, çünkü artık hedefe dahil
    // edilmiyor; Stok Gün ise eski (organik) hızıyla referans amaçlı gösterilmeye devam eder.
    const oluRozet = r.oluUrun ? ' <span title="Son 1-2 ayda satışı yok — hedeften çıkarıldı, Stok Gün eski hızıyla referans amaçlı gösteriliyor" style="display:inline-block;padding:1px 7px;border-radius:100px;font-size:9.5px;font-weight:700;color:#fff;background:var(--danger);">ÖLÜ ÜRÜN</span>' : '';
    const guvenRenk = r.veriGuveni==='Düşük' ? 'var(--danger)' : (r.veriGuveni==='Orta' ? 'var(--warn)' : 'var(--ink-faint)');
    // Güvenlik stoğu ipucu: Z×σ×√LT formülüyle hesaplanan tampon (bkz. computeStokGunRaporu).
    // stokGunuGuvenlikli artık "stok ne zaman biter" değil, "stok ne zaman güvenlik stoğu
    // eşiğinin (guvenlikStoguLitre) altına iner" sorusuna cevap verir — yeniden sipariş noktası.
    const guvenlikIpucu = (r.guvenlikStoguLitre!=null && r.stokGunuGuvenlikli!=null)
      ? `%95 servis seviyesi hedefiyle güvenlik stoğu: ${Math.round(r.guvenlikStoguLitre).toLocaleString('tr-TR')} L (${STOK_GUN_VARSAYILAN_LEAD_TIME_GUN} günlük ortalama tedarik süresine göre, değişkenlik ${r.gunlukCVKaynagi}). Stok bu seviyenin altına ${Math.round(r.stokGunuGuvenlikli)} gün sonra iner — yeniden sipariş bu tarihten önce verilmeli.`
      : 'Güvenlik stoğu hesaplanamadı';
    // Ürün×temsilci risk detayı: bu ürünü en çok satan temsilciler + tahsilat gerçekleşmesi
    // (bkz. computeStokGunRaporu / state.karneTemsilciMap). Kartta varsa küçük bir genişletme
    // linki gösterilir; tıklanınca detay alanı açılır/kapanır (bkz. delegated click listener).
    const riskVarMi = r.temsilciRiskDetayi && r.temsilciRiskDetayi.length>0;
    const acikMi = state.stokGunAcikRiskSatirlar.has(r.kod);
    const riskToggle = riskVarMi
      ? `<button type="button" class="stokgun-risk-toggle" data-risk-kod="${escapeHtml(r.kod)}" title="Bu ürünü en çok satan temsilciler ve tahsilat performansları"><i class="fa-solid fa-chevron-${acikMi?'up':'down'}" aria-hidden="true"></i> Kim satıyor?</button>`
      : `<div class="stokgun-risk-toggle-bosluk"></div>`;
    const riskDetay = (riskVarMi && acikMi) ? (function(){
      const chips = r.temsilciRiskDetayi.map(t=>{
        const tahsilatSinifi = t.tahsilatGerceklesme==null ? 'tahsilat-yok' : (t.tahsilatGerceklesme<70 ? 'tahsilat-dusuk' : 'tahsilat-iyi');
        const tahsilatMetin = t.tahsilatGerceklesme==null ? 'tahsilat verisi yok' : `tahsilat %${Math.round(t.tahsilatGerceklesme)}`;
        return `<span class="stokgun-risk-chip"><b>${escapeHtml(t.temsilci)}</b> <span class="pay">%${t.pay.toFixed(0)} pay</span> · <span class="${tahsilatSinifi}">${tahsilatMetin}</span></span>`;
      }).join('');
      return `<div class="stokgun-risk-detay">
        <div style="font-size:10px;color:var(--ink-faint);font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">Bu ayki satışa göre en çok satan temsilciler</div>
        ${chips}
      </div>`;
    })() : '';

    return `<div class="urun-card ${seviyeSinifi}">
      <div class="urun-card-top">
        <div class="urun-id">
          <div class="urun-kod">${escapeHtml(r.kod)}</div>
          <div class="urun-ad" title="${escapeHtml(r.urunAdi)}">${escapeHtml(r.urunAdi)}</div>
          <div class="urun-rozet-satir">${yeniRozet}${oluRozet}</div>
          ${riskToggle}
        </div>
        <div class="stokgun-badge" style="color:${renk.renk};background:${renk.bg};" title="${escapeHtml(guvenlikIpucu)}">
          <span class="n">${r.stokGunu!=null ? Math.round(r.stokGunu) : '—'}</span>
          <span class="l">GÜN</span>
        </div>
      </div>
      <div class="urun-stat-grid">
        <div class="urun-stat-chip"><div class="l">DEPO STOK</div><div class="v">${r.anlikStok!=null ? r.anlikStok.toLocaleString('tr-TR') : '—'}</div></div>
        <div class="urun-stat-chip urun-stat-chip-split" title="Geleneksel Kanal payı %${r.paySellOut.toFixed(1).replace('.',',')} · Modern Kanal payı %${r.payModernKanal.toFixed(1).replace('.',',')}">
          <div class="l">SATIŞ PAYI</div>
          <div class="urun-stat-chip-split-row">
            <div class="urun-stat-chip-split-item gel"><span class="k">Gel.</span><span class="v">%${r.paySellOut.toFixed(1).replace('.',',')}</span></div>
            <div class="urun-stat-chip-split-divider"></div>
            <div class="urun-stat-chip-split-item mod"><span class="k">Mod.</span><span class="v">%${r.payModernKanal.toFixed(1).replace('.',',')}</span></div>
          </div>
        </div>
        <div class="urun-stat-chip" title="Veri güveni: ${escapeHtml(r.veriGuveni)}"><div class="l">AKTİF AY</div><div class="v" style="color:${guvenRenk};">${r.aktifAySayisi} ay</div></div>
      </div>
      <div class="urun-stat-grid urun-stat-grid-2">
        <div class="urun-stat-chip"><div class="l">GÜNLÜK MİKTAR</div><div class="v">${r.gunlukMiktar!=null ? r.gunlukMiktar.toLocaleString('tr-TR',{maximumFractionDigits:1}) + '/gün' : '—'}</div></div>
        <div class="urun-stat-chip"><div class="l">GÜNLÜK LİTRE</div><div class="v">${LT(r.gunlukHiz)}/gün</div></div>
      </div>
      <div class="urun-hedef-row">
        <div class="urun-hedef-baslik"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Hedef gereken sipariş</div>
        <div class="urun-hedef-degerler">
          <div class="urun-hedef-item"><div class="l">MİKTAR</div><div class="v">${r.gerekliMiktar!=null ? r.gerekliMiktar.toLocaleString('tr-TR',{maximumFractionDigits:0}) : '—'}</div></div>
          <div class="urun-hedef-item"><div class="l">LİTRE</div><div class="v">${r.gerekliLitre!=null ? LT(r.gerekliLitre).replace(/\s*Lt\.?$/,'') : '—'} <span class="birim">Lt.</span></div></div>
        </div>
        <div class="urun-hedef-hiz-notu"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Stok günü, ayın <b>${escapeHtml(stokGunHizDilimMetni(r.yogunHaftaEtiket))}</b> hızıyla hesaplandı</div>
      </div>
      ${riskDetay}
    </div>`;
  }).join('') || `<div class="empty-state" style="grid-column:1/-1;">${q ? 'Aramanızla eşleşen ürün bulunamadı.' : 'Ürün bulunamadı.'}</div>`;
}

async function renderSellOutView(){
  const bosPanel = document.getElementById('sellOutBosPanel');
  const icerik = document.getElementById('sellOutIcerik');
  populateSellOutAySelect();
  const seciliAy = state.sellOutSeciliAy;
  const baseRapor = state.sellOutReport;
  ktlog('renderSellOutView (GELENEKSEL ekran) → kaynak state.sellOutReport. toplamLitre=', baseRapor&&baseRapor.toplamLitre, 'belgeSayisi=', baseRapor&&baseRapor.belgeSayisi, 'seçiliAy=', seciliAy||'(canlı)');

  let report, isArsivGoruntuleme;
  if(seciliAy){
    report = state.sellOutArsivCache[seciliAy] || null;
    isArsivGoruntuleme = true;
    if(!report){
      bosPanel.style.display='block';
      icerik.style.display='none';
      document.getElementById('sellOutAsOf').textContent = fmtDate(new Date(seciliAy+'-01'))+' ayına ait arşiv verisi bulunamadı.';
      return;
    }
    const arsivHedefleri = {};
    (report.temsilciler||[]).forEach(t=>{ arsivHedefleri[t.key] = {acik:t.acikHedef||0, kapali:t.kapaliHedef||0}; });
    report = applySellOutHedef(sellOutRaporuGuncelSeflereBagla(report), arsivHedefleri);
  }else{
    isArsivGoruntuleme = false;
    let canliRapor = baseRapor;
    // HATA 1 KORUMASI: Canlı görünümde bellekteki rapor boşsa (ör. başka bir işlem sonrası ya da
    // sayfa yenilenmesinin ardından belleğe henüz yüklenmemişse), boş panel göstermeden ÖNCE
    // diskten/buluttan bir kez tazelemeyi dene — böylece daha önce yüklenmiş güncel Sell Out
    // verisi "kayboldu" gibi görünüp litre 0'a düşmez.
    if(!canliRapor){
      ktlog('renderSellOutView: bellekte sellOutReport YOK → diskten/buluttan tazeleme deneniyor…');
      try{ if(typeof sellOutYenile==='function'){ await sellOutYenile(); canliRapor = state.sellOutReport; } }catch(e){ ktlog('sellOutYenile hata:', e && e.message); }
      ktlog('renderSellOutView tazeleme sonrası:', canliRapor ? ('bulundu, toplamLitre='+canliRapor.toplamLitre) : 'hâlâ boş');
    }
    if(!canliRapor){
      bosPanel.style.display='block';
      icerik.style.display='none';
      document.getElementById('sellOutAsOf').textContent = 'Veri kaynağı: Geleneksel Kanal (SAPUI5 dışa aktarımı) — henüz yüklenmedi';
      return;
    }
    report = applySellOutHedef(sellOutRaporuGuncelSeflereBagla(canliRapor), state.sellOutHedef);
  }
  bosPanel.style.display='none';
  icerik.style.display='block';

  const durumNotu = report.durumVarMi ? '' : " · Müşteri Master'da Durum kolonu bulunamadı, tüm noktalar aktif kabul edildi";
  if(isArsivGoruntuleme){
    document.getElementById('sellOutAsOf').textContent = '<i class="fa-solid fa-box" aria-hidden="true"></i> Arşiv: '+fmtDate(new Date(seciliAy+'-01'))+' ayının ('+fmtDate(new Date(report.arsivZamani))+' tarihinde arşivlenmiş) verisi gösteriliyor · '+report.belgeSayisi.toLocaleString('tr-TR')+' satış belgesi'+durumNotu;
  }else{
    document.getElementById('sellOutAsOf').textContent = 'Veri kaynağı: SAPUI5 dışa aktarımı · '+report.belgeSayisi.toLocaleString('tr-TR')+' satış belgesi · '+fmtDate(new Date())+' itibarıyla'+durumNotu;
  }

  const alertEl = document.getElementById('sellOutAlertBanner');
  if(report.blokajAdet>0){
    const oran = report.toplamNet>0 ? (report.blokajTutar/report.toplamNet*100) : 0;
    alertEl.innerHTML = `<div class="alert-banner">
      <div class="alert-banner-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <div class="alert-banner-text"><strong>${report.blokajAdet.toLocaleString('tr-TR')} kalem faturalama blokajlı</strong>— ${TL(report.blokajTutar)} tutarında muhasebeleşmeyi bekliyor, toplam cironun %${oran.toFixed(1).replace('.',',')}'i.</div>
    </div>`;
  }else{
    alertEl.innerHTML = '';
  }

  const kanalOzeti = sellOutKanalOzeti(report);
  const {toplamAcikLitre: toplamAcikLitreGenel, toplamKapaliLitre: toplamKapaliLitreGenel, acikKalan: acikKalanGenel, kapaliKalan: kapaliKalanGenel, gerceklesmeOrani: genelGerceklesmeOraniHero} = kanalOzeti;

  const items = [
    {label:'Gerçekleşme Oranı', icon:'<i class="fa-solid fa-bullseye" aria-hidden="true"></i>', value:null, display: genelGerceklesmeOraniHero!=null?fmtYuzde(genelGerceklesmeOraniHero):'—', sub: `<span style="display:flex;flex-direction:column;align-items:flex-end;gap:1px;"><span style="font-size:9.5px;font-weight:700;letter-spacing:.04em;opacity:.8;">Toplam Litre</span><span style="font-family:var(--font-figures);font-size:19px;font-weight:800;line-height:1.15;">${Math.round(report.toplamLitre).toLocaleString('tr-TR')} L</span></span>`},
    {label:'Toplam Açık Kanal LT', icon:'<i class="fa-solid fa-box" aria-hidden="true"></i>', cls:'neutral', value:null, display: LT(toplamAcikLitreGenel)},
    {label:'Toplam Kapalı Kanal LT', icon:'<i class="fa-solid fa-box" aria-hidden="true"></i>', cls:'accent', value:null, display: LT(toplamKapaliLitreGenel)},
    {label:'Açık Kanal Kalan Litre', icon:'<i class="fa-solid fa-store" aria-hidden="true"></i>', cls:'warn', value:null, display: LT(acikKalanGenel)},
    {label:'Kapalı Kanal Kalan Litre', icon:'<i class="fa-solid fa-users" aria-hidden="true"></i>', cls:'warn', value:null, display: LT(kapaliKalanGenel)},
  ];
  renderKpiHeroRow(items, 'sellOutKpiGrid');


  document.getElementById('sellOutSsmCount').textContent = report.ssmSayisi+' Saha Satış Müdürü';
  const ssmCardsHtml = report.ssmler.map(s=>`
    <div class="ssm-karne-card" style="border-left:4px solid ${sellOutRenk(s.genelFkns)};">
      <div class="ssm-karne-top">
        <div class="cust-avatar">${escapeHtml(avatarBaslangic(s.ssm))}</div>
        <div>
          <div class="ssm-karne-name">${escapeHtml(s.ssm)} <span class="badge ssm-hiyerarsi-badge"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> SSM</span></div>
          <div class="ssm-karne-sub">${s.temsilciSayisi.toLocaleString('tr-TR')} temsilci</div>
        </div>
        <div class="ssm-fkns-ring-wrap">
          ${fknsRingSvg(s.genelFkns)}
          <div class="ssm-fkns-ring-label">FKNS</div>
        </div>
      </div>
      ${ssmKanalRowHtml('Açık Kanal', s.acikLitre, s.acikHedef, 'fa-lock-open')}
      ${ssmKanalRowHtml('Kapalı Kanal', s.kapaliLitre, s.kapaliHedef, 'fa-lock')}
      <div class="ssm-karne-foot">
        <span class="g-lbl">Hedef Gerçekleşme</span>
        <span class="g-val" style="color:${sellOutRenk(s.hedefGerceklesme)};">${s.hedefGerceklesme!=null?fmtYuzde(s.hedefGerceklesme):'—'}</span>
      </div>
    </div>`).join('');

  document.getElementById('sellOutSsmGrid').innerHTML = report.ssmler.length ? ssmCardsHtml : '<div class="empty-state" style="grid-column:1/-1;">Kayıt yok</div>';

  state.sellOutTemsilciMap = new Map(report.temsilciler.map(x=>[x.key, x]));
  document.getElementById('sellOutKarneGrid').innerHTML = report.temsilciler.map((r,i)=>{
    const gercRenk = sellOutRenk(r.hedefGerceklesme);
    const fknsRenk = sellOutRenk(r.fknsOrani);
    return `
    <div class="cust-card sellout-card" data-temsilci-key="${escapeHtml(r.key)}" style="border-left:4px solid ${fknsRenk};">
      <div class="ssm-karne-top">
        <div class="cust-avatar">${escapeHtml(avatarBaslangic(r.temsilci))}</div>
        <div class="cust-info">
          <div class="musteri-name">${escapeHtml(r.temsilci)} <span class="badge" style="background:${sellOutRenkSoft(r.fknsOrani)};color:${fknsRenk};">#${i+1}</span></div>
          <span class="temsilci-tag" style="margin-top:5px;display:inline-block;">${escapeHtml(r.ssm)}</span>
        </div>
      </div>
      ${fknsRingUcluSvg(r.fknsAcikOrani, r.fknsKapaliOrani, r.fknsOrani)}
      ${ssmKanalRowHtml('Açık Kanal', r.acikLitre, r.acikHedef, 'fa-lock-open')}
      ${ssmKanalRowHtml('Kapalı Kanal', r.kapaliLitre, r.kapaliHedef, 'fa-lock')}
      <div class="ssm-karne-foot">
        <span class="g-lbl">Hedef Gerçekleşme</span>
        <span class="g-val" style="color:${gercRenk};">${r.hedefGerceklesme!=null?fmtYuzde(r.hedefGerceklesme):'—'}</span>
      </div>

      ${isArsivGoruntuleme ? '' : `<div class="hedef-edit-row">
        <div class="hedef-field"><label>Açık Hedef (L)</label><input type="number" min="0" step="100" class="sellout-hedef-input" data-temsilci-key="${escapeHtml(r.key)}" data-kanal="acik" value="${r.acikHedef||0}"></div>
        <div class="hedef-field"><label>Kapalı Hedef (L)</label><input type="number" min="0" step="100" class="sellout-hedef-input" data-temsilci-key="${escapeHtml(r.key)}" data-kanal="kapali" value="${r.kapaliHedef||0}"></div>
        <button type="button" class="hedef-kaydet-btn" data-temsilci-key="${escapeHtml(r.key)}" data-temsilci-ad="${escapeHtml(r.temsilci)}"><i class="fa-solid fa-lock" aria-hidden="true"></i> Kaydet</button>
      </div>`}

      <div class="fatura-kesilmeyen-kanal-satirlar" style="margin-top:11px;padding-top:11px;border-top:1px dashed var(--line);">
        <div class="htk-alt htk-alt-fkns">
          <span class="htk-ceksenet fatura-kesilmeyen-lbl"><span class="ssm-kanal-icon" style="background:var(--line-soft);color:var(--danger);"><i class="fa-solid fa-lock-open" aria-hidden="true"></i></span>Fatura kesilmeyen Açık Kanal nokta: <b style="color:var(--ink);">${r.faturaKesilmeyenNoktaAcik}</b></span>
          <div class="htk-alt-actions">
            <button type="button" class="nokta-detay-btn primary fatura-kesilmeyen-detay-btn" data-temsilci-key="${escapeHtml(r.key)}" data-kanal="acik">Detay ↗</button>
          </div>
        </div>
        <div class="htk-alt htk-alt-fkns" style="margin-top:9px;">
          <span class="htk-ceksenet fatura-kesilmeyen-lbl"><span class="ssm-kanal-icon" style="background:var(--line-soft);color:var(--danger);"><i class="fa-solid fa-lock" aria-hidden="true"></i></span>Fatura kesilmeyen Kapalı Kanal nokta: <b style="color:var(--ink);">${r.faturaKesilmeyenNoktaKapali}</b></span>
          <div class="htk-alt-actions">
            <button type="button" class="nokta-detay-btn primary fatura-kesilmeyen-detay-btn" data-temsilci-key="${escapeHtml(r.key)}" data-kanal="kapali">Detay ↗</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state" style="grid-column:1/-1;">Kayıt yok</div>';

  document.querySelectorAll('.sellout-hedef-input, .hedef-kaydet-btn').forEach(el=>{
    el.addEventListener('click', e=>e.stopPropagation());
  });

  document.querySelectorAll('.hedef-kaydet-btn').forEach(btn=>{
    btn.addEventListener('click', sellOutHedefKaydetHandler);
  });
}

async function sellOutHedefKaydetHandler(e){
  const btn = e.currentTarget;
  const key = btn.getAttribute('data-temsilci-key');
  const ad = btn.getAttribute('data-temsilci-ad');
  const card = btn.closest('.cust-card');
  const acikInput = card.querySelector('.sellout-hedef-input[data-kanal="acik"]');
  const kapaliInput = card.querySelector('.sellout-hedef-input[data-kanal="kapali"]');
  const acik = Number(acikInput.value)||0;
  const kapali = Number(kapaliInput.value)||0;

  if(!(await ortakSifreDogrula('Litre hedefini değiştirmek için şifreyi girin:'))) return;
  btn.disabled = true;
  const eskiText = btn.textContent;
  btn.textContent = '⏳ Kaydediliyor…';
  try{
    const yeni = Object.assign({}, state.sellOutHedef);
    yeni[key] = {ad, acik, kapali};
    await sellOutHedefKaydet(yeni);
    await renderSellOutView();
  }catch(err){
    console.error('Hedef kaydedilemedi:', err);
    alert('Hedef kaydedilirken bir hata oluştu: '+err.message);
    btn.textContent = eskiText;
    btn.disabled = false;
  }
}

document.getElementById('sellOutArsivleBtn').addEventListener('click', sellOutArsivleButonu);
document.getElementById('sellOutAySelect').addEventListener('change', (e)=>{
  state.sellOutSeciliAy = e.target.value || null;
  renderSellOutView();
});

// "Bu Ayın Arşivini Temizle": cari ay (bugünün ayı) için — bilerek "Bu Ayı Arşivle"ye hiç
// basılmamış olsa bile — bir arşiv kaydı varsa (örn. başka bir cihazdan/oturumdan bulut
// üzerinden gelmiş olabilir) bu kaydı siler. Güncel (canlı) Sell Out verisi ETKİLENMEZ; yalnızca
// cari ayın arşiv anlık görüntüsü kaldırılır. Geçmiş ayların (bilerek arşivlenmiş) kayıtlarına
// kasıtlı olarak dokunulmaz — bu yüzden ay her zaman "bugün"e göre hesaplanır, dropdown'daki
// seçime göre DEĞİL (kullanıcı yanlışlıkla geçmiş bir ayı silmesin diye).
document.getElementById('sellOutBuAyArsivTemizleBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('sellOutBuAyArsivTemizleBtn');
  const ayKey = dateKeyLocal(turkiyeBugun()).slice(0,7);
  const ayEtiket = fmtDate(new Date(ayKey+'-01'));
  if(!Object.prototype.hasOwnProperty.call(state.sellOutArsivCache||{}, ayKey)){
    toastGoster('warn', 'Arşiv kaydı yok', ayEtiket + ' ayı için zaten bir arşiv kaydı bulunmuyor.');
    return;
  }
  if(!confirm(ayEtiket + ' ayına ait Sell Out arşiv kaydı silinecek. Güncel (canlı) veriniz ETKİLENMEZ, yalnızca bu arşiv anlık görüntüsü kaldırılır. Devam edilsin mi?')) return;
  if(!(await ortakSifreDogrula('Arşivi temizlemek için şifreyi girin:'))) return;
  btn.disabled = true;
  const oncekiHtml = btn.innerHTML;
  btn.innerHTML = 'Siliniyor…';
  try{
    await sellOutArsivAyiSil(ayKey);
    if(state.sellOutSeciliAy === ayKey) state.sellOutSeciliAy = null;
    await renderSellOutView();
    toastGoster('success', 'Arşiv kaydı silindi', ayEtiket + ' ayına ait arşiv anlık görüntüsü kaldırıldı.');
  }catch(err){
    alert('Silme sırasında bir hata oluştu: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.innerHTML = oncekiHtml;
  }
});

// Modern Kanal — Key Account Hedef kaydetme (şifre korumalı, Geleneksel Kanal ile aynı şifre).
document.getElementById('modernKanalHedefKaydetBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('modernKanalHedefKaydetBtn');
  const input = document.getElementById('modernKanalHedefInput');
  const deger = Number(input.value)||0;
  if(!(await ortakSifreDogrula('Key Account Hedefini değiştirmek için şifreyi girin:'))) return;
  btn.disabled = true;
  const eskiText = btn.textContent;
  btn.textContent = '⏳ Kaydediliyor…';
  try{
    await modernKanalHedefKaydet(deger);
    await renderModernKanalView();
  }catch(err){
    console.error('Modern Kanal hedefi kaydedilemedi:', err);
    alert('Hedef kaydedilirken bir hata oluştu: '+err.message);
  }finally{
    btn.disabled = false;
    btn.textContent = eskiText;
  }
});

document.getElementById('modernKanalAySelect')?.addEventListener('change', (e)=>{
  state.modernKanalSeciliAy = e.target.value || null;
  renderModernKanalView();
});

// Modern Kanal — "Bu Ayı Arşivle": İrsaliye dosyasındaki satırların çoğunluğu hangi aya
// aitse (İrsaliye Tarihi baz alınarak) arşiv o ayın altına yazılır — Geleneksel Kanal'daki
// sellOutBaskinAy ile aynı mantık, ama tarih kolonu farklı olduğu için ayrı bir tespit
// fonksiyonu (irsaliyeBaskinAy) kullanılır.
function irsaliyeBaskinAy(rows){
  const ayCounts = new Map();
  (rows||[]).forEach(r=>{
    const tarih = excelDateToJSArti1Gun(r['İrsaliye Tarihi']);
    if(!tarih) return;
    const ayKey = dateKeyLocal(tarih).slice(0,7);
    ayCounts.set(ayKey, (ayCounts.get(ayKey)||0) + 1);
  });
  let baskinAy = null, maksSayi = 0;
  ayCounts.forEach((sayi, ay)=>{ if(sayi > maksSayi){ maksSayi = sayi; baskinAy = ay; } });
  return baskinAy;
}

document.getElementById('modernKanalArsivleBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('modernKanalArsivleBtn');
  const baseRapor = state.modernKanalReport;
  if(!baseRapor){
    toastGoster('warn', 'Arşivlenecek rapor yok', 'Önce İrsaliye dosyasını yükleyip "Verileri Güncelle"ye basın.');
    return;
  }
  const hamVeri = state.modernKanalKendiDosya && state.modernKanalKendiDosya.data;
  const ayKey = (hamVeri && irsaliyeBaskinAy(hamVeri)) || dateKeyLocal(turkiyeBugun()).slice(0,7);
  const ayEtiket = fmtDate(new Date(ayKey+'-01'));
  const zatenVar = Object.prototype.hasOwnProperty.call(state.modernKanalArsivCache||{}, ayKey);
  const soru = zatenVar
    ? (ayEtiket+' için arşiv zaten var (dosya içeriğine göre bu veri '+ayEtiket+' ayına ait). Üzerine yazılsın mı?')
    : ('Dosya içeriğine göre bu veri '+ayEtiket+' ayına ait görünüyor. GÜNCEL Modern Kanal verisi bu ayın altına kalıcı olarak arşivlensin mi?');
  if(!confirm(soru)) return;
  if(!(await ortakSifreDogrula('Bu ayı arşivlemek için şifreyi girin:'))) return;

  btn.disabled = true;
  const eskiText = btn.textContent;
  btn.textContent = '🗄️ Arşivleniyor…';
  try{
    const raporSnapshot = Object.assign({}, baseRapor, {
      hedefAnlikGoruntu: state.modernKanalHedef||0,
      arsivAyKey: ayKey,
      arsivZamani: new Date().toISOString(),
    });
    state.modernKanalArsivCache = Object.assign({}, state.modernKanalArsivCache, {[ayKey]: raporSnapshot});
    await saveModernKanalArsivToLocal(state.modernKanalArsivCache);
    const sonuc = await saveModernKanalArsivAyToCloud(ayKey, raporSnapshot);
    if(!sonuc.ok){
      // Cihaz depolama kapalı (kullanıcı isteği) — bulut yazması başarısız olursa bu arşiv kaydı
      // HİÇBİR YERDE kalıcı DEĞİLDİR, sayfa yenilenirse kaybolur.
      alert('UYARI: Arşiv buluta yazılamadı (' + (sonuc.reason||'bilinmeyen hata') + '). Cihaza da kaydedilmiyor (bu özellik kapalı) — sayfa yenilenirse bu arşiv kaydı kaybolur.');
    }
    populateModernKanalAySelect();
    document.getElementById('modernKanalAySelect').value = ayKey;
    state.modernKanalSeciliAy = ayKey;
    await renderModernKanalView();
  }catch(err){
    console.error('Modern Kanal arşivleme hatası:', err);
    alert('Arşivleme sırasında bir hata oluştu: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.textContent = eskiText;
  }
});

// Modern Kanal — "Tüm Ayları Toplu Arşivle": yüklenen İrsaliye dosyasındaki TÜM satırları
// İrsaliye Tarihi'ne göre kaç farklı aya ayrışıyorsa, hepsini TEK TEK kendi ayına arşivler —
// kullanıcı 6 ayı tek tek yükleyip arşivlemek zorunda kalmadan, 6 aylık tek bir dosyayı bir
// kerede tüm aylarına dağıtabilir.
document.getElementById('modernKanalTopluArsivleBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('modernKanalTopluArsivleBtn');
  const hamVeri = state.modernKanalKendiDosya && state.modernKanalKendiDosya.data;
  if(!hamVeri || !hamVeri.length){
    toastGoster('warn', 'Önce dosya gerekli', 'Toplu arşivlemek için bir İrsaliye dosyası yükleyip "Verileri Güncelle"ye basın.');
    return;
  }
  const gruplar = irsaliyeAylaraGoreGrupla(hamVeri);
  const aylar = Array.from(gruplar.keys()).sort();
  if(!aylar.length){
    toastGoster('warn', 'İrsaliye Tarihi bulunamadı', 'Dosyada geçerli bir İrsaliye Tarihi kolonu/verisi yok.');
    return;
  }
  const ayEtiketleri = aylar.map(a=>fmtDate(new Date(a+'-01'))).join(', ');
  if(!confirm('Dosyadaki veriler şu '+aylar.length+' aya ayrıştırılıp HEPSİ TEK TEK arşivlenecek: '+ayEtiketleri+'. Devam edilsin mi?')) return;
  if(!(await ortakSifreDogrula('Toplu arşivlemek için şifreyi girin:'))) return;

  btn.disabled = true;
  const eskiText = btn.textContent;
  btn.textContent = '🗄️ Toplu arşivleniyor…';
  try{
    const yeniCache = Object.assign({}, state.modernKanalArsivCache);
    for(const ayKey of aylar){
      const ayRows = gruplar.get(ayKey);
      const ayRapor = buildIrsaliyeReport(ayRows);
      const raporSnapshot = Object.assign({}, ayRapor, {
        hedefAnlikGoruntu: state.modernKanalHedef||0,
        arsivAyKey: ayKey,
        arsivZamani: new Date().toISOString(),
      });
      yeniCache[ayKey] = raporSnapshot;
      await saveModernKanalArsivAyToCloud(ayKey, raporSnapshot);
    }
    state.modernKanalArsivCache = yeniCache;
    await saveModernKanalArsivToLocal(state.modernKanalArsivCache);
    populateModernKanalAySelect();
    await renderModernKanalView();
    toastGoster('success', aylar.length + ' ay arşivlendi', ayEtiketleri);
  }catch(err){
    console.error('Modern Kanal toplu arşivleme hatası:', err);
    alert('Toplu arşivleme sırasında bir hata oluştu: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.textContent = eskiText;
  }
});

// "Bu Ayın Arşivini Temizle": cari ay (bugünün ayı) için — bilerek "Bu Ayı Arşivle"ye hiç
// basılmamış olsa bile — bir arşiv kaydı varsa (örn. başka bir cihazdan/oturumdan bulut
// üzerinden gelmiş olabilir) bu kaydı siler. Güncel (canlı) Modern Kanal verisi ETKİLENMEZ;
// yalnızca cari ayın arşiv anlık görüntüsü kaldırılır. Geçmiş ayların (bilerek arşivlenmiş)
// kayıtlarına kasıtlı olarak dokunulmaz — ay her zaman "bugün"e göre hesaplanır, dropdown'daki
// seçime göre DEĞİL (kullanıcı yanlışlıkla geçmiş bir ayı silmesin diye).
document.getElementById('modernKanalBuAyArsivTemizleBtn')?.addEventListener('click', async ()=>{
  const btn = document.getElementById('modernKanalBuAyArsivTemizleBtn');
  const ayKey = dateKeyLocal(turkiyeBugun()).slice(0,7);
  const ayEtiket = fmtDate(new Date(ayKey+'-01'));
  if(!Object.prototype.hasOwnProperty.call(state.modernKanalArsivCache||{}, ayKey)){
    toastGoster('warn', 'Arşiv kaydı yok', ayEtiket + ' ayı için zaten bir arşiv kaydı bulunmuyor.');
    return;
  }
  if(!confirm(ayEtiket + ' ayına ait Modern Kanal arşiv kaydı silinecek. Güncel (canlı) veriniz ETKİLENMEZ, yalnızca bu arşiv anlık görüntüsü kaldırılır. Devam edilsin mi?')) return;
  if(!(await ortakSifreDogrula('Arşivi temizlemek için şifreyi girin:'))) return;
  btn.disabled = true;
  const oncekiHtml = btn.innerHTML;
  btn.innerHTML = 'Siliniyor…';
  try{
    await modernKanalArsivAyiSil(ayKey);
    if(state.modernKanalSeciliAy === ayKey) state.modernKanalSeciliAy = null;
    await renderModernKanalView();
    toastGoster('success', 'Arşiv kaydı silindi', ayEtiket + ' ayına ait arşiv anlık görüntüsü kaldırıldı.');
  }catch(err){
    alert('Silme sırasında bir hata oluştu: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.innerHTML = oncekiHtml;
  }
});

// Sell Out Raporu'nun ana "Raporu Oluştur" akışından TAMAMEN bağımsız kendi yükleme alanı —
// kullanıcı diğer raporlar (Kalemler, Sipariş vb.) için dosya yüklemeden, yalnızca Sell Out
// verisini burada seçip "Verileri Güncelle"ye basarak hesaplatabilir. state.files.sellOut'a hiç
// dokunmaz; doğrudan kendi state.sellOutKendiDosya değişkenini kullanır.
(function(){
  const dosyaInput = document.getElementById('sellOutKendiDosyaInput');
  const dosyaAdiEl = document.getElementById('sellOutKendiDosyaAdi');
  const guncelleBtn = document.getElementById('sellOutKendiGuncelleBtn');
  const durumEl = document.getElementById('sellOutKendiDurum');
  if(!dosyaInput) return;

  dosyaInput.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    dosyaAdiEl.textContent = file.name;
    // YARIŞ DÜZELTMESİ: buton, dosya BAŞARIYLA OKUNDUKTAN sonra (reader.onload içinde) aktifleşir.
    // Önceden seçim anında aktifleşiyordu — yavaş/başarısız okumada kullanıcı, ekranda yeni dosya
    // adı yazarken bir ÖNCEKİ dosyanın verisiyle hesaplama başlatabiliyordu. Eski veri de temizlenir.
    guncelleBtn.disabled = true;
    state.sellOutKendiDosya = null;
    durumEl.textContent = 'Dosya okunuyor…';
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        if(!xlsxHazirMi()) throw new Error('Excel okuma bileşeni (xlsx) yüklenemedi — sayfayı yenileyin.');
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const {data} = sheetToObjects(ws);
        ktlog('GELENEKSEL input → state.sellOutKendiDosya. dosya="'+file.name+'" satır='+(data?data.length:0)+'. İlk satır kolonları:', data&&data[0]?Object.keys(data[0]).slice(0,6):'(boş)');
        state.sellOutKendiDosya = {data, ad:file.name};
        guncelleBtn.disabled = false;
        durumEl.textContent = '';
      }catch(err){
        console.error('Sell Out dosyası okunamadı:', err);
        durumEl.textContent = 'Dosya okunamadı: ' + err.message;
        guncelleBtn.disabled = true;
      }
    };
    reader.onerror = ()=>{
      // FileReader başarısız olabilir (ör. iOS'ta dosya sağlayıcının erişimi geri çekmesi) —
      // sessiz kalmak yerine kullanıcıya net durum bildirilir.
      durumEl.textContent = 'Dosya okunamadı — lütfen dosyayı yeniden seçin.';
      guncelleBtn.disabled = true;
    };
    reader.readAsArrayBuffer(file);
  });

  guncelleBtn.addEventListener('click', async ()=>{
    if(!state.sellOutKendiDosya){ durumEl.textContent = 'Önce bir dosya seçin.'; return; }
    guncelleBtn.disabled = true;
    const oncekiText = guncelleBtn.innerHTML;
    guncelleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hesaplanıyor…';
    durumEl.textContent = '';
    try{
      // Müşteri Master, temsilci/SSM eşlemesi için burada da (ana akıştan bağımsız olarak) tazelenir —
      // kullanıcı ana ekrana hiç gitmese bile FKNS ve temsilci isimleri doğru gelsin diye.
      await musteriMasterYenile();
      // SAVUNMACI KONTROL: Yanlışlıkla Modern Kanal (İrsaliye) dosyası bu alana seçildiyse, Sell Out
      // olarak işlenmesi anlamsız/karışık sonuç verir. Dosyanın gerçekten Sell Out olduğunu ayırt
      // edici kolonlarla doğrula; değilse net hata ver ve işlemeyi durdur (hata 2'nin önlenmesi).
      {
        const ilk = state.sellOutKendiDosya.data && state.sellOutKendiDosya.data[0];
        const kolonlar = ilk ? Object.keys(ilk) : [];
        const sellOutMu = kolonlar.includes('Müşteri Kanalı Tnm.') || kolonlar.includes('Açık/Otel Tnm.') || kolonlar.includes('Hacim Segmenti Tnm.');
        const irsaliyeMi = kolonlar.includes('İrsaliye Tarihi') && kolonlar.includes('Ürün Kodu');
        ktlog('GELENEKSEL doğrulama: sellOutMu=', sellOutMu, 'irsaliyeMi=', irsaliyeMi, 'kolonlar=', kolonlar.slice(0,8));
        if(irsaliyeMi && !sellOutMu){
          throw new Error('Bu dosya bir Modern Kanal (İrsaliye) dosyası gibi görünüyor — Geleneksel Kanal (Sell Out) alanına yüklendi. Lütfen Sell Out dosyasını bu alana, İrsaliye dosyasını Modern Kanal alanına yükleyin.');
        }
      }
      ktlog('GELENEKSEL "Verileri Güncelle" → buildSellOutReport çağrılıyor. Kaynak: state.sellOutKendiDosya ('+(state.sellOutKendiDosya&&state.sellOutKendiDosya.ad)+', '+(state.sellOutKendiDosya&&state.sellOutKendiDosya.data?state.sellOutKendiDosya.data.length:0)+' satır)');
      const baseRapor = buildSellOutReport(state.sellOutKendiDosya.data, state.musteriMasterMap, state.musteriMasterDurum, state.musteriMasterDetay, state.musteriMasterKanal);
      await sellOutKaydet(baseRapor);
      await renderSellOutView();
      durumEl.textContent = '✓ Güncellendi — ' + fmtDate(new Date());
    }catch(err){
      console.error('Sell Out raporu hesaplanamadı:', err);
      durumEl.textContent = 'Hata: ' + err.message;
    }finally{
      guncelleBtn.disabled = false;
      guncelleBtn.innerHTML = oncekiText;
    }
  });
})();

// Modern Kanal (İrsaliye Listesi) sekmesindeki bağımsız dosya yükleme alanı — Geleneksel
// Kanal ile aynı desende, ana yükleme akışından tamamen ayrı çalışır.
(function(){
  const dosyaInput = document.getElementById('modernKanalKendiDosyaInput');
  const dosyaAdiEl = document.getElementById('modernKanalKendiDosyaAdi');
  const guncelleBtn = document.getElementById('modernKanalKendiGuncelleBtn');
  const durumEl = document.getElementById('modernKanalKendiDurum');
  if(!dosyaInput) return;

  dosyaInput.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    dosyaAdiEl.textContent = file.name;
    // YARIŞ DÜZELTMESİ: buton, dosya BAŞARIYLA OKUNDUKTAN sonra (reader.onload içinde) aktifleşir.
    // Önceden seçim anında aktifleşiyordu — yavaş/başarısız okumada kullanıcı, ekranda yeni dosya
    // adı yazarken bir ÖNCEKİ dosyanın verisiyle hesaplama başlatabiliyordu. Eski veri de temizlenir.
    guncelleBtn.disabled = true;
    state.modernKanalKendiDosya = null;
    durumEl.textContent = 'Dosya okunuyor…';
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        if(!xlsxHazirMi()) throw new Error('Excel okuma bileşeni (xlsx) yüklenemedi — sayfayı yenileyin.');
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const {data} = sheetToObjects(ws);
        ktlog('MODERN input → state.modernKanalKendiDosya. dosya="'+file.name+'" satır='+(data?data.length:0)+'. İlk satır kolonları:', data&&data[0]?Object.keys(data[0]).slice(0,6):'(boş)');
        state.modernKanalKendiDosya = {data, ad:file.name};
        guncelleBtn.disabled = false;
        durumEl.textContent = '';
      }catch(err){
        console.error('İrsaliye dosyası okunamadı:', err);
        durumEl.textContent = 'Dosya okunamadı: ' + err.message;
        guncelleBtn.disabled = true;
      }
    };
    reader.onerror = ()=>{
      // FileReader başarısız olabilir (ör. iOS'ta dosya sağlayıcının erişimi geri çekmesi) —
      // sessiz kalmak yerine kullanıcıya net durum bildirilir.
      durumEl.textContent = 'Dosya okunamadı — lütfen dosyayı yeniden seçin.';
      guncelleBtn.disabled = true;
    };
    reader.readAsArrayBuffer(file);
  });

  guncelleBtn.addEventListener('click', async ()=>{
    if(!state.modernKanalKendiDosya){ durumEl.textContent = 'Önce bir dosya seçin.'; return; }
    guncelleBtn.disabled = true;
    const oncekiText = guncelleBtn.innerHTML;
    guncelleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hesaplanıyor…';
    durumEl.textContent = '';
    try{
      // SAVUNMACI KONTROL (simetrik): Yanlışlıkla Sell Out dosyası bu Modern Kanal alanına
      // seçildiyse durdur — İrsaliye olarak işlenirse 'İrsaliye Tarihi' bulunamaz ve litre 0 çıkar.
      {
        const ilk = state.modernKanalKendiDosya.data && state.modernKanalKendiDosya.data[0];
        const kolonlar = ilk ? Object.keys(ilk) : [];
        const irsaliyeMi = kolonlar.includes('İrsaliye Tarihi') && kolonlar.includes('Ürün Kodu');
        const sellOutMu = kolonlar.includes('Müşteri Kanalı Tnm.') || kolonlar.includes('Açık/Otel Tnm.') || kolonlar.includes('Hacim Segmenti Tnm.');
        ktlog('MODERN doğrulama: irsaliyeMi=', irsaliyeMi, 'sellOutMu=', sellOutMu, 'kolonlar=', kolonlar.slice(0,8));
        if(sellOutMu && !irsaliyeMi){
          throw new Error('Bu dosya bir Geleneksel Kanal (Sell Out) dosyası gibi görünüyor — Modern Kanal (İrsaliye) alanına yüklendi. Lütfen İrsaliye dosyasını bu alana, Sell Out dosyasını Geleneksel Kanal alanına yükleyin.');
        }
      }
      ktlog('MODERN "Verileri Güncelle" → buildIrsaliyeReport çağrılıyor. Kaynak: state.modernKanalKendiDosya ('+(state.modernKanalKendiDosya&&state.modernKanalKendiDosya.ad)+', '+(state.modernKanalKendiDosya&&state.modernKanalKendiDosya.data?state.modernKanalKendiDosya.data.length:0)+' satır)');
      const rapor = buildIrsaliyeReport(state.modernKanalKendiDosya.data);
      await modernKanalKaydet(rapor);
      await renderModernKanalView();
      durumEl.textContent = '✓ Güncellendi — ' + fmtDate(new Date());
    }catch(err){
      console.error('Modern Kanal raporu hesaplanamadı:', err);
      durumEl.textContent = 'Hata: ' + err.message;
    }finally{
      guncelleBtn.disabled = false;
      guncelleBtn.innerHTML = oncekiText;
    }
  });
})();

// Stok Gün sekmesindeki bağımsız Malzemeler (anlık depo stoğu) yükleme alanı — aynı desende,
// ana akıştan tamamen ayrı. Malzeme numarası -> Tahditsiz kullanılabilir stok eşlemesini
// state.malzemelerStok Map'ine yazar (kalıcı saklanmaz, her oturumda/sekmede yeniden yüklenir —
// zaten anlık bir stok görüntüsü olduğu için kalıcılığın pratik faydası yok).
(function(){
  const dosyaInput = document.getElementById('stokGunKendiDosyaInput');
  const dosyaAdiEl = document.getElementById('stokGunKendiDosyaAdi');
  const guncelleBtn = document.getElementById('stokGunKendiGuncelleBtn');
  const durumEl = document.getElementById('stokGunKendiDurum');
  if(!dosyaInput) return;

  dosyaInput.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    dosyaAdiEl.textContent = file.name;
    // YARIŞ DÜZELTMESİ: buton, dosya BAŞARIYLA OKUNDUKTAN sonra (reader.onload içinde) aktifleşir.
    // Önceden seçim anında aktifleşiyordu — yavaş/başarısız okumada kullanıcı, ekranda yeni dosya
    // adı yazarken bir ÖNCEKİ dosyanın verisiyle hesaplama başlatabiliyordu. Eski veri de temizlenir.
    guncelleBtn.disabled = true;
    state.stokGunKendiDosya = null;
    durumEl.textContent = 'Dosya okunuyor…';
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        if(!xlsxHazirMi()) throw new Error('Excel okuma bileşeni (xlsx) yüklenemedi — sayfayı yenileyin.');
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const {data} = sheetToObjects(ws);
        state.stokGunKendiDosya = {data, ad:file.name};
        guncelleBtn.disabled = false;
        durumEl.textContent = '';
      }catch(err){
        console.error('Malzemeler dosyası okunamadı:', err);
        durumEl.textContent = 'Dosya okunamadı: ' + err.message;
        guncelleBtn.disabled = true;
      }
    };
    reader.onerror = ()=>{
      // FileReader başarısız olabilir (ör. iOS'ta dosya sağlayıcının erişimi geri çekmesi) —
      // sessiz kalmak yerine kullanıcıya net durum bildirilir.
      durumEl.textContent = 'Dosya okunamadı — lütfen dosyayı yeniden seçin.';
      guncelleBtn.disabled = true;
    };
    reader.readAsArrayBuffer(file);
  });

  guncelleBtn.addEventListener('click', async ()=>{
    if(!state.stokGunKendiDosya){ durumEl.textContent = 'Önce bir dosya seçin.'; return; }
    guncelleBtn.disabled = true;
    const oncekiText = guncelleBtn.innerHTML;
    guncelleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hesaplanıyor…';
    durumEl.textContent = '';
    try{
      const stokMap = new Map();
      (state.stokGunKendiDosya.data||[]).forEach(r=>{
        const kod = String(r['Malzeme numarası']||'').trim();
        if(!kod) return;
        stokMap.set(kod, Number(r['Tahditsiz kullanılabilir'])||0);
      });
      // Son yüklenen Malzemeler dosyası buluta (ve cihaza) kaydedilir — Müşteri Master ile
      // aynı desen: yeni bir dosya yüklenip güncellenene kadar bu kayıt kullanılmaya devam
      // eder, sayfa yenilendiğinde/sekmeye tekrar girildiğinde otomatik geri yüklenir.
      await malzemelerStokKaydet(stokMap);
      renderStokGunView();
      durumEl.textContent = '✓ Güncellendi ve buluta kaydedildi — ' + fmtDate(new Date()) + ' (' + stokMap.size.toLocaleString('tr-TR') + ' ürün)';
    }catch(err){
      console.error('Malzemeler verisi işlenemedi:', err);
      durumEl.textContent = 'Hata: ' + err.message;
    }finally{
      guncelleBtn.disabled = false;
      guncelleBtn.innerHTML = oncekiText;
    }
  });
})();

// Stok Gün tablosu arama kutusu — büyük/küçük harf duyarsız (Türkçe İ/ı için tr-TR locale),
// ürün adı veya kodu üzerinden filtreler. Sistemin diğer sekmelerindeki arama kutularıyla
// aynı wireSearchInput/wireSearchClear yardımcı fonksiyonlarını kullanır.
if(document.getElementById('stokGunSearchInput')){
  const debouncedStokGunFiltre = debounce(stokGunTabloyuFiltreleyipCiz);
  wireSearchInput('stokGunSearchInput', 'stokGunSearchClearBtn', debouncedStokGunFiltre);
  wireSearchClear('stokGunSearchInput', 'stokGunSearchClearBtn', stokGunTabloyuFiltreleyipCiz);
}
// Stok Gün artık tablo değil kart-grid olduğu için sıralama, tıklanabilir kolon başlığı
// yerine bir <select> ile yapılır (bkz. #stokGunSortSelect, kart panelinin üstünde). Seçilen
// değer "anahtar:yön" formatındadır (ör. "stokGunu:1" = Stok Gün'e göre artan/azdan-çoğa).
const stokGunSortSelectEl = document.getElementById('stokGunSortSelect');
if(stokGunSortSelectEl){
  const [ilkKey, ilkDir] = (stokGunSortSelectEl.value||'stokGunu:1').split(':');
  state.stokGunSort = { key: ilkKey, dir: Number(ilkDir) };
  stokGunSortSelectEl.addEventListener('change', ()=>{
    const [key, dir] = stokGunSortSelectEl.value.split(':');
    state.stokGunSort = { key, dir: Number(dir) };
    stokGunTabloyuFiltreleyipCiz();
  });
}
document.getElementById('stokGunMarkaFilter')?.addEventListener('change', stokGunTabloyuFiltreleyipCiz);

// Tümü/Kritik/Yeni/Ölü sekme butonları
document.querySelectorAll('.stokgun-sekme-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> stokGunSekmeDegistir(btn.dataset.sekme));
});

// Ürün×temsilci risk detayı "Kim satıyor?" toggle — kart listesi her render'da yeniden
// oluştuğu için delegated (üst kart-liste konteyneri üzerinden) bir click listener kullanılıyor.
document.getElementById('stokGunKartListe')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('.stokgun-risk-toggle');
  if(!btn) return;
  const kod = btn.dataset.riskKod;
  if(state.stokGunAcikRiskSatirlar.has(kod)) state.stokGunAcikRiskSatirlar.delete(kod);
  else state.stokGunAcikRiskSatirlar.add(kod);
  stokGunTabloyuFiltreleyipCiz();
});

// Not: Kritik stok uyarıları için tarayıcı bildirimi (Notification API) özelliği
// kaldırıldı — panel içi banner ve rozet uyarıları yeterli görüldü, ayrıca izin
// istemi kullanıcı deneyimini bozuyordu.

document.getElementById('sellOutYenileBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('sellOutYenileBtn');
  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = '🔄 Yenileniyor…';
  try{
    // Bu 4 çağrı birbirinden bağımsız — hepsi paralel çalıştırılıp sonra render edilir.
    await Promise.all([
      sellOutHedefYenile(),
      musteriMasterYenile(),
      sellOutYenile(),
      sellOutArsivYenile(true),
    ]);
    await renderSellOutView();
  }catch(err){
    console.error('Sell Out verisi yenilenemedi:', err);
    alert('Yenileme sırasında bir hata oluştu: ' + err.message + '\n\nLütfen tekrar deneyin.');
  }finally{
    btn.disabled = false;
    btn.textContent = prevText;
  }
});

// --- Olay bağlamaları ---
document.getElementById('dsoTrendYenileBtn').addEventListener('click', ()=> renderDsoTrendView(state.report || {musteriler:[]}, true));
document.getElementById('karneYenileBtn').addEventListener('click', ()=> renderTemsilciKarnesiView(state.report || {musteriler:[]}, true));
document.addEventListener('click', e=>{
  const btn = e.target.closest('#karneGrid .fatura-detay-btn, #supheliHukukiKartGrid .fatura-detay-btn, #musteriTbody .fatura-detay-btn, #sevkMusteriTbody .fatura-detay-btn, #faturaKontrolTbody .fatura-detay-btn, #karneRiskliModalList .fatura-detay-btn');
  if(!btn) return;
  e.stopPropagation();
  faturaModalAc(btn.getAttribute('data-musteri-kod'), btn.getAttribute('data-musteri-adi'));
});
document.getElementById('supheliHukukiDahaFazlaBtn').addEventListener('click', ()=>{
  state.hukukiGosterilen += HUKUKI_SAYFA_BOYUTU;
  renderSupheliAlacakView(state.report);
});
const debouncedRenderSupheliHukuki = debounce(()=>{ state.hukukiGosterilen = HUKUKI_SAYFA_BOYUTU; renderSupheliAlacakView(state.report); });
wireSearchInput('hukukiSearchInput', 'hukukiSearchClearBtn', debouncedRenderSupheliHukuki);
wireSearchClear('hukukiSearchInput', 'hukukiSearchClearBtn', ()=>{ state.hukukiGosterilen = HUKUKI_SAYFA_BOYUTU; renderSupheliAlacakView(state.report); });
document.getElementById('hukukiTemsilciFilter').addEventListener('change', ()=>{
  state.hukukiGosterilen = HUKUKI_SAYFA_BOYUTU;
  renderSupheliAlacakView(state.report);
});
document.getElementById('hukukiRiskFilter').addEventListener('change', ()=>{
  state.hukukiGosterilen = HUKUKI_SAYFA_BOYUTU;
  renderSupheliAlacakView(state.report);
});
document.getElementById('hukukiVadeMinInput').addEventListener('input', debouncedRenderSupheliHukuki);
document.getElementById('hukukiVadeMaxInput').addEventListener('input', debouncedRenderSupheliHukuki);
document.getElementById('yoYenileBtn').addEventListener('click', ()=> renderYonetimOzetiView(state.report || {musteriler:[]}, true));
document.getElementById('ceiYenileBtn').addEventListener('click', ()=> renderCeiView(state.report || {musteriler:[]}, true));
document.getElementById('ceiAySelect').addEventListener('change', (e)=>{
  state.ceiAy = e.target.value || null;
  recomputeAndRenderCei(state.report || {musteriler:[]}, false);
});


document.querySelectorAll('th[data-key]').forEach(th=>{
  th.setAttribute('tabindex','0');
  th.setAttribute('role','button');
  if(!th.hasAttribute('aria-label')){
    th.setAttribute('aria-label', th.textContent.trim().replace(/[▲▼]/g,'').trim() + ' - sırala');
  }
  th.addEventListener('keydown', e=>{
    if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){
      e.preventDefault();
      th.click();
    }
  });
  th.addEventListener('click', ()=>{
    const table = th.closest('table');
    if(!table) return;
    table.querySelectorAll('th[data-key]').forEach(h=>h.removeAttribute('aria-sort'));
    const arrow = th.querySelector('.arrow');
    const dirText = arrow ? arrow.textContent : '';
    if(dirText==='▲') th.setAttribute('aria-sort','ascending');
    else if(dirText==='▼') th.setAttribute('aria-sort','descending');
  });
});
