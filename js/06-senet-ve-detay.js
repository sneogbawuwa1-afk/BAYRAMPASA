/* ============================== SENET YAZDIRMA ============================== */
// Senette sabit kalacak şirket bilgileri (kullanıcı tarafından onaylandı).
const SENET_SABIT = {
  aliciUnvan: 'AKGÜN MEŞ.GIDA İNŞ.TUR.VE TİC.LTD.ŞTİ.',
  yetkiliMahkeme: 'BAKIRKÖY',
};

const TR_BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const TR_ONLAR = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
const TR_BASAMAK = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];
const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function ucBasamakYaziyla(n){
  const yuz = Math.floor(n/100);
  const kalan = n%100;
  const on = Math.floor(kalan/10);
  const bir = kalan%10;
  let s = '';
  if(yuz>0) s += (yuz===1 ? '' : TR_BIRLER[yuz]) + 'Yüz';
  s += TR_ONLAR[on];
  s += TR_BIRLER[bir];
  return s;
}
// Senetlerde geleneksel olarak kelimeler birbirine bitişik yazılır (araya sonradan kelime
// eklenerek sahtecilik yapılmasını zorlaştırmak için) — örnek taslaktaki "YüzElliBin" biçimiyle aynı.
function sayiyiYaziyaCevir(n){
  // Negatif veya geçersiz (NaN) girdi normalde buraya ulaşmaz (çağıran taraflar tutarı
  // önceden >0 diye doğruluyor); yine de bir gün ulaşırsa sessizce boş string dönüp basılı
  // belgede tutarı görünmez bırakmak yerine, açıkça yanlış olduğu belli olan "Sıfır" yazılır —
  // böylece hata fark edilmeden imzalanabilecek bir bono çıkmaz.
  n = Math.max(0, Math.round(n) || 0);
  if(n===0) return 'Sıfır';
  const gruplar = [];
  let x = n;
  while(x>0){ gruplar.push(x%1000); x = Math.floor(x/1000); }
  let sonuc = '';
  for(let i=gruplar.length-1;i>=0;i--){
    const grup = gruplar[i];
    if(grup===0) continue;
    let parca = ucBasamakYaziyla(grup);
    if(i===1 && grup===1) parca = ''; // "Bir Bin" değil sadece "Bin"
    sonuc += parca + TR_BASAMAK[i];
  }
  return sonuc;
}
function tarihUzunYazi(d){
  if(!(d instanceof Date) || isNaN(d)) return '—';
  return String(d.getDate()).padStart(2,'0') + ' ' + TR_AYLAR[d.getMonth()] + ' ' + d.getFullYear();
}
function tutarRakamSenet(n){
  return '#' + (n||0).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '#';
}
// Açık sipariş tutarını girilen senet adedine böler; ondalık farkları (küsurat) son senede
// eklenir, böylece senetlerin toplamı her zaman tam olarak açık sipariş tutarına eşit olur.
function senetTutarlariniBol(toplam, adet){
  const parcalar = [];
  let birikenToplam = 0;
  for(let i=0;i<adet-1;i++){
    const deger = Math.round((toplam/adet)*100)/100;
    parcalar.push(deger);
    birikenToplam += deger;
  }
  parcalar.push(Math.round((toplam-birikenToplam)*100)/100);
  return parcalar;
}

// SENET TASARIMI — "Öneri B: Klasik ticari evrak" (kullanıcı onayıyla seçildi).
// Yapı: sol üstte büyük serif BONO başlığı, sağ üstte damga görünümlü tutar kutusu,
// altında Alacaklı, sonra yatay çizgili tarih şeridi (Keşide Tarihi/Yeri/Ödeme Tarihi),
// senet metni, en altta sol Borçlu kutusu + sağ Düzenlenme Tarihi/İmza-Kaşe kutusu.
// Tamamen siyah-beyaz baskıya göre tasarlandı — renge bağımlı hiçbir unsur yok.
function buildSenetHTML(opts){
  const kesideTarihi = turkiyeBugun();
  return `<div class="senet-sayfa"><div class="senet-cerceve"><div class="senet-cerceve-inner">
    <div class="senet-ust">
      <div class="senet-baslik">BONO</div>
      <div class="senet-tutar-damga">
        <div class="senet-tutar-damga-label">Türk Lirası</div>
        <div class="senet-tutar-damga-deger">${tutarRakamSenet(opts.tutar)}</div>
      </div>
    </div>
    <div class="senet-alacakli">
      <div class="senet-alacakli-label">Alacaklı</div>
      <div class="senet-alacakli-adi">${escapeHtml(SENET_SABIT.aliciUnvan)}</div>
    </div>
    <div class="senet-meta-serit">
      <div class="senet-meta-item"><div class="senet-meta-label">Keşide Tarihi</div><div class="senet-meta-deger">${fmtDate(kesideTarihi)}</div></div>
      <div class="senet-meta-item"><div class="senet-meta-label">Keşide Yeri</div><div class="senet-meta-deger">${escapeHtml(opts.il || '—')}</div></div>
      <div class="senet-meta-item"><div class="senet-meta-label">Ödeme Tarihi</div><div class="senet-meta-deger">${fmtDate(opts.vadeTarihi)}</div></div>
    </div>
    <p class="senet-metin">İşbu emre yazılı senet mukabilinde <u>${tarihUzunYazi(opts.vadeTarihi)}</u> tarihinde <b><u>${escapeHtml(SENET_SABIT.aliciUnvan)}</u></b> veyahut emrühavalesine yukarıda yazılı <b><u>#${sayiyiYaziyaCevir(Math.floor(opts.tutar))}${Math.round((opts.tutar%1)*100)>0 ? ' Lira '+sayiyiYaziyaCevir(Math.round((opts.tutar%1)*100))+' Kuruş' : ''} Türk Lirası#</u></b> ödeyeceğim. Bedeli <b>MALEN</b> ahzolunmuştur. İşbu bononun gününde ödenmemesi halinde diğer bonoların da muacceliyet kazanacağını, bu durumda icra masraflarını ve avukatlık ücretini ödeyeceğimi, ihtilaf halinde <b><u>${escapeHtml(SENET_SABIT.yetkiliMahkeme)}</u></b> mahkemeleri ve icra dairelerinin yetkili olduğunu şimdiden kabul ediyorum.</p>
    <div class="senet-taraflar">
      <div class="senet-taraf-box">
        <p class="senet-taraf-baslik">Borçlu</p>
        <p><b>Ad Soyad / Unvan</b> : ${escapeHtml(opts.borcluAdi || '—')}</p>
        <p><b>T.C./Vergi No.</b> : ${escapeHtml(opts.vergiTcNo || '—')}</p>
        <p><b>Adres</b> : ${escapeHtml(senetAdresTamMetin(opts.adres, opts.ilce, opts.il))}</p>
      </div>
      <div class="senet-taraf-box senet-imza-taraf-box">
        <p class="senet-taraf-baslik">Düzenlenme Tarihi : ${fmtDate(kesideTarihi)}</p>
        <div class="senet-imza-blok">İmza / Kaşe</div>
      </div>
    </div>
  </div></div></div>`;
}

// Bono üzerindeki "Adres" satırı: Müşteri Master'daki Sevk Adresi'nin sonuna, varsa İlçe/İl
// bilgisi de eklenir (örn. "Cumhuriyet Mah. Songül Sokak No:16/A, Keşan/Edirne"). Sevk Adresi
// zaten İlçe/İl adını içeriyorsa (bazı dosyalarda adres alanı bunu barındırabiliyor) tekrar
// eklenmez — büyük/küçük harf farkına duyarsız (Türkçe locale) karşılaştırılır.
function senetAdresTamMetin(adres, ilce, il){
  const temizAdres = String(adres||'').trim();
  const temizIlce = String(ilce||'').trim();
  const temizIl = String(il||'').trim();
  const ilceIl = [temizIlce, temizIl].filter(Boolean).join('/');
  if(!ilceIl) return temizAdres || '—';
  const adresU = temizAdres.toLocaleUpperCase('tr-TR');
  const ilceU = temizIlce.toLocaleUpperCase('tr-TR');
  const ilU = temizIl.toLocaleUpperCase('tr-TR');
  const zatenIcerior = (temizIlce && adresU.includes(ilceU)) && (temizIl && adresU.includes(ilU));
  if(zatenIcerior) return temizAdres || '—';
  return temizAdres ? `${temizAdres}, ${ilceIl}` : ilceIl;
}

let senetState = { musteriKod:null, musteriAdi:null, acikSiparisTutari:0, sevkiErtelenenTutari:0, yaslandirmaTutari:0, mod:'genel', bazTutar:0 };

function senetTutarTipiSec(deger){
  document.querySelectorAll('input[name="senetTutarTipi"]').forEach(r=>{ r.checked = (r.value === deger); });
  document.getElementById('senetManuelTutarRow').style.display = (deger === 'manuel') ? 'block' : 'none';
}

function senetBazTutarHesapla(){
  const seciliEl = document.querySelector('input[name="senetTutarTipi"]:checked');
  const secili = seciliEl ? seciliEl.value : 'acikSiparis';
  if(secili === 'yaslandirma') return senetState.yaslandirmaTutari;
  if(secili === 'acikSiparis') return senetState.acikSiparisTutari;
  if(secili === 'sevkiErtelenen') return senetState.sevkiErtelenenTutari;
  return Number(document.getElementById('senetManuelTutarInput').value) || 0;
}

function senetTutarTipiDegisince(radio){
  document.getElementById('senetManuelTutarRow').style.display = (radio.value==='manuel' && radio.checked) ? 'block' : 'none';
  // Tutar kaynağı değişince önceden oluşturulmuş vade kartları eskir; kullanıcı tekrar "Devam" a basmalı.
  document.getElementById('senetVadeAlanlari').innerHTML = '';
  document.getElementById('senetYazdirBtn').style.display = 'none';
  document.getElementById('senetHataMesaji').style.display = 'none';
}

document.querySelectorAll('input[name="senetTutarTipi"]').forEach(r=>{
  r.addEventListener('change', ()=>senetTutarTipiDegisince(r));
});
document.getElementById('senetManuelTutarInput').addEventListener('input', ()=>{
  document.getElementById('senetVadeAlanlari').innerHTML = '';
  document.getElementById('senetYazdirBtn').style.display = 'none';
  document.getElementById('senetHataMesaji').style.display = 'none';
});

// Eski bir index.html önbellekten gelse bile Rut senet modalı çalışmaya devam etsin: yeni
// Yaşlandırma seçeneğini gerekirse çalışma anında oluşturur, mevcut seçeneklere kimlik verir.
function senetTutarSecenekleriniHazirla(){
  const kap = document.querySelector('.senet-tutar-tipi-options');
  if(!kap) return false;
  let yaslandirmaOpt = document.getElementById('senetTutarTipiYaslandirmaOpt');
  if(!yaslandirmaOpt){
    yaslandirmaOpt = document.createElement('label');
    yaslandirmaOpt.className = 'senet-tutar-tipi-opt';
    yaslandirmaOpt.id = 'senetTutarTipiYaslandirmaOpt';
    yaslandirmaOpt.style.display = 'none';
    yaslandirmaOpt.innerHTML = '<input type="radio" name="senetTutarTipi" value="yaslandirma" /><span>Yaşlandırma Bakiyesi <b id="senetTutarTipiYaslandirmaDeger">₺0</b></span>';
    kap.prepend(yaslandirmaOpt);
    const radio = yaslandirmaOpt.querySelector('input');
    radio.addEventListener('change', ()=>senetTutarTipiDegisince(radio));
  }
  const acikRadio = document.querySelector('input[name="senetTutarTipi"][value="acikSiparis"]');
  const sevkRadio = document.querySelector('input[name="senetTutarTipi"][value="sevkiErtelenen"]');
  if(acikRadio && acikRadio.closest('label')) acikRadio.closest('label').id = 'senetTutarTipiAcikOpt';
  if(sevkRadio && sevkRadio.closest('label')) sevkRadio.closest('label').id = 'senetTutarTipiSevkOpt';
  return !!(document.getElementById('senetTutarTipiYaslandirmaDeger') && document.getElementById('senetTutarTipiAcikOpt') && document.getElementById('senetTutarTipiSevkOpt'));
}

function senetModalAc(musteriKod, musteriAdi, acikSiparisTutari, sevkiErtelenenTutari, kalanBorc, secenekler){
  const rutModu = !!(secenekler && secenekler.mod === 'rut');
  if(!senetTutarSecenekleriniHazirla()) throw new Error('Senet tutar seçenekleri hazırlanamadı.');
  // Modal HTML'de Genel Bakış bölümünün altında bulunuyor. Rut görünümüne geçildiğinde bu
  // üst bölüm display:none olduğu için yalnızca "open" sınıfı vermek yetmiyordu. Overlay'i
  // ilk açılışta body seviyesine taşıyarak bütün görünümlerden erişilebilir bir modal yaparız.
  const senetOverlay = document.getElementById('senetModalOverlay');
  if(!senetOverlay) throw new Error('Senet modalı sayfada bulunamadı.');
  if(senetOverlay.parentElement !== document.body) document.body.appendChild(senetOverlay);
  senetState = {
    musteriKod, musteriAdi,
    acikSiparisTutari:acikSiparisTutari||0,
    sevkiErtelenenTutari:sevkiErtelenenTutari||0,
    yaslandirmaTutari:rutModu ? (Number(secenekler.yaslandirmaTutari)||0) : 0,
    mod:rutModu ? 'rut' : 'genel', bazTutar:0,
  };
  document.getElementById('senetModalMusteriBilgi').textContent = `${musteriAdi} (${musteriKod})`;
  const bakiyeBilgi = document.getElementById('senetModalKalanBorc');
  if(rutModu){
    bakiyeBilgi.innerHTML = `<span class="senet-modal-bakiye-item toplam"><em>Toplam Bakiye</em><b>${TL(Number(kalanBorc)||0)}</b></span><span class="senet-modal-bakiye-item yaslandirma"><em>Yaşlandırma</em><b>${TL(senetState.yaslandirmaTutari)}</b></span>`;
  }else{
    bakiyeBilgi.textContent = 'Kalan Borç: ' + TL(kalanBorc||0);
  }
  document.getElementById('senetTutarTipiYaslandirmaDeger').textContent = TL(senetState.yaslandirmaTutari);
  document.getElementById('senetTutarTipiAcikDeger').textContent = TL(senetState.acikSiparisTutari);
  document.getElementById('senetTutarTipiSevkDeger').textContent = TL(senetState.sevkiErtelenenTutari);
  document.getElementById('senetManuelTutarInput').value = '';

  // Rut satırından açıldığında sade iki seçenek gösterilir: güncel Yaşlandırma Bakiyesi
  // (ön tanımlı) ve Manuel Giriş. Genel Bakış'taki mevcut Açık Sipariş/Sevk akışı değişmez.
  document.getElementById('senetTutarTipiYaslandirmaOpt').style.display = rutModu ? 'flex' : 'none';
  document.getElementById('senetTutarTipiAcikOpt').style.display = rutModu ? 'none' : 'flex';
  document.getElementById('senetTutarTipiSevkOpt').style.display = rutModu ? 'none' : 'flex';

  // Varsayılan seçim: açık siparişi varsa o, yoksa sevki ertelenen, ikisi de yoksa manuel giriş.
  let varsayilan = rutModu ? 'yaslandirma' : 'acikSiparis';
  if(!rutModu && !(senetState.acikSiparisTutari > 0) && senetState.sevkiErtelenenTutari > 0) varsayilan = 'sevkiErtelenen';
  else if(!rutModu && !(senetState.acikSiparisTutari > 0) && !(senetState.sevkiErtelenenTutari > 0)) varsayilan = 'manuel';
  senetTutarTipiSec(varsayilan);

  document.getElementById('senetAdetInput').value = 1;
  document.getElementById('senetVadeAlanlari').innerHTML = '';
  document.getElementById('senetYazdirBtn').style.display = 'none';
  document.getElementById('senetHataMesaji').style.display = 'none';
  senetOverlay.classList.add('open');
}
function senetModalKapat(){
  document.getElementById('senetModalOverlay').classList.remove('open');
}
document.getElementById('senetModalClose').addEventListener('click', senetModalKapat);
document.getElementById('senetModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'senetModalOverlay') senetModalKapat();
});
document.addEventListener('click', (e)=>{
  const senetBtn = e.target.closest('.senet-yazdir-btn');
  if(senetBtn){
    e.stopPropagation(); // satırın kendi genişletme/daraltma tıklamasını tetiklemesin
    e.preventDefault();
    try{
      const rutModu = senetBtn.dataset.senetModu === 'rut';
      const secenekler = rutModu ? {mod:'rut', yaslandirmaTutari:Number(senetBtn.dataset.yaslandirma)} : null;
      senetModalAc(senetBtn.dataset.musteri, senetBtn.dataset.musteriAdi, Number(senetBtn.dataset.tutar), Number(senetBtn.dataset.emanet), Number(senetBtn.dataset.kalanBorc), secenekler);
    }catch(err){
      console.error('Senet Yazdır penceresi açılamadı:', err);
      alert('Senet penceresi açılırken bir hata oluştu: ' + err.message + '\n\nLütfen sayfayı yenileyip (sert yenileme) tekrar deneyin.');
    }
  }
});

document.getElementById('senetAdetOnaylaBtn').addEventListener('click', ()=>{
  const hataEl = document.getElementById('senetHataMesaji');
  const bazTutar = senetBazTutarHesapla();
  if(!(bazTutar > 0)){
    hataEl.textContent = 'Lütfen geçerli bir senet tutarı seçin ya da manuel giriş alanına bir tutar girin.';
    hataEl.style.display = 'block';
    document.getElementById('senetVadeAlanlari').innerHTML = '';
    document.getElementById('senetYazdirBtn').style.display = 'none';
    return;
  }
  senetState.bazTutar = bazTutar;
  const adet = Math.max(1, Math.min(12, Number(document.getElementById('senetAdetInput').value)||1));
  document.getElementById('senetAdetInput').value = adet;
  const parcalar = senetTutarlariniBol(senetState.bazTutar, adet);
  const alan = document.getElementById('senetVadeAlanlari');
  alan.innerHTML = parcalar.map((tutar,i)=>`
    <div class="senet-vade-card">
      <div class="senet-vade-card-badge">${i+1}</div>
      <div class="senet-vade-card-info">
        <div class="senet-vade-card-label">Senet ${i+1}</div>
        <div class="senet-vade-card-tutar">${TL(tutar)}</div>
      </div>
      <div class="senet-vade-card-date">
        <label for="senetVade${i}">Vade Tarihi</label>
        <input type="date" id="senetVade${i}" class="senet-vade-input" data-index="${i}" />
      </div>
    </div>`).join('');
  document.getElementById('senetYazdirBtn').style.display = 'inline-flex';
  document.getElementById('senetHataMesaji').style.display = 'none';
});

// Senet (bono) üzerindeki "Ad Soyad / Unvan" alanı: Müşteri Master'daki Tabela Adı ile Müşteri Adı
// birlikte gösterilir (örn. "Ateş Bakkal / Esra Arı"). İkisi aynıysa veya biri boşsa tekrar önlenir;
// hiçbiri yoksa açık siparişin bağlı olduğu müşteri adına düşülür.
// Senet (bono) üzerindeki "Ad Soyad / Unvan" alanı: Müşteri Master'daki Tabela Adı ile Müşteri Adı
// birlikte gösterilir (örn. "Ateş Bakkal / Esra Arı"). Üç durum ele alınır:
//  1) İkisi birebir aynıysa tekrar önlenir, tek bir kez yazılır.
//  2) Biri diğerinin başlangıcıysa (aynı isimle devam edip ek metinle sürüyorsa, örn. Tabela Adı
//     "KAYKI TURİZM..." ile başlayıp Müşteri Adı aynı ifadeyle başlayıp devamında ek isim
//     taşıyorsa) yalnızca daha kapsamlı (uzun) olan yazılır, ikisi yan yana tekrar edilmez.
//  3) Aksi halde ikisi de farklı bilgi taşıyor demektir, " / " ile yan yana gösterilir.
function senetBorcluAdiOlustur(detay, yedekMusteriAdi){
  const tabela = String(detay.tabelaAdi||'').trim();
  const musteriAdi = String(detay.musteriAdi||'').trim();
  if(tabela && musteriAdi){
    const tabelaU = tabela.toLocaleUpperCase('tr-TR');
    const musteriU = musteriAdi.toLocaleUpperCase('tr-TR');
    if(tabelaU === musteriU) return tabela;
    if(tabelaU.startsWith(musteriU) || musteriU.startsWith(tabelaU)){
      return tabela.length >= musteriAdi.length ? tabela : musteriAdi;
    }
    return `${tabela} / ${musteriAdi}`;
  }
  return tabela || musteriAdi || yedekMusteriAdi || '—';
}

document.getElementById('senetYazdirBtn').addEventListener('click', ()=>{
  const vadeInputs = Array.from(document.querySelectorAll('.senet-vade-input'));
  const hataEl = document.getElementById('senetHataMesaji');
  if(vadeInputs.some(inp=>!inp.value)){
    hataEl.textContent = 'Lütfen tüm senetler için vade tarihi girin.';
    hataEl.style.display = 'block';
    return;
  }
  const adet = vadeInputs.length;
  const parcalar = senetTutarlariniBol(senetState.bazTutar, adet);
  const detay = state.musteriMasterDetay.get(senetState.musteriKod) || {};
  if(!detay.tabelaAdi && !detay.musteriAdi){
    hataEl.textContent = '⚠️ Bu müşteri için Müşteri Master bilgisi bulunamadı; borçlu adı/adres/vergi no boş basılacak. Devam etmek için tekrar basın.';
    hataEl.style.display = 'block';
    if(!document.getElementById('senetYazdirBtn').dataset.uyariGosterildi){
      document.getElementById('senetYazdirBtn').dataset.uyariGosterildi = '1';
      return;
    }
  }
  delete document.getElementById('senetYazdirBtn').dataset.uyariGosterildi;
  hataEl.style.display = 'none';

  const vergiTcNo = detay.vergiNo || detay.tcKimlikNo || '';
  const senetlerHTML = vadeInputs.map((inp,i)=> buildSenetHTML({
    borcluAdi: senetBorcluAdiOlustur(detay, senetState.musteriAdi),
    vergiTcNo, adres: detay.adres, il: detay.il, ilce: detay.ilce,
    vadeTarihi: new Date(inp.value+'T00:00:00'),
    tutar: parcalar[i],
    senetNo: i+1, senetAdet: adet,
  })).join('');

  document.getElementById('senetYazdirmaAlani').innerHTML = senetlerHTML;
  document.body.classList.add('senet-yazdiriliyor');
  senetModalKapat();
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{ document.body.classList.remove('senet-yazdiriliyor'); }, 500);
  }, 100);
});

function renderMusteriDetail(m, showSenetBtn){
  let html = `<div class="cust-expanded-head">
    <span class="cust-expanded-risk">Toplam Risk: <b>${TL(m.toplamRisk)}</b></span>
    ${showSenetBtn ? `<button type="button" class="btn small senet-yazdir-btn" data-musteri="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}" data-tutar="${m.siparisTutari||0}" data-emanet="${m.emanetSiparis||0}" data-kalan-borc="${m.kalanBorc||0}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Senet Yazdır</button>` : ''}
  </div>`;
  // Tahsilat kaynak şeffaflığı: gösterilen "Alınan Tahsilat" tutarının ne kadarının normal (nakit)
  // tahsilat, ne kadarının İade Grubu (Bozuk/Sağlam/Depozito İade Faturası — kullanıcı kararıyla TEK
  // bir "İade Tahsilatı" kalemi olarak birleştirildi) kredisi olduğunu gösterir. Sadece kredi
  // bileşeni varsa gösterilir (sade tutmak için tamamen normal tahsilatlarda gizli).
  const kay = m.alinanTahsilatKaynak;
  if(kay && ((kay.bozukIade||0) > 0 || (kay.depozito||0) > 0 || (kay.hakedis||0) > 0)){
    // kay.depozito artık her zaman 0'dır (Depozito Tahsilat dosyası ayrı kaynak olarak kaldırıldı —
    // Depozito İade Faturası dahil TÜM İade Grubu kay.bozukIade altında toplanır). Alan geriye dönük
    // uyumluluk için korunur, satırı yine de gösteriyoruz (eski arşiv kayıtlarında >0 olabilir).
    html += `<div class="note" style="margin-bottom:14px;font-size:11.5px;background:var(--navy-soft);border-radius:9px;padding:9px 12px;">
      <b>Tahsilat Dökümü:</b> ${TL(m.alinanTahsilat)} toplam
      <div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">
        ${kay.normal>0 ? `<span>· Normal Tahsilat: ${TL(kay.normal)}</span>` : ''}
        ${kay.hakedis>0 ? `<span>· Hakediş Tahsilatı: ${TLKurus(kay.hakedis)}</span>` : ''}
        ${kay.bozukIade>0 ? `<span>· İade Tahsilatı (Bozuk/Sağlam/Depozito İade): ${TL(kay.bozukIade)}</span>` : ''}
        ${kay.depozito>0 ? `<span>· Depozito Tahsilatı: ${TL(kay.depozito)}</span>` : ''}
      </div>
    </div>`;
  }
  const hakedisRapor = state.bayiHakedisReport;
  const hakedisKaydi = (hakedisRapor && Array.isArray(hakedisRapor.noktalar)) ? hakedisRapor.noktalar.find(n=>n.kod===m.musteri) : null;
  if(hakedisKaydi && hakedisKaydi.kayitlar && hakedisKaydi.kayitlar.length){
    html += `<h4>Bayi Hakediş (${hakedisKaydi.kayitlar.length})</h4>
    <div class="table-scroll"><table class="mini-table compact"><thead><tr>
      <th>Tarih</th><th>Kategori</th><th class="num">Tutar (KDV Hariç)</th><th class="num">Tutar (KDV Dahil)</th>
    </tr></thead><tbody>`;
    html += hakedisKaydi.kayitlar.map(k=>`<tr>
      <td>${fmtDate(k.tarih)}</td>
      <td>${escapeHtml(k.kategori)}</td>
      <td class="num">${TLKurus(k.tutarHaric)}</td>
      <td class="num">${TLKurus(k.tutarKdvli)}</td>
    </tr>`).join('');
    html += `</tbody></table></div>`;
  }
  if(m.__bakiyesiz){
    if(m.cekSenetDetay && m.cekSenetDetay.length){
      html += `<h4>Çek / Senet Detayı (${m.cekSenetDetay.length})</h4>
      <div class="table-scroll"><table class="mini-table"><thead><tr>
        <th>No</th><th>Tip</th><th>Belge Tarihi</th><th>Vade Tarihi</th><th class="num">Tutar</th>
      </tr></thead><tbody>`;
      html += m.cekSenetDetay.map(c=>`<tr>
        <td>${escapeHtml(c.no||'—')}</td><td>${escapeHtml(c.tip||'—')}</td>
        <td>${fmtDate(c.belgeTarihi)}</td><td>${fmtDate(c.vade)}</td><td class="num">${TL(c.tutar)}</td>
      </tr>`).join('');
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="empty-state">Bu müşterinin Kalemler dosyasında kaydı olmadığından fatura detayı yok.</div>`;
    }
    return html;
  }
  const gorunurFaturalar = m.invoices.filter(inv=> inv.kalanBorc !== 0);
  html += `<h4>Açık Faturalar (${gorunurFaturalar.length})</h4>
  <div class="table-scroll"><table class="mini-table"><thead><tr>
    <th>Belge No</th><th>Tür</th><th>Fatura Tarihi</th><th class="num">Tutar</th><th class="num">Kalan Borç</th><th class="num">Faturadan Sonr.Gün</th>
  </tr></thead><tbody>`;
  html += gorunurFaturalar.map(inv=>`<tr>
    <td>${escapeHtml(inv.belgeNo||'—')}</td>
    <td>${escapeHtml(inv.belgeTuru||'—')}</td>
    <td>${fmtDate(inv.faturaTarihi)}</td>
    <td class="num">${TL(inv.tutar)}</td>
    <td class="num">${TL(inv.kalanBorc)}</td>
    <td class="num">${vadeBadge(inv.gunFatura)}</td>
  </tr>`).join('');
  html += `</tbody></table></div>`;

  if(m.cekSenetDetay && m.cekSenetDetay.length){
    html += `<h4>Çek / Senet Detayı (${m.cekSenetDetay.length})</h4>
    <div class="table-scroll"><table class="mini-table"><thead><tr>
      <th>No</th><th>Tip</th><th>Belge Tarihi</th><th>Vade Tarihi</th><th class="num">Tutar</th>
    </tr></thead><tbody>`;
    html += m.cekSenetDetay.map(c=>`<tr>
      <td>${escapeHtml(c.no||'—')}</td><td>${escapeHtml(c.tip||'—')}</td>
      <td>${fmtDate(c.belgeTarihi)}</td><td>${fmtDate(c.vade)}</td><td class="num">${TL(c.tutar)}</td>
    </tr>`).join('');
    html += `</tbody></table></div>`;
  }
  return html;
}

function getSevkFilteredSorted(report){
  const q = document.getElementById('sevkSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('sevkTemsilciFilter').value;
  const riskFilter = document.getElementById('sevkRiskFilter').value;
  const vadeMin = document.getElementById('sevkVadeMinInput').value;
  const vadeMax = document.getElementById('sevkVadeMaxInput').value;
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — yalnızca çek/senet riski yazılır.
  const bakiyesizSatirlari = (report.bakiyesiz||[]).map(b=>({
    musteri: b.musteri, musteriAdi: b.musteriAdi, temsilci: b.temsilci,
    kalanBorc: 0, avgVadeGun: null, siparisTutari: b.siparisTutari||0, emanetSiparis: b.emanetSiparis||0,
    cekSenet: b.cekSenet||0, alinanTahsilat: 0, toplamRisk: (b.cekSenet||0),
    invoices: [], cekSenetDetay: b.cekSenetDetay||[], __bakiyesiz: true,
  }));
  let rows = report.musteriler.filter(m=> m.siparisTutari>0 || m.emanetSiparis>0).concat(bakiyesizSatirlari);
  rows = rows.filter(m=>{
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
  const {key,dir} = state.sevkSort;
  rows = rows.slice().sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

function renderSevkDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('sevkMusteriDahaFazlaWrap');
  const info = document.getElementById('sevkMusteriDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

function renderSevkMusteriTable(report, resetSayfa=true){
  if(resetSayfa) state.sevkGosterilen = MUSTERI_SAYFA_BOYUTU;
  const rows = getSevkFilteredSorted(report);
  document.getElementById('sevkMusteriCount').textContent = rows.length.toLocaleString('tr-TR') + ' müşteri';
  const list = document.getElementById('sevkMusteriTbody');
  if(!rows.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Açık siparişi veya sevki ertelenen ürünü olan müşteri bulunamadı.</div>`;
    renderSevkDahaFazlaBtn(0, 0);
    return;
  }
  const hakedisKodlari = bayiHakedisliMusteriKodlari();
  const stokKodlari = ticariStokluMusteriKodlari();
  const gosterilecekSayi = Math.min(state.sevkGosterilen, rows.length);
  const gosterilecekRows = rows.slice(0, gosterilecekSayi);
  list.innerHTML = gosterilecekRows.map(m=>{
    state.faturaModalYedekMap.set(m.musteri, m);
    const risk = hukukiRiskSeviyesi(m.avgVadeGun);
    const vadeRenk = ortVadeRenk(m.avgVadeGun);
    const bakiyesizEtiket = m.__bakiyesiz ? '<span class="badge info" title="Bu müşterinin Kalemler dosyasında (açık fatura/kalan borç) kaydı yok, yalnızca sipariş dökümü ve/veya çek-senet riskinde görünüyor">Bakiyesiz</span>' : '';
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
          ${isRiskliMusteri(m)?'<span class="badge dikkat" title="Ortalama vade '+VADE_RISK_ESIGI+' gün ve üzeri"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Dikkat</span>':''}${bakiyesizEtiket}${hakedisRozeti(m.musteri, hakedisKodlari)}${emanetRozeti(m.musteri, stokKodlari)}
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

  renderSevkDahaFazlaBtn(gosterilecekSayi, rows.length);
}

// (searchClearBtnGuncelle, yükleme sırası gereği 01-cekirdek-ve-arsiv.js dosyasına taşındı)
const debouncedRenderSevkMusteriTable = debounce(()=>renderSevkMusteriTable(state.report));
// (wireSearchInput, yükleme sırası gereği 01-cekirdek-ve-arsiv.js dosyasına taşındı)
wireSearchInput('sevkSearchInput', 'sevkSearchClearBtn', debouncedRenderSevkMusteriTable);
// (wireSearchClear, yükleme sırası gereği 01-cekirdek-ve-arsiv.js dosyasına taşındı)
wireSearchClear('sevkSearchInput', 'sevkSearchClearBtn', ()=>renderSevkMusteriTable(state.report));
document.getElementById('sevkTemsilciFilter').addEventListener('change', ()=>{
  renderSevkMusteriTable(state.report);
  renderSevkOzet(state.report);
});
document.getElementById('sevkRiskFilter').addEventListener('change', ()=>renderSevkMusteriTable(state.report));
document.getElementById('sevkVadeMinInput').addEventListener('input', debounce(()=>renderSevkMusteriTable(state.report)));
document.getElementById('sevkVadeMaxInput').addEventListener('input', debounce(()=>renderSevkMusteriTable(state.report)));

const sevkMusteriSortSelect = document.getElementById('sevkMusteriSortSelect');
const sevkMusteriSortDirBtn = document.getElementById('sevkMusteriSortDirBtn');
sevkMusteriSortSelect.value = state.sevkSort.key;
sevkMusteriSortDirBtn.textContent = state.sevkSort.dir===1 ? '↑' : '↓';
sevkMusteriSortSelect.addEventListener('change', ()=>{
  state.sevkSort.key = sevkMusteriSortSelect.value;
  renderSevkMusteriTable(state.report);
});
sevkMusteriSortDirBtn.addEventListener('click', ()=>{
  state.sevkSort.dir *= -1;
  sevkMusteriSortDirBtn.textContent = state.sevkSort.dir===1 ? '↑' : '↓';
  renderSevkMusteriTable(state.report);
});
document.getElementById('sevkMusteriDahaFazlaBtn').addEventListener('click', ()=>{
  state.sevkGosterilen += MUSTERI_SAYFA_BOYUTU;
  renderSevkMusteriTable(state.report, false);
});

async function computeFaturaKontrolRows(report, selectedDate, temsilciFilter, aramaMetni){
  if(!selectedDate) return [];
  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);
  // Seçili tarihten bir önceki günün anahtarı (YYYY-MM-DD) — "Önceki Gün Tahsilatı" alanı için.
  // dateVal input'u zaten yerel (Türkiye) takvim günü olarak geldiğinden, saat dilimi kaymasına
  // yol açmaması için doğrudan Date(y,m,d) ile bir gün geriye gidilip dateKeyLocal ile anahtara çevrilir.
  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const oncekiGunDate = new Date(selY, (selM-1), selD-1);
  const oncekiGunKey = dateKeyLocal(oncekiGunDate);

  const eslesen = new Map();
  (birlesikArsiv.siparisArsiv||[]).forEach(r=>{
    if(!r.istenilenTeslimTarihi) return;
    if(dateKeyLocal(r.istenilenTeslimTarihi) !== selectedDate) return;
    if(!eslesen.has(r.musteri)) eslesen.set(r.musteri, {seciliSiparis:0, seciliTahsilat:0, oncekiGunTahsilat:0, musteriAdi:null, temsilci:null});
    const e = eslesen.get(r.musteri);
    e.seciliSiparis += (r.tutar||0);
    // Arşivdeki sipariş kaydı, o günün KENDİ isim/temsilci bilgisini taşır — mevcut oturumda
    // yüklü rapora (report.musteriler) kayıtlı olmayan (bakiyesiz) müşteriler için de bu bilgi
    // aşağıda "isimsiz düşürme" olmadan satır oluşturmaya yeter.
    if(!e.musteriAdi && r.musteriAdi) e.musteriAdi = r.musteriAdi;
    if(!e.temsilci && r.temsilci) e.temsilci = r.temsilci;
  });
  // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT (düzeltme): Artık birlesikArsiv.tahsilatArsiv (eski Format
  // A/B döneminden kalma, faturaKontrolArsivineKaydetVeSenkronizeEt'in artık HİÇ yazmadığı bir
  // kaynak) DEĞİL, kendi bağımsız kalıcı arşivi state.tahsilatArsivi (belge no bazlı) okunur —
  // Trend Analizi/Tahsilat Verimliliği'nin kullandığı KAYNAKLA AYNI. Önceki halde bu ekran hep
  // "TAHSİLAT: —" gösteriyordu çünkü baktığı kaynağa artık hiçbir şey yazılmıyordu.
  Object.values(state.tahsilatArsivi||{}).forEach(r=>{
    if(!r.tarih) return;
    const rGunKey = dateKeyLocal(new Date(r.tarih));
    if(rGunKey === selectedDate){
      // YENİ KURAL: Fatura Kontrol'de kart, SADECE o gün siparişi olan müşteriler için gösterilir.
      // Bu yüzden tahsilat kaydı, o müşteri için "eslesen" map'inde YENİ bir satır AÇMAZ — sadece
      // sipariş bloğunda zaten eklenmiş olan müşterinin tahsilat bilgisini doldurur.
      if(!eslesen.has(r.musteriKod)) return;
      const e = eslesen.get(r.musteriKod);
      if(!e.seciliTahsilatKaynak) e.seciliTahsilatKaynak = {normal:0, bozukIade:0, depozito:0, hakedis:0};
      e.seciliTahsilat += (r.tutar||0);
      if(r.tahsilatKategori==='Hakedis') e.seciliTahsilatKaynak.hakedis += r.tutar||0;
      else e.seciliTahsilatKaynak.normal += r.tutar||0;
    } else if(rGunKey === oncekiGunKey){
      // Bir önceki güne ait tahsilat: yeni "Önceki Gün Tahsilatı" alanı için ayrıca toplanır.
      // YENİ KURAL: bu da yalnızca seçili günde zaten siparişi olup "eslesen" map'inde bulunan
      // müşteriler için doldurulur; tek başına yeni bir satır/kart açmaz.
      if(!eslesen.has(r.musteriKod)) return;
      const e = eslesen.get(r.musteriKod);
      e.oncekiGunTahsilat += (r.tutar||0);
      if(!e.musteriAdi && r.musteriAdi) e.musteriAdi = r.musteriAdi;
    }
  });
  // İADE GRUBU KREDİLERİ (Bozuk/Sağlam/Depozito İade Faturası) — AYRI KAYNAK (kullanıcı isteği bu
  // ayrımı hiç değiştirmedi): Bu kredi türü, Tahsilat Dökümü'nün tek-format değişikliğinden
  // ETKİLENMEDİ — hâlâ faturaKontrolArsivineKaydetVeSenkronizeEt içinde, Fatura Dökümü'nden türeyip
  // birlesikArsiv.tahsilatArsiv'e 'FaturaIade' etiketiyle yazılıyor. Bu yüzden burada AYRICA
  // (yukarıdaki yeni tahsilat bloğuna ek olarak) okunmaya devam eder — aksi halde bu kredi türü
  // Fatura Kontrol'de hiç görünmezdi.
  // NOT: kay.depozito alanı geriye dönük uyumluluk için korunur ama artık HİÇ dolmaz — Depozito
  // Tahsilat dosyası (ayrı kaynak) kaldırıldığından tüm İade Grubu (Depozito İade Faturası dahil)
  // 'FaturaIade' etiketiyle tek kalemde (bozukIade) toplanır.
  (birlesikArsiv.tahsilatArsiv||[]).forEach(r=>{
    if(!r.belgeTarihi) return;
    if(r.formatKaynagi!=='FaturaIade') return;
    const rGunKey = dateKeyLocal(r.belgeTarihi);
    if(rGunKey === selectedDate){
      if(!eslesen.has(r.musteri)) return;
      const e = eslesen.get(r.musteri);
      if(!e.seciliTahsilatKaynak) e.seciliTahsilatKaynak = {normal:0, bozukIade:0, depozito:0, hakedis:0};
      e.seciliTahsilat += (r.tutar||0);
      e.seciliTahsilatKaynak.bozukIade += r.tutar||0;
    } else if(rGunKey === oncekiGunKey){
      if(!eslesen.has(r.musteri)) return;
      const e = eslesen.get(r.musteri);
      e.oncekiGunTahsilat += (r.tutar||0);
      if(!e.musteriAdi && r.musteriAdi) e.musteriAdi = r.musteriAdi;
    }
  });

  const q = String(aramaMetni||'').trim().toLocaleLowerCase('tr-TR');
  const musterilerByCode = new Map(report.musteriler.map(m=>[m.musteri, m]));
  let rows = [];
  eslesen.forEach((v, musteri)=>{
    let m = musterilerByCode.get(musteri);
    if(!m){
      // Bu müşterinin mevcut oturumda yüklü Kalemler/rapor içinde kaydı yok (ör. bakiyesi
      // kapanmış ya da o gün için Kalemler dosyası hiç yüklenmemiş) — ama arşivdeki sipariş/
      // tahsilat kaydı SEÇİLİ TARİH için var. Önceden bu durumda satır tamamen atlanıyordu ve
      // "geçmiş siparişler" Fatura Kontrol'de hiç görünmüyordu. Artık arşiv kaydının kendi
      // isim/temsilci bilgisiyle (bakiyesiz) bir satır olarak gösteriliyor.
      const temsilciYedek = (state.musteriMasterMap && state.musteriMasterMap.get(musteri)) || v.temsilci || '—';
      m = {
        musteri, musteriAdi: v.musteriAdi || musteri, temsilci: temsilciYedek,
        kalanBorc:0, avgVadeGun:0, cekSenet:0, toplamRisk:0, invoices:[], cekSenetDetay:[], __bakiyesiz:true,
        siparisTutari: v.seciliSiparis||0, emanetSiparis:0,
      };
    }
    if(temsilciFilter && m.temsilci !== temsilciFilter) return;
    if(q && !musteriAramaEslesiyorMu(q, m.musteriAdi, m.musteri, m.musteriUnvan)) return;
    // Fatura Kontrol'de gösterilen tahsilat SEÇİLİ TARİHE özgüdür — bu yüzden döküm de (varsa
    // Genel Rapor'un "bugüne en yakın gün" bazlı dökümü değil) o güne özgü kaynak dağılımıyla
    // gösterilir (bkz. renderMusteriDetail'daki alinanTahsilatKaynak kullanımı).
    // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz (Kalemler'de kaydı
    // olmayan) bir müşterinin burada çek/senedi de olamayacağından (yukarıda cekSenet:0 sabit) risk 0'dır.
    const toplamRisk = m.__bakiyesiz ? (m.cekSenet||0) : m.toplamRisk;
    rows.push(Object.assign({}, m, {seciliSiparis: v.seciliSiparis, seciliTahsilat: v.seciliTahsilat, oncekiGunTahsilat: v.oncekiGunTahsilat||0, alinanTahsilat: v.seciliTahsilat, alinanTahsilatKaynak: v.seciliTahsilatKaynak || null, toplamRisk}));
  });

  const {key,dir} = state.fkSort;
  rows.sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

function renderFaturaKontrolDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('faturaKontrolDahaFazlaWrap');
  const info = document.getElementById('faturaKontrolDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

async function renderFaturaKontrolTable(report, resetSayfa=true){
  if(resetSayfa) state.fkGosterilen = MUSTERI_SAYFA_BOYUTU;
  const dateVal = document.getElementById('faturaKontrolDateInput').value;
  const temsilci = document.getElementById('faturaKontrolTemsilciFilter').value;
  const arama = document.getElementById('faturaKontrolSearchInput').value;
  const sortWrap = document.getElementById('faturaKontrolSortWrap');
  const emptyDateMsg = document.getElementById('faturaKontrolEmptyDate');

  if(!dateVal){
    sortWrap.style.display = 'none';
    emptyDateMsg.style.display = 'block';
    document.getElementById('faturaKontrolCount').textContent = '';
    return;
  }
  emptyDateMsg.style.display = 'none';
  sortWrap.style.display = 'block';

  const rows = await computeFaturaKontrolRows(report, dateVal, temsilci, arama);
  document.getElementById('faturaKontrolCount').textContent = rows.length.toLocaleString('tr-TR') + ' müşteri';
  const list = document.getElementById('faturaKontrolTbody');
  if(!rows.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Seçili tarihte istenilen teslim tarihi veya belge tarihi eşleşen kayıt bulunamadı.</div>`;
    renderFaturaKontrolDahaFazlaBtn(0, 0);
    return;
  }
  const gosterilecekSayi = Math.min(state.fkGosterilen, rows.length);
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
            ${isRiskliMusteri(m)?'<span class="badge dikkat" title="Ortalama vade '+VADE_RISK_ESIGI+' gün ve üzeri"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Dikkat</span>':''}
          </div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(m.temsilci)}</div>
        </div>
        <span class="htk-badge-vade" style="border-color:${vadeRenk.renk};"><span class="htk-badge-vade-num" style="color:${vadeRenk.renk};">${Math.round(m.avgVadeGun)||0}</span><span class="htk-badge-vade-lbl" style="color:${vadeRenk.renk};">Ort. Vade</span></span>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${TL(m.kalanBorc)}</span>
      </div>
      <div class="htk-inline-stats">
        <div class="htk-stat-item"><span class="l">Sipariş</span><span class="v${m.seciliSiparis>0?' c-siparis':' zero'}">${m.seciliSiparis>0?TL(m.seciliSiparis):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Tahsilat</span><span class="v${m.seciliTahsilat>0?' c-tahsilat':' zero'}">${m.seciliTahsilat>0?TL(m.seciliTahsilat):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Önceki Gün Tahsilatı</span><span class="v${m.oncekiGunTahsilat>0?' c-tahsilat':' zero'}">${m.oncekiGunTahsilat>0?TL(m.oncekiGunTahsilat):'—'}</span></div>
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

  renderFaturaKontrolDahaFazlaBtn(gosterilecekSayi, rows.length);
}

async function renderFaturaKontrolView(report, zorla){
  populateTemsilciFilter(report.musteriler, 'faturaKontrolTemsilciFilter');
  document.getElementById('faturaKontrolArsivBilgi').textContent = 'Buluttan yükleniyor…';
  await faturaArsivYenile(zorla);
  await renderFaturaKontrolArsivBilgi();
  await renderFaturaKontrolTable(report);
}

async function renderFaturaKontrolArsivBilgi(){
  const arsiv = state.faturaArsivCache || {};
  const gunler = Object.keys(arsiv);
  const el = document.getElementById('faturaKontrolArsivBilgi');
  if(!cloudEnabled()){
    el.textContent = '⚠️ Bulut (Firebase) yapılandırılmadığı için bu arşiv hiçbir yerde kalıcı olarak saklanamıyor; yalnızca bu oturumda görünür.';
    return;
  }
  if(!gunler.length){
    el.textContent = 'Buluttaki arşivde henüz veri yok. "Raporu Oluştur" ile her yeni yükleme yaptığınızda o günün verisi buluta eklenir. ☁️';
    return;
  }
  const birlesik = await faturaKontrolArsivBirlestirCached(arsiv);
  const bugunKeyBilgi = dateKeyLocal(turkiyeBugun());
  // Müşteri Snapshot (Kalan Borç/Vade/Risk trend grafiğinin kaynağı) SADECE o gün "Raporu
  // Oluştur"a basılırsa yazılır — bugün henüz basılmadıysa kullanıcıyı bilgilendir (bkz.
  // renderTemsilciKarnesiView/Trend Analiz'deki aynı sınırlamayla ilgili notlar).
  const bugunVarMi = !!(arsiv[bugunKeyBilgi] && arsiv[bugunKeyBilgi].musteriSnapshot && arsiv[bugunKeyBilgi].musteriSnapshot.length);
  const bugunUyarisi = bugunVarMi ? '' : ' <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bugün için henüz "Raporu Oluştur"a basılmadı — Kalan Borç/Vade/Risk trend grafiğinde bugünün verisi eksik kalacak.';
  el.textContent = `Buluttaki arşivde veri var (${fmtDate(new Date(birlesik.ilkGun))} – ${fmtDate(new Date(birlesik.sonGun))}) · ${birlesik.siparisArsiv.length.toLocaleString('tr-TR')} sipariş, ${birlesik.tahsilatArsiv.length.toLocaleString('tr-TR')} tahsilat, ${birlesik.faturaArsiv.length.toLocaleString('tr-TR')} fatura kaydı. ☁️` + bugunUyarisi;
}

document.getElementById('faturaKontrolArsivYenileBtn').addEventListener('click', async ()=>{
  await renderFaturaKontrolView(state.report || {musteriler:[]}, true);
});

document.getElementById('faturaKontrolArsivSikistirBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('faturaKontrolArsivSikistirBtn');
  const orijinalMetin = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sıkıştırılıyor…';
  try{
    // Sıkıştırma tüm geçmişi taradığından, önbellekte yalnızca kısmi (örn. tek bir aya ait) veri
    // olma ihtimaline karşı burada TAM bir tazeleme zorlanır — aksi halde başka günlerdeki gölge
    // kayıtlar yanlışlıkla "silinmiş" gibi hesaba katılıp buluttan kalıcı olarak silinebilir.
    const arsiv = await faturaArsivYenile(true) || {};
    if(!Object.keys(arsiv).length){ await renderFaturaKontrolArsivBilgi(); return; }
    const {arsiv: sikistirilmisArsiv, silinenSatir} = faturaKontrolArsivSikistir(arsiv);
    if(silinenSatir===0){
      toastGoster('success', 'Arşiv zaten güncel', 'Temizlenecek gölge kayıt bulunamadı.');
    }else{
      // Sıkıştırma yalnızca bazı günlerin içeriğini (dizi elemanlarını) küçültür, hiçbir gün
      // anahtarını eklemez/kaldırmaz. Bu yüzden tüm ağacı yeniden PUT etmek yerine, öncekiyle
      // sonraki hali karşılaştırıp SADECE gerçekten değişen günleri buluta PATCH ediyoruz.
      if(cloudEnabled()){
        const fark = faturaKontrolArsivGunFarkiniBul(arsiv, sikistirilmisArsiv);
        // Buluta yazılırken de musteriSnapshot kısaltılmış alan adlarıyla gönderilir (bkz.
        // faturaKontrolArsivineKaydetVeSenkronizeEt'teki açıklama) — bu sıkıştırma sırasında da
        // aynı hacim tasarrufu korunur.
        Object.keys(fark).forEach(gun=>{
          const deger = fark[gun];
          if(deger && deger.musteriSnapshot){
            fark[gun] = Object.assign({}, deger, {musteriSnapshot: musteriSnapshotKisalt(deger.musteriSnapshot)});
          }
        });
        await saveFaturaKontrolArsivGunleriToCloud(fark);
      }
      state.faturaArsivCache = sikistirilmisArsiv;
      saveFaturaKontrolArsivToLocal(state.faturaArsivCache).catch(()=>{});
      toastGoster('success', silinenSatir.toLocaleString('tr-TR') + ' kayıt temizlendi', 'Gölge tahsilat/fatura kayıtları, iptal/red edilen sipariş numaralarının tüm kayıtları ve mükerrer siparişler arşivden kalıcı olarak silindi.');
    }
    await renderFaturaKontrolArsivBilgi();
    if(state.report) await renderFaturaKontrolTable(state.report);
  }catch(err){
    console.error('Arşiv temizlenemedi:', err);
    alert('Arşiv temizlenirken bir hata oluştu: ' + err.message);
  }finally{
    btn.disabled = false; btn.textContent = orijinalMetin;
  }
});

const debouncedRenderFaturaKontrolTable = debounce(()=>renderFaturaKontrolTable(state.report));
wireSearchInput('faturaKontrolSearchInput', 'faturaKontrolSearchClearBtn', debouncedRenderFaturaKontrolTable);
wireSearchClear('faturaKontrolSearchInput', 'faturaKontrolSearchClearBtn', ()=>renderFaturaKontrolTable(state.report));
document.getElementById('faturaKontrolDateInput').addEventListener('change', ()=>renderFaturaKontrolTable(state.report));
document.getElementById('faturaKontrolTemsilciFilter').addEventListener('change', ()=>renderFaturaKontrolTable(state.report));

const faturaKontrolSortSelect = document.getElementById('faturaKontrolSortSelect');
const faturaKontrolSortDirBtn = document.getElementById('faturaKontrolSortDirBtn');
faturaKontrolSortSelect.value = state.fkSort.key;
faturaKontrolSortDirBtn.textContent = state.fkSort.dir===1 ? '↑' : '↓';
faturaKontrolSortSelect.addEventListener('change', ()=>{
  state.fkSort.key = faturaKontrolSortSelect.value;
  renderFaturaKontrolTable(state.report);
});
faturaKontrolSortDirBtn.addEventListener('click', ()=>{
  state.fkSort.dir *= -1;
  faturaKontrolSortDirBtn.textContent = state.fkSort.dir===1 ? '↑' : '↓';
  renderFaturaKontrolTable(state.report);
});
document.getElementById('faturaKontrolDahaFazlaBtn').addEventListener('click', ()=>{
  state.fkGosterilen += MUSTERI_SAYFA_BOYUTU;
  renderFaturaKontrolTable(state.report, false);
});

// computeMusteriAylikOzetPeriyot(musteri, ayPenceresi)
// ----------------------------------------------------------------------------
// REVİZYON GEREKÇESİ (kullanıcı talebiyle): Eski computeMusteriAylikOzet iki ayrı mantık
// hatası taşıyordu:
//   1) SEZONSALLIK: Tüm arşiv (12+ ay) tek düz ortalamaya indirgeniyordu — sezonluk bir
//      müşteride (örn. yılın 6 ayı düşük, 6 ayı yüksek hacim) bu, hem düşük hem yüksek
//      sezonu birbirine karıştırıp yanıltıcı tek bir sayı üretiyordu. ÇÖZÜM: fonksiyon artık
//      bir `ayPenceresi` parametresi alır (3/6/12) ve SADECE o pencereye düşen fatura/tahsilat
//      kayıtlarını kullanır — üç pencere ayrı ayrı hesaplanıp yan yana karşılaştırılabilir.
//   2) DÖNÜŞ SÜRESİ FORMÜLÜ: Eski `geriDonusGun = (aylikFatura/aylikTahsilat)*30` bir akış
//      ORANIYDI, gerçek bir tahsilat vadesi (DSO) değildi. Eski bakiyenin o ay kapatılması
//      tahsilatı yapay şişirip "hızlı dönüş" gibi gösterebiliyor, sezon başında fatura hızlı
//      artıp tahsilat henüz yetişmediğinde de "yavaş dönüş" gibi gösterip yanıltabiliyordu.
//      ÇÖZÜM: Artık şirket geneli DSO Trendi'nde kullanılan AYNI yöntemle — açık faturaların
//      KALAN BORÇ ağırlıklı ortalama yaşı (bkz. js/03-veri-yukleme-ve-senkron.js m.avgVadeGun
//      hesabı) — gerçek "şu an elde kaç günlük bekleyen bakiye var" sorusuna cevap verir.
//      state.report.musteriler[].invoices üzerinden, o pencerede kesilmiş faturaların kalan
//      borcu × fatura yaşı ağırlıklı ortalaması alınır.
// ----------------------------------------------------------------------------
async function computeMusteriAylikOzetPeriyot(musteri, ayPenceresi){
  const birlesik = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache || {});
  const simdi = Date.now();
  const pencereBaslangic = ayPenceresi==null ? -Infinity : simdi - ayPenceresi*30*86400000;

  const faturalar = birlesik.faturaArsiv.filter(r=>{
    if(r.musteri!==musteri || !r.faturaTarihi) return false;
    const t = new Date(r.faturaTarihi).getTime();
    return t>=pencereBaslangic && t<=simdi;
  });
  // DEVİR BAKİYE AKTARIM — kullanıcı kararı (17.07.2026): Tahsilat Dökümü'nde Belge Türü='Devir
  // Bakiye Aktarım' olan satırlar bir tahsilat değil, kendi Belge Tarihi'nde bir BORÇ/fatura
  // kaydıdır (bkz. 01-cekirdek-ve-arsiv.js: devirBakiyeArsiviniOku/Birlestir). Bu kayıtlar da
  // normal faturalarla AYNI şekilde pencereye ve müşteriye göre süzülüp `faturalar` listesine
  // eklenir — böylece Dönüş/Ortalama Vade hesaplarında gerçek bir borç olarak sayılırlar.
  Object.values(state.devirBakiyeArsivi||{}).forEach(r=>{
    if(r.musteri!==musteri || !r.faturaTarihi) return;
    const t = new Date(r.faturaTarihi).getTime();
    if(t>=pencereBaslangic && t<=simdi) faturalar.push(r);
  });

  // TAHSİLAT DÖKÜMÜ — kendi bağımsız kalıcı arşivi state.tahsilatArsivi (belge no bazlı) okunur.
  const tumTahsilatKayitlari = Object.values(state.tahsilatArsivi||{}).filter(r=>{
    if(r.musteriKod!==musteri || !r.tarih) return false;
    const t = new Date(r.tarih).getTime();
    return t>=pencereBaslangic && t<=simdi;
  });
  const tahsilatlarArsiv = tumTahsilatKayitlari
    .filter(r=> r.tahsilatKategori==='Normal' || r.tahsilatKategori==='Odeme' || r.tahsilatKategori==='Virman')
    .map(r=>({musteri:r.musteriKod, belgeTarihi:r.tarih, tutar:r.tutar, tahsilatTuru:r.odemeEtiketi}));
  const tahsilatDokumuHakedisleri = tumTahsilatKayitlari
    .filter(r=> r.tahsilatKategori==='Hakedis')
    .map(r=>({musteri:r.musteriKod, belgeTarihi:r.tarih, tutar:r.tutar, __hakedis:true}));
  const hakedisTahsilatlari = (birlesik.bayiHakedisArsiv || [])
    .filter(r=>{
      if(r.musteri!==musteri || !r.tahsilatTarihi) return false;
      const t = new Date(r.tahsilatTarihi).getTime();
      return t>=pencereBaslangic && t<=simdi;
    })
    .map(r=>({musteri:r.musteri, belgeTarihi:r.tahsilatTarihi, tutar:r.tutar, __hakedis:true}))
    .concat(tahsilatDokumuHakedisleri);
  const toplamHakedisTahsilat = hakedisTahsilatlari.reduce((a,b)=>a+(b.tutar||0),0);

  // KULLANICI KARARI (düzeltme, geri alındı): Tahsil edilmiş çek/senedin Aylık Trend Analizi'ndeki
  // pencereye (Son 3/6/12 Ay) girip girmediği belgeTarihi'ne (çekin/senedin KESİLDİĞİ tarih) göre
  // DEĞİL, vadeTarihi'ne (ÖDENMESİ gereken tarih) göre belirlenir — bu, önceden böyle çalışıyordu
  // ve kullanıcı isteğiyle bu davranışa geri dönülmüştür. Örnek: 18.06.2026'da kesilmiş ama vadesi
  // 15.07.2026 olan bir çek, "Son 3 Ay" penceresinde vade tarihine göre değerlendirilir.
  const tahsilEdilenCekSenetler = Object.values(state.cekSenetArsivi||{})
    .filter(r=>{
      if(r.musteriKod!==musteri || r.durum!=='tahsilEdildi' || !r.vadeTarihi) return false;
      const t = new Date(r.vadeTarihi).getTime();
      return t>=pencereBaslangic && t<=simdi;
    })
    .map(r=>({musteri: r.musteriKod, belgeTarihi: r.vadeTarihi, tutar: r.tutar, tahsilatTuru: r.tahsilatTuru, __cekSenet: true}));
  const toplamCekSenetTahsilat = tahsilEdilenCekSenetler.reduce((a,b)=>a+(b.tutar||0),0);

  // İADE GRUBU (Bozuk/Sağlam/Depozito İade Faturası) — AYRI KAYNAK: Fatura Kontrol'deki
  // renderMusteriDetail/eslesen mantığıyla AYNI sebepten (bkz. yukarıdaki not), bu kredi türü
  // state.tahsilatArsivi'nde DEĞİL, birlesik.tahsilatArsiv (state.faturaArsivCache günlük arşivi)
  // içinde 'FaturaIade' etiketiyle durur — bu yüzden AYRICA buradan okunması gerekir, aksi halde
  // "İade/Depozito" KPI'sı (toplamIadeDepozito) ve Müşteri Analiz Modalı'ndaki İade/Depozito
  // segmenti her zaman 0 kalır (yukarıdaki tahsilatlarArsiv bu satırları hiç içermez).
  const iadeGrubuTahsilatlari = (birlesik.tahsilatArsiv || [])
    .filter(r=>{
      if(r.musteri!==musteri || r.formatKaynagi!=='FaturaIade' || !r.belgeTarihi) return false;
      const t = new Date(r.belgeTarihi).getTime();
      return t>=pencereBaslangic && t<=simdi;
    })
    .map(r=>({musteri:r.musteri, belgeTarihi:r.belgeTarihi, tutar:r.tutar, formatKaynagi:'FaturaIade'}));

  const tahsilatlar = tahsilatlarArsiv.concat(hakedisTahsilatlari).concat(tahsilEdilenCekSenetler).concat(iadeGrubuTahsilatlari);
  if(!faturalar.length && !tahsilatlar.length) return null;

  // Pencere gün sayısı: sabit ayPenceresi*30 kullanılır (değişken "en eski/en yeni kayıt
  // aralığı" YERİNE) — böylece 3/6/12 ay pencereleri birbirleriyle DOĞRU kıyaslanabilir aynı
  // paydaya (gerçek takvim günü) sahip olur; veri seyrekse pencere yapay küçülmez.
  const gunSayisi = ayPenceresi==null
    ? Math.max(1, Math.round((simdi - Math.min(...faturalar.map(r=>new Date(r.faturaTarihi).getTime()).concat(tahsilatlar.map(r=>new Date(r.belgeTarihi).getTime()))))/86400000)+1)
    : ayPenceresi*30;
  const aySayisi = Math.max(1, gunSayisi/30);

  const toplamFatura = faturalar.reduce((a,b)=>a+(b.tutar||0),0);
  const toplamLitre = faturalar.reduce((a,b)=>a+(b.litre||0),0);
  const toplamTahsilat = tahsilatlar.reduce((a,b)=>a+(b.tutar||0),0);

  // TAHSİLAT TÜRÜ DÖKÜMÜ — 5 KATEGORİ (kullanıcı talebi): Nakit/Havale, Kredi Kartı, Hakediş,
  // Çek/Senet, İade/Depozito. odemeEtiketi gerçek ödeme tipini taşır (bkz.
  // tahsilatBankaAltEtiketi): 'Nakit', 'Banka havalesi', 'Kredi Kartı(...)' vb.
  // NOT: Depozito Tahsilat dosyası (ayrı kaynak) kaldırıldı — Bozuk/Sağlam/Depozito İade Faturası
  // artık TEK bir İade Grubu olarak Fatura Dökümü'nden 'FaturaIade' etiketiyle geliyor. Set hâlâ
  // 'DepozitoTahsilat'ı içerir (geriye dönük uyumluluk — arşivde henüz temizlenmemiş eski kayıtlar
  // varsa onları da "İade/Depozito" olarak saymaya devam etsin diye), ama yeni veride hiç üretilmez.
  const KREDI_ETIKETLERI = new Set(['FaturaIade', 'DepozitoTahsilat']); // İade/Depozito
  const toplamIadeDepozito = tahsilatlar.reduce((a,b)=> a + (KREDI_ETIKETLERI.has(b.formatKaynagi) ? (b.tutar||0) : 0), 0);
  const toplamCekSenet = tahsilatlar.reduce((a,b)=> a + ((b.tahsilatTuru==='Cek' || b.tahsilatTuru==='Senet' || b.__cekSenet) ? (b.tutar||0) : 0), 0);
  const toplamKrediKarti = tahsilatlar.reduce((a,b)=> a + (!b.__hakedis && !KREDI_ETIKETLERI.has(b.formatKaynagi) && /kredi kart/i.test(String(b.tahsilatTuru||'')) ? (b.tutar||0) : 0), 0);
  const toplamNakitHavale = tahsilatlar.reduce((a,b)=>{
    if(b.__hakedis || KREDI_ETIKETLERI.has(b.formatKaynagi)) return a;
    if(b.tahsilatTuru==='Cek' || b.tahsilatTuru==='Senet' || b.__cekSenet) return a;
    if(/kredi kart/i.test(String(b.tahsilatTuru||''))) return a;
    return a + (b.tutar||0);
  }, 0);

  const aylikFatura = toplamFatura / aySayisi;
  const aylikLitre = toplamLitre / aySayisi;
  const aylikTahsilat = toplamTahsilat / aySayisi;
  const aylikNakitHavale = toplamNakitHavale / aySayisi;
  const aylikKrediKarti = toplamKrediKarti / aySayisi;
  const aylikHakedis = toplamHakedisTahsilat / aySayisi;
  const aylikCekSenet = toplamCekSenet / aySayisi;
  const aylikIadeDepozito = toplamIadeDepozito / aySayisi;

  // DÖNÜŞ SÜRESİ — AĞIRLIKLI ORTALAMA TARİH FARKI YÖNTEMİ (kritik düzeltme #4 — kullanıcı
  // tarafından gerçek Excel verisiyle (SAPUI5 dışa aktarımı, TOPLAM BAKİYE/TOPLAM TAHSİLAT/
  // KALAN BAKİYE alanları) doğrulanan NİHAİ yöntem, 23,32g manuel hesapla birebir teyit edildi):
  // Önceki FIFO ÇİFT EŞLEŞTİRME denemesi (her tahsilatı sırayla en eski açık faturayla eşleştirip
  // eşleşen tutarların gün farkını ağırlıklı ortalamak) sıra bağımlı bir çarpıklık taşıyordu —
  // özellikle POS/kredi kartı süpürmesi gibi fatura kesimiyle NEREDEYSE AYNI GÜN kapanan büyük
  // hacimli işlemler ağırlığı ele geçirip, hâlâ açık duran büyük bakiyeleri gölgede bırakarak
  // gerçek dışı düşük (örn. "4 gün") sonuçlar üretiyordu.
  // NİHAİ ÇÖZÜM (kullanıcı tarafından tarif edildi, Excel'deki SAPUI5 dışa aktarımıyla
  // doğrulandı): Çift eşleştirme YERİNE, iki ayrı TUTAR AĞIRLIKLI ORTALAMA TARİH hesaplanır —
  //   1) Borç bakiyesi varsa (toplam fatura > toplam tahsilat): kalan bakiye tutarı kadarını
  //      EN SON kesilen faturalardan (tarihe göre geriye doğru) düş — bu düşülen kısım "henüz
  //      karşılığı beklenen / faturalanmamış" kabul edilir ve hesaba HİÇ KATILMAZ. Geriye kalan
  //      (tamamen tahsilatla kapanmış) fatura kısmının TUTAR AĞIRLIKLI ORTALAMA TARİHİ alınır.
  //   2) Alacak bakiyesi varsa (toplam tahsilat > toplam fatura, yani fazla ödeme): bu fazlalık
  //      kadar tutarında GÜNCEL TARİHLİ bir "sanal fatura" eklenir (gün farkı = 0), böylece o
  //      fazla tahsilat ortalamayı yapay şekilde şişirmez/bozmaz.
  //   3) TÜM tahsilatların (kırpma uygulanmadan) TUTAR AĞIRLIKLI ORTALAMA TARİHİ ayrıca alınır.
  //   4) geriDonusGun = (Ort. Tahsilat Tarihi) − (Ort. Kapanmış Fatura Tarihi), gün cinsinden.
  //
  // AÇILIŞ BAKİYESİ DÜZELTMESİ (kritik düzeltme #5 — kullanıcı tarafından 3 aylık pencere için
  // Excel'de doğrulandı, 19,79g manuel hesapla birebir teyit edildi): Kısa pencerelerde (3/6 ay),
  // pencere BAŞLANGICINDAN ÖNCE zaten var olan açık bakiye hesaba katılmıyordu. Bu durumda o eski
  // bakiyenin pencere içinde yapılan tahsilatları, penceredeki faturayı aşan bir "fazla ödeme"
  // gibi görünüyor ve yukarıdaki adım 2 gereği BUGÜN tarihli (gün farkı 0) sanal faturaya
  // dönüştürülüyordu — bu da gerçek dönüşü yapay şekilde 0'a çekiyordu (örn. Kaplan Gıda 2'de
  // 3 aylık pencere -17,5g/0g çıkıyordu, oysa açılış bakiyesi dahil edilince 19,79g çıkıyor).
  // ÇÖZÜM: pencere başlangıcından önceki tüm fatura/devir-bakiye tutarından, yine pencere
  // başlangıcından önceki tüm tahsilat tutarı çıkarılır; kalan pozitifse bu, pencere BAŞLANGIÇ
  // TARİHLİ bir "açılış bakiyesi" faturası olarak SADECE bu Dönüş hesabına eklenir (KPI'lardaki
  // toplamFatura/aylikFatura rakamlarına DAHİL EDİLMEZ — onlar hâlâ sadece pencereye tarihli
  // gerçek faturaları sayar).
  let acilisBakiyesi = 0;
  if(ayPenceresi != null){
    const faturaOncesiToplam = birlesik.faturaArsiv
      .filter(r=> r.musteri===musteri && r.faturaTarihi && new Date(r.faturaTarihi).getTime() < pencereBaslangic)
      .reduce((a,b)=>a+(b.tutar||0), 0)
      + Object.values(state.devirBakiyeArsivi||{})
        .filter(r=> r.musteri===musteri && r.faturaTarihi && new Date(r.faturaTarihi).getTime() < pencereBaslangic)
        .reduce((a,b)=>a+(b.tutar||0), 0);

    const tahsilatOncesiNormal = Object.values(state.tahsilatArsivi||{})
      .filter(r=> r.musteriKod===musteri && r.tarih && new Date(r.tarih).getTime() < pencereBaslangic
        && (r.tahsilatKategori==='Normal' || r.tahsilatKategori==='Odeme' || r.tahsilatKategori==='Virman'))
      .reduce((a,b)=>a+(b.tutar||0), 0);
    const tahsilatOncesiHakedisDokum = Object.values(state.tahsilatArsivi||{})
      .filter(r=> r.musteriKod===musteri && r.tarih && new Date(r.tarih).getTime() < pencereBaslangic && r.tahsilatKategori==='Hakedis')
      .reduce((a,b)=>a+(b.tutar||0), 0);
    const tahsilatOncesiHakedis = (birlesik.bayiHakedisArsiv || [])
      .filter(r=> r.musteri===musteri && r.tahsilatTarihi && new Date(r.tahsilatTarihi).getTime() < pencereBaslangic)
      .reduce((a,b)=>a+(b.tutar||0), 0) + tahsilatOncesiHakedisDokum;
    // Yukarıdaki (pencere içi) çek/senet filtresiyle TUTARLI olması için burada da vadeTarihi
    // kullanılır (kullanıcı kararı — bkz. yukarıdaki tahsilEdilenCekSenetler notu). Aynı kayıt
    // burada "belgeTarihi'ne göre pencere öncesi", yukarıda "vadeTarihi'ne göre pencere içi"
    // sayılırsa, bir tahsilat ne açılış bakiyesine ne pencere içi tahsilata dahil olmaz ya da
    // her ikisine birden girip çift sayılabilirdi.
    const tahsilatOncesiCekSenet = Object.values(state.cekSenetArsivi||{})
      .filter(r=> r.musteriKod===musteri && r.durum==='tahsilEdildi' && r.vadeTarihi && new Date(r.vadeTarihi).getTime() < pencereBaslangic)
      .reduce((a,b)=>a+(b.tutar||0), 0);
    const tahsilatOncesiIade = (birlesik.tahsilatArsiv || [])
      .filter(r=> r.musteri===musteri && r.formatKaynagi==='FaturaIade' && r.belgeTarihi && new Date(r.belgeTarihi).getTime() < pencereBaslangic)
      .reduce((a,b)=>a+(b.tutar||0), 0);

    const tahsilatOncesiToplam = tahsilatOncesiNormal + tahsilatOncesiHakedis + tahsilatOncesiCekSenet + tahsilatOncesiIade;
    acilisBakiyesi = Math.max(0, faturaOncesiToplam - tahsilatOncesiToplam);
  }

  let geriDonusGun = null;
  let geriDonusYaklasik = false;
  {
    const fifoFaturalarTumu = faturalar
      .filter(r=> r.faturaTarihi && r.tutar>0)
      .map(r=>({tarih: new Date(r.faturaTarihi).getTime(), kalan: r.tutar}))
      .sort((a,b)=> a.tarih-b.tarih);
    if(acilisBakiyesi > 0.01){
      fifoFaturalarTumu.unshift({tarih: pencereBaslangic, kalan: acilisBakiyesi});
    }
    const fifoTahsilatlar = tahsilatlar
      .filter(r=> r.belgeTarihi && r.tutar>0)
      .map(r=>({tarih: new Date(r.belgeTarihi).getTime(), tutar: r.tutar}))
      .sort((a,b)=> a.tarih-b.tarih);

    const toplamFaturaTutari = fifoFaturalarTumu.reduce((a,b)=>a+b.kalan, 0);
    const toplamTahsilatTutari = fifoTahsilatlar.reduce((a,b)=>a+b.tutar, 0);
    const netBakiye = toplamFaturaTutari - toplamTahsilatTutari;

    // Hesaba katılacak fatura listesi (kalan bakiye kadarı en yeni faturalardan düşülüp
    // çıkarılmış hali). Alacak bakiyesi durumunda ise fazla tahsilat kadar güncel tarihli bir
    // "sanal fatura" bu listeye eklenir.
    let fifoFaturalar;
    if(netBakiye > 0.01){
      // Borç bakiyesi: kalan bakiyeyi en son kesilen faturalardan düşerek tamamen çıkar.
      const enYeniden = fifoFaturalarTumu.slice().sort((a,b)=> b.tarih-a.tarih);
      let dusulecek = netBakiye;
      for(const f of enYeniden){
        if(dusulecek <= 0.01) break;
        const dus = Math.min(dusulecek, f.kalan);
        f.kalan -= dus;
        dusulecek -= dus;
      }
      fifoFaturalar = fifoFaturalarTumu.filter(f=> f.kalan > 0.01).sort((a,b)=> a.tarih-b.tarih);
    } else if(netBakiye < -0.01){
      // Alacak bakiyesi: fazla tahsilat kadar güncel tarihli sanal fatura ekle (gün farkı 0).
      fifoFaturalar = fifoFaturalarTumu.slice();
      fifoFaturalar.push({tarih: simdi, kalan: -netBakiye});
      fifoFaturalar.sort((a,b)=> a.tarih-b.tarih);
    } else {
      fifoFaturalar = fifoFaturalarTumu.slice();
    }

    // AĞIRLIKLI ORTALAMA TARİH FARKI: çift eşleştirme yerine iki tutar-ağırlıklı ortalama tarih
    // arasındaki fark alınır (bkz. yukarıdaki NİHAİ ÇÖZÜM notu, adım 3-4).
    const toplamKapanmisBorc = fifoFaturalar.reduce((a,b)=>a+b.kalan, 0);
    if(toplamKapanmisBorc > 0.01 && toplamTahsilatTutari > 0.01){
      const agirlikliFaturaTarihToplami = fifoFaturalar.reduce((a,b)=>a + b.kalan*b.tarih, 0);
      const agirlikliTahsilatTarihToplami = fifoTahsilatlar.reduce((a,b)=>a + b.tutar*b.tarih, 0);
      const ortFaturaTarihi = agirlikliFaturaTarihToplami / toplamKapanmisBorc;
      const ortTahsilatTarihi = agirlikliTahsilatTarihToplami / toplamTahsilatTutari;
      geriDonusGun = Math.max(0, (ortTahsilatTarihi - ortFaturaTarihi) / 86400000);
      // Kapanmış fatura toplamı, pencere içi toplam faturadan (+ varsa açılış bakiyesinden)
      // belirgin farklıysa (yani kırpma sonrası kalan kısım pencere dışı faturalarla da
      // örtüşüyorsa) sonuç yaklaşık sayılır.
      const kiyasPayi = toplamFatura + acilisBakiyesi;
      geriDonusYaklasik = kiyasPayi > 0.01 && Math.abs(toplamKapanmisBorc - kiyasPayi) > kiyasPayi*0.02;
    }
  }

  return {
    ayPenceresi, gunSayisi, aySayisi,
    toplamFatura, toplamLitre, toplamTahsilat,
    aylikFatura, aylikLitre, aylikTahsilat,
    aylikNakitHavale, aylikKrediKarti, aylikHakedis, aylikCekSenet, aylikIadeDepozito,
    toplamNakitHavale, toplamKrediKarti, toplamHakedisTahsilat, toplamCekSenet, toplamIadeDepozito,
    geriDonusGun, geriDonusYaklasik,
  };
}

// Geriye dönük uyumluluk: eski çağıranlar (varsa) hâlâ tüm-arşiv tek pencereli sonucu alır.
async function computeMusteriAylikOzet(musteri){
  return computeMusteriAylikOzetPeriyot(musteri, null);
}

// Not: fmtTrendDeger burada değil, dosyanın ilerisinde (yüzde birimini de destekleyen üst küme
// versiyonuyla) tek yerden tanımlanıyor — önceden burada da ayrı (ve eksik) bir kopyası vardı,
// JS'in fonksiyon hoisting kuralları yüzünden ikisi de aynı isimde olduğundan ikincisi sessizce
// birincisinin yerini alıyordu; kafa karıştırmaması için tekilleştirildi.
let _trendMeasureCtx = null;
function trendTextWidth(text, font){
  if(!_trendMeasureCtx) _trendMeasureCtx = document.createElement('canvas').getContext('2d');
  _trendMeasureCtx.font = font;
  return _trendMeasureCtx.measureText(text).width;
}

function renderTrendChart(containerId, seri, key, renk, birim){
  const el = document.getElementById(containerId);
  if(!seri.length){
    el.innerHTML = '<div class="empty-state" style="padding:24px 10px;">Veri yok</div>';
    return;
  }
  const W = 520, H = 100, padR = 16, padT = 12, padB = 20;
  const values = seri.map(s=>s[key]);
  let minV = Math.min(...values), maxV = Math.max(...values);
  if(minV === maxV){ minV -= Math.max(1, Math.abs(minV)*0.1); maxV += Math.max(1, Math.abs(maxV)*0.1); }
  const gridVals = [maxV, (minV+maxV)/2, minV];
  const gridLabels = gridVals.map(v=>fmtTrendDeger(v, birim));

  // Sol boşluğu en uzun eksen etiketine göre dinamik hesapla — değer noktası/çizgisiyle
  // eksen yazısının üst üste binmesini engeller.
  const font = "10px Inter, system-ui, sans-serif";
  const maxLabelWidth = Math.max(...gridLabels.map(t=>trendTextWidth(t, font)), 30);
  const padL = Math.ceil(maxLabelWidth) + 20;

  const xStep = seri.length > 1 ? (W-padL-padR)/(seri.length-1) : 0;
  const yScale = v => (H-padB) - ((v-minV)/(maxV-minV))*(H-padT-padB);
  const points = seri.map((s,i)=> [padL + i*xStep, yScale(s[key])]);
  const pathD = points.map((p,i)=> (i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const areaD = `${pathD} L${points[points.length-1][0].toFixed(1)},${(H-padB).toFixed(1)} L${points[0][0].toFixed(1)},${(H-padB).toFixed(1)} Z`;

  const gridLines = gridVals.map(v=>{
    const y = yScale(v).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--line-soft)" stroke-width="1"></line>`;
  }).join('');
  const axisLine = `<line x1="${padL}" y1="${(H-padB).toFixed(1)}" x2="${W-padR}" y2="${(H-padB).toFixed(1)}" stroke="var(--line)" stroke-width="1"></line>`;

  const circles = points.map((p,i)=>{
    const s = seri[i];
    // Bu gün bir Bozuk İade Faturası / Depozito Tahsilatı kredisi varsa (seri verisinde krediGunuMu/krediTutari alanları doluysa),
    // noktayı farklı bir görselle (içi boş, kesikli halka) işaretle — kullanıcı "bu gün neden
    // sıçradı/düştü" sorusunu grafiğe bakarak anlayabilsin.
    const tooltipEk = s.krediGunuMu ? (' — bu gün ' + TL(s.krediTutari) + ' Bozuk İade / Depozito Tahsilatı var') : '';
    const marker = s.krediGunuMu
      ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="none" stroke="${renk}" stroke-width="1.5" stroke-dasharray="2,2"></circle>
         <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="1.8" fill="${renk}"></circle>`
      : `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--surface)" stroke="${renk}" stroke-width="1.5"></circle>
         <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="1.8" fill="${renk}"></circle>`;
    return `
    <g>
      <title>${fmtDate(new Date(s.tarih))}: ${fmtTrendDeger(s[key], birim)}${tooltipEk}</title>
      ${marker}
    </g>`;
  }).join('');

  const gridY = gridVals.map((v,i)=>`<text x="0" y="${(yScale(v)+3).toFixed(1)}" font-size="10" fill="var(--ink-faint)">${gridLabels[i]}</text>`).join('');
  const xLabels = `<text x="${padL}" y="${H-8}" font-size="10" fill="var(--ink-faint)">${fmtDate(new Date(seri[0].tarih))}</text>` +
    (seri.length>1 ? `<text x="${W-padR}" y="${H-8}" font-size="10" fill="var(--ink-faint)" text-anchor="end">${fmtDate(new Date(seri[seri.length-1].tarih))}</text>` : '');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${gridLines}
    <path d="${areaD}" fill="${renk}" opacity="0.08" stroke="none"></path>
    <path d="${pathD}" fill="none" stroke="${renk}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    ${axisLine}
    ${circles}
    ${gridY}
    ${xLabels}
  </svg>`;
}

function updateSearchClearBtn(){ searchClearBtnGuncelle('searchInput', 'searchClearBtn'); }
const debouncedRenderMusteriTable = debounce(()=>renderMusteriTable(state.report));
wireSearchInput('searchInput', 'searchClearBtn', debouncedRenderMusteriTable);
wireSearchClear('searchInput', 'searchClearBtn', ()=>renderMusteriTable(state.report));
document.getElementById('temsilciFilter').addEventListener('change', ()=>{
  renderMusteriTable(state.report);
  renderAgingPanel(state.report);
  refreshGenelKPIs(state.report);
});
document.getElementById('riskFilter').addEventListener('change', ()=>renderMusteriTable(state.report));
document.getElementById('vadeMinInput').addEventListener('input', debounce(()=>renderMusteriTable(state.report)));
document.getElementById('vadeMaxInput').addEventListener('input', debounce(()=>renderMusteriTable(state.report)));

const musteriSortSelect = document.getElementById('musteriSortSelect');
const musteriSortDirBtn = document.getElementById('musteriSortDirBtn');
musteriSortSelect.value = state.sort.key;
musteriSortDirBtn.textContent = state.sort.dir===1 ? '↑' : '↓';
musteriSortSelect.addEventListener('change', ()=>{
  state.sort.key = musteriSortSelect.value;
  renderMusteriTable(state.report);
});
musteriSortDirBtn.addEventListener('click', ()=>{
  state.sort.dir *= -1;
  musteriSortDirBtn.textContent = state.sort.dir===1 ? '↑' : '↓';
  renderMusteriTable(state.report);
});

document.getElementById('musteriDahaFazlaBtn').addEventListener('click', ()=>{
  state.musteriGosterilen += MUSTERI_SAYFA_BOYUTU;
  renderMusteriTable(state.report, false);
});

function renderAging(agingAmount, agingCount){
  const maxAmt = Math.max(...agingAmount.map(a=>a.value), 1);
  const maxCnt = Math.max(...agingCount.map(a=>a.value), 1);
  document.getElementById('agingByAmount').innerHTML = agingAmount.map(a=>`
    <div class="aging-row">
      <div class="aging-label">${a.label}</div>
      <div class="aging-track"><div class="aging-fill" style="width:${(a.value/maxAmt*100).toFixed(1)}%"></div></div>
      <div class="aging-value">${TL(a.value)}</div>
    </div>`).join('');
  document.getElementById('agingByCount').innerHTML = agingCount.map(a=>`
    <div class="aging-row">
      <div class="aging-label">${a.label}</div>
      <div class="aging-track"><div class="aging-fill" style="width:${(a.value/maxCnt*100).toFixed(1)}%"></div></div>
      <div class="aging-value">${a.value.toLocaleString('tr-TR')} müşteri</div>
    </div>`).join('');
}

function renderRepGrid(temsilciler){
  document.getElementById('repGrid').innerHTML = temsilciler.map(r=>`
    <div class="rep-card">
      <div class="rname">${escapeHtml(r.temsilci)}</div>
      <div class="rstat"><span>Müşteri</span><b>${r.musteriSayisi.toLocaleString('tr-TR')}</b></div>
      <div class="rstat"><span>Kalan Borç</span><b>${TL(r.kalanBorc)}</b></div>
      <div class="rstat"><span>Toplam Risk</span><b>${TL(r.toplamRisk)}</b></div>
    </div>`).join('');
}

const YUKLEME_ARSIV_CLOUD_PATH = CLOUD.path + '_yuklemeRaporuArsiv';
const YUKLEME_ARSIV_LOCAL_KEY = 'noktaCariTakip_yuklemeArsiv_v1';

function yuklemeNumber(v){
  if(v===null || v===undefined || v==='') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function yuklemeKod(v){ return String(v===null||v===undefined?'':v).trim(); }

function bankaKisaAdi(banka){
  if(!banka) return '';
  let s = String(banka).replace(/Türkiye Cumhuriyeti/gi,'').replace(/^Türkiye\s+/i,'').trim();
  s = s.replace(/Bankası\s*A\.Ş\.?/i,'Bankası').trim();
  return s || String(banka).trim();
}

function yuklemeOdemeEtiketi(odemeTipi, banka){
  const ot = String(odemeTipi||'').trim();
  if(!ot) return 'Diğer';
  if(ot !== 'Kredi Kartı') return ot;
  const b = String(banka||'').trim();
  if(!b) return 'Kredi Kartı';
  if(/ziraat/i.test(b) || /yapı\s*ve\s*kredi/i.test(b) || /yapı\s*kredi/i.test(b)) return 'Kredi Kartı (SÜPÜRME)';
  const kisa = bankaKisaAdi(b);
  return kisa ? `Kredi Kartı (${kisa})` : 'Kredi Kartı';
}

function yuklemeKolonSirala(etiketler){
  const oncelik = ['Alınan Senet','Banka havalesi','Kredi Kartı','Kredi Kartı (SÜPÜRME)'];
  const kalanKrediKarti = Array.from(etiketler).filter(e=> e.startsWith('Kredi Kartı (') && e!=='Kredi Kartı (SÜPÜRME)').sort((a,b)=>a.localeCompare(b,'tr'));
  const digerler = Array.from(etiketler).filter(e=> !oncelik.includes(e) && !e.startsWith('Kredi Kartı (') && e!=='Nakit').sort((a,b)=>a.localeCompare(b,'tr'));
  const sonuc = [];
  oncelik.forEach(k=>{ if(etiketler.has(k)) sonuc.push(k); });
  kalanKrediKarti.forEach(k=> sonuc.push(k));
  digerler.forEach(k=> sonuc.push(k));
  if(etiketler.has('Nakit')) sonuc.push('Nakit');
  return sonuc;
}

// Genel Toplam özetinde gösterilecek kolon adı: "Kredi Kartı (SÜPÜRME)" -> "Kredi Kartı ( Süpürme )",
// "Kredi Kartı (İş Bankası)" -> "Kredi Kartı ( İş Bankası )". Diğer kolon adları değişmeden döner.
function yuklemeGenelToplamKolonEtiketi(kolon){
  if(kolon === 'Kredi Kartı (SÜPÜRME)') return 'Kredi Kartı ( Süpürme )';
  const m = /^Kredi Kartı \((.+)\)$/.exec(kolon);
  if(m) return `Kredi Kartı ( ${m[1]} )`;
  return kolon;
}

// Temsilci kartlarında ayrıca "Banka havalesi" -> "Havale" olarak kısaltılır (kutucuğa sığması için).
// "Kredi Kartı*" alt kolonları (Süpürme, banka adı vb.) kart tarafında zaten tek bir "Kredi Kartı"
// kolonunda toplandığından (bkz. yuklemeKartKolonlariniIndirge), burada olduğu gibi geçer.
function yuklemeKartKolonEtiketi(kolon){
  if(kolon === 'Banka havalesi') return 'Havale';
  return kolon;
}

// Kart görünümü için: Alınan Çek hariç tutulur, tüm "Kredi Kartı*" alt kolonları (Süpürme, banka adı vb.)
// tek bir "Kredi Kartı" kolonunda birleştirilir (renk tutarlılığı için ilk alt kolonun paletteki
// konumu kullanılır). Diğer kolonlar olduğu gibi ayrı ayrı kalır.
function yuklemeKartKolonlariniIndirge(kolonlar){
  const sonuc = [];
  let krediKartiGrubu = null;
  kolonlar.forEach((k, i)=>{
    if(k === 'Alınan Çek') return;
    if(k.startsWith('Kredi Kartı')){
      if(!krediKartiGrubu){
        krediKartiGrubu = {etiket:'Kredi Kartı', kaynaklar:[k], renkIndex:i};
        sonuc.push(krediKartiGrubu);
      } else {
        krediKartiGrubu.kaynaklar.push(k);
      }
      return;
    }
    sonuc.push({etiket:k, kaynaklar:[k], renkIndex:i});
  });
  return sonuc;
}

// Not: Bu fonksiyon artık yalnızca "en güncel gün"ü değil, Tahsilat Dökümü'ndeki HER takvim
// gününü ayrı ayrı hesaplar. Dönen sonuç {gunler, gunAnahtarlari, enGuncelGunKey} şeklindedir;
// gunler[gunKey] içindeki her kayıt, eskiden tek başına dönen rapor ile AYNI şekle sahiptir
// (tahsilatTarihi, yuklemeTarihi, kolonlar, temsilciler, genelToplamSatiri, kayitZamani), böylece
// mevcut render/arşiv kodları (renderYuklemeTable vb.) değişiklik gerektirmeden çalışmaya devam eder.
function buildYuklemeRaporu(tahsilatRows, yuklemeRows){
  // Not: Tahsilat Dökümü ve Yükleme Raporu artık BAĞIMSIZ olarak yüklenebiliyor (Grup B panelinden
  // tek tek). Bu yüzden ikisinin de aynı anda dolu olması ZORUNLU DEĞİL — yalnızca İKİSİ BİRDEN
  // boşsa (hiç veri yoksa) hata verilir. Sadece biri geldiğinde, aşağıdaki hesaplama zaten "union"
  // (iki dosyanın günlerinin birleşimi) mantığıyla çalıştığı için o tek dosyanın günleri işlenir;
  // diğer taraf boş kalır ve yuklemeGununuArsivIleBirlestir ile arşivdeki mevcut karşı taraf
  // korunur/sonradan birleştirilir.
  if((!tahsilatRows || !tahsilatRows.length) && (!yuklemeRows || !yuklemeRows.length)){
    throw new Error('Tahsilat Dökümü veya Yükleme Raporu\'ndan en az birinde satır bulunamadı.');
  }

  // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT (kullanıcı isteği, eski Format A/B ayrımı tamamen
  // kaldırıldı): Artık tek bir dosya düzeni var — tarih "Tarih", müşteri kodu "Müşteri", tutar
  // "Tutar", temsilci "Satış Temsilcisi" kolonunda.
  // ÖDEME TİPİ BEYAZ LİSTESİ (kullanıcı kararı): ST Tahsilat/Litre ekranına SADECE şu 4 ödeme tipi
  // dahil edilir — Nakit, Kredi Kartı (banka alt kırılımları dahil — bunlar "Banka" kolonundan
  // türetilir ama ham "Ödeme Tipi" her zaman sadece "Kredi Kartı"dır), Banka havalesi, Sanal Pos.
  // Bunların DIŞINDAKİ her şey (Alınan Çek/Alınan Senet — ayrı Çek/Senet Riski modülünden
  // yönetiliyor —, boş/tanımsız Ödeme Tipi, "Diğer" gibi başka herhangi bir ham değer) bu ekrandan
  // TAMAMEN ÇIKARILIR — ne genel toplama ne kolon listesine dahil edilir. Önceden yalnızca Alınan
  // Çek/Alınan Senet hariç tutulup geri kalan HER ŞEY (Virman, Hizmet Alış Fatura/Hakediş dahil,
  // varsa) toplamaya dahil ediliyordu; kullanıcı bunun yalnızca 4 sabit ödeme tipiyle sınırlı
  // olmasını istedi.
  const TAHSILAT_IZIN_VERILEN_ODEME_TIPLERI = new Set(['Nakit','Kredi Kartı','Banka havalesi','Sanal Pos']);
  // BELGE TÜRÜ İŞARET KURALI (Genel Bakış/buildReport'taki tahsilatSatirlariniNormalizeEt ile
  // BİREBİR AYNI mantık — kullanıcı düzeltmesi): Önceden bu ekran Ödeme Tipi'ne bakılmaksızın HER
  // satırın mutlak değerini alıp topluyordu. Bu, "Ödeme" (ve "Virman") türündeki satırların aslında
  // İKİ YÖNLÜ olduğunu (SAP'ta pozitif tutar bir geri ödeme/mahsup olup o günün tahsilatından
  // DÜŞÜLMESİ gerektiğini) göz ardı ediyordu — sonuç olarak Genel Bakış'ta tahsilattan düşülen bir
  // "Ödeme" kaydı burada tam tersine EKLENİYOR ve iki ekran arasında (aynı günün aynı verisiyle)
  // tutarsızlık oluşuyordu. Artık işaret, Belge Türü'ne göre Genel Bakış'la aynı kuralla belirlenir:
  //   Müşteri Tahsilat / Hizmet Alış Fatura → SAP'ta negatif gelir, tahsilat artışı olsun diye işaret
  //     çevrilir: isaretliTutar = -hamTutar (net etki: pozitif tahsilat).
  //   Ödeme / Virman → ham işaret AYNEN korunur (yine isaretliTutar = -hamTutar formülüyle: pozitif
  //     ham tutar → negatif katkı/azalma, negatif ham tutar → pozitif katkı/artış).
  // Yani DÖRT kategori için de aynı tek formül geçerli: isaretliTutar = -hamTutar. Tanımadığımız bir
  // Belge Türü gelirse (whitelist'teki 4 ödeme tipinden biri olsa bile) güvenli tarafta kalınıp satır
  // atlanır — Genel Bakış'taki "tanımadığımız Belge Türü'nü yok say" kuralıyla tutarlı.
  const TAHSILAT_BILINEN_BELGE_TURLERI = new Set(['Müşteri Tahsilat','Hizmet Alış Fatura','Ödeme','Virman']);
  const tahsilatParsed = (tahsilatRows||[])
    .filter(r=>{
      const ot = String(r['Ödeme Tipi']||'').trim();
      if(!TAHSILAT_IZIN_VERILEN_ODEME_TIPLERI.has(ot)) return false;
      const bt = String(r['Belge Türü']||'').trim();
      return TAHSILAT_BILINEN_BELGE_TURLERI.has(bt);
    })
    .map(r=>({
      sst: String(r['Satış Temsilcisi']||'Tanımsız').trim() || 'Tanımsız',
      musteriKodu: yuklemeKod(r['Müşteri']),
      // Not: excelDateToJSArti1Gun kullanılır (excelDateToJS DEĞİL). Tarayıcı Türkiye (+3) saat
      // diliminde çalışırken, saf/naif Excel tarihleri (saat bileşeni olmayan) JS'e aktarılırken 1 gün
      // geriye kayabiliyor; bu +1 düzeltmesi o kaymayı telafi eder. (Daha önce bunu gereksiz sanıp
      // kaldırmıştım ama UTC ortamda test ettiğim için bu kaymayı görememiştim — gerçek arşiv verisiyle
      // doğrulandı.) Aşağıdaki gün eşleştirme mantığı (tahsilat günü + 1 = sevkiyat günü) bu düzeltilmiş
      // tarih üzerinden çalışır.
      belgeTarihi: excelDateToJSArti1Gun(r['Tarih']),
      belgeNo: yuklemeKod(r['Belge Numarası']),
      odemeTipi: r['Ödeme Tipi'],
      banka: r['Banka'],
      // Genel Bakış'la BİREBİR AYNI işaret formülü (bkz. yukarıdaki not): -hamTutar.
      tutar: -(yuklemeNumber(r['Tutar'])||0),
    })).filter(r=> r.belgeTarihi);
  // Not: Tahsilat dosyası bu yüklemede hiç YOKSA (tahsilatRows null/boş) burada hata verilmez —
  // tahsilatParsed zaten boş kalır ve aşağıdaki hesaplama sadece Yükleme Raporu tarafını işler.
  // Tahsilat dosyası VARDI ama içinde geçerli bir Tarih bulunamadıysa (gerçek bir veri sorunu)
  // hata vermeye devam eder.
  if(tahsilatRows && tahsilatRows.length && !tahsilatParsed.length) throw new Error('Tahsilat Dökümü\'nde geçerli bir "Tarih" kolonu/verisi bulunamadı.');

  // Tahsilat satırlarını takvim gününe göre grupla — dosyadaki HER gün ayrı işlenecek.
  const tahsilatGunHaritasi = new Map(); // gunKey -> {tarih, satirlar[]}
  tahsilatParsed.forEach(r=>{
    const gunKey = dateKeyLocal(r.belgeTarihi);
    if(!gunKey) return;
    if(!tahsilatGunHaritasi.has(gunKey)) tahsilatGunHaritasi.set(gunKey, {tarih:r.belgeTarihi, satirlar:[]});
    tahsilatGunHaritasi.get(gunKey).satirlar.push(r);
  });

  // TEMSİLCİ ATAMASI — SADECE MÜŞTERİ MASTER (kullanıcı kararı): Önceden Kalemler/Sipariş/
  // Bakiyesiz/Tahsilat dosyasındaki isim yedek olarak kullanılıyordu; bu, aynı müşterinin geçmiş
  // aylara ait dosyalarda dönemin (o zamanki) temsilcisiyle görünmesine yol açıyordu — bir müşteri
  // bölge/personel değişikliğiyle temsilci değiştirdiğinde, geçmiş arşivi tekrar yüklediğinde
  // eski/farklı isimler altında dağınık görünebiliyordu. Artık TEK kaynak Müşteri Master'daki
  // GÜNCEL eşleşme — Master'da o müşteri yoksa "Tanımsız" yazılır, başka hiçbir yedeğe
  // bakılmaz. Bu, hem tahsilat hem litre rakamlarının HER ZAMAN güncel/tutarlı tek bir
  // müşteri↔temsilci eşleşmesiyle gruplanmasını sağlar (buildReport'taki m.temsilci atamasıyla
  // birebir aynı kural).
  const musteriTemsilciHaritasi = new Map();
  (state.musteriMasterMap||new Map()).forEach((temsilci, kod)=>{
    if(kod && temsilci) musteriTemsilciHaritasi.set(kod, temsilci);
  });

  const yuklemeParsed = (yuklemeRows||[]).map(r=>({
    musteriNo: yuklemeKod(r['Müşteri Numarası']),
    // musteriAdi ve urunAdi: sadece "İptal Siparişler" listesinde gösterim amaçlı (kullanıcı
    // isteği, 17.07.2026) — litre/tahsilat hesaplamalarını etkilemez. urunMiktar da aynı şekilde
    // yalnızca "Sipariş Ürün Detayı" popup'ında gösterim amaçlıdır (kullanıcı isteği, 18.07.2026).
    musteriAdi: String(r['Müşteri Adı']||'').trim(),
    urunAdi: String(r['Ürün Adı']||'').trim(),
    urunMiktar: yuklemeNumber(r['Miktar Total']),
    litre: yuklemeNumber(r['Litre Total']),
    // Not: excelDateToJSArti1Gun kullanılır — bkz. yukarıdaki belgeTarihi notu (saat dilimi kaynaklı
    // 1 günlük kaymayı telafi eder).
    yuklemeTarihi: excelDateToJSArti1Gun(r['Yükleme Tarihi']),
    siparisKodu: yuklemeKod(r['Sipariş Kodu']),
    teslimStatusu: String(r['Teslim Statüsü']||'').trim(),
  })).filter(r=> r.yuklemeTarihi);
  // Not: Yükleme Raporu bu yüklemede hiç YOKSA hata verilmez (aynı gerekçeyle — bkz. yukarıdaki
  // tahsilatParsed notu); dosya VARDI ama geçerli tarih yoksa gerçek veri sorunu olarak hata verir.
  if(yuklemeRows && yuklemeRows.length && !yuklemeParsed.length) throw new Error('Yükleme Raporu\'nda geçerli bir Yükleme Tarihi bulunamadı.');

  // Yükleme satırlarını da takvim gününe göre grupla — Yükleme Raporu da (Tahsilat Dökümü gibi)
  // toplu/çok günlük bir dosya olabilir; her gün, o güne ait tahsilat gününden BAĞIMSIZ olarak
  // ayrıca gruplanır. Böylece hangi dosya hangi günleri kapsıyorsa yalnızca o günler güncellenir.
  const yuklemeGunHaritasi = new Map(); // gunKey -> {tarih, satirlar[]} (Teslim Statüsü filtresi UYGULANMADAN — bu ham grup, "bu gün bu yüklemede var mı" bilgisini taşır)
  yuklemeParsed.forEach(r=>{
    const gunKey = dateKeyLocal(r.yuklemeTarihi);
    if(!gunKey) return;
    if(!yuklemeGunHaritasi.has(gunKey)) yuklemeGunHaritasi.set(gunKey, {tarih:r.yuklemeTarihi, satirlar:[]});
    yuklemeGunHaritasi.get(gunKey).satirlar.push(r);
  });

  // Rapor günleri SEVKİYAT (Yükleme) tarihine göre anahtarlanır. İş kuralı gereği bir günün
  // tahsilatı, ERTESİ GÜNÜN sevkiyatıyla eşleşir (bayi önce tahsilatı yapar/kaydı düşer, ürün
  // ertesi gün sevk edilir) — yani: rapor günü (sevkiyat günü) = tahsilat günü + 1 gün.
  // Bu yüzden her tahsilat gününü, karşılık geldiği rapor gününe (kendi tarihi + 1 gün) taşıyoruz.
  const tahsilatRaporGunHaritasi = new Map(); // raporGunKey (sevkiyat tarihine göre) -> tahsilat grubu {tarih (gerçek tahsilat tarihi), satirlar[]}
  tahsilatGunHaritasi.forEach(grup=>{
    const raporTarihi = new Date(grup.tarih.getTime() + 86400000);
    const raporGunKey = dateKeyLocal(raporTarihi);
    if(!raporGunKey) return;
    tahsilatRaporGunHaritasi.set(raporGunKey, grup);
  });

  // Rapor, dosyalardan HANGİSİ kapsıyorsa o (sevkiyat tarihine göre anahtarlanmış) günlerin
  // BİRLEŞİMİ (union) üzerinden üretilir: Tahsilat Dökümü'nde olup Yükleme Raporu'nda karşılığı
  // olmayan bir gün de, ya da tam tersi de raporlanabilsin diye.
  const gunAnahtarlari = Array.from(new Set([...tahsilatRaporGunHaritasi.keys(), ...yuklemeGunHaritasi.keys()])).sort();
  const gunler = {};

  gunAnahtarlari.forEach(gunKey=>{
    const tGun = tahsilatRaporGunHaritasi.get(gunKey) || null;
    const yGun = yuklemeGunHaritasi.get(gunKey) || null;
    const tahsilatGununSatirlari = tGun ? tGun.satirlar : [];
    // "Teslim Statüsü" değeri "Not Delivered" veya "Rejected" olan yükleme satırları hiçbir
    // hesaplamaya dahil edilmez ve dolayısıyla arşive de yazılmaz (teslim edilmemiş/reddedilmiş
    // sevkiyat litre'ye sayılmaz; arşivde önceden bu sipariş nedeniyle var olan bir kayıt varsa
    // aşağıdaki tam-gün yeniden hesaplama sayesinde kendiliğinden düşer).
    const yuklemeGununSatirlari = yGun ? yGun.satirlar.filter(r=> r.teslimStatusu !== 'Not Delivered' && r.teslimStatusu !== 'Rejected') : [];

    // İPTAL SİPARİŞLER (kullanıcı isteği, 17.07.2026): yukarıdaki filtrede hesap dışı bırakılan
    // (Teslim Statüsü = 'Not Delivered' veya 'Rejected') satırlar artık sessizce kaybolmuyor —
    // sipariş kodu bazında gruplanıp bu günün arşiv kaydına ayrı bir liste olarak ekleniyor. ST
    // Tahsilat/Litre ekranındaki "İptal Siparişler" butonu bu listeyi gün gün gösterir.
    const iptalGununSatirlari = yGun ? yGun.satirlar.filter(r=> r.teslimStatusu === 'Not Delivered' || r.teslimStatusu === 'Rejected') : [];
    const iptalMap = new Map();
    iptalGununSatirlari.forEach(r=>{
      const key = r.musteriNo + '|' + r.siparisKodu + '|' + r.teslimStatusu;
      if(!iptalMap.has(key)){
        iptalMap.set(key, {
          musteriNo: r.musteriNo,
          musteriAdi: r.musteriAdi || r.musteriNo,
          siparisKodu: r.siparisKodu,
          teslimStatusu: r.teslimStatusu,
          temsilci: musteriTemsilciHaritasi.get(r.musteriNo) || 'Tanımsız',
          litre: 0,
          urunSayisi: 0,
          urunler: [],
        });
      }
      const kayit = iptalMap.get(key);
      kayit.litre += r.litre;
      kayit.urunSayisi += 1;
      if(r.urunAdi) kayit.urunler.push({ad: r.urunAdi, litre: r.litre, miktar: r.urunMiktar});
    });
    const iptalSiparisler = Array.from(iptalMap.values()).sort((a,b)=> b.litre-a.litre);

    const litreByMusteri = new Map();
    yuklemeGununSatirlari.forEach(r=>{
      litreByMusteri.set(r.musteriNo, (litreByMusteri.get(r.musteriNo)||0) + r.litre);
    });

    const kolonSet = new Set();
    const temsilciMap = new Map();
    function repRow(temsilci){
      if(!temsilciMap.has(temsilci)) temsilciMap.set(temsilci, {temsilci, kolonlar:{}, genelToplam:0, litre:0});
      return temsilciMap.get(temsilci);
    }
    // Bu günün tahsilat satırlarında geçen tüm Belge No'lar toplanır; arşiv senkronizasyonunda
    // bu günün arşiv kaydı bu listeyle eşitlenir — yeni Belge No'lar eklenmiş, artık bulunmayanlar
    // ise silinmiş olur.
    const belgeNoSeti = new Set();
    tahsilatGununSatirlari.forEach(r=>{
      const etiket = yuklemeOdemeEtiketi(r.odemeTipi, r.banka);
      kolonSet.add(etiket);
      // TEMSİLCİ ATAMASI — SADECE MÜŞTERİ MASTER (bkz. musteriTemsilciHaritasi'ndeki not):
      // Önceden r.sst (bu satırın kendi Satış Temsilcisi kolonu) kullanılıyordu — artık güncel
      // Master eşleşmesi kullanılıyor ki geçmiş dosyalar yüklendiğinde o dönemin (belki artık
      // değişmiş) temsilcisi değil, HER ZAMAN müşterinin bugünkü temsilcisi gösterilsin.
      const row = repRow(musteriTemsilciHaritasi.get(r.musteriKodu) || 'Tanımsız');
      row.kolonlar[etiket] = (row.kolonlar[etiket]||0) + r.tutar;
      row.genelToplam += r.tutar;
      if(r.belgeNo) belgeNoSeti.add(r.belgeNo);
    });

    litreByMusteri.forEach((litre, musteriNo)=>{
      const temsilci = musteriTemsilciHaritasi.get(musteriNo) || 'Tanımsız';
      const row = repRow(temsilci);
      row.litre += litre;
    });

    // Bu günün (Not Delivered/Rejected hariç) yükleme satırlarında geçen tüm Sipariş Kodları
    // toplanır; tıpkı Belge No'da olduğu gibi, arşiv senkronizasyonunda bu günün litre verisi bu
    // listeyle eşitlenir: yeni Sipariş Kodu'na sahip veriler eklenir, artık bulunmayanlar
    // (iptal/Not Delivered/Rejected) düşer, aynı kalanlara tekrar dokunulmaz.
    const siparisKoduSeti = new Set();
    yuklemeGununSatirlari.forEach(r=>{ if(r.siparisKodu) siparisKoduSeti.add(r.siparisKodu); });

    const kolonlar = yuklemeKolonSirala(kolonSet);
    const temsilciler = Array.from(temsilciMap.values())
      .map(r=>({
        temsilci: r.temsilci,
        kolonlar: r.kolonlar,
        genelToplam: r.genelToplam,
        litre: r.litre,
        stTahsilatLitre: r.litre > 0 ? (r.genelToplam / r.litre) : null,
      }))
      .sort((a,b)=> a.temsilci.localeCompare(b.temsilci,'tr'));

    const genelToplamSatiri = { kolonlar:{}, genelToplam:0, litre:0 };
    temsilciler.forEach(r=>{
      kolonlar.forEach(k=>{ genelToplamSatiri.kolonlar[k] = (genelToplamSatiri.kolonlar[k]||0) + (r.kolonlar[k]||0); });
      genelToplamSatiri.genelToplam += r.genelToplam;
      genelToplamSatiri.litre += r.litre;
    });
    genelToplamSatiri.stTahsilatLitre = genelToplamSatiri.litre > 0 ? (genelToplamSatiri.genelToplam / genelToplamSatiri.litre) : null;

    gunler[gunKey] = {
      // tahsilatTarihi: gerçek tahsilat verisi bu rapor gününde varsa onun tarihi (sevkiyattan 1 gün
      // önce); yoksa sevkiyat tarihinden geriye hesaplanan (görüntüleme amaçlı) bir gün önce.
      tahsilatTarihi: tGun ? tGun.tarih : (yGun ? new Date(yGun.tarih.getTime() - 86400000) : null),
      // yuklemeTarihi: gerçek sevkiyat verisi bu rapor gününde varsa onun tarihi; yoksa tahsilat
      // tarihinden ileriye hesaplanan (görüntüleme amaçlı) bir gün sonrası.
      yuklemeTarihi: yGun ? yGun.tarih : (tGun ? new Date(tGun.tarih.getTime() + 86400000) : null),
      kolonlar,
      temsilciler,
      genelToplamSatiri,
      belgeNoListesi: Array.from(belgeNoSeti),
      siparisKoduListesi: Array.from(siparisKoduSeti),
      iptalSiparisler,
      // Bu iki bayrak, arşiv birleştirmede (yuklemeGununuArsivIleBirlestir) hangi tarafın (tahsilat
      // rakamları mı, sevkiyat/litre verisi mi) bu yüklemede TAZE geldiğini, hangisinin arşivden
      // olduğu gibi korunması gerektiğini belirler.
      tahsilatVerisiVarMi: Boolean(tGun),
      sevkiyatVerisiVarMi: Boolean(yGun),
      kayitZamani: new Date().toISOString(),
    };
  });

  return {
    gunler,
    gunAnahtarlari,
    enGuncelGunKey: gunAnahtarlari.length ? gunAnahtarlari[gunAnahtarlari.length-1] : null,
  };
}

const YUKLEME_LT2 = n => (n||0).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
const YUKLEME_TL2 = n => (n||0).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ₺';
const YUKLEME_RENK_PALETI = ['var(--navy)','var(--accent)','#5C6BC0','#F0A63A','#3C7A56','#B23A2C','#8E44AD','#16A085','#D97757','#54617A'];
function yuklemeRenkAl(index){ return YUKLEME_RENK_PALETI[index % YUKLEME_RENK_PALETI.length]; }

function renderYuklemeToplamOzet(report){
  const wrap = document.getElementById('yuklemeToplamWrap');
  const kolonlar = report.kolonlar || [];
  const g = report.genelToplamSatiri || {};
  const gKolonlar = g.kolonlar || {};
  const genelToplam = g.genelToplam || 0;

  const barHTML = kolonlar.map((k, i)=>{
    const tutar = gKolonlar[k] || 0;
    if(tutar<=0) return '';
    const pct = genelToplam>0 ? (tutar/genelToplam*100) : 0;
    const gosterAdi = yuklemeGenelToplamKolonEtiketi(k);
    const etiket = pct>=12 ? `${escapeHtml(gosterAdi)} · ${YUKLEME_TL2(tutar)}` : '';
    return `<span style="width:${pct.toFixed(2)}%;background:${yuklemeRenkAl(i)};" title="${escapeHtml(gosterAdi)}: ${YUKLEME_TL2(tutar)}">${etiket}</span>`;
  }).join('');

  const legendHTML = kolonlar.map((k,i)=>{
    const tutar = gKolonlar[k] || 0;
    const pct = genelToplam>0 ? (tutar/genelToplam*100) : 0;
    return `<div class="yukleme-toplam-legend-item"><i style="background:${yuklemeRenkAl(i)}"></i>${escapeHtml(yuklemeGenelToplamKolonEtiketi(k))} <b>${tutar ? YUKLEME_TL2(tutar) : '—'}</b> (%${pct.toFixed(1).replace('.',',')})</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="yukleme-toplam-top">
      <div>
        <div class="yukleme-toplam-label">Genel Toplam</div>
        <div class="yukleme-toplam-val">${YUKLEME_TL2(genelToplam)}</div>
      </div>
      <div class="yukleme-toplam-lt-chip"><i class="fa-solid fa-box" aria-hidden="true"></i> ${YUKLEME_LT2(g.litre)} Lt sevkiyat</div>
    </div>
    <div class="yukleme-toplam-bar">${barHTML}</div>
    <div class="yukleme-toplam-legend">${legendHTML}</div>
  `;
}

// "Key Account" temsilcisi seçilen sıralama kriteri ne olursa olsun listenin daima en sonunda kalır.
function getYuklemeSiraliTemsilciler(report){
  const {key, dir} = state.yuklemeSort;
  const list = (report.temsilciler||[]).slice();
  list.sort((a,b)=>{
    const aKA = String(a.temsilci||'').trim().toLocaleLowerCase('tr-TR') === 'key account';
    const bKA = String(b.temsilci||'').trim().toLocaleLowerCase('tr-TR') === 'key account';
    if(aKA && !bKA) return 1;
    if(bKA && !aKA) return -1;
    if(aKA && bKA) return 0;
    const av = a[key], bv = b[key];
    if(typeof av === 'string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return list;
}

function renderYuklemeTable(report){
  state.yuklemeGosterilenRapor = report;
  const kolonlar = report.kolonlar || [];
  const sevkiyatBaslik = fmtDate(report.yuklemeTarihi) + ' SEVKİYAT';

  // İPTAL SİPARİŞLER butonu: bu günün arşiv kaydında iptal/reddedilmiş sipariş varsa buton
  // görünür olur ve toplam sayıyı rozet olarak gösterir; yoksa buton tamamen gizlenir.
  const iptalBtn = document.getElementById('yuklemeIptalBtn');
  const iptalListesi = report.iptalSiparisler || [];
  if(iptalListesi.length){
    iptalBtn.style.display = 'inline-flex';
    document.getElementById('yuklemeIptalSayacBadge').textContent = iptalListesi.length;
  } else {
    iptalBtn.style.display = 'none';
  }

  renderYuklemeToplamOzet(report);

  const list = document.getElementById('yuklemeTbody');
  const siraliTemsilciler = getYuklemeSiraliTemsilciler(report);
  if(!siraliTemsilciler.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Gösterilecek temsilci bulunamadı.</div>`;
  } else {
    const kartKolonGruplari = yuklemeKartKolonlariniIndirge(kolonlar);
    list.innerHTML = siraliTemsilciler.map(r=>{
      const rKolonlar = r.kolonlar || {};
      const tanimsizMi = String(r.temsilci||'').trim().toLocaleLowerCase('tr-TR') === 'tanımsız';
      const compBar = kartKolonGruplari.map(kk=>{
        const tutar = kk.kaynaklar.reduce((s,k)=> s + (rKolonlar[k]||0), 0);
        if(tutar<=0 || !r.genelToplam) return '';
        const pct = (tutar/r.genelToplam*100);
        return `<span style="width:${pct.toFixed(2)}%;background:${yuklemeRenkAl(kk.renkIndex)}"></span>`;
      }).join('');
      const statChips = kartKolonGruplari.map(kk=>{
        const tutar = kk.kaynaklar.reduce((s,k)=> s + (rKolonlar[k]||0), 0);
        return `<div class="cust-stat-chip"><div class="l">${escapeHtml(yuklemeKartKolonEtiketi(kk.etiket))}</div><div class="v">${tutar ? YUKLEME_TL2(tutar) : '<span class="zero">—</span>'}</div></div>`;
      }).join('');
      return `<div class="cust-card${tanimsizMi?' yukleme-tanimsiz':''}">
        <div class="cust-card-top">
          <div class="cust-avatar">${escapeHtml(avatarBaslangic(r.temsilci))}</div>
          <div class="cust-info">
            <div class="musteri-name">${escapeHtml(r.temsilci)}${tanimsizMi ? ' <span title="Bu litre miktarı, tahsilat dökümünde eşleşecek bir müşteri/temsilci bulunamadığı için hiçbir temsilciye yazılamadı">ⓘ</span>' : ''}</div>
          </div>
        </div>
        <div class="cust-kalan-row"><span class="cust-kalan-label">Genel Toplam</span><span class="cust-kalan-val">${YUKLEME_TL2(r.genelToplam)}</span></div>
        <div class="risk-bar">${compBar}</div>
        <div class="cust-stat-strip" style="grid-template-columns:repeat(auto-fit,minmax(72px,1fr));">${statChips}</div>
        <div class="yukleme-lt">${r.litre ? YUKLEME_LT2(r.litre) + ' Lt sevkiyat' : '—'}</div>
      </div>`;
    }).join('');
  }

  document.getElementById('yuklemePanel').style.display = 'block';
  document.getElementById('yuklemeTitle').textContent = 'ST Tahsilat/Litre — ' + sevkiyatBaslik;
  document.getElementById('yuklemeSubTitle').innerHTML =
    `<span class="chip"><i class="fa-solid fa-calendar" aria-hidden="true"></i> Tahsilat: ${escapeHtml(fmtDate(report.tahsilatTarihi))}</span>` +
    `<span class="chip"><i class="fa-solid fa-users" aria-hidden="true"></i> ${(report.temsilciler||[]).length.toLocaleString('tr-TR')} temsilci</span>`;
}

function yuklemeArsivReviver(key, value){
  if((key==='tahsilatTarihi' || key==='yuklemeTarihi') && typeof value === 'string'){
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}
// KRİTİK DÜZELTME (kullanıcı bildirimi, 17.07.2026): Bu kayıt önceden TEK denemeyle, sabit 15 sn
// zaman aşımıyla çalışıyordu ve başarısız olduğunda SADECE console.error'a yazıyordu — kullanıcı
// arayüzünde hiçbir uyarı göstermiyordu. Sonuç: ağ geçici olarak yavaşladığında/hıçkırdığında bu
// arşiv sessizce buluta kaydedilmiyordu, kullanıcı bunu fark edemiyordu ("yükleme raporunu buluta
// arşivlemiyor" şikayetinin kök nedeni). Artık: 1) ilk deneme başarısız olursa 2 sn sonra, daha
// uzun bir zaman aşımıyla (30 sn) BİR KEZ daha denenir; 2) bu ikinci deneme de başarısız olursa
// çağıran taraf (yuklemeRaporlariniArsivineKaydet) kullanıcıya AÇIK bir uyarı gösterir.
async function saveYuklemeArsivToCloud(arsiv){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  async function denemeYap(timeoutMs){
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${YUKLEME_ARSIV_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(arsiv),
    }, timeoutMs);
    if(!res.ok) throw new Error('HTTP '+res.status);
  }
  try{
    await denemeYap(15000);
    return {ok:true};
  }catch(ilkHata){
    console.error('Yükleme Raporu arşivi buluta kaydedilemedi (1. deneme), tekrar denenecek:', ilkHata);
    await new Promise(r=> setTimeout(r, 2000));
    try{
      await denemeYap(30000);
      return {ok:true};
    }catch(ikinciHata){
      console.error('Yükleme Raporu arşivi buluta kaydedilemedi (2. deneme, vazgeçildi):', ikinciHata);
      return {ok:false, reason:ikinciHata.message};
    }
  }
}
async function loadYuklemeArsivFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${YUKLEME_ARSIV_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text, yuklemeArsivReviver);
  }catch(err){ console.error('Yükleme Raporu arşivi buluttan okunamadı:', err); return null; }
}
async function saveYuklemeArsivToLocal(arsiv){
  const ok = await idbSet(YUKLEME_ARSIV_LOCAL_KEY, arsiv);
  if(!ok) console.error('Yükleme Raporu arşivi cihaza kaydedilemedi.');
}
async function loadYuklemeArsivFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(YUKLEME_ARSIV_LOCAL_KEY, yuklemeArsivReviver);
    return await idbGet(YUKLEME_ARSIV_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

// Tahsilat Dökümü'nde bulunan (yani sonuc.gunler içinde en az bir kaydı olan) HER gün için,
// o günün arşiv kaydı bu raporla TAMAMEN eşitlenir (Belge No bazında senkronizasyon):
//  - Yeni raporda olup arşivde olmayan Belge No'lar eklenmiş olur,
//  - Arşivde olup yeni raporda artık bulunmayan Belge No'lar (o gün için) arşivden düşer,
//  - Her iki tarafta da aynı kalan Belge No'lar için tekrar bir işlem yapılmaz (sonuç zaten aynı).
// Yeni yüklenen Tahsilat Dökümü'nde HİÇ satırı bulunmayan günlere (örn. arşivde olup raporun
// kapsamadığı daha eski günler) KESİNLİKLE dokunulmaz — bu günlerin arşiv kaydı olduğu gibi kalır.
// Yükleme Raporu (sevkiyat/litre) dosyası genellikle yalnızca EN GÜNCEL günün verisini içerir;
// geçmiş günler için bu dosyada satır bulunmaz. Bu yüzden bir günün tahsilat rakamları (kolonlar/
// genelToplam) her yüklemede güncellenirken, o güne ait sevkiyat verisi bu yüklemede YOKSA
// (yeniGun.sevkiyatVerisiVarMi === false), arşivde önceden kayıtlı litre verisi SIFIRLANMAZ; olduğu
// gibi korunarak yeni tahsilat rakamlarıyla birleştirilir.
function yuklemeGunuLitreIleBirlestir(yeniGun, eskiGun){
  if(!eskiGun || yeniGun.sevkiyatVerisiVarMi) return yeniGun;

  const eskiLitreMap = new Map();
  (eskiGun.temsilciler||[]).forEach(r=>{ eskiLitreMap.set(r.temsilci, r.litre||0); });

  const gorulenTemsilciler = new Set();
  const birlesikTemsilciler = (yeniGun.temsilciler||[]).map(r=>{
    gorulenTemsilciler.add(r.temsilci);
    const litre = eskiLitreMap.has(r.temsilci) ? eskiLitreMap.get(r.temsilci) : (r.litre||0);
    return Object.assign({}, r, {
      litre,
      stTahsilatLitre: litre > 0 ? (r.genelToplam / litre) : null,
    });
  });
  // Bu günde tahsilatı olmayıp yalnızca eski arşivde litre kaydı bulunan temsilciler de korunur.
  (eskiGun.temsilciler||[]).forEach(r=>{
    if(gorulenTemsilciler.has(r.temsilci) || !(r.litre>0)) return;
    // Eski arşiv kaydı (özellikle daha önceki bir şema sürümünden kalma) kolonlar alanını
    // hiç içermeyebilir — bu durumda aşağıdaki genel toplam hesaplaması r.kolonlar[k] okurken
    // "Cannot read properties of undefined" hatası fırlatırdı; burada {} ile güvenceye alınır.
    birlesikTemsilciler.push(Object.assign({}, r, {kolonlar: r.kolonlar || {}}));
  });
  birlesikTemsilciler.sort((a,b)=> a.temsilci.localeCompare(b.temsilci,'tr'));

  const kolonlar = yeniGun.kolonlar || [];
  const genelToplamSatiri = { kolonlar:{}, genelToplam:0, litre:0 };
  birlesikTemsilciler.forEach(r=>{
    kolonlar.forEach(k=>{ genelToplamSatiri.kolonlar[k] = (genelToplamSatiri.kolonlar[k]||0) + ((r.kolonlar||{})[k]||0); });
    genelToplamSatiri.genelToplam += r.genelToplam;
    genelToplamSatiri.litre += r.litre;
  });
  genelToplamSatiri.stTahsilatLitre = genelToplamSatiri.litre > 0 ? (genelToplamSatiri.genelToplam / genelToplamSatiri.litre) : null;

  return Object.assign({}, yeniGun, {
    temsilciler: birlesikTemsilciler,
    genelToplamSatiri,
    yuklemeTarihi: eskiGun.yuklemeTarihi || yeniGun.yuklemeTarihi,
    // İPTAL SİPARİŞLER: bu yüklemede sevkiyat/Yükleme Raporu verisi TAZE DEĞİL (sadece Tahsilat
    // Dökümü geldi) — o yüzden bu günün iptal/reddedilmiş sipariş listesi de (litre gibi) eski
    // arşivden korunur, yeniGun'daki (boş) liste ile ezilmez.
    iptalSiparisler: (eskiGun.iptalSiparisler && eskiGun.iptalSiparisler.length) ? eskiGun.iptalSiparisler : (yeniGun.iptalSiparisler||[]),
  });
}

// yuklemeGunuLitreIleBirlestir'in AYNASI: Tahsilat Dökümü bu yüklemede bu günü kapsamıyorsa
// (yeniGun.tahsilatVerisiVarMi === false) ama Yükleme Raporu kapsıyorsa, litre/Sipariş Kodu verisi
// TAZE ve otoritedir (Not Delivered/Rejected olanlar zaten elenmiş, yeni Sipariş Kodu'ları eklenmiş, artık
// olmayanlar düşmüştür); tahsilat rakamları (kolonlar/genelToplam) ise bu yüklemede güncellenmediği
// için arşivdeki önceki haliyle korunur.
function yuklemeGunuTahsilatIleBirlestir(yeniGun, eskiGun){
  if(!eskiGun || yeniGun.tahsilatVerisiVarMi) return yeniGun;

  const eskiTahsilatMap = new Map();
  (eskiGun.temsilciler||[]).forEach(r=>{ eskiTahsilatMap.set(r.temsilci, {kolonlar:r.kolonlar||{}, genelToplam:r.genelToplam||0}); });

  const gorulenTemsilciler = new Set();
  const birlesikTemsilciler = (yeniGun.temsilciler||[]).map(r=>{
    gorulenTemsilciler.add(r.temsilci);
    const eski = eskiTahsilatMap.get(r.temsilci);
    const kolonlar = eski ? eski.kolonlar : (r.kolonlar||{});
    const genelToplam = eski ? eski.genelToplam : (r.genelToplam||0);
    return {
      temsilci: r.temsilci,
      kolonlar,
      genelToplam,
      litre: r.litre,
      stTahsilatLitre: r.litre > 0 ? (genelToplam / r.litre) : null,
    };
  });
  // Bu günde (yeni yüklemede) litresi olmayıp yalnızca eski arşivde tahsilatı bulunan temsilciler de
  // korunur — bu yüklemede sevkiyat verisi bu temsilci için gelmemiş olsa dahi tahsilat rakamları
  // kaybolmaz.
  (eskiGun.temsilciler||[]).forEach(r=>{
    if(gorulenTemsilciler.has(r.temsilci) || !(r.genelToplam>0)) return;
    birlesikTemsilciler.push({
      temsilci: r.temsilci,
      kolonlar: r.kolonlar || {},
      genelToplam: r.genelToplam,
      litre: 0,
      stTahsilatLitre: null,
    });
  });
  birlesikTemsilciler.sort((a,b)=> a.temsilci.localeCompare(b.temsilci,'tr'));

  const kolonlar = (eskiGun.kolonlar && eskiGun.kolonlar.length) ? eskiGun.kolonlar : (yeniGun.kolonlar||[]);
  const genelToplamSatiri = { kolonlar:{}, genelToplam:0, litre:0 };
  birlesikTemsilciler.forEach(r=>{
    kolonlar.forEach(k=>{ genelToplamSatiri.kolonlar[k] = (genelToplamSatiri.kolonlar[k]||0) + ((r.kolonlar||{})[k]||0); });
    genelToplamSatiri.genelToplam += r.genelToplam;
    genelToplamSatiri.litre += r.litre;
  });
  genelToplamSatiri.stTahsilatLitre = genelToplamSatiri.litre > 0 ? (genelToplamSatiri.genelToplam / genelToplamSatiri.litre) : null;

  return Object.assign({}, yeniGun, {
    kolonlar,
    temsilciler: birlesikTemsilciler,
    genelToplamSatiri,
    tahsilatTarihi: eskiGun.tahsilatTarihi || yeniGun.tahsilatTarihi,
    belgeNoListesi: (eskiGun.belgeNoListesi && eskiGun.belgeNoListesi.length) ? eskiGun.belgeNoListesi : yeniGun.belgeNoListesi,
  });
}

// Bir günün arşiv kaydını, bu yüklemede TAZE gelen tarafı otorite kabul edip diğer tarafı arşivden
// koruyarak günceller: her iki taraf da taze ise doğrudan yeniGun kullanılır; yalnızca biri taze ise
// ilgili "birlestir" yardımcısı devreye girer; arşivde hiç kayıt yoksa doğrudan yeniGun kullanılır.
function yuklemeGununuArsivIleBirlestir(yeniGun, eskiGun){
  if(!eskiGun) return yeniGun;
  if(yeniGun.tahsilatVerisiVarMi && yeniGun.sevkiyatVerisiVarMi) return yeniGun;
  if(!yeniGun.tahsilatVerisiVarMi && yeniGun.sevkiyatVerisiVarMi) return yuklemeGunuTahsilatIleBirlestir(yeniGun, eskiGun);
  if(yeniGun.tahsilatVerisiVarMi && !yeniGun.sevkiyatVerisiVarMi) return yuklemeGunuLitreIleBirlestir(yeniGun, eskiGun);
  return eskiGun; // teorik olarak oluşmaz: gunKey zaten en az bir taraf var olduğu için üretilir.
}

async function yuklemeRaporlariniArsivineKaydet(sonuc){
  const gunAnahtarlari = Object.keys((sonuc && sonuc.gunler) || {});
  if(!gunAnahtarlari.length) return;
  let arsiv = {};
  if(cloudEnabled()){
    arsiv = (await loadYuklemeArsivFromCloud()) || {};
  } else {
    arsiv = (await loadYuklemeArsivFromLocal()) || {};
  }
  // Bu yüklemede GERÇEKTEN işlenen (Tahsilat Dökümü/Yükleme Raporu'ndan gelen) her gün için,
  // dosyanın gerçekte ne zaman yüklenip işlendiğini gösteren bir kayitZamani damgası eklenir —
  // Arşiv Verisi panelindeki "Son güncelleme" gösterimi bunu kullanır (bkz. gvyTipiIcinSonKayitZamani).
  const simdiIso = new Date().toISOString();
  gunAnahtarlari.forEach(gunKey=>{
    arsiv[gunKey] = Object.assign({}, yuklemeGununuArsivIleBirlestir(sonuc.gunler[gunKey], arsiv[gunKey]), {kayitZamani: simdiIso});
  });
  state.yuklemeArsivCache = arsiv;
  state.yuklemeRaporuBulutHatasi = false;
  if(cloudEnabled()){
    const sonuc = await saveYuklemeArsivToCloud(arsiv);
    if(!sonuc.ok){
      // ARTIK SESSİZ DEĞİL (kullanıcı bildirimi, 17.07.2026): 2 deneme de başarısız olduysa, ana
      // rapordaki bulut kayıt hatasıyla AYNI ciddiyette açıkça uyarılır — aksi halde kullanıcı bu
      // günün ST Tahsilat/Litre verisinin buluta hiç ulaşmadığını (ve başka cihazda görünmeyeceğini)
      // fark edemez.
      state.yuklemeRaporuBulutHatasi = true;
      alert('UYARI: Yükleme Raporu (ST Tahsilat/Litre) arşivi buluta kaydedilemedi — sadece bu cihazda kaldı, diğer cihazlarda görünmeyecek ve sayfa verisi temizlenirse kaybolabilir.\n\nHata: ' + sonuc.reason + '\n\nLütfen internet bağlantınızı kontrol edip "Raporu Oluştur"a tekrar basın.');
    }
  }
  await saveYuklemeArsivToLocal(arsiv);
}

async function yuklemeArsivYenile(){
  let arsiv = null;
  if(cloudEnabled()) arsiv = await loadYuklemeArsivFromCloud();
  if(!arsiv) arsiv = await loadYuklemeArsivFromLocal();
  state.yuklemeArsivCache = arsiv || {};
  if(typeof musteriMasterIliskileriniDerinGuncelle==='function') musteriMasterIliskileriniDerinGuncelle(state.yuklemeArsivCache);
  return state.yuklemeArsivCache;
}

// Hesaplama mantığı değiştiğinde (örn. gün eşleştirme kuralı düzeltildiğinde) eski mantıkla
// kaydedilmiş arşiv kayıtları artık geçersiz/tutarsız hale gelebilir; bu fonksiyon ST Tahsilat/Litre
// arşivinin tamamını (bulut + cihaz) kalıcı olarak temizler.
// Tüm arşivi silen özellik kaldırıldı — arşiv hiçbir koşulda silinmemeli. Artık kasıtlı olarak
// hiçbir şey yapmayan güvenli bir no-op'tur.
async function clearYuklemeArsiv(){
  dwarn('clearYuklemeArsiv() devre dışı bırakıldı — arşiv kalıcı olarak korunuyor.');
}

function populateYuklemeTarihSelect(){
  const sel = document.getElementById('yuklemeTarihSelect');
  const arsiv = state.yuklemeArsivCache || {};
  const gunler = Object.keys(arsiv).sort().reverse();
  const mevcutSecim = state.yuklemeSeciliGun;
  sel.innerHTML = gunler.map(g=>{
    const d = new Date(g+'T00:00:00');
    return `<option value="${g}">${fmtDate(d)}${g===dateKeyLocal(new Date())?' (bugün)':''}</option>`;
  }).join('');
  if(!gunler.length){
    sel.innerHTML = `<option value="">Arşivde henüz gün yok</option>`;
  } else if(mevcutSecim && gunler.includes(mevcutSecim)){
    sel.value = mevcutSecim;
  } else {
    sel.value = gunler[0];
    state.yuklemeSeciliGun = gunler[0];
  }
}

function renderYuklemeArsivBilgi(){
  const el = document.getElementById('yuklemeArsivBilgi');
  const gunSayisi = Object.keys(state.yuklemeArsivCache||{}).length;
  if(!cloudEnabled()){
    el.textContent = '⚠️ Bulut (Firebase) yapılandırılmamış; bu arşiv yalnızca bu cihazda (tarayıcı hafızasında) saklanıyor.';
    return;
  }
  // Bir önceki kayıt denemesi (2 tekrar dahil) buluta ulaşamadıysa, sekme her açıldığında bu
  // kalıcı uyarı görünür kalır — kullanıcı "Raporu Oluştur"a tekrar basana kadar unutulmaz.
  if(state.yuklemeRaporuBulutHatasi){
    el.textContent = '❌ SON YÜKLEME BULUTA KAYDEDİLEMEDİ — bu cihazda kaldı, diğer cihazlarda görünmüyor. Lütfen bağlantınızı kontrol edip "Raporu Oluştur"a tekrar basın.';
    return;
  }
  el.textContent = gunSayisi
    ? `☁️ Arşivde ST Tahsilat/Litre kaydı var. Tarih seçiciden geçmişe dönük görüntüleyebilirsiniz.`
    : 'Buluttaki ST Tahsilat/Litre arşivinde henüz veri yok. Ana yükleme sayfasında "Tahsilat Dökümü" ve "Yükleme Raporu" dosyalarını yükleyip "Raporu Oluştur"a bastığınızda o günün verisi buluta eklenir. ☁️';
}

async function yuklemeRaporuOlusturVeArsivle(){
  const tahsilatDosya = state.files.tahsilat;
  const yuklemeDosya = state.files.yukleme;
  state.yuklemeRaporuHata = null;
  // Not: Artık Tahsilat Dökümü ve Yükleme Raporu BAĞIMSIZ olarak (Grup B panelinden tek tek)
  // yüklenebiliyor — bu yüzden ikisinin de AYNI ANDA seçili olması ZORUNLU DEĞİL. Sadece HİÇBİRİ
  // seçili değilse bu adım tamamen atlanır (arşive dokunulmaz, mevcut arşiv aynen kalır). En az
  // biri varsa buildYuklemeRaporu o tek dosyanın günlerini işler, arşivdeki karşı taraf
  // (yuklemeGununuArsivIleBirlestir sayesinde) korunur/sonradan otomatik birleşir.
  if(!tahsilatDosya && !yuklemeDosya){
    if(document.getElementById('yuklemeView').style.display !== 'none') renderYuklemeView();
    return;
  }
  try{
    const sonuc = buildYuklemeRaporu(tahsilatDosya ? tahsilatDosya.data : null, yuklemeDosya ? yuklemeDosya.data : null);
    const guncelGunKey = sonuc.enGuncelGunKey;
    await yuklemeRaporlariniArsivineKaydet(sonuc);
    state.yuklemeReport = guncelGunKey ? (state.yuklemeArsivCache[guncelGunKey] || sonuc.gunler[guncelGunKey]) : null;
    state.yuklemeSeciliGun = guncelGunKey;
  }catch(err){
    console.error('ST Tahsilat/Litre raporu oluşturulamadı:', err);
    state.yuklemeReport = null;
    state.yuklemeRaporuHata = err.message;
  }
  if(document.getElementById('yuklemeView').style.display !== 'none') renderYuklemeView();
}

async function renderYuklemeView(){
  const bosPanel = document.getElementById('yuklemeBosPanel');
  const bosMesaj = document.getElementById('yuklemeBosMesaj');
  const panel = document.getElementById('yuklemePanel');
  try{
    await yuklemeArsivYenile();
    populateYuklemeTarihSelect();
    renderYuklemeArsivBilgi();

    const gunler = Object.keys(state.yuklemeArsivCache||{});
    const gosterilecekVarMi = Boolean(state.yuklemeReport) || gunler.length > 0;

    if(!gosterilecekVarMi){
      panel.style.display = 'none';
      bosPanel.style.display = 'block';
      bosMesaj.textContent = state.yuklemeRaporuHata
        ? ('ST Tahsilat/Litre raporu oluşturulamadı: ' + state.yuklemeRaporuHata)
        : 'ST Tahsilat/Litre raporu için ana yükleme sayfasında hem "Tahsilat Dökümü" hem de "Yükleme Raporu" dosyalarını yükleyip "Raporu Oluştur"a basmanız gerekir.';
      return;
    }

    const sel = document.getElementById('yuklemeTarihSelect');
    let gosterilecekRapor = null;
    if(state.yuklemeReport && (!sel.value || !state.yuklemeSeciliGun)) gosterilecekRapor = state.yuklemeReport;
    else if(sel.value && state.yuklemeArsivCache[sel.value]) gosterilecekRapor = state.yuklemeArsivCache[sel.value];
    else if(state.yuklemeReport) gosterilecekRapor = state.yuklemeReport;

    if(gosterilecekRapor){
      renderYuklemeTable(gosterilecekRapor);
      bosPanel.style.display = 'none';
    }else{
      panel.style.display = 'none';
      bosPanel.style.display = 'block';
      bosMesaj.textContent = 'ST Tahsilat/Litre raporu için ana yükleme sayfasında hem "Tahsilat Dökümü" hem de "Yükleme Raporu" dosyalarını yükleyip "Raporu Oluştur"a basmanız gerekir.';
    }
  }catch(err){
    console.error('ST Tahsilat/Litre görünümü oluşturulamadı:', err);
    panel.style.display = 'none';
    bosPanel.style.display = 'block';
    bosMesaj.textContent = 'ST Tahsilat/Litre raporu gösterilirken bir hata oluştu: ' + err.message;
  }
}

document.getElementById('yuklemeTarihSelect').addEventListener('change', (e)=>{
  state.yuklemeSeciliGun = e.target.value;
  const rapor = state.yuklemeArsivCache[e.target.value];
  if(rapor) renderYuklemeTable(rapor);
});
document.getElementById('yuklemeYenileBtn').addEventListener('click', renderYuklemeView);

// İPTAL SİPARİŞLER MODALI (kullanıcı isteği, 17.07.2026): Teslim Statüsü 'Not Delivered'/'Rejected'
// olduğu için Sevkiyat/litre toplamına dahil edilmeyen siparişleri, uyarı poposu yerine talep
// üzerine açılan bir liste olarak gösterir — seçili günün (yuklemeTarihSelect) arşiv kaydından okur.
function yuklemeIptalSatirHtml(k, idx){
  const durumEtiket = k.teslimStatusu === 'Rejected' ? 'Reddedildi' : 'Teslim Edilmedi';
  return `<tr>
    <td>${escapeHtml(k.musteriAdi)}</td>
    <td>${escapeHtml(k.siparisKodu||'—')}</td>
    <td><span class="pill danger">${escapeHtml(durumEtiket)}</span></td>
    <td>${escapeHtml(k.temsilci)}</td>
    <td class="num">${k.urunSayisi}</td>
    <td class="num num-strong">${YUKLEME_LT2(k.litre)} Lt</td>
    <td><button type="button" class="nokta-detay-btn primary yukleme-iptal-urun-detay-btn" data-idx="${idx}">Detay ↗</button></td>
  </tr>`;
}
function yuklemeIptalModalAc(report){
  const liste = (report && report.iptalSiparisler) || [];
  // Ürün detay popup'ının (aşağıdaki yuklemeIptalUrunModalAc) hangi siparişe ait olduğunu bulabilmesi
  // için, o an modalde gösterilen liste burada saklanır (satırdaki data-idx ile eşleştirilir).
  state.yuklemeIptalGosterilenListe = liste;
  const toplamLitre = liste.reduce((a,k)=>a+k.litre, 0);
  document.getElementById('yuklemeIptalModalSub').textContent =
    fmtDate(report.yuklemeTarihi) + ' — ' + liste.length + ' sipariş, toplam ' + YUKLEME_LT2(toplamLitre) + ' Lt';
  document.getElementById('yuklemeIptalModalTbody').innerHTML = liste.map(yuklemeIptalSatirHtml).join('')
    || '<tr><td colspan="7" class="empty-state">Bu gün için iptal/reddedilmiş sipariş yok</td></tr>';
  document.getElementById('yuklemeIptalModalOverlay').classList.add('open');
}
function yuklemeIptalModalKapat(){
  document.getElementById('yuklemeIptalModalOverlay').classList.remove('open');
}
document.getElementById('yuklemeIptalBtn').addEventListener('click', ()=>{
  if(state.yuklemeGosterilenRapor) yuklemeIptalModalAc(state.yuklemeGosterilenRapor);
});
document.getElementById('yuklemeIptalModalClose').addEventListener('click', yuklemeIptalModalKapat);
document.getElementById('yuklemeIptalModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='yuklemeIptalModalOverlay') yuklemeIptalModalKapat();
});

// SİPARİŞ ÜRÜN DETAYI — ikinci seviye popup (kullanıcı isteği, 17.07.2026): İptal Siparişler
// listesindeki bir satırın "Detay ↗" butonuna basıldığında, o siparişin içindeki her ürünü kendi
// litresiyle ayrı ayrı gösterir.
function yuklemeIptalUrunModalAc(kayit){
  document.getElementById('yuklemeIptalUrunModalSub').textContent =
    escapeHtml(kayit.musteriAdi) + ' · ' + (kayit.teslimStatusu==='Rejected' ? 'Reddedildi' : 'Teslim Edilmedi')
    + ' · Sipariş ' + (kayit.siparisKodu||'—');
  const urunler = (kayit.urunler||[]).slice().sort((a,b)=> b.litre-a.litre);
  // MİKTAR KOLONU (kullanıcı isteği, 18.07.2026): Yükleme Raporu'ndaki "Miktar Total" kolonundan
  // gelir (bkz. yuklemeParsed.urunMiktar) — ürünün adet/koli cinsinden miktarını, Litre'nin
  // yanında ayrı bir sütunda gösterir.
  const toplamMiktar = urunler.reduce((a,u)=>a+(u.miktar||0), 0);
  document.getElementById('yuklemeIptalUrunModalTbody').innerHTML = urunler.map(u=>`
    <tr><td>${escapeHtml(u.ad)}</td><td class="num">${u.miktar!=null ? u.miktar.toLocaleString('tr-TR') : '—'}</td><td class="num">${YUKLEME_LT2(u.litre)} Lt</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty-state">Ürün bilgisi yok</td></tr>';
  document.getElementById('yuklemeIptalUrunModalTfoot').innerHTML =
    `<tr><td><b>Toplam</b></td><td class="num num-strong">${toplamMiktar.toLocaleString('tr-TR')}</td><td class="num num-strong">${YUKLEME_LT2(kayit.litre)} Lt</td></tr>`;
  document.getElementById('yuklemeIptalUrunModalOverlay').classList.add('open');
}
function yuklemeIptalUrunModalKapat(){
  document.getElementById('yuklemeIptalUrunModalOverlay').classList.remove('open');
}
document.getElementById('yuklemeIptalModalTbody').addEventListener('click', (e)=>{
  const btn = e.target.closest('.yukleme-iptal-urun-detay-btn');
  if(!btn) return;
  const idx = Number(btn.dataset.idx);
  const kayit = (state.yuklemeIptalGosterilenListe||[])[idx];
  if(kayit) yuklemeIptalUrunModalAc(kayit);
});
document.getElementById('yuklemeIptalUrunModalClose').addEventListener('click', yuklemeIptalUrunModalKapat);
document.getElementById('yuklemeIptalUrunModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='yuklemeIptalUrunModalOverlay') yuklemeIptalUrunModalKapat();
});

const yuklemeSortSelect = document.getElementById('yuklemeSortSelect');
const yuklemeSortDirBtn = document.getElementById('yuklemeSortDirBtn');
yuklemeSortSelect.value = state.yuklemeSort.key;
yuklemeSortDirBtn.textContent = state.yuklemeSort.dir===1 ? '↑' : '↓';
yuklemeSortSelect.addEventListener('change', ()=>{
  state.yuklemeSort.key = yuklemeSortSelect.value;
  if(state.yuklemeGosterilenRapor) renderYuklemeTable(state.yuklemeGosterilenRapor);
});
yuklemeSortDirBtn.addEventListener('click', ()=>{
  state.yuklemeSort.dir *= -1;
  yuklemeSortDirBtn.textContent = state.yuklemeSort.dir===1 ? '↑' : '↓';
  if(state.yuklemeGosterilenRapor) renderYuklemeTable(state.yuklemeGosterilenRapor);
});

const BAYI_HAKEDIS_KDV_ORANI = 1.20;
const ISKONTO_GRUP_TANIMLARI = new Set(['Fatura altı', 'Ciro Primi']);

function buildBayiHakedisRaporu(ciroPrimiRows, donemselIskontoRows, musteriMasterMap){
  if((!ciroPrimiRows || !ciroPrimiRows.length) && (!donemselIskontoRows || !donemselIskontoRows.length)){
    throw new Error('Ciro Primi ve Dönemsel İskonto dosyalarında satır bulunamadı.');
  }
  const noktaMap = new Map();
  function noktaRow(kod, adi, temsilciAday){
    if(!noktaMap.has(kod)) noktaMap.set(kod, {kod, adi: adi||kod, temsilci: '—', iskonto:0, katkiPayi:0, kayitlar:[]});
    const r = noktaMap.get(kod);
    if(adi && r.adi===r.kod) r.adi = adi;
    const masterTemsilci = musteriMasterMap && musteriMasterMap.get(kod);
    if(masterTemsilci) r.temsilci = masterTemsilci;
    else if(r.temsilci==='—' && temsilciAday) r.temsilci = temsilciAday;
    return r;
  }

  (ciroPrimiRows||[]).forEach(row=>{
    const kod = String(row['Müşteri']||'').trim();
    if(!kod) return;
    const grupTanim = String(row['Grup Tanım']||'').trim();
    const netTutar = Number(row['Net Tutar'])||0;
    const kategoriIskontoMu = ISKONTO_GRUP_TANIMLARI.has(grupTanim);
    const r = noktaRow(kod, row['Nokta Adı'], row['Satış Temsilcisi']);
    if(kategoriIskontoMu) r.iskonto += netTutar;
    else r.katkiPayi += netTutar;
    r.kayitlar.push({
      kaynak: 'Ciro Primi', kategori: kategoriIskontoMu ? 'İskonto' : 'İşletme Katkı Payı',
      tarih: excelDateToJS(row['Fatura Tarihi']), aciklama: grupTanim || '—', belgeNo: row['Fatura No'],
      tutarHaric: netTutar, tutarKdvli: netTutar * BAYI_HAKEDIS_KDV_ORANI,
    });
  });

  (donemselIskontoRows||[]).forEach(row=>{
    const kod = String(row['Nokta Kodu']||'').trim();
    if(!kod) return;
    const hakedisTutar = Number(row['Hakediş Tutar'])||0;
    const r = noktaRow(kod, row['Nokta Adı'], row['Temsilci Adı']);
    r.iskonto += hakedisTutar;
    r.kayitlar.push({
      kaynak: 'Dönemsel İskonto', kategori: 'İskonto',
      tarih: excelDateToJS(row['Fatura Tarihi']), aciklama: row['Dönem'] || row['Perid'] || '—', belgeNo: row['SD Belgesi'],
      tutarHaric: hakedisTutar, tutarKdvli: hakedisTutar * BAYI_HAKEDIS_KDV_ORANI,
    });
  });

  const noktalar = Array.from(noktaMap.values()).map(r=>({
    kod: r.kod, adi: r.adi, temsilci: r.temsilci,
    iskontoKdvli: r.iskonto * BAYI_HAKEDIS_KDV_ORANI,
    katkiPayiKdvli: r.katkiPayi * BAYI_HAKEDIS_KDV_ORANI,
    toplamHaric: r.iskonto + r.katkiPayi,
    toplamKdvli: (r.iskonto + r.katkiPayi) * BAYI_HAKEDIS_KDV_ORANI,
    kayitSayisi: r.kayitlar.length,
    iskontoSayisi: r.kayitlar.filter(k=>k.kategori==='İskonto').length,
    katkiPayiSayisi: r.kayitlar.filter(k=>k.kategori==='İşletme Katkı Payı').length,
    kayitlar: r.kayitlar.slice().sort((a,b)=> (b.tarih||0)-(a.tarih||0)),
  })).sort((a,b)=> b.toplamKdvli - a.toplamKdvli);

  const genelToplam = {
    iskontoKdvli: sum(noktalar,'iskontoKdvli'),
    katkiPayiKdvli: sum(noktalar,'katkiPayiKdvli'),
    toplamHaric: sum(noktalar,'toplamHaric'),
    toplamKdvli: sum(noktalar,'toplamKdvli'),
    kayitSayisi: sum(noktalar,'kayitSayisi'),
    iskontoSayisi: sum(noktalar,'iskontoSayisi'),
    katkiPayiSayisi: sum(noktalar,'katkiPayiSayisi'),
  };

  return { noktalar, genelToplam, olusturulmaZamani: new Date().toISOString() };
}

async function bayiHakedisRaporuOlustur(){
  state.bayiHakedisHata = null;
  // KALICI ARŞİVDEN OKUMA (kullanıcı isteği, 24.07.2026): artık state.files.ciroPrimi/donemselIskonto
  // (tek-slot, sadece son yüklenen dosya) DEĞİL, state.ciroPrimiArsivi/donemselIskontoArsivi
  // (kalıcı, biriken, Bayi Hak Ediş ile çapraz kontrollü) okunur. 'karar_bekliyor' işaretli
  // kayıtlar — kullanıcı kararı: "belirsiz durumda tutara dahil edilmesin" — toplamdan HARİÇ
  // tutulur, ama sayıları ayrı bir rozet olarak (bayiHakedisKararBekliyorSayisi) saklanır.
  const ciroPrimiTumu = Object.values(state.ciroPrimiArsivi||{});
  const donemselIskontoTumu = Object.values(state.donemselIskontoArsivi||{});
  const ciroPrimiRows = ciroPrimiTumu.filter(r=>r._durum!=='karar_bekliyor');
  const donemselIskontoRows = donemselIskontoTumu.filter(r=>r._durum!=='karar_bekliyor');
  state.bayiHakedisKararBekliyorSayisi =
    ciroPrimiTumu.filter(r=>r._durum==='karar_bekliyor').length +
    donemselIskontoTumu.filter(r=>r._durum==='karar_bekliyor').length;
  if(!ciroPrimiRows.length && !donemselIskontoRows.length){
    state.bayiHakedisReport = null;
    return;
  }
  try{
    const rapor = buildBayiHakedisRaporu(ciroPrimiRows, donemselIskontoRows, state.musteriMasterMap);
    state.bayiHakedisReport = rapor;
    await bayiHakedisKaydet(rapor);
  }catch(err){
    console.error('Bayi Hakediş raporu oluşturulamadı:', err);
    state.bayiHakedisHata = err.message;
  }
}

function getBayiHakedisFilteredSorted(){
  const report = state.bayiHakedisReport;
  if(!report) return [];
  const q = document.getElementById('bayiHakedisSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('bayiHakedisTemsilciFilter').value;
  let rows = report.noktalar.filter(r=>{
    if(q && !musteriAramaEslesiyorMu(q, r.adi, r.kod)) return false;
    if(temsilci && r.temsilci !== temsilci) return false;
    return true;
  });
  const {key,dir} = state.bhSort;
  rows = rows.slice().sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

function populateBayiHakedisTemsilciFilter(){
  const report = state.bayiHakedisReport;
  const sel = document.getElementById('bayiHakedisTemsilciFilter');
  const current = sel.value;
  const set = report ? Array.from(new Set(report.noktalar.map(r=>r.temsilci).filter(t=>t && t!=='—'))).sort((a,b)=>a.localeCompare(b,'tr')) : [];
  sel.innerHTML = '<option value="">Tüm temsilciler</option>' + set.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if(current && set.includes(current)) sel.value = current;
}


function renderBayiHakedisDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('bayiHakedisDahaFazlaWrap');
  const info = document.getElementById('bayiHakedisDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} nokta gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

function renderBayiHakedisTable(resetSayfa=true){
  if(resetSayfa) state.bhGosterilen = MUSTERI_SAYFA_BOYUTU;
  const report = state.bayiHakedisReport;
  const rows = getBayiHakedisFilteredSorted();
  document.getElementById('bayiHakedisCount').textContent = rows.length.toLocaleString('tr-TR') + ' nokta';
  const list = document.getElementById('bayiHakedisTbody');
  const g = report.genelToplam;
  document.getElementById('bayiHakedisGenelToplam').innerHTML =
    `Genel Toplam — Kayıt: <b>${g.kayitSayisi}</b> · İskonto: <b>${g.iskontoSayisi}</b> · İşletme Katkı Payı: <b>${g.katkiPayiSayisi}</b> · Toplam Hakediş (KDV Dahil): <b>${TLKurus(g.toplamKdvli)}</b>`;
  if(!rows.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aramanızla/filtrenizle eşleşen nokta bulunamadı.</div>`;
    renderBayiHakedisDahaFazlaBtn(0, 0);
    return;
  }
  const gosterilecekSayi = Math.min(state.bhGosterilen, rows.length);
  const gosterilecekRows = rows.slice(0, gosterilecekSayi);
  state.bayiHakedisKodMap = new Map(rows.map(r=>[r.kod, r]));
  list.innerHTML = gosterilecekRows.map(r=>{
    // FATURA ALINDI SAYACI (kullanıcı isteği, 24.07.2026): bu noktanın hakediş satırlarından
    // kaçının "Faturasını Aldım" işaretli olduğunu ana listede de gösterir.
    const alindiSayisi = (r.kayitlar||[]).filter(k=>{
      const anahtar = typeof hakedisBelgeNoAnahtari === 'function' ? hakedisBelgeNoAnahtari(k.belgeNo) : String(k.belgeNo||'').trim();
      return anahtar && state.hakedisFaturaAlindi && state.hakedisFaturaAlindi[anahtar];
    }).length;
    return `<div class="htk-card" data-kod="${escapeHtml(r.kod)}">
      <div class="htk-head">
        <div style="min-width:0;">
          <div class="htk-musteri-row"><span class="htk-musteri">${escapeHtml(r.adi)}</span></div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(r.temsilci)}</div>
        </div>
        <span class="htk-badge-pill" style="background:var(--accent-soft);color:var(--accent-deep);">
          <span class="htk-badge-circle" style="background:var(--accent-deep);">${r.kayitSayisi || 0}</span>KAYIT
        </span>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${TLKurus(r.toplamKdvli)}</span>
        <span class="htk-gecikme" style="color:var(--ink-faint);">toplam hakediş (KDV dahil)</span>
      </div>
      <div class="htk-inline-stats">
        <span>İskonto: ${r.iskontoSayisi ? '<b>'+r.iskontoSayisi+'</b>' : '<span class="zero">—</span>'}</span>
        <span>İşletme Katkı: ${r.katkiPayiSayisi ? '<b>'+r.katkiPayiSayisi+'</b>' : '<span class="zero">—</span>'}</span>
        ${alindiSayisi ? `<span style="color:var(--success,#1A8A4C);"><i class="fa-solid fa-check" aria-hidden="true" style="font-size:10px;"></i> Fatura Alındı: <b>${alindiSayisi}</b></span>` : ''}
      </div>
      <div class="htk-alt" style="justify-content:flex-end;">
        <div class="htk-alt-actions">
          <button type="button" class="nokta-detay-btn primary hakedis-detay-btn" data-kod="${escapeHtml(r.kod)}">Detay ↗</button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderBayiHakedisDahaFazlaBtn(gosterilecekSayi, rows.length);
}

function hakedisModalAc(kod){
  state.hakedisModalAcikKod = kod;
  let r = state.bayiHakedisKodMap && state.bayiHakedisKodMap.get(kod);
  // DÜZELTME: bayiHakedisKodMap SADECE "Bayi Hakediş" sekmesi bir kez render edildiğinde dolar.
  // Bu popup artık Fatura Kontrol/Genel Rapor içindeki "Hakediş" butonundan da (o sekmeye hiç
  // girilmeden) açılabildiği için, harita boşsa/kod bulunamazsa doğrudan state.bayiHakedisReport
  // (rapor oluşturulduğu anda her zaman dolu olan asıl kaynak) üzerinden arıyoruz.
  if(!r && state.bayiHakedisReport && Array.isArray(state.bayiHakedisReport.noktalar)){
    r = state.bayiHakedisReport.noktalar.find(n=>n.kod===kod);
  }
  if(!r){
    document.getElementById('hakedisModalAvatar').textContent = '';
    document.getElementById('hakedisModalTitle').textContent = 'Hakediş Kayıtları';
    document.getElementById('hakedisModalSub').textContent = '';
    document.getElementById('hakedisModalTbody').innerHTML = `<tr><td colspan="4" class="empty-state">Nokta bulunamadı — lütfen listeyi yenileyip tekrar deneyin.</td></tr>`;
    document.getElementById('hakedisModalOverlay').classList.add('open');
    return;
  }
  document.getElementById('hakedisModalAvatar').textContent = avatarBaslangic(r.adi);
  document.getElementById('hakedisModalTitle').textContent = r.adi;
  document.getElementById('hakedisModalSub').textContent = r.kod + ' · ' + (r.kayitSayisi||0) + ' kayıt';
  document.getElementById('hakedisModalTbody').innerHTML = (r.kayitlar||[]).length ? r.kayitlar.map(k=>{
    const belgeNo = k.belgeNo!=null ? String(k.belgeNo).trim() : '';
    const belgeNoAnahtari = typeof hakedisBelgeNoAnahtari === 'function' ? hakedisBelgeNoAnahtari(belgeNo) : belgeNo;
    const alindiMi = belgeNoAnahtari && state.hakedisFaturaAlindi && state.hakedisFaturaAlindi[belgeNoAnahtari];
    // Belge No yoksa (beklenmeyen veri) toggle işlevsiz gösterilir — yanlış kayda işaret sürmesin.
    // data-* attribute'ları toggle anında "Faturası Alınanlar" listesi için gereken tüm detayı
    // (müşteri, temsilci, kaynak, tutar, tarih) taşır — bkz. hakedisModalTbody click listener.
    const toggleHtml = belgeNo
      ? `<button type="button" class="hakedis-fatura-toggle${alindiMi?' alindi':''}" data-belge-no="${escapeHtml(belgeNo)}"
          data-musteri-kod="${escapeHtml(r.kod)}" data-musteri-adi="${escapeHtml(r.adi)}" data-temsilci="${escapeHtml(r.temsilci||'—')}"
          data-kaynak="${escapeHtml(k.kaynak||'')}" data-tarih="${k.tarih instanceof Date ? k.tarih.toISOString() : ''}"
          data-tutar-haric="${k.tutarHaric||0}" data-tutar-kdvli="${k.tutarKdvli||0}"
          title="${alindiMi ? 'Faturası alınmıştı — geri almak için tıklayın' : 'Faturasını aldıysanız işaretleyin'}">
          <i class="fa-solid ${alindiMi?'fa-check':'fa-circle-question'}" aria-hidden="true"></i>${alindiMi?'Alındı':'Bekliyor'}
        </button>`
      : '<span class="empty-state" style="padding:0;">—</span>';
    return `<tr>
    <td>${fmtDate(k.tarih)}</td><td>${escapeHtml(k.kategori)}</td>
    <td class="num">${TLKurus(k.tutarHaric)}</td><td class="num">${TLKurus(k.tutarKdvli)}</td>
    <td style="text-align:center;">${toggleHtml}</td>
  </tr>`;
  }).join('') : `<tr><td colspan="5" class="empty-state">Hakediş kaydı bulunamadı</td></tr>`;
  document.getElementById('hakedisModalOverlay').classList.add('open');
}
function hakedisModalKapat(){
  state.hakedisModalAcikKod = null;
  document.getElementById('hakedisModalOverlay').classList.remove('open');
}
document.getElementById('hakedisModalClose').addEventListener('click', hakedisModalKapat);
document.getElementById('hakedisModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='hakedisModalOverlay') hakedisModalKapat();
});
// HAKEDİŞ "FATURASINI ALDIM" İŞARETLEME (kullanıcı isteği, 24.07.2026): satırdaki toggle
// butonuna tıklanınca kalıcı olarak işaretlenir/kaldırılır (bkz. hakedisFaturaAlindiToggle,
// 02-bulut-ve-auth.js) ve modal geçerli kod için hemen yeniden çizilir — kullanıcı sonucu
// anında (yeşile dönen buton) görür.
document.getElementById('hakedisModalTbody').addEventListener('click', async (e)=>{
  const btn = e.target.closest('.hakedis-fatura-toggle');
  if(!btn) return;
  e.stopPropagation();
  const belgeNo = btn.getAttribute('data-belge-no');
  if(!belgeNo) return;
  btn.disabled = true;
  const detay = {
    musteriKod: btn.getAttribute('data-musteri-kod')||'', musteriAdi: btn.getAttribute('data-musteri-adi')||'',
    temsilci: btn.getAttribute('data-temsilci')||'—', kaynak: btn.getAttribute('data-kaynak')||'',
    tarih: btn.getAttribute('data-tarih')||'',
    tutarHaric: Number(btn.getAttribute('data-tutar-haric'))||0, tutarKdvli: Number(btn.getAttribute('data-tutar-kdvli'))||0,
  };
  await hakedisFaturaAlindiToggle(belgeNo, detay);
  if(state.hakedisModalAcikKod) hakedisModalAc(state.hakedisModalAcikKod);
  renderBayiHakedisTable(); // ana listedeki "işaretli" göstergesi de güncellensin
  if(typeof renderFaturasiAlinanlarTable==='function') renderFaturasiAlinanlarTable();
});
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.hakedis-detay-btn');
  if(!btn) return;
  e.stopPropagation();
  hakedisModalAc(btn.getAttribute('data-kod'));
});

// kanalFiltre: 'acik' | 'kapali' | null (null = tümü, eski/genel kullanım için geriye dönük uyumlu)
function faturaKesilmeyenModalRenderList(temsilciKey, kanalFiltre){
  const r = state.sellOutTemsilciMap && state.sellOutTemsilciMap.get(temsilciKey);
  const list = document.getElementById('faturaKesilmeyenModalList');
  const kanalAdi = kanalFiltre==='acik' ? 'Açık Kanal' : (kanalFiltre==='kapali' ? 'Kapalı Kanal' : null);
  const tamListe = (r ? r.faturaKesilmeyenListe : []) || [];
  const filtreliListe = kanalAdi ? tamListe.filter(n=> n.kanal===kanalAdi) : tamListe;
  if(!r || !filtreliListe.length){
    list.innerHTML = `<div class="fkns-empty">${kanalAdi ? 'Bu kanalda tüm aktif noktalara fatura kesilmiş' : 'Tüm aktif noktalara fatura kesilmiş'} <i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i></div>`;
    return;
  }
  const noktaSort = state.sellOutNoktaSort.get(temsilciKey) || {key:'adi', dir:1};
  const siraliListe = filtreliListe.slice().sort((a,b)=>{
    const av = String(a[noktaSort.key]||''), bv = String(b[noktaSort.key]||'');
    return noktaSort.dir * av.localeCompare(bv, 'tr');
  });
  // n.kanal: 'Açık Kanal' | 'Kapalı Kanal' | null (Müşteri Master'da Satış Kanalı Tanımı bilinmeyen/
  // "Key Account" gibi sınıflandırılamayan noktalar için null — bu noktalarda rozet gösterilmez).
  list.innerHTML = siraliListe.map(n=>{
    const kanalRozet = n.kanal
      ? `<span class="popup-nokta-kanal-badge ${n.kanal==='Açık Kanal'?'acik':'kapali'}"><i class="fa-solid ${n.kanal==='Açık Kanal'?'fa-lock-open':'fa-lock'}" aria-hidden="true"></i>${n.kanal==='Açık Kanal'?'Açık':'Kapalı'}</span>`
      : '';
    return `
    <div class="popup-nokta-row">
      <div class="popup-nokta-avatar">${escapeHtml(avatarBaslangic(n.adi))}</div>
      <div class="popup-nokta-info">
        <div class="popup-nokta-adi" title="${escapeHtml(n.adi)}">${escapeHtml(n.adi)}</div>
        <div class="popup-nokta-kod">${escapeHtml(n.kod)}</div>
      </div>
      ${kanalRozet}
    </div>`;
  }).join('');
}
// kanalFiltre: 'acik' | 'kapali' | undefined (buton her zaman birini belirtir; undefined sadece
// eski/harici çağrılar için geriye dönük uyumluluk amaçlı, tüm listeyi gösterir).
function faturaKesilmeyenModalAc(temsilciKey, kanalFiltre){
  const r = state.sellOutTemsilciMap && state.sellOutTemsilciMap.get(temsilciKey);
  state.faturaKesilmeyenModalKanalFiltre = kanalFiltre || null;
  const kanalAdi = kanalFiltre==='acik' ? 'Açık Kanal' : (kanalFiltre==='kapali' ? 'Kapalı Kanal' : null);
  document.getElementById('faturaKesilmeyenModalAvatar').textContent = r ? avatarBaslangic(r.temsilci) : '';
  document.getElementById('faturaKesilmeyenModalTitle').textContent = r ? r.temsilci : 'Temsilci bulunamadı';
  const modalSub = document.querySelector('#faturaKesilmeyenModal .modal-head-navy-sub');
  if(modalSub) modalSub.textContent = kanalAdi ? `Fatura Kesilmeyen Aktif Noktalar — ${kanalAdi}` : 'Fatura Kesilmeyen Aktif Noktalar';
  document.getElementById('faturaKesilmeyenModalPill').textContent = r
    ? (kanalFiltre==='acik' ? r.faturaKesilmeyenNoktaAcik : (kanalFiltre==='kapali' ? r.faturaKesilmeyenNoktaKapali : r.faturaKesilmeyenNokta)) + ' nokta'
    : '';
  const noktaSort = state.sellOutNoktaSort.get(temsilciKey) || {key:'adi', dir:1};
  document.getElementById('faturaKesilmeyenModalSortSelect').value = noktaSort.key;
  document.getElementById('faturaKesilmeyenModalSortDirBtn').textContent = noktaSort.dir===1 ? '↓' : '↑';
  document.getElementById('faturaKesilmeyenModalSortSelect').dataset.temsilciKey = temsilciKey;
  document.getElementById('faturaKesilmeyenModalSortDirBtn').dataset.temsilciKey = temsilciKey;
  faturaKesilmeyenModalRenderList(temsilciKey, kanalFiltre || null);
  document.getElementById('faturaKesilmeyenModalOverlay').classList.add('open');
}
function faturaKesilmeyenModalKapat(){
  document.getElementById('faturaKesilmeyenModalOverlay').classList.remove('open');
}
document.getElementById('faturaKesilmeyenModalClose').addEventListener('click', faturaKesilmeyenModalKapat);
document.getElementById('faturaKesilmeyenModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='faturaKesilmeyenModalOverlay') faturaKesilmeyenModalKapat();
});
document.getElementById('faturaKesilmeyenModalSortSelect').addEventListener('change', (e)=>{
  const key = e.target.dataset.temsilciKey;
  const mevcut = state.sellOutNoktaSort.get(key) || {key:'adi', dir:1};
  state.sellOutNoktaSort.set(key, {key: e.target.value, dir: mevcut.dir});
  faturaKesilmeyenModalRenderList(key, state.faturaKesilmeyenModalKanalFiltre || null);
});
document.getElementById('faturaKesilmeyenModalSortDirBtn').addEventListener('click', (e)=>{
  const key = e.target.dataset.temsilciKey;
  const mevcut = state.sellOutNoktaSort.get(key) || {key:'adi', dir:1};
  const yeniDir = mevcut.dir*-1;
  state.sellOutNoktaSort.set(key, {key: mevcut.key, dir: yeniDir});
  e.target.textContent = yeniDir===1 ? '↓' : '↑';
  faturaKesilmeyenModalRenderList(key, state.faturaKesilmeyenModalKanalFiltre || null);
});
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.fatura-kesilmeyen-detay-btn');
  if(!btn) return;
  e.stopPropagation();
  faturaKesilmeyenModalAc(btn.getAttribute('data-temsilci-key'), btn.getAttribute('data-kanal'));
});

function renderBayiHakedisKararBekliyorRozet(){
  const rozet = document.getElementById('bayiHakedisKararBekliyorRozet');
  const sayiEl = document.getElementById('bayiHakedisKararBekliyorSayi');
  if(!rozet || !sayiEl) return;
  const sayi = state.bayiHakedisKararBekliyorSayisi || 0;
  if(sayi > 0){
    sayiEl.textContent = sayi.toLocaleString('tr-TR');
    rozet.style.display = 'inline-flex';
  } else {
    rozet.style.display = 'none';
  }
}
document.getElementById('bayiHakedisKararBekliyorRozet').addEventListener('click', ()=>{
  if(state.arsivDegisiklikRaporu && state.arsivDegisiklikRaporu.length && typeof arsivDegisiklikRaporuModalAc==='function'){
    arsivDegisiklikRaporuModalAc(state.arsivDegisiklikRaporu);
  } else {
    alert('Karar bekleyen kayıtların detayını görmek için son yüklemedeki Arşiv Değişiklik Raporu\'na bakın. Yeni bir yükleme yapıldığında bu rapor otomatik açılır.');
  }
});

function renderBayiHakedisView(){
  const panel = document.getElementById('bayiHakedisPanel');
  const bosPanel = document.getElementById('bayiHakedisBosPanel');
  const bosMesaj = document.getElementById('bayiHakedisBosMesaj');
  renderBayiHakedisKararBekliyorRozet();

  // "Faturası Alınanlar" state.hakedisFaturaAlindi'den beslenir — bayiHakedisReport'tan
  // BAĞIMSIZ (kullanıcı isteği, 24.07.2026: "rapordan bağımsız, kalıcı liste"). Bu yüzden
  // rapor henüz oluşturulmamış olsa bile (aşağıdaki erken return'den ÖNCE) sekme sayacı ve
  // -eğer o sekme aktifse- liste güncellenir.
  const alinanSayisi = Object.keys(state.hakedisFaturaAlindi||{}).length;
  const alinanSayiEl = document.getElementById('bhSubtabAlinanlarSayi');
  if(alinanSayiEl) alinanSayiEl.textContent = alinanSayisi.toLocaleString('tr-TR');
  if(state.bhAktifSubview === 'alinanlar'){
    populateFaturasiAlinanlarTemsilciFilter();
    renderFaturasiAlinanlarTable();
  }

  if(!state.bayiHakedisReport){
    panel.style.display = 'none';
    bosPanel.style.display = 'block';
    bosMesaj.textContent = state.bayiHakedisHata
      ? ('Bayi Hakediş raporu oluşturulamadı: ' + state.bayiHakedisHata)
      : 'Bayi Hakediş raporu için ana yükleme sayfasında hem "Ciro Primi" hem de "Dönemsel İskonto" dosyalarını yükleyip "Raporu Oluştur"a basmanız gerekir.';
    // Rapor yoksa "Noktalar" boş görünür ama "Faturası Alınanlar" (yukarıda zaten güncellendi)
    // yine de erişilebilir kalır — panel tamamen gizlenmez, sadece Noktalar içeriği boş kalır.
    const noktalarSayiEl = document.getElementById('bhSubtabNoktalarSayi');
    if(noktalarSayiEl) noktalarSayiEl.textContent = '0';
    if(state.bhAktifSubview !== 'alinanlar'){
      return;
    }
    panel.style.display = alinanSayisi ? 'block' : 'none';
    bosPanel.style.display = alinanSayisi ? 'none' : 'block';
    return;
  }
  bosPanel.style.display = 'none';
  panel.style.display = 'block';
  populateBayiHakedisTemsilciFilter();
  renderBayiHakedisTable();
  const noktalarSayiEl = document.getElementById('bhSubtabNoktalarSayi');
  if(noktalarSayiEl) noktalarSayiEl.textContent = (state.bayiHakedisReport.noktalar||[]).length.toLocaleString('tr-TR');
}

// BAYİ HAKEDİŞ ALT-SEKMELERİ (kullanıcı isteği, 24.07.2026): "Noktalar" / "Faturası Alınanlar"
// arası geçiş — state.bhAktifSubview görünen sekmeyi tutar, sayfa yenilense de (render tekrar
// çağrılınca) doğru sekme gösterilmeye devam eder.
function bhSubviewGecis(hedef){
  state.bhAktifSubview = hedef;
  document.querySelectorAll('.bh-subtab').forEach(btn=>{
    const aktifMi = btn.getAttribute('data-bhview') === hedef;
    btn.classList.toggle('active', aktifMi);
    btn.setAttribute('aria-selected', aktifMi ? 'true' : 'false');
  });
  document.getElementById('bhSubview-noktalar').style.display = hedef==='noktalar' ? '' : 'none';
  document.getElementById('bhSubview-alinanlar').style.display = hedef==='alinanlar' ? '' : 'none';
  if(hedef==='alinanlar'){
    populateFaturasiAlinanlarTemsilciFilter();
    renderFaturasiAlinanlarTable();
  }
}
document.querySelectorAll('.bh-subtab').forEach(btn=>{
  btn.addEventListener('click', ()=> bhSubviewGecis(btn.getAttribute('data-bhview')));
});

// FATURASI ALINANLAR — filtre/arama/liste (kullanıcı isteği, 24.07.2026)
function getFaturasiAlinanlarFilteredSorted(){
  const tumu = Object.values(state.hakedisFaturaAlindi||{});
  const q = (document.getElementById('faturasiAlinanlarSearchInput').value||'').trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('faturasiAlinanlarTemsilciFilter').value;
  return tumu.filter(k=>{
    if(q && !musteriAramaEslesiyorMu(q, k.musteriAdi, k.musteriKod)) return false;
    if(temsilci && k.temsilci !== temsilci) return false;
    return true;
  }).sort((a,b)=> new Date(b.isaretlemeZamani||0) - new Date(a.isaretlemeZamani||0));
}

function populateFaturasiAlinanlarTemsilciFilter(){
  const sel = document.getElementById('faturasiAlinanlarTemsilciFilter');
  const current = sel.value;
  const set = Array.from(new Set(Object.values(state.hakedisFaturaAlindi||{}).map(k=>k.temsilci).filter(t=>t && t!=='—'))).sort((a,b)=>a.localeCompare(b,'tr'));
  sel.innerHTML = '<option value="">Tüm temsilciler</option>' + set.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if(current && set.includes(current)) sel.value = current;
}

function faturasiAlinanlarSatirHtml(k){
  const kaynakRenk = k.kaynak==='Dönemsel İskonto' ? {bg:'#FDF3D9',fg:'#8A6D1F'} : {bg:'#DCEBFC',fg:'#1D5FB8'};
  const tarih = k.tarih ? new Date(k.tarih) : null;
  return `<div class="htk-card" data-belge-no="${escapeHtml(k.belgeNo)}">
    <div class="htk-head">
      <div style="min-width:0;">
        <div class="htk-musteri-row"><span class="htk-musteri">${escapeHtml(k.musteriAdi||'—')}</span></div>
        <div class="htk-temsilci">${escapeHtml(k.musteriKod||'')}</div>
      </div>
      <span class="htk-badge-pill" style="background:${kaynakRenk.bg};color:${kaynakRenk.fg};">${escapeHtml(k.kaynak||'—')}</span>
    </div>
    <div class="htk-borc-satir">
      <span class="htk-borc">${TL(k.tutarKdvli||0)}</span>
      <span class="htk-gecikme" style="color:var(--ink-faint);">KDV dahil</span>
    </div>
    <div class="htk-inline-stats">
      <span>Belge No: <b>${escapeHtml(k.belgeNo||'—')}</b></span>
      <span>Temsilci: <b>${escapeHtml(k.temsilci||'—')}</b></span>
      ${tarih ? `<span>Tarih: <b>${fmtDate(tarih)}</b></span>` : ''}
    </div>
    <div class="htk-alt" style="justify-content:flex-end;">
      <div class="htk-alt-actions">
        <button type="button" class="nokta-detay-btn faturasi-alinanlar-geri-al-btn" data-belge-no="${escapeHtml(k.belgeNo)}">Geri Al</button>
      </div>
    </div>
  </div>`;
}

function renderFaturasiAlinanlarTable(){
  const list = document.getElementById('faturasiAlinanlarTbody');
  const toplamEl = document.getElementById('faturasiAlinanlarGenelToplam');
  if(!list) return;
  const rows = getFaturasiAlinanlarFilteredSorted();
  list.innerHTML = rows.length ? rows.map(faturasiAlinanlarSatirHtml).join('')
    : '<div class="empty-state">Henüz "Faturasını Aldım" işaretlenmiş bir hakediş kaydı yok. İşaretleme, Bayi Hakediş → Noktalar → müşteri detayından yapılır.</div>';
  if(toplamEl){
    const toplamTutar = rows.reduce((s,k)=> s + (k.tutarKdvli||0), 0);
    toplamEl.textContent = rows.length ? `${rows.length.toLocaleString('tr-TR')} kayıt — toplam ${TL(toplamTutar)} (KDV dahil)` : '';
  }
}

document.getElementById('faturasiAlinanlarTbody').addEventListener('click', async (e)=>{
  const btn = e.target.closest('.faturasi-alinanlar-geri-al-btn');
  if(!btn) return;
  const belgeNo = btn.getAttribute('data-belge-no');
  if(!belgeNo) return;
  btn.disabled = true;
  await hakedisFaturaAlindiToggle(belgeNo); // detay verilmezse zaten kayıt SİLİNİR (toggle geri alma)
  renderFaturasiAlinanlarTable();
  renderBayiHakedisTable(); // Noktalar sekmesindeki rozet ve modal (açıksa) da senkron kalsın
  if(state.hakedisModalAcikKod) hakedisModalAc(state.hakedisModalAcikKod);
  const alinanSayiEl = document.getElementById('bhSubtabAlinanlarSayi');
  if(alinanSayiEl) alinanSayiEl.textContent = Object.keys(state.hakedisFaturaAlindi||{}).length.toLocaleString('tr-TR');
});

const debouncedRenderFaturasiAlinanlarTable = debounce(()=>renderFaturasiAlinanlarTable());
wireSearchInput('faturasiAlinanlarSearchInput', 'faturasiAlinanlarSearchClearBtn', debouncedRenderFaturasiAlinanlarTable);
wireSearchClear('faturasiAlinanlarSearchInput', 'faturasiAlinanlarSearchClearBtn', renderFaturasiAlinanlarTable);
document.getElementById('faturasiAlinanlarTemsilciFilter').addEventListener('change', ()=>renderFaturasiAlinanlarTable());

const debouncedRenderBayiHakedisTable = debounce(()=>renderBayiHakedisTable());
wireSearchInput('bayiHakedisSearchInput', 'bayiHakedisSearchClearBtn', debouncedRenderBayiHakedisTable);
wireSearchClear('bayiHakedisSearchInput', 'bayiHakedisSearchClearBtn', renderBayiHakedisTable);
document.getElementById('bayiHakedisTemsilciFilter').addEventListener('change', ()=>renderBayiHakedisTable());

const bayiHakedisSortSelect = document.getElementById('bayiHakedisSortSelect');
const bayiHakedisSortDirBtn = document.getElementById('bayiHakedisSortDirBtn');
bayiHakedisSortSelect.value = state.bhSort.key;
bayiHakedisSortDirBtn.textContent = state.bhSort.dir===1 ? '↑' : '↓';
bayiHakedisSortSelect.addEventListener('change', ()=>{
  state.bhSort.key = bayiHakedisSortSelect.value;
  renderBayiHakedisTable();
});
bayiHakedisSortDirBtn.addEventListener('click', ()=>{
  state.bhSort.dir *= -1;
  bayiHakedisSortDirBtn.textContent = state.bhSort.dir===1 ? '↑' : '↓';
  renderBayiHakedisTable();
});
document.getElementById('bayiHakedisDahaFazlaBtn').addEventListener('click', ()=>{
  state.bhGosterilen += MUSTERI_SAYFA_BOYUTU;
  renderBayiHakedisTable(false);
});


const AY_ADLARI_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function ayEtiketi(ayKey){
  if(!ayKey) return '';
  const parts = ayKey.split('-');
  const ay = parseInt(parts[1],10);
  return (AY_ADLARI_TR[ay-1]||ayKey) + ' ' + parts[0];
}
function ayGunAraligi(ayKey){
  const parts = ayKey.split('-').map(Number);
  const y = parts[0], m = parts[1];
  const ilk = new Date(y, m-1, 1);
  const son = new Date(y, m, 0);
  return {ilkKey: dateKeyLocal(ilk), sonKey: dateKeyLocal(son)};
}

function musteriTvIcinGecerliMi(musteriKodu){
  return typeof musteriKodu === 'string' && musteriKodu.trim().charAt(0) === '5';
}

function gunKeyEkle(gunKey, deltaGun){
  const d = new Date(gunKey+'T00:00:00');
  d.setDate(d.getDate()+deltaGun);
  return dateKeyLocal(d);
}

// Ay dropdown'u ve "kaç gün arşivlenmiş" bilgisi için yalnızca gün ANAHTARLARI (shallow=true ile,
// birkaç KB) bir kez çekilip oturum boyunca önbellekte tutulur; zorla=true (<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Yenile) verilirse
// yeniden indirilir.
let tvGunAnahtarlariOnbellek = null;
async function tvGunAnahtarlariniGetir(zorla){
  if(!cloudEnabled()) return Object.keys(state.faturaArsivCache||{}).sort();
  if(tvGunAnahtarlariOnbellek && !zorla) return tvGunAnahtarlariOnbellek;
  const gunler = await loadFaturaKontrolArsivGunAnahtarlariFromCloud();
  tvGunAnahtarlariOnbellek = gunler || Object.keys(state.faturaArsivCache||{}).sort();
  return tvGunAnahtarlariOnbellek;
}

async function tvMevcutAylar(zorla){
  // Ay listesi artık arşivin tamamı indirilip (tahsilat/bayi hakediş kayıtları taranarak) değil,
  // doğrudan yükleme günü anahtarlarından türetiliyor. Kaç gün arşivlenmiş olursa olsun bu tek
  // istek birkaç KB'ı geçmez. (Ödün: yalnızca geçmişe dönük tarihli tek bir belgeyle var olan ve
  // hiç "Raporu Oluştur" yapılmamış bir ay, dropdown'a girmeyebilir.)
  const gunler = await tvGunAnahtarlariniGetir(zorla);
  const set = new Set();
  gunler.forEach(g=>{ if(g && g.length>=7) set.add(g.slice(0,7)); });
  // TEMMUZ 2026 ÖNCESİ AYLAR MANUEL OLARAK GİZLENİR (kullanıcı kararı): Otomatik günlük snapshot
  // mekanizması sadece BUGÜNDEN itibaren çalışıyor (bkz. gunlukSnapshotGerekiyorsaAl) — geçmişte
  // (Temmuz 2026'dan önce) hiç "Raporu Oluştur"a basılmamış günler için asla snapshot alınamaz,
  // bu yüzden o aylar seçilse bile "veri bulunamadı" ile sonuçlanırdı. Kullanıcı, otomatik tespit
  // yerine (performans maliyeti + belirsizlik) sabit bir tarih sınırı tercih etti: dropdown'da
  // 2026-07'den daha eski ay hiç görünmez.
  const TV_MIN_AY_KEY = '2026-07';
  return Array.from(set).filter(ay=> ay>=TV_MIN_AY_KEY).sort();
}

// Seçilen ayKey için gereken gün aralığını (ay içi + önceki bakiye karşılaştırması için bir miktar
// geriye dönük "lookback") buluttan çeker ve state.faturaArsivCache'in ÜZERİNE YAZMADAN, sadece
// eksik günleri ekleyerek birleştirir. Böylece arşivin tamamı değil, yalnızca ilgili birkaç
// haftalık/aylık dilim ağa iner. Aynı ay bu oturumda zaten çekildiyse (zorla verilmedikçe) tekrar
// istek atılmaz.
const tvAyVerisiGetirilenler = new Set();
async function tvAyIcinArsivGetir(ayKey, zorla){
  if(!cloudEnabled()) return state.faturaArsivCache || {};
  if(tvAyVerisiGetirilenler.has(ayKey) && !zorla) return state.faturaArsivCache || {};
  const {ilkKey, sonKey} = ayGunAraligi(ayKey);
  const lookbackDenemeleri = [45, 400]; // gün — önce dar, bulunamazsa daha geniş bir pencereyle tekrar dene
  for(const lookback of lookbackDenemeleri){
    const baslangic = gunKeyEkle(ilkKey, -lookback);
    const aralik = await loadFaturaKontrolArsivAraligiFromCloud(baslangic, sonKey);
    if(aralik === null) break; // ağ hatası: elimizdeki önbellekle devam edilir
    state.faturaArsivCache = Object.assign({}, state.faturaArsivCache, aralik);
    const gunlerBu = Object.keys(aralik).sort();
    const ayIciVarMi = gunlerBu.some(g=> g>=ilkKey && g<=sonKey);
    const oncesiVarMi = gunlerBu.some(g=> g<ilkKey);
    if(!ayIciVarMi || oncesiVarMi || lookback===lookbackDenemeleri[lookbackDenemeleri.length-1]) break;
  }
  tvAyVerisiGetirilenler.add(ayKey);
  return state.faturaArsivCache || {};
}

async function computeTahsilatVerimlilikAy(report, ayKey, zorla){
  if(!ayKey) return null;
  await tvAyIcinArsivGetir(ayKey, zorla);
  const gunler = Object.keys(state.faturaArsivCache||{}).sort();
  if(!gunler.length) return {yok:true};
  const {ilkKey, sonKey} = ayGunAraligi(ayKey);

  // ÖNEMLİ: Fatura Dökümü/Bayi Hak Ediş artık kendi tarihlerine göre gün bazlı dağıtıldığı için
  // (bkz. arsivGunlereDagitVeDegistir), bir gün anahtarı arşivde VAR olabilir ama o günün
  // musteriSnapshot'ı (Kalemler/"Raporu Oluştur" ile yazılan) hiç OLMAYABİLİR — sadece o günün
  // Fatura/Hak Ediş/Tahsilat verisi barındıran bir "kabuk" gün olabilir. baslangicGunu/bitisGunu
  // SADECE gerçekten musteriSnapshot'ı olan günler arasından seçilmeli; aksi halde kalanBorc
  // hesaplaması sessizce 0'a düşer ve "Net Cari Değişim" gibi KPI'lar yanlış (ör. ay sonu bakiyenin
  // tamamı "değişim" gibi) görünür.
  const gunlerSnapshotlu = gunler.filter(g=>{
    const snap = state.faturaArsivCache[g] && state.faturaArsivCache[g].musteriSnapshot;
    return snap && snap.length;
  });

  let bitisGunu = null;
  gunlerSnapshotlu.forEach(g=>{ if(g<=sonKey && (!bitisGunu || g>bitisGunu)) bitisGunu = g; });
  if(!bitisGunu) return {yok:true};

  let baslangicGunu = null;
  gunlerSnapshotlu.forEach(g=>{ if(g<ilkKey && (!baslangicGunu || g>baslangicGunu)) baslangicGunu = g; });
  // Ay başından önceye ait arşiv kaydı yoksa (ör. haziran verisi arşivlenmemiş), ay içindeki
  // en erken arşiv gününü (ör. 1 Temmuz) yaklaşık başlangıç noktası olarak kullan.
  let baslangicYaklasik = false;
  if(!baslangicGunu){
    gunlerSnapshotlu.forEach(g=>{ if(g>=ilkKey && g<=sonKey && (!baslangicGunu || g<baslangicGunu)) baslangicGunu = g; });
    if(baslangicGunu) baslangicYaklasik = true;
  }

  const bitisSnap = ((state.faturaArsivCache[bitisGunu] && state.faturaArsivCache[bitisGunu].musteriSnapshot) || []).filter(m=>musteriTvIcinGecerliMi(m.musteri));
  const bitisMap = new Map(bitisSnap.map(m=>[m.musteri, m]));
  const baslangicSnap = baslangicGunu ? (((state.faturaArsivCache[baslangicGunu] && state.faturaArsivCache[baslangicGunu].musteriSnapshot) || []).filter(m=>musteriTvIcinGecerliMi(m.musteri))) : null;
  const baslangicMap = baslangicSnap ? new Map(baslangicSnap.map(m=>[m.musteri, m])) : null;
  const guncelMap = new Map((report && report.musteriler || []).map(m=>[m.musteri, m]));

  const birlesikArsiv = await faturaKontrolArsivBirlestirCached(state.faturaArsivCache);
  const ayTahsilatMap = new Map();
  const ayNakitTahsilatMap = new Map();
  // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT (kullanıcı isteği): artık birlesikArsiv.tahsilatArsiv
  // (Fatura Kontrol'ün eski, artık senkronize edilmeyen günlük snapshot arşivi) DEĞİL, kendi
  // bağımsız kalıcı arşivi state.tahsilatArsivi (belge no bazlı) okunur. İade Grubu kredileri
  // (Bozuk/Sağlam/Depozito İade Faturası — formatKaynagi:'FaturaIade') Kalemler dosyasındaki kalan
  // bakiyeden ZATEN düşülmüş durumda — yani bu tutarlar Kalan Borç değişiminde bir kez sayılmış
  // oluyor. Bu yüzden "toplamTahsilat" (KPI gösterimi için, tahsilat hesaplamalarında kullanılır) bu
  // kredileri İÇERİR, ama "tahsilatOrani"/"gerçekleşme oranı" gibi kalan borç DEĞİŞİMİYLE
  // karşılaştırılan veya gelecek nakit akışını tahmin etmede kullanılan oranlar bu kredileri
  // İÇERMEYEN "nakit" toplamı (ayNakitTahsilatMap) kullanır — aksi halde aynı tutar hem borç
  // azalışında hem tahsilat oranında sayılıp oranı olduğundan yüksek/yanıltıcı gösterir ve Nakit
  // Akış Tahmini gerçekte gerçekleşmeyecek bir nakit girişini varsaymış olur.
  // NOT: 'DepozitoTahsilat' etiketi geriye dönük uyumluluk için sette tutulur (Depozito Tahsilat
  // dosyası ayrı kaynak olarak kaldırıldı, yeni veride bu etiket artık üretilmiyor).
  const KALAN_BORC_DEGISIMINE_DAHIL_EDILMEYEN_KREDI_ETIKETLERI = new Set(['FaturaIade', 'DepozitoTahsilat']);
  // KULLANICI KARARI (2026-07-23): Ödeme ve Virman kayıtları GERÇEK TAHSİLAT DEĞİLDİR (bakiye
  // aktarımı/mahsup işlemidir) — bu yüzden tahsilat hesaplamasından TAMAMEN ÇIKARILIR (ne
  // toplamTahsilat'a ne ayNakitTahsilatMap'e eklenir).
  const TAHSILAT_SAYILMAYAN_KATEGORILER = new Set(['Odeme', 'Virman']);
  tahsilatArsivindenAralikDiziyeCevir(state.tahsilatArsivi, ilkKey, sonKey).forEach(r=>{
    if(!r.belgeTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    if(TAHSILAT_SAYILMAYAN_KATEGORILER.has(r.tahsilatKategori)) return;
    const gk = dateKeyLocal(r.belgeTarihi);
    if(!gk || gk<ilkKey || gk>sonKey) return;
    ayTahsilatMap.set(r.musteri, (ayTahsilatMap.get(r.musteri)||0) + (r.tutar||0));
    if(!KALAN_BORC_DEGISIMINE_DAHIL_EDILMEYEN_KREDI_ETIKETLERI.has(r.formatKaynagi)){
      ayNakitTahsilatMap.set(r.musteri, (ayNakitTahsilatMap.get(r.musteri)||0) + (r.tutar||0));
    }
  });
  (birlesikArsiv.bayiHakedisArsiv||[]).forEach(r=>{
    if(!r.tahsilatTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    const gk = dateKeyLocal(r.tahsilatTarihi);
    if(!gk || gk<ilkKey || gk>sonKey) return;
    ayTahsilatMap.set(r.musteri, (ayTahsilatMap.get(r.musteri)||0) + (r.tutar||0));
    ayNakitTahsilatMap.set(r.musteri, (ayNakitTahsilatMap.get(r.musteri)||0) + (r.tutar||0));
  });

  // İADE GRUBU (Depozito/Bozuk/Sağlam İade Faturası — kullanıcı kararı, 2026-07-23): birlesikArsiv
  // .tahsilatArsiv (state.faturaArsivCache günlük arşivi) içinde 'FaturaIade' etiketiyle durur —
  // Tahsilat Verimliliği/Temsilci Karnesi/Prim bu tutarları AYRICA buradan okumalıdır. Kalan
  // borçtan zaten düşülmüş olduğu için yalnızca toplamTahsilat'a eklenir, nakit toplamına dahil
  // edilmez (aksi halde çift sayım olur).
  (birlesikArsiv.tahsilatArsiv||[]).forEach(r=>{
    if(r.formatKaynagi!=='FaturaIade' || !r.belgeTarihi || !musteriTvIcinGecerliMi(r.musteri)) return;
    const gk = dateKeyLocal(new Date(r.belgeTarihi));
    if(!gk || gk<ilkKey || gk>sonKey) return;
    ayTahsilatMap.set(r.musteri, (ayTahsilatMap.get(r.musteri)||0) + (r.tutar||0));
  });

  // MANUEL "TAHSİL EDİLDİ" İŞARETLENEN ÇEK/SENET (kullanıcı kararı, 2026-07-23 — netleştirildi):
  // Çek/Senet kesildiği an Cari Değişim'i zaten etkiler (SAP bakiyeyi düşürür) ama bu RİSK olarak
  // sayılır, TAHSİLAT değil. Kullanıcı "Tahsil Edildi" dediğinde Cari Değişim ETKİLENMEZ (zaten
  // düşmüştü) ama Tahsilat ARTAR, Risk AZALIR — bunlar birbirinden bağımsız iki KPI'dır, biri
  // diğerinin türevi değildir; bu yüzden burada AYRICA ayTahsilatMap'e eklenmesi çifte sayım
  // DEĞİLDİR. Tarih olarak vadeTarihi kullanılır. Nakit toplamına dahil edilmez (Kalan Borç zaten
  // düşmüştü, "gerçekleşme oranı" gibi kalan-borç-değişimiyle kıyaslanan oranlarda tekrar sayılmaz).
  Object.values(state.cekSenetArsivi||{}).forEach(r=>{
    if(r.durum!=='tahsilEdildi' || !r.vadeTarihi || !musteriTvIcinGecerliMi(r.musteriKod)) return;
    const gk = dateKeyLocal(new Date(r.vadeTarihi));
    if(!gk || gk<ilkKey || gk>sonKey) return;
    ayTahsilatMap.set(r.musteriKod, (ayTahsilatMap.get(r.musteriKod)||0) + (r.tutar||0));
  });

  const cariDegisimVarMi = !!baslangicMap;
  // KRİTİK DÜZELTME (denetim bulgusu #5 — kullanıcı onayıyla düzeltildi): Ay başında (baslangicMap)
  // borcu olup, ay sonu snapshot'ında (bitisMap) VE bu ayki tahsilat kayıtlarında (ayTahsilatMap)
  // hiç görünmeyen bir müşteri — ör. kodu değişmiş, hesabı kapanmış/birleşmiş, ya da tam bu tarih
  // aralığının dışında (ama yine de ayGunAraligi içinde) tek bir işlemle kapanmış bir müşteri —
  // eskiden bu Set'e hiç girmiyordu ve "ay başı bakiyesi" toplamından tamamen düşüyordu; bu da
  // toplamKalanBorcBaslangic'i (ve dolayısıyla cariDegisim'i) olduğundan düşük gösteriyordu.
  // ÇÖZÜM: baslangicMap'teki müşteri kodları da birleşime dahil edilir.
  const musteriKodlari = new Set([...bitisMap.keys(), ...ayTahsilatMap.keys(), ...(baslangicMap ? baslangicMap.keys() : [])]);
  const map = new Map();
  musteriKodlari.forEach(kod=>{
    const bitisM = bitisMap.get(kod);
    const baslangicM = baslangicMap ? baslangicMap.get(kod) : null;
    const guncelM = guncelMap.get(kod);
    const temsilci = (state.musteriMasterMap && state.musteriMasterMap.get(kod))
      || (bitisM && bitisM.temsilci) || (guncelM && guncelM.temsilci) || (baslangicM && baslangicM.temsilci) || '—';
    const kalanBorcBitis = bitisM ? (bitisM.kalanBorc||0) : 0;
    const kalanBorcBaslangic = baslangicM ? (baslangicM.kalanBorc||0) : 0;
    const tahsilat = ayTahsilatMap.get(kod) || 0;
    const nakitTahsilat = ayNakitTahsilatMap.get(kod) || 0;

    if(!map.has(temsilci)) map.set(temsilci, {temsilci, musteriSayisi:0, tahsilatYapilanMusteri:0, toplamTahsilat:0, toplamNakitTahsilat:0, toplamKalanBorc:0, toplamKalanBorcBaslangic:0});
    const r = map.get(temsilci);
    r.musteriSayisi += 1;
    if(tahsilat > 0) r.tahsilatYapilanMusteri += 1;
    r.toplamTahsilat += tahsilat;
    r.toplamNakitTahsilat += nakitTahsilat;
    r.toplamKalanBorc += kalanBorcBitis;
    if(cariDegisimVarMi) r.toplamKalanBorcBaslangic += kalanBorcBaslangic;
  });

  const rows = Array.from(map.values()).map(r=>{
    // "gerçekleşme oranı" kalan borç DEĞİŞİMİYLE karşılaştırıldığı için nakit-dışı kredileri
    // içermeyen toplamNakitTahsilat kullanılır (bkz. yukarıdaki not).
    const payda = r.toplamNakitTahsilat + r.toplamKalanBorc;
    return Object.assign({}, r, {
      tahsilatOrani: payda>0 ? (r.toplamNakitTahsilat/payda*100) : null,
      ortalamaTahsilat: r.tahsilatYapilanMusteri>0 ? r.toplamTahsilat/r.tahsilatYapilanMusteri : 0,
      cariDegisim: cariDegisimVarMi ? (r.toplamKalanBorc - r.toplamKalanBorcBaslangic) : null,
    });
  });

  const genel = rows.reduce((a,r)=>({
    toplamTahsilat: a.toplamTahsilat + r.toplamTahsilat,
    toplamNakitTahsilat: a.toplamNakitTahsilat + r.toplamNakitTahsilat,
    toplamKalanBorc: a.toplamKalanBorc + r.toplamKalanBorc,
    toplamKalanBorcBaslangic: a.toplamKalanBorcBaslangic + r.toplamKalanBorcBaslangic,
    musteriSayisi: a.musteriSayisi + r.musteriSayisi,
    tahsilatYapilanMusteri: a.tahsilatYapilanMusteri + r.tahsilatYapilanMusteri,
  }), {toplamTahsilat:0, toplamNakitTahsilat:0, toplamKalanBorc:0, toplamKalanBorcBaslangic:0, musteriSayisi:0, tahsilatYapilanMusteri:0});
  const genelPayda = genel.toplamNakitTahsilat + genel.toplamKalanBorc;
  genel.tahsilatOrani = genelPayda>0 ? (genel.toplamNakitTahsilat/genelPayda*100) : null;
  genel.cariDegisim = cariDegisimVarMi ? (genel.toplamKalanBorc - genel.toplamKalanBorcBaslangic) : null;
  const enVerimli = rows.filter(r=>r.tahsilatOrani!=null && r.musteriSayisi>0).sort((a,b)=>b.tahsilatOrani-a.tahsilatOrani)[0] || null;

  return {rows, genel, enVerimli, ayKey, bitisGunu, baslangicGunu, baslangicYaklasik, cariDegisimVarMi};
}

function getTahsilatVerimlilikFilteredSorted(){
  const rep = state.tvReport;
  if(!rep) return [];
  // TÜRKÇE ARAMA DÜZELTMESİ: uygulamanın geri kalanındaki tüm arama kutuları gibi burada da
  // toLocaleLowerCase('tr-TR') kullanılır — düz toLowerCase() Türkçe İ/ı dönüşümünü bozar
  // (ör. "izzet" araması "İZZET" temsilcisini bulamıyordu).
  const q = document.getElementById('tvSearchInput').value.trim().toLocaleLowerCase('tr-TR');
  let rows = rep.rows.filter(r=> !q || String(r.temsilci).toLocaleLowerCase('tr-TR').includes(q));
  const {key,dir} = state.tvSort;
  rows = rows.slice().sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(av==null) av = -Infinity;
    if(bv==null) bv = -Infinity;
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

function fmtYuzde(v){
  return v==null ? '—' : '%'+v.toFixed(1).replace('.',',');
}

// Tüm rapor kartlarındaki performans renk/etiket mantığının TEK ortak kaynağı. Önceden verimRenk,
// sellOutRenk, karneDurumPill, ceiDurumPill birbirine çok benzeyen ama ayrı ayrı yazılmış eşik
// mantıkları içeriyordu; artık hepsi bu iki fonksiyona delege ediyor — her rapor sadece kendi
// eşiğini (ve varsa özel renklerini) parametre olarak veriyor, mantık tek yerde.
function performansRenk(oran, esikler){
  const cfg = Object.assign({iyi:70, orta:40, iyiRenk:'var(--success)', ortaRenk:'var(--accent)', dusukRenk:'var(--danger)'}, esikler||{});
  if(oran==null) return 'var(--ink-faint)';
  if(oran>=cfg.iyi) return cfg.iyiRenk;
  if(cfg.orta!=null && oran>=cfg.orta) return cfg.ortaRenk;
  return cfg.dusukRenk;
}
function performansPill(oran, esikler){
  const cfg = Object.assign({ust:100, hedefte:90, altinda:70}, esikler||{});
  if(oran==null) return {label:'—', cls:''};
  if(oran>=cfg.ust) return {label:'Hedef Üstü', cls:'good'};
  if(oran>=cfg.hedefte) return {label:'Hedefte', cls:'navy'};
  if(oran>=cfg.altinda) return {label:'Hedef Altı', cls:'warn'};
  return {label:'Zayıf', cls:'danger'};
}

function verimRenk(oran){
  return performansRenk(oran, {iyi:70, orta:40});
}

function fmtCariDegisim(v){
  if(v==null) return '<span class="zero">—</span>';
  if(Math.round(v)===0) return '<span class="zero">'+TL(0)+'</span>';
  const renk = v>0 ? 'var(--danger)' : 'var(--success)';
  const isaretliTutar = (v>0?'+':'') + TL(v);
  return '<span style="color:'+renk+';font-weight:600;">'+isaretliTutar+'</span>';
}

function renderTahsilatVerimlilikKPI(rep){
  const cariRenk = rep.genel.cariDegisim==null ? 'var(--ink-faint)' : (rep.genel.cariDegisim>0 ? 'var(--danger)' : 'var(--success)');
  const cariDisplay = rep.genel.cariDegisim==null ? '—' : ((rep.genel.cariDegisim>0?'+':'')+TL(rep.genel.cariDegisim));
  const cariSub = !rep.cariDegisimVarMi ? 'Önceki Ay Arşiv Kaydı Yok'
    : (rep.baslangicYaklasik
        ? (fmtDate(new Date(rep.baslangicGunu))+' Kaydına Göre · Yaklaşık (Önceki Ay Verisi Yok, Negatif = Borç Azaldı)')
        : 'Ay Başına Göre (Negatif = Borç Azaldı)');
  const items = [
    {label:'Toplam Alınan Tahsilat', icon:'<i class="fa-solid fa-coins" aria-hidden="true"></i>', value:rep.genel.toplamTahsilat, sub:rep.genel.tahsilatYapilanMusteri.toLocaleString('tr-TR')+' Müşteriden'},
    {label:'Kalan Borç (Ay Sonu)', icon:'<i class="fa-solid fa-building-columns" aria-hidden="true"></i>', cls:'neutral', value:rep.genel.toplamKalanBorc, sub:rep.genel.musteriSayisi.toLocaleString('tr-TR')+' Müşteri'},
    {label:'Net Cari Değişim (Ay İçi)', icon:'<i class="fa-solid fa-repeat" aria-hidden="true"></i>', cls:'accent', value:null, display:cariDisplay, sub:cariSub, valueColor:cariRenk},
    {label:'Genel Tahsilat Oranı', icon:'<i class="fa-solid fa-chart-line" aria-hidden="true"></i>', cls:'success', value:null, display:fmtYuzde(rep.genel.tahsilatOrani), sub:'Nakit Tahsilat / (Nakit Tahsilat + Ay Sonu Kalan Borç)'},
    {label:'En Verimli Temsilci', icon:'<i class="fa-solid fa-trophy" aria-hidden="true"></i>', cls:'accent', value:null, display: rep.enVerimli ? rep.enVerimli.temsilci : '—', sub: rep.enVerimli ? (fmtYuzde(rep.enVerimli.tahsilatOrani)+' Oran') : ''},
    {label:'Tahsilatsız Müşteri', icon:'<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>', cls:'danger', value:null, display:(rep.genel.musteriSayisi-rep.genel.tahsilatYapilanMusteri).toLocaleString('tr-TR'), sub:'Bu Ay Tahsilat Yapılmayan'},
  ];
  renderKpiHeroRow(items, 'tvKpiGrid');
}

function renderTahsilatVerimlilikChart(rep){
  const el = document.getElementById('tvChart');
  const rows = rep.rows.filter(r=>r.tahsilatOrani!=null).slice().sort((a,b)=>b.tahsilatOrani-a.tahsilatOrani);
  if(!rows.length){
    el.innerHTML = '<div class="empty-state">Grafik için veri yok</div>';
    return;
  }
  el.innerHTML = rows.map(r=>`
    <div class="aging-row">
      <div class="aging-label" title="${escapeHtml(r.temsilci)}">${escapeHtml(r.temsilci)}</div>
      <div class="aging-track"><div class="aging-fill" style="width:${Math.max(r.tahsilatOrani,2).toFixed(1)}%;background:${verimRenk(r.tahsilatOrani)};"></div></div>
      <div class="aging-value" style="color:${verimRenk(r.tahsilatOrani)};">${fmtYuzde(r.tahsilatOrani)}</div>
    </div>`).join('');
}

function renderTahsilatVerimlilikTable(){
  const rep = state.tvReport;
  if(!rep) return;
  const rows = getTahsilatVerimlilikFilteredSorted();
  document.getElementById('tvCount').textContent = rows.length.toLocaleString('tr-TR') + ' temsilci';
  const tbody = document.getElementById('tvTbody');
  const tfoot = document.getElementById('tvTfoot');
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">Aramanızla eşleşen temsilci bulunamadı.</div></td></tr>`;
    tfoot.innerHTML = '';
    return;
  }
  tbody.innerHTML = rows.map(r=>`<tr>
    <td><span class="temsilci-tag">${escapeHtml(r.temsilci)}</span></td>
    <td class="num">${r.musteriSayisi.toLocaleString('tr-TR')}</td>
    <td class="num">${r.tahsilatYapilanMusteri.toLocaleString('tr-TR')}</td>
    <td class="num">${r.toplamKalanBorc>0?TL(r.toplamKalanBorc):'<span class="zero">—</span>'}</td>
    <td class="num">${fmtCariDegisim(r.cariDegisim)}</td>
    <td class="num"><b>${r.toplamTahsilat>0?TL(r.toplamTahsilat):'<span class="zero">—</span>'}</b></td>
    <td class="num">${r.ortalamaTahsilat>0?TL(r.ortalamaTahsilat):'<span class="zero">—</span>'}</td>
    <td class="num"><span class="verim-pill" style="color:${verimRenk(r.tahsilatOrani)};">${fmtYuzde(r.tahsilatOrani)}</span></td>
  </tr>`).join('');

  const g = rep.genel;
  tfoot.innerHTML = `<tr class="totals-row">
    <td>Genel Toplam</td>
    <td class="num">${g.musteriSayisi.toLocaleString('tr-TR')}</td>
    <td class="num">${g.tahsilatYapilanMusteri.toLocaleString('tr-TR')}</td>
    <td class="num">${TL(g.toplamKalanBorc)}</td>
    <td class="num">${fmtCariDegisim(g.cariDegisim)}</td>
    <td class="num">${TL(g.toplamTahsilat)}</td>
    <td class="num">${g.tahsilatYapilanMusteri>0?TL(g.toplamTahsilat/g.tahsilatYapilanMusteri):'<span class="zero">—</span>'}</td>
    <td class="num">${fmtYuzde(g.tahsilatOrani)}</td>
  </tr>`;
}

async function populateTvAySelect(zorla){
  const sel = document.getElementById('tvAySelect');
  const aylar = await tvMevcutAylar(zorla);
  if(!aylar.length){
    sel.innerHTML = '<option value="">Veri yok</option>';
    sel.disabled = true;
    state.tvAy = null;
    return;
  }
  sel.disabled = false;
  const secim = (state.tvAy && aylar.includes(state.tvAy)) ? state.tvAy : aylar[aylar.length-1];
  state.tvAy = secim;
  sel.innerHTML = aylar.slice().reverse().map(ay=>`<option value="${ay}" ${ay===secim?'selected':''}>${ayEtiketi(ay)}</option>`).join('');
}

function renderTvArsivBilgi(){
  const el = document.getElementById('tvArsivBilgi');
  if(!el) return;
  if(!cloudEnabled()){
    el.textContent = '⚠️ Bulut (Firebase) yapılandırılmadığı için aylık tahsilat verisi hiçbir yerde kalıcı olarak saklanamıyor; yalnızca bu oturumda görünür.';
    return;
  }
  const gunSayisi = (tvGunAnahtarlariOnbellek || Object.keys(state.faturaArsivCache||{})).length;
  if(!gunSayisi){
    el.textContent = 'Buluttaki arşivde henüz veri yok. "Raporu Oluştur" ile her yeni yükleme yaptığınızda o günün tahsilat verisi buluta eklenir. ☁️';
    return;
  }
  el.textContent = `Buluttaki arşivden tahsilat/cari verisi kullanılıyor. ☁️`;
}

// Seçilen ay içinde, arşivlenmiş her gün için toplam Kalan Borç serisini üretir. Grafik SADECE bu
// ayın günlerini (ayın 1'i → bitisGunu) kapsar — rep.baslangicGunu (önceki ayın son günü, "ay başı
// bakiye" referansı için computeTahsilatVerimlilikAy'da kullanılır) kasıtlı olarak grafiğe DAHİL
// EDİLMEZ; aksi halde "Ay İçi Günlük Trend" grafiği yanlışlıkla bir önceki ayın son günüyle
// başlıyormuş gibi görünür (ör. Temmuz ayı trendi 30 Haziran'dan başlıyormuş gibi).
// temsilciFiltre '__genel__' ise tüm temsilciler toplanır, aksi halde sadece o temsilci.
function computeCariGunlukSeri(rep, temsilciFiltre){
  if(!rep || !rep.bitisGunu || !rep.ayKey) return [];
  const {ilkKey} = ayGunAraligi(rep.ayKey);
  const gunler = Object.keys(state.faturaArsivCache||{}).sort()
    .filter(g=> g>=ilkKey && g<=rep.bitisGunu)
    // Fatura/Bayi Hak Ediş artık kendi tarihine göre dağıtıldığı için bir gün musteriSnapshot'sız
    // (sadece fatura/hak ediş/tahsilat içeren "kabuk" gün) arşivde yer alabilir — bu günler grafiğe
    // dahil edilmez, aksi halde Kalan Borç o günde yanlışlıkla 0'a düşmüş gibi görünür.
    .filter(g=>{
      const snap = state.faturaArsivCache[g] && state.faturaArsivCache[g].musteriSnapshot;
      return snap && snap.length;
    });
  return gunler.map(g=>{
    const snap = ((state.faturaArsivCache[g] && state.faturaArsivCache[g].musteriSnapshot) || [])
      .filter(m=>musteriTvIcinGecerliMi(m.musteri))
      .filter(m=> temsilciFiltre==='__genel__' || (m.temsilci||'—')===temsilciFiltre);
    const toplamKalanBorc = snap.reduce((a,m)=>a+(m.kalanBorc||0),0);
    return {tarih:g, kalanBorc:toplamKalanBorc};
  });
}

function populateTvCariTrendSelect(rep){
  const sel = document.getElementById('tvCariTrendSelect');
  const oncekiDeger = sel.value || '__genel__';
  const temsilciler = (rep.rows||[]).map(r=>r.temsilci).filter(Boolean).sort((a,b)=>a.localeCompare(b,'tr'));
  sel.innerHTML = '<option value="__genel__">Genel Toplam</option>' + temsilciler.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  sel.value = (oncekiDeger==='__genel__' || temsilciler.includes(oncekiDeger)) ? oncekiDeger : '__genel__';
}

function renderTvCariTrend(){
  const rep = state.tvReport;
  const container = document.getElementById('tvCariTrendChart');
  const subEl = document.getElementById('tvCariTrendSub');
  if(!rep || !rep.cariDegisimVarMi){
    container.innerHTML = '<div class="empty-state" style="padding:24px 10px;">Karşılaştırma için arşiv kaydı yok</div>';
    if(subEl) subEl.textContent = '';
    return;
  }
  const sel = document.getElementById('tvCariTrendSelect');
  const secim = sel ? (sel.value || '__genel__') : '__genel__';
  const seri = computeCariGunlukSeri(rep, secim);
  renderTrendChart('tvCariTrendChart', seri, 'kalanBorc', 'var(--navy)', 'tl');
  if(subEl){
    if(seri.length>=2){
      const fark = seri[seri.length-1].kalanBorc - seri[0].kalanBorc;
      const farkTxt = (fark>0?'+':'')+TL(fark);
      subEl.textContent = fmtDate(new Date(seri[0].tarih))+' → '+fmtDate(new Date(seri[seri.length-1].tarih))+' arası net değişim: '+farkTxt;
    }else{
      subEl.textContent = 'Trend için en az 2 arşivlenmiş gün gerekiyor.';
    }
  }
}

async function recomputeAndRenderTahsilatVerimlilik(report, zorla){
  const bosDurum = (mesaj)=>{
    state.tvReport = null;
    document.getElementById('tvKpiGrid').innerHTML = '';
    document.getElementById('tvChart').innerHTML = `<div class="empty-state">${mesaj}</div>`;
    document.getElementById('tvTbody').innerHTML = `<tr><td colspan="8"><div class="empty-state">${mesaj}</div></td></tr>`;
    document.getElementById('tvTfoot').innerHTML = '';
    document.getElementById('tvCount').textContent = '';
    document.getElementById('tvCariTrendChart').innerHTML = `<div class="empty-state">${mesaj}</div>`;
    document.getElementById('tvCariTrendSub').textContent = '';
  };
  if(!state.tvAy){
    bosDurum('Buluttaki arşivde henüz veri bulunmadığı için bu rapor gösterilemiyor.');
    return;
  }
  const sonuc = await computeTahsilatVerimlilikAy(report, state.tvAy, zorla);
  if(!sonuc || sonuc.yok){
    bosDurum(ayEtiketi(state.tvAy) + ' için buluttaki arşivde veri bulunamadı.');
    return;
  }
  state.tvReport = sonuc;
  document.getElementById('tvChartSub').textContent = ayEtiketi(state.tvAy) + ' · Alınan Tahsilat / (Alınan Tahsilat + Ay Sonu Kalan Borç)';
  renderTahsilatVerimlilikKPI(sonuc);
  renderTahsilatVerimlilikChart(sonuc);
  renderTahsilatVerimlilikTable();
  populateTvCariTrendSelect(sonuc);
  renderTvCariTrend();
}

async function renderTahsilatVerimlilikView(report, zorla){
  const infoEl = document.getElementById('tvArsivBilgi');
  if(infoEl) infoEl.textContent = 'Buluttan yükleniyor…';
  // ÖNEMLİ: Bu sekme artık faturaArsivYenile() ile arşivin TAMAMINI indirmiyor. Ay dropdown'u
  // yalnızca hafif bir gün-anahtarı isteğiyle (shallow=true), seçili ayın verisi ise yalnızca o
  // ayı (ve önceki bakiye karşılaştırması için gereken birkaç günü) kapsayan bir ARALIK isteğiyle
  // dolduruluyor — Fatura Kontrol/Trend Analizi gibi arşivin tamamına ihtiyaç duymuyor.
  if(zorla){ tvAyVerisiGetirilenler.clear(); }
  await populateTvAySelect(zorla);
  renderTvArsivBilgi();
  await recomputeAndRenderTahsilatVerimlilik(report, zorla);
}

document.getElementById('tvAySelect').addEventListener('change', (e)=>{
  state.tvAy = e.target.value || null;
  recomputeAndRenderTahsilatVerimlilik(state.report);
});
document.getElementById('tvYenileBtn').addEventListener('click', async ()=>{
  await renderTahsilatVerimlilikView(state.report || {musteriler:[]}, true);
});
document.getElementById('tvCariTrendSelect').addEventListener('change', ()=>{
  renderTvCariTrend();
});

const debouncedRenderTvTable = debounce(()=>renderTahsilatVerimlilikTable());
wireSearchInput('tvSearchInput', 'tvSearchClearBtn', debouncedRenderTvTable);
wireSearchClear('tvSearchInput', 'tvSearchClearBtn', renderTahsilatVerimlilikTable);
wireSortableTable('tvTable', 'tvSort', renderTahsilatVerimlilikTable);
