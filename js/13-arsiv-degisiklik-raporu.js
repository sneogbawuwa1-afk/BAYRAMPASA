/* =====================================================================
   ARŞİV DEĞİŞİKLİK RAPORU
   ---------------------------------------------------------------------
   Amaç: Her dosya yüklemesinde arşivde SESSİZCE silinen/güncellenen/eklenen
   kayıtları (ters kayıt eşleşmesi, ön kayıt yaşam döngüsü, sipariş iptal/
   mükerrer temizliği, çek/senet eksik kalanları) kullanıcıya görünür kılar.
   Kullanıcı isteği (23.07.2026): "geriye dönük her arşiv yenilemesinde
   kayıt çıkarma veya yeni kayıt girişi/iptal olduğunda sistem uyarı verip
   değişen belgeleri listeleyecek ve neden değiştiğinin bilgisini verecek."

   Veri kaynağı: state.arsivDegisiklikRaporu — raporuOlusturVeyaGuncelleAkisiniCalistir
   (02-bulut-ve-auth.js) içinde her yüklemede yeniden doldurulur. Her satır:
   {tur:'silindi'|'guncellendi'|'eklendi'|'eksik', sebep, belgeNo, musteriKod,
   musteriAdi, tutar, tarih, kaynak:'tahsilat'|'siparis'|'cekSenet'|...}

   Bu modül yalnızca GÖRÜNTÜLER — arşiv fonksiyonlarının kendi mantığına
   dokunmaz, hiçbir silme/ekleme kararı burada verilmez.
   ===================================================================== */

const ARSIV_DEGISIKLIK_TUR_ETIKET = {
  silindi: {ad:'Silindi', renk:'#B42318'},
  guncellendi: {ad:'Güncellendi', renk:'#8A6D1F'},
  eklendi: {ad:'Eklendi', renk:'#1A8A4C'},
  eksik: {ad:'Karar Bekliyor', renk:'#63500F'},
};
const ARSIV_DEGISIKLIK_KAYNAK_ETIKET = {
  tahsilat: 'Tahsilat', siparis: 'Sipariş', cekSenet: 'Çek/Senet',
  ciroPrimi: 'Ciro Primi', donemselIskonto: 'Dönemsel İskonto',
};

function arsivDegisiklikSatirHtml(d){
  const turBilgi = ARSIV_DEGISIKLIK_TUR_ETIKET[d.tur] || {ad:d.tur||'—', renk:'#444'};
  const kaynakAdi = ARSIV_DEGISIKLIK_KAYNAK_ETIKET[d.kaynak] || d.kaynak || '—';
  const tarih = d.tarih ? (d.tarih instanceof Date ? d.tarih : new Date(d.tarih)) : null;
  return `<tr data-tur="${escapeHtml(d.tur||'')}" data-kaynak="${escapeHtml(d.kaynak||'')}">
    <td><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${turBilgi.renk};">${turBilgi.ad}</span></td>
    <td>${escapeHtml(kaynakAdi)}</td>
    <td>${escapeHtml(d.musteriAdi || d.musteriKod || '—')}</td>
    <td>${escapeHtml(d.belgeNo || '—')}</td>
    <td>${fmtDate(tarih)}</td>
    <td class="num">${TL(d.tutar||0)}</td>
    <td style="font-size:11.5px;color:var(--ink-soft);">${escapeHtml(d.sebep||'—')}</td>
  </tr>`;
}

function arsivDegisiklikRaporuFiltreliListe(){
  const tur = document.getElementById('arsivDegisiklikTurFilter').value;
  const kaynak = document.getElementById('arsivDegisiklikKaynakFilter').value;
  const tumu = state.arsivDegisiklikRaporu || [];
  return tumu.filter(d=> (!tur || d.tur===tur) && (!kaynak || d.kaynak===kaynak));
}

function arsivDegisiklikRaporuTabloyuCiz(){
  const liste = arsivDegisiklikRaporuFiltreliListe();
  document.getElementById('arsivDegisiklikModalTbody').innerHTML = liste.map(arsivDegisiklikSatirHtml).join('') ||
    '<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:20px;">Bu filtreyle eşleşen kayıt yok.</td></tr>';
}

function arsivDegisiklikRaporuModalAc(degisiklikler){
  const liste = degisiklikler || state.arsivDegisiklikRaporu || [];
  const silinen = liste.filter(d=>d.tur==='silindi').length;
  const guncellenen = liste.filter(d=>d.tur==='guncellendi').length;
  const eksik = liste.filter(d=>d.tur==='eksik').length;
  document.getElementById('arsivDegisiklikModalSub').textContent =
    `${liste.length} kayıt — ${silinen} silindi · ${guncellenen} güncellendi${eksik ? ' · '+eksik+' karar bekliyor' : ''}`;
  document.getElementById('arsivDegisiklikTurFilter').value = '';
  document.getElementById('arsivDegisiklikKaynakFilter').value = '';
  arsivDegisiklikRaporuTabloyuCiz();
  document.getElementById('arsivDegisiklikModalOverlay').classList.add('open');
}

function arsivDegisiklikRaporuModalKapat(){
  document.getElementById('arsivDegisiklikModalOverlay').classList.remove('open');
}

document.getElementById('arsivDegisiklikModalClose').addEventListener('click', arsivDegisiklikRaporuModalKapat);
document.getElementById('arsivDegisiklikModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'arsivDegisiklikModalOverlay') arsivDegisiklikRaporuModalKapat();
});
document.getElementById('arsivDegisiklikTurFilter').addEventListener('change', arsivDegisiklikRaporuTabloyuCiz);
document.getElementById('arsivDegisiklikKaynakFilter').addEventListener('change', arsivDegisiklikRaporuTabloyuCiz);

// Fatura Kontrol panelindeki "Arşiv Değişiklik Raporu" butonu — otomatik modalın yanı sıra,
// kullanıcı istediği zaman en son yüklemenin raporuna tekrar bakabilsin diye her zaman erişilebilir.
const arsivDegisiklikGosterBtn = document.getElementById('arsivDegisiklikGosterBtn');
if(arsivDegisiklikGosterBtn){
  arsivDegisiklikGosterBtn.addEventListener('click', ()=>{
    if(!state.arsivDegisiklikRaporu || !state.arsivDegisiklikRaporu.length){
      alert('Henüz bir değişiklik raporu yok — bu, son yüklemede arşivde otomatik silinen/güncellenen/eklenen bir kayıt olmadığı anlamına gelir. Yeni bir dosya yükleyip "Raporu Oluştur"a bastığınızda burada görünecektir.');
      return;
    }
    arsivDegisiklikRaporuModalAc(state.arsivDegisiklikRaporu);
  });
}
