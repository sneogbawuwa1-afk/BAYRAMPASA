/* ============================== GENEL BAKIŞ (DASHBOARD) ============================== */

// Genel Bakış'taki risk sınıflandırması: ortalama vadeye göre 3 kademe (düşük/orta/yüksek).
// Hukuki Takip'teki (90/180 gün) eşiklerden farklı — burada amaç günlük operasyonel bir özet.
function gbRiskSeviyesi(m){
  const g = Number(m.avgVadeGun)||0;
  if(m.cekSenet>0 && g>30) return 'yuksek';
  if(g>=45) return 'yuksek';
  if(g>=15) return 'orta';
  return 'dusuk';
}
const GB_RISK_META = {
  yuksek: {label:'Yüksek Risk', renk:'var(--danger)'},
  orta:   {label:'Orta Risk',   renk:'var(--warn)'},
  dusuk:  {label:'Düşük Risk',  renk:'var(--success)'},
};

function gbTumMusteriler(report){
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — yalnızca çek/senet riski yazılır.
  const bakiyesizSatirlari = (report.bakiyesiz||[]).map(b=>({
    musteri: b.musteri, musteriAdi: b.musteriAdi, temsilci: b.temsilci,
    kalanBorc: 0, avgVadeGun: null, siparisTutari: b.siparisTutari||0, emanetSiparis: b.emanetSiparis||0,
    cekSenet: b.cekSenet||0, alinanTahsilat: 0, toplamRisk: (b.cekSenet||0),
    invoices: [], __bakiyesiz: true,
  }));
  return report.musteriler.concat(bakiyesizSatirlari);
}

function gbDonutSvg(segments, sizePx){
  // segments: [{value, color}] — basit stroke-dasharray tabanlı donut, ekstra kütüphane gerektirmez.
  const size = sizePx || 104;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const c = size/2;
  const circ = 2 * Math.PI * r;
  const toplam = segments.reduce((s,x)=>s+(x.value||0), 0);
  let offset = 0;
  let arcs = '';
  if(toplam <= 0){
    arcs = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${stroke}"/>`;
  } else {
    segments.forEach(seg=>{
      const frac = (seg.value||0) / toplam;
      if(frac<=0) return;
      const len = frac * circ;
      const gap = circ - len;
      arcs += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
        stroke-dasharray="${len.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"/>`;
      offset += len;
    });
  }
  return `<svg viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);">${arcs}</svg>`;
}

function gbSparkline(seed, color){
  // Gerçek geçmiş zaman serisi verisi tutulmadığından, KPI kartlarındaki mini-grafik yalnızca
  // görsel bir trend ipucu olarak, KPI değerinden türetilmiş sabit (deterministik) bir dalga ile çizilir.
  const w=64,h=22, pts=8;
  let seedNum = 0;
  String(seed).split('').forEach(ch=> seedNum += ch.charCodeAt(0));
  const vals = [];
  for(let i=0;i<pts;i++){
    const n = Math.sin(seedNum*0.7 + i*1.3) * 0.5 + Math.sin(seedNum*0.31 + i*2.1)*0.5;
    vals.push(0.5 + n*0.4);
  }
  const stepX = w/(pts-1);
  const d = vals.map((v,i)=> `${i===0?'M':'L'}${(i*stepX).toFixed(1)},${(h-v*h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderGenelBakisView(report){
  const view = document.getElementById('genelBakisView');
  if(!view) return;
  const bosPanel = document.getElementById('genelBakisBosPanel');
  const icerik = document.getElementById('genelBakisIcerik');
  if(!report){
    // DÜZELTME: Fatura Kontrol bugüne ait kayıtları bulut arşivinden bağımsız gösterebildiği
    // için, kullanıcı "veri var ama Genel Bakış boş" diye bir tutarsızlıkla karşılaşıyordu.
    // Genel Bakış (Sevk gibi) yalnızca state.report'a (işlenmiş Kalemler'e) dayanabilir —
    // artık sessizce boş kalmak yerine sebebi ve tek adımlı çözümü söylüyor.
    if(bosPanel) bosPanel.style.display = 'block';
    if(icerik) icerik.style.display = 'none';
    return;
  }
  if(bosPanel) bosPanel.style.display = 'none';
  if(icerik) icerik.style.display = 'block';

  const musteriler = gbTumMusteriler(report);
  const kpi = report.kpi || computeGenelKPI(report, '');

  const toplamKalanBorc = sum(musteriler,'kalanBorc');
  const toplamCekSenet = sum(musteriler,'cekSenet');
  const toplamRisk = sum(musteriler,'toplamRisk');
  const toplamTahsilat = kpi.toplamTahsilat || 0;
  const vAgirlikli = sum(report.musteriler,'vadeAgirlikliToplam');
  const vBorc = sum(report.musteriler,'agirlikBorc');
  const ortalamaVade = vBorc!==0 ? Math.round(vAgirlikli/vBorc) : null;
  const tahsilatOraniPayda = toplamTahsilat + toplamKalanBorc;
  const tahsilatOrani = tahsilatOraniPayda>0 ? (toplamTahsilat/tahsilatOraniPayda*100) : null;

  // ---- KPI kartları ----
  const kpiDefs = [
    {icon:'fa-coins', label:'Toplam Kalan Borç', value:TL(toplamKalanBorc), color:'var(--navy)'},
    {icon:'fa-circle-half-stroke', label:'Ortalama Vade', value: ortalamaVade!=null ? ortalamaVade+' gün' : '—', color:'var(--accent)'},
    {icon:'fa-triangle-exclamation', label:'Toplam Risk', value:TL(toplamRisk), color:'var(--danger)'},
    {icon:'fa-file-signature', label:'Çek / Senet Riski', value:TL(toplamCekSenet), color:'var(--danger)'},
    {icon:'fa-sack-dollar', label:'Alınan Tahsilat', value:TL(toplamTahsilat), color:'var(--success)'},
    {icon:'fa-percent', label:'Tahsilat Oranı', value: tahsilatOrani!=null ? tahsilatOrani.toFixed(1).replace('.',',')+'%' : '—', color:'var(--accent)'},
  ];
  document.getElementById('gbKpiGrid').innerHTML = kpiDefs.map(k=>`
    <div class="gb-kpi-card">
      <div class="gb-kpi-top"><i class="fa-solid ${k.icon}" aria-hidden="true"></i> ${k.label}</div>
      <div class="gb-kpi-value">${k.value}</div>
      <div class="gb-kpi-foot">
        <span class="gb-kpi-sub">güncel veriye göre</span>
        <span class="gb-kpi-spark">${gbSparkline(k.label+toplamKalanBorc, k.color)}</span>
      </div>
    </div>`).join('');

  // ---- Dikkat banner ----
  const riskliSayisi = report.musteriler.filter(isRiskliMusteri).length;
  const banner = document.getElementById('gbDikkatBanner');
  if(riskliSayisi>0){
    banner.style.display = 'flex';
    document.getElementById('gbDikkatBannerCount').textContent = riskliSayisi.toLocaleString('tr-TR') + ' ';
    document.getElementById('gbDikkatEsikBanner').textContent = VADE_RISK_ESIGI;
    banner.onclick = openDikkatModal;
    // ERİŞİLEBİLİRLİK DÜZELTMESİ: banner HTML'de role="button" + tabindex="0" taşıyor ama
    // yalnızca click dinleniyordu — klavyeyle odaklanıp Enter/Space basan kullanıcı için modal
    // açılmıyordu (aynı davranış Yaşlandırma'daki #dikkatBanner'da zaten mevcut, tutarlılık sağlandı).
    banner.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openDikkatModal(); } };
  } else {
    banner.style.display = 'none';
  }

  // ---- Vade Dağılımı donut ----
  // Kova sınırları ve renkleri ortak AGING_BUCKETS'tan gelir (Yaşlandırma sayfasıyla birebir aynı).
  // NOT (bilinçli tasarım farkı): Bu donut SADECE kalanBorc>0 (gerçekten açık borçlu) müşterileri
  // kapsar — negatif bakiyeli (iade/fazla ödeme/alacaklı) müşteriler buraya hiç girmez. "Toplam
  // Kalan Borç" KPI kartı ise TÜM müşterilerin net bakiyesini (negatifler dahil) toplar. Bu yüzden
  // donut'un toplamı KPI'daki tutardan FARKLI (genelde daha yüksek) çıkabilir — bu bir hata değil,
  // aradaki fark tam olarak negatif bakiyeli müşterilerin toplamı kadardır (aşağıda hesaplanıp
  // kullanıcıya bilgi notu olarak gösterilir).
  const vadeBuckets = AGING_BUCKETS;
  const vadeAmounts = vadeBuckets.map(()=>0);
  let negatifBakiyeToplam = 0;
  musteriler.forEach(m=>{
    if(m.kalanBorc<=0){ negatifBakiyeToplam += m.kalanBorc; return; }
    const g = m.avgVadeGun==null ? 0 : m.avgVadeGun;
    const idx = vadeBuckets.findIndex(b=>b.test(g));
    if(idx>=0) vadeAmounts[idx] += m.kalanBorc;
  });
  const vadeToplam = vadeAmounts.reduce((a,b)=>a+b,0);
  document.getElementById('gbVadeDonutBody').innerHTML = `
    <div class="gb-donut-svg-wrap">
      ${gbDonutSvg(vadeBuckets.map((b,i)=>({value:vadeAmounts[i], color:b.color})), 104)}
      <div class="gb-donut-center">
        <div class="gb-donut-center-lbl">Toplam</div>
        <div class="gb-donut-center-big">${gbKisaTL(vadeToplam)}</div>
      </div>
    </div>
    <div class="gb-donut-legend">
      ${vadeBuckets.map((b,i)=>`<div class="gb-donut-legend-row"><span class="dot" style="background:${b.color}"></span>${b.label}<span class="amt">${gbKisaTL(vadeAmounts[i])} (${vadeToplam>0?(vadeAmounts[i]/vadeToplam*100).toFixed(1):'0'}%)</span></div>`).join('')}
    </div>`;
  const gbVadeDonutNotEl = document.getElementById('gbVadeDonutNot');
  if(gbVadeDonutNotEl){
    gbVadeDonutNotEl.textContent = negatifBakiyeToplam < 0
      ? `ℹ️ Bu toplam yalnızca açık (pozitif) bakiyeli müşterileri kapsar; ${TL(Math.abs(negatifBakiyeToplam))} tutarındaki negatif bakiyeli (iade/alacaklı) müşteriler "Toplam Kalan Borç" KPI'sında var ama buraya dahil değildir — aradaki fark bundandır.`
      : '';
  }

  // ---- Risk Dağılımı donut ----
  const riskKeys = ['yuksek','orta','dusuk'];
  const riskAmounts = {yuksek:0, orta:0, dusuk:0};
  musteriler.forEach(m=>{ riskAmounts[gbRiskSeviyesi(m)] += (m.toplamRisk||0); });
  const riskToplam = riskKeys.reduce((s,k)=>s+riskAmounts[k],0);
  const bakinizRiskin = riskKeys.reduce((best,k)=> riskAmounts[k]>riskAmounts[best] ? k : best, 'yuksek');
  document.getElementById('gbRiskDonutBody').innerHTML = `
    <div class="gb-donut-svg-wrap">
      ${gbDonutSvg(riskKeys.map(k=>({value:riskAmounts[k], color:GB_RISK_META[k].renk})), 104)}
      <div class="gb-donut-center">
        <div class="gb-donut-center-lbl" style="color:${GB_RISK_META[bakinizRiskin].renk};font-weight:700;">${GB_RISK_META[bakinizRiskin].label}</div>
        <div class="gb-donut-center-big">${gbKisaTL(riskToplam)}</div>
      </div>
    </div>
    <div class="gb-donut-legend">
      ${riskKeys.map(k=>`<div class="gb-donut-legend-row"><span class="dot" style="background:${GB_RISK_META[k].renk}"></span>${GB_RISK_META[k].label}<span class="amt">%${riskToplam>0?(riskAmounts[k]/riskToplam*100).toFixed(0):'0'} (${gbKisaTL(riskAmounts[k])})</span></div>`).join('')}
    </div>`;

  // ---- Tahsilat Performansı donut ----
  document.getElementById('gbTahsilatDonutBody').innerHTML = `
    <div class="gb-donut-svg-wrap">
      ${gbDonutSvg([{value:toplamTahsilat, color:'var(--success)'},{value:toplamKalanBorc, color:'var(--navy-soft)'}], 104)}
      <div class="gb-donut-center">
        <div class="gb-donut-center-big">${tahsilatOrani!=null?tahsilatOrani.toFixed(1).replace('.',','):'—'}%</div>
        <div class="gb-donut-center-lbl">Tahsilat Oranı</div>
      </div>
    </div>
    <div class="gb-donut-legend">
      <div class="gb-donut-legend-row"><span class="dot" style="background:var(--success)"></span>Alınan Tahsilat<span class="amt">${TL(toplamTahsilat)}</span></div>
      <div class="gb-donut-legend-row"><span class="dot" style="background:var(--navy-soft)"></span>Kalan Borç<span class="amt">${TL(toplamKalanBorc)}</span></div>
      <div class="gb-donut-legend-row"><span class="dot" style="background:var(--danger)"></span>Toplam Risk<span class="amt">${TL(toplamRisk)}</span></div>
    </div>`;

  populateTemsilciFilter(report.musteriler, 'gbTemsilciFilter');

  // ---- Müşteri arama/filtre/sırala + kart grid ----
  state.gbRiskFiltre = state.gbRiskFiltre || 'all';
  renderGbMusteriGrid(report);
  renderGbSidePanels(report);
}

function gbKisaTL(n){
  n = Math.round(n||0);
  if(Math.abs(n) >= 1000000) return (n/1000000).toFixed(1).replace('.',',') + 'M ₺';
  if(Math.abs(n) >= 1000) return (n/1000).toFixed(0) + 'K ₺';
  return n.toLocaleString('tr-TR') + ' ₺';
}

function renderGbMusteriGrid(report){
  const q = document.getElementById('gbSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('gbTemsilciFilter').value;
  const sortKey = document.getElementById('gbSortSelect').value;
  // gbRiskFiltre artık risk seviyesi değil, "Nokta Detay" başlığındaki çiplerin seçili
  // olanı: 'all' (Tümü — sıralama menüsü geçerli), 'ortVade' (Ort Vade büyükten küçüğe),
  // 'hakedis' (Hakediş kaydı olanlar, A-Z) veya 'emanet' (Ticari Stok/Emanet kaydı
  // olanlar, A-Z). Çip seçiliyken üstteki sıralama menüsü devre dışı kalır.
  const chipFiltre = state.gbRiskFiltre || 'all';

  // Hakediş/Emanet çipleri için müşteri kodu → kayıt var mı eşlemesi. Sıralama
  // menüsündeki eski "hakedisTutar" seçeneği kaldırıldığı için burada yalnızca
  // çip bazlı hakediş tutarına ihtiyaç var (Hakediş çipinde A-Z sıralanıyor,
  // tutara göre değil — ama kayıt var/yok kontrolü için map yine gerekli).
  let hakedisKodMap = null, stokKodSeti = null;
  if(chipFiltre === 'hakedis'){
    hakedisKodMap = new Set();
    const rapor = state.bayiHakedisReport;
    if(rapor && Array.isArray(rapor.noktalar)){
      rapor.noktalar.forEach(n=>{ hakedisKodMap.add(n.kod); });
    }
  }
  if(chipFiltre === 'emanet'){
    stokKodSeti = ticariStokluMusteriKodlari();
  }

  let rows = gbTumMusteriler(report).filter(m=>{
    if(q && !musteriAramaEslesiyorMu(q, m.musteriAdi, m.musteri, m.musteriUnvan) && !String(m.temsilci).toLocaleLowerCase('tr-TR').includes(q)) return false;
    if(temsilci && m.temsilci !== temsilci) return false;
    // Hakediş/Emanet çipleri seçiliyken, ilgili raporda hiç kaydı olmayan müşteriler
    // listeden tamamen çıkarılıyor.
    if(chipFiltre === 'hakedis' && !hakedisKodMap.has(m.musteri)) return false;
    if(chipFiltre === 'emanet' && !stokKodSeti.has(m.musteri)) return false;
    return true;
  });

  rows = rows.slice().sort((a,b)=>{
    if(chipFiltre === 'ortVade') return (b.avgVadeGun||0) - (a.avgVadeGun||0);
    if(chipFiltre === 'hakedis' || chipFiltre === 'emanet'){
      return String(a.musteriAdi).localeCompare(String(b.musteriAdi),'tr');
    }
    // Çip 'all' iken üstteki sıralama menüsü (Kalan Borç/Ortalama Vade/Toplam Risk/Ad) geçerli.
    if(sortKey==='musteriAdi') return String(a.musteriAdi).localeCompare(String(b.musteriAdi),'tr');
    const av = a[sortKey]||0, bv = b[sortKey]||0;
    return bv-av;
  });

  document.getElementById('gbMusteriCount').textContent = rows.length.toLocaleString('tr-TR') + ' müşteri';

  const gosterilecekSayi = Math.min(state.gbGosterilen || 16, rows.length);
  const gosterilecekRows = rows.slice(0, gosterilecekSayi);
  const grid = document.getElementById('gbMusteriGrid');

  if(!rows.length){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Filtreyle eşleşen müşteri bulunamadı.</div>`;
    document.getElementById('gbDahaFazlaWrap').style.display = 'none';
    return;
  }

  const hakedisKodlari = bayiHakedisliMusteriKodlari();
  const stokKodlari = ticariStokluMusteriKodlari();
  grid.innerHTML = gosterilecekRows.map(m=>{
    state.faturaModalYedekMap.set(m.musteri, m);
    const risk = hukukiRiskSeviyesi(m.avgVadeGun);
    const vadeRenk = ortVadeRenk(m.avgVadeGun);
    return `<div class="htk-card" data-musteri="${escapeHtml(m.musteri)}" style="--htk-risk:${risk.renk};--htk-risk-bg:${risk.bg};">
      <div class="htk-head">
        <div style="min-width:0;">
          <div class="htk-musteri-row">
            <span class="htk-musteri">${escapeHtml(m.musteriAdi)}</span>
          </div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(m.temsilci||'—')}</div>
        </div>
        <div class="htk-badge-col">
          <span class="htk-badge-vade" style="border-color:${vadeRenk.renk};"><span class="htk-badge-vade-num" style="color:${vadeRenk.renk};">${Math.round(m.avgVadeGun)||0}</span><span class="htk-badge-vade-lbl" style="color:${vadeRenk.renk};">Ort. Vade</span></span>
          ${isRiskliMusteri(m)?'<span class="badge dikkat" title="Ortalama vade '+VADE_RISK_ESIGI+' gün ve üzeri"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Dikkat</span>':''}${hakedisRozeti(m.musteri, hakedisKodlari)}${emanetRozeti(m.musteri, stokKodlari)}
        </div>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${TL(m.kalanBorc)}</span>
      </div>
      <div class="htk-inline-stats">
        <div class="htk-stat-item"><span class="l">Sipariş</span><span class="v${m.siparisTutari>0?' c-siparis':' zero'}">${m.siparisTutari>0?TL(m.siparisTutari):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Sevk Ert.</span><span class="v${m.emanetSiparis>0?' c-sevk':' zero'}">${m.emanetSiparis>0?TL(m.emanetSiparis):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Tahsilat</span><span class="v${m.alinanTahsilatKartGosterge>0?' c-tahsilat':' zero'}">${m.alinanTahsilatKartGosterge>0?TL(m.alinanTahsilatKartGosterge):'—'}</span></div>
      </div>
      <div class="htk-alt">
        <span class="htk-ceksenet">Çek/Senet: ${TL(m.cekSenet||0)}</span>
        <div class="htk-alt-actions">
          <button type="button" class="btn small gb-senet-btn" data-musteri="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}" data-tutar="${m.siparisTutari||0}" data-emanet="${m.emanetSiparis||0}" data-kalan-borc="${m.kalanBorc||0}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Senet</button>
          <button type="button" class="nokta-detay-btn primary gb-detay-btn" data-musteri="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}">Detay ↗</button>
        </div>
      </div>
    </div>`;
  }).join('');

  if(rows.length > gosterilecekSayi){
    document.getElementById('gbDahaFazlaWrap').style.display = 'flex';
  } else {
    document.getElementById('gbDahaFazlaWrap').style.display = 'none';
  }

  grid.querySelectorAll('.gb-detay-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const musteriKod = btn.getAttribute('data-musteri');
      const musteriAdi = btn.getAttribute('data-musteri-adi');
      faturaModalAc(musteriKod, musteriAdi);
    });
  });
  grid.querySelectorAll('.gb-senet-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const musteriKod = btn.getAttribute('data-musteri');
      const musteriAdi = btn.getAttribute('data-musteri-adi');
      const tutar = Number(btn.getAttribute('data-tutar'))||0;
      const emanet = Number(btn.getAttribute('data-emanet'))||0;
      const kalanBorc = Number(btn.getAttribute('data-kalan-borc'))||0;
      senetModalAc(musteriKod, musteriAdi, tutar, emanet, kalanBorc);
    });
  });
}

document.getElementById('gbSearchInput')?.addEventListener('input', debounce(()=>{
  updateGbSearchClearBtn();
  state.gbGosterilen = 16;
  if(state.report) renderGbMusteriGrid(state.report);
}, 180));
function updateGbSearchClearBtn(){
  const val = document.getElementById('gbSearchInput').value;
  document.getElementById('gbSearchClearBtn').style.display = val ? 'flex' : 'none';
}
document.getElementById('gbSearchClearBtn')?.addEventListener('click', ()=>{
  document.getElementById('gbSearchInput').value = '';
  updateGbSearchClearBtn();
  if(state.report) renderGbMusteriGrid(state.report);
});
document.getElementById('gbTemsilciFilter')?.addEventListener('change', ()=>{ state.gbGosterilen=16; if(state.report) renderGbMusteriGrid(state.report); });
document.getElementById('gbSortSelect')?.addEventListener('change', ()=>{ state.gbGosterilen=16; if(state.report) renderGbMusteriGrid(state.report); });
document.getElementById('gbDahaFazlaBtn')?.addEventListener('click', ()=>{
  state.gbGosterilen = (state.gbGosterilen||16) + 16;
  if(state.report) renderGbMusteriGrid(state.report);
});
document.getElementById('gbTumunuGorBtn')?.addEventListener('click', ()=>{
  state.gbGosterilen = 100000;
  if(state.report) renderGbMusteriGrid(state.report);
  document.getElementById('gbMusteriPanel')?.scrollIntoView({behavior:'smooth', block:'start'});
});
document.getElementById('gbDurumSellOutBtn')?.addEventListener('click', ()=> setActiveView('sellOut'));
document.querySelectorAll('#gbRiskChipFilters .gb-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#gbRiskChipFilters .gb-chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    state.gbRiskFiltre = chip.getAttribute('data-risk');
    state.gbGosterilen = 16;
    if(state.report) renderGbMusteriGrid(state.report);
  });
});

// İnce, yuvarlak uçlu tek-renk "gerçekleşme" halkası (görseldeki Toplam Litre kartındaki gibi).
function gbRealizasyonRingSvg(oran){
  const size = 96, stroke = 9;
  const r = (size - stroke) / 2;
  const c = size/2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (oran||0)/100));
  const len = pct * circ;
  return `<svg viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#F0DCA6" stroke-width="${stroke}"
      stroke-dasharray="${len.toFixed(2)} ${(circ-len).toFixed(2)}" stroke-linecap="round"/>
  </svg>`;
}

// ---- Sağ panel: Güncel Durum + Son Aktiviteler (gerçek veriden özet) ----
function renderGbSidePanels(report){
  // Açık/Kapalı Kanal litre verileri Sell Out Raporu'ndan gelir — Sell Out Raporu'nun kendi üst
  // KPI şeridiyle AYNI ortak fonksiyon (sellOutKanalOzeti) kullanılır, ayrı bir hesap yapılmaz.
  const sellOutRaw = state.sellOutReport;
  const sellOutProcessed = sellOutRaw ? applySellOutHedef(sellOutRaw, state.sellOutHedef) : null;
  const {toplamAcikLitre, toplamKapaliLitre, acikKalan, kapaliKalan, toplamLitre: sellOutToplamLitre} = sellOutKanalOzeti(sellOutProcessed);
  // Genel "Gerçekleşme Oranı" ve "Toplam Litre" — Geleneksel Kanal (Açık+Kapalı) hedefiyle
  // Modern Kanal'ın (İbrahim Işık) Key Account Hedefi ve satışı TOPLANARAK hesaplanır; Modern
  // Kanal kendi ayrı hedef girişine sahip olsa da, genel toplam sayılarda tek bir birleşik
  // oran/litre olarak yansır (tahsilat/FKNS gibi metriklere ise hiç karışmaz).
  const modernKanalLitre = state.modernKanalReport ? (state.modernKanalReport.toplamLitre||0) : 0;
  const modernKanalHedefDeger = state.modernKanalHedef||0;
  const sellOutHedefToplam = sellOutProcessed && Array.isArray(sellOutProcessed.temsilciler)
    ? sellOutProcessed.temsilciler.reduce((a,t)=>a+(t.acikHedef||0)+(t.kapaliHedef||0), 0)
    : 0;
  const toplamLitre = sellOutToplamLitre + modernKanalLitre;
  const toplamHedefBirlesik = sellOutHedefToplam + modernKanalHedefDeger;
  const gerceklesmeOrani = toplamHedefBirlesik>0 ? (toplamLitre/toplamHedefBirlesik*100) : null;
  const gerceklesmeOraniGosterim = gerceklesmeOrani!=null ? gerceklesmeOrani : 0;

  const durumRows = [
    {ic:'fa-box', cls:'navy', label:'Toplam Açık Kanal LT', val: LT(toplamAcikLitre)},
    {ic:'fa-box', cls:'warn', label:'Toplam Kapalı Kanal LT', val: LT(toplamKapaliLitre)},
    {ic:'fa-store', cls:'success', label:'Açık Kanal Kalan Litre', val: LT(acikKalan)},
    {ic:'fa-users', cls:'danger', label:'Kapalı Kanal Kalan Litre', val: LT(kapaliKalan)},
  ];
  document.getElementById('gbDurumList').innerHTML = durumRows.map(r=>`
    <div class="gb-durum-row ${r.cls}">
      <div class="gb-durum-ic ${r.cls}"><i class="fa-solid ${r.ic}" aria-hidden="true"></i></div>
      <div class="gb-durum-text"><div class="gb-durum-label">${r.label}</div><div class="gb-durum-val">${r.val}</div></div>
    </div>`).join('');

  document.getElementById('gbRealizasyonCard').innerHTML = `
    <svg class="gb-realizasyon-dots" viewBox="0 0 70 50" aria-hidden="true">
      ${Array.from({length:24}).map((_,i)=>`<circle cx="${(i%8)*9+3}" cy="${Math.floor(i/8)*16+5}" r="1.4" fill="#F0DCA6" opacity="${0.15+((i%3)*0.12)}"/>`).join('')}
    </svg>
    <div class="gb-realizasyon-ring">
      ${gbRealizasyonRingSvg(gerceklesmeOraniGosterim)}
      <div class="gb-realizasyon-ring-center">
        <div class="gb-realizasyon-ring-pct">${gerceklesmeOraniGosterim.toFixed(0)}%</div>
        <div class="gb-realizasyon-ring-lbl">Gerçekleşme<br>Oranı</div>
      </div>
    </div>
    <div class="gb-realizasyon-info">
      <div class="gb-realizasyon-label">Toplam Litre</div>
      <div class="gb-realizasyon-value">${Math.round(toplamLitre).toLocaleString('tr-TR')} L</div>
      <div class="gb-realizasyon-bar"><div class="gb-realizasyon-bar-fill" style="width:${Math.max(gerceklesmeOraniGosterim,3).toFixed(1)}%;"></div></div>
    </div>`;

  const riskliSayisi = report.musteriler.filter(isRiskliMusteri).length;
  document.getElementById('gbAktiviteList').innerHTML = `
    <div class="gb-aktivite-row">
      <div class="gb-aktivite-ic navy"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></div>
      <div class="gb-aktivite-text"><div class="gb-aktivite-title">Rapor güncellendi</div><div class="gb-aktivite-sub">${report.musteriler.length.toLocaleString('tr-TR')} müşteri verisi işlendi</div></div>
    </div>
    <div class="gb-aktivite-row">
      <div class="gb-aktivite-ic success"><i class="fa-solid fa-sack-dollar" aria-hidden="true"></i></div>
      <div class="gb-aktivite-text"><div class="gb-aktivite-title">Tahsilat özeti hazır</div><div class="gb-aktivite-sub">${TL(report.kpi ? report.kpi.toplamTahsilat : 0)} tahsilat kaydedildi</div></div>
    </div>
    <div class="gb-aktivite-row">
      <div class="gb-aktivite-ic accent"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
      <div class="gb-aktivite-text"><div class="gb-aktivite-title">Risk taraması tamamlandı</div><div class="gb-aktivite-sub">${riskliSayisi.toLocaleString('tr-TR')} müşteri dikkat listesinde</div></div>
    </div>`;
}

// DAYANIKLILIK: Buluttan/cihazdan gelen bir rapor ESKİ bir sürümden kalmış olabilir ve o zamanlar
// var olmayan alanlar (bakiyesiz, kpi, ticariStok, invoices vb.) içinde bulunmayabilir. Bu durumda
// computeGenelKPI gibi fonksiyonlar 'undefined.reduce'/'undefined.toplamTahsilat' ile ÇÖKÜYORDU.
// Aşağıdaki normalize, eksik alanları güvenli varsayılanlarla doldurur — böylece hangi sürümden
// gelirse gelsin rapor render edilebilir (veri kaybı olmadan; sadece eksik alanlar boş sayılır).
function raporuNormalizeEt(report){
  if(!report || typeof report !== 'object') return report;
  if(!Array.isArray(report.musteriler)) report.musteriler = [];
  if(!Array.isArray(report.bakiyesiz)) report.bakiyesiz = [];
  if(!Array.isArray(report.invoices)) report.invoices = [];
  // ticariStok bir OBJEDİR ({rows:[], ozet:[]}) — dizi değil. Eksik/bozuksa güvenli obje yap.
  if(!report.ticariStok || typeof report.ticariStok !== 'object' || Array.isArray(report.ticariStok)){
    report.ticariStok = { rows: [], ozet: [] };
  }else{
    if(!Array.isArray(report.ticariStok.rows)) report.ticariStok.rows = [];
    if(!Array.isArray(report.ticariStok.ozet)) report.ticariStok.ozet = [];
  }
  if(!Array.isArray(report.siparisArsiv)) report.siparisArsiv = [];
  if(!Array.isArray(report.tahsilatArsiv)) report.tahsilatArsiv = [];
  if(!Array.isArray(report.faturaArsiv)) report.faturaArsiv = [];
  if(!Array.isArray(report.bayiHakedis)) report.bayiHakedis = [];
  if(!Array.isArray(report.bozukIadeTahsilat)) report.bozukIadeTahsilat = [];
  if(!report.kpi || typeof report.kpi !== 'object'){
    report.kpi = { toplamTahsilat:0, tahsilatEslesmeyenToplam:0 };
  }else{
    if(report.kpi.toplamTahsilat == null) report.kpi.toplamTahsilat = 0;
    if(report.kpi.tahsilatEslesmeyenToplam == null) report.kpi.tahsilatEslesmeyenToplam = 0;
  }
  return report;
}

function renderReport(report){
  raporuNormalizeEt(report);
  refreshGenelKPIs(report);
  populateTemsilciFilter(report.musteriler, 'temsilciFilter');
  populateTemsilciFilter(report.musteriler, 'sevkTemsilciFilter');
  populateTemsilciFilter(report.musteriler, 'dikkatTemsilciFilter');
  populateTemsilciFilter(report.musteriler, 'faturaKontrolTemsilciFilter');
  renderDikkatPanel(report);
  renderMusteriTable(report);
  renderAgingPanel(report);
  renderSevkView(report);
  renderRepGrid(report.temsilciler);
  renderYaslandirmaView(report);
  renderTicariStokView(report);
  renderGenelBakisView(report);
  if(typeof renderRutView==='function') renderRutView();
  renderAppHeaderBadges(report);
}

// Üst header'daki tarih göstergesi — tüm sayfalarda ortak olduğu için her raporda bir kez,
// Genel Bakış'a özel olmadan güncellenir.
function renderAppHeaderBadges(report){
  const dateEl = document.getElementById('appDateChipText');
  if(dateEl){
    const asOf = report && report.asOf ? new Date(report.asOf) : turkiyeBugun();
    dateEl.textContent = asOf.toLocaleDateString('tr-TR');
  }
}

const FINANSAL_ANALIZ_VIEWS = ['temsilciKarnesi','tahsilatVerimlilik','cei','nakitAkis','supheliAlacak','dsoTrend','prim','yonetimOzeti'];
const CARI_DETAY_VIEWS = ['genel','yaslandirma'];
const DAGITIM_VIEWS = ['sevk','faturaKontrol','yukleme','ticariStok'];
const BAYI_SATIS_VIEWS = ['sellOut','modernKanal','stokGun'];
const TAB_DROPDOWNS = [
  {btn: document.getElementById('tabbtn-cariDetay'), menu: document.getElementById('cariDetayDropdownMenu'), views: CARI_DETAY_VIEWS},
  {btn: document.getElementById('tabbtn-dagitim'), menu: document.getElementById('dagitimDropdownMenu'), views: DAGITIM_VIEWS},
  {btn: document.getElementById('tabbtn-bayiSatis'), menu: document.getElementById('bayiSatisDropdownMenu'), views: BAYI_SATIS_VIEWS},
  {btn: document.getElementById('tabbtn-finansalAnaliz'), menu: document.getElementById('finansalDropdownMenu'), views: FINANSAL_ANALIZ_VIEWS},
];
function closeDropdown(d){
  d.menu.classList.remove('open');
  d.btn.setAttribute('aria-expanded','false');
  d.menu.setAttribute('aria-hidden','true');
}
function closeAllDropdowns(except){
  TAB_DROPDOWNS.forEach(d=>{ if(d!==except) closeDropdown(d); });
}
function openDropdown(d){
  closeAllDropdowns(d);
  const r = d.btn.getBoundingClientRect();
  const menuWidth = d.menu.offsetWidth || 238;
  let left = r.left;
  const maxLeft = window.innerWidth - menuWidth - 8;
  if(left > maxLeft) left = Math.max(8, maxLeft);
  d.menu.style.top = (r.bottom + 6) + 'px';
  d.menu.style.left = left + 'px';
  d.menu.classList.add('open');
  d.btn.setAttribute('aria-expanded','true');
  d.menu.setAttribute('aria-hidden','false');
}
TAB_DROPDOWNS.forEach(d=>{
  d.btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(d.menu.classList.contains('open')) closeDropdown(d); else openDropdown(d);
  });
});
document.addEventListener('click', (e)=>{
  TAB_DROPDOWNS.forEach(d=>{
    if(d.menu.classList.contains('open') && !d.menu.contains(e.target) && e.target!==d.btn && !d.btn.contains(e.target)){
      closeDropdown(d);
    }
  });
});
window.addEventListener('resize', ()=>{ TAB_DROPDOWNS.forEach(d=>{ if(d.menu.classList.contains('open')) openDropdown(d); }); });
document.querySelector('.tabbar')?.addEventListener('scroll', ()=>closeAllDropdowns(), {passive:true});

const ALL_VIEW_IDS = ['genelBakis','rut','genel','sevk','yukleme','yaslandirma','ticariStok','faturaKontrol','bayiHakedis','sellOut','modernKanal','stokGun','tahsilatVerimlilik','dsoTrend','nakitAkis','supheliAlacak','temsilciKarnesi','prim','yonetimOzeti','cei'];

// ---- Sol sidebar: alt menü (Cari Detay / Dağıtım / Finansal Analiz) aç/kapa ----
const SB_SUBMENUS = [
  {btn: document.getElementById('sbbtn-cariDetay'), menu: document.getElementById('sbSubCariDetay'), views: CARI_DETAY_VIEWS},
  {btn: document.getElementById('sbbtn-dagitim'), menu: document.getElementById('sbSubDagitim'), views: DAGITIM_VIEWS},
  {btn: document.getElementById('sbbtn-bayiSatis'), menu: document.getElementById('sbSubBayiSatis'), views: BAYI_SATIS_VIEWS},
  {btn: document.getElementById('sbbtn-finansalAnaliz'), menu: document.getElementById('sbSubFinansal'), views: FINANSAL_ANALIZ_VIEWS},
].filter(x=>x.btn && x.menu);
SB_SUBMENUS.forEach(s=>{
  s.btn.addEventListener('click', ()=>{
    const willOpen = !s.menu.classList.contains('open');
    const collapsedMode = document.getElementById('appSidebar')?.classList.contains('collapsed');
    if(collapsedMode && willOpen){
      // Daraltılmış (icon-rail) modda aynı anda yalnızca bir flyout açık olmalı — açılmadan
      // önce diğer tüm alt menüleri kapatıyoruz ki üst üste binmesinler.
      SB_SUBMENUS.forEach(o=>{
        if(o===s) return;
        o.menu.classList.remove('open');
        o.btn.classList.remove('open');
        o.btn.setAttribute('aria-expanded','false');
        o.menu.style.top = '';
      });
    }
    s.menu.classList.toggle('open', willOpen);
    s.btn.classList.toggle('open', willOpen);
    s.btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if(willOpen && !collapsedMode && typeof window.positionSbExpandedFlyout === 'function'){
      window.positionSbExpandedFlyout(s.btn, s.menu);
    }
    if(!willOpen) s.menu.style.top = '';
    // Flyout (daraltılmış/icon-rail moddaki yüzen alt menü) açıkken arka plan sayfa
    // kaydırılabiliyordu — bu görsel olarak menünün "yarım kapanmış" gibi durmasına
    // ve kullanıcının menüyü kaybetmesine neden oluyordu. collapsedMode'da açılan
    // her flyout için body scroll'unu modal'lardaki gibi kilitliyoruz.
    if(collapsedMode){
      document.body.classList.toggle('sb-flyout-open', willOpen);
    }
  });
});

// ===== RAPOR GEÇİŞ YÜKLEME OVERLAY'İ =====
// setActiveView() içinde bazı render fonksiyonları async'tir (bazıları buluttan veri çeker —
// örn. sellOutYenile). Bu çağrılar await edilmeden önce kullanıcı geçtiği view'ı boş/eski
// haliyle görüyordu, veri "aniden" beliriyordu. Aşağıdaki iki yardımcı, ilgili view'ın kendi
// kapsayıcısı üzerine (yalnızca o alanı kaplayan, sidebar/başlığı etkilemeyen) markaya uygun
// bir "Rapor yükleniyor" kartı bindirir/kaldırır.
function viewYuklemeOverlayGoster(viewId){
  const el = document.getElementById(viewId+'View');
  if(!el) return;
  if(getComputedStyle(el).position === 'static') el.style.position = 'relative';
  let overlay = el.querySelector(':scope > .view-yukleme-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.className = 'view-yukleme-overlay';
    overlay.innerHTML = '<div class="view-yukleme-karti"><div class="view-yukleme-spin"></div><span class="view-yukleme-metin">Rapor yükleniyor…</span></div>';
    el.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}
function viewYuklemeOverlayGizle(viewId){
  const el = document.getElementById(viewId+'View');
  const overlay = el && el.querySelector(':scope > .view-yukleme-overlay');
  if(overlay) overlay.style.display = 'none';
}
// Hangi view'ların render fonksiyonu async'tir (buluttan veri çekebilir/ağır hesaplama
// yapabilir) — sadece bunlar için geçiş overlay'i gösterilir; senkron olanlarda (genelBakis,
// sevk, yaslandirma, ticariStok, bayiHakedis, supheliAlacak) zaten anlık render olduğundan
// overlay'e gerek yoktur.
const ASYNC_RENDER_VIEWLER = new Set(['yukleme','faturaKontrol','sellOut','modernKanal',
  'stokGun','tahsilatVerimlilik','dsoTrend','nakitAkis','temsilciKarnesi','yonetimOzeti','cei']);

async function setActiveView(view){
  // Üst sekme çubuğu (mobil/dar ekran) ve sidebar linklerini birlikte senkronize et.
  document.querySelectorAll('.tab-btn[data-view]').forEach(b=>{
    const match = b.getAttribute('data-view')===view;
    b.classList.toggle('active', match);
    b.setAttribute('aria-selected', match ? 'true' : 'false');
  });
  TAB_DROPDOWNS.forEach(d=> d.btn.classList.toggle('active', d.views.includes(view)));

  document.querySelectorAll('.sb-nav-link[data-view]').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-view')===view);
  });
  SB_SUBMENUS.forEach(s=>{
    const isActiveGroup = s.views.includes(view);
    s.btn.classList.toggle('active', isActiveGroup);
    if(isActiveGroup && !s.menu.classList.contains('open')){
      s.menu.classList.add('open');
      s.btn.classList.add('open');
      s.btn.setAttribute('aria-expanded','true');
      if(typeof window.positionSbExpandedFlyout === 'function') window.positionSbExpandedFlyout(s.btn, s.menu);
    }
  });

  ALL_VIEW_IDS.forEach(id=>{
    const el = document.getElementById(id+'View');
    if(el) el.style.display = (id===view) ? 'block' : 'none';
  });

  if(ASYNC_RENDER_VIEWLER.has(view)) viewYuklemeOverlayGoster(view);
  try{
    if(view==='genelBakis') renderGenelBakisView(state.report);
    if(view==='rut' && typeof renderRutView==='function') renderRutView();
    if(view==='sevk') renderSevkView(state.report);
    if(view==='yukleme') await renderYuklemeView();
    if(view==='yaslandirma' && state.report) renderYaslandirmaView(state.report);
    if(view==='ticariStok' && state.report) renderTicariStokView(state.report);
    if(view==='faturaKontrol' && state.report) await renderFaturaKontrolView(state.report);
    if(view==='bayiHakedis') renderBayiHakedisView();
    if(view==='sellOut') await renderSellOutView();
    if(view==='modernKanal') await renderModernKanalView();
    if(view==='stokGun') await renderStokGunView();
    if(view==='tahsilatVerimlilik' && state.report) await renderTahsilatVerimlilikView(state.report);
    if(view==='dsoTrend' && state.report) await renderDsoTrendView(state.report);
    if(view==='nakitAkis' && state.report) await renderNakitAkisView(state.report);
    if(view==='supheliAlacak' && state.report) renderSupheliAlacakView(state.report);
    if(view==='temsilciKarnesi' && state.report) await renderTemsilciKarnesiView(state.report);
    if(view==='yonetimOzeti' && state.report) await renderYonetimOzetiView(state.report);
    if(view==='cei' && state.report) await renderCeiView(state.report);
    if(view==='prim' && state.report) await renderPrimView(state.report);
  }finally{
    if(ASYNC_RENDER_VIEWLER.has(view)) viewYuklemeOverlayGizle(view);
  }
  // AÇILIŞ EKRANI KALDIRILDI (kullanıcı kararı): report yokken YUKARIDAKİ "&& state.report" şartı
  // yüzünden bu render fonksiyonları hiç çağrılmıyor — ama view'ın kendi HTML kapsayıcısı zaten
  // ALL_VIEW_IDS döngüsünde display:block yapılmış oluyor. Düzeltme öncesi kullanıcı, rapor yokken
  // bu sekmelere tıklarsa TAMAMEN BOŞ bir sayfa görüyordu (dsoTrend/cei hariç, onların zaten kendi
  // bosPanel'i vardı). Şimdi, henüz kendi özel boş-durum paneli olmayan sekmeler için TEK NOKTADAN,
  // güvenli/genel bir "Rapor henüz oluşturulmadı" mesajı gösterilir. ÖNEMLİ (veri güvenliği):
  // view'ın innerHTML'i DEĞİŞTİRİLMEZ (bu, ileride rapor oluştuğunda render fonksiyonlarının
  // aradığı elementleri kalıcı olarak silip onları sessizce bozabilirdi) — bunun yerine görünmez/
  // absolute bir overlay div EKLENIR, orijinal içerik CSS ile (visibility) gizlenir ama DOM'da
  // olduğu gibi kalır; rapor geldiğinde overlay kaldırılır ve içerik normal şekilde render edilir.
  const KENDI_BOS_PANELI_OLMAYAN_VIEWLER = new Set(['yaslandirma','ticariStok','faturaKontrol',
    'tahsilatVerimlilik','nakitAkis','supheliAlacak','temsilciKarnesi','yonetimOzeti']);
  if(KENDI_BOS_PANELI_OLMAYAN_VIEWLER.has(view)){
    const el = document.getElementById(view+'View');
    if(el){
      let overlay = el.querySelector(':scope > .gvy-genel-bos-durum');
      if(!state.report){
        if(!overlay){
          overlay = document.createElement('div');
          overlay.className = 'bos-durum gvy-genel-bos-durum';
          overlay.style.cssText = 'padding:60px 20px;text-align:center;';
          overlay.innerHTML = `<i class="fa-solid fa-file-circle-question" aria-hidden="true" style="font-size:28px;color:var(--ink-faint);"></i>
            <div style="font-size:15px;font-weight:600;margin:12px 0 4px;">Bugünün raporu henüz oluşturulmadı</div>
            <div style="font-size:12.5px;color:var(--ink-soft);">Bu ekran, işlenmiş rapor verisine dayanır. Üst köşedeki <b>Veri Yükle</b> panelinden Kalemler/Müşteri Master/Cari Ekstre yükleyip "Raporu Oluştur"a basın.</div>`;
          el.insertBefore(overlay, el.firstChild);
        }
        Array.from(el.children).forEach(child=>{ if(child!==overlay) child.style.display='none'; });
        overlay.style.display = 'block';
      }else if(overlay){
        overlay.style.display = 'none';
        Array.from(el.children).forEach(child=>{ if(child!==overlay) child.style.removeProperty('display'); });
      }
    }
  }

  try{ window.scrollTo({top:0, behavior:'instant'}); }catch(e){ window.scrollTo(0,0); }
}

document.querySelectorAll('.sb-nav-link[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setActiveView(btn.getAttribute('data-view'));
    closeSidebarDrawer();
    // Not: Yana açılan (flyout) bir alt menünün İÇİNDEKİ bir linke tıklanınca artık
    // menü kapatılmıyor — kullanıcı üst üste birkaç rapora bakmak isteyebilir. Daraltılmış
    // (icon-rail) moddaki flyout kapatma davranışı ayrı olarak aşağıda (sb-submenu
    // .sb-nav-link click) yönetiliyor; sadece ANA (alt menüsü olmayan) bir sidebar linkine
    // tıklanınca (örn. "Genel Bakış") açık kalan flyout'lar kapatılır.
    const insideFlyout = btn.closest('.sb-submenu');
    if(!insideFlyout && typeof window.closeAllFlyouts === 'function') window.closeAllFlyouts();
  });
});

// ---- Sol sidebar: daraltma (icon-rail) modu ----
(function(){
  const shell = document.querySelector('.app-shell');
  const sidebar = document.getElementById('appSidebar');
  const collapseBtn = document.getElementById('sbCollapseBtn');
  if(!shell || !sidebar || !collapseBtn) return;

  // Tooltip metinleri (data-label) — sb-label span'ının metnini kopyalayarak, daraltılmış
  // moddaki CSS tooltip'i (attr(data-label)) besler.
  sidebar.querySelectorAll('.sb-link').forEach(btn=>{
    const label = btn.querySelector('.sb-label');
    if(label) btn.setAttribute('data-label', label.textContent.trim());
  });

  function closeAllFlyouts(){
    SB_SUBMENUS.forEach(s=>{
      s.menu.classList.remove('open');
      s.btn.classList.remove('open');
      s.btn.setAttribute('aria-expanded','false');
      s.menu.style.top = '';
    });
    document.body.classList.remove('sb-flyout-open');
  }
  window.closeAllFlyouts = closeAllFlyouts;

  function applyCollapsed(collapsed){
    // Hover ile geçici olarak genişletilmiş (sb-hover-peek) durumdan gerçek bir
    // daralt/genişlet işlemine geçerken önce hover state'ini (ve mousemove
    // izleyicisini) temizliyoruz.
    if(typeof sbStopHoverWatch === 'function') sbStopHoverWatch();
    else clearTimeout(hoverLeaveTimer);
    sidebar.classList.remove('sb-hover-peek');
    sidebar.classList.toggle('collapsed', collapsed);
    shell.classList.toggle('sb-collapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    collapseBtn.setAttribute('title', collapsed ? 'Menüyü genişlet' : 'Menüyü daralt');
    collapseBtn.setAttribute('aria-label', collapsed ? 'Menüyü genişlet' : 'Menüyü daralt');
    closeAllFlyouts();
    try{ localStorage.setItem('sbCollapsed', collapsed ? '1' : '0'); }catch(e){}
  }

  // ---- Fare ile üzerine gelince otomatik genişleme (hover-peek) ----
  // Yalnızca masaüstünde ve sidebar daraltılmışken devreye girer. Gerçek
  // "daraltıldı" tercihine (localStorage) dokunmaz; fare ayrılınca eski
  // (daraltılmış) haline geri döner.
  // Not: Fare sidebar'ın DOM sınırından (mouseleave) çıktığı an hemen kapatmak yerine,
  // imlecin x-konumu belirli bir eşiği (sayfanın ortasına doğru anlamlı bir mesafeyi)
  // geçene kadar açık tutuyoruz. Böylece kenar boşluğuna/scrollbar'a değme gibi ufak
  // hareketlerde menü istenmeden kapanmıyor; fare gerçekten sayfanın ortasına doğru
  // ilerlediğinde kapanıyor.
  let hoverLeaveTimer = null;
  let sbHoverMoveHandler = null;

  function sbHoverCloseThresholdX(){
    const rect = sidebar.getBoundingClientRect();
    // Sidebar'ın sağ kenarından bir tampon bölge (259px) — kenar boşluğuna/scrollbar'a
    // değme gibi ufak hareketlerde menü istenmeden kapanmasın diye pay bırakılıyor,
    // ama sayfanın ortasına kadar açık kalmıyor.
    return rect.right + 259;
  }

  function sbStopHoverWatch(){
    clearTimeout(hoverLeaveTimer);
    if(sbHoverMoveHandler){
      document.removeEventListener('mousemove', sbHoverMoveHandler);
      sbHoverMoveHandler = null;
    }
  }

  function sbStartHoverWatch(){
    sbStopHoverWatch();
    sbHoverMoveHandler = (e)=>{
      const leftViewport = (e.clientY < 0 || e.clientY > window.innerHeight || e.clientX < 0);
      if(leftViewport || e.clientX > sbHoverCloseThresholdX()){
        sidebar.classList.remove('sb-hover-peek');
        sidebar.classList.add('collapsed');
        // DÜZELTME (kullanıcı isteği): hover-peek eskiden sadece sidebar'ı görsel olarak
        // genişletip .app-shell'e dokunmuyordu ("içerik yer değiştirmesin, sidebar üzerine
        // yüzen bir panel gibi genişlesin" tasarımı) — bu da header'ın sidebar'ın ALTINDA/
        // ARKASINDA kalmış gibi görünmesine (sidebar header'ın üstüne binmesine) yol açıyordu.
        // Artık fare ayrılınca sidebar tekrar daraldığı gibi .app-shell de tekrar
        // sb-collapsed'e dönüyor — yani header/içerik de sidebar'la birlikte genişleyip daralıyor.
        shell.classList.add('sb-collapsed');
        closeAllFlyouts();
        sbStopHoverWatch();
      }
    };
    document.addEventListener('mousemove', sbHoverMoveHandler);
  }

  sidebar.addEventListener('mouseenter', ()=>{
    if(window.innerWidth <= 980) return;
    if(!sidebar.classList.contains('collapsed')) return;
    sbStopHoverWatch();
    sidebar.classList.add('sb-hover-peek');
    sidebar.classList.remove('collapsed');
    // DÜZELTME (kullanıcı isteği): header/içerik artık sidebar ile AYNI ANDA genişliyor —
    // sidebar sadece görsel olarak büyüyüp header'ın üstüne binmiyor, header da gerçekten
    // sağa kayıp yer açıyor (tıpkı kalıcı aç/kapa butonundaki davranış gibi).
    shell.classList.remove('sb-collapsed');
  });
  sidebar.addEventListener('mouseleave', ()=>{
    if(!sidebar.classList.contains('sb-hover-peek')) return;
    sbStartHoverWatch();
  });

  // Varsayılan açılış durumu: daraltılmış icon-rail. Kullanıcı daha önce sidebar'ı bilerek
  // genişletmişse (localStorage'da '0' olarak kaydedilmişse) o tercih hatırlanır; aksi halde
  // (ilk ziyaret veya '1') daraltılmış halde açılır.
  let collapsedState = true;
  try{
    const saved = localStorage.getItem('sbCollapsed');
    if(saved === '0') collapsedState = false;
  }catch(e){}
  if(window.innerWidth > 980) applyCollapsed(collapsedState);

  collapseBtn.addEventListener('click', ()=>{
    applyCollapsed(!sidebar.classList.contains('collapsed'));
  });

  // Daraltılmış modda üst menü butonlarına (Cari Detay/Dağıtım/Finansal Analiz) tıklanınca
  // açılan alt menü artık satır içi değil, ikonun sağında yüzen (flyout) bir panel — bu yüzden
  // konumunu (top) butonun sidebar içindeki dikey konumuna göre elle hesaplıyoruz.
  SB_SUBMENUS.forEach(s=>{
    s.btn.addEventListener('click', ()=>{
      if(!sidebar.classList.contains('collapsed')) return;
      if(s.menu.classList.contains('open')){
        const r = s.btn.getBoundingClientRect();
        let top = r.top;
        const maxTop = window.innerHeight - s.menu.offsetHeight - 10;
        if(top > maxTop) top = Math.max(10, maxTop);
        s.menu.style.top = top + 'px';
      }
    });
  });

  // Daraltılmış moddaki flyout içindeki bir rapor linkine tıklanınca (görünüm değiştiği için)
  // flyout'un kendisi de kapanmalı — aksi halde panel ekranda açık kalmaya devam ediyordu.
  sidebar.querySelectorAll('.sb-submenu .sb-nav-link').forEach(link=>{
    link.addEventListener('click', ()=>{
      if(sidebar.classList.contains('collapsed')) closeAllFlyouts();
    });
  });

  document.addEventListener('click', (e)=>{
    if(sidebar.contains(e.target)) return;
    // Sidebar dışında herhangi bir yere tıklanınca, farenin o anki konumundan
    // bağımsız olarak menü hemen kapanır (hover-peek ile geçici açılmış olsa bile).
    if(sidebar.classList.contains('sb-hover-peek')){
      if(typeof sbStopHoverWatch === 'function') sbStopHoverWatch();
      sidebar.classList.remove('sb-hover-peek');
      sidebar.classList.add('collapsed');
    }
    if(sidebar.classList.contains('collapsed')){
      closeAllFlyouts();
    } else {
      SB_SUBMENUS.forEach(s=>{
        s.menu.classList.remove('open');
        s.btn.classList.remove('open');
        s.btn.setAttribute('aria-expanded','false');
        s.menu.style.top = '';
      });
    }
  });

  window.addEventListener('resize', ()=>{
    if(window.innerWidth <= 980){
      // Mobile genişliğe geçildiğinde hover-peek anlamsız hale gelir (mobilde sidebar
      // zaten kayan bir drawer) — kalıntı durumu temizliyoruz.
      if(sidebar.classList.contains('sb-hover-peek')){
        sbStopHoverWatch();
        sidebar.classList.remove('sb-hover-peek');
        sidebar.classList.add('collapsed');
      }
      if(sidebar.classList.contains('collapsed')){
        closeAllFlyouts();
      }
    }
  });

  // Sidebar iç kaydırması olursa (dar yükseklikli ekranlarda), açık flyout'un konumu geçersiz
  // kalmasın diye kapatıyoruz.
  sidebar.addEventListener('scroll', ()=>{
    if(sidebar.classList.contains('collapsed')) closeAllFlyouts();
  }, {passive:true});
})();

// ---- Sol sidebar (GENİŞ/açık mod): fare üzerine gelince alt menüyü sağa doğru aç (flyout) ----
// Daraltılmış (icon-rail) moddaki flyout click ile tetikleniyordu; burada aynı görsel
// flyout paneli, sidebar tam genişlikteyken (accordion yerine) mouse hover ile açılır/kapanır.
(function(){
  const sidebar = document.getElementById('appSidebar');
  if(!sidebar || typeof SB_SUBMENUS === 'undefined' || !SB_SUBMENUS.length) return;
  let sbExpLeaveTimer = null;

  function isExpandedDesktop(){
    return window.innerWidth > 980 && !sidebar.classList.contains('collapsed');
  }

  function positionExpandedFlyout(btn, menu){
    const r = btn.getBoundingClientRect();
    let top = r.top;
    const maxTop = window.innerHeight - menu.offsetHeight - 10;
    if(top > maxTop) top = Math.max(10, maxTop);
    menu.style.top = top + 'px';
  }

  function openExpandedFlyout(target){
    SB_SUBMENUS.forEach(o=>{
      if(o===target) return;
      o.menu.classList.remove('open');
      o.btn.classList.remove('open');
      o.btn.setAttribute('aria-expanded','false');
      o.menu.style.top = '';
    });
    target.menu.classList.add('open');
    target.btn.classList.add('open');
    target.btn.setAttribute('aria-expanded','true');
    positionExpandedFlyout(target.btn, target.menu);
  }

  function closeExpandedFlyout(target){
    target.menu.classList.remove('open');
    target.btn.classList.remove('open');
    target.btn.setAttribute('aria-expanded','false');
    target.menu.style.top = '';
  }

  // setActiveView (yukarıda) aktif görünüme ait alt menüyü otomatik açıyor; genişletilmiş
  // masaüstü modunda bu durumda da flyout'un konumunun (top) doğru hesaplanması gerekir.
  window.positionSbExpandedFlyout = function(btn, menu){
    if(isExpandedDesktop()) positionExpandedFlyout(btn, menu);
  };

  SB_SUBMENUS.forEach(s=>{
    s.btn.addEventListener('mouseenter', ()=>{
      if(!isExpandedDesktop()) return;
      clearTimeout(sbExpLeaveTimer);
      openExpandedFlyout(s);
    });
    const scheduleClose = ()=>{
      if(!isExpandedDesktop()) return;
      clearTimeout(sbExpLeaveTimer);
      // Kullanıcının fareyi buton ile flyout paneli arasındaki boşluktan geçirebilmesi
      // için kısa bir gecikmeyle kapatıyoruz — aksi halde flyout'a ulaşmadan kapanırdı.
      sbExpLeaveTimer = setTimeout(()=>{ closeExpandedFlyout(s); }, 220);
    };
    s.btn.addEventListener('mouseleave', scheduleClose);
    s.menu.addEventListener('mouseenter', ()=>{
      if(isExpandedDesktop()) clearTimeout(sbExpLeaveTimer);
    });
    s.menu.addEventListener('mouseleave', scheduleClose);
  });

  // Genişletilmiş moddan mobil/collapsed'a geçildiğinde kalıntı inline top değerini temizle.
  window.addEventListener('resize', ()=>{
    if(!isExpandedDesktop()){
      SB_SUBMENUS.forEach(s=>{ s.menu.style.top = ''; });
    }
  });
})();

// ---- Mobil hamburger menü (sidebar'ı kayan panel/drawer olarak aç-kapat) ----
function openSidebarDrawer(){
  document.body.classList.add('sb-drawer-open');
  document.getElementById('mobileHamburgerBtn')?.setAttribute('aria-expanded','true');
}
function closeSidebarDrawer(){
  document.body.classList.remove('sb-drawer-open');
  document.getElementById('mobileHamburgerBtn')?.setAttribute('aria-expanded','false');
}
document.getElementById('mobileHamburgerBtn')?.addEventListener('click', ()=>{
  if(document.body.classList.contains('sb-drawer-open')) closeSidebarDrawer(); else openSidebarDrawer();
});
document.getElementById('sbDrawerOverlay')?.addEventListener('click', closeSidebarDrawer);
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape') closeSidebarDrawer();
});
// Ekran mobil eşiğin (980px) üzerine büyürse (ör. tablet döndürme/pencere genişletme) drawer
// state'i temizlensin — masaüstü görünümde sidebar zaten her zaman açık/sabit olduğundan.
window.addEventListener('resize', ()=>{
  if(window.innerWidth > 980) closeSidebarDrawer();
});

// ---- Kaydırarak menüyü aç/kapat: SAYFANIN HER YERİNDEN, parmağı canlı takip eden sürükleme ----
// Önceki sürüm sadece sol kenardaki dar bir bölgeden başlayan dokunuşları kabul ediyordu. Artık
// jest SAYFANIN HER YERİNDEN başlayabiliyor — TEK istisna, kendi yatay kaydırması olan alanlar
// (tablolar ve sekme çubuğu, bkz. KAYDIRMALI_ALAN_SECICI): oralarda kullanıcının asıl niyeti
// tabloyu/sekmeleri yana kaydırmaktır, menü jestiyle çakışmaması için o alanlarda devre dışı
// bırakılıyor. Menü, parmak hareket ettikçe BİREBİR onu takip ediyor (transition kapalıyken
// doğrudan px hesaplanıyor); parmak kalktığında ise sürüklenen mesafeye ya da hızlı bir
// "flick"e göre açık/kapalı konuma YUMUŞAKÇA (CSS transition ile) tamamlanıyor. Hamburger
// butonu, dışarı tıklama, ESC gibi mevcut açma/kapama yöntemleri aynen çalışmaya devam ediyor.
(function(){
  const sidebarEl = document.getElementById('appSidebar');
  const overlayEl = document.getElementById('sbDrawerOverlay');
  if(!sidebarEl) return;
  // Kendi yatay kaydırması olan alanlar — bu seçicilerin İÇİNDE başlayan dokunuşlarda menü
  // sürükleme jesti hiç devreye girmez (tablo/sekme kendi doğal yatay scroll'unu yapar).
  const KAYDIRMALI_ALAN_SECICI = '.table-scroll, .aging-table-scroll, .tabbar';
  const OLU_BOLGE_PX = 8; // bu kadar px hareket edilmeden menü GÖRSEL OLARAK hiç takip etmeye başlamaz — küçük/istemsiz dokunuşları eler (önceden 14px, biraz daha duyarlı olsun diye düşürüldü)
  const AC_KAPA_ORANI = 0.28; // sürüklenen mesafe, menü genişliğinin bu oranını geçerse bırakınca o konumda kalır (önceden 0.5/yarı genişlik gerekiyordu — mobilde bu kadar uzun kaydırmak zor geliyordu, bu yüzden düşürüldü)
  const FLICK_SURE_MS = 260; // bu süreden kısa bir dokunuşta... (önceden 200ms, biraz daha rahat bir "hızlı" tanımı için artırıldı)
  const FLICK_MESAFE_PX = 20; // ...bu kadar (veya fazla) hareket varsa, oran şartı aranmadan hızlı geçiş sayılır (önceden 34px — çok fazla mesafe istiyordu, düşürüldü)
  const DIKEY_TOLERANS = 60; // bu kadardan fazla dikey kayarsa jest iptal edilir (sayfa scroll'uyla çakışmasın) — hafif çapraz/titrek dokunuşların jesti erken iptal etmesini azaltmak için artırıldı

  let genislik = 0, baslangicX = null, baslangicY = null, baslangicZaman = 0;
  let sonX = null, surukluyor = false, acilisDurumu = false;

  const sinirla = (v, min, max) => Math.max(min, Math.min(max, v));

  function suruklemeyiUygula(acikPx){
    // acikPx: 0 (tam kapalı) ... genislik (tam açık) aralığında, menünün o anki konumu
    const x = -genislik + sinirla(acikPx, 0, genislik);
    sidebarEl.style.transform = `translateX(${x}px)`;
    if(overlayEl){
      overlayEl.style.display = 'block';
      overlayEl.style.opacity = String(sinirla(acikPx/genislik, 0, 1));
    }
  }

  function suruklemeInlineStilleriTemizle(){
    sidebarEl.style.transition = '';
    sidebarEl.style.transform = '';
    if(overlayEl){ overlayEl.style.opacity = ''; overlayEl.style.display = ''; }
  }

  document.addEventListener('touchstart', (e)=>{
    if(window.innerWidth > 980) return; // masaüstünde sidebar zaten sabit/açık, jest gereksiz
    if(e.target.closest && e.target.closest(KAYDIRMALI_ALAN_SECICI)) return; // kaydırmalı tablo/sekme üzerinde jest devre dışı
    const t = e.touches[0];
    acilisDurumu = document.body.classList.contains('sb-drawer-open');
    // Artık kenar sınırı YOK — sayfanın her yerinden başlayan yatay sürükleme menüyü açabilir
    // (kapalıyken) veya kapatabilir (açıkken), yukarıdaki kaydırmalı alanlar hariç.
    genislik = sidebarEl.offsetWidth || 252;
    baslangicX = sonX = t.clientX;
    baslangicY = t.clientY;
    baslangicZaman = Date.now();
    surukluyor = true;
    sidebarEl.style.transition = 'none'; // sürüklerken animasyon YOK — doğrudan parmağı takip etsin
  }, {passive:true});

  document.addEventListener('touchmove', (e)=>{
    if(!surukluyor || baslangicX==null) return;
    const t = e.touches[0];
    const dx = t.clientX - baslangicX;
    const dy = Math.abs(t.clientY - baslangicY);
    if(dy > DIKEY_TOLERANS){ surukluyor = false; suruklemeInlineStilleriTemizle(); return; }
    sonX = t.clientX;
    // ÖLÜ BÖLGE: |dx| OLU_BOLGE_PX'i geçmeden menü hiç kıpırdamaz — bir tıklama/dokunuşun
    // ufak titremesi ya da yavaş bir dikey kaydırmanın başlangıcı yanlışlıkla menüyü
    // "aralamış" gibi göstermesin diye. Geçildikten sonra parmağı yine birebir takip eder.
    if(Math.abs(dx) < OLU_BOLGE_PX) return;
    const baslangicPx = acilisDurumu ? genislik : 0;
    suruklemeyiUygula(baslangicPx + dx);
  }, {passive:true});

  document.addEventListener('touchend', ()=>{
    if(!surukluyor){ baslangicX = null; return; }
    surukluyor = false;
    const dx = (sonX!=null && baslangicX!=null) ? (sonX - baslangicX) : 0;
    const hizliFlickMi = (Date.now()-baslangicZaman) < FLICK_SURE_MS && Math.abs(dx) > FLICK_MESAFE_PX;
    const acikKalsin = acilisDurumu
      ? !(dx < -genislik*AC_KAPA_ORANI || (hizliFlickMi && dx < -FLICK_MESAFE_PX)) // açıktı: yeterince/sertçe sola kaydırıldıysa kapat
      : (dx > genislik*AC_KAPA_ORANI || (hizliFlickMi && dx > FLICK_MESAFE_PX));   // kapalıydı: yeterince/sertçe sağa kaydırıldıysa aç
    suruklemeInlineStilleriTemizle(); // inline stiller kalkınca CSS class'ın (.sb-drawer-open) transition'lı hareketi devreye girer
    if(acikKalsin) openSidebarDrawer(); else closeSidebarDrawer();
    baslangicX = null; baslangicY = null; sonX = null;
  }, {passive:true});
})();

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(TAB_DROPDOWNS.some(d=>d.btn===btn)) return;
    const view = btn.getAttribute('data-view');
    if(btn.classList.contains('dropdown-item')) closeAllDropdowns();
    setActiveView(view);
  });
});


const AGING_DAY_BUCKETS = [
  {key:'g0_6',  label:'0-6 Gün',   test:g=> g>=0  && g<=6},
  {key:'g7_13', label:'7-13 Gün',  test:g=> g>=7  && g<=13},
  {key:'g14_20',label:'14-20 Gün', test:g=> g>=14 && g<=20},
  {key:'g21_27',label:'21-27 Gün', test:g=> g>=21 && g<=27},
  {key:'g28_34',label:'28-34 Gün', test:g=> g>=28 && g<=34},
  {key:'g35p',  label:'+35 Gün',   test:g=> g>=35},
];
// İlk 5 kolon (0-6...28-34 gün) sistemin gold/amber vurgu rengiyle uyumlu tek bir renk
// ailesinin açıktan koyuya yoğunluğuyla gösteriliyor; yalnızca en riskli son kolon
// (+35 gün) hâlâ kırmızı/danger tonunda kalıyor — böylece asıl dikkat edilmesi gereken
// vadesi en geçmiş bakiyeler, diğer sistem renklerinden kopmadan yine öne çıkıyor.
const AGING_RENK_HEX = ['#8A6D1F','#8A6D1F','#8A6D1F','#8A6D1F','#8A6D1F','#B23A2C'];
function yaslandirmaHexToRgb(hex){
  const h = hex.replace('#','');
  const n = parseInt(h,16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
const AGING_RENK_RGB = AGING_RENK_HEX.map(yaslandirmaHexToRgb);

// Bir yaşlandırma hücresinin ısı haritası arka planı: değer, o kolonun (tüm satırlardaki) en
// büyük değerine oranlandığında ne kadar "sıcak" görüneceğini belirler.
function yaslandirmaIsiStili(value, maks, bucketIndex){
  if(value<=0 || !maks) return '';
  const oran = Math.min(1, value/maks);
  const alpha = (0.07 + oran*0.5).toFixed(3);
  const [r,g,b] = AGING_RENK_RGB[bucketIndex];
  return ` style="background:rgba(${r},${g},${b},${alpha})"`;
}

function emptyBuckets(){
  const b = {};
  AGING_DAY_BUCKETS.forEach(x=> b[x.key]=0);
  return b;
}

function computeNoktaYaslandirma(report){
  return report.musteriler.map(m=>{
    const buckets = emptyBuckets();
    (m.invoices||[]).forEach(inv=>{
      const g = inv.gunFatura;
      if(g==null || isNaN(g)) return;
      const b = AGING_DAY_BUCKETS.find(x=>x.test(g));
      if(b) buckets[b.key] += (inv.kalanBorc||0);
    });

    const toplam = AGING_DAY_BUCKETS.reduce((s,b)=>s+buckets[b.key],0);
    return {musteri:m.musteri, musteriAdi:m.musteriAdi, temsilci:m.temsilci||'—', buckets, toplam};
  // Kullanıcı isteği: Yaşlandırma raporuna (hem temsilci/müdür toplamlarına hem müşteri bazlı
  // akordiyon listesine) bakiyesi (kalan borcu) olmayan müşteriler dahil edilmesin. "Bakiyesi yok"
  // burada yaşlandırma kovalarının toplamı (m.kalanBorc değil, invoices'tan hesaplanan toplam) 0'a
  // eşit demek — mahsup sonrası kuruş artıklarının 0'a sabitlenmesiyle (buildReport'taki düzeltme)
  // bu artık gerçek anlamda "borcu olmayan" müşterileri de doğru şekilde dışarıda bırakıyor.
  }).filter(row => Math.abs(row.toplam) >= 1);
}
// Bu hesap rapor nesnesindeki günFatura değerlerini okur. canliGunlerleGuncelle aynı rapor
// nesnesini gün geçişinde yerinde değiştirdiği için nesne referansına dayalı memoization eski
// kovaları döndürebilir; doğruluk için burada bilinçli olarak önbellek kullanılmaz.

function computeTemsilciYaslandirma(noktaRows){
  const map = new Map();
  noktaRows.forEach(r=>{
    const key = r.temsilci || '—';
    if(!map.has(key)) map.set(key, {temsilci:key, muduru:getSahaMuduru(key), buckets:emptyBuckets(), toplam:0});
    const t = map.get(key);
    AGING_DAY_BUCKETS.forEach(b=> t.buckets[b.key] += r.buckets[b.key]);
    t.toplam += r.toplam;
  });
  return Array.from(map.values()).sort((a,b)=>b.toplam-a.toplam);
}

function computeMuduruYaslandirma(repRows){
  const map = new Map();
  repRows.forEach(r=>{
    const key = r.muduru || 'Tanımsız';
    if(!map.has(key)) map.set(key, {muduru:key, buckets:emptyBuckets(), toplam:0});
    const t = map.get(key);
    AGING_DAY_BUCKETS.forEach(b=> t.buckets[b.key] += r.buckets[b.key]);
    t.toplam += r.toplam;
  });
  return Array.from(map.values()).sort((a,b)=>b.toplam-a.toplam);
}

function yaslandirmaBucketMaksList(rows){
  return AGING_DAY_BUCKETS.map(b => rows.reduce((m,r)=> Math.max(m, r.buckets[b.key]||0), 0));
}

function renderYaslandirmaOzet(report){
  const noktaRows = computeNoktaYaslandirma(report);
  const repRows = computeTemsilciYaslandirma(noktaRows);
  const muduruRows = computeMuduruYaslandirma(repRows);
  const tbody = document.getElementById('yaslandirmaOzetTbody');
  if(!repRows.length){
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">Veri bulunamadı.</div></td></tr>`;
    document.getElementById('yaslandirmaOzetTfoot').innerHTML = '';
    document.getElementById('yaslandirmaOzetMuduruTbody').innerHTML = `<tr><td colspan="9"><div class="empty-state">Veri bulunamadı.</div></td></tr>`;
    document.getElementById('yaslandirmaOzetMuduruTfoot').innerHTML = '';
    return;
  }
  const repMaks = yaslandirmaBucketMaksList(repRows);
  const repCell = (v,i) => `<td class="num${Math.abs(v)>=1?'':' zero'}"${yaslandirmaIsiStili(v, repMaks[i], i)}>${Math.abs(v)>=1?TL(v):'—'}</td>`;
  // Temsilci satırına tıklanınca, o temsilcinin müşterilerini (aynı 6 gün kolonu +
  // Yaşlandırma + Toplam formatında) alt satırda gösteren akordiyon — noktaRows zaten
  // müşteri bazlı yaşlandırma verisini (temsilci alanıyla birlikte) içeriyor, burada
  // sadece temsilciye göre filtreleyip aynı hücre şablonunu tekrar kullanıyoruz.
  const musteriMaks = yaslandirmaBucketMaksList(noktaRows);
  const musteriCell = (v,i) => `<td class="num${Math.abs(v)>=1?'':' zero'}"${yaslandirmaIsiStili(v, musteriMaks[i], i)}>${Math.abs(v)>=1?TL(v):'—'}</td>`;
  function temsilciMusteriSatirHtml(n){
    const yTop = (n.buckets.g28_34||0) + (n.buckets.g35p||0);
    return `<tr class="data-row">
        <td>${escapeHtml(n.musteriAdi)}</td>
        <td></td>
        ${musteriCell(n.buckets.g0_6,0)}
        ${musteriCell(n.buckets.g7_13,1)}
        ${musteriCell(n.buckets.g14_20,2)}
        ${musteriCell(n.buckets.g21_27,3)}
        ${musteriCell(n.buckets.g28_34,4)}
        ${musteriCell(n.buckets.g35p,5)}
        <td class="num aging-toplam-col">${Math.abs(yTop)>=1?TL(yTop):'—'}</td>
        <td class="num"><span class="num-strong">${TL(n.toplam)}</span></td>
      </tr>`;
  }
  const AGING_MUSTERI_SAYFA_BOYUTU = 10;
  function temsilciMusterileriHtml(temsilciAdi){
    // Yaşlandırma (28-34 + 35 gün toplamı) bakiyesi en yüksek müşteri en üstte —
    // temsilcinin altında açılan bu liste, en riskli/yaşlanmış bakiyeye sahip
    // müşterileri önce görmek için Toplam yerine bu değere göre sıralanıyor.
    const musteriler = noktaRows.filter(n=>n.temsilci===temsilciAdi).slice()
      .sort((a,b)=>((b.buckets.g28_34||0)+(b.buckets.g35p||0)) - ((a.buckets.g28_34||0)+(a.buckets.g35p||0)));
    if(!musteriler.length) return '<div class="empty-state" style="padding:10px 12px;">Bu temsilciye ait müşteri bulunamadı.</div>';
    const ilkGrup = musteriler.slice(0, AGING_MUSTERI_SAYFA_BOYUTU);
    const kalanGrup = musteriler.slice(AGING_MUSTERI_SAYFA_BOYUTU);
    const ilkGrupHtml = ilkGrup.map(temsilciMusteriSatirHtml).join('');
    const kalanGrupHtml = kalanGrup.map(temsilciMusteriSatirHtml).join('');
    const dahaFazlaBtnHtml = kalanGrup.length
      ? `<tr class="aging-daha-fazla-row"><td colspan="10" style="padding:8px 12px;text-align:center;">
          <button type="button" class="btn small aging-daha-fazla-btn">Devamını gör (${kalanGrup.length} müşteri daha) ↓</button>
        </td></tr>`
      : '';
    return `<table class="aging-table aging-subtable"><tbody>${ilkGrupHtml}</tbody>`
      + `<tbody class="aging-kalan-tbody" style="display:none;">${kalanGrupHtml}</tbody>`
      + `<tbody>${dahaFazlaBtnHtml}</tbody></table>`;
  }
  tbody.innerHTML = repRows.map(r=>{
    const yaslandirmaToplam = (r.buckets.g28_34||0) + (r.buckets.g35p||0);
    return `<tr class="data-row aging-temsilci-row" data-temsilci="${escapeHtml(r.temsilci)}">
    <td><span class="aging-expand-ic"><i class="fa-solid fa-caret-right" aria-hidden="true"></i></span><span class="temsilci-tag">${HTK_USER_ICON}${escapeHtml(r.temsilci)}</span></td>
    <td><span class="temsilci-tag mudur-tag">${HTK_USER_ICON}${escapeHtml(r.muduru)}</span></td>
    ${repCell(r.buckets.g0_6,0)}
    ${repCell(r.buckets.g7_13,1)}
    ${repCell(r.buckets.g14_20,2)}
    ${repCell(r.buckets.g21_27,3)}
    ${repCell(r.buckets.g28_34,4)}
    ${repCell(r.buckets.g35p,5)}
    <td class="num aging-toplam-col">${Math.abs(yaslandirmaToplam)>=1?TL(yaslandirmaToplam):'—'}</td>
    <td class="num"><span class="num-strong">${TL(r.toplam)}</span></td>
  </tr>
  <tr class="aging-detay-row" style="display:none;"><td colspan="10" style="padding:0;">${temsilciMusterileriHtml(r.temsilci)}</td></tr>`;
  }).join('');

  const grand = {buckets:emptyBuckets(), toplam:0};
  repRows.forEach(r=>{
    AGING_DAY_BUCKETS.forEach(b=> grand.buckets[b.key]+=r.buckets[b.key]);
    grand.toplam += r.toplam;
  });
  const grandYaslandirma = (grand.buckets.g28_34||0) + (grand.buckets.g35p||0);
  document.getElementById('yaslandirmaOzetTfoot').innerHTML = `<tr class="totals-row">
    <td colspan="2">Genel Toplam</td>
    <td class="num">${TL(grand.buckets.g0_6)}</td>
    <td class="num">${TL(grand.buckets.g7_13)}</td>
    <td class="num">${TL(grand.buckets.g14_20)}</td>
    <td class="num">${TL(grand.buckets.g21_27)}</td>
    <td class="num">${TL(grand.buckets.g28_34)}</td>
    <td class="num">${TL(grand.buckets.g35p)}</td>
    <td class="num aging-toplam-col"><span class="num-strong">${TL(grandYaslandirma)}</span></td>
    <td class="num"><span class="num-strong">${TL(grand.toplam)}</span></td>
  </tr>`;

  const muduruMaks = yaslandirmaBucketMaksList(muduruRows);
  const muduruCell = (v,i) => `<td class="num${Math.abs(v)>=1?'':' zero'}"${yaslandirmaIsiStili(v, muduruMaks[i], i)}>${Math.abs(v)>=1?TL(v):'—'}</td>`;
  const mtbody = document.getElementById('yaslandirmaOzetMuduruTbody');
  mtbody.innerHTML = muduruRows.map(r=>{
    const yaslandirmaToplam = (r.buckets.g28_34||0) + (r.buckets.g35p||0);
    return `<tr class="data-row">
    <td><span class="temsilci-tag mudur-tag">${HTK_USER_ICON}${escapeHtml(r.muduru)}</span></td>
    ${muduruCell(r.buckets.g0_6,0)}
    ${muduruCell(r.buckets.g7_13,1)}
    ${muduruCell(r.buckets.g14_20,2)}
    ${muduruCell(r.buckets.g21_27,3)}
    ${muduruCell(r.buckets.g28_34,4)}
    ${muduruCell(r.buckets.g35p,5)}
    <td class="num aging-toplam-col">${Math.abs(yaslandirmaToplam)>=1?TL(yaslandirmaToplam):'—'}</td>
    <td class="num"><span class="num-strong">${TL(r.toplam)}</span></td>
  </tr>`;
  }).join('');
  document.getElementById('yaslandirmaOzetMuduruTfoot').innerHTML = `<tr class="totals-row">
    <td>Genel Toplam</td>
    <td class="num">${TL(grand.buckets.g0_6)}</td>
    <td class="num">${TL(grand.buckets.g7_13)}</td>
    <td class="num">${TL(grand.buckets.g14_20)}</td>
    <td class="num">${TL(grand.buckets.g21_27)}</td>
    <td class="num">${TL(grand.buckets.g28_34)}</td>
    <td class="num">${TL(grand.buckets.g35p)}</td>
    <td class="num aging-toplam-col"><span class="num-strong">${TL(grandYaslandirma)}</span></td>
    <td class="num"><span class="num-strong">${TL(grand.toplam)}</span></td>
  </tr>`;
}

// Temsilci satırına tıklanınca altındaki müşteri detay satırını aç/kapa — event
// delegation ile tek seferlik bağlanıyor, tbody her render edildiğinde (filtre/sıralama
// değiştiğinde) tekrar dinleyici eklemeye gerek kalmıyor. Akordiyon: aynı anda yalnızca
// bir temsilci açık kalır, yeni birine tıklanınca öncekiler otomatik kapanır.
document.getElementById('yaslandirmaOzetTbody')?.addEventListener('click', (e)=>{
  const dahaFazlaBtn = e.target.closest('.aging-daha-fazla-btn');
  if(dahaFazlaBtn){
    // Buton, akordiyonun kendi tıklama olayını da tetiklemesin diye önce burada
    // ele alınıyor — akordiyonu kapatmadan sadece kalan müşterileri gösterip
    // butonu (artık gereksiz olduğu için) kaldırıyor.
    const subtable = dahaFazlaBtn.closest('.aging-subtable');
    const kalanTbody = subtable?.querySelector('.aging-kalan-tbody');
    if(kalanTbody) kalanTbody.style.display = '';
    dahaFazlaBtn.closest('tr').remove();
    return;
  }
  const row = e.target.closest('.aging-temsilci-row');
  if(!row) return;
  const detayRow = row.nextElementSibling;
  if(!detayRow || !detayRow.classList.contains('aging-detay-row')) return;
  const acikMi = row.classList.contains('open');
  document.querySelectorAll('#yaslandirmaOzetTbody .aging-temsilci-row.open').forEach(r=>{
    r.classList.remove('open');
    const d = r.nextElementSibling;
    if(d && d.classList.contains('aging-detay-row')) d.style.display = 'none';
  });
  if(!acikMi){
    row.classList.add('open');
    detayRow.style.display = '';
  }
});

function renderYaslandirmaView(report){
  renderYaslandirmaOzet(report);
}

function getFilteredSortedTicariStok(report){
  const q = document.getElementById('ticariStokSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('ticariStokTemsilciFilter').value;
  const rows = (report.ticariStok ? report.ticariStok.rows : []);
  let filtered = rows.filter(r=>{
    if(q && !(musteriAramaEslesiyorMu(q, r.musteriAdi, r.musteriNo) ||
      String(r.urunAdi).toLocaleLowerCase('tr-TR').includes(q) || String(r.urunKodu).toLocaleLowerCase('tr-TR').includes(q) ||
      String(r.temsilci).toLocaleLowerCase('tr-TR').includes(q))) return false;
    if(temsilci && r.temsilci !== temsilci) return false;
    return true;
  });
  return filtered;
}


function renderTicariStokTable(report, resetSayfa=true){
  if(resetSayfa) state.ticariStokGosterilen = TICARI_STOK_SAYFA_BOYUTU;
  const rows = getFilteredSortedTicariStok(report);
  const kartGrid = document.getElementById('ticariStokMusteriKartlar');
  const dahaFazlaWrap = document.getElementById('ticariStokDahaFazlaWrap');

  if(!report.ticariStok || !report.ticariStok.rows.length){
    document.getElementById('ticariStokCount').textContent = '';
    document.getElementById('ticariStokToplamBanner').innerHTML = '';
    document.getElementById('ticariStokOzetGrid').innerHTML = '';
    kartGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Ticari Stok dosyası yüklenmedi ya da depoda kalan litre değeri sıfırın üzerinde satır bulunamadı.</div>`;
    dahaFazlaWrap.style.display = 'none';
    return;
  }

  if(!rows.length){
    document.getElementById('ticariStokCount').textContent = '0 kalem';
    document.getElementById('ticariStokToplamBanner').innerHTML = '';
    kartGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Filtreyle eşleşen kayıt bulunamadı.</div>`;
    dahaFazlaWrap.style.display = 'none';
    return;
  }

  document.getElementById('ticariStokCount').textContent = rows.length.toLocaleString('tr-TR') + ' kalem';

  // --- Müşteri bazlı gruplama ---
  const grupMap = new Map();
  rows.forEach(r=>{
    const key = r.musteriNo + '|' + r.musteriAdi;
    if(!grupMap.has(key)) grupMap.set(key, {musteriNo:r.musteriNo, musteriAdi:r.musteriAdi, temsilci:r.temsilci, toplamMk:0, toplamLt:0, items:[]});
    const g = grupMap.get(key);
    g.toplamMk += r.depodaKalanMk;
    g.toplamLt += r.depodaKalanLt;
    g.items.push(r);
  });
  const gruplar = Array.from(grupMap.values()).sort((a,b)=>b.toplamLt-a.toplamLt);

  // --- Toplam Litre banner ---
  const toplamLt = rows.reduce((a,r)=>a+r.depodaKalanLt,0);
  document.getElementById('ticariStokToplamBanner').innerHTML = `
    <div>
      <div class="stok-toplam-banner-label"><span><i class="fa-solid fa-box" aria-hidden="true"></i></span><span>Toplam Litre</span></div>
      <div class="stok-toplam-banner-val">${LT(toplamLt)}</div>
    </div>
    <span class="stok-toplam-banner-pill">${gruplar.length.toLocaleString('tr-TR')} müşteri</span>`;

  // --- Müşteri kartları (expand-to-row) ---
  const gosterilecekSayi = Math.min(state.ticariStokGosterilen, gruplar.length);
  const gosterilecekGruplar = gruplar.slice(0, gosterilecekSayi);
  state.ticariStokGrupMap = new Map(gruplar.map(g=>['stok_'+g.musteriNo, g]));
  kartGrid.innerHTML = gosterilecekGruplar.map(g=>{
    const expandKey = 'stok_'+g.musteriNo;
    const enCokUrun = g.items.slice().sort((a,b)=>b.depodaKalanLt-a.depodaKalanLt)[0];
    return `<div class="htk-card" data-stok-musteri="${escapeHtml(expandKey)}">
      <div class="htk-head">
        <div style="min-width:0;">
          <div class="htk-musteri-row"><span class="htk-musteri">${escapeHtml(g.musteriAdi)}</span></div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(g.temsilci)}</div>
        </div>
        <span class="htk-badge-pill" style="background:var(--accent-soft);color:var(--accent-deep);">
          <span class="htk-badge-circle" style="background:var(--accent-deep);">${g.items.length}</span>KALEM
        </span>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${LT(g.toplamLt)}</span>
        <span class="htk-gecikme" style="color:var(--ink-faint);">${MK(g.toplamMk)}</span>
      </div>
      <div class="htk-alt">
        <span class="htk-ceksenet">${enCokUrun ? 'En çok: <b style="color:var(--ink);">'+escapeHtml(enCokUrun.urunAdi)+'</b>' : ''}</span>
        <div class="htk-alt-actions">
          <button type="button" class="nokta-detay-btn primary stok-detay-btn" data-stok-musteri="${escapeHtml(expandKey)}">Detay ↗</button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderTicariStokDahaFazlaBtn(gosterilecekSayi, gruplar.length);
}

function stokModalAc(expandKey){
  const g = state.ticariStokGrupMap && state.ticariStokGrupMap.get(expandKey);
  if(!g){
    document.getElementById('stokModalAvatar').textContent = '';
    document.getElementById('stokModalTitle').textContent = 'Depoda Kalan Ürünler';
    document.getElementById('stokModalSub').textContent = '';
    document.getElementById('stokModalItems').innerHTML = `<div class="empty-state">Müşteri bulunamadı — lütfen listeyi yenileyip tekrar deneyin.</div>`;
    document.getElementById('stokModalToplam').innerHTML = '';
    document.getElementById('stokModalOverlay').classList.add('open');
    return;
  }
  document.getElementById('stokModalAvatar').textContent = avatarBaslangic(g.musteriAdi);
  document.getElementById('stokModalTitle').textContent = g.musteriAdi;
  document.getElementById('stokModalSub').textContent = g.musteriNo + ' · ' + g.items.length + ' kalem';
  const maksItemLt = Math.max(...g.items.map(it=>it.depodaKalanLt), 1);
  document.getElementById('stokModalItems').innerHTML = g.items.slice().sort((a,b)=>b.depodaKalanLt-a.depodaKalanLt).map(it=>`
    <div class="stok-item-row">
      <span class="stok-item-kod">${escapeHtml(it.urunKodu)}</span>
      <span>${escapeHtml(it.urunAdi)}</span>
      <span class="stok-item-mk">${MK(it.depodaKalanMk)}</span>
      <span class="stok-item-lt">${LT(it.depodaKalanLt)}</span>
    </div>`).join('');
  document.getElementById('stokModalToplam').innerHTML = `
    <div><div class="fatura-toplam-label">Toplam Litre</div><div class="fatura-toplam-value">${LT(g.toplamLt)}</div></div>
    <div class="fatura-toplam-col"><div class="fatura-toplam-label">Toplam Miktar</div><div class="fatura-toplam-value">${MK(g.toplamMk)}</div></div>
  `;
  document.getElementById('stokModalOverlay').classList.add('open');
}
function stokModalKapat(){
  document.getElementById('stokModalOverlay').classList.remove('open');
}
document.getElementById('stokModalClose').addEventListener('click', stokModalKapat);
document.getElementById('stokModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='stokModalOverlay') stokModalKapat();
});
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.stok-detay-btn');
  if(!btn) return;
  e.stopPropagation();
  stokModalAc(btn.getAttribute('data-stok-musteri'));
});

function renderTicariStokDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('ticariStokDahaFazlaWrap');
  const info = document.getElementById('ticariStokDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

const STOK_OZET_RENK = [
  {renk:'var(--danger)', soft:'var(--danger-soft)'},
  {renk:'var(--warn)', soft:'var(--warn-soft)'},
  {renk:'var(--accent)', soft:'var(--accent-soft)'},
  {renk:'var(--success)', soft:'var(--success-soft)'},
  {renk:'var(--navy)', soft:'var(--navy-soft)'},
  {renk:'var(--ink-faint)', soft:'var(--line-soft)'},
];

function renderTicariStokOzet(report){
  const ozet = report.ticariStok ? report.ticariStok.ozet : [];
  const grid = document.getElementById('ticariStokOzetGrid');
  if(!ozet.length){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Veri bulunamadı.</div>`;
    return;
  }
  const grand = ozet.reduce((a,r)=>({depodaKalanMk:a.depodaKalanMk+r.depodaKalanMk, depodaKalanLt:a.depodaKalanLt+r.depodaKalanLt}), {depodaKalanMk:0,depodaKalanLt:0});
  const toplamLt = grand.depodaKalanLt || 1;

  const kartlar = ozet.map((r,i)=>{
    const pay = r.depodaKalanLt/toplamLt*100;
    const renk = STOK_OZET_RENK[i % STOK_OZET_RENK.length];
    return `<div class="stok-ozet-card" style="--ozet-renk:${renk.renk};--ozet-renk-soft:${renk.soft};">
      <div class="stok-ozet-top">
        <div class="stok-ozet-avatar">${escapeHtml(avatarBaslangic(r.temsilci))}</div>
        <div class="stok-ozet-info">
          <div class="stok-ozet-name" title="${escapeHtml(r.temsilci)}">${escapeHtml(r.temsilci)}</div>
          <div class="stok-ozet-sub">${r.noktaSayisi.toLocaleString('tr-TR')} nokta · ${r.kalemSayisi.toLocaleString('tr-TR')} kalem</div>
        </div>
        <span class="stok-ozet-badge">%${pay.toFixed(0)} PAY</span>
      </div>
      <div class="stok-ozet-values">
        <span class="stok-ozet-lt">${LT(r.depodaKalanLt)}</span>
        <span class="stok-ozet-mk">${MK(r.depodaKalanMk)}</span>
      </div>
      <div class="stok-ozet-bar-track"><div class="stok-ozet-bar-fill" style="width:${Math.max(2,pay).toFixed(1)}%;"></div></div>
    </div>`;
  }).join('');

  grid.innerHTML = kartlar;
}

// Saha Satış Müdürü kartları temsilci renk paletinden (kırmızı/altın/mavi/yeşil/lacivert) bilerek
// farklı, daha soğuk/nötr bir palet kullanır — böylece iki kart grubu görsel olarak birbirinden
// ayırt edilebilir ama aynı tasarım dilini (renkli sol kenarlık + rozet + bar) paylaşır.
const STOK_OZET_MUDUR_RENK = [
  {renk:'#0F7B6C', soft:'rgba(15,123,108,0.12)'},
  {renk:'#6B4FA0', soft:'rgba(107,79,160,0.12)'},
  {renk:'#3E5C76', soft:'rgba(62,92,118,0.12)'},
  {renk:'#9C6B30', soft:'rgba(156,107,48,0.12)'},
  {renk:'#4A4A68', soft:'rgba(74,74,104,0.12)'},
];

function renderTicariStokMuduruOzet(report){
  const ozet = report.ticariStok ? report.ticariStok.ozet : [];
  const grid = document.getElementById('ticariStokMuduruOzetGrid');
  if(!grid) return;
  if(!ozet.length){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Veri bulunamadı.</div>`;
    return;
  }

  const muduruMap = new Map();
  ozet.forEach(r=>{
    const muduru = getSahaMuduru(r.temsilci);
    if(!muduruMap.has(muduru)) muduruMap.set(muduru, {muduru, temsilciSayisi:0, noktaSayisi:0, kalemSayisi:0, depodaKalanMk:0, depodaKalanLt:0});
    const m = muduruMap.get(muduru);
    m.temsilciSayisi += 1;
    m.noktaSayisi += r.noktaSayisi;
    m.kalemSayisi += r.kalemSayisi;
    m.depodaKalanMk += r.depodaKalanMk;
    m.depodaKalanLt += r.depodaKalanLt;
  });
  const muduruListe = Array.from(muduruMap.values()).sort((a,b)=>b.depodaKalanLt-a.depodaKalanLt);
  const toplamLt = muduruListe.reduce((a,r)=>a+r.depodaKalanLt,0) || 1;

  grid.innerHTML = muduruListe.map((r,i)=>{
    const pay = r.depodaKalanLt/toplamLt*100;
    const renk = STOK_OZET_MUDUR_RENK[i % STOK_OZET_MUDUR_RENK.length];
    return `<div class="stok-ozet-card" style="--ozet-renk:${renk.renk};--ozet-renk-soft:${renk.soft};">
      <div class="stok-ozet-top">
        <div class="stok-ozet-avatar">${escapeHtml(avatarBaslangic(r.muduru))}</div>
        <div class="stok-ozet-info">
          <div class="stok-ozet-name" title="${escapeHtml(r.muduru)}">${escapeHtml(r.muduru)}</div>
          <div class="stok-ozet-sub">${r.temsilciSayisi.toLocaleString('tr-TR')} temsilci · ${r.kalemSayisi.toLocaleString('tr-TR')} kalem</div>
        </div>
        <span class="stok-ozet-badge">%${pay.toFixed(0)} PAY</span>
      </div>
      <div class="stok-ozet-values">
        <span class="stok-ozet-lt">${LT(r.depodaKalanLt)}</span>
        <span class="stok-ozet-mk">${MK(r.depodaKalanMk)}</span>
      </div>
      <div class="stok-ozet-bar-track"><div class="stok-ozet-bar-fill" style="width:${Math.max(2,pay).toFixed(1)}%;"></div></div>
    </div>`;
  }).join('');
}

function renderTicariStokView(report){
  populateTemsilciFilter(report.ticariStok ? report.ticariStok.rows : [], 'ticariStokTemsilciFilter');
  renderTicariStokTable(report);
  renderTicariStokOzet(report);
  renderTicariStokMuduruOzet(report);
}

// Bir tablonun (thead th[data-key]) sütun başlıklarına tıklanınca sıralama uygulayan ortak
// yardımcı. Aynı "tıkla → yön belirle → ok işaretini güncelle → tabloyu yeniden çiz" deseni
// önceden 7 farklı tabloda ayrı ayrı (satır satır aynı) tekrarlanıyordu; artık tek bir yerde
// tanımlanıp her tablo için tek satırla kullanılıyor.
function wireSortableTable(tableId, sortStateAlan, renderFn){
  document.querySelectorAll(`#${tableId} thead th[data-key]`).forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.getAttribute('data-key');
      const mevcut = state[sortStateAlan];
      if(mevcut.key===key) mevcut.dir *= -1; else state[sortStateAlan] = {key, dir:-1};
      document.querySelectorAll(`#${tableId} thead .arrow`).forEach(a=>a.textContent='');
      th.querySelector('.arrow').textContent = state[sortStateAlan].dir===1 ? '▲' : '▼';
      renderFn();
    });
  });
}

wireSearchInput('ticariStokSearchInput', 'ticariStokSearchClearBtn', debounce(()=>renderTicariStokTable(state.report)));
wireSearchClear('ticariStokSearchInput', 'ticariStokSearchClearBtn', ()=>renderTicariStokTable(state.report));
document.getElementById('ticariStokTemsilciFilter').addEventListener('change', ()=>renderTicariStokTable(state.report));
document.getElementById('ticariStokDahaFazlaBtn').addEventListener('click', ()=>{
  state.ticariStokGosterilen += TICARI_STOK_SAYFA_BOYUTU;
  renderTicariStokTable(state.report, false);
});

function renderAgingPanel(report){
  const temsilci = document.getElementById('temsilciFilter').value;
  const scopeLabel = temsilci ? temsilci : 'Tüm Temsilciler';
  document.getElementById('agingTitle').textContent = 'Vade Yaşlandırma Analizi — ' + scopeLabel;

  const musterilerForAging = temsilci ? report.musteriler.filter(m=>m.temsilci===temsilci) : report.musteriler;
  const {agingAmount, agingCount} = computeAging(musterilerForAging);
  renderAging(agingAmount, agingCount);
}

function refreshGenelKPIs(report){
  const temsilci = document.getElementById('temsilciFilter') ? document.getElementById('temsilciFilter').value : '';
  const kpiScoped = computeGenelKPI(report, temsilci);
  renderKPIs(kpiScoped);
}

function renderSevkView(report){
  const bosPanel = document.getElementById('sevkBosPanel');
  const icerik = document.getElementById('sevkIcerik');
  // DÜZELTME: bkz. renderGenelBakisView'daki aynı not — bu fonksiyon eskiden çağrıldığında
  // report zaten var olmak ZORUNDAYDI (setActiveView'da "&& state.report" şartı sayesinde),
  // ama rapor yokken sekmeye tıklanınca kullanıcı hiçbir açıklama görmeden boş bir sayfayla
  // karşılaşıyordu. Artık savunmacı: report yoksa boş durumu gösterip çıkar.
  if(!report){
    if(bosPanel) bosPanel.style.display = 'block';
    if(icerik) icerik.style.display = 'none';
    return;
  }
  if(bosPanel) bosPanel.style.display = 'none';
  if(icerik) icerik.style.display = 'block';
  renderSevkMusteriTable(report);
  renderSevkOzet(report);
}

function renderSevkOzet(report){
  const temsilci = document.getElementById('sevkTemsilciFilter').value;
  const scopeLabel = temsilci ? temsilci : 'Tüm Temsilciler';
  document.getElementById('ozetTitle').textContent = 'Sevk Özeti — ' + scopeLabel;
  const ozet = computeSevkOzet(report, temsilci);
  renderOzet(ozet);
}

function renderKpiHeroRow(items, elId){
  const hero = items[0];
  const rest = items.slice(1);
  const heroHTML = `
    <div class="kpi-hero-wrap">
      <div class="kpi-hero-card">
        <div class="kpi-hero-top">
          <span class="kpi-hero-label">${hero.icon||''} ${hero.label}</span>
          ${hero.sub ? `<span class="kpi-hero-chip">${hero.sub}</span>` : ''}
        </div>
        <div class="kpi-hero-value">${hero.display!==undefined ? hero.display : TL(hero.value)}${hero.trend ? `<span class="trend-arrow" style="color:${hero.trend.color};">${hero.trend.arrow}</span>` : ''}</div>
      </div>
    </div>`;
  // "ring:true" verilen kartlarda ikon yerine yüzdesel halka grafiği (fknsRingSvg — Sell Out/Temsilci
  // Karnesi'nde zaten kullanılan aynı bileşen) gösterilir; oran değeri "oran" alanından okunur.
  // "chips: [{label, tutar, renk}]" verilen kartlarda, ana rakamın altında küçük renkli bilgi
  // kutucukları gösterilir (ör. Normal Tahsilat / Bozuk İade-Depozito dökümü) — eskiden bu tür
  // dökümler ana "sub" metnine gömülüp 10px gri yazı içinde kayboluyordu; artık kendi rengi ve daha
  // okunaklı boyutuyla ayrı bir satırda öne çıkıyor.
  const rowHTML = `<div class="kpi-row-grid">` + rest.map(it=>`
    <div class="kpi-row-card${it.chips?' has-chips':''}${it.cls?` cls-${it.cls}`:''}">
      <div class="kpi-row-top-line">
        <span class="kpi-row-icon">${it.icon||''}</span>
        <span class="kpi-row-lbl">${it.label}</span>
      </div>
      <div class="kpi-row-text">
        <div class="kpi-row-val"${it.valueColor?` style="color:${it.valueColor}"`:''}>${it.display!==undefined ? it.display : TL(it.value)}${it.trend ? `<span class="trend-arrow" style="color:${it.trend.color};">${it.trend.arrow}</span>` : ''}</div>
        ${it.sub ? `<div class="kpi-row-extra">${it.sub}</div>` : ''}
      </div>
      ${it.chips ? `<div class="kpi-row-chips">` + it.chips.map(c=>`
        <div class="kpi-row-chip" style="background:${c.bg};color:${c.renk};">
          <div class="kpi-row-chip-lbl">${c.label}</div>
          <div class="kpi-row-chip-val">${TL(c.tutar)}</div>
        </div>`).join('') + `</div>` : ''}
    </div>`).join('') + `</div>`;
  document.getElementById(elId).innerHTML = heroHTML + rowHTML;
}

function renderOzet(ozet){
  const items = [
    {label:'Toplam Kalan Borç', icon:'<i class="fa-solid fa-coins" aria-hidden="true"></i>', value:ozet.toplamKalanBorc, sub:ozet.musteriSayisi.toLocaleString('tr-TR')+' Müşteri'},
    {label:'Açık Sipariş', icon:'<i class="fa-solid fa-box" aria-hidden="true"></i>', cls:'neutral', value:ozet.toplamSiparis, sub:'Sevkiyat Bekleyen'},
    {label:'Sevki Ertelenen', icon:'<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>', cls:'warn', value:ozet.toplamEmanet, sub:'Emanet Sipariş'},
    {label:'Alınan Tahsilat', icon:'<i class="fa-solid fa-circle-check" aria-hidden="true"></i>', cls:'success', value:ozet.toplamTahsilat, sub:'Son Dönem'},
    {label:'Ort. Vade', icon:'<i class="fa-solid fa-calendar" aria-hidden="true"></i>', cls:'accent', value:null, display: ozet.ortalamaVade!=null ? ozet.ortalamaVade+' gün' : '—', sub:ozet.siparisliMusteriSayisi.toLocaleString('tr-TR')+' Sipariş Girilen Müşteri'},
  ];
  renderKpiHeroRow(items, 'ozetGrid');
}

function renderKPIs(kpi){
  // Tahsilat Oranı: gösterilen dönemde alınan tahsilatın, (tahsilat + ay sonu kalan borç) toplamına
  // oranı — Sell Out/Temsilci Karnesi'ndeki halka grafik bileşeni burada da kullanılır, böylece
  // Genel Rapor'un en üstünde de yüzdesel bir gösterge okunaklı şekilde yer alır.
  const tahsilatOraniPayda = (kpi.toplamTahsilat||0) + (kpi.toplamBakiye||0);
  const tahsilatOrani = tahsilatOraniPayda>0 ? (kpi.toplamTahsilat/tahsilatOraniPayda*100) : null;
  const items = [
    {label:'Toplam Kalan Borç', icon:'<i class="fa-solid fa-coins" aria-hidden="true"></i>', value:kpi.toplamBakiye, sub:kpi.musteriSayisi.toLocaleString('tr-TR')+' Müşteri'},
    {label:'Ort. Vade', icon:'<i class="fa-solid fa-calendar" aria-hidden="true"></i>', cls:'neutral', value:null, display: kpi.ortalamaVade!=null ? kpi.ortalamaVade+' gün' : '—', sub:kpi.musteriSayisi.toLocaleString('tr-TR')+' Müşteri'},
    {label:'Toplam Risk', icon:'<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>', cls:'warn', value:kpi.toplamRisk, sub:'Kalan Borç + Çek/Senet'},
    {label:'Çek / Senet Riski', icon:'<i class="fa-solid fa-file-lines" aria-hidden="true"></i>', cls:'danger', value:kpi.toplamCekSenet, sub:'Vadesi Gelmemiş'},
    {label:'Alınan Tahsilat', icon:'<i class="fa-solid fa-circle-check" aria-hidden="true"></i>', cls:'success', value:kpi.toplamTahsilat, sub: kpi.tahsilatEslesmeyenToplam>0 ? (TL(kpi.tahsilatEslesmeyenToplam)+' Bakiyesi Kapalı Müşteriden') : 'Son Dönem'},
    {label:'Tahsilat Oranı', icon:'<i class="fa-solid fa-bullseye" aria-hidden="true"></i>', cls:'accent', value:null, display: fmtYuzde(tahsilatOrani), sub:'Tahsilat / (Tahsilat + Kalan Borç)'},
  ];
  renderKpiHeroRow(items, 'kpiGrid');
}

function populateTemsilciFilter(musteriler, selectId){
  const sel = document.getElementById(selectId || 'temsilciFilter');
  if(!sel) return; // select DOM'da yoksa sessizce çık
  const current = sel.value;
  // DAYANIKLILIK: musteriler undefined/dizi değilse (ör. eksik report alanı) çökmesin.
  const liste = Array.isArray(musteriler) ? musteriler : [];
  const set = Array.from(new Set(liste.map(m=>m && m.temsilci).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Tüm temsilciler</option>' + set.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if(current && set.includes(current)) sel.value = current;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
