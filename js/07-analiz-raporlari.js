// ============================================================================
// 6 YENİ RAPOR: DSO Trendi, Nakit Akış Tahmini, Şüpheli Alacak, Temsilci
// Karnesi, Yönetim Özeti, Tahsilat Başarı Oranı (CEI). Hepsi GERÇEK verilerden
// (Kalemler, Tahsilat, Fatura, Bayi Hak Ediş, ST Tahsilat/Litre ve Fatura
// Kontrol'ün günlük musteriSnapshot arşivinden) beslenir; hiçbir sayı
// uydurulmaz. Geçmişe dayalı trend grafikleri (DSO, CEI, Yönetim Özeti),
// arşiv ne kadar geriye gidiyorsa o kadarını gösterir.
// ============================================================================

// --- fmtTrendDeger'e yüzde birimi eklenir (DSO/CEI için 'gun' ve 'yuzde' kullanılır) ---
function fmtTrendDeger(v, birim){
  if(birim==='gun') return Math.round(v).toLocaleString('tr-TR')+' gün';
  if(birim==='yuzde') return '%'+v.toFixed(1).replace('.',',');
  return TL(v);
}

// --- Ortak arşiv çekme yardımcısı: Fatura Kontrol arşivinden SADECE son `gunSayisi` günü
// (Tahsilat Verimliliği'nde olduğu gibi bir ARALIK isteğiyle) çeker ve state.faturaArsivCache'e
// birleştirir — arşivin tamamı hiçbir zaman indirilmez. Aynı pencere bu oturumda zaten çekildiyse
// (zorla verilmedikçe) tekrar istek atılmaz.
const genelRaporArsivPencereleri = new Set();
async function genelRaporlarIcinArsivGetir(gunSayisi, zorla){
  if(!cloudEnabled()) return state.faturaArsivCache || {};
  const pencereAnahtari = String(gunSayisi);
  if(genelRaporArsivPencereleri.has(pencereAnahtari) && !zorla) return state.faturaArsivCache || {};
  const bugunKey = dateKeyLocal(new Date());
  const baslangic = gunKeyEkle(bugunKey, -gunSayisi);
  const aralik = await loadFaturaKontrolArsivAraligiFromCloud(baslangic, bugunKey);
  if(aralik !== null){
    state.faturaArsivCache = Object.assign({}, state.faturaArsivCache, aralik);
    if(typeof musteriMasterIliskileriniDerinGuncelle==='function') musteriMasterIliskileriniDerinGuncelle(state.faturaArsivCache);
    genelRaporArsivPencereleri.add(pencereAnahtari);
  }
  return state.faturaArsivCache || {};
}

// --- Fatura Kontrol arşivindeki HER günün musteriSnapshot'ını (o günün TÜM müşterileri için
// kalanBorc + avgVadeGun) şirket geneline indirgeyerek günlük bir zaman serisi üretir: toplam
// bakiye, bakiye-ağırlıklı ortalama vade (DSO) ve "vadesi gelmemiş" (Vadesinde bucket) bakiye.
// DSO Trendi, Yönetim Özeti ve CEI hesaplamalarının TAMAMI bu tek fonksiyondan beslenir.
function gunlukSirketOzetleriniHesapla(){
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  const seri = [];
  gunler.forEach(gunKey=>{
    const g = state.faturaArsivCache[gunKey];
    const snap = (g && g.musteriSnapshot || []).filter(m=>musteriTvIcinGecerliMi(m.musteri));
    if(!snap.length) return;
    let toplamBakiye=0, agirlikliVadeToplami=0, agirlikBorc=0, vadesindeBakiye=0;
    snap.forEach(m=>{
      const b = m.kalanBorc||0;
      toplamBakiye += b;
      if(b!==0){ agirlikliVadeToplami += b*(m.avgVadeGun||0); agirlikBorc += b; }
      if((m.avgVadeGun||0) <= 0) vadesindeBakiye += b;
    });
    seri.push({
      tarih: gunKey,
      gunKey,
      musteriSayisi: snap.length,
      toplamBakiye,
      dso: agirlikBorc!==0 ? (agirlikliVadeToplami/agirlikBorc) : 0,
      vadesindeBakiye,
    });
  });
  return seri;
}

// ============================================================================
// 1) DSO TRENDİ
// ============================================================================
function computeDsoTrend(report){
  const seri = gunlukSirketOzetleriniHesapla();
  if(!seri.length) return {yok:true};
  const guncel = seri[seri.length-1];
  const degerler = seri.map(s=>s.dso);
  const ortalama = degerler.reduce((a,b)=>a+b,0)/degerler.length;
  let enIyi = seri[0], enKotu = seri[0];
  seri.forEach(s=>{ if(s.dso<enIyi.dso) enIyi=s; if(s.dso>enKotu.dso) enKotu=s; });
  const oncekiIndex = Math.max(0, seri.length-8);
  const onceki = seri[oncekiIndex];
  const degisim = (onceki && onceki!==guncel) ? guncel.dso-onceki.dso : 0;

  const katkilar = (report.musteriler||[])
    .filter(m=>(m.avgVadeGun||0)>0 && (m.kalanBorc||0)>0)
    .map(m=>({musteri:m.musteri, musteriAdi:m.musteriAdi, temsilci:m.temsilci||'—', kalanBorc:m.kalanBorc, avgVadeGun:m.avgVadeGun}))
    .sort((a,b)=>(b.kalanBorc*b.avgVadeGun)-(a.kalanBorc*a.avgVadeGun))
    .slice(0,10);

  return {seri, guncel, ortalama, enIyi, enKotu, degisim, katkilar};
}

async function renderDsoTrendView(report, zorla){
  const asOfEl = document.getElementById('dsoTrendAsOf');
  asOfEl.textContent = 'Buluttan yükleniyor…';
  await genelRaporlarIcinArsivGetir(400, zorla);
  const dso = computeDsoTrend(report);
  const gunSayisi = Object.keys(state.faturaArsivCache||{}).length;
  asOfEl.textContent = 'Veri kaynağı: Fatura Kontrol arşivi — günlük anlık görüntüler';

  if(dso.yok){
    document.getElementById('dsoTrendKpiGrid').innerHTML='';
    document.getElementById('dsoTrendChartPanel').style.display='none';
    document.getElementById('dsoTrendTablePanel').style.display='none';
    document.getElementById('dsoTrendBosPanel').style.display='block';
    return;
  }
  document.getElementById('dsoTrendChartPanel').style.display='block';
  document.getElementById('dsoTrendTablePanel').style.display='block';
  document.getElementById('dsoTrendBosPanel').style.display='none';

  const trendYon = dso.degisim>0.5 ? {arrow:'▲ '+Math.abs(dso.degisim).toFixed(1)+' gün', color:'var(--danger)'}
    : (dso.degisim<-0.5 ? {arrow:'▼ '+Math.abs(dso.degisim).toFixed(1)+' gün', color:'var(--success)'}
    : {arrow:'— durağan', color:'var(--ink-faint)'});
  const yon = dso.degisim>0.5 ? 'Bozulma eğiliminde' : (dso.degisim<-0.5 ? 'İyileşme eğiliminde' : 'Durağan');
  const items = [
    {label:'Güncel DSO', icon:'<i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i>', value:null, display:Math.round(dso.guncel.dso)+' gün', sub:yon, trend:trendYon},
    {label:'Arşiv Ortalaması', icon:'<i class="fa-solid fa-chart-line" aria-hidden="true"></i>', cls:'neutral', value:null, display:Math.round(dso.ortalama)+' gün'},
    {label:'En İyi Gün', icon:'<i class="fa-solid fa-medal" aria-hidden="true"></i>', cls:'success', value:null, display:Math.round(dso.enIyi.dso)+' gün', sub:fmtDate(new Date(dso.enIyi.gunKey+'T00:00:00'))},
    {label:'En Kötü Gün', icon:'<i class="fa-solid fa-flag" aria-hidden="true"></i>', cls:'danger', value:null, display:Math.round(dso.enKotu.dso)+' gün', sub:fmtDate(new Date(dso.enKotu.gunKey+'T00:00:00'))},
    {label:'DSO\'yu En Çok Yükselten', icon:'<i class="fa-solid fa-users" aria-hidden="true"></i>', cls:'warn', value:null, display:dso.katkilar.length.toLocaleString('tr-TR')+' müşteri'},
  ];
  renderKpiHeroRow(items, 'dsoTrendKpiGrid');
  document.getElementById('dsoTrendChartSub').textContent = 'Arşiv Geneli';
  renderTrendChart('dsoTrendChart', dso.seri, 'dso', 'var(--accent)', 'gun');
  document.getElementById('dsoTrendTbody').innerHTML = dso.katkilar.map(k=>`
    <tr><td>${escapeHtml(k.musteriAdi)}</td><td>${escapeHtml(k.temsilci)}</td><td class="num num-strong">${TL(k.kalanBorc)}</td><td class="num neg">${k.avgVadeGun}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty-state">Kayıt yok</td></tr>';
}

// ============================================================================
// 2) NAKİT AKIŞ TAHMİNİ
// ============================================================================
async function ortalamaGecmisTahsilatOrani(report, ayAdedi){
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  if(!gunler.length) return null;
  const aylar = Array.from(new Set(gunler.map(g=>g.slice(0,7)))).sort();
  const buAy = dateKeyLocal(new Date()).slice(0,7);
  // ÖNEMLİ DÜZELTME: Arşivde bir ay anahtarının bulunması (ör. bir Fatura/Tahsilat satırının o aya
  // sızmış "kabuk" bir kaydı olması), o ayda gerçekten Kalemler yüklenip musteriSnapshot alınmış
  // olduğu anlamına gelmez — computeTahsilatVerimlilikAy böyle bir ayda {yok:true} veya
  // tahsilatOrani:null döndürür. Eskiden "bu aydan önceki son N ay" körü körüne seçiliyordu; araya
  // veri içermeyen boş bir ay (ör. Haziran) girdiğinde, aslında dolu olan Temmuz (bu ay, henüz
  // "tamamlanmamış" sayıldığı için) hiç denenmeden oran null kalıyordu — halbuki Tahsilat
  // Verimliliği sekmesi tam da bu ayı gösterip gerçek bir oran (%) hesaplayabiliyordu. Şimdi:
  // önce geçmiş aylar (en yeniden eskiye) TEK TEK denenir, gerçekten veri döndüren (yok değil VE
  // tahsilatOrani dolu) ay bulununca o kullanılır; hiçbiri veri vermezse mevcut ay (bu ay) da
  // fallback olarak denenir — Tahsilat Verimliliği sekmesiyle aynı "en son dolu ay" mantığı.
  const gecmisAylarYeniden = aylar.filter(a=>a<buAy).slice().reverse();
  const denenecekAylar = gecmisAylarYeniden.concat(aylar.includes(buAy) ? [buAy] : []);
  let toplamOran=0, sayi=0;
  for(const ay of denenecekAylar){
    const rep = await computeTahsilatVerimlilikAy(report, ay, false);
    if(rep && !rep.yok && rep.genel.tahsilatOrani!=null){ toplamOran += rep.genel.tahsilatOrani; sayi++; }
    if(sayi >= ayAdedi) break; // yeterli sayıda GERÇEK veri içeren ay bulunduysa dur
  }
  return sayi ? (toplamOran/sayi/100) : null;
}

function haftaEtiketi(baslangic, bitis){
  const f = d=>d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short'});
  return f(baslangic)+' – '+f(bitis);
}

function computeNakitAkisTahmini(report, gerceklesmeOrani){
  const today = turkiyeBugun();
  const tumFaturalar = [];
  (report.musteriler||[]).forEach(m=>{
    (m.invoices||[]).forEach(inv=>{ if((inv.kalanBorc||0) > 0) tumFaturalar.push(inv); });
  });

  const HAFTA_MS = 7*86400000;
  const bucketSayisi = 6;
  let vadesiGecmis = 0;
  tumFaturalar.forEach(inv=>{
    if(!inv.netVade || inv.netVade.getTime() < today.getTime()) vadesiGecmis += inv.kalanBorc;
  });
  const buckets = [];
  for(let i=0;i<bucketSayisi;i++){
    const baslangic = new Date(today.getTime() + i*HAFTA_MS);
    const bitis = new Date(today.getTime() + (i+1)*HAFTA_MS - 86400000);
    buckets.push({etiket:haftaEtiketi(baslangic,bitis), baslangic, bitis, vadesiGelenBakiye:0});
  }
  tumFaturalar.forEach(inv=>{
    if(!inv.netVade) return;
    const t = inv.netVade.getTime();
    if(t < today.getTime()) return;
    for(const b of buckets){
      if(t>=b.baslangic.getTime() && t<=b.bitis.getTime()+86399999){ b.vadesiGelenBakiye += inv.kalanBorc; break; }
    }
  });

  const oranVarMi = gerceklesmeOrani != null;
  buckets.forEach(b=>{ b.beklenenTahsilat = oranVarMi ? b.vadesiGelenBakiye*gerceklesmeOrani : null; });
  const toplamVadesiGelen = buckets.reduce((a,b)=>a+b.vadesiGelenBakiye,0);
  const toplamBeklenen = oranVarMi ? buckets.reduce((a,b)=>a+b.beklenenTahsilat,0) : null;

  return {buckets, vadesiGecmis, oran:gerceklesmeOrani, oranVarMi, toplamVadesiGelen, toplamBeklenen};
}
computeNakitAkisTahmini = memoizePure(computeNakitAkisTahmini);

async function renderNakitAkisView(report){
  document.getElementById('nakitAkisAsOf').textContent = 'Geçmiş tahsilat oranı hesaplanıyor…';
  await genelRaporlarIcinArsivGetir(200, false);
  const oran = await ortalamaGecmisTahsilatOrani(report, 3);
  const veri = computeNakitAkisTahmini(report, oran);
  document.getElementById('nakitAkisAsOf').textContent = 'Veri kaynağı: Kalemler (açık faturaların net vade tarihi)'
    + (veri.oranVarMi ? ' + son aylardaki ortalama tahsilat gerçekleşme oranı (%'+Math.round(oran*100)+')' : ' — geçmiş tahsilat oranı hesaplanamadı, sadece vade bazlı bakiye gösteriliyor');

  const items = [
    {label:'Önümüzdeki 6 Hafta — Vadesi Gelen', icon:'<i class="fa-solid fa-calendar" aria-hidden="true"></i>', value:veri.toplamVadesiGelen},
    {label:'Ağırlıklı Beklenen Tahsilat', icon:'<i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>', cls:'success', value:veri.oranVarMi?veri.toplamBeklenen:0, display:veri.oranVarMi?undefined:'—'},
    {label:'Vadesi Çoktan Geçmiş', icon:'<i class="fa-solid fa-bell" aria-hidden="true"></i>', cls:'danger', value:veri.vadesiGecmis, sub:'Ayrıca Takip Gerekir, Tahmine Dahil Değil'},
    {label:'Gerçekleşme Oranı (Geçmiş Ort.)', icon:'<i class="fa-solid fa-bullseye" aria-hidden="true"></i>', cls:'accent', value:null, display:veri.oranVarMi?('%'+Math.round(veri.oran*100)):'—'},
  ];
  renderKpiHeroRow(items, 'nakitAkisKpiGrid');

  const maksDeger = Math.max(...veri.buckets.map(b=>b.vadesiGelenBakiye), 1);
  document.getElementById('nakitAkisChart').innerHTML = veri.buckets.map(b=>`
    <div class="week-row">
      <div class="week-label">${escapeHtml(b.etiket)}</div>
      <div class="week-track"><div class="week-fill" style="width:${Math.max(2,b.vadesiGelenBakiye/maksDeger*100).toFixed(1)}%;"></div></div>
      <div class="week-val">${TL(b.vadesiGelenBakiye)}</div>
    </div>`).join('');

  document.getElementById('nakitAkisOranBaslik').textContent = veri.oranVarMi ? 'Ağırlıklı Beklenen Tahsilat (%'+Math.round(veri.oran*100)+')' : 'Ağırlıklı Beklenen Tahsilat';
  document.getElementById('nakitAkisTbody').innerHTML = veri.buckets.map(b=>`
    <tr><td>${escapeHtml(b.etiket)}</td><td class="num">${TL(b.vadesiGelenBakiye)}</td><td class="num num-strong">${veri.oranVarMi?TL(b.beklenenTahsilat):'—'}</td></tr>`).join('');
  document.getElementById('nakitAkisTfoot').innerHTML = `<tr><td><b>Toplam (6 hafta)</b></td><td class="num num-strong">${TL(veri.toplamVadesiGelen)}</td><td class="num num-strong">${veri.oranVarMi?TL(veri.toplamBeklenen):'—'}</td></tr>`;
  document.getElementById('nakitAkisNot').textContent = 'Yöntem: Her haftanın vadesi gelen açık bakiyesi (Kalemler dosyasındaki Net Vade Tarihi baz alınır)'
    + (veri.oranVarMi ? ', geçmiş aylardaki gerçekleşen tahsilat oranıyla ağırlıklandırılır.' : '.')
    + ' Vadesi çoktan geçmiş alacaklar ayrı gösterilir, daha az öngörülebilir olduğu için tahmine dahil edilmez.';
}

// ============================================================================
// 3) ŞÜPHELİ ALACAK
// ============================================================================
// Karşılık oranı artık ELLE GİRİLMEZ/DÜZENLENMEZ — her yaşlandırma diliminin (AGING_BUCKETS)
// GERÇEK bakiye-ağırlıklı ortalama gecikme günü hesaplanır, ardından standart bir aktüeryal eğriyle
// (her gecikme günü için %0,5 kayıp riski, en fazla %95) karşılık oranı otomatik türetilir. Böylece
// oran, o dilimdeki müşterilerin GERÇEKTEN ne kadar geciktiğine göre kendiliğinden güncellenir —
// sabit/varsayılan bir yüzde değil.
function computeOtomatikKarsilikOranlari(musteriler){
  const toplamlar = AGING_BUCKETS.map(()=>({agirlikliGun:0, bakiye:0}));
  (musteriler||[]).forEach(m=>{
    const g = m.avgVadeGun||0;
    const idx = AGING_BUCKETS.findIndex(b=>b.test(g));
    if(idx<0) return;
    const b = m.kalanBorc||0;
    toplamlar[idx].bakiye += b;
    if(b!==0) toplamlar[idx].agirlikliGun += b*g;
  });
  return toplamlar.map(t=>{
    const ortalamaGun = t.bakiye!==0 ? (t.agirlikliGun/t.bakiye) : 0;
    const oran = Math.max(0, Math.min(95, ortalamaGun*0.5));
    return {ortalamaGun, oran};
  });
}

function computeSupheliAlacak(report){
  const {agingAmount} = computeAging(report.musteriler);
  const otomatikOranlar = computeOtomatikKarsilikOranlari(report.musteriler);
  const satirlar = agingAmount.map((b,i)=>{
    const oran = otomatikOranlar[i] ? otomatikOranlar[i].oran : 0;
    const ortalamaGun = otomatikOranlar[i] ? otomatikOranlar[i].ortalamaGun : 0;
    return {label:b.label, bakiye:b.value, oran, ortalamaGun, karsilik: b.value*oran/100};
  });
  const toplamBakiye = satirlar.reduce((a,s)=>a+s.bakiye,0);
  const toplamKarsilik = satirlar.reduce((a,s)=>a+s.karsilik,0);

  const hukuki = (report.musteriler||[])
    .filter(m=>(m.avgVadeGun||0)>90 && (m.kalanBorc||0)>0)
    .sort((a,b)=>b.kalanBorc-a.kalanBorc);

  return {satirlar, toplamBakiye, toplamKarsilik, hukuki};
}
computeSupheliAlacak = memoizePure(computeSupheliAlacak);

// Hukuki takip kartları — gecikme gününe göre otomatik risk seviyesi
const HTK_RISK_ESIKLERI = [
  { min: 180, etiket: 'Yüksek risk', renk: 'var(--danger)', bg: 'var(--danger-soft)' },
  { min: 90,  etiket: 'Orta risk',   renk: 'var(--warn)',   bg: 'var(--warn-soft)'   },
  { min: 0,   etiket: 'İzlemede',    renk: 'var(--ink-soft)', bg: 'var(--navy-soft)' },
];
function hukukiRiskSeviyesi(gecikmeGun){
  const g = Number(gecikmeGun) || 0;
  return HTK_RISK_ESIKLERI.find(e => g >= e.min) || HTK_RISK_ESIKLERI[HTK_RISK_ESIKLERI.length-1];
}
const HTK_USER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>';

function getHukukiFiltered(hukukiListesi){
  const q = document.getElementById('hukukiSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('hukukiTemsilciFilter').value;
  const riskFilter = document.getElementById('hukukiRiskFilter').value;
  const vadeMin = document.getElementById('hukukiVadeMinInput').value;
  const vadeMax = document.getElementById('hukukiVadeMaxInput').value;

  return hukukiListesi.filter(m=>{
    if(q && !musteriAramaEslesiyorMu(q, m.musteriAdi, m.musteri, m.musteriUnvan) && !String(m.temsilci).toLocaleLowerCase('tr-TR').includes(q)) return false;
    if(temsilci && m.temsilci !== temsilci) return false;
    if(riskFilter==='over180' && !(m.avgVadeGun>=180)) return false;
    if(riskFilter==='hasCek' && !(m.cekSenet>0)) return false;
    if(vadeMin !== '' && !(m.avgVadeGun >= Number(vadeMin))) return false;
    if(vadeMax !== '' && !(m.avgVadeGun <= Number(vadeMax))) return false;
    return true;
  });
}

function renderSupheliAlacakView(report){
  const veri = computeSupheliAlacak(report);
  const en90Plus = veri.satirlar[veri.satirlar.length-1];
  const items = [
    {label:'Toplam Önerilen Karşılık', icon:'<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>', cls:'warn', value:veri.toplamKarsilik, sub: veri.toplamBakiye>0 ? ('Toplam Bakiyenin %'+(veri.toplamKarsilik/veri.toplamBakiye*100).toFixed(1)+"'i") : ''},
    {label:'90+ Gün Geciken Müşteri', icon:'<i class="fa-solid fa-flag" aria-hidden="true"></i>', cls:'danger', value:null, display:veri.hukuki.length.toLocaleString('tr-TR')},
    {label:'90+ Gün Geciken Bakiye', icon:'<i class="fa-solid fa-building-columns" aria-hidden="true"></i>', cls:'neutral', value: en90Plus ? en90Plus.bakiye : 0},
  ];
  renderKpiHeroRow(items, 'supheliAlacakKpiGrid');

  populateTemsilciFilter(report.musteriler||[], 'hukukiTemsilciFilter');
  const hukukiFiltreli = getHukukiFiltered(veri.hukuki);

  document.getElementById('supheliMatrixTbody').innerHTML = veri.satirlar.map((s,i)=>`
    <tr>
      <td>${escapeHtml(s.label)}</td>
      <td class="num">${TL(s.bakiye)}</td>
      <td class="num" title="ortalama gecikme: ${Math.round(s.ortalamaGun)} gün">%${s.oran.toFixed(1).replace('.',',')}</td>
      <td class="num num-strong">${TL(s.karsilik)}</td>
    </tr>`).join('');
  document.getElementById('supheliMatrixTfoot').innerHTML =
    `<tr><td><b>Toplam</b></td><td class="num num-strong">${TL(veri.toplamBakiye)}</td><td></td><td class="num num-strong" style="color:var(--danger);">${TL(veri.toplamKarsilik)}</td></tr>`;

  const maksAging = Math.max(...veri.satirlar.map(s=>s.bakiye), 1);
  const renkler = ['var(--accent)','#4E86C6','var(--warn)','#D08A4A','var(--danger)'];
  document.getElementById('supheliAgingChart').innerHTML = veri.satirlar.map((s,i)=>`
    <div class="aging-row">
      <div class="aging-label">${escapeHtml(s.label)}</div>
      <div class="aging-track"><div class="aging-fill" style="width:${Math.max(2,s.bakiye/maksAging*100).toFixed(1)}%;background:${renkler[i]||'var(--accent)'};"></div></div>
      <div class="aging-value">${TL(s.bakiye)}</div>
    </div>`).join('');

  const gosterilecekSayi = Math.min(state.hukukiGosterilen, hukukiFiltreli.length);
  const gosterilecekHukuki = hukukiFiltreli.slice(0, gosterilecekSayi);
  document.getElementById('supheliHukukiCount').textContent = hukukiFiltreli.length
    ? hukukiFiltreli.length.toLocaleString('tr-TR')+' müşteri — bakiyeye göre sıralı'
    : '90+ gün geciken, bakiyeye göre sıralı';
  document.getElementById('supheliHukukiKartGrid').innerHTML = gosterilecekHukuki.map(m=>{
    const risk = hukukiRiskSeviyesi(m.avgVadeGun);
    const vadeRenk = ortVadeRenk(m.avgVadeGun);
    return `
    <div class="htk-card" style="--htk-risk:${risk.renk};--htk-risk-bg:${risk.bg};">
      <div class="htk-head">
        <div class="htk-avatar" style="background:${risk.bg};color:${risk.renk};">${escapeHtml(avatarBaslangic(m.musteriAdi))}</div>
        <div style="min-width:0;flex:1;">
          <div class="htk-musteri">${escapeHtml(m.musteriAdi)}</div>
          <div class="htk-temsilci">${escapeHtml(m.temsilci||'—')}</div>
        </div>
        <span class="htk-risk-badge">${risk.etiket}</span>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${TL(m.kalanBorc)}</span>
        <span class="htk-badge-vade" style="border-color:${vadeRenk.renk};"><span class="htk-badge-vade-num" style="color:${vadeRenk.renk};">${Math.round(m.avgVadeGun)||0}</span><span class="htk-badge-vade-lbl" style="color:${vadeRenk.renk};">Ort. Vade</span></span>
      </div>
      <div class="htk-alt">
        <span class="htk-ceksenet">Çek/Senet: ${TL(m.cekSenet||0)}</span>
        <button type="button" class="nokta-detay-btn primary fatura-detay-btn" data-musteri-kod="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}">Detay ↗</button>
      </div>
    </div>`;
  }).join('')
    || `<div class="empty-state" style="padding:20px;text-align:center;">${veri.hukuki.length ? 'Filtreyle eşleşen müşteri yok' : '90+ gün geciken müşteri yok'}</div>`;
  renderSupheliHukukiDahaFazlaBtn(gosterilecekSayi, hukukiFiltreli.length);
}

function renderSupheliHukukiDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('supheliHukukiDahaFazlaWrap');
  const info = document.getElementById('supheliHukukiDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

// ============================================================================
// 4) TEMSİLCİ KARNESİ
// ============================================================================
// Hedef artık ELLE GİRİLMEZ — her temsilci için otomatik hesaplanır:
//   Hedef = Σ(müşterinin kalan borcu × o yaşlandırma diliminin OTOMATİK tahsil edilebilirlik oranı,
//            yani 100% − Şüpheli Alacak'taki otomatik karşılık oranı)
//          + (Fatura Dökümü'ndeki Ödenecek Tutar — bu ay kesilen faturalar) × son aylardaki GERÇEK
//            ortalama tahsilat gerçekleşme oranı (Nakit Akış Tahmini'nde kullanılan oranla aynı
//            fonksiyon)
// NOT: Bu hesap ÖNCEDEN "açık sipariş + emanet sipariş tutarı" baz alıyordu; artık bunun yerine
// Fatura Dökümü'ndeki GERÇEKTEN KESİLMİŞ fatura tutarı (Ödenecek Tutar) kullanılıyor — çünkü henüz
// faturalanmamış siparişler yerine, fiilen faturalanmış (ve dolayısıyla tahsil edilmesi beklenen)
// tutar daha gerçekçi bir tahsilat hedefi tabanı oluşturuyor.
// Yani hedef, o temsilcinin GERÇEK cari yaşlandırması ve GERÇEK fatura hacmine göre kendiliğinden
// değişir; şirketin/kullanıcının uydurduğu sabit bir sayı değildir.
function computeOtomatikTemsilciHedefi(musterilerBuTemsilci, otomatikKarsilikOranlari, gerceklesmeOrani, ayFaturaMap, buAy){
  let tahsilEdilebilirBakiye = 0;
  let faturaTutari = 0;
  musterilerBuTemsilci.forEach(m=>{
    const g = m.avgVadeGun||0;
    const idx = AGING_BUCKETS.findIndex(b=>b.test(g));
    const karsilikOrani = (idx>=0 && otomatikKarsilikOranlari[idx]) ? otomatikKarsilikOranlari[idx].oran : 0;

    // ÇİFT SAYIM DÜZELTMESİ (denetim bulgusu #3 — kullanıcı onayıyla düzeltildi): m.kalanBorc,
    // müşterinin GÜNCEL açık bakiyesidir ve bu ay kesilip henüz ödenmemiş faturaları da İÇİNDE
    // barındırır (Kalemler'den gelir). Aşağıda ayrıca eklenen ayFaturaMap (bu ayki Fatura
    // Dökümü'nden TÜM fatura tutarı — ödenmiş/ödenmemiş fark etmeksizin) ile bu tutar iki kez
    // sayılmasın diye, bu ayın faturalarının kalan bakiyesi burada (yaşlandırma bazlı bakiyeden)
    // HARİÇ tutulur — bu ayki faturalanan tutarın hedefe katkısı SADECE aşağıdaki
    // faturaTutari*oran teriminden gelir.
    const buAyKalanBorc = buAy ? (m.invoices||[]).reduce((a,inv)=>{
      const gk = inv.faturaTarihi instanceof Date ? dateKeyLocal(inv.faturaTarihi) : null;
      if(gk && gk.slice(0,7)===buAy) return a + (inv.kalanBorc||0);
      return a;
    }, 0) : 0;
    const eskiBakiye = (m.kalanBorc||0) - buAyKalanBorc;
    tahsilEdilebilirBakiye += eskiBakiye * (1 - karsilikOrani/100);
    faturaTutari += (ayFaturaMap && ayFaturaMap.get(m.musteri)) || 0;
  });
  const oran = gerceklesmeOrani!=null ? gerceklesmeOrani : 0.7; // geçmiş veri yoksa temkinli varsayılan
  return tahsilEdilebilirBakiye + faturaTutari*oran;
}

function karneDurumPill(gerceklesme){
  return performansPill(gerceklesme, {ust:100, hedefte:90, altinda:70});
}
function ceiDurumPill(oran){
  return performansPill(oran, {ust:90, hedefte:70, altinda:40});
}

// ssmKanalRowHtml'in TL (tahsilat/hedef) versiyonu — Temsilci Karnesi kartında, Sell Out kartındaki
// Açık/Kapalı Kanal satırıyla AYNI görsel hatları (ilerleme çubuğu, kalan bilgisi) kullanır.
function karneTahsilatRowHtml(label, tahsilat, hedef){
  const hedefVarMi = hedef>0;
  const pct = hedefVarMi ? Math.min(100, tahsilat/hedef*100) : 0;
  const renk = hedefVarMi ? sellOutRenk(pct) : 'var(--ink-faint)';
  const valTxt = hedefVarMi ? `${TL(tahsilat)} <small>/ ${TL(hedef)} (otomatik)</small>` : `${TL(tahsilat)} <small>· hedef yok</small>`;
  const kalanTxt = hedefVarMi ? `<div class="ssm-kanal-kalan">Kalan ${TL(Math.max(0, hedef-tahsilat))}</div>` : '';
  return `<div class="ssm-kanal-row">
    <div class="ssm-kanal-top"><span class="lbl">${escapeHtml(label)}</span><span class="val">${valTxt}</span></div>
    <div class="ssm-kanal-track"><div class="ssm-kanal-fill" style="width:${pct.toFixed(1)}%;background:${renk};"></div></div>
    ${kalanTxt}
  </div>`;
}

async function computeTemsilciKarnesi(report, zorla){
  const buAy = dateKeyLocal(new Date()).slice(0,7);
  const tv = await computeTahsilatVerimlilikAy(report, buAy, zorla);
  if(!tv || tv.yok) return {yok:true};

  const otomatikKarsilikOranlari = computeOtomatikKarsilikOranlari(report.musteriler);
  const gerceklesmeOrani = await ortalamaGecmisTahsilatOrani(report, 3);

  // Hedefin sipariş yerine Fatura Dökümü'ndeki Ödenecek Tutar'ı baz alması için, bu ayın (buAy)
  // Fatura Dökümü arşivinden müşteri bazlı fatura tutarı toplamı çıkarılır (bkz.
  // computeOtomatikTemsilciHedefi'ndeki açıklama).
  const {ilkKey, sonKey} = ayGunAraligi(buAy);
  const birlesikArsivHedef = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);
  const ayFaturaMap = new Map();
  (birlesikArsivHedef.faturaArsiv||[]).forEach(r=>{
    if(!r.faturaTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    const gk = dateKeyLocal(r.faturaTarihi);
    if(!gk || gk<ilkKey || gk>sonKey) return;
    ayFaturaMap.set(r.musteri, (ayFaturaMap.get(r.musteri)||0) + (r.tutar||0));
  });

  const musterilerByRep = new Map();
  const agingByRep = new Map();
  (report.musteriler||[]).forEach(m=>{
    const key = m.temsilci || '—';
    if(!musterilerByRep.has(key)) musterilerByRep.set(key, []);
    musterilerByRep.get(key).push(m);
    if(!agingByRep.has(key)) agingByRep.set(key, {agirlikliVade:0, agirlikBorc:0, riskliSayisi:0, riskliMusteriListe:[]});
    const r = agingByRep.get(key);
    if((m.kalanBorc||0)!==0){ r.agirlikliVade += m.kalanBorc*(m.avgVadeGun||0); r.agirlikBorc += m.kalanBorc; }
    if((m.avgVadeGun||0)>90){
      r.riskliSayisi += 1;
      r.riskliMusteriListe.push({adi: m.musteriAdi||m.musteri, kod: m.musteri, ortVade: m.avgVadeGun||0, kalanBorc: m.kalanBorc||0});
    }
  });

  const rows = tv.rows.map(r=>{
    const aging = agingByRep.get(r.temsilci) || {agirlikliVade:0, agirlikBorc:0, riskliSayisi:0, riskliMusteriListe:[]};
    const ortVade = aging.agirlikBorc!==0 ? Math.round(aging.agirlikliVade/aging.agirlikBorc) : null;
    const musterileri = musterilerByRep.get(r.temsilci) || [];
    const hedef = computeOtomatikTemsilciHedefi(musterileri, otomatikKarsilikOranlari, gerceklesmeOrani, ayFaturaMap, buAy);
    const gerceklesme = hedef>0 ? (r.toplamTahsilat/hedef*100) : null;
    return Object.assign({}, r, {ortVade, riskliMusteriSayisi:aging.riskliSayisi, riskliMusteriListe:aging.riskliMusteriListe, hedef, gerceklesme});
  }).sort((a,b)=>(b.gerceklesme||0)-(a.gerceklesme||0));

  return {rows, genel:tv.genel, ayKey:buAy, gerceklesmeOrani};
}

async function renderTemsilciKarnesiView(report, zorla){
  document.getElementById('karneAsOf').textContent = 'Yükleniyor…';
  const karne = await computeTemsilciKarnesi(report, zorla);
  if(karne.yok){
    document.getElementById('karneAsOf').textContent = 'Bu ay için arşiv verisi henüz yok.';
    document.getElementById('karneKpiGrid').innerHTML='';
    document.getElementById('karneChartPanel').style.display='none';
    document.getElementById('karneGrid').innerHTML = '<div class="empty-state">Veri yok</div>';
    return;
  }
  document.getElementById('karneChartPanel').style.display='block';
  const oranMetni = karne.gerceklesmeOrani!=null ? (' · sipariş ağırlıklandırması için %'+Math.round(karne.gerceklesmeOrani*100)+' geçmiş tahsilat gerçekleşme oranı kullanıldı') : '';
  document.getElementById('karneAsOf').textContent = 'Veri kaynağı: Tahsilat + Kalemler + Bayi Hak Ediş — '+fmtDate(new Date(karne.ayKey+'-01'))+' ayı'+oranMetni;

  const hedefiTutturan = karne.rows.filter(r=>r.gerceklesme!=null && r.gerceklesme>=100).length;
  const vadeliRows = karne.rows.filter(r=>r.ortVade!=null);
  const ortVadeEkip = vadeliRows.length ? Math.round(vadeliRows.reduce((a,r)=>a+r.ortVade,0)/vadeliRows.length) : null;
  const items = [
    {label:'Aktif Temsilci', icon:'<i class="fa-solid fa-users" aria-hidden="true"></i>', value:null, display:karne.rows.length.toLocaleString('tr-TR')},
    {label:'Hedefi Tutturan', icon:'<i class="fa-solid fa-bullseye" aria-hidden="true"></i>', cls:'success', value:null, display:hedefiTutturan+' / '+karne.rows.length},
    {label:'Genel Tahsilat Oranı', icon:'<i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>', cls:'accent', value:null, display:fmtYuzde(karne.genel.tahsilatOrani)},
    {label:'Ort. Vade (Ekip)', icon:'<i class="fa-solid fa-clock" aria-hidden="true"></i>', cls:'neutral', value:null, display: ortVadeEkip!=null ? ortVadeEkip+' gün' : '—'},
  ];
  renderKpiHeroRow(items, 'karneKpiGrid');

  const maksTahsilat = Math.max(...karne.rows.map(r=>Math.max(r.toplamTahsilat, r.hedef)), 1);
  document.getElementById('karneChart').innerHTML = karne.rows.map(r=>`
    <div class="week-row">
      <div class="week-label" title="${escapeHtml(r.temsilci)}">${escapeHtml(r.temsilci)}</div>
      <div class="week-track" style="position:relative;">
        <div style="position:absolute;left:${Math.min(100,r.hedef/maksTahsilat*100).toFixed(1)}%;top:0;bottom:0;width:2px;background:var(--ink);opacity:.4;"></div>
        <div class="week-fill" style="width:${Math.max(2,r.toplamTahsilat/maksTahsilat*100).toFixed(1)}%;background:${verimRenk(r.gerceklesme!=null?Math.min(r.gerceklesme,100):null)};"></div>
      </div>
      <div class="week-val">${TL(r.toplamTahsilat)}</div>
    </div>`).join('');

  state.karneTemsilciMap = new Map(karne.rows.map(r=>[r.temsilci, r]));
  document.getElementById('karneGrid').innerHTML = karne.rows.map((r,i)=>{
    const durum = karneDurumPill(r.gerceklesme);
    const gercRenkKarne = sellOutRenk(r.gerceklesme);
    const vadeRenkKarne = ortVadeRenk(r.ortVade);
    return `
    <div class="cust-card karne-card" data-temsilci-key="${escapeHtml(r.temsilci)}" style="border-left:4px solid ${gercRenkKarne};">
      <div class="ssm-karne-top">
        <div class="cust-avatar">${escapeHtml(avatarBaslangic(r.temsilci))}</div>
        <div class="cust-info">
          <div class="ssm-karne-name">${escapeHtml(r.temsilci)} <span class="badge info">#${i+1}</span></div>
          <span class="pill ${durum.cls}" style="margin-top:5px;display:inline-block;">${durum.label}</span>
        </div>
        <div class="ssm-fkns-ring-wrap">
          ${fknsRingSvg(r.gerceklesme)}
          <div class="ssm-fkns-ring-label">GERÇ.</div>
        </div>
      </div>
      ${karneTahsilatRowHtml('Tahsilat', r.toplamTahsilat, r.hedef)}
      <div class="htk-alt" style="margin-top:14px;padding-top:13px;border-top:1px dashed var(--line);">
        ${r.ortVade!=null ? `<span class="htk-badge-vade" style="border-color:${vadeRenkKarne.renk};">
          <span class="htk-badge-vade-num" style="color:${vadeRenkKarne.renk};">${r.ortVade}</span>
          <span class="htk-badge-vade-lbl" style="color:${vadeRenkKarne.renk};">Ort. Vade</span>
        </span>` : `<span class="htk-ceksenet">Ort. Vade: —</span>`}
        <span class="htk-ceksenet">Riskli müşteri: <b style="color:${r.riskliMusteriSayisi>0?'var(--danger)':'var(--ink)'};">${r.riskliMusteriSayisi}</b></span>
      </div>
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line-soft);text-align:right;">
        <button type="button" class="nokta-detay-btn primary karne-riskli-detay-btn" data-temsilci-key="${escapeHtml(r.temsilci)}">Detay ↗</button>
      </div>
    </div>`;
  }).join('');

}

function karneRiskliModalRenderList(temsilciKey){
  const r = state.karneTemsilciMap && state.karneTemsilciMap.get(temsilciKey);
  const list = document.getElementById('karneRiskliModalList');
  if(!r || !(r.riskliMusteriListe||[]).length){
    list.innerHTML = `<div class="fkns-empty">Riskli müşteri yok <i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i></div>`;
    return;
  }
  const riskliSort = state.karneRiskliSort.get(temsilciKey) || {key:'ortVade', dir:-1};
  const riskliListe = r.riskliMusteriListe.slice().sort((a,b)=>{
    if(riskliSort.key==='ortVade' || riskliSort.key==='kalanBorc'){
      return riskliSort.dir * ((a[riskliSort.key]||0) - (b[riskliSort.key]||0));
    }
    const av = String(a[riskliSort.key]||''), bv = String(b[riskliSort.key]||'');
    return riskliSort.dir * av.localeCompare(bv, 'tr');
  });
  list.innerHTML = riskliListe.map(n=>{
    const riskCls = n.ortVade>=60 ? 'risk-yuksek' : (n.ortVade>=30 ? 'risk-orta' : '');
    const vadeRenkN = ortVadeRenk(n.ortVade);
    return `<div class="popup-nokta-card">
      <div class="popup-nokta-card-top">
        <div class="popup-nokta-avatar ${riskCls}">${escapeHtml(avatarBaslangic(n.adi))}</div>
        <div class="popup-nokta-info">
          <div class="popup-nokta-adi" title="${escapeHtml(n.adi)}">${escapeHtml(n.adi)}</div>
          <div class="popup-nokta-kod">${escapeHtml(n.kod)}</div>
        </div>
      </div>
      <div class="popup-nokta-card-bottom">
        <div class="popup-nokta-stats">
          <div><span class="l">Kalan Borç</span><span class="v">${TL(n.kalanBorc)}</span></div>
          <div><span class="l">Ort. Vade</span><span class="v" style="color:${vadeRenkN.renk};">${n.ortVade} gün</span></div>
        </div>
        <button type="button" class="nokta-detay-btn primary fatura-detay-btn" data-musteri-kod="${escapeHtml(n.kod)}" data-musteri-adi="${escapeHtml(n.adi)}">Detay ↗</button>
      </div>
    </div>`;
  }).join('');
}
function karneRiskliModalAc(temsilciKey){
  const r = state.karneTemsilciMap && state.karneTemsilciMap.get(temsilciKey);
  document.getElementById('karneRiskliModalAvatar').textContent = r ? avatarBaslangic(r.temsilci) : '';
  document.getElementById('karneRiskliModalTitle').textContent = r ? r.temsilci : 'Temsilci bulunamadı';
  document.getElementById('karneRiskliModalPill').textContent = r ? r.riskliMusteriSayisi + ' müşteri' : '';
  const riskliSort = state.karneRiskliSort.get(temsilciKey) || {key:'ortVade', dir:-1};
  document.getElementById('karneRiskliModalSortSelect').value = riskliSort.key;
  document.getElementById('karneRiskliModalSortDirBtn').textContent = riskliSort.dir===1 ? '↓' : '↑';
  document.getElementById('karneRiskliModalSortSelect').dataset.temsilciKey = temsilciKey;
  document.getElementById('karneRiskliModalSortDirBtn').dataset.temsilciKey = temsilciKey;
  karneRiskliModalRenderList(temsilciKey);
  document.getElementById('karneRiskliModalOverlay').classList.add('open');
}
function karneRiskliModalKapat(){
  document.getElementById('karneRiskliModalOverlay').classList.remove('open');
}
document.getElementById('karneRiskliModalClose').addEventListener('click', karneRiskliModalKapat);
document.getElementById('karneRiskliModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='karneRiskliModalOverlay') karneRiskliModalKapat();
});
document.getElementById('karneRiskliModalSortSelect').addEventListener('change', (e)=>{
  const key = e.target.dataset.temsilciKey;
  const mevcut = state.karneRiskliSort.get(key) || {key:'ortVade', dir:-1};
  state.karneRiskliSort.set(key, {key: e.target.value, dir: mevcut.dir});
  karneRiskliModalRenderList(key);
});
document.getElementById('karneRiskliModalSortDirBtn').addEventListener('click', (e)=>{
  const key = e.target.dataset.temsilciKey;
  const mevcut = state.karneRiskliSort.get(key) || {key:'ortVade', dir:-1};
  const yeniDir = mevcut.dir*-1;
  state.karneRiskliSort.set(key, {key: mevcut.key, dir: yeniDir});
  e.target.textContent = yeniDir===1 ? '↓' : '↑';
  karneRiskliModalRenderList(key);
});
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.karne-riskli-detay-btn');
  if(!btn) return;
  e.stopPropagation();
  karneRiskliModalAc(btn.getAttribute('data-temsilci-key'));
});

// ============================================================================
// 5) YÖNETİM ÖZETİ
// ============================================================================
async function yuklemeArsivGerekirseYukle(zorla){
  // ST Tahsilat/Litre arşivi (state.yuklemeArsivCache) normalde yalnızca o sekme açıldığında
  // yükleniyor. Yönetim Özeti kullanıcı hiç o sekmeyi açmadan doğrudan ziyaret edilirse, arşiv boş
  // kalır ve "Haftalık Sevkiyat" yanlışlıkla 0 Lt görünür. Bu yüzden burada da (gerekirse) çekilir.
  if(!zorla && state.yuklemeArsivCache && Object.keys(state.yuklemeArsivCache).length>0) return state.yuklemeArsivCache;
  await yuklemeArsivYenile();
  return state.yuklemeArsivCache;
}

async function computeYonetimOzeti(report, zorla){
  await genelRaporlarIcinArsivGetir(60, zorla);
  await yuklemeArsivGerekirseYukle(zorla);
  const seri = gunlukSirketOzetleriniHesapla();
  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);

  const bugunKey = dateKeyLocal(new Date());
  const haftaOncesi = gunKeyEkle(bugunKey, -7);

  let haftalikTahsilat = 0;
  // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT (kullanıcı isteği): artık birlesikArsiv.tahsilatArsiv
  // (Fatura Kontrol'ün eski, artık senkronize edilmeyen günlük snapshot arşivi) DEĞİL, kendi
  // bağımsız kalıcı arşivi state.tahsilatArsivi (belge no bazlı) okunur.
  tahsilatArsivindenAralikDiziyeCevir(state.tahsilatArsivi, gunKeyEkle(haftaOncesi,1), bugunKey).forEach(r=>{
    if(!r.belgeTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    haftalikTahsilat += r.tutar||0;
  });
  let haftalikHakedis = 0;
  (birlesikArsiv.bayiHakedisArsiv||[]).forEach(r=>{
    if(!r.tahsilatTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    const gk = dateKeyLocal(r.tahsilatTarihi);
    if(gk && gk>haftaOncesi && gk<=bugunKey) haftalikHakedis += r.tutar||0;
  });

  let haftalikLitre = 0;
  Object.keys(state.yuklemeArsivCache||{}).forEach(gunKey=>{
    if(gunKey>haftaOncesi && gunKey<=bugunKey){
      const g = state.yuklemeArsivCache[gunKey];
      if(g && g.genelToplamSatiri) haftalikLitre += g.genelToplamSatiri.litre||0;
    }
  });

  const {agingCount} = computeAging(report.musteriler);
  const dikkatSayisi = agingCount.length ? agingCount[agingCount.length-1].value : 0;

  const toplamBakiye = sum(report.musteriler,'kalanBorc');
  const guncelDso = seri.length ? seri[seri.length-1].dso : null;
  const haftaOncekiSeri = seri.filter(s=>s.gunKey<=haftaOncesi);
  const dsoOncesi = haftaOncekiSeri.length ? haftaOncekiSeri[haftaOncekiSeri.length-1].dso : null;
  const dsoDegisim = (guncelDso!=null && dsoOncesi!=null) ? guncelDso-dsoOncesi : null;

  return {seri, toplamBakiye, haftalikTahsilat, haftalikHakedis, haftalikLitre, dikkatSayisi, guncelDso, dsoDegisim};
}

function computeYonetimInsights(ozet, karne){
  const insights = [];
  if(ozet.dsoDegisim!=null){
    if(ozet.dsoDegisim<=-0.5) insights.push({icon:'fa-arrow-trend-down', cls:'success', text:'DSO son 1 haftada '+Math.abs(ozet.dsoDegisim).toFixed(1)+' gün iyileşti'});
    else if(ozet.dsoDegisim>=0.5) insights.push({icon:'fa-arrow-trend-up', cls:'warn', text:'DSO son 1 haftada '+ozet.dsoDegisim.toFixed(1)+' gün arttı'});
    else insights.push({icon:'fa-minus', cls:'neutral', text:'DSO son 1 haftada durağan seyretti'});
  }
  if(ozet.dikkatSayisi>0) insights.push({icon:'fa-triangle-exclamation', cls:'danger', text:ozet.dikkatSayisi.toLocaleString('tr-TR')+' müşteri 90+ gün gecikmede'});
  insights.push({icon:'fa-coins', cls:'success', text:'Bu hafta '+TL(ozet.haftalikTahsilat)+' tahsilat yapıldı'});
  if(ozet.haftalikLitre>0) insights.push({icon:'fa-box', cls:'neutral', text:'Bu hafta '+Math.round(ozet.haftalikLitre).toLocaleString('tr-TR')+' Lt sevkiyat gerçekleşti'});
  if(ozet.haftalikHakedis>0) insights.push({icon:'fa-award', cls:'accent', text:'Bu hafta '+TLKurus(ozet.haftalikHakedis)+' bayi hakediş tahakkuk etti'});
  if(karne && karne.rows && karne.rows.length){
    const enIyi = karne.rows[0];
    if(enIyi && enIyi.gerceklesme!=null) insights.push({icon:'fa-trophy', cls:'accent', text:'En yüksek tahsilat gerçekleşmesi: '+enIyi.temsilci+' ('+fmtYuzde(enIyi.gerceklesme)+')'});
  }
  return insights;
}

async function renderYonetimOzetiView(report, zorla){
  document.getElementById('yoAsOf').textContent = 'Yükleniyor…';
  const ozet = await computeYonetimOzeti(report, zorla);
  const karne = await computeTemsilciKarnesi(report, false);
  const supheli = computeSupheliAlacak(report);
  document.getElementById('yoAsOf').textContent = 'Otomatik oluşturulan özet · '+fmtDate(new Date())+' itibarıyla, son 7 gün';

  const items = [
    {label:'Toplam Açık Bakiye', icon:'<i class="fa-solid fa-briefcase" aria-hidden="true"></i>', value:ozet.toplamBakiye},
    {label:'Haftalık Tahsilat', icon:'<i class="fa-solid fa-money-bill" aria-hidden="true"></i>', cls:'success', value:ozet.haftalikTahsilat},
    {label:'Haftalık Sevkiyat', icon:'<i class="fa-solid fa-box" aria-hidden="true"></i>', cls:'neutral', value:null, display:Math.round(ozet.haftalikLitre).toLocaleString('tr-TR')+' Lt'},
    {label:'Dikkat Gerektiren Müşteri', icon:'<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>', cls:'warn', value:null, display:ozet.dikkatSayisi.toLocaleString('tr-TR'), sub:'90+ gün ortalama vade'},
  ];
  renderKpiHeroRow(items, 'yoKpiGrid');

  document.getElementById('yoChartSub').textContent = 'Arşiv Geneli — Toplam Bakiye';
  renderTrendChart('yoChart', ozet.seri, 'toplamBakiye', 'var(--navy)', 'tl');

  const insights = computeYonetimInsights(ozet, karne);
  document.getElementById('yoInsights').innerHTML = insights.length
    ? insights.map(it=>`<div class="ins-row"><span class="ins-icon ins-icon-${it.cls}"><i class="fa-solid ${it.icon}" aria-hidden="true"></i></span><span>${it.text}</span></div>`).join('')
    : '<div class="empty-state">Henüz yeterli veri yok</div>';

  const aksiyonlar = [];
  supheli.hukuki.slice(0,3).forEach(m=>{
    aksiyonlar.push({konu:escapeHtml(m.musteriAdi)+' — '+m.avgVadeGun+' gün gecikme', ilgili:escapeHtml(m.temsilci||'—'), oncelik:'Yüksek', pill:'danger'});
  });
  if(karne && karne.rows){
    karne.rows.filter(r=>r.gerceklesme!=null && r.gerceklesme<70).forEach(r=>{
      aksiyonlar.push({konu:escapeHtml(r.temsilci)+' ekibinde tahsilat hedefin altında', ilgili:'Satış Müdürü', oncelik:'Orta', pill:'warn'});
    });
  }
  document.getElementById('yoAksiyonTbody').innerHTML = aksiyonlar.length
    ? aksiyonlar.map(a=>`<tr><td>${a.konu}</td><td>${a.ilgili}</td><td><span class="pill ${a.pill}">${a.oncelik}</span></td></tr>`).join('')
    : '<tr><td colspan="3" class="empty-state">Aksiyon gerektiren belirgin bir konu yok</td></tr>';
}

// ============================================================================
// 6) TAHSİLAT BAŞARI ORANI (CEI)
// ============================================================================
async function computeCeiAy(report, ayKey, zorla){
  const tv = await computeTahsilatVerimlilikAy(report, ayKey, zorla);
  if(!tv || tv.yok) return {yok:true};
  const {ilkKey, sonKey} = ayGunAraligi(ayKey);
  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);

  let donemIciSatis = 0;
  (birlesikArsiv.faturaArsiv||[]).forEach(r=>{
    if(!r.faturaTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    const gk = dateKeyLocal(r.faturaTarihi);
    if(gk && gk>=ilkKey && gk<=sonKey) donemIciSatis += r.tutar||0;
  });

  const bitisSnap = ((state.faturaArsivCache[tv.bitisGunu] && state.faturaArsivCache[tv.bitisGunu].musteriSnapshot) || []).filter(m=>musteriTvIcinGecerliMi(m.musteri));
  // Vadesi gelen fatura kriteri: fatura vadesi (Net Vade Tarihi) DEĞİL — açık faturaların kalan borcu +
  // Faturadan Sonr. Gün verisi baz alınır (Faturadan Sonr. Gün >= VADE_ESIGI_GUN ise vadesi gelmiş sayılır). Bu
  // dağılım müşteri bazında vadesizBakiye alanında saklanır (bkz. buildReport/canliGunlerleGuncelle).
  // Bu alanın henüz bulunmadığı eski arşiv günleri için, aynı 23 gün eşiği müşterinin genel rapordaki
  // ortalama vade hesaplamasına (avgVadeGun) uygulanarak yaklaşık bir değer üretilir.
  const donemSonuVadesizBakiye = bitisSnap.reduce((a,m)=> a + (m.vadesizBakiye!=null ? m.vadesizBakiye : ((m.avgVadeGun||0)<VADE_ESIGI_GUN ? (m.kalanBorc||0) : 0)), 0);

  const donemBasiBakiye = tv.cariDegisimVarMi ? tv.genel.toplamKalanBorcBaslangic : null;
  const donemSonuBakiye = tv.genel.toplamKalanBorc;
  const tahsilat = tv.genel.toplamTahsilat;

  let cei=null, pay=null, payda=null;
  if(donemBasiBakiye!=null){
    pay = donemBasiBakiye + donemIciSatis - donemSonuBakiye;
    payda = donemBasiBakiye + donemIciSatis - donemSonuVadesizBakiye;
    cei = payda!==0 ? (pay/payda*100) : null;
  }

  return {ayKey, donemBasiBakiye, donemIciSatis, donemSonuBakiye, donemSonuVadesizBakiye, tahsilat, pay, payda, cei,
    tvRows: tv.rows, tvGenel: tv.genel, baslangicYaklasik: tv.baslangicYaklasik};
}

async function computeCeiTrend(report, ayAdedi, zorla){
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  const aylar = Array.from(new Set(gunler.map(g=>g.slice(0,7)))).sort();
  const hedefAylar = aylar.slice(-ayAdedi);
  const seri = [];
  for(const ay of hedefAylar){
    const r = await computeCeiAy(report, ay, zorla);
    if(r && !r.yok && r.cei!=null) seri.push({tarih:ay+'-01', gunKey:ay, cei:r.cei});
  }
  return seri;
}

async function populateCeiAySelect(){
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  // TEMMUZ 2026 ÖNCESİ AYLAR MANUEL OLARAK GİZLENİR (kullanıcı kararı) — bkz. tvMevcutAylar
  // içindeki aynı notu (06-senet-ve-detay.js). Otomatik günlük snapshot mekanizması sadece
  // bugünden itibaren çalıştığı için geçmiş aylarda hiçbir zaman "Kalan Borç" fotoğrafı olmayacak.
  const CEI_MIN_AY_KEY = '2026-07';
  const aylar = Array.from(new Set(gunler.map(g=>g.slice(0,7)))).filter(ay=> ay>=CEI_MIN_AY_KEY).sort();
  const sel = document.getElementById('ceiAySelect');
  const mevcutSecim = state.ceiAy;
  sel.innerHTML = aylar.map(a=>`<option value="${a}">${fmtDate(new Date(a+'-01'))}</option>`).join('');
  if(mevcutSecim && aylar.includes(mevcutSecim)) sel.value = mevcutSecim;
  else if(aylar.length){ sel.value = aylar[aylar.length-1]; state.ceiAy = aylar[aylar.length-1]; }
  else state.ceiAy = null;
}

async function renderCeiView(report, zorla){
  document.getElementById('ceiArsivBilgi').textContent = 'Buluttan yükleniyor…';
  await genelRaporlarIcinArsivGetir(400, zorla);
  await populateCeiAySelect();
  await recomputeAndRenderCei(report, zorla);
}

async function recomputeAndRenderCei(report, zorla){
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  document.getElementById('ceiArsivBilgi').textContent = 'Arşiv Verisi Mevcut';
  const ayKey = state.ceiAy;
  if(!ayKey){
    document.getElementById('ceiBosPanel').style.display='block';
    document.getElementById('ceiKpiGrid').innerHTML='';
    document.getElementById('ceiRepTbody').innerHTML='';
    return;
  }
  const ay = await computeCeiAy(report, ayKey, zorla);
  if(ay.yok || ay.cei==null){
    document.getElementById('ceiBosPanel').style.display='block';
    document.getElementById('ceiKpiGrid').innerHTML='';
    document.getElementById('ceiRepTbody').innerHTML='';
    return;
  }
  document.getElementById('ceiBosPanel').style.display='none';

  const trend = await computeCeiTrend(report, 12, false);

  const items = [
    {label:'Tahsilat Başarı Oranı (CEI)', icon:'<i class="fa-solid fa-calculator" aria-hidden="true"></i>', cls:'accent', value:null, display:fmtYuzde(ay.cei), sub: ay.baslangicYaklasik?'Yaklaşık (Ay Başı Verisi Yok)':(fmtDate(new Date(ayKey+'-01'))+' Ayı')},
    {label:'Dönem Başı Bakiye', icon:'<i class="fa-solid fa-arrow-down" aria-hidden="true"></i>', cls:'neutral', value:ay.donemBasiBakiye},
    {label:'Dönem İçi Satış', icon:'<i class="fa-solid fa-file-invoice" aria-hidden="true"></i>', value:ay.donemIciSatis},
    {label:'Dönem İçi Tahsilat', icon:'<i class="fa-solid fa-money-bill" aria-hidden="true"></i>', cls:'success', value:ay.tahsilat},
    {label:'Dönem Sonu Bakiye', icon:'<i class="fa-solid fa-arrow-up" aria-hidden="true"></i>', cls:'warn', value:ay.donemSonuBakiye},
  ];
  renderKpiHeroRow(items, 'ceiKpiGrid');

  document.getElementById('ceiChartSub').textContent = trend.length.toLocaleString('tr-TR')+' aylık trend';
  renderTrendChart('ceiChart', trend, 'cei', 'var(--accent)', 'yuzde');

  document.getElementById('ceiFormulaBody').innerHTML = `
    <tr><td>Dönem Başı Bakiye</td><td class="num">${TL(ay.donemBasiBakiye)}</td></tr>
    <tr><td>(+) Dönem İçi Satış</td><td class="num">${TL(ay.donemIciSatis)}</td></tr>
    <tr><td>(−) Dönem Sonu Toplam Bakiye</td><td class="num neg">−${TL(ay.donemSonuBakiye)}</td></tr>
    <tr class="formula-total"><td><b>= Pay (Fiilen Tahsil Edilebilen)</b></td><td class="num num-strong">${TL(ay.pay)}</td></tr>
    <tr><td>(−) Dönem Sonu Vadesi Gelmemiş Bakiye</td><td class="num neg">−${TL(ay.donemSonuVadesizBakiye)}</td></tr>
    <tr class="formula-total"><td><b>= Payda (Tahsili Gereken Azami Tutar)</b></td><td class="num num-strong">${TL(ay.payda)}</td></tr>
    <tr class="formula-total"><td><b>CEI = Pay / Payda</b></td><td class="num num-strong" style="color:var(--accent-deep);">${fmtYuzde(ay.cei)}</td></tr>
  `;

  document.getElementById('ceiRepTbody').innerHTML = ay.tvRows.slice().sort((a,b)=>(b.tahsilatOrani||0)-(a.tahsilatOrani||0)).map(r=>{
    const durum = ceiDurumPill(r.tahsilatOrani);
    return `<tr><td>${escapeHtml(r.temsilci)}</td><td class="num">${TL(r.toplamTahsilat+r.toplamKalanBorc)}</td><td class="num num-strong">${TL(r.toplamTahsilat)}</td><td class="num num-strong">${fmtYuzde(r.tahsilatOrani)}</td><td><span class="pill ${durum.cls}">${durum.label}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-state">Kayıt yok</td></tr>';
}
