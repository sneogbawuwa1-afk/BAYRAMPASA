/* ===================================================================
   Merkezi Modal Yönetimi
   Uygulamadaki tüm popup'lar .modal-overlay + .open desenini kullanıyor.
   Önceden yalnızca "Dikkat" modalinde ESC ve kaydırma kilidi vardı;
   burada aynı davranışı TÜM modallere tek noktadan kazandırıyoruz:
     • ESC → en üstteki (nested dahil) açık modali kapatır
     • Herhangi bir modal açıkken arka plan (body) kaymaz
     • Modal açılınca odak içine taşınır, kapanınca öncekine döner
     • Tab tuşu odağı modal içinde döngüye sokar (focus trap)
   =================================================================== */
(function(){
  var KAPAT = {
    dikkatModalOverlay:            typeof closeDikkatModal==='function'            ? closeDikkatModal            : null,
    faturaModalOverlay:           typeof faturaModalKapat==='function'            ? faturaModalKapat            : null,
    cekSenetModalOverlay:         typeof cekSenetModalKapat==='function'          ? cekSenetModalKapat          : null,
    cekSenetEksikModalOverlay:    typeof cekSenetEksikModalKapat==='function'     ? cekSenetEksikModalKapat     : null,
    tahsilatTahminiModalOverlay:  typeof tahsilatTahminiModalKapat==='function'   ? tahsilatTahminiModalKapat   : null,
    sapKontrolExportModalOverlay: typeof sapKontrolExportModalKapat==='function'  ? sapKontrolExportModalKapat  : null,
    analizModalOverlay:           typeof analizModalKapat==='function'            ? analizModalKapat            : null,
    stokModalOverlay:             typeof stokModalKapat==='function'              ? stokModalKapat              : null,
    senetModalOverlay:            typeof senetModalKapat==='function'             ? senetModalKapat             : null,
    hakedisModalOverlay:          typeof hakedisModalKapat==='function'           ? hakedisModalKapat           : null,
    faturaKesilmeyenModalOverlay: typeof faturaKesilmeyenModalKapat==='function'  ? faturaKesilmeyenModalKapat  : null,
    karneRiskliModalOverlay:      typeof karneRiskliModalKapat==='function'       ? karneRiskliModalKapat       : null,
    yuklemeIptalModalOverlay:     typeof yuklemeIptalModalKapat==='function'      ? yuklemeIptalModalKapat      : null,
    yuklemeIptalUrunModalOverlay: typeof yuklemeIptalUrunModalKapat==='function'  ? yuklemeIptalUrunModalKapat  : null
  };

  function tumOverlayler(){ return Array.prototype.slice.call(document.querySelectorAll('.modal-overlay')); }
  function acikOverlayler(){ return tumOverlayler().filter(function(o){ return o.classList.contains('open'); }); }
  function zIndexOf(el){ var z = parseInt(getComputedStyle(el).zIndex,10); return isNaN(z)?0:z; }
  function enUsttekiAcik(){
    var acik = acikOverlayler();
    if(!acik.length) return null;
    acik.sort(function(a,b){
      var dz = zIndexOf(a)-zIndexOf(b);
      if(dz!==0) return dz;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return acik[acik.length-1];
  }
  function overlayKapat(overlay){
    if(!overlay) return;
    var fn = KAPAT[overlay.id];
    if(fn){ try{ fn(); }catch(e){ overlay.classList.remove('open'); } }
    else { overlay.classList.remove('open'); }
  }

  function kaydirmaKilidiniGuncelle(){
    var acikMi = acikOverlayler().length > 0;
    // scrollbar-gutter:stable modern tarayıcılarda (Chrome 94+, Firefox 97+, Safari 17+)
    // scrollbar'ın kapladığı alanı zaten rezerve ediyor, ama bunu desteklemeyen eski bir
    // tarayıcıda body{overflow:hidden} devreye girince scrollbar kaybolup sayfa genişliği
    // artıyor, bu da grid kartlarının (auto-fill,minmax) yeniden hesaplanıp boyut
    // değiştirmesine neden oluyordu. Burada scrollbar genişliğini ölçüp modal açıkken
    // sağdan aynı miktarda padding ekleyerek (kapanınca kaldırarak) bu kaymayı önlüyoruz.
    if(acikMi){
      var scrollbarGenisligi = window.innerWidth - document.documentElement.clientWidth;
      if(scrollbarGenisligi > 0) document.body.style.paddingRight = scrollbarGenisligi + 'px';
    }else{
      document.body.style.paddingRight = '';
    }
    document.body.classList.toggle('modal-open', acikMi);
  }

  var oncekiOdak = {};
  function odaklanabilirler(kok){
    return Array.prototype.slice.call(kok.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function(el){ return el.offsetWidth>0 || el.offsetHeight>0 || el===document.activeElement; });
  }
  function modalAcildi(overlay){
    oncekiOdak[overlay.id] = document.activeElement;
    var hedef = overlay.querySelector('.modal-close') || odaklanabilirler(overlay)[0] || overlay;
    requestAnimationFrame(function(){ try{ hedef.focus({preventScroll:true}); }catch(e){} });
  }
  function modalKapandi(overlay){
    var geri = oncekiOdak[overlay.id];
    delete oncekiOdak[overlay.id];
    if(geri && document.contains(geri)){ try{ geri.focus({preventScroll:true}); }catch(e){} }
  }

  tumOverlayler().forEach(function(overlay){
    var acikMiydi = overlay.classList.contains('open');
    new MutationObserver(function(){
      var acik = overlay.classList.contains('open');
      if(acik === acikMiydi) return;
      acikMiydi = acik;
      kaydirmaKilidiniGuncelle();
      if(acik) modalAcildi(overlay); else modalKapandi(overlay);
    }).observe(overlay, {attributes:true, attributeFilter:['class']});
  });
  kaydirmaKilidiniGuncelle();

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      var ust = enUsttekiAcik();
      if(ust){ e.preventDefault(); overlayKapat(ust); }
      return;
    }
    if(e.key === 'Tab'){
      var ustT = enUsttekiAcik();
      if(!ustT) return;
      var od = odaklanabilirler(ustT);
      if(!od.length){ e.preventDefault(); return; }
      var ilk = od[0], son = od[od.length-1], akt = document.activeElement;
      if(e.shiftKey && (akt===ilk || !ustT.contains(akt))){ e.preventDefault(); son.focus(); }
      else if(!e.shiftKey && (akt===son || !ustT.contains(akt))){ e.preventDefault(); ilk.focus(); }
    }
  });

  // Arama girdilerinde mobil klavyenin otomatik düzeltme/büyütmesini kapat (kod ve isim aramaları için).
  document.querySelectorAll('.search-box input').forEach(function(inp){
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('autocorrect','off');
    inp.setAttribute('autocapitalize','off');
    inp.setAttribute('spellcheck','false');
  });
})();

