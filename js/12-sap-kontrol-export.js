/* =====================================================================
   SAP KONTROL EXPORT
   ---------------------------------------------------------------------
   Amaç: Kullanıcının seçtiği tarih aralığındaki TÜM hareketleri (satış
   faturaları, normal tahsilat, iade/depozito, bayi hakediş, çek/senet)
   temsilci bilgisiyle birlikte tek bir Excel dosyasına döker — SAP ile
   karşılıklı mutabakat/kontrol amaçlı (arşiv eksiksiz mi, tahsilat/
   faturada eksik var mı vb.).

   Kaynaklar (kullanıcı arşivleriyle BİREBİR AYNI, ayrıca hesaplama YOK):
     - Fatura            : birlesikArsiv.faturaArsiv            (faturaTarihi)
     - Normal Tahsilat    : state.tahsilatArsivi (tahsilatKategori='Normal') (tarih)
     - İade/Depozito      : birlesikArsiv.tahsilatArsiv (formatKaynagi='FaturaIade') (belgeTarihi)
     - Bayi Hakediş       : birlesikArsiv.bayiHakedisArsiv       (tahsilatTarihi)
     - Çek/Senet          : state.cekSenetArsivi                (belgeTarihi)
     - Bilgi amaçlı ayrıca: Ödeme/Virman (tahsilat değil, bakiye aktarımı — SAP mutabakatını
       şaşırtmasın diye ayrı bir sekmede, ana toplamların DIŞINDA gösterilir)

   Temsilci ataması: Fatura zaten kendi temsilcisini taşıyor. Diğer tüm
   kaynaklarda (Tahsilat, İade/Depozito, Hakediş, Çek/Senet) temsilci
   bilgisi arşivde YOKTUR — state.musteriMasterMap (müşteri kodu -> temsilci)
   üzerinden eşleştirilir (kullanıcı onayı: 23.07.2026).
   ===================================================================== */

function sapKontrolExportModalAc(){
  const overlay = document.getElementById('sapKontrolExportModalOverlay');
  if(!overlay) return;
  const ozet = document.getElementById('sapKontrolExportOzet');
  const uyari = document.getElementById('sapKontrolExportUyari');
  if(ozet) ozet.style.display = 'none';
  if(uyari) uyari.style.display = 'none';
  overlay.classList.add('open');
}
function sapKontrolExportModalKapat(){
  const overlay = document.getElementById('sapKontrolExportModalOverlay');
  if(overlay) overlay.classList.remove('open');
}

// YYYY-MM-DD -> Date (yerel gün başlangıcı, saat dilimi kaymasına karşı Date(y,m,d) ile).
function sapKontrolTarihKeyToDate(key, gunSonu){
  if(!key) return null;
  const [y,m,d] = key.split('-').map(Number);
  if(!y || !m || !d) return null;
  return gunSonu ? new Date(y, m-1, d, 23,59,59,999) : new Date(y, m-1, d, 0,0,0,0);
}

// Bir kaydın tarihinin [baslangicKey, bitisKey] aralığında (dahil-dahil) olup olmadığını,
// dateKeyLocal karşılaştırmasıyla (saat dilimi kaymasına karşı en güvenli yöntem) kontrol eder.
function sapKontrolTarihAralikta(tarih, baslangicKey, bitisKey){
  if(!(tarih instanceof Date) || isNaN(tarih)) return false;
  const gk = dateKeyLocal(tarih);
  if(!gk) return false;
  return gk >= baslangicKey && gk <= bitisKey;
}

function sapKontrolTemsilciBul(musteriKod, yedekTemsilci){
  const m = (state.musteriMasterMap && state.musteriMasterMap.get(musteriKod)) || null;
  return m || yedekTemsilci || '—';
}

/* ---------------------------------------------------------------------
   Her kategori için ham arşivden, verilen tarih aralığına düşen satırları
   ortak bir şekle ({tarih, musteriKod, musteriAdi, temsilci, tutar, ...})
   çevirir. Hiçbir toplama/özet hesaplaması burada YAPILMAZ — bu bilinçli
   bir tercih: export'un amacı SAP ile satır satır mutabakat, dolayısıyla
   kullanıcının arşivinde ne varsa AYNEN o görünmeli.
   --------------------------------------------------------------------- */
async function sapKontrolExportVeriTopla(baslangicKey, bitisKey){
  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache || {});

  // GÜVENLİK AĞI (kullanıcı bulgusu — 23.07.2026): Uygulama açılışında state.tahsilatArsivi ve
  // state.cekSenetArsivi bulut/IndexedDB'den ASENKRON ve 18 sn TIMEOUT'LU olarak yükleniyor
  // (bkz. 03-veri-yukleme-ve-senkron.js açılış Promise.all'ı, zamanAsimliYaris). Arşiv büyüdükçe
  // bu okuma süresi uzayabiliyor; süre dolarsa state alanı BOŞ/eski kalabiliyor ama uygulamanın
  // geri kalanı (Fatura, Bayi Hakediş gibi ayrı kaynaklardan gelenler) normal görünmeye devam
  // ediyor — export'ta yalnızca Tahsilat/Hakediş Mahsup/Ödeme-Virman/Çek-Senet sütunlarının hep
  // 0 çıkmasına yol açan sessiz bir veri kaybı. Export'un doğruluğu SAP mutabakatı için kritik
  // olduğundan, burada state'e KÖRÜ KÖRÜNE güvenmek yerine, her çalıştırmada arşivler DOĞRUDAN
  // buluttan/cihazdan TAZE okunur (aynı fonksiyonlar, ama timeout'suz — export zaten kullanıcının
  // bilinçli beklediği bir işlem, açılış performansı kaygısı burada geçerli değil).
  const [tazeTahsilatArsivi, tazeCekSenetArsivi] = await Promise.all([
    tahsilatArsiviniOku().catch(()=> state.tahsilatArsivi || {}),
    cekSenetArsiviniOku().catch(()=> state.cekSenetArsivi || {}),
  ]);
  // Taze okuma state'i de günceller — ekranın geri kalanı da (Fatura Kontrol, Trend Analizi vb.)
  // bundan sonra doğru veriyi görsün diye. Boş/null dönerse mevcut state korunur (geriye gitmez).
  if(tazeTahsilatArsivi && Object.keys(tazeTahsilatArsivi).length) state.tahsilatArsivi = tazeTahsilatArsivi;
  if(tazeCekSenetArsivi && Object.keys(tazeCekSenetArsivi).length) state.cekSenetArsivi = tazeCekSenetArsivi;
  const tahsilatKaynagi = (state.tahsilatArsivi && Object.keys(state.tahsilatArsivi).length) ? state.tahsilatArsivi : tazeTahsilatArsivi;
  const cekSenetKaynagi = (state.cekSenetArsivi && Object.keys(state.cekSenetArsivi).length) ? state.cekSenetArsivi : tazeCekSenetArsivi;

  // 1) SATIŞ FATURALARI
  const faturalar = (birlesikArsiv.faturaArsiv||[])
    .filter(r=> r.faturaTarihi && sapKontrolTarihAralikta(new Date(r.faturaTarihi), baslangicKey, bitisKey))
    .map(r=>({
      tarih: new Date(r.faturaTarihi), musteriKod: r.musteri, musteriAdi: r.musteriAdi||r.musteri,
      temsilci: sapKontrolTemsilciBul(r.musteri, r.temsilci),
      belgeNo: r.belgeNo||'', tutar: r.tutar||0, litre: r.litre||0,
    }))
    .sort((a,b)=> a.tarih-b.tarih);

  // 2) NORMAL TAHSİLAT (Müşteri Tahsilat belge türü — Ödeme/Virman/Hakediş HARİÇ)
  const normalTahsilat = [];
  // 6) ÖDEME/VİRMAN (bilgi amaçlı, tahsilat toplamlarına dahil edilmez)
  const odemeVirman = [];
  Object.values(tahsilatKaynagi||{}).forEach(r=>{
    if(!r.tarih) return;
    const tarih = new Date(r.tarih);
    if(!sapKontrolTarihAralikta(tarih, baslangicKey, bitisKey)) return;
    if(r.tahsilatKategori === 'Hakedis') return; // ayrı ele alınıyor (Bayi Hakediş sekmesinde DEĞİL — bkz. not aşağıda)
    const satir = {
      tarih, musteriKod: r.musteriKod, musteriAdi: r.musteriAdi||r.musteriKod,
      temsilci: sapKontrolTemsilciBul(r.musteriKod, r.satisTemsilcisi),
      belgeNo: r.belgeNo||'', tutar: r.tutar||0, odemeTuru: r.odemeEtiketi||'', belgeTipi: r.belgeTipi||'',
      tahsilatKategori: r.tahsilatKategori||'',
    };
    if(r.tahsilatKategori === 'Odeme' || r.tahsilatKategori === 'Virman') odemeVirman.push(satir);
    else normalTahsilat.push(satir);
  });
  normalTahsilat.sort((a,b)=> a.tarih-b.tarih);
  odemeVirman.sort((a,b)=> a.tarih-b.tarih);

  // 3) İADE / DEPOZİTO (Bozuk İade, Sağlam İade, Depozito İade Faturası — tek grup)
  const iadeDepozito = (birlesikArsiv.tahsilatArsiv||[])
    .filter(r=> r.formatKaynagi==='FaturaIade' && r.belgeTarihi && sapKontrolTarihAralikta(new Date(r.belgeTarihi), baslangicKey, bitisKey))
    .map(r=>({
      tarih: new Date(r.belgeTarihi), musteriKod: r.musteri, musteriAdi: r.musteriAdi||r.musteri,
      temsilci: sapKontrolTemsilciBul(r.musteri, null), tutar: r.tutar||0,
    }))
    .sort((a,b)=> a.tarih-b.tarih);

  // 4) BAYİ HAKEDİŞ (Bayi Hak Ediş dosyasından — Tahsilat Dökümü'ndeki "Hizmet Alış Fatura"
  //    (tahsilatKategori='Hakedis') bilinçli olarak burada tekrarlanmıyor: aynı hakediş tutarının
  //    iki farklı kaynaktan iki kez sayılmasını önlemek için Bayi Hak Ediş dosyası TEK kaynak
  //    kabul edilir. Tahsilat Dökümü'ndeki Hakediş satırları yukarıda "normalTahsilat" ve
  //    "odemeVirman" listelerinin İKİSİNE de dahil EDİLMEMİŞTİR (satır 78'deki filtre), ayrı
  //    bir "Hakediş Mahsup (Tahsilat Dökümü)" sekmesinde bilgi amaçlı ayrıca listelenir.
  const bayiHakedis = (birlesikArsiv.bayiHakedisArsiv||[])
    .filter(r=> r.tahsilatTarihi && sapKontrolTarihAralikta(new Date(r.tahsilatTarihi), baslangicKey, bitisKey))
    .map(r=>({
      tarih: new Date(r.tahsilatTarihi), musteriKod: r.musteri, musteriAdi: r.musteriAdi||r.musteri,
      temsilci: sapKontrolTemsilciBul(r.musteri, null), tutar: r.tutar||0, efpaSipNo: r.efpaSipNo||'',
    }))
    .sort((a,b)=> a.tarih-b.tarih);

  // 4b) HAKEDİŞ MAHSUP (Tahsilat Dökümü'ndeki "Hizmet Alış Fatura" satırları — bilgi amaçlı)
  const hakedisMahsup = [];
  Object.values(tahsilatKaynagi||{}).forEach(r=>{
    if(r.tahsilatKategori !== 'Hakedis') return;
    if(!r.tarih) return;
    const tarih = new Date(r.tarih);
    if(!sapKontrolTarihAralikta(tarih, baslangicKey, bitisKey)) return;
    hakedisMahsup.push({
      tarih, musteriKod: r.musteriKod, musteriAdi: r.musteriAdi||r.musteriKod,
      temsilci: sapKontrolTemsilciBul(r.musteriKod, r.satisTemsilcisi),
      belgeNo: r.belgeNo||'', tutar: r.tutar||0,
    });
  });
  hakedisMahsup.sort((a,b)=> a.tarih-b.tarih);

  // 5) ÇEK / SENET (kalıcı risk arşivi — belge tarihine göre; hem 'risk' hem 'tahsilEdildi'
  //    durumundakiler dahildir, durum ayrı bir sütunda gösterilir).
  const cekSenet = Object.values(cekSenetKaynagi||{})
    .filter(r=> r.belgeTarihi && sapKontrolTarihAralikta(new Date(r.belgeTarihi), baslangicKey, bitisKey))
    .map(r=>({
      tarih: new Date(r.belgeTarihi), musteriKod: r.musteriKod, musteriAdi: r.musteriAdi||r.musteriKod,
      temsilci: sapKontrolTemsilciBul(r.musteriKod, null),
      no: r.no||'', tur: r.tahsilatTuru==='Cek'?'Çek':(r.tahsilatTuru==='Senet'?'Senet':(r.odemeTipiHam||'—')),
      tutar: r.tutar||0, vadeTarihi: r.vadeTarihi ? new Date(r.vadeTarihi) : null,
      durum: r.durum==='tahsilEdildi' ? 'Tahsil Edildi' : 'Risk (Bekliyor)',
    }))
    .sort((a,b)=> a.tarih-b.tarih);

  return {faturalar, normalTahsilat, iadeDepozito, bayiHakedis, hakedisMahsup, odemeVirman, cekSenet};
}

function sapKontrolExportToplam(dizi){ return dizi.reduce((a,r)=> a+(r.tutar||0), 0); }

/* ---------------------------------------------------------------------
   Excel'e yazma. Talep edilen yapı: ÖZET sekmesi (temsilci x kategori
   kırılımlı tutarlar) + her kategori için ayrı DETAY sekmesi. Görsel biçimlendirme
   (renk/kalınlık/kenarlık/para formatı) xlsx-js-style ile uygulanır — uygulamanın kendi
   lacivert/altın temasıyla (bkz. styles.css --navy/--accent) tutarlı tutulur.
   --------------------------------------------------------------------- */
const SAP_RENK = {
  navy: '13233F', navyText: 'FFFFFF',
  accent: '8A6D1F', accentSoft: 'F1E6C9',
  navySoft: 'E3E8F2',
  cizgi: 'D7DCE6', beyaz: 'FFFFFF', gri: 'F7F8FB',
  kirmizi: 'B42318',
};

const SAP_STIL = {
  baslikAna: { font:{name:'Calibri', sz:13, bold:true, color:{rgb:SAP_RENK.navyText}}, fill:{fgColor:{rgb:SAP_RENK.navy}}, alignment:{vertical:'center', horizontal:'left'} },
  tabloBaslik: {
    font:{name:'Calibri', sz:10.5, bold:true, color:{rgb:SAP_RENK.navyText}},
    fill:{fgColor:{rgb:SAP_RENK.navy}},
    alignment:{vertical:'center', horizontal:'center', wrapText:true},
    border:{ top:{style:'thin',color:{rgb:SAP_RENK.navy}}, bottom:{style:'thin',color:{rgb:SAP_RENK.navy}}, left:{style:'thin',color:{rgb:SAP_RENK.navy}}, right:{style:'thin',color:{rgb:SAP_RENK.navy}} },
  },
  hucreTek: (numFmt) => ({
    font:{name:'Calibri', sz:10.5, color:{rgb:'1F2A3C'}},
    fill:{fgColor:{rgb:SAP_RENK.beyaz}},
    alignment:{vertical:'center', horizontal: numFmt?'right':'left'},
    border:{ bottom:{style:'thin',color:{rgb:SAP_RENK.cizgi}}, left:{style:'thin',color:{rgb:SAP_RENK.cizgi}}, right:{style:'thin',color:{rgb:SAP_RENK.cizgi}} },
    numFmt: numFmt||undefined,
  }),
  hucreCift: (numFmt) => ({
    font:{name:'Calibri', sz:10.5, color:{rgb:'1F2A3C'}},
    fill:{fgColor:{rgb:SAP_RENK.gri}},
    alignment:{vertical:'center', horizontal: numFmt?'right':'left'},
    border:{ bottom:{style:'thin',color:{rgb:SAP_RENK.cizgi}}, left:{style:'thin',color:{rgb:SAP_RENK.cizgi}}, right:{style:'thin',color:{rgb:SAP_RENK.cizgi}} },
    numFmt: numFmt||undefined,
  }),
  toplamSatir: (numFmt) => ({
    font:{name:'Calibri', sz:10.5, bold:true, color:{rgb:SAP_RENK.navy}},
    fill:{fgColor:{rgb:SAP_RENK.accentSoft}},
    alignment:{vertical:'center', horizontal: numFmt?'right':'left'},
    border:{ top:{style:'thin',color:{rgb:SAP_RENK.accent}}, bottom:{style:'thin',color:{rgb:SAP_RENK.accent}}, left:{style:'thin',color:{rgb:SAP_RENK.cizgi}}, right:{style:'thin',color:{rgb:SAP_RENK.cizgi}} },
    numFmt: numFmt||undefined,
  }),
};

const SAP_PARA_FMT = '#,##0.00" ₺"';
const SAP_TARIH_FMT = 'dd.mm.yyyy';

function sapKontrolHucre(deger, stil){
  if(deger instanceof Date){
    return { v: deger, t:'d', s: stil, z: SAP_TARIH_FMT };
  }
  if(typeof deger === 'number'){
    return { v: deger, t:'n', s: stil };
  }
  return { v: (deger==null?'':String(deger)), t:'s', s: stil };
}

// Verilen satırları (obje dizisi) sütun tanımlarıyla ({baslik, alan, tip:'metin'|'tutar'|'tarih'|'sayi'})
// stil uygulanmış bir worksheet'e çevirir. Zebra deseni (bir alt bir üst satır rengi farkı)
// burada tek noktadan uygulanır.
function sapKontrolWorksheetOlustur(satirlar, sutunlar){
  const ws = {};
  const range = { s:{r:0,c:0}, e:{r:satirlar.length, c:sutunlar.length-1} };

  sutunlar.forEach((sut, ci)=>{
    const adres = XLSX.utils.encode_cell({r:0, c:ci});
    ws[adres] = sapKontrolHucre(sut.baslik, SAP_STIL.tabloBaslik);
  });

  satirlar.forEach((satir, ri)=>{
    const ciftMi = ri % 2 === 1;
    sutunlar.forEach((sut, ci)=>{
      const adres = XLSX.utils.encode_cell({r:ri+1, c:ci});
      const numFmt = sut.tip==='tutar' ? SAP_PARA_FMT : (sut.tip==='sayi' ? '#,##0' : undefined);
      const stilFn = ciftMi ? SAP_STIL.hucreCift : SAP_STIL.hucreTek;
      ws[adres] = sapKontrolHucre(satir[sut.alan], stilFn(numFmt));
    });
  });

  ws['!ref'] = XLSX.utils.encode_range(range);
  ws['!cols'] = sutunlar.map(s=>({wch: s.genislik||16}));
  ws['!rows'] = [{hpt:22}];
  return ws;
}

function sapKontrolExportExcelOlustur(veri, baslangicKey, bitisKey){
  if(typeof XLSX === 'undefined'){
    throw new Error('Biçimlendirme kütüphanesi (xlsx-js-style) yüklenemedi.');
  }
  const wb = XLSX.utils.book_new();
  const tarihFmt = d => d instanceof Date && !isNaN(d) ? d.toLocaleDateString('tr-TR') : '';

  const kategoriler = [
    {key:'faturalar', ad:'Satış Faturası'},
    {key:'normalTahsilat', ad:'Normal Tahsilat'},
    {key:'iadeDepozito', ad:'İade / Depozito'},
    {key:'bayiHakedis', ad:'Bayi Hakediş'},
    {key:'hakedisMahsup', ad:'Hakediş Mahsup'},
    {key:'cekSenet', ad:'Çek/Senet'},
    {key:'odemeVirman', ad:'Ödeme/Virman (bilgi)'},
  ];

  // ================= ÖZET SEKMESİ =================
  const temsilciSet = new Set();
  kategoriler.forEach(k=> (veri[k.key]||[]).forEach(r=> temsilciSet.add(r.temsilci||'—')));
  const temsilciler = Array.from(temsilciSet).sort((a,b)=> a.localeCompare(b,'tr'));

  const ozetWs = {};
  const ozetSutunSayisi = kategoriler.length + 2; // Temsilci + kategoriler + Genel Toplam
  let satirNo = 0;

  // Başlık bandı (birleştirilmiş, lacivert zemin, beyaz kalın yazı)
  ozetWs[XLSX.utils.encode_cell({r:satirNo,c:0})] = sapKontrolHucre(
    `SAP KONTROL EXPORT  —  ${tarihFmt(sapKontrolTarihKeyToDate(baslangicKey))}  –  ${tarihFmt(sapKontrolTarihKeyToDate(bitisKey))}`,
    SAP_STIL.baslikAna);
  const merges = [{ s:{r:0,c:0}, e:{r:0,c:ozetSutunSayisi-1} }];
  satirNo += 2;

  const ozetBaslikSatiri = satirNo;
  const ozetBaslikHucreleri = ['Temsilci', ...kategoriler.map(k=>k.ad), 'Genel Toplam (Fatura hariç)'];
  ozetBaslikHucreleri.forEach((h,ci)=>{
    ozetWs[XLSX.utils.encode_cell({r:ozetBaslikSatiri,c:ci})] = sapKontrolHucre(h, SAP_STIL.tabloBaslik);
  });
  satirNo++;

  const genelToplam = {}; kategoriler.forEach(k=> genelToplam[k.key]=0);
  temsilciler.forEach((t, ti)=>{
    let toplamHaricFatura = 0;
    const ciftMi = ti % 2 === 1;
    const stilFn = ciftMi ? SAP_STIL.hucreCift : SAP_STIL.hucreTek;
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:0})] = sapKontrolHucre(t, stilFn());
    kategoriler.forEach((k, ci)=>{
      const tutar = sapKontrolExportToplam((veri[k.key]||[]).filter(r=> (r.temsilci||'—')===t));
      genelToplam[k.key] += tutar;
      if(k.key!=='faturalar' && k.key!=='odemeVirman') toplamHaricFatura += tutar;
      ozetWs[XLSX.utils.encode_cell({r:satirNo,c:ci+1})] = sapKontrolHucre(tutar, stilFn(SAP_PARA_FMT));
    });
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:ozetSutunSayisi-1})] = sapKontrolHucre(toplamHaricFatura, stilFn(SAP_PARA_FMT));
    satirNo++;
  });

  // TOPLAM satırı (altın vurgu)
  let genelHaricFatura = 0;
  ozetWs[XLSX.utils.encode_cell({r:satirNo,c:0})] = sapKontrolHucre('TOPLAM', SAP_STIL.toplamSatir());
  kategoriler.forEach((k, ci)=>{
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:ci+1})] = sapKontrolHucre(genelToplam[k.key], SAP_STIL.toplamSatir(SAP_PARA_FMT));
    if(k.key!=='faturalar' && k.key!=='odemeVirman') genelHaricFatura += genelToplam[k.key];
  });
  ozetWs[XLSX.utils.encode_cell({r:satirNo,c:ozetSutunSayisi-1})] = sapKontrolHucre(genelHaricFatura, SAP_STIL.toplamSatir(SAP_PARA_FMT));
  const toplamSatirNo = satirNo;
  satirNo += 2;

  // Kayıt sayıları mini tablo
  ozetWs[XLSX.utils.encode_cell({r:satirNo,c:0})] = sapKontrolHucre('Kayıt Sayıları', SAP_STIL.baslikAna);
  merges.push({ s:{r:satirNo,c:0}, e:{r:satirNo,c:2} });
  satirNo++;
  ['Kategori','Kayıt Sayısı','Toplam Tutar'].forEach((h,ci)=>{
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:ci})] = sapKontrolHucre(h, SAP_STIL.tabloBaslik);
  });
  satirNo++;
  kategoriler.forEach((k, ki)=>{
    const ciftMi = ki % 2 === 1;
    const stilFn = ciftMi ? SAP_STIL.hucreCift : SAP_STIL.hucreTek;
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:0})] = sapKontrolHucre(k.ad, stilFn());
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:1})] = sapKontrolHucre((veri[k.key]||[]).length, stilFn());
    ozetWs[XLSX.utils.encode_cell({r:satirNo,c:2})] = sapKontrolHucre(sapKontrolExportToplam(veri[k.key]||[]), stilFn(SAP_PARA_FMT));
    satirNo++;
  });

  ozetWs['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:satirNo, c:ozetSutunSayisi-1}});
  ozetWs['!cols'] = [{wch:22}, ...kategoriler.map(()=>({wch:17})), {wch:22}];
  ozetWs['!merges'] = merges;
  ozetWs['!rows'] = [{hpt:24}];
  XLSX.utils.book_append_sheet(wb, ozetWs, 'Özet');

  // ================= DETAY SEKMELERİ =================
  function detaySekmeEkle(adi, satirlar, sutunlar){
    const ws = sapKontrolWorksheetOlustur(satirlar, sutunlar);
    const guvenliAd = adi.slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, guvenliAd);
  }

  detaySekmeEkle('Satış Faturası', veri.faturalar, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Fatura No', alan:'belgeNo', genislik:16},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
    {baslik:'Litre', alan:'litre', tip:'sayi', genislik:12},
  ]);

  detaySekmeEkle('Normal Tahsilat', veri.normalTahsilat, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Belge No', alan:'belgeNo', genislik:16},
    {baslik:'Ödeme Türü', alan:'odemeTuru', genislik:16},
    {baslik:'Belge Tipi', alan:'belgeTipi', genislik:14},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
  ]);

  detaySekmeEkle('İade-Depozito', veri.iadeDepozito, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
  ]);

  detaySekmeEkle('Bayi Hakediş', veri.bayiHakedis, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Efpa Sip No', alan:'efpaSipNo', genislik:16},
    {baslik:'Tutar (KDV Dahil)', alan:'tutar', tip:'tutar', genislik:18},
  ]);

  detaySekmeEkle('Hakediş Mahsup', veri.hakedisMahsup, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Belge No', alan:'belgeNo', genislik:16},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
  ]);

  detaySekmeEkle('Çek-Senet', veri.cekSenet, [
    {baslik:'Belge Tarihi', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'No', alan:'no', genislik:12},
    {baslik:'Tür', alan:'tur', genislik:10},
    {baslik:'Vade Tarihi', alan:'vadeTarihi', tip:'tarih', genislik:13},
    {baslik:'Durum', alan:'durum', genislik:16},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
  ]);

  detaySekmeEkle('Ödeme-Virman (bilgi)', veri.odemeVirman, [
    {baslik:'Tarih', alan:'tarih', tip:'tarih', genislik:13},
    {baslik:'Müşteri Kodu', alan:'musteriKod', genislik:14},
    {baslik:'Müşteri Adı', alan:'musteriAdi', genislik:30},
    {baslik:'Temsilci', alan:'temsilci', genislik:18},
    {baslik:'Belge No', alan:'belgeNo', genislik:16},
    {baslik:'Kategori', alan:'tahsilatKategori', genislik:14},
    {baslik:'Tutar', alan:'tutar', tip:'tutar', genislik:16},
  ]);

  return wb;
}

function sapKontrolExportDosyaIndir(wb, baslangicKey, bitisKey){
  const dosyaAdi = `SAP_Kontrol_Export_${baslangicKey}_${bitisKey}.xlsx`;
  XLSX.writeFile(wb, dosyaAdi);
}


async function sapKontrolExportCalistir(){
  const btn = document.getElementById('sapKontrolExportCalistirBtn');
  const uyari = document.getElementById('sapKontrolExportUyari');
  const ozetEl = document.getElementById('sapKontrolExportOzet');
  const baslangicKey = document.getElementById('sapKontrolExportBaslangic').value;
  const bitisKey = document.getElementById('sapKontrolExportBitis').value;

  if(uyari) uyari.style.display = 'none';
  if(ozetEl) ozetEl.style.display = 'none';

  if(!baslangicKey || !bitisKey){
    if(uyari){ uyari.textContent = 'Lütfen başlangıç ve bitiş tarihini seçin.'; uyari.style.display = 'block'; }
    return;
  }
  if(baslangicKey > bitisKey){
    if(uyari){ uyari.textContent = 'Başlangıç tarihi, bitiş tarihinden sonra olamaz.'; uyari.style.display = 'block'; }
    return;
  }
  if(!xlsxHazirMi()){
    if(uyari){ uyari.textContent = 'Excel kütüphanesi yüklenemedi, sayfayı yenileyip tekrar deneyin.'; uyari.style.display = 'block'; }
    return;
  }

  const eskiMetin = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hazırlanıyor…'; }
  try{
    const veri = await sapKontrolExportVeriTopla(baslangicKey, bitisKey);
    const toplamKayit = veri.faturalar.length + veri.normalTahsilat.length + veri.iadeDepozito.length +
      veri.bayiHakedis.length + veri.hakedisMahsup.length + veri.cekSenet.length + veri.odemeVirman.length;
    if(toplamKayit === 0){
      if(uyari){ uyari.textContent = 'Seçilen tarih aralığında hiçbir kategori için kayıt bulunamadı.'; uyari.style.display = 'block'; }
      return;
    }
    const wb = sapKontrolExportExcelOlustur(veri, baslangicKey, bitisKey);
    sapKontrolExportDosyaIndir(wb, baslangicKey, bitisKey);
    if(ozetEl){
      ozetEl.innerHTML = `<b>${toplamKayit.toLocaleString('tr-TR')}</b> kayıt aktarıldı — `+
        `Fatura: ${veri.faturalar.length} · Tahsilat: ${veri.normalTahsilat.length} · İade/Depozito: ${veri.iadeDepozito.length} · `+
        `Hakediş: ${veri.bayiHakedis.length} · Çek/Senet: ${veri.cekSenet.length}`;
      ozetEl.style.display = 'block';
    }
  }catch(err){
    console.error('SAP Kontrol Export hatası:', err);
    if(uyari){ uyari.textContent = 'Export sırasında bir hata oluştu: ' + (err && err.message || err); uyari.style.display = 'block'; }
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = eskiMetin; }
  }
}

document.getElementById('sapKontrolExportBtn').addEventListener('click', sapKontrolExportModalAc);
document.getElementById('sapKontrolExportModalClose').addEventListener('click', sapKontrolExportModalKapat);
document.getElementById('sapKontrolExportCalistirBtn').addEventListener('click', sapKontrolExportCalistir);
