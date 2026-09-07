/* ===== TOAST BİLDİRİMİ =====
   alert() yerine tema uyumlu, bloke etmeyen bildirim. KULLANIM SINIRI (bilinçli):
   - success/info: işlem sonuçları ("arşivlendi", "silindi", "güncellendi")
   - warn: ön koşul eksikleri ("önce dosya yükleyin")
   Veri kaybı riski taşıyan UYARI'lar ve hata detayları alert() olarak KALIR — bloke edici
   olmaları, kullanıcının mesajı kaçırmaması için bilinçli bir tasarım tercihidir. */
const TOAST_IKON = {success:'fa-circle-check', warn:'fa-triangle-exclamation', danger:'fa-circle-xmark'};
function toastGoster(tur, baslik, mesaj){
  const kap = document.getElementById('toastKap');
  if(!kap){ alert(baslik + (mesaj ? '\n' + mesaj : '')); return; } // güvenli geri dönüş
  const el = document.createElement('div');
  el.className = 'toast ' + (TOAST_IKON[tur] ? tur : 'warn');
  el.innerHTML = `<i class="fa-solid ${TOAST_IKON[tur]||TOAST_IKON.warn}" aria-hidden="true"></i>
    <div class="t-body"><div class="t-title"></div><div class="t-msg"></div></div>
    <button class="t-kapat" type="button" aria-label="Kapat">✕</button>`;
  el.querySelector('.t-title').textContent = baslik;
  const msgEl = el.querySelector('.t-msg');
  if(mesaj) msgEl.textContent = mesaj; else msgEl.remove();
  let kapatildi = false;
  const kapat = ()=>{ if(kapatildi) return; kapatildi = true; el.classList.add('cikiyor'); setTimeout(()=>el.remove(), 220); };
  el.querySelector('.t-kapat').onclick = kapat;
  kap.appendChild(el);
  // En fazla 3 toast üst üste — en eskisi düşer (ekranı kaplamasın).
  while(kap.children.length > 3) kap.firstElementChild.remove();
  setTimeout(kapat, tur==='success' ? 3800 : 6500);
}

// Müşteri Master'daki Tabela Adı — arama filtrelerinde müşteri adının yanı sıra tabela
// adına göre de eşleşme yapabilmek için. Kayıt yoksa boş string döner (arama etkilenmez).
function musteriTabelaAdi(musteriKod){
  const detay = state.musteriMasterDetay && state.musteriMasterDetay.get(String(musteriKod||''));
  return (detay && detay.tabelaAdi) || '';
}
// Arama kutusundaki metnin (q, zaten toLowerCase yapılmış) bir müşteri kaydıyla eşleşip
// eşleşmediğini kontrol eder — müşteri adı, kodu ve varsa Tabela Adı'na bakar. Büyük/küçük
// harf duyarlılığı olmaması için hem q hem de karşılaştırılan alanlar toLowerCase kullanır.
function musteriAramaEslesiyorMu(q, musteriAdi, musteriKod, musteriUnvan){
  if(!q) return true;
  if(String(musteriAdi||'').toLocaleLowerCase('tr-TR').includes(q)) return true;
  if(String(musteriKod||'').toLocaleLowerCase('tr-TR').includes(q)) return true;
  const tabela = musteriTabelaAdi(musteriKod);
  if(tabela && tabela.toLocaleLowerCase('tr-TR').includes(q)) return true;
  // Cari Hesap Ekstre'den gelen müşteri ünvanı da aramaya dahildir (kullanıcı isteği): ör. "OSMAN
  // ÖKTEN" (ünvan) diye arayınca "ÖKTEN BAKKAL" (müşteri adı) kartı da bulunur. Ünvan hem parametre
  // olarak (kart m.musteriUnvan) hem de Cari Ekstre lookup'ından (state) kontrol edilir.
  if(musteriUnvan && String(musteriUnvan).toLocaleLowerCase('tr-TR').includes(q)) return true;
  const unvanState = musteriCariUnvan(musteriKod);
  if(unvanState && unvanState.toLocaleLowerCase('tr-TR').includes(q)) return true;
  return false;
}
// Cari Hesap Ekstre'den bir müşterinin ünvanını (kod bazında) döndürür — arama için. buildReport
// çıktısındaki report.cariEkstreUnvanMap üzerinden çalışır (yoksa boş).
function musteriCariUnvan(musteriKod){
  const map = state.report && state.report.cariEkstreUnvanMap;
  if(!map) return '';
  const v = (map instanceof Map) ? map.get(String(musteriKod||'')) : map[String(musteriKod||'')];
  return v || '';
}

// Bir kart açıldığında (expand), içine eklenen detay/tablo satırları kartın boyunu uzatır; bu da
// bazı durumlarda tıklanan kartın alt kısmının (hatta tamamının) ekranın dışına kaymasına yol
// açabiliyordu. Kart yeniden çizildikten (render) SONRA, DOM'a yeni eklenen elemanı bulup normal
// akışta (sayfayı aniden zıplatmadan) görünür alana kaydırıyoruz — sadece kart AÇILDIĞINDA,
// kapatıldığında değil.
// (debounce, yükleme sırası gereği 01-cekirdek-ve-arsiv.js dosyasına taşındı)

function getFilteredSorted(report){
  const q = document.getElementById('searchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('temsilciFilter').value;
  const riskFilter = document.getElementById('riskFilter').value;
  const vadeMin = document.getElementById('vadeMinInput').value;
  const vadeMax = document.getElementById('vadeMaxInput').value;

  // Kalemler (bakiye) dosyasında kaydı olmayan ama açık siparişi/sevki ertelenen tutarı olan
  // (bakiyesiz) müşteriler — Sevk Raporu'ndaki (getSevkFilteredSorted) ile AYNI mantık: bu
  // müşteriler daha önce burada hiç gösterilmiyordu, bu yüzden "Açık siparişi olan" filtresi ve
  // arama, KPI toplamlarında sayılan bu müşterileri hiçbir zaman listelemiyordu.
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — yalnızca çek/senet riski yazılır.
  const bakiyesizSatirlari = (report.bakiyesiz||[]).map(b=>({
    musteri: b.musteri, musteriAdi: b.musteriAdi, temsilci: b.temsilci,
    kalanBorc: 0, avgVadeGun: null, siparisTutari: b.siparisTutari||0, emanetSiparis: b.emanetSiparis||0,
    cekSenet: b.cekSenet||0, alinanTahsilat: 0, toplamRisk: (b.cekSenet||0),
    invoices: [], cekSenetDetay: b.cekSenetDetay||[], __bakiyesiz: true,
  }));
  let rows = report.musteriler.concat(bakiyesizSatirlari).filter(m=>{
    // GÖRÜNÜRLÜK FİLTRESİ (kullanıcı kararı): buildReport'ta hesaplanan m.__gizli bayrağı — Müşteri
    // Master kaynaklı, boş (bakiyesiz + arşiv geçmişsiz) Aktif kartlar veya dolu-olmayan Pasif/İptal
    // kartlar burada elenir. Kalemler/Cari Ekstre kaynaklı kartlar (eski davranış) hiç etkilenmez.
    if(m.__gizli) return false;
    if(q && !musteriAramaEslesiyorMu(q, m.musteriAdi, m.musteri, m.musteriUnvan) && !String(m.temsilci).toLocaleLowerCase('tr-TR').includes(q)) return false;
    if(temsilci && m.temsilci !== temsilci) return false;
    if(riskFilter==='over60' && !(m.avgVadeGun>60)) return false;
    if(riskFilter==='hasCek' && !(m.cekSenet>0)) return false;
    if(riskFilter==='hasSiparis' && !(m.siparisTutari>0)) return false;

    if(vadeMin !== '' && !(m.avgVadeGun >= Number(vadeMin))) return false;
    if(vadeMax !== '' && !(m.avgVadeGun <= Number(vadeMax))) return false;

    return true;
  });
  const {key,dir} = state.sort;
  rows = rows.slice().sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

const VADE_RISK_ESIGI = 28;
function isRiskliMusteri(m){
  return (m.avgVadeGun||0) >= VADE_RISK_ESIGI;
}

function bayiHakedisliMusteriKodlari(){
  const rapor = state.bayiHakedisReport;
  if(!rapor || !Array.isArray(rapor.noktalar)) return new Set();
  return new Set(rapor.noktalar.map(n=>n.kod));
}
function hakedisRozeti(musteriKod, hakedisKodlari){
  if(!hakedisKodlari || !hakedisKodlari.has(musteriKod)) return '';
  // Artık salt bilgi rozeti değil, tıklanınca o müşterinin Bayi Hakediş popup'ını
  // açan bir buton — data-musteri-kod ile taşınan kod, kart grid'lerine (Genel
  // Bakış/Müşteriler/Sevk Erteleme) delege edilen tek bir click listener'da okunuyor.
  return '<button type="button" class="badge hakedis hakedis-btn" data-musteri-kod="'+escapeHtml(musteriKod)+'" title="Bu müşterinin Bayi Hakediş raporunda (Ciro Primi/Dönemsel İskonto) kaydı var — açmak için tıklayın">Hakediş</button>';
}
// Ticari Stok raporunda (depoda kalan emanet ürün) kaydı olan müşteri kodlarının
// seti — ticariStokGrupMap zaten 'stok_'+musteriNo anahtarıyla dolu, burada sade
// müşteri koduna (musteriNo) indirgiyoruz ki hakedisKodlari ile aynı şekilde kontrol edilebilsin.
function ticariStokluMusteriKodlari(){
  const map = state.ticariStokGrupMap;
  if(!map) return new Set();
  const set = new Set();
  map.forEach(g=>{ if(g && g.musteriNo) set.add(String(g.musteriNo)); });
  return set;
}
function emanetRozeti(musteriKod, stokKodlari){
  if(!stokKodlari || !stokKodlari.has(musteriKod)) return '';
  // Aynı şekilde Emanet de artık tıklanınca Ticari Stok/Emanet popup'ını açan bir buton.
  return '<button type="button" class="badge emanet emanet-btn" data-musteri-kod="'+escapeHtml(musteriKod)+'" title="Bu müşterinin Ticari Stok raporunda depoda kalan (emanet) ürün kaydı var — açmak için tıklayın">Emanet</button>';
}
// Kart grid'lerinde (Genel Bakış Nokta Detay, Müşteriler, Sevk Erteleme) render sonrası
// tekil listener eklemek yerine, her üç grid container'ına tek bir delege click listener
// bağlıyoruz — kartlar sık sık yeniden render edildiği için bu, olay dinleyicisi
// birikmesini (memory leak) ve her render sonrası yeniden bağlama ihtiyacını önler.
document.addEventListener('click', (e)=>{
  const hakedisBtn = e.target.closest('.hakedis-btn');
  if(hakedisBtn){
    e.stopPropagation();
    hakedisModalAc(hakedisBtn.getAttribute('data-musteri-kod'));
    return;
  }
  const emanetBtn = e.target.closest('.emanet-btn');
  if(emanetBtn){
    e.stopPropagation();
    stokModalAc('stok_'+emanetBtn.getAttribute('data-musteri-kod'));
  }
});
document.getElementById('dikkatEsikBanner').textContent = VADE_RISK_ESIGI;
document.getElementById('dikkatEsikModal').textContent = VADE_RISK_ESIGI;

function openDikkatModal(){
  document.getElementById('dikkatModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDikkatModal(){
  document.getElementById('dikkatModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('dikkatBanner').addEventListener('click', openDikkatModal);
document.getElementById('dikkatBanner').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openDikkatModal(); }
});
document.getElementById('dikkatModalClose').addEventListener('click', closeDikkatModal);

function faturaModalAc(musteriKod, musteriAdi){
  try{
    state.faturaModalMevcut = {kod: musteriKod, adi: musteriAdi};
    const report = state.report;
    const kod = String(musteriKod||'').trim();
    const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
      || state.faturaModalYedekMap.get(kod) || null;
    document.getElementById('faturaModalAvatar').textContent = avatarBaslangic(musteriAdi);
    document.getElementById('faturaModalTitle').textContent = musteriAdi;
    document.getElementById('faturaModalSub').textContent = musteriKod;
    const faturalar = (m && m.invoices) ? m.invoices.filter(inv=>inv.kalanBorc !== 0) : [];
    document.getElementById('faturaModalTbody').innerHTML = faturalar.length ? faturalar.map(inv=>{
      const gun = inv.gunFatura;
      const gunCls = gun>60 ? 'neg' : (gun>30 ? '' : '');
      return `<tr><td>${escapeHtml(inv.belgeNo||'—')}</td><td>${fmtDate(inv.faturaTarihi)}</td><td class="num num-strong">${TL(inv.kalanBorc)}</td><td class="num ${gunCls}">${gun!=null?gun:'—'}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="empty-state">${m ? 'Açık fatura bulunamadı' : 'Bu müşteri güncel raporda bulunamadı — lütfen Genel Rapor sekmesinde raporun yüklü olduğundan emin olun'}</td></tr>`;
    const toplam = faturalar.reduce((a,inv)=>a+(inv.kalanBorc||0),0);
    let agirlikliGun = 0, agirlikBorc = 0;
    faturalar.forEach(inv=>{
      if(inv.gunFatura!=null && inv.kalanBorc!==0){
        agirlikliGun += inv.kalanBorc * inv.gunFatura;
        agirlikBorc += inv.kalanBorc;
      }
    });
    const ortGun = agirlikBorc!==0 ? Math.round(agirlikliGun/agirlikBorc) : null;
    const ortTarih = ortGun!=null ? new Date(turkiyeBugun().getTime() - ortGun*86400000) : null;
    document.getElementById('faturaModalToplam').innerHTML = `
      <div><div class="fatura-toplam-label">Toplam Kalan Borç</div><div class="fatura-toplam-value">${TL(toplam)}</div></div>
      <div class="fatura-toplam-col"><div class="fatura-toplam-label">Ort. Vade</div><div class="fatura-toplam-value fatura-toplam-vade">${ortGun!=null ? ortGun+' gün' : '—'}</div></div>
      <div class="fatura-toplam-col"><div class="fatura-toplam-label">Ort. Vade Tarihi</div><div class="fatura-toplam-value">${ortTarih ? fmtDate(ortTarih) : '—'}</div></div>
    `;

    // --- Çek / Senet Detayı (varsa) → sadece popup butonunu göster/gizle, içerik cekSenetModalAc'te dolduruluyor ---
    const cekSenetDetay = (m && m.cekSenetDetay) ? m.cekSenetDetay : [];
    document.getElementById('faturaModalCekSenetBtn').style.display = cekSenetDetay.length ? 'inline-flex' : 'none';

    document.getElementById('faturaModalOverlay').classList.add('open');
  }catch(err){
    console.error('Fatura modali açılırken hata:', err);
    document.getElementById('faturaModalAvatar').textContent = avatarBaslangic(musteriAdi);
    document.getElementById('faturaModalTitle').textContent = musteriAdi||'';
    document.getElementById('faturaModalSub').textContent = musteriKod||'';
    document.getElementById('faturaModalTbody').innerHTML = '<tr><td colspan="4" class="empty-state">Bir hata oluştu: '+escapeHtml(err.message)+'</td></tr>';
    document.getElementById('faturaModalToplam').innerHTML = '';
    document.getElementById('faturaModalCekSenetBtn').style.display = 'none';
    document.getElementById('faturaModalOverlay').classList.add('open');
  }
}
function faturaModalKapat(){
  document.getElementById('faturaModalOverlay').classList.remove('open');
}
document.getElementById('faturaModalClose').addEventListener('click', faturaModalKapat);
document.getElementById('faturaModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='faturaModalOverlay') faturaModalKapat();
});

function cekSenetModalSatirDurumHtml(c){
  // Hem Çek hem Senet: kullanıcı elle "Tahsil Edildi" demeden risk olarak kalır (otomatik
  // tahsilat sayılmaz) — kullanıcı isteği: "çekte de riskten sayılsın, en mantıklı çözüm buydu".
  if(c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet'){
    if(c.tahsilEdildiMi){
      // KURAL (kullanıcı isteği): "Tahsil edildi kaydı olan İptal edilemez." — İptal butonu
      // burada bilerek YOK, yalnızca durum rozeti gösterilir.
      return `<span class="badge" style="background:var(--good-soft,#e6f6ec);color:var(--good,#1a8a4c);white-space:nowrap;">Tahsil Edildi</span>`;
    }
    // Kısa buton metni ("Tahsil Et") kullanılır — satır türü (Çek/Senet) zaten aynı satırda ayrı
    // bir kolonda görünüyor, butonda tekrarlamaya gerek yok; bu, iki butonun tek satırda yan yana
    // sığmasını sağlar (önceki "Çek Tahsil Edildi mi?" metni 3 satıra bölünüp İptal'i alta itiyordu).
    // İPTAL BUTONU HER ZAMAN UYGULANABİLİR (kullanıcı kuralı) — tahsil edilmemiş her çek/senet
    // için, yeni dosyada eksik olsun ya da olmasın, doğrudan kart üzerinden de iptal edilebilir.
    return `<div class="senet-durum-btn-grup">
      <button type="button" class="btn small senet-tahsil-btn" data-senet-anahtari="${escapeHtml(c.senetAnahtari||'')}" title="Tahsil edildi olarak işaretle">Tahsil Et</button>
      <button type="button" class="btn small senet-iptal-btn" data-senet-anahtari="${escapeHtml(c.senetAnahtari||'')}" title="Bu kaydı kalıcı olarak sil">İptal</button>
    </div>`;
  }
  return '—';
}
function cekSenetModalAc(musteriKod, musteriAdi){
  const kod = String(musteriKod||'').trim();
  state.cekSenetModalMevcut = {kod, adi: musteriAdi};
  const report = state.report;
  const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
    || state.faturaModalYedekMap.get(kod) || null;
  const detay = (m && m.cekSenetDetay) ? m.cekSenetDetay : [];
  document.getElementById('cekSenetModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('cekSenetModalTitle').textContent = musteriAdi||'';
  document.getElementById('cekSenetModalSub').textContent = kod + ' · ' + detay.length + ' kayıt';
  document.getElementById('cekSenetModalTbody').innerHTML = detay.length ? detay.map(c=>`<tr>
    <td>${escapeHtml(c.no||'—')}</td><td>${escapeHtml(c.tip||'—')}</td>
    <td>${fmtDate(c.belgeTarihi)}</td><td>${fmtDate(c.vade)}</td><td class="num">${TL(c.tutar)}</td>
    <td>${cekSenetModalSatirDurumHtml(c)}</td>
  </tr>`).join('') : `<tr><td colspan="6" class="empty-state">Çek/Senet kaydı bulunamadı.</td></tr>`;
  document.getElementById('cekSenetModalOverlay').classList.add('open');
}
function cekSenetModalKapat(){
  document.getElementById('cekSenetModalOverlay').classList.remove('open');
}
document.getElementById('cekSenetModalClose').addEventListener('click', cekSenetModalKapat);
document.getElementById('cekSenetModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='cekSenetModalOverlay') cekSenetModalKapat();
});
// "Çek/Senet Tahsil Edildi mi?" butonu — tıklanınca ilgili kaydın anahtarı kalıcı onay listesine
// eklenir, rapor bu müşteri için yeniden hesaplanır (tam yeniden yükleme YAPILMADAN — yalnızca
// state.cekSenetArsivi'deki ilgili kaydın durumu güncellenir) ve hem popup hem de arkadaki tüm
// ekranlar (Toplam Risk, Alınan Tahsilat, KPI'lar vb.) tazelenir.
document.getElementById('cekSenetModalTbody').addEventListener('click', async (e)=>{
  const tahsilBtn = e.target.closest('.senet-tahsil-btn');
  const iptalBtn = e.target.closest('.senet-iptal-btn');
  const btn = tahsilBtn || iptalBtn;
  if(!btn) return;
  const anahtar = btn.getAttribute('data-senet-anahtari');
  if(!anahtar || !state.cekSenetArsivi[anahtar]) return;
  if(tahsilBtn){
    const onayli = confirm('Bu çek/senedin tahsil edildiğini onaylıyor musunuz? Onaylarsanız bu kayıt artık risk olarak değil, tahsilat olarak sayılacaktır.');
    if(!onayli) return;
    state.cekSenetArsivi[anahtar].durum = 'tahsilEdildi';
  }else{
    // İPTAL HER ZAMAN UYGULANABİLİR (kullanıcı kuralı) — bu buton yalnızca henüz tahsil edilmemiş
    // kayıtlarda göründüğü için (bkz. cekSenetModalSatirDurumHtml), burada ek bir durum kontrolüne
    // gerek yoktur; "Tahsil Edildi" olanlarda bu buton zaten hiç render edilmez.
    const onayli = confirm('Bu çek/senet kaydı KALICI OLARAK SİLİNECEK. Onaylıyor musunuz?');
    if(!onayli) return;
    delete state.cekSenetArsivi[anahtar];
  }
  await cekSenetArsiviniKaydet(state.cekSenetArsivi);
  state.cekSenetEksikKalanlar = (state.cekSenetEksikKalanlar||[]).filter(k=>k.anahtar!==anahtar);
  if(state.report){
    // KRİTİK HATA DÜZELTMESİ: Önceden burada KOŞULSUZ buildReport(state.files, ...) çağrılıp TÜM
    // rapor yeniden inşa ediliyordu. Ama kullanıcı Kalemler/Cari Ekstre'yi HER GÜN yeniden yüklemek
    // ZORUNDA DEĞİL (bkz. ilgili mimari karar) — uygulama buluttan hazır bir rapor açtığında
    // state.files TAMAMEN BOŞTUR (yalnızca state.report doludur). buildReport(state.files,...) bu
    // durumda boş dosyalarla çalışıp TÜM müşterilerin kalan borcunu/bakiyesini SIFIRLIYORDU.
    // Artık: state.files gerçekten doluysa (kullanıcı bu oturumda dosya yüklediyse) eskisi gibi tam
    // yeniden inşa edilir; boşsa (buluttan gelen hazır rapor durumu — pratikte çok daha sık) mevcut
    // rapor YENİDEN İNŞA EDİLMEZ, yalnızca çek/senet alanları (cekSenet/cekSenetDetay/toplamRisk)
    // güncellenir — kalan borç/bakiye gibi diğer TÜM alanlar dokunulmadan korunur.
    const filesGercektenDoluMu = !!(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length);
    state.report = filesGercektenDoluMu
      ? buildReport(state.files, state.musteriMasterMap)
      : cekSenetKararlariniMevcutRaporaUygula(state.report);
    renderReport(state.report);
  }
  const mevcut = state.cekSenetModalMevcut;
  if(mevcut) cekSenetModalAc(mevcut.kod, mevcut.adi);
  // Arkada açık olan Fatura modalı (Toplam Kalan Borç / Risk başlığı) aynı müşteriye aitse onu da
  // tazele — aksi halde kullanıcı modalı kapatıp tekrar açana kadar eski (onay öncesi) Toplam Risk
  // değerini görmeye devam eder.
  const faturaMevcut = state.faturaModalMevcut;
  if(faturaMevcut && mevcut && String(faturaMevcut.kod).trim()===String(mevcut.kod).trim()){
    faturaModalAc(faturaMevcut.kod, faturaMevcut.adi);
  }
});

/* =====================================================================
   ÇEK/SENET EKSİK KAYIT ONAY MODALI (kullanıcı isteği)
   Yeni bir Çek/Senet Riski dosyası yüklenip rapor oluşturulduktan SONRA, arşivde olup yeni dosyada
   YER ALMAYAN kayıtlar için kullanıcıya "Tahsil Edildi mi, İptal mi?" sorar. Kararlar
   state.cekSenetArsivi'ne uygulanıp kalıcı olarak (bulut+cihaz) kaydedilir, rapor yeniden hesaplanır.
   ===================================================================== */
function cekSenetEksikSatirHtml(k){
  const tipEtiket = k.tahsilatTuru === 'Cek' ? 'Çek' : (k.tahsilatTuru === 'Senet' ? 'Senet' : (k.tahsilatTuru||'—'));
  return `<tr data-eksik-anahtar="${escapeHtml(k.anahtar)}">
    <td>${escapeHtml(k.musteriAdi||k.musteriKod||'—')}</td>
    <td>${escapeHtml(k.no||'—')}</td>
    <td>${tipEtiket}</td>
    <td>${fmtDate(k.vadeTarihi ? new Date(k.vadeTarihi) : null)}</td>
    <td class="num">${TL(k.tutar)}</td>
    <td>
      <div class="senet-durum-btn-grup">
        <button type="button" class="btn small eksik-tahsil-btn" data-eksik-anahtar="${escapeHtml(k.anahtar)}" style="color:var(--good,#1a8a4c);border-color:var(--good,#1a8a4c);" title="Tahsil edildi olarak işaretle">Tahsil Et</button>
        <button type="button" class="btn small eksik-iptal-btn" data-eksik-anahtar="${escapeHtml(k.anahtar)}" style="color:var(--danger,#c0392b);border-color:var(--danger,#c0392b);" title="Bu kaydı kalıcı olarak sil">İptal</button>
      </div>
    </td>
  </tr>`;
}
function cekSenetEksikOnayModalAc(eksikKalanlar){
  document.getElementById('cekSenetEksikModalSub').textContent = eksikKalanlar.length + ' kayıt';
  document.getElementById('cekSenetEksikModalTbody').innerHTML = eksikKalanlar.map(cekSenetEksikSatirHtml).join('');
  document.getElementById('cekSenetEksikModalOverlay').classList.add('open');
}
function cekSenetEksikModalKapat(){
  document.getElementById('cekSenetEksikModalOverlay').classList.remove('open');
}
document.getElementById('cekSenetEksikModalClose').addEventListener('click', cekSenetEksikModalKapat);
document.getElementById('cekSenetEksikModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='cekSenetEksikModalOverlay') cekSenetEksikModalKapat();
});
document.getElementById('cekSenetEksikModalTbody').addEventListener('click', async (e)=>{
  const tahsilBtn = e.target.closest('.eksik-tahsil-btn');
  const iptalBtn = e.target.closest('.eksik-iptal-btn');
  const btn = tahsilBtn || iptalBtn;
  if(!btn) return;
  const anahtar = btn.getAttribute('data-eksik-anahtar');
  if(!anahtar || !state.cekSenetArsivi[anahtar]) return;
  const satir = e.target.closest('tr');
  if(tahsilBtn){
    const onayli = confirm('Bu çek/senedin tahsil edildiğini onaylıyor musunuz? Onaylarsanız artık risk olarak değil, tahsilat olarak sayılacaktır.');
    if(!onayli) return;
    state.cekSenetArsivi[anahtar].durum = 'tahsilEdildi';
  }else{
    const onayli = confirm('Bu çek/senet kaydı KALICI OLARAK SİLİNECEK. Onaylıyor musunuz?');
    if(!onayli) return;
    delete state.cekSenetArsivi[anahtar];
  }
  await cekSenetArsiviniKaydet(state.cekSenetArsivi);
  state.cekSenetEksikKalanlar = state.cekSenetEksikKalanlar.filter(k=>k.anahtar!==anahtar);
  if(satir) satir.remove();
  if(!state.cekSenetEksikKalanlar.length) cekSenetEksikModalKapat();
  // Karar, müşteri kartındaki Toplam Risk/Alınan Tahsilat'ı etkilediği için raporu yeniden kur.
  // KRİTİK HATA DÜZELTMESİ: bkz. yukarıdaki cekSenetModalTbody handler'ındaki aynı not —
  // state.files boşken (buluttan gelen hazır rapor durumu) koşulsuz buildReport çağrısı TÜM
  // müşterilerin bakiyesini sıfırlıyordu. Aynı güvenli düzeltme burada da uygulanır.
  if(state.report){
    const filesGercektenDoluMu = !!(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length);
    state.report = filesGercektenDoluMu
      ? buildReport(state.files, state.musteriMasterMap)
      : cekSenetKararlariniMevcutRaporaUygula(state.report);
    renderReport(state.report);
  }
});

// Rapor zaten bellekteyken (state.report) yeni bir dosya yüklemesi olmadan çek/senet onayını

// yansıtmak için: tahsilatArsiv'deki ilgili çek/senet satır(lar)ını "gecerli" yapar, cekSenetMap /
// cekSenetDetay / m.cekSenet / m.toplamRisk / m.alinanTahsilat / m.kalanBorc değerlerini o
// müşteri için yeniden türetir ve ekranı tazeler. buildReport'un ilgili bölümüyle aynı formülleri
// izler (bkz. buildReport içindeki cekSenetMap/cekSenetDetayMap ve toplamRisk hesaplamaları).
// Onaylanan çek/senedin GEÇMİŞ günlük arşiv kopyalarını da günceller (bkz. cekSenetOnayiUyguladiktanSonraRaporuTazele
// yorumu) — aksi halde Trend Analizi/Aylık Ortalama Tahsilat gibi state.faturaArsivCache üzerinden
// hesaplanan ekranlar, arşive o gün yazılmış ESKİ (gecerli:false) hâli okumaya devam eder; sadece
// state.report.musteriler[].cekSenetDetay'ı güncellemek YETERLİ DEĞİLDİR, çünkü bu iki veri kaynağı
// (canlı rapor ile arşiv) birbirinden bağımsız kopyalardır.
async function cekSenetArsivGecerliBayragiGuncelle(){
  const arsiv = state.faturaArsivCache || {};
  const degisenGunler = {}; // gun -> gunKaydi (yalnızca gerçekten değişen günler — kısmi PATCH için)
  Object.keys(arsiv).forEach(gun=>{
    const gunKaydi = arsiv[gun];
    if(!gunKaydi || !Array.isArray(gunKaydi.tahsilatArsiv)) return;
    let buGunDegisti = false;
    gunKaydi.tahsilatArsiv.forEach(r=>{
      if(r.tahsilatTuru !== 'Cek' && r.tahsilatTuru !== 'Senet') return;
      const onaylandi = state.cekSenetTahsilOnaylari.has(r.senetAnahtari);
      if(onaylandi !== r.gecerli){ r.gecerli = onaylandi; buGunDegisti = true; }
    });
    if(buGunDegisti) degisenGunler[gun] = gunKaydi;
  });
  if(Object.keys(degisenGunler).length){
    // Arşiv içeriği değişti — cihaza kalıcı kaydet, bulut açıksa SADECE değişen günleri (kısmi
    // PATCH) oraya da yazar, ve birleştirme önbelleğini (faturaBirlesikCache, referans bazlı)
    // geçersiz kılar ki bir sonraki okuma güncel veriyi worker'da yeniden hesaplasın.
    saveFaturaKontrolArsivToLocal(arsiv).catch(()=>{});
    if(cloudEnabled()){
      const sonuc = await saveFaturaKontrolArsivGunleriToCloud(degisenGunler);
      if(!sonuc.ok) console.error('UYARI: Çek/Senet onayı sonrası arşiv buluta yazılamadı, sadece cihazda kaldı.', sonuc.reason);
    }
    faturaBirlesikCache = { kaynak: null, promise: null };
  }
}
async function cekSenetOnayiUyguladiktanSonraRaporuTazele(){
  await cekSenetArsivGecerliBayragiGuncelle();
  const report = state.report;
  if(!report) return;
  const tumMusteriler = (report.musteriler||[]).concat(report.bakiyesiz||[]);
  tumMusteriler.forEach(m=>{
    if(!m.cekSenetDetay || !m.cekSenetDetay.length) return;
    let degisenVar = false;
    let yeniCekSenetRisk = 0;
    m.cekSenetDetay.forEach(c=>{
      if(c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet'){
        const onaylandi = state.cekSenetTahsilOnaylari.has(c.senetAnahtari);
        if(onaylandi !== c.tahsilEdildiMi) degisenVar = true;
        c.tahsilEdildiMi = onaylandi;
      }
      if((c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet') && !c.tahsilEdildiMi) yeniCekSenetRisk += (c.tutar||0);
    });
    if(!degisenVar && yeniCekSenetRisk === (m.cekSenet||0)) return;
    m.cekSenet = yeniCekSenetRisk;
    if(!m.__bakiyesiz){
      m.toplamRisk = m.kalanBorc + m.cekSenet;
    } else {
      m.toplamRisk = m.cekSenet;
    }
  });
  // ÖNEMLİ: computeSevkOzet/computeGenelKPI/computeNoktaYaslandirma/computeNakitAkisTahmini/
  // computeSupheliAlacak gibi fonksiyonlar memoizePure ile önbelleklenir; önbellek anahtarı
  // `report` nesnesinin REFERANSINA (kimliğine) göre üretilir, içeriğine göre değil (bkz.
  // __dataVersion — WeakMap tabanlı). state.report'u YERİNDE (aynı referansla) değiştirirsek bu
  // fonksiyonlar değişikliği fark etmez ve ESKİ (tahsil öncesi) sonucu döndürmeye devam eder — bu
  // yüzden kart/Toplam Risk ekranda güncellenmiyordu, sadece yeni bir dosya yüklemesi (ki o da
  // state.report'u TAMAMEN yeni bir nesneyle değiştiriyor) sorunu "çözüyormuş" gibi görünüyordu.
  // Çözüm: mutasyondan sonra report'u sığ (shallow) kopyalayıp state.report'a YENİ bir referans
  // olarak atıyoruz — böylece tüm memoize önbellekleri otomatik olarak geçersiz sayılır.
  if(report){
    state.report = Object.assign({}, report, {
      musteriler: (report.musteriler||[]).slice(),
      bakiyesiz: (report.bakiyesiz||[]).slice(),
    });
  }
  if(typeof renderReport === 'function' && state.report) renderReport(state.report);
  // Güncellenmiş raporu (yeni Toplam Risk/cekSenetDetay değerleriyle) cihaza VE (bulut açıksa)
  // buluta kalıcı kaydet — aksi halde F5/sayfa yenilemede veya başka bir cihazda state.report,
  // buildReport'un EN SON çalıştığı andaki (onay öncesi) hâliyle geri yüklenir ve "Tahsil Edildi"
  // durumu sıfırlanmış gibi görünür. (Onay bilgisinin kendisi state.cekSenetTahsilOnaylari'nde
  // zaten kalıcıdır, ama raporun KENDİSİ bu onayı yansıtacak şekilde yeniden kaydedilmezse
  // ekranda eski hâli görünmeye devam eder — buildReport yeniden ÇALIŞTIRILMADIĞI sürece.)
  if(state.report){
    saveReportToStorage(state.report).catch(()=>{});
    if(cloudEnabled()){
      saveReportToCloud(state.report).catch(err=> console.error('UYARI: Çek/Senet onayı sonrası rapor buluta yazılamadı, sadece cihazda kaldı.', err));
    }
  }
}

async function tahsilatTahminiModalAc(musteriKod, musteriAdi){
  document.getElementById('tahsilatTahminiModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('tahsilatTahminiModalTitle').textContent = musteriAdi||'';
  const body = document.getElementById('tahsilatTahminiModalBody');
  body.innerHTML = `<div class="empty-state">Yükleniyor…</div>`;
  document.getElementById('tahsilatTahminiModalOverlay').classList.add('open');

  const kod = String(musteriKod||'').trim();
  const report = state.report;
  const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
    || state.faturaModalYedekMap.get(kod) || null;
  const kalanBorc = (m && m.kalanBorc) || 0;
  // DÜZELTME (2. tur): Bu popup üç farklı görünümden açılabiliyor — Fatura Kontrol (tarihe özgü
  // "seciliSiparis" alanı), ve Müşteri Bazlı Cari Özet / Sevk Kontrol (genel açık sipariş tutarı,
  // "siparisTutari" alanı). state.faturaModalYedekMap, hangi görünüm en son render edildiyse onun
  // satırını taşıyor. "seciliSiparis" anahtarı GERÇEKTEN varsa (Fatura Kontrol'den geldiyse, değeri
  // 0 olsa bile) onu kullan; yoksa (Cari Özet/Sevk'ten geldiyse) genel siparisTutari alanına düş.
  const yedekSatir = state.faturaModalYedekMap.get(kod);
  const siparisTutari = (yedekSatir && typeof yedekSatir.seciliSiparis === 'number')
    ? yedekSatir.seciliSiparis
    : ((m && m.siparisTutari) || (yedekSatir && yedekSatir.siparisTutari) || 0);
  const toplam = kalanBorc + siparisTutari;

  let ozet = null;
  // KULLANICI KARARI: Tahsilat Tahmini artık "12 AY GENEL" (tüm arşiv ortalaması, computeMusteriAylikOzet'in
  // eski/varsayılan davranışı) yerine SON 3 AY penceresini kullanır — ekrandaki "GÜNCEL" rozetiyle
  // işaretlenen, en son dönemi yansıtan pencereyle AYNI kaynak. Önceki halde modal, mevsimsellik
  // nedeniyle çok daha düşük çıkabilen tüm-zamanların ortalamasını kullandığı için tahmini tahsil
  // süresini olduğundan uzun gösteriyordu (kullanıcı örneği: aylık 3M ödeyen bir müşteri için 57 gün).
  // KULLANICI KARARI: Üç pencere (Son 3 Ay / Son 6 Ay / 12 Ay Genel) paralel hesaplanır ve
  // Aylık Trend Analizi'ndeki (analizModalAc) renkli kart deseniyle YAN YANA/seçilebilir gösterilir
  // — kullanıcı istediği pencereyi seçip o pencerenin aylık ortalama tahsilatını temel alabilir.
  // "Teslimde alınacak tahsilat" (manuel Ekle) mantığı DEĞİŞMEDİ: girilen tutar SADECE kalan
  // tutardan düşülür, seçili pencerenin aylık ortalama tahsilat hızını (gunlukHiz) HİÇ ETKİLEMEZ
  // (kullanıcı kararı: "tahsilat ortalaması değişmesin").
  let ozet3 = null, ozet6 = null, ozet12 = null;
  try{
    [ozet3, ozet6, ozet12] = await Promise.all([
      computeMusteriAylikOzetPeriyot(kod, 3),
      computeMusteriAylikOzetPeriyot(kod, 6),
      computeMusteriAylikOzetPeriyot(kod, null),
    ]);
  }catch(err){ console.error('Tahsilat tahmini hesaplanırken hata:', err); }
  const pencereler = [
    {key:'3', etiket:'SON 3 AY', ozet:ozet3, rozet:'GÜNCEL', bg:'#0F1C3F', fg:'#fff', fgSoft:'rgba(255,255,255,.65)'},
    {key:'6', etiket:'SON 6 AY', ozet:ozet6, rozet:null, bg:'#F7EFDA', fg:'#4A3B1A', fgSoft:'#8A7548'},
    {key:'12', etiket:'12 AY GENEL', ozet:ozet12, rozet:null, bg:'var(--surface)', fg:'var(--ink)', fgSoft:'var(--ink-soft)'},
  ];
  let seciliPencere = pencereler.find(p=>p.ozet && p.ozet.aylikTahsilat>0) || pencereler[0];
  let gunlukHiz = (seciliPencere.ozet && seciliPencere.ozet.aylikTahsilat>0) ? (seciliPencere.ozet.aylikTahsilat/30) : null;

  // Üstteki Kalan Borç / Sipariş / Toplam özeti + üç pencereli seçim kartları + tahmini tahsil
  // rozeti + manuel "anlık tahsilat ekle" alanı.
  // Not: girilen "anlık tahsilat" hiçbir arşive/kayda YAZILMAZ — sadece bu popup açıkken yaşayan,
  // sunucuya gönderilmeyen geçici bir senaryo hesabıdır. Hesap her zaman BUGÜNDEN itibaren sayılır.
  body.innerHTML = `
    <div style="background:var(--surface-1,#F5F6F8);border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:10.5px;color:var(--ink-soft);margin-bottom:3px;">Kalan borç</div><div style="font-weight:700;font-size:16px;color:var(--ink);">${TL(kalanBorc)}</div></div>
      <div style="width:1px;height:30px;background:var(--line-soft);"></div>
      <div><div style="font-size:10.5px;color:var(--ink-soft);margin-bottom:3px;">Sipariş</div><div style="font-weight:700;font-size:16px;color:var(--ink);">${TL(siparisTutari)}</div></div>
      <div style="width:1px;height:30px;background:var(--line-soft);"></div>
      <div style="text-align:right;"><div style="font-size:10.5px;color:var(--accent-deep,var(--accent));margin-bottom:3px;font-weight:600;">Toplam</div><div style="font-weight:700;font-size:17px;color:var(--accent-deep,var(--accent));">${TL(toplam)}</div></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;" id="ttPencereSecici">
      ${pencereler.map(p=>`
        <button type="button" class="tt-pencere-btn" data-pencere="${p.key}" style="flex:1;text-align:left;padding:10px 12px;border-radius:10px;border:${p.key===seciliPencere.key?'2px solid var(--accent)':'1px solid var(--line)'};background:${p.bg};cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span style="font-size:10px;font-weight:700;letter-spacing:.02em;color:${p.fgSoft};">${p.etiket}</span>
            ${p.rozet ? `<span style="font-size:9px;font-weight:700;background:var(--danger,#c0392b);color:#fff;padding:2px 6px;border-radius:8px;">${p.rozet}</span>` : ''}
          </div>
          <div style="font-size:14px;font-weight:700;color:${p.fg};margin-top:4px;">${p.ozet && p.ozet.aylikTahsilat>0 ? TL(p.ozet.aylikTahsilat) : '—'}</div>
          <div style="font-size:9.5px;color:${p.fgSoft};margin-top:1px;">aylık ort. tahsilat</div>
        </button>`).join('')}
    </div>
    <div id="ttSonucAlani"></div>
    <div style="margin-top:16px;">
      <label style="font-size:12px;color:var(--ink-soft);display:block;margin-bottom:7px;">Teslimde alınacak tahsilat</label>
      <div style="display:flex;align-items:stretch;border:1px solid var(--line);border-radius:8px;overflow:hidden;">
        <span style="display:flex;align-items:center;padding:0 4px 0 12px;font-size:15px;color:var(--ink-faint);">₺</span>
        <input id="ttAnlikTahsilat" type="number" placeholder="0" style="flex:1;border:none;box-shadow:none;padding:9px 8px;background:transparent;font-size:15px;font-weight:600;color:var(--ink);" />
        <button id="ttEkleBtn" aria-label="Ekle" style="width:38px;border:none;border-left:1px solid var(--line);background:var(--accent-soft);color:var(--accent-deep);display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:0;font-size:16px;cursor:pointer;">+</button>
      </div>
      <div id="ttNot" style="font-size:11px;color:var(--ink-faint);margin-top:8px;display:none;"></div>
      <button type="button" id="ttSifirlaBtn" class="btn small" style="margin-top:8px;display:none;"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Temel hesaba dön</button>
    </div>
  `;

  const sonucAlani = document.getElementById('ttSonucAlani');
  const notEl = document.getElementById('ttNot');
  const sifirlaBtn = document.getElementById('ttSifirlaBtn');
  let mevcutEklenenTutar = 0; // pencere değiştirildiğinde manuel eklenen tutarın korunması için

  // KULLANICI KARARI (referans: Aylık Trend Analizi'ndeki "SON 3 AY" kartı): Sonuç, o karttaki
  // AYNI görsel dille (koyu lacivert zemin, alt satırlar arası ince ayraç, en altta büyük rakam +
  // küçük etiket) gösterilir. Manuel tahsilat eklenmemişse sadece "TAHMİNİ DÖNÜŞ" gösterilir;
  // eklenmişse üstüne "İŞLEM SONRASI" satırları (Sipariş sonrası bakiye / Alınacak tahsilat /
  // Kalan bakiye) eklenir — kullanıcı isteği: bu üç kalem + kalan bakiyenin tahmini tahsil süresi.
  function tahminGoster(kalanTutar, eklenenTutar){
    if(gunlukHiz==null){
      sonucAlani.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">Bu müşteri için tahsilat geçmişi bulunamadığından tahmin hesaplanamıyor.</div>`;
      return;
    }
    const gun = Math.max(0, Math.round(kalanTutar / gunlukHiz));
    const tarih = new Date(); tarih.setDate(tarih.getDate() + gun);
    const islemSonrasiSatirlari = eklenenTutar>0 ? `
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.12);">
        <span style="font-size:12.5px;color:rgba(255,255,255,.65);">Sipariş sonrası bakiye</span>
        <span style="font-size:13.5px;font-weight:700;color:#fff;">${TL(toplam)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.12);">
        <span style="font-size:12.5px;color:rgba(255,255,255,.65);">Alınacak tahsilat</span>
        <span style="font-size:13.5px;font-weight:700;color:#fff;">${TL(eklenenTutar)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;margin-bottom:6px;">
        <span style="font-size:12.5px;color:rgba(255,255,255,.65);">Kalan bakiye</span>
        <span style="font-size:13.5px;font-weight:700;color:#fff;">${TL(kalanTutar)}</span>
      </div>` : '';
    sonucAlani.innerHTML = `
      <div style="background:#0F1C3F;border-radius:12px;padding:14px 16px;">
        ${islemSonrasiSatirlari}
        <div style="${eklenenTutar>0 ? 'border-top:1px dashed rgba(255,255,255,.18);padding-top:10px;' : ''}display:flex;align-items:baseline;justify-content:space-between;">
          <div>
            <span style="font-size:26px;font-weight:700;color:#fff;">${gun.toLocaleString('tr-TR')}g</span>
            <div style="font-size:9px;font-weight:700;letter-spacing:.03em;color:rgba(255,255,255,.5);">${eklenenTutar>0 ? 'KALAN BAKİYENİN TAHMİNİ DÖNÜŞÜ' : 'TAHMİNİ DÖNÜŞ'}</div>
          </div>
          <span style="font-size:11px;font-weight:600;background:rgba(255,255,255,.12);color:#fff;padding:4px 10px;border-radius:10px;">${fmtDate(tarih)}</span>
        </div>
      </div>`;
  }
  tahminGoster(toplam, 0);

  // Pencere seçim kartlarına tıklanınca: SADECE gunlukHiz (aylık ortalama tahsilat hızı) değişir —
  // kalan tutar/manuel eklenen tutar aynı kalır (kullanıcı kararı: pencere değişse de "Teslimde
  // alınacak tahsilat" mantığı bozulmasın, sadece hangi ortalamanın kullanılacağı değişsin).
  document.getElementById('ttPencereSecici').addEventListener('click', (e)=>{
    const btn = e.target.closest('.tt-pencere-btn');
    if(!btn) return;
    const p = pencereler.find(x=>x.key===btn.getAttribute('data-pencere'));
    if(!p) return;
    seciliPencere = p;
    gunlukHiz = (p.ozet && p.ozet.aylikTahsilat>0) ? (p.ozet.aylikTahsilat/30) : null;
    document.querySelectorAll('.tt-pencere-btn').forEach(b=>{
      b.style.border = b===btn ? '2px solid var(--accent)' : '1px solid var(--line)';
    });
    tahminGoster(Math.max(0, toplam - mevcutEklenenTutar), mevcutEklenenTutar);
  });

  document.getElementById('ttEkleBtn').addEventListener('click', ()=>{
    const eklenen = parseFloat(document.getElementById('ttAnlikTahsilat').value) || 0;
    if(eklenen<=0) return;
    mevcutEklenenTutar = eklenen;
    const kalan = Math.max(0, toplam - eklenen);
    tahminGoster(kalan, eklenen);
    sifirlaBtn.style.display = 'inline-flex';
  });
  sifirlaBtn.addEventListener('click', ()=>{
    mevcutEklenenTutar = 0;
    document.getElementById('ttAnlikTahsilat').value = '';
    tahminGoster(toplam, 0);
    sifirlaBtn.style.display = 'none';
  });
}
function tahsilatTahminiModalKapat(){
  document.getElementById('tahsilatTahminiModalOverlay').classList.remove('open');
}
document.getElementById('tahsilatTahminiModalClose').addEventListener('click', tahsilatTahminiModalKapat);
document.getElementById('tahsilatTahminiModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='tahsilatTahminiModalOverlay') tahsilatTahminiModalKapat();
});
document.getElementById('faturaModalTahsilatTahminiBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  tahsilatTahminiModalAc(mevcut.kod, mevcut.adi);
});

// analizModalAc — REVİZYON (kullanıcı talebiyle): eski tek-KPI kart yerine, sezonsallığı ve
// eski-bakiye çarpıklığını netleştirmek için 3/6/12 aylık pencereleri yan yana karşılaştıran
// kartlar render eder. Sıralama GÜNCELDEN GENELE: Son 3 Ay (en üstte, en dikkat çekici) →
// Son 6 Ay → 12 Ay Genel (en altta, referans). Her kart kendi renk şemasını taşır (3 Ay: koyu
// lacivert/uyarı; 6 Ay: kehribar/geçiş; 12 Ay: açık nötr/sakin referans) — onaylanan tasarıma
// bkz. "5-plus3-final" mockup'ı.
async function analizModalAc(musteriKod, musteriAdi){
  document.getElementById('analizModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('analizModalTitle').textContent = musteriAdi;
  const body = document.getElementById('analizModalBody');
  body.innerHTML = `<div class="empty-state">Yükleniyor…</div>`;
  document.getElementById('analizModalOverlay').classList.add('open');
  const kod = String(musteriKod||'').trim();
  let ozet3=null, ozet6=null, ozet12=null;
  try{
    [ozet3, ozet6, ozet12] = await Promise.all([
      computeMusteriAylikOzetPeriyot(kod, 3),
      computeMusteriAylikOzetPeriyot(kod, 6),
      computeMusteriAylikOzetPeriyot(kod, 12),
    ]);
  }catch(err){
    console.error('Analiz hesaplanırken hata:', err);
  }
  if(!ozet3 && !ozet6 && !ozet12){
    body.innerHTML = `<div class="empty-state">Bu müşteri için fatura/tahsilat arşiv verisi bulunamadı.</div>`;
    return;
  }

  const PENCERE_META = [
    {key:'3ay', ozet:ozet3, baslik:'Son 3 Ay', sema:'am-c3', canli:true},
    {key:'6ay', ozet:ozet6, baslik:'Son 6 Ay', sema:'am-c6', canli:false},
    {key:'12ay', ozet:ozet12, baslik:'12 Ay · Genel', sema:'am-c12', canli:false},
  ];
  const referansDonus = ozet12 && ozet12.geriDonusGun!=null ? ozet12.geriDonusGun : null;

  const kartHtml = PENCERE_META.map(p=>{
    const o = p.ozet;
    if(!o) return `<div class="am-col ${p.sema}"><div class="am-col-lbl">${p.baslik}</div><div class="empty-state" style="padding:16px 0;font-size:11.5px;">Bu dönemde veri yok</div></div>`;

    const toplamTahsilatPay = o.aylikTahsilat>0 ? o.aylikTahsilat : 1;
    const kategoriler = [
      {ad:'Nakit/Havale', tutar:Math.max(0,o.aylikNakitHavale), cls:'tc-nakit'},
      {ad:'Kredi Kartı',  tutar:Math.max(0,o.aylikKrediKarti),  cls:'tc-kk'},
      {ad:'Hakediş',      tutar:Math.max(0,o.aylikHakedis),     cls:'tc-hakedis'},
      {ad:'Çek/Senet',    tutar:Math.max(0,o.aylikCekSenet),    cls:'tc-ceksenet'},
      {ad:'İade/Depozito',tutar:Math.max(0,o.aylikIadeDepozito),cls:'tc-iade'},
    ].filter(k=>k.tutar>0);

    const barHtml = kategoriler.map(k=>`<span class="am-tur-seg ${k.cls}" style="width:${(k.tutar/toplamTahsilatPay*100).toFixed(2)}%;"></span>`).join('');
    const chipHtml = kategoriler.map(k=>`<span class="am-chip ${k.cls}"><span class="am-dot"></span>${k.ad} %${(k.tutar/toplamTahsilatPay*100).toFixed(0)}</span>`).join('');

    let trendChip = `<span class="am-trend-chip base">Referans</span>`;
    if(p.key!=='12ay' && o.geriDonusGun!=null && referansDonus!=null){
      const fark = Math.round(o.geriDonusGun - referansDonus);
      if(fark>0.5) trendChip = `<span class="am-trend-chip up">▲ ${fark}g</span>`;
      else if(fark<-0.5) trendChip = `<span class="am-trend-chip down">▼ ${Math.abs(fark)}g</span>`;
      else trendChip = `<span class="am-trend-chip base">— durağan</span>`;
    }
    const canliPin = p.canli ? `<span class="am-live-pin">GÜNCEL</span>` : '';
    const yaklasikNot = o.geriDonusYaklasik ? `<div class="am-approx-note">~ yaklaşık (bakiye verisi eksik, akış oranından tahmin)</div>` : '';

    return `
      <div class="am-col ${p.sema}">
        <div class="am-col-head">
          <div>
            <div class="am-col-lbl">${p.baslik}</div>
          </div>
          ${canliPin}
        </div>
        <div class="am-row"><span class="am-l">Fatura/Ay</span><span class="am-v">${TL(o.aylikFatura)}</span></div>
        <div class="am-row"><span class="am-l">Tahsilat/Ay</span><span class="am-v">${TL(o.aylikTahsilat)}</span></div>
        ${kategoriler.length ? `<div class="am-tur-bar">${barHtml}</div><div class="am-tur-chips">${chipHtml}</div>` : ''}
        <div class="am-donus-block">
          <div>
            <div class="am-donus-num">${o.geriDonusGun!=null ? Math.round(o.geriDonusGun)+'g' : '—'}</div>
            <div class="am-donus-lbl">Dönüş</div>
            ${yaklasikNot}
          </div>
          ${trendChip}
        </div>
      </div>`;
  }).join('');

  let insight = '';
  if(ozet3 && ozet12 && ozet3.geriDonusGun!=null && ozet12.geriDonusGun!=null){
    const fark = Math.round(ozet3.geriDonusGun - ozet12.geriDonusGun);
    if(fark>3){
      insight = `<div class="am-insight"><span>⚠</span><span>Son 3 ayın dönüş süresi (${Math.round(ozet3.geriDonusGun)}g), 12 aylık genelin (${Math.round(ozet12.geriDonusGun)}g) ${fark} gün üzerinde — bu son çeyrekte beliren yeni bir yavaşlama, kalıcı bir alışkanlık değil.</span></div>`;
    } else if(fark<-3){
      insight = `<div class="am-insight am-insight-good"><span>✓</span><span>Son 3 ayın dönüş süresi (${Math.round(ozet3.geriDonusGun)}g), 12 aylık genelin (${Math.round(ozet12.geriDonusGun)}g) ${Math.abs(fark)} gün altında — tahsilat temposu son dönemde hızlanmış.</span></div>`;
    }
  }

  body.innerHTML = `
    <div class="am-basis">Her pencere yalnızca kendi dönemine ait fatura/tahsilat kayıtlarını kullanır (12 aylık arşivden)</div>
    <div class="am-cols">${kartHtml}</div>
    ${insight}
  `;
}
function analizModalKapat(){
  document.getElementById('analizModalOverlay').classList.remove('open');
}
document.getElementById('analizModalClose').addEventListener('click', analizModalKapat);
document.getElementById('analizModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='analizModalOverlay') analizModalKapat();
});
document.getElementById('faturaModalAnalizBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  analizModalAc(mevcut.kod, mevcut.adi);
});
document.getElementById('faturaModalCekSenetBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  cekSenetModalAc(mevcut.kod, mevcut.adi);
});
document.getElementById('dikkatModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'dikkatModalOverlay') closeDikkatModal();
});

function renderDikkatPanel(report){
  const banner = document.getElementById('dikkatBanner');
  const temsilci = document.getElementById('dikkatTemsilciFilter').value;
  const riskli = report.musteriler
    .filter(isRiskliMusteri)
    .filter(m=> !temsilci || m.temsilci === temsilci)
    .slice()
    .sort((a,b)=> (b.avgVadeGun||0) - (a.avgVadeGun||0));

  const toplamRiskli = report.musteriler.filter(isRiskliMusteri).length;
  if(!toplamRiskli){
    banner.style.display = 'none';
    closeDikkatModal();
    return;
  }
  banner.style.display = 'flex';
  document.getElementById('dikkatBannerCount').textContent = toplamRiskli.toLocaleString('tr-TR') + ' ';
  document.getElementById('dikkatCount').textContent = riskli.length.toLocaleString('tr-TR') + ' müşteri';

  const tbody = document.getElementById('dikkatTbody');
  if(!riskli.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Bu temsilci için dikkat gerektiren müşteri bulunamadı.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = riskli.map(m=>`
    <tr data-musteri="${escapeHtml(m.musteri)}">
      <td><div class="musteri-name">${escapeHtml(m.musteriAdi)}</div><div class="musteri-code">${escapeHtml(m.musteri)}</div></td>
      <td><span class="temsilci-tag">${escapeHtml(m.temsilci)}</span></td>
      <td class="num"><span class="num-strong">${TL(m.kalanBorc)}</span></td>
      <td class="num">${vadeBadge(m.avgVadeGun)}</td>
      <td class="num"><span class="num-strong">${TL(m.toplamRisk)}</span></td>
    </tr>`).join('');

  document.getElementById('dikkatTbody').querySelectorAll('tr').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const musteri = tr.getAttribute('data-musteri');
      closeDikkatModal();
      document.getElementById('searchInput').value = musteri;
      updateSearchClearBtn();
      renderMusteriTable(state.report);
      document.getElementById('musteriPanel').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

document.getElementById('dikkatTemsilciFilter').addEventListener('change', ()=>renderDikkatPanel(state.report));


function vadeBadge(gun){
  if(gun==null) return '';
  if(gun>60) return `<span class="badge over">${gun} gün</span>`;
  if(gun>0) return `<span class="badge soon">${gun} gün</span>`;
  return `<span class="badge ok">${gun<0?gun:0} gün</span>`;
}

// Kart tasarımındaki "95 gün gecikme" satırı için — Şüpheli Alacak'taki htk-gecikme ile aynı üslup.

// ORT VADE rozeti — sabit kırmızı yerine, gün sayısına göre kademeli renk (yeşil→sarı→turuncu→kırmızı).
function ortVadeRenk(gun){
  const g = Math.round(Number(gun)||0);
  if(g<=7) return {renk:'var(--success)', soft:'var(--success-soft)'};
  if(g<=20) return {renk:'var(--warn)', soft:'var(--warn-soft)'};
  if(g<=25) return {renk:'#C2571B', soft:'#F5DDD0'};
  return {renk:'var(--danger)', soft:'var(--danger-soft)'};
}

// "Dönüş" rozeti (Analiz popup'ı — fatura tutarının geri dönüş süresi) — 5 kademeli renk skalası,
// ORT VADE'den farklı olarak en hızlı (0-3 gün) mavi ile başlar.
function donusRenk(gun){
  const g = Math.round(Number(gun)||0);
  if(g<=3) return {renk:'#185FA5', soft:'#E6F1FB'};
  if(g<=7) return {renk:'var(--success)', soft:'var(--success-soft)'};
  if(g<=14) return {renk:'var(--warn)', soft:'var(--warn-soft)'};
  if(g<=21) return {renk:'#C2571B', soft:'#F5DDD0'};
  return {renk:'var(--danger)', soft:'var(--danger-soft)'};
}

function avatarBaslangic(ad){
  const parcalar = String(ad||'').trim().split(/\s+/).filter(Boolean);
  const h1 = parcalar[0] ? parcalar[0][0] : '';
  const h2 = parcalar[1] ? parcalar[1][0] : '';
  return (h1+h2).toLocaleUpperCase('tr-TR');
}

function renderMusteriDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('musteriDahaFazlaWrap');
  const info = document.getElementById('musteriDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

function renderMusteriTable(report, resetSayfa=true){
  if(resetSayfa) state.musteriGosterilen = MUSTERI_SAYFA_BOYUTU;
  const rows = getFilteredSorted(report);
  document.getElementById('musteriCount').textContent = rows.length.toLocaleString('tr-TR') + ' müşteri';
  const list = document.getElementById('musteriTbody');
  if(!rows.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Filtreyle eşleşen müşteri bulunamadı.</div>`;
    renderMusteriDahaFazlaBtn(0, 0);
    return;
  }
  const hakedisKodlari = bayiHakedisliMusteriKodlari();
  const stokKodlari = ticariStokluMusteriKodlari();
  const gosterilecekSayi = Math.min(state.musteriGosterilen, rows.length);
  const gosterilecekRows = rows.slice(0, gosterilecekSayi);
  list.innerHTML = gosterilecekRows.map(m=>{
    state.faturaModalYedekMap.set(m.musteri, m);
    const risk = hukukiRiskSeviyesi(m.avgVadeGun);
    const vadeRenk = ortVadeRenk(m.avgVadeGun);
    return `<div class="htk-card" data-musteri="${escapeHtml(m.musteri)}" style="--htk-risk:${risk.renk};--htk-risk-bg:${risk.bg};">
      <div class="htk-head">
        <div style="min-width:0;">
          <div class="htk-musteri-row">
            <span class="htk-musteri">${escapeHtml(m.musteriAdi)}</span>
          </div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(m.temsilci)}</div>
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
          <button type="button" class="btn small senet-yazdir-btn" data-musteri="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}" data-tutar="${m.siparisTutari||0}" data-emanet="${m.emanetSiparis||0}" data-kalan-borc="${m.kalanBorc||0}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Senet</button>
          <button type="button" class="nokta-detay-btn primary fatura-detay-btn" data-musteri-kod="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}">Detay ↗</button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderMusteriDahaFazlaBtn(gosterilecekSayi, rows.length);
}