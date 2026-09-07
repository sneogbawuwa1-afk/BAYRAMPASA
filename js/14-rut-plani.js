/* ========================================================================== 
   TEMSİLCİ / RUT
   - Rutun günü ve frekansı Rut Planı (Kitap6.xlsx) dosyasından gelir.
   - Tabela adı Genel Bakış'ın güncel cari kaydından; müşteri adı / satış temsilcisi /
     satış şefi / durum ise en güncel Müşteri Master'dan okunur. Geçmiş ilişkiler kopyalanmaz.
   - Cari bakiye ve yaşlandırma, uygulamanın güncel işlenmiş raporundan alınır.
   ========================================================================== */

const RUT_GUN_KOLONLARI = [null,'Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const RUT_ZORUNLU_KOLONLAR = ['Maya Müşteri Kodu','Müşteri Durumu','Frekans','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const RUT_BUCKET_KEYS = ['g0_6','g7_13','g14_20','g21_27','g28_34','g35p'];

function rutMetin(v){ return String(v==null ? '' : v).trim(); }
function rutFrekansSayiyaCevir(v){
  const n = Number(rutMetin(v).replace(',','.'));
  return Number.isFinite(n) ? n : 0;
}
function rutDurumNormalize(v){
  const s = rutMetin(v).toLocaleUpperCase('tr-TR');
  if(!s) return 'belirsiz';
  if(s.includes('PASİF') || s.includes('PASIF') || s.includes('İPTAL') || s.includes('IPTAL')) return 'pasif';
  if(s.includes('AKTİF') || s.includes('AKTIF') || s === 'A' || s === 'ACTIVE') return 'aktif';
  return 'belirsiz';
}
function rutDurumEtiketi(d){ return d==='aktif' ? 'Aktif' : d==='pasif' ? 'Pasif' : d==='tumu' ? 'Tümü' : 'Belirsiz'; }
function rutFrekansEtiketi(f){
  if(f===2) return 'Haftada 2 gün';
  if(f===1) return 'Haftada 1 gün';
  if(f===0.5) return '2 haftada 1 gün';
  if(f===0.25) return '4 haftada 1 gün';
  return rutMetin(f) || '—';
}
function rutKodHash(kod){
  let h = 2166136261;
  const s = rutMetin(kod).toLocaleUpperCase('tr-TR');
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h,16777619);
  }
  return h>>>0;
}
function rutPazartesiHaftaIndex(tarih){
  const utc = Date.UTC(tarih.getFullYear(),tarih.getMonth(),tarih.getDate());
  const gun = (tarih.getDay()+6)%7; // Pazartesi=0
  return Math.floor((utc - gun*86400000) / 604800000);
}
function rutGunIsaretliMi(v){
  if(v===true) return true;
  const s = rutMetin(v);
  return s!=='' && s!=='0' && s.toLocaleUpperCase('tr-TR')!=='HAYIR';
}
function rutSatiriTarihtePlanliMi(satir,tarih){
  const gunKolonu = RUT_GUN_KOLONLARI[tarih.getDay()];
  if(!gunKolonu || !rutGunIsaretliMi(satir[gunKolonu])) return false;
  const f = rutFrekansSayiyaCevir(satir.Frekans);
  if(f>=1) return true;
  const periyot = f===0.5 ? 2 : f===0.25 ? 4 : 1;
  if(periyot===1) return true;
  // Dosyada iki/dört haftalık çevrimin hangi haftada başlayacağı bulunmuyor. Aynı müşterinin
  // hep aynı fazda kalması ve yükün haftalara dengeli yayılması için müşteri koduna bağlı sabit faz.
  return ((rutPazartesiHaftaIndex(tarih) % periyot)+periyot)%periyot === rutKodHash(satir['Maya Müşteri Kodu'])%periyot;
}
function rutTarihOku(v){
  if(v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(),v.getMonth(),v.getDate(),12);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rutMetin(v));
  return m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12) : null;
}
function rutTarihKey(tarih){
  return `${tarih.getFullYear()}-${String(tarih.getMonth()+1).padStart(2,'0')}-${String(tarih.getDate()).padStart(2,'0')}`;
}
function rutTarihBasligi(tarih){
  return new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(tarih);
}
function rutDosyaTarihi(tarih){
  if(!tarih) return '';
  const d = new Date(tarih);
  return isNaN(d) ? '' : new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}

function rutBasliklariDogrula(headers){
  const set = new Set((headers||[]).map(rutMetin));
  return RUT_ZORUNLU_KOLONLAR.filter(h=>!set.has(h));
}
function rutPlanSatirlariniNormalizeEt(rows){
  return (rows||[]).map(r=>Object.assign({},r,{
    'Maya Müşteri Kodu':rutMetin(r['Maya Müşteri Kodu']),
    'Müşteri Adı':rutMetin(r['Müşteri Adı']),
    'Müşteri Durumu':rutMetin(r['Müşteri Durumu']),
    Frekans:rutFrekansSayiyaCevir(r.Frekans),
  })).filter(r=>r['Maya Müşteri Kodu']);
}
function rutKaynakMetniniGuncelle(){
  const el = document.getElementById('rutKaynakBilgi');
  const sub = document.getElementById('gvyAnaRutSub');
  const k = state.rutPlaniKaynak;
  const metin = k
    ? `${k.adi || 'Rut Planı'} · ${k.kaynak==='proje' ? 'proje dosyası' : 'son yüklenen dosya'}${k.tarih ? ' · '+rutDosyaTarihi(k.tarih) : ''}`
    : 'Rut planı bulunamadı';
  if(el) el.textContent = metin;
  if(sub) sub.textContent = metin;
}

async function rutPlaniYenile(zorla){
  if(!zorla && state.files.rutPlani && Array.isArray(state.files.rutPlani.data)){
    rutKaynakMetniniGuncelle();
    return state.files.rutPlani.data;
  }
  let kayit = null;
  try{ kayit = await grupATekilDosyaBuluttanOku('rutPlani'); }catch(err){ console.warn('Rut planı buluttan okunamadı:',err); }
  if(kayit && Array.isArray(kayit.data) && kayit.data.length){
    const eksik = rutBasliklariDogrula(kayit.headers);
    if(!eksik.length){
      state.files.rutPlani = {name:kayit.adi||'Rut Planı.xlsx',headers:kayit.headers,data:rutPlanSatirlariniNormalizeEt(kayit.data)};
      state.rutPlaniKaynak = {adi:kayit.adi||'Rut Planı.xlsx',tarih:kayit.tarih||null,kaynak:'cloud'};
      rutKaynakMetniniGuncelle();
      if(typeof renderRutView==='function' && document.getElementById('rutView')?.style.display!=='none') renderRutView();
      return state.files.rutPlani.data;
    }
  }
  try{
    const res = await fetch('./Kitap6.xlsx',{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const wb = XLSX.read(await res.arrayBuffer(),{type:'array',cellDates:true});
    const secilen = ilkUygunSayfayiSec(wb);
    const eksik = rutBasliklariDogrula(secilen.headers);
    if(eksik.length) throw new Error('Eksik kolonlar: '+eksik.join(', '));
    state.files.rutPlani = {name:'Kitap6.xlsx',headers:secilen.headers,data:rutPlanSatirlariniNormalizeEt(secilen.data)};
    state.rutPlaniKaynak = {adi:'Kitap6.xlsx',tarih:null,kaynak:'proje'};
    rutKaynakMetniniGuncelle();
    if(typeof renderRutView==='function' && document.getElementById('rutView')?.style.display!=='none') renderRutView();
    return state.files.rutPlani.data;
  }catch(err){
    console.error('Projedeki Kitap6.xlsx okunamadı:',err);
    state.files.rutPlani = null;
    state.rutPlaniKaynak = null;
    rutKaynakMetniniGuncelle();
    return [];
  }
}

async function rutDosyasiYukle(file){
  const wb = XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const secilen = ilkUygunSayfayiSec(wb);
  const eksik = rutBasliklariDogrula(secilen.headers);
  if(eksik.length) throw new Error('Rut dosyasında eksik kolonlar: '+eksik.join(', '));
  const data = rutPlanSatirlariniNormalizeEt(secilen.data);
  if(!data.length) throw new Error('Rut dosyasında kullanılabilir müşteri satırı bulunamadı.');
  const kayitSonucu = await grupATekilDosyaKaydet('rutPlani',data,secilen.headers,file.name);
  if(typeof cloudEnabled==='function' && cloudEnabled() && (!kayitSonucu || !kayitSonucu.ok)){
    throw new Error('Rut planı buluta kaydedilemedi: '+((kayitSonucu&&kayitSonucu.reason)||'Bilinmeyen hata'));
  }
  state.files.rutPlani = {name:file.name,headers:secilen.headers,data};
  state.rutPlaniKaynak = {adi:file.name,tarih:(kayitSonucu&&kayitSonucu.tarih)||new Date().toISOString(),kaynak:'cloud'};
  rutKaynakMetniniGuncelle();
  renderRutView();
  return data.length;
}

function rutBosBuckets(){ return {g0_6:0,g7_13:0,g14_20:0,g21_27:0,g28_34:0,g35p:0}; }
function rutMusteriBuckets(m){
  const buckets = rutBosBuckets();
  (m && m.invoices || []).forEach(inv=>{
    const gun = Number(inv.gunFatura);
    if(!Number.isFinite(gun) || gun<0) return;
    const key = gun<=6?'g0_6':gun<=13?'g7_13':gun<=20?'g14_20':gun<=27?'g21_27':gun<=34?'g28_34':'g35p';
    buckets[key] += Number(inv.kalanBorc)||0;
  });
  return buckets;
}
function rutMusteriBilgisi(kod,rutSatiri,raporMusterisi){
  const d = state.musteriMasterDetay && state.musteriMasterDetay.get(kod) || {};
  // Tabela Adı, Genel Bakış kartındaki güncel cari adıyla aynı kaynaktan gelir.
  // Genel Bakış kaydı yoksa Master'daki Tabela Adı yedeklenir. Müşteri/yasal ad
  // ayrı tutulduğu için iki bilgi Rut tablosunda yan yana kaybolmadan gösterilebilir.
  const genelBakisAdi = raporMusterisi && raporMusterisi.musteriAdi;
  const genelBakisUnvani = raporMusterisi && raporMusterisi.musteriUnvan;
  return {
    adi:rutMetin(d.musteriAdi || genelBakisUnvani || rutSatiri['Müşteri Adı'] || genelBakisAdi || kod),
    tabelaAdi:rutMetin(genelBakisAdi || d.tabelaAdi || ''),
  };
}
function rutSatiriniBirleştir(rutSatiri,raporMap){
  const kod = rutMetin(rutSatiri['Maya Müşteri Kodu']);
  const rapor = raporMap.get(kod) || null;
  const iliski = state.musteriMasterIliski && state.musteriMasterIliski.get(kod) || null;
  const temsilci = rutMetin((iliski&&iliski.satisTemsilcisi) || (state.musteriMasterMap&&state.musteriMasterMap.get(kod)) || '') || 'Tanımsız';
  const ssm = rutMetin((iliski&&iliski.satisSefi) || (typeof getSahaMuduru==='function' ? getSahaMuduru(temsilci,kod) : '')) || 'Tanımsız';
  const masterDurumVar = !!(state.musteriMasterDurum && state.musteriMasterDurum.has(kod));
  const durumHam = masterDurumVar ? state.musteriMasterDurum.get(kod) : rutSatiri['Müşteri Durumu'];
  const durum = rutDurumNormalize(durumHam);
  const buckets = rutMusteriBuckets(rapor);
  const yaslanan = (buckets.g28_34||0)+(buckets.g35p||0);
  const bucketToplam = RUT_BUCKET_KEYS.reduce((s,k)=>s+(buckets[k]||0),0);
  const raporBakiye = rapor && Number(rapor.kalanBorc);
  const toplam = Number.isFinite(raporBakiye) ? raporBakiye : bucketToplam;
  const musteriBilgisi = rutMusteriBilgisi(kod,rutSatiri,rapor);
  return {
    kod,adi:musteriBilgisi.adi,tabelaAdi:musteriBilgisi.tabelaAdi,durum,durumHam:rutMetin(durumHam),temsilci,ssm,
    frekans:rutFrekansSayiyaCevir(rutSatiri.Frekans),buckets,yaslanan,toplam,
    avgVadeGun:rapor && rapor.avgVadeGun!=null ? Number(rapor.avgVadeGun) : null,
    masterEksik:!iliski || temsilci==='Tanımsız' || ssm==='Tanımsız',
  };
}
function rutGunSatirlari(tarih){
  const plan = state.files.rutPlani && state.files.rutPlani.data || [];
  const raporMap = new Map();
  const tumMusteriler = state.report && Array.isArray(state.report.musteriler) ? state.report.musteriler : [];
  tumMusteriler.forEach(m=>raporMap.set(rutMetin(m.musteri),m));
  return plan.filter(r=>rutSatiriTarihtePlanliMi(r,tarih)).map(r=>rutSatiriniBirleştir(r,raporMap));
}

function rutSelectDoldur(id,degerler,bosEtiket,secili){
  const el = document.getElementById(id); if(!el) return;
  const unique = Array.from(new Set(degerler.filter(Boolean))).sort((a,b)=>a.localeCompare(b,'tr'));
  el.innerHTML = `<option value="">${escapeHtml(bosEtiket)}</option>`+unique.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  el.value = unique.includes(secili) ? secili : '';
}
function rutFiltrele(rows,temsilciyiYokSay){
  const f = state.rutFiltre || {durum:'aktif',temsilci:'',ssm:'',arama:''};
  const q = rutMetin(f.arama).toLocaleLowerCase('tr-TR');
  return rows.filter(r=>{
    if(f.durum!=='tumu' && r.durum!==f.durum) return false;
    if(!temsilciyiYokSay && f.temsilci && r.temsilci!==f.temsilci) return false;
    if(f.ssm && r.ssm!==f.ssm) return false;
    if(q && ![r.kod,r.adi,r.tabelaAdi,r.temsilci,r.ssm].some(v=>rutMetin(v).toLocaleLowerCase('tr-TR').includes(q))) return false;
    return true;
  });
}
// Üst KPI kartları organizasyon seçimini izler; Aktif/Pasif sekmesi ise yalnızca alttaki
// listeyi daraltır. Böylece bir temsilci veya SSM seçildiğinde o organizasyonun toplam,
// aktif ve pasif adetleri aynı anda karşılaştırılabilir kalır.
function rutKpiSatirlariniFiltrele(rows){
  const f = state.rutFiltre || {temsilci:'',ssm:'',arama:''};
  const q = rutMetin(f.arama).toLocaleLowerCase('tr-TR');
  return rows.filter(r=>{
    if(f.temsilci && r.temsilci!==f.temsilci) return false;
    if(f.ssm && r.ssm!==f.ssm) return false;
    if(q && ![r.kod,r.adi,r.tabelaAdi,r.temsilci,r.ssm].some(v=>rutMetin(v).toLocaleLowerCase('tr-TR').includes(q))) return false;
    return true;
  });
}
function rutKisaPara(n){
  n = Number(n)||0; const a=Math.abs(n);
  if(a>=1000000) return (n/1000000).toFixed(1).replace('.',',')+' Mn ₺';
  if(a>=1000) return Math.round(n/1000).toLocaleString('tr-TR')+' B ₺';
  return Math.round(n).toLocaleString('tr-TR')+' ₺';
}
function rutParaHucre(n,ekSinif){
  n=Number(n)||0;
  return `<td class="num ${ekSinif||''}">${Math.abs(n)<.5?'—':TL(n)}</td>`;
}
function rutTemsilciKartlariniCiz(rows){
  const el=document.getElementById('rutTemsilciKartlar'); if(!el) return;
  const temel = rutFiltrele(rows,true);
  const map=new Map();
  temel.forEach(r=>{
    if(!map.has(r.temsilci)) map.set(r.temsilci,{adet:0,bakiye:0});
    const x=map.get(r.temsilci);x.adet++;x.bakiye+=r.toplam;
  });
  el.innerHTML=Array.from(map.entries()).sort((a,b)=>b[1].adet-a[1].adet||a[0].localeCompare(b[0],'tr')).map(([ad,x])=>`
    <button type="button" class="rut-temsilci-card ${state.rutFiltre.temsilci===ad?'active':''}" data-temsilci="${escapeHtml(ad)}">
      <strong>${escapeHtml(ad)}</strong><span><b>${x.adet}</b> nokta · ${escapeHtml(rutKisaPara(x.bakiye))}</span>
    </button>`).join('');
  el.querySelectorAll('.rut-temsilci-card').forEach(btn=>btn.addEventListener('click',()=>{
    state.rutFiltre.temsilci = state.rutFiltre.temsilci===btn.dataset.temsilci ? '' : btn.dataset.temsilci;
    const select=document.getElementById('rutTemsilciFilter'); if(select) select.value=state.rutFiltre.temsilci;
    renderRutView();
  }));
}
function rutTabloyuCiz(rows){
  const tbody=document.getElementById('rutTbody'); if(!tbody) return;
  const table=document.getElementById('rutTable');
  const empty=document.getElementById('rutBosDurum');
  tbody.innerHTML=rows.map(r=>{
    const tabela = rutMetin(r.tabelaAdi);
    const tabelaFarkli = tabela && normalizeAdSoyad(tabela)!==normalizeAdSoyad(r.adi);
    return `<tr data-durum="${r.durum}">
    <td class="rut-customer">
      <div class="rut-customer-title">
        <strong title="${escapeHtml(tabela||r.adi)}">${escapeHtml(tabela||r.adi)}</strong>
      </div>
      ${tabelaFarkli?`<span class="rut-legal-name" title="${escapeHtml(r.adi)}">${escapeHtml(r.adi)}</span>`:''}<span class="rut-cari-meta">${escapeHtml(r.kod)}${r.avgVadeGun!=null?' · Ort. vade '+Math.round(r.avgVadeGun)+' gün':''}</span>
    </td>
    <td class="rut-action-cell"><button type="button" class="rut-senet-btn senet-yazdir-btn" data-senet-modu="rut" data-musteri="${escapeHtml(r.kod)}" data-musteri-adi="${escapeHtml(tabela||r.adi)}" data-yaslandirma="${Number(r.yaslanan)||0}" data-kalan-borc="${Number(r.toplam)||0}" title="Yaşlandırma bakiyesiyle senet oluştur" aria-label="${escapeHtml(tabela||r.adi)} için senet oluştur"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Senet</button></td>
    <td><span class="rut-status ${r.durum}">${rutDurumEtiketi(r.durum)}</span></td>
    <td><span class="rut-person ${r.temsilci==='Tanımsız'?'missing':''}"><i class="fa-regular fa-user" aria-hidden="true"></i>${escapeHtml(r.temsilci)}</span></td>
    <td><span class="rut-freq">${escapeHtml(rutFrekansEtiketi(r.frekans))}</span></td>
    ${rutParaHucre(r.buckets.g0_6)}${rutParaHucre(r.buckets.g7_13)}${rutParaHucre(r.buckets.g14_20)}${rutParaHucre(r.buckets.g21_27)}
    ${rutParaHucre(r.buckets.g28_34,r.buckets.g28_34?'rut-risk-cell':'')}${rutParaHucre(r.buckets.g35p,r.buckets.g35p?'rut-risk-cell':'')}
    ${rutParaHucre(r.yaslanan,r.yaslanan?'rut-aging-cell':'')}${rutParaHucre(r.toplam)}
  </tr>`;}).join('');
  // Rut tablosu yeniden çizildiği için düğmeleri her render sonrasında doğrudan bağlarız.
  // Böylece başka bir tablo dinleyicisi olayı durdursa bile senet modalı güvenilir biçimde açılır.
  tbody.querySelectorAll('.rut-senet-btn').forEach(btn=>btn.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    try{
      if(typeof senetModalAc!=='function') throw new Error('Senet modülü yüklenmedi.');
      senetModalAc(btn.dataset.musteri,btn.dataset.musteriAdi,0,0,Number(btn.dataset.kalanBorc),{mod:'rut',yaslandirmaTutari:Number(btn.dataset.yaslandirma)});
    }catch(err){
      console.error('Rut senet penceresi açılamadı:',err);
      alert('Senet penceresi açılamadı: '+err.message+'\n\nSayfayı bir kez yenileyip tekrar deneyin.');
    }
  }));
  if(table) table.hidden=!rows.length;
  if(empty) empty.hidden=!!rows.length;
}

function renderRutView(){
  const tarihInput=document.getElementById('rutTarihInput');
  if(!tarihInput) return;
  if(!tarihInput.value) tarihInput.value=rutTarihKey(typeof turkiyeBugun==='function'?turkiyeBugun():new Date());
  const tarih=rutTarihOku(tarihInput.value)||new Date();
  document.querySelectorAll('[data-rut-weekday]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.rutWeekday)===tarih.getDay()));
  const baslik=document.getElementById('rutGunBaslik'); if(baslik) baslik.textContent=rutTarihBasligi(tarih);
  const alt=document.getElementById('rutGunAlt'); if(alt) alt.textContent=`${rutTarihBasligi(tarih)} için planlanan ziyaretler; cari ve organizasyon bilgileri güncel verilerden alınır.`;
  rutKaynakMetniniGuncelle();
  const rows=rutGunSatirlari(tarih);
  rutSelectDoldur('rutTemsilciFilter',rows.map(r=>r.temsilci),'Tüm Temsilciler',state.rutFiltre.temsilci);
  rutSelectDoldur('rutSsmFilter',rows.map(r=>r.ssm),'Tüm Satış Şefleri',state.rutFiltre.ssm);
  state.rutFiltre.temsilci=document.getElementById('rutTemsilciFilter')?.value||'';
  state.rutFiltre.ssm=document.getElementById('rutSsmFilter')?.value||'';
  const kpiRows=rutKpiSatirlariniFiltrele(rows);
  const aktif=kpiRows.filter(r=>r.durum==='aktif').length,pasif=kpiRows.filter(r=>r.durum==='pasif').length;
  const toplamBorc=kpiRows.reduce((s,r)=>s+r.toplam,0),yaslanan=kpiRows.reduce((s,r)=>s+r.yaslanan,0),eksik=kpiRows.filter(r=>r.masterEksik).length;
  const kpis={rutKpiToplam:kpiRows.length,rutKpiAktif:aktif,rutKpiPasif:pasif,rutKpiBorc:rutKisaPara(toplamBorc),rutKpiYaslanan:rutKisaPara(yaslanan),rutKpiEksikMaster:eksik};
  Object.entries(kpis).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=v;});
  document.querySelectorAll('.rut-durum-btn').forEach(b=>b.classList.toggle('active',b.dataset.durum===state.rutFiltre.durum));
  rutTemsilciKartlariniCiz(rows);
  const gosterilen=rutFiltrele(rows,false).sort((a,b)=>a.temsilci.localeCompare(b.temsilci,'tr')||b.yaslanan-a.yaslanan||(a.tabelaAdi||a.adi).localeCompare((b.tabelaAdi||b.adi),'tr'));
  state.rutSonGosterilenSatirlar=gosterilen;
  state.rutSonGosterilenTarih=rutTarihKey(tarih);
  const count=document.getElementById('rutNoktaCount');if(count)count.textContent=`${gosterilen.length.toLocaleString('tr-TR')} / ${rows.length.toLocaleString('tr-TR')} nokta`;
  const excel=document.getElementById('rutExcelBtn');if(excel)excel.disabled=!gosterilen.length;
  rutTabloyuCiz(gosterilen);
}

function rutExcelStilUygula(ws,baslikSatiri,sonSatir,sonKolon,sayisalBaslangic,durumKolonu){
  const navy='13233F',gold='C8A649',white='FFFFFF',line='DDE3EC';
  for(let c=0;c<=sonKolon;c++){
    const cell=ws[XLSX.utils.encode_cell({r:baslikSatiri,c})];
    if(cell) cell.s={font:{bold:true,color:{rgb:white}},fill:{fgColor:{rgb:navy}},alignment:{horizontal:c>=sayisalBaslangic?'right':'left',vertical:'center'},border:{bottom:{style:'medium',color:{rgb:gold}}}};
  }
  for(let r=baslikSatiri+1;r<=sonSatir;r++){
    for(let c=0;c<=sonKolon;c++){
      const cell=ws[XLSX.utils.encode_cell({r,c})]; if(!cell) continue;
      cell.s=cell.s||{};cell.s.border={bottom:{style:'thin',color:{rgb:line}}};
      if(c>=sayisalBaslangic){cell.z='#,##0 "₺"';cell.s.alignment={horizontal:'right'};}
      if(c===durumKolonu){
        const pasif=String(cell.v)==='Pasif';cell.s.fill={fgColor:{rgb:pasif?'E9EDF2':'DEEBE2'}};cell.s.font={bold:true,color:{rgb:pasif?'657085':'3C7A56'}};
      }
    }
  }
}
function rutExcelAktar(){
  const rows=state.rutSonGosterilenSatirlar||[];
  if(!rows.length){ if(typeof toastGoster==='function') toastGoster('warn','Aktarılacak satır yok','Filtreleri değiştirip yeniden deneyin.'); return; }
  const tarih=state.rutSonGosterilenTarih||rutTarihKey(new Date());
  const kaynak=(state.rutPlaniKaynak&&state.rutPlaniKaynak.adi)||'Rut Planı';
  const headers=['Müşteri Kodu','Tabela Adı','Müşteri Adı','Durum','Satış Temsilcisi','Satış Şefi (SSM)','Frekans','0-6 Gün','7-13 Gün','14-20 Gün','21-27 Gün','28-34 Gün','+35 Gün','Yaşlandırma','Toplam'];
  const aoa=[['TEMSİLCİ / RUT — GÜNLÜK ZİYARET PLANI'],['Plan Tarihi',tarih],['Rut Kaynağı',kaynak],['Durum Filtresi',rutDurumEtiketi(state.rutFiltre.durum)],[],headers];
  rows.forEach(r=>aoa.push([r.kod,r.tabelaAdi||'',r.adi,rutDurumEtiketi(r.durum),r.temsilci,r.ssm,rutFrekansEtiketi(r.frekans),r.buckets.g0_6,r.buckets.g7_13,r.buckets.g14_20,r.buckets.g21_27,r.buckets.g28_34,r.buckets.g35p,r.yaslanan,r.toplam]));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges']=[XLSX.utils.decode_range('A1:O1')];
  ws['!cols']=[{wch:16},{wch:32},{wch:34},{wch:11},{wch:25},{wch:25},{wch:19},...Array(8).fill({wch:15})];
  ws['!autofilter']={ref:`A6:O${aoa.length}`};
  ws['!rows']=[{hpt:28},null,null,null,{hpt:7},{hpt:24}];
  if(ws.A1) ws.A1.s={font:{bold:true,color:{rgb:'FFFFFF'},sz:15},fill:{fgColor:{rgb:'13233F'}},alignment:{horizontal:'left',vertical:'center'}};
  rutExcelStilUygula(ws,5,aoa.length-1,14,7,3);
  const ozetMap=new Map();
  rows.forEach(r=>{const k=r.temsilci+'\u0000'+r.ssm;if(!ozetMap.has(k))ozetMap.set(k,{temsilci:r.temsilci,ssm:r.ssm,aktif:0,pasif:0,toplam:0,bakiye:0,yaslanan:0});const x=ozetMap.get(k);x[r.durum==='pasif'?'pasif':'aktif']++;x.toplam++;x.bakiye+=r.toplam;x.yaslanan+=r.yaslanan;});
  const ozet=[['Satış Temsilcisi','Satış Şefi (SSM)','Aktif Nokta','Pasif Nokta','Toplam Nokta','Toplam Bakiye','Yaşlandırma']];
  Array.from(ozetMap.values()).sort((a,b)=>b.toplam-a.toplam).forEach(x=>ozet.push([x.temsilci,x.ssm,x.aktif,x.pasif,x.toplam,x.bakiye,x.yaslanan]));
  const ws2=XLSX.utils.aoa_to_sheet(ozet);ws2['!cols']=[{wch:27},{wch:27},{wch:14},{wch:14},{wch:14},{wch:18},{wch:18}];rutExcelStilUygula(ws2,0,ozet.length-1,6,5,-1);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Günlük Rut');XLSX.utils.book_append_sheet(wb,ws2,'Temsilci Özeti');
  XLSX.writeFile(wb,`Rut_Plani_${tarih}.xlsx`,{compression:true});
}

function rutArayuzunuBagla(){
  const tarih=document.getElementById('rutTarihInput'); if(!tarih) return;
  tarih.value=rutTarihKey(typeof turkiyeBugun==='function'?turkiyeBugun():new Date());
  tarih.addEventListener('change',renderRutView);
  const gunDegistir=fark=>{const d=rutTarihOku(tarih.value)||new Date();d.setDate(d.getDate()+fark);tarih.value=rutTarihKey(d);renderRutView();};
  document.getElementById('rutOncekiGunBtn')?.addEventListener('click',()=>gunDegistir(-1));
  document.getElementById('rutSonrakiGunBtn')?.addEventListener('click',()=>gunDegistir(1));
  document.getElementById('rutBugunBtn')?.addEventListener('click',()=>{tarih.value=rutTarihKey(typeof turkiyeBugun==='function'?turkiyeBugun():new Date());renderRutView();});
  document.querySelectorAll('[data-rut-weekday]').forEach(btn=>btn.addEventListener('click',()=>{
    const hedef=Number(btn.dataset.rutWeekday),d=rutTarihOku(tarih.value)||new Date();
    const mevcut=d.getDay()||7;
    d.setDate(d.getDate()+(hedef-mevcut));
    tarih.value=rutTarihKey(d);
    renderRutView();
  }));
  document.getElementById('rutExcelBtn')?.addEventListener('click',rutExcelAktar);
  document.querySelectorAll('.rut-durum-btn').forEach(btn=>btn.addEventListener('click',()=>{state.rutFiltre.durum=btn.dataset.durum;renderRutView();}));
  document.getElementById('rutTemsilciFilter')?.addEventListener('change',e=>{state.rutFiltre.temsilci=e.target.value;renderRutView();});
  document.getElementById('rutSsmFilter')?.addEventListener('change',e=>{state.rutFiltre.ssm=e.target.value;renderRutView();});
  document.getElementById('rutAramaInput')?.addEventListener('input',e=>{state.rutFiltre.arama=e.target.value;renderRutView();});
  document.getElementById('rutAramaTemizle')?.addEventListener('click',()=>{const i=document.getElementById('rutAramaInput');if(i)i.value='';state.rutFiltre.arama='';renderRutView();});
  const fileInput=document.getElementById('rutPlaniFileInput');
  document.getElementById('rutPlaniFileBtn')?.addEventListener('click',()=>fileInput?.click());
  fileInput?.addEventListener('change',async()=>{
    const file=fileInput.files&&fileInput.files[0];if(!file)return;
    try{const adet=await rutDosyasiYukle(file);if(typeof toastGoster==='function')toastGoster('success','Rut planı buluta kaydedildi',`${adet.toLocaleString('tr-TR')} müşteri satırı kalıcı olarak güncellendi; yeni dosya yüklenene kadar tekrar yüklemeniz gerekmez.`);}
    catch(err){console.error(err);alert('Rut planı yüklenemedi:\n\n'+err.message);}
    finally{fileInput.value='';}
  });
  rutKaynakMetniniGuncelle();
}

rutArayuzunuBagla();
