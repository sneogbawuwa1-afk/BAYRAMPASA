// ============================================================================
// 6) SELL OUT RAPORU (Tasarım A)
// ============================================================================
const SELLOUT_HEDEF_CLOUD_PATH = CLOUD.path + '_sellOutHedef';
const SELLOUT_HEDEF_LOCAL_KEY = 'noktaCariTakip_sellOutHedef_v1';
const SELLOUT_REPORT_CLOUD_PATH = CLOUD.path + '_sellOutReport';
const SELLOUT_REPORT_LOCAL_KEY = 'noktaCariTakip_sellOutReport_v1';
const SELLOUT_ARSIV_CLOUD_PATH = CLOUD.path + '_sellOutArsiv'; // {ayKey: raporSnapshot} - her ay "Arşivle" ile elle kaydedilir
const SELLOUT_ARSIV_LOCAL_KEY = 'noktaCariTakip_sellOutArsiv_v1';

// Müşteri Kanalı Tnm. -> Açık Kanal / Kapalı Kanal eşlemesi. Ekomini -> Kapalı Kanal;
// Otel ve Horeca -> Açık Kanal; Standart Açık/Standart Kapalı zaten adından bellidir.
const KAPALI_KANAL_DEGERLERI = new Set(['Standart Kapalı','Ekomini']);
const ACIK_KANAL_DEGERLERI = new Set(['Standart Açık','Otel','Horeca']);
function sellOutKanalSinifla(musteriKanaliRaw, acikOtelRaw){
  const v = String(musteriKanaliRaw||'').trim();
  if(KAPALI_KANAL_DEGERLERI.has(v)) return 'Kapalı Kanal';
  if(ACIK_KANAL_DEGERLERI.has(v)) return 'Açık Kanal';
  return String(acikOtelRaw||'').trim() ? 'Açık Kanal' : 'Kapalı Kanal';
}

// Rakı/viski/votka/cin/konyak gibi distile içki markaları, Mal Grubu Tnm. metninde geçen
// anahtar kelimelere göre tek bir "Distile" grubunda toplanır — Stok Gün raporundaki marka
// filtresinde bu markalar artık kendi isimleriyle değil, tek "Distile" seçeneği olarak
// görünür. Anahtar kelime tabanlı olduğu için yeni bir viski/rakı markası eklendiğinde de
// (marka adında bu kelimelerden biri geçtiği sürece) otomatik yakalanır; adında anahtar kelime
// geçmeyen bilinen distile markaları (Glenfiddich, Grant's, Monkey Shoulder gibi) ayrıca sabit
// bir liste ile eşleştirilir.
const DISTILE_ANAHTAR_KELIMELER = ['rakı','raki','viski','whisky','whiskey','votka','vodka','cin','gin','konyak','brendi','brandy','likör','likor'];
const DISTILE_BILINEN_MARKALAR = ['glenfiddich','grant\'s','grants','monkey shoulder','hendrick\'s','hendricks','fasıl rakı','fasil raki','mercan rakı','mercan raki'];
// Stok Gün marka filtresi artık SADECE 2 seçenek sunar: "Distile" (yukarıdaki anahtar kelime/bilinen
// marka listesiyle eşleşen ürünler) ve "Bira" (distile olmayan TÜM diğer ürünler — eskiden "Diğer"
// adı altında toplanan meşrubat/su gibi farklı ürün tipleri dahil, artık ayrı bir kategori yok).
// Ana Ürün <-> Parçalı Ürün eşlemesi: bazı ürünler depoda toplu ambalajdan (ana kod, ör. koli/
// kutu) daha küçük/tekli ambalaja (parçalı kod) bölünerek satılıyor. export_1.xlsx'teki gerçek
// "Bozulan/Birleştirilen Ürün Kodu -> Oluşan Ürün Kodu" işlem geçmişinden, HER ÇİFT İÇİN GERÇEK
// DÖNÜŞÜM ORANIYLA BİRLİKTE çıkarılmıştır (ör. 1 adet "12X1L" ana kod = 12 adet "1L" parçalı kod
// olduğundan oran=12). "4X6" gibi çift yönlü/belirsiz ara-ambalaj varyasyonlarına (ör. Corona
// 152417/152471/152733 zinciri) KASITLI OLARAK dokunulmamıştır — bu kodlar eşlemenin dışında
// bırakılmış, kendi bağımsız satırları olarak kalırlar.
//
// Her girdi: 'parçalıKod': { ana:'anaKod', parcaliOranAna: N } — burada N, "1 adet ANA kod kaç
// adet PARÇALI koda denk gelir" oranıdır (ör. 12X1L -> 1L için N=12). Miktar birleştirilirken
// PARÇALI miktar ANA birimine çevrilirken N'e BÖLÜNÜR, ANA miktar PARÇALI birimine çevrilirken
// N ile ÇARPILIR — aksi halde (ör. 15 adet parçalı + 812 adet ana toplamda doğrudan 827 gibi
// yanlış bir toplam çıkar; doğrusu 812 + 15/2 = 819,5 gibi birim-dönüştürülmüş bir toplamdır).
//
// KURAL (Stok Gün ve anlık stok hesaplamalarında uygulanır):
//  - BİRA grubunda: parçalı kodun miktarı ANA BİRİMİNE çevrilip (miktar / parcaliOranAna) ana
//    koda eklenir; parçalı kod raporda/listede AYRICA gösterilmez (tek satır: ana kod).
//  - DİSTİLE grubunda: tam tersi — ana kodun miktarı PARÇALI BİRİMİNE çevrilip (miktar *
//    parcaliOranAna) parçalı koda eklenir; ana kod raporda/listede AYRICA gösterilmez (tek
//    satır: parçalı kod).
const PARCALI_ANA_URUN_ESLEME = {
  '151293': { ana:'150487', parcaliOranAna: 2 },
  '151436': { ana:'151247', parcaliOranAna: 2 },
  '151448': { ana:'151271', parcaliOranAna: 2 },
  '151463': { ana:'150137', parcaliOranAna: 2 },
  '151904': { ana:'150782', parcaliOranAna: 4 },
  '151910': { ana:'150782', parcaliOranAna: 2 },
  '151942': { ana:'150783', parcaliOranAna: 4 },
  '151943': { ana:'150783', parcaliOranAna: 2 },
  '152046': { ana:'150784', parcaliOranAna: 2 },
  '152301': { ana:'152208', parcaliOranAna: 12 },
  '152312': { ana:'152221', parcaliOranAna: 6 },
  '152313': { ana:'152222', parcaliOranAna: 12 },
  '152314': { ana:'152223', parcaliOranAna: 12 },
  '152315': { ana:'152224', parcaliOranAna: 24 },
  '152316': { ana:'152225', parcaliOranAna: 24 },
  '152318': { ana:'152227', parcaliOranAna: 6 },
  '152327': { ana:'152236', parcaliOranAna: 6 },
  '152547': { ana:'152422', parcaliOranAna: 2 },
  '152548': { ana:'152422', parcaliOranAna: 4 },
  '152710': { ana:'152542', parcaliOranAna: 4 },
  '152716': { ana:'151961', parcaliOranAna: 2 },
  '152755': { ana:'152747', parcaliOranAna: 24 },
  '152756': { ana:'152748', parcaliOranAna: 12 },
  '152757': { ana:'152749', parcaliOranAna: 12 },
  '152758': { ana:'152751', parcaliOranAna: 6 },
  '152759': { ana:'152752', parcaliOranAna: 6 },
  '152763': { ana:'152753', parcaliOranAna: 12 },
  '152764': { ana:'152754', parcaliOranAna: 6 },
  '152782': { ana:'151384', parcaliOranAna: 4 },
  '152949': { ana:'152950', parcaliOranAna: 6 },
  '154012': { ana:'151271', parcaliOranAna: 4 },
  '154020': { ana:'151420', parcaliOranAna: 4 },
  '154504': { ana:'151247', parcaliOranAna: 4 },
  '154505': { ana:'150487', parcaliOranAna: 4 },
  '154506': { ana:'151335', parcaliOranAna: 2 },
  '154510': { ana:'151384', parcaliOranAna: 2 },
  '154513': { ana:'151918', parcaliOranAna: 2 },
  '154525': { ana:'150021', parcaliOranAna: 2 },
  '154527': { ana:'151428', parcaliOranAna: 2 },
  '154535': { ana:'152608', parcaliOranAna: 2 },
  '154539': { ana:'152644', parcaliOranAna: 2 },
  '154547': { ana:'151335', parcaliOranAna: 4 },
  '154548': { ana:'150021', parcaliOranAna: 4 },
  '154555': { ana:'152644', parcaliOranAna: 4 },
};
// Ters yönlü (anaKod -> {parcaliKod, parcaliOranAna}) harita, her çağrıda yeniden taranmasın diye
// bir kez hesaplanır. Not: aynı ana koda birden fazla parçalı kod bağlı olduğu durumlarda (ör.
// Efes Xtra *6 ve *12 gibi) burada SADECE ilk eşleşme tutulur — Distile tarafında bir ana kodun
// "tek" bir parçalı karşılığı olduğu varsayılır; birden fazla parçalı varyantı olan ana ürünler
// çoğunlukla Bira grubundadır (yön zaten ana koda toplanır), bu yüzden pratikte sorun yaratmaz.
const ANA_PARCALI_URUN_ESLEME_TERS = (function(){
  const ters = {};
  Object.keys(PARCALI_ANA_URUN_ESLEME).forEach(parcali=>{
    const bilgi = PARCALI_ANA_URUN_ESLEME[parcali];
    if(!(bilgi.ana in ters)) ters[bilgi.ana] = {parcali, parcaliOranAna: bilgi.parcaliOranAna};
  });
  return ters;
})();
// urunKodu ve o ürünün DISTILE/BIRA sınıflandırmasına göre "hangi kod altında raporlanacağını"
// döndürür. Bira ise ana kod, Distile ise parçalı kod hedef koddur; eşlemede yer almayan
// (ilişkisi tanımsız) ürünler kendi kodlarında kalır.
function stokGunHedefKodBul(urunKodu, marka){
  const kod = String(urunKodu||'').trim();
  const bilgi = PARCALI_ANA_URUN_ESLEME[kod]; // bu kod parçalıysa, ait olduğu ana kod bilgisi
  if(bilgi){
    // Bu kod PARÇALI taraf: Bira -> ana koda yönlendir (parçalı kod gizlenir).
    // Distile -> kendi kodunda kalır (parçalı kod zaten hedef).
    return marka==='Bira' ? bilgi.ana : kod;
  }
  const tersBilgi = ANA_PARCALI_URUN_ESLEME_TERS[kod]; // bu kod ana ise, karşılık gelen parçalı kod
  if(tersBilgi){
    // Bu kod ANA taraf: Distile -> parçalı koda yönlendir (ana kod gizlenir).
    // Bira -> kendi kodunda kalır (ana kod zaten hedef).
    return marka==='Distile' ? tersBilgi.parcali : kod;
  }
  return kod; // eşlemede yok, olduğu gibi
}
// Bir miktarı, ham kodun biriminden HEDEF kodun birimine çevirir. hamKod parçalıysa ve hedef
// (ana koda gitmişse) ana birime çevrilir (miktar / parcaliOranAna); hamKod ana ise ve hedef
// (parçalı koda gitmişse) parçalı birime çevrilir (miktar * parcaliOranAna). Diğer tüm
// durumlarda (hedef zaten hamKod'un kendisiyse, ya da eşleme tanımsızsa) miktar değişmeden döner.
function stokGunMiktarBirimCevir(miktar, hamKod, hedefKod){
  hamKod = String(hamKod||'').trim();
  if(hedefKod===hamKod || miktar==null) return miktar;
  const bilgi = PARCALI_ANA_URUN_ESLEME[hamKod];
  if(bilgi && bilgi.ana===hedefKod) return miktar / bilgi.parcaliOranAna; // parçalı -> ana
  const tersBilgi = ANA_PARCALI_URUN_ESLEME_TERS[hamKod];
  if(tersBilgi && tersBilgi.parcali===hedefKod) return miktar * tersBilgi.parcaliOranAna; // ana -> parçalı
  return miktar; // beklenmeyen durum, güvenli varsayılan: dönüştürme yapma
}
function sellOutMarkaGrubu(markaHam){
  const marka = String(markaHam||'').trim();
  if(!marka) return 'Bira';
  // Girdi zaten önceden sınıflandırılmış (arşivden gelen "Distile"/"Bira" — bkz.
  // stokGunUrunVerileriniTopla'daki yeniden hesaplama) ise olduğu gibi kabul edilir; aksi halde
  // sonsuz döngüye/yanlış sınıflandırmaya yol açmaz (aksi halde "Distile" kelimesinin kendisi
  // hiçbir anahtar kelimeyle eşleşmediği için yanlışlıkla "Bira" dönerdi).
  if(marka === 'Distile' || marka === 'Bira') return marka;
  const normalize = marka.toLocaleLowerCase('tr-TR');
  if(DISTILE_ANAHTAR_KELIMELER.some(k=> normalize.includes(k))) return 'Distile';
  if(DISTILE_BILINEN_MARKALAR.some(k=> normalize.includes(k))) return 'Distile';
  return 'Bira';
}

// Ham satış kalemlerinden; hedef-bağımsız olmayan (litre, FKNS, marka, kanal, trend) her şeyi
// hesaplar. Açık/Kapalı Kanal LİTRE HEDEFLERİ elle girildiği ve her an değişebildiği için burada
// HESAPLANMAZ — bunlar render anında applySellOutHedef() ile ayrıca uygulanır; böylece bir hedef
// kaydedildiğinde ham Sell Out dosyasını yeniden yüklemeye gerek kalmaz.
function buildSellOutReport(rows, musteriMasterMap, musteriMasterDurumMap, musteriMasterDetayMap, musteriMasterKanalMap){
  musteriMasterMap = musteriMasterMap || new Map();
  musteriMasterDurumMap = musteriMasterDurumMap || new Map();
  musteriMasterDetayMap = musteriMasterDetayMap || new Map();
  musteriMasterKanalMap = musteriMasterKanalMap || new Map();

  const temsilciAgg = new Map();
  const markaAgg = new Map();
  const hacimSegAgg = new Map();
  const gunlukTrend = new Map();
  // Malzeme Kodu bazlı günlük litre — "Stok Gün" raporunun 1. Aşama (geçmiş pay tespiti) ve
  // 2. Aşama (en yoğun hafta / yoğun dönem günlük hızı) hesaplarının TEK veri kaynağı. Her
  // ürün için {gunKey -> litre} tutuluyor; ayrı bir toplam da (malzemeUrunAdi eşlemesi için).
  const malzemeGunlukAgg = new Map(); // malzemeKodu -> Map(gunKey -> {litre, miktar})
  const malzemeUrunAdi = new Map(); // malzemeKodu -> Malzeme Tnm.
  const malzemeMarka = new Map(); // malzemeKodu -> Mal Grubu Tnm. (Stok Gün raporundaki marka filtresi için)
  // malzemeKodu -> Map(temsilciAdi -> litre) — Stok Gün'deki "kritik üründe en çok satan
  // temsilciler kimler ve tahsilat performansları nasıl" bağlantısı için (bkz.
  // urunTemsilciRiskDetayi / computeStokGunRaporu). Sadece BU AYIN canlı verisi tutulur —
  // arşivlenmiş geçmiş aylara taşınmaz, çünkü risk sinyali güncel (bugünkü) tahsilat karnesiyle
  // eşleştirilir, geçmiş ayların temsilci dağılımı bugün için anlamlı değildir.
  const malzemeTemsilciAgg = new Map();
  let toplamNet=0, toplamLitre=0, acikNetToplam=0, kapaliNetToplam=0;
  let blokajTutar=0, blokajAdet=0;
  const belgeSetGenel = new Set();
  const invoicedNoktaSetGenel = new Set();

  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri No']||'').trim();
    // Temsilci ve SSM için tek kaynak en güncel Müşteri Master'dır. Sell Out dosyasındaki adlar
    // yalnızca masterda hiç bulunmayan müşteri için temsilci yedeğidir; SSM yine masterdan türetilir.
    const temsilciHam = String(musteriMasterMap.get(musteri) || r['Satış Temsilcisi Adı'] || '').trim();
    const ssmHam = getSahaMuduru(temsilciHam, musteri);
    const net = Number(r['Net'])||0;
    const litre = Number(r['Litre'])||0;
    const miktar = Number(r['Miktar'])||0;
    const kanal = sellOutKanalSinifla(r['Müşteri Kanalı Tnm.'], r['Açık/Otel Tnm.']);
    const marka = String(r['Mal Grubu Tnm.']||'').trim() || 'Diğer';
    const hacimSeg = String(r['Hacim Segmenti Tnm.']||'').trim() || 'Tanımsız';
    const belgeNo = r['Satış Belgesi'];
    const muhasebeDurum = String(r['Muhasebeleşme Durumu Tanımı']||'').trim();
    // Not: excelDateToJSArti1Gun kullanılır (excelDateToJS DEĞİL) — bkz. buildYuklemeRaporu'daki
    // aynı notla birebir aynı sebep: tarayıcı Türkiye (+3) saat diliminde çalışırken, saf/naif Excel
    // tarihleri 1 gün geriye kayabiliyor; bu düzeltme olmadan Günlük Trend grafiği bir gün ERKEN
    // gösteriyordu (ör. dosyada 01-04 Temmuz varken grafik 30 Haziran-03 Temmuz gösteriyordu).
    const trendTarihi = excelDateToJSArti1Gun(r['Girilen Faturalama Tarihi']);
    const malzemeKodu = String(r['Malzeme Kodu']||'').trim();
    const malzemeTnm = String(r['Malzeme Tnm.']||'').trim();

    toplamNet += net; toplamLitre += litre;
    if(kanal==='Açık Kanal') acikNetToplam += net; else kapaliNetToplam += net;
    if(belgeNo!=null && belgeNo!=='') belgeSetGenel.add(String(belgeNo));
    if(musteri) invoicedNoktaSetGenel.add(musteri);
    if(muhasebeDurum === 'Faturalama Blokajlı'){ blokajTutar += net; blokajAdet += 1; }

    markaAgg.set(marka, (markaAgg.get(marka)||0)+litre);
    hacimSegAgg.set(hacimSeg, (hacimSegAgg.get(hacimSeg)||0)+net);

    if(trendTarihi){
      const gk = dateKeyLocal(trendTarihi);
      if(gk){
        if(!gunlukTrend.has(gk)) gunlukTrend.set(gk, {net:0, litre:0});
        const g = gunlukTrend.get(gk);
        g.net += net; g.litre += litre;
        // Malzeme Kodu bazlı günlük litre — Stok Gün raporunun tek veri kaynağı. "2" ile
        // başlayan malzeme kodları (ör. 222467) gerçek stoklu ürün değil, farklı bir kategori
        // (iade/numune/promosyon vb.) olduğu için Stok Gün hesaplamasına hiç dahil edilmez.
        if(malzemeKodu && !malzemeKodu.startsWith('2')){
          if(!malzemeGunlukAgg.has(malzemeKodu)) malzemeGunlukAgg.set(malzemeKodu, new Map());
          const mg = malzemeGunlukAgg.get(malzemeKodu);
          if(!mg.has(gk)) mg.set(gk, {litre:0, miktar:0});
          const mgGun = mg.get(gk);
          mgGun.litre += litre;
          mgGun.miktar += miktar;
          if(malzemeTnm && !malzemeUrunAdi.has(malzemeKodu)) malzemeUrunAdi.set(malzemeKodu, malzemeTnm);
          if(marka && !malzemeMarka.has(malzemeKodu)) malzemeMarka.set(malzemeKodu, sellOutMarkaGrubu(marka));
          if(temsilciHam){
            if(!malzemeTemsilciAgg.has(malzemeKodu)) malzemeTemsilciAgg.set(malzemeKodu, new Map());
            const mt = malzemeTemsilciAgg.get(malzemeKodu);
            mt.set(temsilciHam, (mt.get(temsilciHam)||0) + litre);
          }
        }
      }
    }

    if(!temsilciHam) return;
    const key = normalizeAdSoyad(temsilciHam);
    if(!temsilciAgg.has(key)){
      temsilciAgg.set(key, {key, ad:temsilciHam, ssm:ssmHam, netCiro:0, acikLitre:0, kapaliLitre:0, belgeSet:new Set(), invoicedNoktaSet:new Set(), aktifNoktalar:[]});
    }
    const t = temsilciAgg.get(key);
    if(t.ssm==='Tanımsız' && ssmHam!=='Tanımsız') t.ssm = ssmHam;
    t.netCiro += net;
    if(kanal==='Açık Kanal') t.acikLitre += litre; else t.kapaliLitre += litre;
    if(belgeNo!=null && belgeNo!=='') t.belgeSet.add(String(belgeNo));
    if(musteri) t.invoicedNoktaSet.add(musteri);
  });

  // Açık/Kapalı Kanal FKNS ayrımı için müşteri kanalı — Müşteri Master dosyasındaki "Satış Kanalı
  // Tanımı" kolonundan (musteriMasterKanalMap, bkz. buildMusteriMasterKanalMap/02-bulut-ve-auth.js)
  // doğrudan okunur. Bu, bu dönem hiç satışı olmayan noktalar için de kanalın bilinmesini sağlar
  // (eski yaklaşım sadece Sell Out satırlarından türetiyordu, satışı olmayan noktaların kanalı hiç
  // bilinemiyordu). "Key Account" gibi Açık/Kapalı Kanal kümelerinin dışında kalan ya da Müşteri
  // Master'da hiç bulunmayan noktalar musteriMasterKanalMap'te YER ALMAZ — aşağıda aktifNoktalar'a
  // dağıtılırken kanalı bilinmiyor kabul edilip ne Açık ne Kapalı FKNS paydasına dahil edilir,
  // sadece Toplam FKNS'ye girerler (kullanıcı kararı).
  const musteriKanalMap = musteriMasterKanalMap;

  // Müşteri Master'daki noktaları temsilcilerine dağıt (bu dönem satışı olmasa da FKNS hesabına
  // dahil olmaları gerekir). Durum kolonu bulunamadıysa tüm noktalar aktif kabul edilir. Durum
  // kolonu varsa, yalnızca statüsü açıkça "Pasif" veya "İptal" olan noktalar hem bu listeden hem de
  // FKNS (Fatura Kesilen Nokta Sayısı) hesaplamasından tamamen çıkarılır; diğer statüler (Aktif ya da
  // tanınmayan başka bir statü metni) hesaba dahil edilmeye devam eder.
  const durumVarMi = musteriMasterDurumMap.size > 0;
  musteriMasterMap.forEach((temsilciAd, musteriKod)=>{
    if(durumVarMi && noktaPasifVeyaIptalMi(musteriMasterDurumMap.get(musteriKod))) return;
    const key = normalizeAdSoyad(temsilciAd);
    if(!temsilciAgg.has(key)){
      temsilciAgg.set(key, {key, ad:temsilciAd, ssm:getSahaMuduru(temsilciAd, musteriKod), netCiro:0, acikLitre:0, kapaliLitre:0, belgeSet:new Set(), invoicedNoktaSet:new Set(), aktifNoktalar:[]});
    }
    temsilciAgg.get(key).aktifNoktalar.push(musteriKod);
  });

  const temsilciler = Array.from(temsilciAgg.values()).map(t=>{
    const toplamAktif = t.aktifNoktalar.length;
    const faturaKesilmeyenKodlar = t.aktifNoktalar.filter(k=>!t.invoicedNoktaSet.has(k));
    const faturaKesilen = toplamAktif - faturaKesilmeyenKodlar.length;
    const fknsOrani = toplamAktif>0 ? (faturaKesilen/toplamAktif*100) : null;
    // Açık/Kapalı Kanal FKNS — aynı aktifNoktalar listesi, musteriKanalMap'e göre ikiye bölünüp
    // her alt küme için ayrı ayrı (fatura kesilen / toplam aktif) oranı hesaplanır. Bu dönemde hiç
    // satış satırı olmadığı için kanalı belirlenemeyen (musteriKanalMap'te bulunmayan) noktalar
    // HİÇBİR kanal paydasına dahil edilmez — yanlışlıkla Açık ya da Kapalı Kanal'a sayılıp o
    // oranları gereksiz yere düşürmesinler diye; Toplam FKNS (fknsOrani) bu noktaları zaten içerir.
    const acikAktifNoktalar = t.aktifNoktalar.filter(k=> musteriKanalMap.get(k)==='Açık Kanal');
    const kapaliAktifNoktalar = t.aktifNoktalar.filter(k=> musteriKanalMap.get(k)==='Kapalı Kanal');
    const acikFaturaKesilen = acikAktifNoktalar.filter(k=> t.invoicedNoktaSet.has(k)).length;
    const kapaliFaturaKesilen = kapaliAktifNoktalar.filter(k=> t.invoicedNoktaSet.has(k)).length;
    const fknsAcikOrani = acikAktifNoktalar.length>0 ? (acikFaturaKesilen/acikAktifNoktalar.length*100) : null;
    const fknsKapaliOrani = kapaliAktifNoktalar.length>0 ? (kapaliFaturaKesilen/kapaliAktifNoktalar.length*100) : null;
    // Fatura kesilmeyen noktalar da aynı kanal haritasına göre Açık/Kapalı/(kanalı bilinmeyen)
    // olarak üçe ayrılır — kart üzerindeki "Fatura kesilmeyen" sayacı ve Detay modalı bu ayrımı
    // gösterir. faturaKesilmeyenListe (kanal etiketli, tam liste) modaldaki filtre/sekme için
    // kullanılır; faturaKesilmeyenAcik/Kapali sayıları ise kart üzerindeki kısa özet içindir.
    const faturaKesilmeyenAcikKodlar = faturaKesilmeyenKodlar.filter(k=> musteriKanalMap.get(k)==='Açık Kanal');
    const faturaKesilmeyenKapaliKodlar = faturaKesilmeyenKodlar.filter(k=> musteriKanalMap.get(k)==='Kapalı Kanal');
    const ssm = t.ssm || getSahaMuduru(t.ad) || 'Tanımsız';
    return {
      key:t.key, temsilci:t.ad, ssm, netCiro:t.netCiro,
      acikLitre:t.acikLitre, kapaliLitre:t.kapaliLitre, toplamLitre:t.acikLitre+t.kapaliLitre,
      belgeSayisi:t.belgeSet.size,
      toplamAktifNokta:toplamAktif, faturaKesilenNokta:faturaKesilen, faturaKesilmeyenNokta:faturaKesilmeyenKodlar.length,
      faturaKesilmeyenNoktaAcik:faturaKesilmeyenAcikKodlar.length, faturaKesilmeyenNoktaKapali:faturaKesilmeyenKapaliKodlar.length,
      fknsOrani, fknsAcikOrani, fknsKapaliOrani,
      toplamAktifNoktaAcik:acikAktifNoktalar.length, toplamAktifNoktaKapali:kapaliAktifNoktalar.length,
      faturaKesilmeyenListe: faturaKesilmeyenKodlar.map(kod=>({kod, adi:(musteriMasterDetayMap.get(kod)||{}).musteriAdi || kod, kanal: musteriKanalMap.get(kod) || null})),
    };
  }).sort((a,b)=> b.toplamLitre - a.toplamLitre);

  const aktifNoktaSayisi = durumVarMi
    ? Array.from(musteriMasterDurumMap.values()).filter(v=>v==='Aktif').length
    : invoicedNoktaSetGenel.size;

  const gunlukTrendDizi = Array.from(gunlukTrend.entries())
    .map(([gunKey,v])=>({gunKey, net:v.net, litre:v.litre}))
    .sort((a,b)=>a.gunKey.localeCompare(b.gunKey));

  // Malzeme kodu -> {urunAdi, marka, gunler:[{gunKey,litre,miktar}]} — Stok Gün raporunun ham
  // girdisi. Her ürünün gün dizisi ayrı ayrı sıralı tutuluyor ki arşivlenen aylar
  // birleştirildiğinde (bkz. sellOutArsivUrunBirlestir) doğrudan uç uca eklenebilsin.
  const malzemelerDizi = Array.from(malzemeGunlukAgg.entries()).map(([kod, gunMap])=>({
    kod,
    urunAdi: malzemeUrunAdi.get(kod) || kod,
    marka: malzemeMarka.get(kod) || 'Bira', // Stok Gün marka filtresi artık sadece Distile/Bira
    gunler: Array.from(gunMap.entries()).map(([gunKey,v])=>({gunKey, litre:v.litre, miktar:v.miktar})).sort((a,b)=>a.gunKey.localeCompare(b.gunKey)),
    // Bu ürünü bu ay en çok satan temsilciler, litre payına göre sıralı (en çok 5) — Stok Gün
    // raporundaki ürün×temsilci risk detayının ham girdisi. ÖNEMLİ: pay yüzdesi, listeyi top-5'e
    // KESMEDEN ÖNCE tüm temsilciler üzerinden hesaplanan gerçek toplama göre bulunuyor — yoksa
    // (5'ten fazla temsilci satan ürünlerde) top-5'in kendi içindeki toplama bölünüp yüzdeler
    // olduğundan yüksek çıkardı.
    temsilciPay: (()=>{
      const liste = Array.from((malzemeTemsilciAgg.get(kod)||new Map()).entries()).map(([ad,litre])=>({ad,litre}));
      const gercekToplam = liste.reduce((a,t)=>a+t.litre,0);
      return liste
        .map(t=>({ad:t.ad, litre:t.litre, pay: gercekToplam>0 ? (t.litre/gercekToplam*100) : 0}))
        .sort((a,b)=>b.litre-a.litre)
        .slice(0,5);
    })(),
  }));

  return {
    toplamNet, toplamLitre, belgeSayisi: belgeSetGenel.size, aktifNoktaSayisi, durumVarMi,
    ssmSayisi: new Set(temsilciler.map(t=>t.ssm||'Tanımsız').filter(s=>s!=='Tanımsız')).size,
    temsilciSayisi: temsilciler.length,
    blokajTutar, blokajAdet,
    temsilciler,
    markalar: Array.from(markaAgg.entries()).map(([ad,litre])=>({ad,litre})).sort((a,b)=>b.litre-a.litre),
    hacimSegmentleri: Array.from(hacimSegAgg.entries()).map(([ad,net])=>({ad,net})).sort((a,b)=>b.net-a.net),
    kanalNet: {acik:acikNetToplam, kapali:kapaliNetToplam},
    gunlukTrend: gunlukTrendDizi,
    malzemeler: malzemelerDizi,
  };
}

// baseReport (hedef içermeyen, kalıcı olarak saklanan rapor) üzerine güncel litre hedeflerini
// uygular ve temsilci + SSM satırlarını yeniden hesaplayıp döndürür. Saf bir fonksiyondur —
// hedef kaydedildiğinde ham dosya yeniden yüklenmeden sadece bu fonksiyon tekrar çağrılır.
function applySellOutHedef(baseReport, hedefMap){
  hedefMap = hedefMap || {};
  const temsilciler = baseReport.temsilciler.map(t=>{
    const hedef = hedefMap[t.key] || {};
    const acikHedef = Number(hedef.acik)||0;
    const kapaliHedef = Number(hedef.kapali)||0;
    const acikKalan = Math.max(0, acikHedef - t.acikLitre);
    const kapaliKalan = Math.max(0, kapaliHedef - t.kapaliLitre);
    const toplamHedef = acikHedef+kapaliHedef;
    const hedefGerceklesme = toplamHedef>0 ? (t.toplamLitre/toplamHedef*100) : null;
    return Object.assign({}, t, {acikHedef, kapaliHedef, acikKalan, kapaliKalan, hedefGerceklesme});
  })
  // Güncel Müşteri Master ilişkisinde geçerli satış şefi bulunmayan temsilciler (oran filtresinde
  // elenenler veya artık masterda olmayan eski kayıtlar) hem ST hem SSM tablosunda gösterilmez.
  .filter(t=> t.ssm && t.ssm !== 'Tanımsız')
  .sort((a,b)=> b.toplamLitre - a.toplamLitre);

  const ssmAgg = new Map();
  temsilciler.forEach(r=>{
    const key = r.ssm;
    if(!ssmAgg.has(key)) ssmAgg.set(key, {ssm:key, acikHedef:0, acikLitre:0, kapaliHedef:0, kapaliLitre:0, toplamAktifNokta:0, faturaKesilenNokta:0, temsilciSayisi:0});
    const s = ssmAgg.get(key);
    s.acikHedef += r.acikHedef; s.acikLitre += r.acikLitre;
    s.kapaliHedef += r.kapaliHedef; s.kapaliLitre += r.kapaliLitre;
    s.toplamAktifNokta += r.toplamAktifNokta; s.faturaKesilenNokta += r.faturaKesilenNokta;
    s.temsilciSayisi += 1;
  });
  const ssmler = Array.from(ssmAgg.values()).map(s=>{
    const toplamHedef = s.acikHedef+s.kapaliHedef;
    const toplamSatis = s.acikLitre+s.kapaliLitre;
    return Object.assign({}, s, {
      hedefGerceklesme: toplamHedef>0 ? (toplamSatis/toplamHedef*100) : null,
      genelFkns: s.toplamAktifNokta>0 ? (s.faturaKesilenNokta/s.toplamAktifNokta*100) : null,
    });
  }).sort((a,b)=> (b.acikLitre+b.kapaliLitre)-(a.acikLitre+a.kapaliLitre));

  return Object.assign({}, baseReport, {
    temsilciler, ssmler,
    temsilciSayisi: temsilciler.length,
    ssmSayisi: ssmler.length,
  });
}

// Kaydedilmiş canlı/arşiv Sell Out raporunda müşteri bazlı satış kırılımı tutulmadığı için geçmiş
// litreleri temsilciler arasında yeniden dağıtmak mümkün değildir; ancak her temsilcinin satış şefi
// etiketi güvenle güncel Masterdan yeniden kurulabilir ve SSM toplamları yeniden hesaplanabilir.
function sellOutRaporuGuncelSeflereBagla(baseReport){
  if(!baseReport || !Array.isArray(baseReport.temsilciler)) return baseReport;
  return Object.assign({}, baseReport, {
    temsilciler:baseReport.temsilciler.map(t=>Object.assign({}, t, {ssm:getSahaMuduru(t.temsilci)})),
  });
}

async function saveSellOutHedefToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_HEDEF_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Sell Out hedef buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadSellOutHedefFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_HEDEF_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Sell Out hedef buluttan okunamadı:', err); return null; }
}
async function saveSellOutHedefToLocal(obj){
  const ok = await idbSet(SELLOUT_HEDEF_LOCAL_KEY, obj);
  if(!ok) console.error('Sell Out hedef cihaza kaydedilemedi.');
}
async function loadSellOutHedefFromLocal(){
  try{ return await idbGet(SELLOUT_HEDEF_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function sellOutHedefYenile(){
  let obj = null;
  if(cloudEnabled()) obj = await loadSellOutHedefFromCloud();
  if(!obj) obj = await loadSellOutHedefFromLocal();
  state.sellOutHedef = obj || {};
  return state.sellOutHedef;
}
async function sellOutHedefKaydet(obj){
  state.sellOutHedef = obj;
  await saveSellOutHedefToLocal(obj);
  if(cloudEnabled()){
    const sonuc = await saveSellOutHedefToCloud(obj);
    if(!sonuc.ok) throw new Error('Hedef buluta kaydedilemedi (cihaza da kaydedilmiyor): '+(sonuc.reason||'bilinmeyen hata'));
  }
}

async function saveSellOutReportToCloud(rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_REPORT_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(SELLOUT_REPORT_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(SELLOUT_REPORT_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Sell Out raporu buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadSellOutReportFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_REPORT_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Sell Out raporu buluttan okunamadı:', err); return null; }
}
async function saveSellOutReportToLocal(rapor){
  const ok = await idbSet(SELLOUT_REPORT_LOCAL_KEY, rapor);
  if(!ok) console.error('Sell Out raporu cihaza kaydedilemedi.');
}
async function loadSellOutReportFromLocal(){
  try{ return await idbGet(SELLOUT_REPORT_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function sellOutYenile(){
  let rapor = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(SELLOUT_REPORT_CLOUD_PATH, loadSellOutReportFromCloud, loadSellOutReportFromLocal);
    rapor = sonuc.data;
  }
  if(!rapor) rapor = await loadSellOutReportFromLocal();
  state.sellOutReport = rapor;
  // GVY panelinde "Son veri" gösterebilmek için — raporun İÇİNE gömülmüş zaman damgası (bkz.
  // sellOutKaydet) buradan (sayfa yeniden yüklendiğinde/senkronize edildiğinde) da okunur.
  if(rapor && rapor.__hesaplanmaZamani) state.sellOutSonGuncelleme = rapor.__hesaplanmaZamani;
  return rapor;
}
async function sellOutKaydet(rapor){
  const zaman = new Date().toISOString();
  rapor = Object.assign({}, rapor, {__hesaplanmaZamani: zaman});
  ktlog('sellOutKaydet → state.sellOutReport yazılıyor. toplamLitre=', rapor && rapor.toplamLitre, 'belgeSayisi=', rapor && rapor.belgeSayisi);
  state.sellOutReport = rapor;
  state.sellOutSonGuncelleme = zaman;
  await saveSellOutReportToLocal(rapor);
  if(cloudEnabled()){
    const sonuc = await saveSellOutReportToCloud(rapor);
    // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez. Kullanıcı
    // isteği: bu durum artık sessiz kalmasın, ana rapor uyarılarıyla aynı tutarlılıkta alert de
    // gösterilsin (konsol logu da korunur).
    if(!sonuc.ok){
      console.error('UYARI: Sell Out raporu buluta kaydedilemedi, hiçbir yerde kalıcı değil:', sonuc.reason);
      alert('UYARI: Sell Out raporu buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
    }
  }
}

async function sellOutRaporuOlustur(){
  const dosya = state.files.sellOut;
  if(!dosya) return; // yeni dosya yüklenmediyse önceden kaydedilmiş rapor korunur
  try{
    const baseRapor = buildSellOutReport(dosya.data, state.musteriMasterMap, state.musteriMasterDurum, state.musteriMasterDetay, state.musteriMasterKanal);
    await sellOutKaydet(baseRapor);
  }catch(err){
    console.error('Sell Out raporu oluşturulamadı:', err);
  }
}

// ============================================================================
// SELL OUT RAPORU — AYLIK ARŞİV
// ============================================================================
// Sell Out raporunun kendisi (SELLOUT_REPORT_CLOUD_PATH) her yüklemede TEK bir yolun üzerine
// yazıldığı için geriye dönük veri tutmuyordu. Bu bölüm, kullanıcının "<i class="fa-solid fa-box-archive" aria-hidden="true"></i> Bu Ayı Arşivle" butonuna
// elle basmasıyla, O ANKİ (hedef overlay uygulanmış) rapor anlık görüntüsünü ayrı bir yola,
// ayKey (YYYY-MM) altında KALICI olarak kaydeder. Otomatik/periyodik bir arşivleme YOKTUR —
// kullanıcı ayın sonunda, o ayın son verisiyken elle "Arşivle"ye basmalıdır. Daha sonra "Dönem"
// filtresinden geçmiş bir ay seçildiğinde, canlı veri yerine o ayın arşivlenmiş anlık görüntüsü
// gösterilir (salt okunur — hedef düzenleme kapalıdır).
async function saveSellOutArsivAyToCloud(ayKey, rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_ARSIV_CLOUD_PATH}/${encodeURIComponent(ayKey)}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Sell Out ay arşivi buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
// Belirli bir aya ait Sell Out arşiv kaydını (hem buluttan hem cihazdaki kopyadan) siler.
// Güncel (canlı) Sell Out verisine (state.sellOutReport, state.files.sellOut, state.sellOutKendiDosya)
// KESİNLİKLE dokunmaz — yalnızca o ayın "Bu Ayı Arşivle" ile daha önce (istenerek veya
// istenmeden/başka bir cihazdan) kaydedilmiş anlık görüntüsünü kaldırır.
async function sellOutArsivAyiSil(ayKey){
  if(cloudEnabled()){
    try{
      const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_ARSIV_CLOUD_PATH}/${encodeURIComponent(ayKey)}.json${await authQuery()}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:'null',
      });
      if(!res.ok) throw new Error('HTTP '+res.status);
    }catch(err){ console.error('Sell Out ay arşivi buluttan silinemedi:', err); throw err; }
  }
  const yeniArsiv = Object.assign({}, state.sellOutArsivCache);
  delete yeniArsiv[ayKey];
  state.sellOutArsivCache = yeniArsiv;
  await saveSellOutArsivToLocal(yeniArsiv);
}
async function loadSellOutArsivFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${SELLOUT_ARSIV_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return {};
    return JSON.parse(text) || {};
  }catch(err){ console.error('Sell Out ay arşivi buluttan okunamadı:', err); return null; }
}
async function saveSellOutArsivToLocal(arsiv){
  const ok = await idbSet(SELLOUT_ARSIV_LOCAL_KEY, arsiv);
  if(!ok) console.error('Sell Out ay arşivi cihaza kaydedilemedi.');
}
async function loadSellOutArsivFromLocal(){
  try{ return (await idbGet(SELLOUT_ARSIV_LOCAL_KEY)) || {}; }catch(err){ console.error(err); return {}; }
}
let sellOutArsivYuklendiMi = false;
async function sellOutArsivYenile(zorla){
  if(sellOutArsivYuklendiMi && !zorla) return state.sellOutArsivCache;
  let arsiv = null;
  if(cloudEnabled()) arsiv = await loadSellOutArsivFromCloud();
  if(!arsiv) arsiv = await loadSellOutArsivFromLocal();
  state.sellOutArsivCache = arsiv || {};
  sellOutArsivYuklendiMi = true;
  await saveSellOutArsivToLocal(state.sellOutArsivCache).catch(()=>{});
  return state.sellOutArsivCache;
}
// ============================================================================
// MODERN KANAL — cloud/local kalıcılık (hedef, güncel rapor, aylık arşiv)
// ============================================================================
// Geleneksel Kanal (Sell Out) ile birebir aynı desen kopyalanmıştır; tek fark, hedefin
// Açık/Kapalı ayrımı olmayan TEK bir "Key Account Hedef" sayısı olmasıdır (modernKanalHedef
// bir obje değil doğrudan sayı olarak saklanır).
const MODERNKANAL_HEDEF_CLOUD_PATH = CLOUD.path + '_modernKanalHedef';
const MODERNKANAL_HEDEF_LOCAL_KEY = 'noktaCariTakip_modernKanalHedef_v1';
const MODERNKANAL_REPORT_CLOUD_PATH = CLOUD.path + '_modernKanalReport';
const MODERNKANAL_REPORT_LOCAL_KEY = 'noktaCariTakip_modernKanalReport_v1';
const MODERNKANAL_ARSIV_CLOUD_PATH = CLOUD.path + '_modernKanalArsiv';
const MODERNKANAL_ARSIV_LOCAL_KEY = 'noktaCariTakip_modernKanalArsiv_v1';

async function saveModernKanalHedefToCloud(deger){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_HEDEF_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(deger),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Modern Kanal hedef buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadModernKanalHedefFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_HEDEF_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Modern Kanal hedef buluttan okunamadı:', err); return null; }
}
async function saveModernKanalHedefToLocal(deger){
  const ok = await idbSet(MODERNKANAL_HEDEF_LOCAL_KEY, deger);
  if(!ok) console.error('Modern Kanal hedef cihaza kaydedilemedi.');
}
async function loadModernKanalHedefFromLocal(){
  try{ return await idbGet(MODERNKANAL_HEDEF_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function modernKanalHedefYenile(){
  let deger = null;
  if(cloudEnabled()) deger = await loadModernKanalHedefFromCloud();
  if(deger==null) deger = await loadModernKanalHedefFromLocal();
  state.modernKanalHedef = Number(deger)||0;
  return state.modernKanalHedef;
}
async function modernKanalHedefKaydet(deger){
  state.modernKanalHedef = Number(deger)||0;
  await saveModernKanalHedefToLocal(state.modernKanalHedef);
  if(cloudEnabled()){
    const sonuc = await saveModernKanalHedefToCloud(state.modernKanalHedef);
    if(!sonuc.ok) throw new Error('Hedef buluta kaydedilemedi (cihaza da kaydedilmiyor): '+(sonuc.reason||'bilinmeyen hata'));
  }
}

async function saveModernKanalReportToCloud(rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_REPORT_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MODERNKANAL_REPORT_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MODERNKANAL_REPORT_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Modern Kanal raporu buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadModernKanalReportFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_REPORT_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Modern Kanal raporu buluttan okunamadı:', err); return null; }
}
async function saveModernKanalReportToLocal(rapor){
  const ok = await idbSet(MODERNKANAL_REPORT_LOCAL_KEY, rapor);
  if(!ok) console.error('Modern Kanal raporu cihaza kaydedilemedi.');
}
async function loadModernKanalReportFromLocal(){
  try{ return await idbGet(MODERNKANAL_REPORT_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function modernKanalYenile(){
  let rapor = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(MODERNKANAL_REPORT_CLOUD_PATH, loadModernKanalReportFromCloud, loadModernKanalReportFromLocal);
    rapor = sonuc.data;
  }
  if(!rapor) rapor = await loadModernKanalReportFromLocal();
  state.modernKanalReport = rapor;
  // GVY panelinde "Son veri" gösterebilmek için — raporun İÇİNE gömülmüş zaman damgası (bkz.
  // modernKanalKaydet) buradan (sayfa yeniden yüklendiğinde/senkronize edildiğinde) da okunur.
  if(rapor && rapor.__hesaplanmaZamani) state.modernKanalSonGuncelleme = rapor.__hesaplanmaZamani;
  return rapor;
}
async function modernKanalKaydet(rapor){
  const zaman = new Date().toISOString();
  rapor = Object.assign({}, rapor, {__hesaplanmaZamani: zaman});
  ktlog('modernKanalKaydet → state.modernKanalReport yazılıyor. toplamLitre=', rapor && rapor.toplamLitre, 'malzemeSayisi=', rapor && rapor.malzemeler && rapor.malzemeler.length);
  state.modernKanalReport = rapor;
  state.modernKanalSonGuncelleme = zaman;
  await saveModernKanalReportToLocal(rapor);
  if(cloudEnabled()){
    const sonuc = await saveModernKanalReportToCloud(rapor);
    // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez. Kullanıcı
    // isteği: bu durum artık sessiz kalmasın, ana rapor uyarılarıyla aynı tutarlılıkta alert de
    // gösterilsin (konsol logu da korunur).
    if(!sonuc.ok){
      console.error('UYARI: Modern Kanal raporu buluta kaydedilemedi, hiçbir yerde kalıcı değil:', sonuc.reason);
      alert('UYARI: Modern Kanal raporu buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
    }
  }
}

async function saveModernKanalArsivAyToCloud(ayKey, rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_ARSIV_CLOUD_PATH}/${encodeURIComponent(ayKey)}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Modern Kanal ay arşivi buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
// Belirli bir aya ait Modern Kanal arşiv kaydını (hem buluttan hem cihazdaki kopyadan) siler.
// Güncel (canlı) Modern Kanal verisine KESİNLİKLE dokunmaz — yalnızca o ayın "Bu Ayı Arşivle"
// ile daha önce (istenerek veya istenmeden/başka bir cihazdan) kaydedilmiş anlık görüntüsünü kaldırır.
async function modernKanalArsivAyiSil(ayKey){
  if(cloudEnabled()){
    try{
      const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_ARSIV_CLOUD_PATH}/${encodeURIComponent(ayKey)}.json${await authQuery()}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:'null',
      });
      if(!res.ok) throw new Error('HTTP '+res.status);
    }catch(err){ console.error('Modern Kanal ay arşivi buluttan silinemedi:', err); throw err; }
  }
  const yeniArsiv = Object.assign({}, state.modernKanalArsivCache);
  delete yeniArsiv[ayKey];
  state.modernKanalArsivCache = yeniArsiv;
  await saveModernKanalArsivToLocal(yeniArsiv);
}
async function loadModernKanalArsivFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MODERNKANAL_ARSIV_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return {};
    return JSON.parse(text) || {};
  }catch(err){ console.error('Modern Kanal ay arşivi buluttan okunamadı:', err); return null; }
}
async function saveModernKanalArsivToLocal(arsiv){
  const ok = await idbSet(MODERNKANAL_ARSIV_LOCAL_KEY, arsiv);
  if(!ok) console.error('Modern Kanal ay arşivi cihaza kaydedilemedi.');
}
async function loadModernKanalArsivFromLocal(){
  try{ return (await idbGet(MODERNKANAL_ARSIV_LOCAL_KEY)) || {}; }catch(err){ console.error(err); return {}; }
}
let modernKanalArsivYuklendiMi = false;
async function modernKanalArsivYenile(zorla){
  if(modernKanalArsivYuklendiMi && !zorla) return state.modernKanalArsivCache;
  let arsiv = null;
  if(cloudEnabled()) arsiv = await loadModernKanalArsivFromCloud();
  if(!arsiv) arsiv = await loadModernKanalArsivFromLocal();
  state.modernKanalArsivCache = arsiv || {};
  modernKanalArsivYuklendiMi = true;
  await saveModernKanalArsivToLocal(state.modernKanalArsivCache).catch(()=>{});
  return state.modernKanalArsivCache;
}

function sellOutBaskinAy(rows){
  const ayCounts = new Map();
  (rows||[]).forEach(r=>{
    const tarih = excelDateToJSArti1Gun(r['Girilen Faturalama Tarihi']);
    if(!tarih) return;
    const ayKey = dateKeyLocal(tarih).slice(0,7);
    ayCounts.set(ayKey, (ayCounts.get(ayKey)||0) + 1);
  });
  let baskinAy = null, maksSayi = 0;
  ayCounts.forEach((sayi, ay)=>{ if(sayi > maksSayi){ maksSayi = sayi; baskinAy = ay; } });
  return baskinAy;
}

// ============================================================================
// MODERN KANAL — İrsaliye Listesi (Key Account/Modern Kanal sevkiyat dökümü)
// ============================================================================
// Geleneksel Kanal (Sell Out) ile aynı "ürün bazlı günlük litre/miktar" mantığını kullanır,
// ama çok daha basittir: temsilci/SSM/kanal ayrımı yok, tek bir "İbrahim Işık" girdisi var,
// tek bir Key Account Hedefi (Açık/Kapalı ayrımsız) girilir. Bu kanalın satışı, tahsilat
// henüz gerçekleşmemiş olsa da anlık tahsil edilmiş kabul edilir; bu yüzden bu fonksiyon
// hiçbir tahsilat/FKNS/DSO hesabına veri üretmez — yalnızca ürün bazlı litre/miktar ve
// toplam litre döndürür (Stok Gün ve genel toplam sayılarda kullanılmak üzere).
function buildIrsaliyeReport(rows){
  let toplamLitre = 0;
  const malzemeGunlukAgg = new Map(); // malzemeKodu -> Map(gunKey -> {litre, miktar})
  const malzemeUrunAdi = new Map();

  (rows||[]).forEach(r=>{
    const litre = Number(r['Litre'])||0;
    const miktar = Number(r['Miktar'])||0;
    const malzemeKodu = String(r['Ürün Kodu']||'').trim();
    const malzemeTnm = String(r['Malzeme kısa metni']||'').trim();
    const tarih = excelDateToJSArti1Gun(r['İrsaliye Tarihi']);
    if(!tarih) return;
    const gk = dateKeyLocal(tarih);
    if(!gk) return;

    toplamLitre += litre;

    // "2" ile başlayan malzeme kodları (ör. 225899) Sell Out'taki ile aynı sebeple hariç
    // tutulur — gerçek stoklu ürün değil, farklı bir kategori (iade/numune/promosyon vb.).
    if(malzemeKodu && !malzemeKodu.startsWith('2')){
      if(!malzemeGunlukAgg.has(malzemeKodu)) malzemeGunlukAgg.set(malzemeKodu, new Map());
      const mg = malzemeGunlukAgg.get(malzemeKodu);
      if(!mg.has(gk)) mg.set(gk, {litre:0, miktar:0});
      const mgGun = mg.get(gk);
      mgGun.litre += litre;
      mgGun.miktar += miktar;
      if(malzemeTnm && !malzemeUrunAdi.has(malzemeKodu)) malzemeUrunAdi.set(malzemeKodu, malzemeTnm);
    }
  });

  const malzemelerDizi = Array.from(malzemeGunlukAgg.entries()).map(([kod, gunMap])=>({
    kod,
    urunAdi: malzemeUrunAdi.get(kod) || kod,
    marka: 'Bira', // İrsaliye Listesi'nde marka/Mal Grubu bilgisi yok; Stok Gün marka filtresi artık sadece Distile/Bira olduğu için bu ürünler Bira grubuna düşer.
    gunler: Array.from(gunMap.entries()).map(([gunKey,v])=>({gunKey, litre:v.litre, miktar:v.miktar})).sort((a,b)=>a.gunKey.localeCompare(b.gunKey)),
  }));

  return { toplamLitre, malzemeler: malzemelerDizi };
}

// İrsaliye dosyasındaki satırların hangi aylara dağıldığını (ayKey -> satır sayısı) döndürür —
// hem "Bu Ayı Arşivle" (baskın ay tespiti) hem "Tüm Ayları Toplu Arşivle" (her ayı ayrı ayrı
// filtreleyip arşivlemek) için kullanılır.
function irsaliyeAylaraGoreGrupla(rows){
  const gruplar = new Map(); // ayKey -> rows[]
  (rows||[]).forEach(r=>{
    const tarih = excelDateToJSArti1Gun(r['İrsaliye Tarihi']);
    if(!tarih) return;
    const ayKey = dateKeyLocal(tarih).slice(0,7);
    if(!gruplar.has(ayKey)) gruplar.set(ayKey, []);
    gruplar.get(ayKey).push(r);
  });
  return gruplar;
}

async function sellOutArsivleButonu(){
  const btn = document.getElementById('sellOutArsivleBtn');
  const baseRapor = state.sellOutReport;
  if(!baseRapor){
    toastGoster('warn', 'Arşivlenecek rapor yok', 'Önce Geleneksel Kanal sekmesinden veya ana yükleme sayfasından dosyayı yükleyip hesaplatın.');
    return;
  }
  const hamVeri = (state.sellOutKendiDosya && state.sellOutKendiDosya.data) || (state.files.sellOut && state.files.sellOut.data);
  const ayKey = (hamVeri && sellOutBaskinAy(hamVeri)) || dateKeyLocal(turkiyeBugun()).slice(0,7);
  const ayEtiket = fmtDate(new Date(ayKey+'-01'));
  const zatenVar = Object.prototype.hasOwnProperty.call(state.sellOutArsivCache||{}, ayKey);
  const soru = zatenVar
    ? (ayEtiket + ' icin arsiv zaten var (dosya icerigine gore bu veri ' + ayEtiket + ' ayina ait). Uzerine yazilsin mi?')
    : ('Dosya icerigine gore bu veri ' + ayEtiket + ' ayina ait gorunuyor. GUNCEL Sell Out verisi bu ayin altina kalici olarak arsivlensin mi?');
  if(!confirm(soru)) return;
  if(!(await ortakSifreDogrula('Bu ayı arşivlemek için şifreyi girin:'))) return;

  btn.disabled = true;
  const eskiText = btn.textContent;
  btn.textContent = 'Arsivleniyor...';
  try{
    const raporSnapshot = Object.assign({}, applySellOutHedef(baseRapor, state.sellOutHedef), {
      arsivAyKey: ayKey,
      arsivZamani: new Date().toISOString(),
    });
    state.sellOutArsivCache = Object.assign({}, state.sellOutArsivCache, {[ayKey]: raporSnapshot});
    await saveSellOutArsivToLocal(state.sellOutArsivCache);
    const sonuc = await saveSellOutArsivAyToCloud(ayKey, raporSnapshot);
    if(!sonuc.ok){
      // Cihaz depolama kapalı (kullanıcı isteği) — bulut yazması başarısız olursa bu arşiv kaydı
      // HİÇBİR YERDE kalıcı DEĞİLDİR, sayfa yenilenirse kaybolur.
      alert('UYARI: Arşiv buluta yazılamadı (' + (sonuc.reason||'bilinmeyen hata') + '). Cihaza da kaydedilmiyor (bu özellik kapalı) — sayfa yenilenirse bu arşiv kaydı kaybolur.');
    }
    populateSellOutAySelect();
    document.getElementById('sellOutAySelect').value = ayKey;
    state.sellOutSeciliAy = ayKey;
    await renderSellOutView();
  }catch(err){
    console.error('Sell Out arsivleme hatasi:', err);
    alert('Arsivleme sirasinda bir hata olustu: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.textContent = eskiText;
  }
}
function populateSellOutAySelect(){
  const sel = document.getElementById('sellOutAySelect');
  const aylar = Object.keys(state.sellOutArsivCache||{}).sort().reverse();
  const mevcutSecim = state.sellOutSeciliAy;
  sel.innerHTML = '<option value="">Güncel (canlı)</option>' + aylar.map(a=>`<option value="${a}">${fmtDate(new Date(a+'-01'))}</option>`).join('');
  sel.value = (mevcutSecim && aylar.includes(mevcutSecim)) ? mevcutSecim : '';
  state.sellOutSeciliAy = sel.value || null;
}

function populateModernKanalAySelect(){
  const sel = document.getElementById('modernKanalAySelect');
  if(!sel) return;
  const aylar = Object.keys(state.modernKanalArsivCache||{}).sort().reverse();
  const mevcutSecim = state.modernKanalSeciliAy;
  sel.innerHTML = '<option value="">Güncel (canlı)</option>' + aylar.map(a=>`<option value="${a}">${fmtDate(new Date(a+'-01'))}</option>`).join('');
  sel.value = (mevcutSecim && aylar.includes(mevcutSecim)) ? mevcutSecim : '';
  state.modernKanalSeciliAy = sel.value || null;
}

// Modern Kanal (İbrahim Işık) için render — Geleneksel Kanal'ın SSM kartıyla aynı görsel
// dilde ama tek bir kişilik: kendi Key Account Hedefi ve kendi toplam litresine göre kendi
// gerçekleşme oranı hesaplanır. Bu değer Toplam LT göstergesinin altında gösterilir.
async function renderModernKanalView(){
  const bosPanel = document.getElementById('modernKanalBosPanel');
  const icerik = document.getElementById('modernKanalIcerik');
  populateModernKanalAySelect();
  const seciliAy = state.modernKanalSeciliAy;
  const baseRapor = state.modernKanalReport;
  ktlog('renderModernKanalView (MODERN ekran) → kaynak state.modernKanalReport. toplamLitre=', baseRapor&&baseRapor.toplamLitre, 'malzemeSayısı=', baseRapor&&baseRapor.malzemeler&&baseRapor.malzemeler.length, 'seçiliAy=', seciliAy||'(canlı)');

  let report, isArsivGoruntuleme;
  if(seciliAy){
    report = state.modernKanalArsivCache[seciliAy] || null;
    isArsivGoruntuleme = true;
    if(!report){
      bosPanel.style.display='block';
      icerik.style.display='none';
      document.getElementById('modernKanalAsOf').textContent = fmtDate(new Date(seciliAy+'-01'))+' ayına ait arşiv verisi bulunamadı.';
      return;
    }
  }else{
    isArsivGoruntuleme = false;
    if(!baseRapor){
      bosPanel.style.display='block';
      icerik.style.display='none';
      document.getElementById('modernKanalAsOf').textContent = 'Veri kaynağı: İrsaliye Listesi (Key Account/Modern Kanal) — henüz yüklenmedi';
      return;
    }
    report = baseRapor;
  }
  bosPanel.style.display='none';
  icerik.style.display='block';

  document.getElementById('modernKanalAsOf').textContent = isArsivGoruntuleme
    ? ('Arşiv: '+fmtDate(new Date(seciliAy+'-01'))+' ayının ('+fmtDate(new Date(report.arsivZamani))+' tarihinde arşivlenmiş) verisi gösteriliyor')
    : 'Veri kaynağı: İrsaliye Listesi (Key Account/Modern Kanal)';

  // Hedef alanı yalnızca güncel/canlı görünümde düzenlenebilir; arşiv görüntülemede salt okunur.
  const hedefInput = document.getElementById('modernKanalHedefInput');
  const hedefPanel = document.getElementById('modernKanalHedefPanel');
  if(hedefPanel) hedefPanel.style.display = isArsivGoruntuleme ? 'none' : 'block';
  if(hedefInput && !isArsivGoruntuleme) hedefInput.value = state.modernKanalHedef || '';

  const hedef = isArsivGoruntuleme ? (report.hedefAnlikGoruntu||0) : (state.modernKanalHedef||0);
  const toplamLitre = report.toplamLitre||0;
  const gercek = hedef>0 ? (toplamLitre/hedef*100) : null;
  const renk = sellOutRenk(gercek);

  document.getElementById('modernKanalKartGrid').innerHTML = `
    <div class="ssm-karne-card" style="border-left:4px solid ${renk};">
      <div class="ssm-karne-top">
        <div class="cust-avatar">${escapeHtml(avatarBaslangic('İbrahim Işık'))}</div>
        <div>
          <div class="ssm-karne-name">İBRAHİM IŞIK <span class="badge ssm-hiyerarsi-badge"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Key Account</span></div>
          <div class="ssm-karne-sub">Modern Kanal</div>
        </div>
        <div class="ssm-fkns-ring-wrap">
          ${fknsRingSvg(gercek)}
          <div class="ssm-fkns-ring-label">Hedef</div>
        </div>
      </div>
      ${ssmKanalRowHtml('Toplam Litre', toplamLitre, hedef, 'fa-boxes-stacked')}
      <div class="ssm-karne-foot">
        <span class="g-lbl">Hedef Gerçekleşme</span>
        <span class="g-val" style="color:${renk};">${gercek!=null ? fmtYuzde(gercek) : '—'}</span>
      </div>
    </div>`;
}

function sellOutRenk(oran){
  return performansRenk(oran, {iyi:90, orta:75, ortaRenk:'var(--warn)'});
}
// sellOutRenk ile aynı eşiklere göre, katı renk yerine "soft" (açık tonlu) zemin rengi döner —
// rozet/ikon arka planlarında kullanılır (örn. temsilci kartındaki #sıra rozeti ve kanal ikonları).
function sellOutRenkSoft(oran){
  return performansRenk(oran, {iyi:90, orta:75, iyiRenk:'var(--success-soft)', ortaRenk:'var(--warn-soft)', dusukRenk:'var(--danger-soft)'});
}

// FKNS (ya da Genel FKNS) oranını gösteren dairesel gösterge (donut) — SSM Karneleri ve Temsilci
// Karnesi kartlarında birebir aynı görselle kullanılır. Çevre uzunluğu r=16 için ~100 birim olduğundan
// stroke-dasharray doğrudan yüzde değeriyle eşleşir.
function fknsRingSvg(oran){
  const renk = sellOutRenk(oran);
  const deger = oran==null ? 0 : Math.max(0, Math.min(100, oran));
  const metin = oran==null ? '—' : '%'+Math.round(oran);
  return `<svg class="ssm-fkns-ring" viewBox="0 0 36 36">
    <path d="M18 2a16 16 0 0 1 0 32 16 16 0 0 1 0-32" fill="none" stroke="#EEF2F7" stroke-width="4"/>
    <path d="M18 2a16 16 0 0 1 0 32 16 16 0 0 1 0-32" fill="none" style="stroke:${renk}" stroke-width="4" stroke-dasharray="${deger} 100" stroke-linecap="round"/>
    <text x="18" y="21" font-size="9" font-weight="700" fill="#152238" text-anchor="middle" font-family="Space Grotesk">${escapeHtml(metin)}</text>
  </svg>`;
}

// Temsilci Karnesi kartlarında tek FKNS halkası yerine Açık Kanal / Kapalı Kanal / Toplam olmak
// üzere yan yana 3 küçük halka gösterir. Aynı fknsRingSvg() motoru kullanılır (yeniden çizim
// yerine sadece boyutu küçültülür), her halkanın altına kısa etiketi yazılır.
function fknsRingUcluSvg(acikOran, kapaliOran, toplamOran){
  const halka = (oran, etiket)=> `
    <div class="ssm-fkns-ring-item">
      ${fknsRingSvg(oran)}
      <div class="ssm-fkns-ring-label">${escapeHtml(etiket)}</div>
    </div>`;
  return `<div class="ssm-fkns-ring-trio">
    ${halka(acikOran, 'Açık FKNS')}
    ${halka(kapaliOran, 'Kapalı FKNS')}
    ${halka(toplamOran, 'Toplam FKNS')}
  </div>`;
}

// Açık/Kapalı Kanal ilerleme satırı — hedef girilmemişse (0) sadece satış litresi gösterilir.
// Hedef girilmişse, çubuğun altında kalan (hedef-satış, negatifse 0) litre bilgisi de gösterilir.
function ssmKanalRowHtml(label, satis, hedef, icon){
  const hedefVarMi = hedef>0;
  const pct = hedefVarMi ? Math.min(100, satis/hedef*100) : 0;
  const renk = hedefVarMi ? sellOutRenk(pct) : 'var(--ink-faint)';
  const renkSoft = hedefVarMi ? sellOutRenkSoft(pct) : 'var(--line-soft)';
  const valTxt = hedefVarMi ? `${NUM(satis)} / ${NUM(hedef)} Lt.` : `${LT(satis)} <small>· hedef yok</small>`;
  const kalanTxt = hedefVarMi ? `<div class="ssm-kanal-kalan">Kalan ${LT(Math.max(0, hedef-satis))}</div>` : '';
  const iconHtml = icon ? `<span class="ssm-kanal-icon" style="background:${renkSoft};color:${renk};"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>` : '';
  return `<div class="ssm-kanal-row">
    <div class="ssm-kanal-top"><span class="lbl">${iconHtml}${escapeHtml(label)}</span><span class="val">${valTxt}</span></div>
    <div class="ssm-kanal-track"><div class="ssm-kanal-fill" style="width:${pct.toFixed(1)}%;background:${renk};"></div></div>
    ${kalanTxt}
  </div>`;
}

// Açık/Kapalı Kanal LT özeti — hem Sell Out Raporu'nun kendi üst KPI şeridi hem Genel Bakış'ın
// "Güncel Durum" kartı bu TEK fonksiyonu çağırır; böylece iki yerde ayrı hesap yapılıp
// aralarında tutarsızlık (farklı formül/eksik hedef verisi vb.) oluşma riski kalmaz.
// NOT: `report` zaten applySellOutHedef uygulanmış (acikHedef/kapaliHedef dolu) olmalı —
// bu fonksiyon sadece o veriden özet çıkarır, hedef eşlemesini kendisi yapmaz (arşiv
// görüntülemede hedefler arşivleme anındaki değerle donmuş kalmalı, güncel hedefle ezilmemeli).
function sellOutKanalOzeti(report){
  if(!report || !Array.isArray(report.temsilciler)){
    return {toplamAcikLitre:0, toplamKapaliLitre:0, acikKalan:0, kapaliKalan:0, gerceklesmeOrani:null, toplamLitre:0};
  }
  const toplamAcikLitre = report.temsilciler.reduce((a,t)=>a+t.acikLitre,0);
  const toplamKapaliLitre = report.temsilciler.reduce((a,t)=>a+t.kapaliLitre,0);
  const toplamAcikHedef = report.temsilciler.reduce((a,t)=>a+t.acikHedef,0);
  const toplamKapaliHedef = report.temsilciler.reduce((a,t)=>a+t.kapaliHedef,0);
  const acikKalan = Math.max(0, toplamAcikHedef - toplamAcikLitre);
  const kapaliKalan = Math.max(0, toplamKapaliHedef - toplamKapaliLitre);
  const toplamHedef = toplamAcikHedef + toplamKapaliHedef;
  const gerceklesmeOrani = toplamHedef>0 ? ((toplamAcikLitre+toplamKapaliLitre)/toplamHedef*100) : null;
  return {toplamAcikLitre, toplamKapaliLitre, acikKalan, kapaliKalan, gerceklesmeOrani, toplamLitre: report.toplamLitre||0};
}
