// ============================== GRUP B: "Günlük Veri Yükle" ÜST PANEL ==============================
// Sipariş Dökümü / Tahsilat Dökümü / Fatura Dökümü / Depozito Tahsilat / Bayi Hak Ediş dosyaları
// artık ana ekrandaki dropzone yerine buradan yüklenir. Panel açıldığında hangi dosya seçilmek
// isteniyorsa (data-gvy-type), aynı #gvyFileInput üzerinden dosya seçtirilir; seçilen dosya AYNI
// handleFiles/detectType mekanizmasından geçer (tip otomatik tanınır, hangi butona basıldığından
// bağımsız olarak state.files[type]'a doğru yere yazılır).
// "Veri Güncelle"ye basınca kasıtlı olarak YENİ bir hesaplama akışı YAZILMAZ — hesaplama motoruna
// dokunmadan, ana ekrandaki "Raporu Oluştur" (buildBtn) ile TAMAMEN AYNI akış tetiklenir. Kalemler
// dosyası zaten önceden yüklenip hafızada/bulutta olduğu için bu sorunsuz çalışır; kullanıcı sadece
// güncellemek istediği 5 dosyayı seçip tek butona basar.
(function(){
  const wrap = document.getElementById('gvyWrap');
  const toggleBtn = document.getElementById('gvyToggleBtn');
  const panel = document.getElementById('gvyPanel');
  const fileInputGvy = document.getElementById('gvyFileInput');
  const updateBtn = document.getElementById('gvyUpdateBtn');
  const syncBtnGvy = document.getElementById('gvySyncBtn');
  const statusMsg = document.getElementById('gvyStatusMsg');
  const lastSyncEl = document.getElementById('gvyLastSync');
  if(!wrap || !toggleBtn || !panel) return;

  let aktifSecimTipi = null; // hangi satırın "Dosya Seç" butonuna basıldı — gvyFileInput change'inde kullanılır

  function openPanel(){
    panel.classList.add('open');
    toggleBtn.setAttribute('aria-expanded','true');
    if(typeof updateGvyPanel === 'function') updateGvyPanel();
    if(typeof updateGvcPanel === 'function') updateGvcPanel();
    gvyKalemlerUyariGuncelle();
  }
  function closePanel(){
    panel.classList.remove('open');
    toggleBtn.setAttribute('aria-expanded','false');
  }

  // ---- Sekme geçişi (Ana Veri / Günlük Veri / Arşiv Verisi) ----
  const tabButtons = panel.querySelectorAll('.gvy-tab');
  const tabPanes = panel.querySelectorAll('.gvy-tabpane');
  tabButtons.forEach(tb=>{
    tb.addEventListener('click', ()=>{
      const hedef = tb.getAttribute('data-gvy-tab');
      tabButtons.forEach(b=>{ const aktif=b===tb; b.classList.toggle('active',aktif); b.setAttribute('aria-selected', aktif?'true':'false'); });
      tabPanes.forEach(p=>{
        const aktif = (hedef==='ana' && p.id==='gvyPaneAna') || (hedef==='gunluk' && p.id==='gvyPaneGunluk') || (hedef==='arsiv' && p.id==='gvyPaneArsiv');
        p.classList.toggle('active', aktif);
      });
    });
  });

  // Bugün Kalemler yüklendi mi? (Artık Grup B/C için ZORUNLU bir ön koşul DEĞİL — kullanıcı
  // kararıyla kaldırıldı. Bu fonksiyon yalnızca bilgilendirme amaçlı "uyarı" göstergesi için
  // korunmuştur, artık hiçbir butonu kilitlemez.)
  function bugunKalemlerVarMi(){
    if(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length) return true;
    return !!state.bugunKalemlerHazir;
  }
  // Asenkron: önce tek-slot arşivini tazeler (Kalemler var mı?), sonra UI'ı günceller.
  async function gvyKalemlerUyariGuncelle(){
    try{ if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele(); }catch(_){}
    const uyari = document.getElementById('gvyKalemlerUyari');
    const kalemlerYok = !bugunKalemlerVarMi();
    if(uyari) uyari.classList.toggle('goster', kalemlerYok);
    // KİLİT KALDIRILDI (kullanıcı kararı): Grup B/C güncelleme butonları artık Kalemler'in varlığına
    // bağlı DEĞİL — yalnızca kendi grubunda seçili dosya olup olmamasına bakar.
    const gb = document.getElementById('gvyUpdateBtn');
    const gc = document.getElementById('gvcUpdateBtn');
    if(gb) gb.disabled = GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length===0;
    if(gc) gc.disabled = GRUP_C_HAZIR_SAYISI()===0;
  }
  window.gvyKalemlerUyariGuncelle = gvyKalemlerUyariGuncelle;
  toggleBtn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if(panel.classList.contains('open')){ closePanel(); return; }
    // Panel her açılışta şifre ister (kapatmak şifresizdir). Bu, "Veri Yükle" (Günlük Veri +
    // Arşiv Verisi) panelinin yetkisiz kişilerce açılıp dosya yüklenmesini/değiştirilmesini önler.
    if(!(await ortakSifreDogrula('Veri Yükle panelini açmak için şifreyi girin:'))) return;
    openPanel();
  });
  // Panel dışında herhangi bir yere tıklanınca, farenin konumuna bakılmaksızın kapanır.
  document.addEventListener('click', (e)=>{
    if(!wrap.contains(e.target)) closePanel();
  });
  // Panelin İÇİNE tıklamak (satırlara, butonlara) paneli kapatmaz.
  panel.addEventListener('click', (e)=> e.stopPropagation());

  panel.querySelectorAll('[data-gvy-filebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      aktifSecimTipi = row ? row.getAttribute('data-gvy-type') : null;
      fileInputGvy.value = '';
      fileInputGvy.click();
    });
  });
  fileInputGvy.addEventListener('change', (e)=>{
    // handleFiles zaten dosya İÇERİĞİNE bakarak tipi otomatik algılıyor (detectType) — hangi
    // "Dosya Seç" butonuna basıldığı sadece dosya seçiciyi tetiklemek için kullanılır, algılamayı
    // etkilemez. Kullanıcı yanlışlıkla farklı bir dosya seçse bile doğru tipe yerleşir.
    handleFiles(e.target.files);
    aktifSecimTipi = null;
  });

  // "Kaldır" butonu: o satırın seçili dosyasını (state.files[tip]) temizler — dosya hiç
  // seçilmemişse veya yükleme sırasında bir sorun oluşup type tanınamamışsa buton zaten gizli kalır
  // (bkz. updateGvyPanel). Kaldırma sonrası hem panel hem ana ekran checklist'i tazelenir.
  panel.querySelectorAll('[data-gvy-removebtn]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const row = btn.closest('.gvy-row');
      const tip = row ? row.getAttribute('data-gvy-type') : null;
      if(!tip) return;
      state.files[tip] = null;
      if(typeof updateChecklist === 'function') updateChecklist();
      updateGvyPanel();
    });
  });

  // Her GVY dosya türü, Fatura Kontrol arşivinde (state.faturaArsivCache, gün->{...}) hangi alanda
  // tutuluyorsa (Yükleme Raporu hariç — o ayrı bir arşivde, state.yuklemeArsivCache), o alanı taşıyan
  // EN GÜNCEL (en büyük tarihli) günü bulur. Böylece "bu dosya türü için arşivde en son hangi günün
  // verisi var" bilgisi GVY panelinde ilgili satırın altında gösterilebilir.
  // NOT: Depozito Tahsilat dosyası (ayrı bir dosya/tip olarak) SİSTEMDEN TAMAMEN KALDIRILDI
  // (kullanıcı kararı) — Depozito İade artık Fatura Dökümü içindeki "Depozito İade Faturası"
  // türünden, 'FaturaIade' etiketiyle geliyor (bkz. buildReport'taki İade Grubu mantığı).
  const GVY_ARSIV_ALAN_ESLEME = {
    siparis: 'siparisArsiv',
    tahsilat: 'tahsilatArsiv',
    fatura: 'faturaArsiv',
    bayiHakedis: 'bayiHakedisArsiv',
  };
  // ÖNEMLİ: kayitZamani, faturaKontrolArsivineKaydetVeSenkronizeEt() içinde SADECE o günkü
  // "Raporu Oluştur/Veri Güncelle" işleminin GERÇEKTEN çalıştığı günün altına yazılır (bugunKey).
  // Yani bu değer, o dosyanın (Sipariş/Tahsilat/Fatura/…) EN SON HANGİ TARİH VE SAATTE fiilen
  // yüklenip işlendiğini gösterir — verinin İÇİNDEKİ tarihi değil, YÜKLEME ANINI temsil eder.
  // gunKey ile kayitZamani'nin ait olduğu gün FARKLI olabilir (örn. Fatura Dökümü'nde bir satır
  // geçmiş bir Fatura Tarihi'ne dağıtılmış olabilir) — bu yüzden ikisi ayrı ayrı döndürülür.
  function gvyTipiIcinEnGuncelArsivGunu(tip){
    if(tip === 'yukleme'){
      const gunler = Object.keys(state.yuklemeArsivCache || {}).filter(g=>{
        const g2 = state.yuklemeArsivCache[g];
        return g2 && (g2.sevkiyatVerisiVarMi || g2.tahsilatVerisiVarMi);
      });
      const enGuncelGun = gunler.length ? gunler.sort()[gunler.length-1] : null;
      return { gunKey: enGuncelGun, kayitZamani: gvyTipiIcinSonKayitZamani(tip) };
    }
    const alan = GVY_ARSIV_ALAN_ESLEME[tip];
    if(!alan) return { gunKey: null, kayitZamani: null };
    const arsiv = state.faturaArsivCache || {};
    const gunler = Object.keys(arsiv).filter(g=>{
      const kayit = arsiv[g] && arsiv[g][alan];
      return Array.isArray(kayit) ? kayit.length>0 : Boolean(kayit);
    });
    const enGuncelGun = gunler.length ? gunler.sort()[gunler.length-1] : null;
    return { gunKey: enGuncelGun, kayitZamani: gvyTipiIcinSonKayitZamani(tip) };
  }
  // Arşivdeki TÜM günleri tarayıp, o tipe ait veri içeren günlerden kayitZamani'si en güncel
  // (en yeni ISO zaman damgalı) olanını döndürür — bu, o dosyanın gerçekte en son ne zaman
  // yüklendiğini/işlendiğini gösterir. kayitZamani sadece "Raporu Oluştur/Veri Güncelle"
  // işleminin GERÇEKTEN çalıştığı bugünün altına yazıldığı için (bkz.
  // faturaKontrolArsivineKaydetVeSenkronizeEt), bu değer eski/geçmiş arşiv günlerinde bulunmaz —
  // yalnızca o dosyanın en son işlendiği güne ait kayıtta vardır.
  function gvyTipiIcinSonKayitZamani(tip){
    if(tip === 'yukleme'){
      // Yükleme Raporu kendi ayrı arşivinde (state.yuklemeArsivCache) tutulur; her günün
      // kayitZamani'si yuklemeRaporlariniArsivineKaydet() içinde ayrıca yazılır.
      const arsiv = state.yuklemeArsivCache || {};
      let enGuncelIso = null;
      Object.keys(arsiv).forEach(gunKey=>{
        const gun = arsiv[gunKey];
        if(gun && gun.kayitZamani && (!enGuncelIso || gun.kayitZamani > enGuncelIso)) enGuncelIso = gun.kayitZamani;
      });
      return enGuncelIso;
    }
    const alan = GVY_ARSIV_ALAN_ESLEME[tip];
    const arsiv = state.faturaArsivCache || {};
    let enGuncelIso = null;
    Object.keys(arsiv).forEach(gunKey=>{
      const gun = arsiv[gunKey];
      if(!gun || !gun.kayitZamani) return;
      const kayit = alan ? gun[alan] : null;
      const buGundeVarMi = Array.isArray(kayit) ? kayit.length>0 : Boolean(kayit);
      if(buGundeVarMi && (!enGuncelIso || gun.kayitZamani > enGuncelIso)) enGuncelIso = gun.kayitZamani;
    });
    return enGuncelIso;
  }
  function gvyGunKeyGoster(bilgi){
    if(!bilgi || !bilgi.gunKey) return '';
    // Gerçek yükleme zamanı (tarih+saat) biliniyorsa onu göster; bilinmiyorsa (örn. eski
    // kayıtlar kayitZamani alanından önce oluşturulmuşsa, ya da Yükleme Raporu için) eski
    // "Son veri: gg.aa.yyyy" gösterimine geri düş.
    if(bilgi.kayitZamani){
      const zd = new Date(bilgi.kayitZamani);
      if(!isNaN(zd.getTime())){
        return 'Son güncelleme: ' + zd.toLocaleDateString('tr-TR') + ' ' + zd.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
      }
    }
    const d = new Date(bilgi.gunKey + 'T00:00:00');
    if(isNaN(d.getTime())) return '';
    return 'Son veri: ' + d.toLocaleDateString('tr-TR');
  }

  // Panel her açıldığında/dosya seçildiğinde satırların durumunu (dosya adı / satır sayısı) günceller.
  window.updateGvyPanel = function updateGvyPanel(){
    GVY_DOSYA_TIPLERI.forEach(tip=>{
      const row = panel.querySelector('.gvy-row[data-gvy-type="'+tip+'"]');
      if(!row) return;
      const sub = row.querySelector('[data-gvy-sub]');
      const arsivGunEl = row.querySelector('[data-gvy-arsivgun]');
      if(arsivGunEl) arsivGunEl.textContent = gvyGunKeyGoster(gvyTipiIcinEnGuncelArsivGunu(tip));
      const fileBtn = row.querySelector('[data-gvy-filebtn]');
      const removeBtn = row.querySelector('[data-gvy-removebtn]');
      const info = state.files[tip];
      if(info){
        sub.textContent = info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır';
        fileBtn.textContent = 'Değiştir';
        fileBtn.classList.add('done');
        if(removeBtn) removeBtn.style.display = '';
      }else{
        sub.textContent = 'Henüz dosya seçilmedi';
        fileBtn.textContent = 'Dosya Seç';
        fileBtn.classList.remove('done');
        if(removeBtn) removeBtn.style.display = 'none';
      }
    });
    const secilenSayisi = GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length;
    toggleBtn.classList.toggle('has-update', secilenSayisi>0);
    // Buton, dosya seçilmemişse VEYA bugün Kalemler yoksa kilitli (genel kural).
    updateBtn.disabled = secilenSayisi===0 || !bugunKalemlerVarMi();

    // Kanal Raporları (Geleneksel/Modern) bölümü: bu ikisi diğer GVY tipleri gibi günlük
    // arşive değil, kendi "güncel/canlı" rapor nesnesine (state.sellOutReport/modernKanalReport)
    // yazıldığı için — o raporun EN SON NE ZAMAN hesaplandığını (state.sellOut/modernKanalSonGuncelleme
    // zaman damgasını) gösterir.
    const sellOutSonEl = document.getElementById('sellOutKendiSonVeri');
    if(sellOutSonEl){
      sellOutSonEl.textContent = state.sellOutSonGuncelleme
        ? 'Son veri: ' + new Date(state.sellOutSonGuncelleme).toLocaleDateString('tr-TR') + ' ' + new Date(state.sellOutSonGuncelleme).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
        : '';
    }
    const modernKanalSonEl = document.getElementById('modernKanalKendiSonVeri');
    if(modernKanalSonEl){
      modernKanalSonEl.textContent = state.modernKanalSonGuncelleme
        ? 'Son veri: ' + new Date(state.modernKanalSonGuncelleme).toLocaleDateString('tr-TR') + ' ' + new Date(state.modernKanalSonGuncelleme).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
        : '';
    }
  };

  async function gvyLastSyncGuncelle(){
    if(!lastSyncEl) return;
    const bugunKey = dateKeyLocal(new Date());
    const arsiv = state.faturaArsivCache || {};
    const kayit = arsiv[bugunKey];
    if(kayit && kayit.kayitZamani){
      const d = new Date(kayit.kayitZamani);
      lastSyncEl.textContent = 'Son güncelleme: ' + d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    }else{
      lastSyncEl.textContent = 'Son güncelleme: —';
    }
  }

  // "Veri Güncelle": Kalemler zaten hafızada/bulutta olduğu için, mevcut "Raporu Oluştur" akışını
  // (buildBtn.click ile TAMAMEN AYNI kod yolunu) tetikler — hesaplama mantığına dokunulmaz, sadece
  // kullanıcı deneyimi bu ayrı panelden geçer. state.report henüz hiç oluşmadıysa (uygulama daha
  // hiç rapor üretmediyse) bu panel kullanılamaz — önce ana ekrandan Kalemler ile ilk rapor
  // oluşturulmalıdır.
  updateBtn.addEventListener('click', async ()=>{
    // Genel kural: güne mutlaka Kalemler ile başlanmalı. Bugün Kalemler yüklenmemişse (ne bu
    // oturumda ne de bugüne ait tek-slot kaydından geri gelmişse) hiçbir güncellemeye izin yok.
    // Basmadan önce durumu asenkron TAZELE (rapor oluşmuş olabilir, bellek boş olabilir).
    if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele();
    if(!bugunKalemlerVarMi()){
      statusMsg.textContent = 'Önce bugünün Kalemler dosyasını ana ekrandan yükleyip "Raporu Oluştur"a basın.';
      gvyKalemlerUyariGuncelle();
      return;
    }
    if(!(await ortakSifreDogrula('Veriyi güncellemek için şifreyi girin:'))) return;
    updateBtn.disabled = true;
    const oncekiMetin = updateBtn.textContent;
    updateBtn.textContent = 'Güncelleniyor…';
    statusMsg.textContent = '';
    try{
      await raporuOlusturVeyaGuncelleAkisiniCalistir();
      statusMsg.textContent = 'Veriler güncellendi.';
      await gvyLastSyncGuncelle();
      updateGvyPanel();
      closePanel();
    }catch(err){
      console.error(err);
      statusMsg.textContent = 'Güncelleme sırasında hata oluştu: ' + err.message;
    }finally{
      updateBtn.disabled = GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length===0;
      updateBtn.textContent = oncekiMetin;
    }
  });

  // "Şimdi Senkronize Et": mevcut "Diğer Cihazdan Güncelle" (syncBtn) kısayoludur — ayrı bir
  // kavram eklemez, sadece bu panelden de erişilebilir hale getirir.
  syncBtnGvy.addEventListener('click', async ()=>{
    if(!cloudEnabled()){
      statusMsg.textContent = 'Bulut bağlantısı yapılandırılmamış.';
      return;
    }
    syncBtnGvy.disabled = true;
    statusMsg.textContent = 'Senkronize ediliyor…';
    try{
      syncBtn.click();
      statusMsg.textContent = 'Senkronizasyon başlatıldı.';
      await gvyLastSyncGuncelle();
      updateGvyPanel();
    }finally{
      syncBtnGvy.disabled = false;
    }
  });

  // ============================== GRUP C: "GÜNLÜK VERİ YÜKLE" SEKMESİ ==============================
  // Çek/Senet, Ticari Stok, Ciro Primi, Dönemsel İskonto — gün içinde sürekli güncellenebilir.
  // "Verileri Kaydet"e basınca dosyalar KALICI tek-slot arşive yazılır (grupATekilDosyaKaydet) ve
  // state.files'a da konur ki bir sonraki "Veri Güncelle/Raporu Oluştur" bunları kullansın.
  // KASITLI OLARAK otomatik yeniden hesaplama YAPILMAZ — kullanıcı raporu elle yeniler.
  const gvcFileInput = document.getElementById('gvcFileInput');
  const gvcUpdateBtn = document.getElementById('gvcUpdateBtn');
  const gvcStatusMsg = document.getElementById('gvcStatusMsg');
  let gvcAktifSecimTipi = null;

  panel.querySelectorAll('[data-gvc-filebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      gvcAktifSecimTipi = row ? row.getAttribute('data-gvc-type') : null;
      if(gvcFileInput){ gvcFileInput.value=''; gvcFileInput.click(); }
    });
  });
  panel.querySelectorAll('[data-gvc-removebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      const tip = row ? row.getAttribute('data-gvc-type') : null;
      if(tip && state.filesC){ delete state.filesC[tip]; updateGvcPanel(); }
    });
  });

  if(gvcFileInput){
    gvcFileInput.addEventListener('change', (e)=>{
      const files = Array.from(e.target.files||[]);
      if(!files.length) return;
      if(!xlsxHazirMi()){ gvcStatusMsg.textContent = 'Excel okuma bileşeni (xlsx) yüklenemedi — sayfayı yenileyin.'; return; }
      // Birden fazla dosya seçilebilir; her biri detectType ile tanınıp DOĞRU Grup C slotuna yazılır.
      // "Dosya Seç"e basılan satır (gvcAktifSecimTipi) bir ipucudur ama tip otomatik doğrulanır.
      let okunan = 0, sorun = [];
      Promise.all(files.map(file=> new Promise(resolve=>{
        const reader = new FileReader();
        reader.onerror = ()=>{ sorun.push(file.name+': okunamadı'); resolve(); };
        reader.onload = (ev)=>{
          try{
            const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
            const {type, headers, data} = ilkUygunSayfayiSec(wb);
            if(!type || !GRUP_C_DOSYA_TIPLERI.includes(type)){
              sorun.push('"'+file.name+'" bu sekmeye ait bir dosya değil (yalnızca Çek/Senet, Ticari Stok, Ciro Primi, Dönemsel İskonto).');
              resolve(); return;
            }
            state.filesC[type] = {name:file.name, headers, data};
            okunan++;
          }catch(err){ sorun.push(file.name+': '+err.message); }
          resolve();
        };
        reader.readAsArrayBuffer(file);
      }))).then(()=>{
        updateGvcPanel();
        gvcStatusMsg.textContent = (okunan? okunan+' dosya seçildi. ':'') + (sorun.length? sorun.join(' ') : '');
      });
    });
  }

  if(gvcUpdateBtn){
    gvcUpdateBtn.addEventListener('click', async ()=>{
      // Basmadan önce Kalemler durumunu asenkron tazele (rapor oluşmuş ama bellek boş olabilir).
      if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele();
      if(!bugunKalemlerVarMi()){
        gvcStatusMsg.textContent = 'Önce bugünün Kalemler dosyasını ana ekrandan yükleyin.';
        return;
      }
      if(GRUP_C_HAZIR_SAYISI()===0){ gvcStatusMsg.textContent = 'Önce en az bir dosya seçin.'; return; }
      if(!(await ortakSifreDogrula('Verileri güncellemek için şifreyi girin:'))) return;
      gvcUpdateBtn.disabled = true;
      const oncekiMetin = gvcUpdateBtn.textContent;
      gvcUpdateBtn.textContent = 'Güncelleniyor…';
      try{
        // 1) Her seçili Grup C dosyasını KALICI tek-slot arşive yaz ve state.files'a taşı.
        for(const tip of GRUP_C_DOSYA_TIPLERI){
          const f = state.filesC[tip];
          if(!f) continue;
          state.files[tip] = {name:f.name, headers:f.headers, data:f.data};
          await grupATekilDosyaKaydet(tip, f.data, f.headers, f.name);
        }
        state.filesC = {}; // seçim kuyruğunu temizle (artık kalıcı kaydedildi)
        updateGvcPanel();
        // 2) Raporu YENİDEN HESAPLA: çek/senet, ticari stok vb. veri girişi olduğundan müşteri
        //    kartlarındaki bilgiler ANINDA güncellensin. En son Kalemler arşivi kullanılır
        //    (grupATekilDosyalariHazirla bunu otomatik getirir), tekrar Kalemler istenmez.
        await raporuOlusturVeyaGuncelleAkisiniCalistir();
        gvcStatusMsg.textContent = '✓ Güncellendi — ' + fmtDate(new Date()) + '. Kartlar yeni verilerle yenilendi.';
        if(typeof closePanel === 'function') closePanel();
      }catch(err){
        console.error('Grup C güncelleme hatası:', err);
        gvcStatusMsg.textContent = 'Hata: ' + err.message;
      }finally{
        gvcUpdateBtn.textContent = oncekiMetin;
        gvcUpdateBtn.disabled = !bugunKalemlerVarMi() || GRUP_C_HAZIR_SAYISI()===0;
      }
    });
  }

  // Grup C panel görünümünü tazeler: seçili dosya adları, kalıcı arşivdeki son yüklenme tarihi,
  // buton kilidi. window'a asılır ki openPanel ve dışarıdan çağrılabilsin.
  window.updateGvcPanel = async function updateGvcPanel(){
    for(const tip of GRUP_C_DOSYA_TIPLERI){
      const row = panel.querySelector('.gvy-row[data-gvc-type="'+tip+'"]');
      if(!row) continue;
      const subEl = row.querySelector('[data-gvc-sub]');
      const arsivEl = row.querySelector('[data-gvc-arsivgun]');
      const removeBtn = row.querySelector('[data-gvc-removebtn]');
      const secili = state.filesC && state.filesC[tip];
      if(secili){
        if(subEl) subEl.textContent = secili.name + ' (' + (secili.data?secili.data.length:0) + ' satır) — kaydedilmedi';
        if(removeBtn) removeBtn.style.display = 'inline-flex';
      }else{
        if(subEl) subEl.textContent = 'Dosya seçilmedi';
        if(removeBtn) removeBtn.style.display = 'none';
      }
      // Kalıcı arşivdeki son yüklenme tarihi (kaydedilmiş hali).
      if(arsivEl){
        try{
          const kayit = await grupATekilDosyaYerelOku(tip);
          arsivEl.textContent = (kayit && kayit.tarih)
            ? 'Son kayıt: ' + new Date(kayit.tarih).toLocaleDateString('tr-TR') + ' ' + new Date(kayit.tarih).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
            : '';
        }catch(_){ arsivEl.textContent=''; }
      }
    }
    if(gvcUpdateBtn) gvcUpdateBtn.disabled = !bugunKalemlerVarMi() || GRUP_C_HAZIR_SAYISI()===0;
  };

  updateGvyPanel();
  updateGvcPanel();
  gvyLastSyncGuncelle();
})();

async function resetAll(){
  state.files = {kalemler:null, siparis:null, tahsilat:null, cekSenet:null, ticariStok:null, fatura:null, bayiHakedis:null, yukleme:null, musteriMaster:null, rutPlani:null, ciroPrimi:null, donemselIskonto:null, sellOut:null, cariEkstre:null};
  state.filesC = {}; // Grup C seçim kuyruğu da sıfırlanır
  state.report = null;
  state.expanded.clear();
  state.yuklemeReport = null;
  state.yuklemeSeciliGun = null;
  state.bayiHakedisReport = null;
  state.bayiHakedisHata = null;
  state.sellOutReport = null;
  await clearStoredReport();
  const ICON_NUMS = {kalemler:'', siparis:'', tahsilat:'', cekSenet:'', ticariStok:'', fatura:'', bayiHakedis:'', yukleme:'', musteriMaster:'', ciroPrimi:'', donemselIskonto:'', sellOut:''};
  document.querySelectorAll('.check-item').forEach(el=>{
    el.classList.remove('done');
    el.querySelector('.check-icon').textContent = ICON_NUMS[el.getAttribute('data-type')] || '';
    el.querySelector('.check-meta').textContent='';
  });
  buildBtn.disabled = true;
  buildBtn.textContent = 'Raporu Oluştur';
  if(typeof gvyAnaBuildBtn !== 'undefined' && gvyAnaBuildBtn){ gvyAnaBuildBtn.disabled = true; gvyAnaBuildBtn.textContent = 'Raporu Oluştur'; }
  statusPillMsg.textContent = 'Veri bekleniyor';
  statusPill.classList.remove('ok');
  document.getElementById('uploadCard').style.display='block';
  document.getElementById('reportSection').style.display='none';
  document.body.classList.remove('has-sidebar');
  document.getElementById('storageNote').style.display='none';
  resetBtn.style.display='none';
  syncBtn.style.display='none';
  fileInput.value = '';
  if(typeof updateGvyPanel === 'function') updateGvyPanel();
  document.getElementById('vadeMinInput').value = '';
  document.getElementById('vadeMaxInput').value = '';
  document.getElementById('sevkVadeMinInput').value = '';
  document.getElementById('sevkVadeMaxInput').value = '';
  document.querySelectorAll('.tab-btn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.sb-nav-link').forEach(b=> b.classList.remove('active'));
  const genelBakisTab = document.getElementById('sbbtn-genelBakis');
  if(genelBakisTab) genelBakisTab.classList.add('active');
  document.getElementById('genelBakisView').style.display='block';
  document.getElementById('genelView').style.display='none';
  document.getElementById('sevkView').style.display='none';
  document.getElementById('yuklemeView').style.display='none';
  document.getElementById('yaslandirmaView').style.display='none';
  document.getElementById('rutView').style.display='none';
  document.getElementById('ticariStokView').style.display='none';
  document.getElementById('faturaKontrolView').style.display='none';
  document.getElementById('bayiHakedisView').style.display='none';
  document.getElementById('sellOutView').style.display='none';
  document.getElementById('tahsilatVerimlilikView').style.display='none';
  document.getElementById('dsoTrendView').style.display='none';
  document.getElementById('nakitAkisView').style.display='none';
  document.getElementById('supheliAlacakView').style.display='none';
  document.getElementById('temsilciKarnesiView').style.display='none';
  document.getElementById('yonetimOzetiView').style.display='none';
  document.getElementById('ceiView').style.display='none';
}
// "Yeni veri yükle" (resetBtn) için kilit kontrolü: bugün Kalemler zaten yüklenmişse (state.files.kalemler
// bellekte doluysa VEYA bugunKalemlerDurumTazele() ile belirlenen state.bugunKalemlerHazir true ise) ana
// yükleme ekranına geçiş engellenir, sadece bilgilendirici bir uyarı modalı gösterilir. Bu, Kalemler'in
// gün içinde yanlışlıkla ikinci kez yüklenip müşteri kartlarının sıfırdan kurulmasını (ve yeni dosyada
// olmayan müşterilerin kartlarının kaybolmasını) önlemek içindir — bkz. buildReport() ve GRUP_A_TEKIL_DOSYA_TANIMLARI.kalemler.
/* ÖLÜ KOD TEMİZLİĞİ: "Kalemler günde 1 kez" kilidi tamamen kaldırılmıştı (bkz. resetBtn'deki
   not) — modalı açan tek çağrı (kalemlerKilitModalAc) ile birlikte kapatma/geri sayım zinciri
   (kalemlerKilitModalKapat, GeriSayimGuncelle/Baslat/Durdur) ve modal DOM'u da kaldırıldı. */
// ===================== ARŞİV VERİSİ: TARİH ARALIKLI SİLME (GENEL) =====================
// Sipariş/Tahsilat/Fatura/Bayi Hak Ediş/Yükleme Raporu arşiv satırlarındaki çöp kutusu
// ikonlarının hepsi bu tek modalı ve tek genel silme fonksiyonunu kullanır. Kullanıcı
// "Tek bir gün / Belirli bir ay / Tarih aralığı / Bugünden önceki tüm kayıtlar" seçeneklerinden
// birini seçip [baslangicKey, bitisKey] (dahil-dahil, YYYY-MM-DD) aralığını belirler; silme bu
// aralıktaki günlerin SADECE ilgili tipe ait alanını temizler, diğer tiplere dokunmaz.
//
// Veri yapısı özeti (state.faturaArsivCache[gunKey] = {...}):
//   siparis      -> gun.siparisArsiv (dizi)
//   tahsilat     -> gun.tahsilatArsiv (dizi) — formatKaynagi 'FaturaIade' OLMAYAN satırlar
//   fatura       -> gun.faturaArsiv (dizi)
//   bayiHakedis  -> gun.bayiHakedisArsiv (dizi)
//   yukleme      -> state.yuklemeArsivCache[gunKey] (AYRI bir arşiv, faturaArsivCache'te değil)
// NOT: Depozito Tahsilat dosyası (ayrı tip/dosya olarak) SİSTEMDEN TAMAMEN KALDIRILDI — Depozito
// İade artık Fatura Dökümü'ndeki "Depozito İade Faturası" türünden, 'FaturaIade' etiketiyle geliyor
// (bkz. buildReport'taki İade Grubu mantığı), bu yüzden ayrı bir silme dalına gerek kalmadı.
const ARSIV_SIL_TIP_ETIKET = {
  siparis:'Sipariş Dökümü', tahsilat:'Tahsilat Dökümü', fatura:'Fatura Dökümü',
  bayiHakedis:'Bayi Hak Ediş', yukleme:'Yükleme Raporu',
};
async function arsivTarihAraligindaSil(tip, baslangicKey, bitisKey){
  if(tip === 'yukleme'){
    let arsiv = null;
    if(cloudEnabled()) arsiv = await loadYuklemeArsivFromCloud();
    if(!arsiv) arsiv = await loadYuklemeArsivFromLocal();
    arsiv = arsiv || {};
    const yeniArsiv = Object.assign({}, arsiv);
    let etkilenenGunSayisi = 0;
    Object.keys(yeniArsiv).forEach(gunKey=>{
      if(gunKey < baslangicKey || gunKey > bitisKey) return;
      delete yeniArsiv[gunKey];
      etkilenenGunSayisi++;
    });
    if(!etkilenenGunSayisi) return {temizlenenGunSayisi: 0};
    state.yuklemeArsivCache = yeniArsiv;
    await saveYuklemeArsivToLocal(yeniArsiv);
    if(cloudEnabled()) await saveYuklemeArsivToCloud(yeniArsiv);
    return {temizlenenGunSayisi: etkilenenGunSayisi};
  }

  await faturaArsivYenile();
  const eskiArsivTumu = state.faturaArsivCache || {};
  const yeniArsivTumu = Object.assign({}, eskiArsivTumu);
  let etkilenenGunSayisi = 0;

  Object.keys(yeniArsivTumu).forEach(gunKey=>{
    if(gunKey < baslangicKey || gunKey > bitisKey) return;
    const gun = yeniArsivTumu[gunKey];
    if(!gun) return;

    const alan = {siparis:'siparisArsiv', tahsilat:'tahsilatArsiv', fatura:'faturaArsiv', bayiHakedis:'bayiHakedisArsiv'}[tip];
    if(!alan) return;
    if(tip === 'tahsilat'){
      // Tahsilat Dökümü sadece "gerçek" tahsilat satırlarını kapsar; İade Grubu (FaturaIade
      // etiketli — Bozuk/Sağlam/Depozito İade Faturası) bu tipin silme kapsamına dahil edilmez
      // (bu satırlar yalnızca Fatura Dökümü'nün yeniden yüklenmesiyle güncellenir) — bu yüzden
      // SADECE o etiketli satırlar korunur (kalan), etiketsiz/normal tahsilat satırları silinir.
      const eski = gun.tahsilatArsiv || [];
      const kalan = eski.filter(r=> r && r.formatKaynagi === 'FaturaIade');
      if(kalan.length !== eski.length){
        yeniArsivTumu[gunKey] = Object.assign({}, gun, {tahsilatArsiv: kalan});
        etkilenenGunSayisi++;
      }
      return;
    }
    if(tip === 'fatura'){
      // Fatura Dökümü silinirken, o günün faturaArsiv'i (satış tutarları) temizlenir VE aynı
      // yüklemeden türeyen 'FaturaIade' etiketli tahsilat kredileri de (İade Grubu) birlikte
      // temizlenir — ikisi de AYNI kaynak dosyadan (Fatura Dökümü) geldiği için, kullanıcı bu
      // dosyanın verisini silerken iade tahsilatlarının arşivde "yetim" kalmaması gerekir.
      const eskiFatura = gun.faturaArsiv || [];
      const eskiTahsilat = gun.tahsilatArsiv || [];
      const kalanTahsilat = eskiTahsilat.filter(r=> !(r && r.formatKaynagi === 'FaturaIade'));
      const faturaDegisti = eskiFatura.length>0;
      const tahsilatDegisti = kalanTahsilat.length !== eskiTahsilat.length;
      if(faturaDegisti || tahsilatDegisti){
        yeniArsivTumu[gunKey] = Object.assign({}, gun, {faturaArsiv: [], tahsilatArsiv: kalanTahsilat});
        etkilenenGunSayisi++;
      }
      return;
    }
    if(Array.isArray(gun[alan]) && gun[alan].length){
      yeniArsivTumu[gunKey] = Object.assign({}, gun, {[alan]: []});
      etkilenenGunSayisi++;
    }
  });

  if(!etkilenenGunSayisi) return {temizlenenGunSayisi: 0};
  state.faturaArsivCache = yeniArsivTumu;
  await saveFaturaKontrolArsivToLocal(state.faturaArsivCache).catch(()=>{});
  let bulutHatasi = false;
  if(cloudEnabled()){
    const fark = faturaKontrolArsivGunFarkiniBul(eskiArsivTumu, yeniArsivTumu);
    try{ await saveFaturaKontrolArsivGunleriToCloud(fark); }
    catch(err){
      console.error(ARSIV_SIL_TIP_ETIKET[tip]+' arşiv silme buluta yazılamadı:', err);
      // TUTARLILIK DÜZELTMESİ: hata yutulup başarı döndürülüyordu — kullanıcı "silindi" mesajı
      // görüyor ama bulut kopyası duruyor, bir sonraki buluttan tazelemede kayıtlar GERİ GELİYORDU.
      // Artık çağıran tarafın uyarı gösterebilmesi için bayrakla bildirilir.
      bulutHatasi = true;
    }
  }
  return {temizlenenGunSayisi: etkilenenGunSayisi, bulutHatasi};
}

(function(){
  const overlay = document.getElementById('arsivSilModalOverlay');
  const closeBtn = document.getElementById('arsivSilModalClose');
  const iptalBtn = document.getElementById('arsivSilIptalBtn');
  const onayBtn = document.getElementById('arsivSilOnayBtn');
  const subEl = document.getElementById('arsivSilModalSub');
  const hataEl = document.getElementById('arsivSilHata');
  const kapsamGrup = document.getElementById('arsivSilKapsamGrup');
  const alanGun = document.getElementById('arsivSilAlanGun');
  const alanAy = document.getElementById('arsivSilAlanAy');
  const alanAralik = document.getElementById('arsivSilAlanAralik');
  const alanHepsi = document.getElementById('arsivSilAlanHepsi');
  const gunInput = document.getElementById('arsivSilGunInput');
  const ayInput = document.getElementById('arsivSilAyInput');
  const baslangicInput = document.getElementById('arsivSilBaslangicInput');
  const bitisInput = document.getElementById('arsivSilBitisInput');
  if(!overlay || !kapsamGrup) return;

  let aktifTip = null;

  function kapsamiGuncelle(){
    const secili = kapsamGrup.querySelector('input[name="arsivSilKapsam"]:checked');
    const deger = secili ? secili.value : 'gun';
    alanGun.style.display = deger==='gun' ? 'flex' : 'none';
    alanAy.style.display = deger==='ay' ? 'flex' : 'none';
    alanAralik.style.display = deger==='aralik' ? 'flex' : 'none';
    alanHepsi.style.display = deger==='hepsi' ? 'block' : 'none';
    hataEl.textContent = '';
  }
  kapsamGrup.querySelectorAll('input[name="arsivSilKapsam"]').forEach(r=> r.addEventListener('change', kapsamiGuncelle));

  function ac(tip){
    aktifTip = tip;
    const etiket = ARSIV_SIL_TIP_ETIKET[tip] || tip;
    subEl.textContent = etiket + ' arşiv kayıtlarını silmek için tarih seçin';
    hataEl.textContent = '';
    const bugun = dateKeyLocal(new Date());
    gunInput.value = ''; gunInput.max = bugun;
    ayInput.value = ''; ayInput.max = bugun.slice(0,7);
    baslangicInput.value = ''; baslangicInput.max = bugun;
    bitisInput.value = ''; bitisInput.max = bugun;
    kapsamGrup.querySelector('input[name="arsivSilKapsam"][value="gun"]').checked = true;
    kapsamiGuncelle();
    overlay.classList.add('open');
  }
  function kapat(){ overlay.classList.remove('open'); aktifTip = null; }

  document.querySelectorAll('[data-gvy-arsivsilbtn]').forEach(btn=>{
    btn.addEventListener('click', ()=> ac(btn.getAttribute('data-gvy-arsivsilbtn')));
  });
  if(closeBtn) closeBtn.addEventListener('click', kapat);
  if(iptalBtn) iptalBtn.addEventListener('click', kapat);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) kapat(); });

  onayBtn.addEventListener('click', async ()=>{
    if(!aktifTip) return;
    const secili = kapsamGrup.querySelector('input[name="arsivSilKapsam"]:checked');
    const deger = secili ? secili.value : 'gun';
    const bugunKey = dateKeyLocal(new Date());
    let baslangicKey, bitisKey, aciklama;

    if(deger === 'gun'){
      if(!gunInput.value){ hataEl.textContent = 'Lütfen bir tarih seçin.'; return; }
      baslangicKey = bitisKey = gunInput.value;
      aciklama = new Date(gunInput.value+'T00:00:00').toLocaleDateString('tr-TR');
    }else if(deger === 'ay'){
      if(!ayInput.value){ hataEl.textContent = 'Lütfen bir ay seçin.'; return; }
      baslangicKey = ayInput.value + '-01';
      const [yy, mm] = ayInput.value.split('-').map(Number);
      const ayinSonGunu = new Date(yy, mm, 0).getDate();
      bitisKey = ayInput.value + '-' + String(ayinSonGunu).padStart(2,'0');
      aciklama = ayInput.value + ' ayı';
    }else if(deger === 'aralik'){
      if(!baslangicInput.value || !bitisInput.value){ hataEl.textContent = 'Lütfen başlangıç ve bitiş tarihlerini seçin.'; return; }
      if(baslangicInput.value > bitisInput.value){ hataEl.textContent = 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'; return; }
      baslangicKey = baslangicInput.value; bitisKey = bitisInput.value;
      aciklama = new Date(baslangicKey+'T00:00:00').toLocaleDateString('tr-TR') + ' – ' + new Date(bitisKey+'T00:00:00').toLocaleDateString('tr-TR');
    }else{ // hepsi
      baslangicKey = '0000-00-00';
      bitisKey = bugunKey; // bugün dahil değil; aşağıda '<' ile hariç tutulur
      aciklama = 'bugünden önceki tüm kayıtlar';
    }
    if(deger !== 'hepsi' && bitisKey > bugunKey){ hataEl.textContent = 'Bugünden sonraki bir tarih seçilemez.'; return; }

    if(!(await ortakSifreDogrula((ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' arşiv kayıtlarını silmek için şifreyi girin:'))) return;
    const onayMesaji = deger==='hepsi'
      ? 'Bugünden önceki TÜM '+(ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' arşiv kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?'
      : (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' için '+aciklama+' tarih(ler)ine ait arşiv kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?';
    if(!window.confirm(onayMesaji)) return;

    const oncekiMetin = onayBtn.innerHTML;
    onayBtn.disabled = true;
    onayBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
    try{
      // "hepsi" durumunda bugünkü kayıt korunmalı: bitisKey'i bugünden bir gün öncesine çekiyoruz.
      let etkinBitis = bitisKey;
      if(deger === 'hepsi'){
        const d = new Date(bugunKey+'T00:00:00'); d.setDate(d.getDate()-1);
        etkinBitis = dateKeyLocal(d);
      }
      const sonuc = await arsivTarihAraligindaSil(aktifTip, baslangicKey, etkinBitis);
      if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
      if(typeof updateGvyPanel === 'function') updateGvyPanel();
      if(sonuc.bulutHatasi){
        // Kritik: silme buluta yazılamadı — kullanıcının kaçırmaması için bloke edici alert kalır.
        window.alert(
          (sonuc.temizlenenGunSayisi
            ? sonuc.temizlenenGunSayisi + ' günün ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı silindi.'
            : 'Seçilen tarih aralığında silinecek ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı bulunamadı.')
          + '\n\nUYARI: Silme BULUTA yazılamadı — kayıtlar yalnızca bu cihazdan silindi ve bir sonraki bulut güncellemesinde geri gelebilir. Bağlantınızı kontrol edip işlemi tekrarlayın.'
        );
      } else if(sonuc.temizlenenGunSayisi){
        toastGoster('success', 'Arşiv kayıtları silindi', sonuc.temizlenenGunSayisi + ' günün ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı kaldırıldı.');
      } else {
        toastGoster('warn', 'Silinecek kayıt bulunamadı', 'Seçilen tarih aralığında ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı yok.');
      }
      kapat();
    }catch(err){
      console.error(err);
      hataEl.textContent = 'Silme sırasında bir hata oluştu, lütfen tekrar deneyin.';
    }finally{
      onayBtn.disabled = false;
      onayBtn.innerHTML = oncekiMetin;
    }
  });
})();

resetBtn.addEventListener('click', async ()=>{
  // NOT: "Günde sadece 1 Kalemler" kilidi KALDIRILDI. Grup B artık kalıcı arşivlendiği için
  // (siparis/tahsilat/fatura/... tek-slot'ta saklanıyor), gün içinde birden çok kez Kalemler
  // yüklenebilir — her yeni Kalemler öncekinin ÜZERİNE yazılır ve kartlar yeniden şekillenir.
  // Veri kaybı riski olmadığından kilit modalı artık tetiklenmez.
  if(!(await ortakSifreDogrula('Yeni veri yüklemek için şifreyi girin:'))) return;
  await resetAll();
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && state.report){
    const eskiFark = state.report.canliGunFarki||0;
    canliGunlerleGuncelle(state.report);
    if(state.report.canliGunFarki !== eskiFark) renderReport(state.report);
  }
});

let uygulamaBaslatildiMi = false;
async function uygulamayiBaslat(){
  if(uygulamaBaslatildiMi) return;
  uygulamaBaslatildiMi = true;

  // BULUT YÜKLEME EKRANI: rapor gelene (ya da rapor yok kararı verilene) kadar #reportSection'ın
  // çıplak/boş KPI iskeleti yerine tam ekran, tek bir yükleniyor göstergesi sunulur. Fonksiyon
  // içindeki TÜM çıkış yollarında (rapor bulundu / bulunamadı / hata) en altta kapatılır.
  const bulutYukleEkran = document.getElementById('bulutYuklemeEkrani');

  let report = null, source = null;

  // ÖNEMLİ PERFORMANS DÜZELTMESİ: Bu 9 veri türü (Müşteri Master, Bayi Hakediş, Sell Out
  // Hedef/Rapor/Arşiv, Modern Kanal Hedef/Rapor/Arşiv, Malzemeler Stok) birbirinden TAMAMEN
  // bağımsız — hiçbiri diğerinin sonucunu okumuyor, her biri kendi state.xxx alanına yazıyor.
  // Önceden sırayla (await ... await ... await ...) çalıştırılıyordu; her biri kendi ağ
  // gecikmesini (meta zaman damgası kontrolü + gerekirse indirme) BEKLETEREK topluyor, veri hiç
  // değişmemiş olsa bile 9 ayrı gecikme üst üste binip açılışı yavaşlatıyordu. Promise.all ile
  // hepsi AYNI ANDA başlatılıyor — toplam süre artık en YAVAŞ tekil isteğe eşit, 9'unun
  // TOPLAMINA değil.
  // GÜVENLİK AĞI (açılış donmasın): Bu 9 yardımcı veri isteği tek tek zaman aşımıyla sarılır —
  // biri (ör. ağ/token sorunu) takılırsa 18 sn sonra o istek "yedek (null)" ile çözülür ve açılış
  // devam eder. Böylece tek bir asılı kalan bulut isteği tüm uygulamayı sonsuza kadar bekletmez.
  // Bu isteklerin her biri zaten kendi state alanına yazıyor; başarısız/geç kalan biri sadece o
  // veri türünün bu açılışta cihazdaki son haliyle kalmasına yol açar (bir sonraki açılışta düzelir).
  const ACILIS_ISTEK_TIMEOUT_MS = 18000;
  await Promise.all([
    musteriMasterYenile(),
    bayiHakedisYenile(),
    sellOutHedefYenile(),
    (typeof primVerileriniYukle==='function' ? primVerileriniYukle() : Promise.resolve()),
    sellOutYenile(),
    sellOutArsivYenile(),
    modernKanalHedefYenile(),
    modernKanalYenile(),
    modernKanalArsivYenile(),
    (typeof rutPlaniYenile==='function' ? rutPlaniYenile() : Promise.resolve()),
    malzemelerStokYenile(),
    loadSenetTahsilOnaylariFromLocal(),
    loadHakedisFaturaAlindiFromLocal(),
    (async()=>{ state.cekSenetArsivi = await cekSenetArsiviniOku(); })(),
    (async()=>{ state.tahsilatArsivi = await tahsilatArsiviniOku(); })(),
    (async()=>{ state.devirBakiyeArsivi = await devirBakiyeArsiviniOku(); })(),
    // CİRO PRİMİ / DÖNEMSEL İSKONTO — KALICI ARŞİV (kullanıcı isteği, 24.07.2026): açılışta,
    // Çek/Senet ve Tahsilat ile AYNI noktada okunur — sayfa yenilense de hakediş geçmişi kaybolmaz.
    (async()=>{ state.ciroPrimiArsivi = await ciroPrimiArsiviniOku(); })(),
    (async()=>{ state.donemselIskontoArsivi = await donemselIskontoArsiviniOku(); })(),
  ].map(p=> zamanAsimliYaris(p, ACILIS_ISTEK_TIMEOUT_MS, null)));
  // Paralel yüklemelerin hangi sırada tamamlandığından bağımsız olarak tüm geçmiş müşteri
  // kayıtlarını en son Müşteri Master ilişkisiyle tek seferde yeniden etiketle.
  if(typeof tumYukluVerilerdeMusteriIliskileriniGuncelle==='function') tumYukluVerilerdeMusteriIliskileriniGuncelle();
  if(cloudEnabled()){
    statusPillMsg.textContent = 'Bulut verisi kontrol ediliyor…';
    const bulutYukleMsg = document.getElementById('bulutYuklemeMesaj');
    if(bulutYukleMsg) bulutYukleMsg.textContent = 'Bulut verisi kontrol ediliyor…';
    // Skeleton: bulut kontrolü sürerken kullanıcı boş bir kartla değil, gelecek içeriğin
    // silüetiyle karşılansın (bekleme algısını kısaltır, "dondu mu?" hissini önler).
    const acilisSk = document.getElementById('acilisSkeleton');
    if(acilisSk) acilisSk.style.display = 'block';
    // Uygulama otomatik açılışında, buluttaki küçük zaman damgası cihazdakiyle aynıysa büyük
    // rapor verisi hiç indirilmez — cihazdaki (IndexedDB) kopya doğrudan kullanılır. Kullanıcı
    // "Diğer Cihazdan Güncelle" butonuna BİLEREK bastığında (yukarıdaki syncBtn handler'ı) bu
    // optimizasyon uygulanmaz, orada her zaman zorla tam indirme yapılır.
    // Güvenlik ağı: ana rapor yüklemesi de takılırsa (25 sn) açılış donmasın — yedek olarak
    // cihazdaki (IndexedDB) kopyayı dener, o da yoksa boş sonuçla devam eder.
    const yukleSonuc = await zamanAsimliYaris(
      cloudVeriVerimliYukle(CLOUD.path, loadReportFromCloud, loadReportFromStorage),
      25000,
      null
    ) || { data: (await loadReportFromStorage().catch(()=>null)), source: 'local' };
    const cloudReport = yukleSonuc.data;
    if(cloudReport && cloudReport.musteriler && cloudReport.musteriler.length){
      report = cloudReport;
      // ÖNEMLİ: source, veri gerçekte NEREDEN geldiğine göre atanır — yukleSonuc.source
      // 'local-uptodate' ise (bulut zaten değişmemiş, cihazdaki kopya kullanıldıysa) source da
      // 'local' olmalı; aksi halde alttaki "Bu rapor buluttan alındı" göstergesi, veri aslında
      // cihazdan geldiği halde yanlışlıkla buluttan gelmiş gibi gösterirdi.
      source = (yukleSonuc.source==='cloud') ? 'cloud' : 'local';
      if(yukleSonuc.source==='cloud') await saveReportToStorage(cloudReport);
    }
    // Arşivin TAMAMI değil, cihazdaki (IndexedDB) son bilinen hali + buluttaki farkı (delta)
    // yükleniyor — bu, uygulama her açıldığında/yenilendiğinde tekrar tekrar tam indirme
    // yapılmasını önler; ilk kurulumdan sonra pratikte yalnızca yeni eklenen gün(ler) iner.
    // Fatura arşivi yüklemesi de açılışı bloke etmesin (takılırsa 20 sn sonra devam).
    await zamanAsimliYaris(faturaArsivBaslangicYukle(), 20000, null);
  }
  // Skeleton her durumda kapatılır — rapor geldiyse zaten reportSection açılacak; gelmediyse
  // kullanıcı normal yükleme kartını (dropzone) temiz görmeli.
  { const acilisSk = document.getElementById('acilisSkeleton'); if(acilisSk) acilisSk.style.display = 'none'; }

  if(!report){
    const saved = await loadReportFromStorage();
    if(saved && saved.musteriler && saved.musteriler.length){
      report = saved; source = 'local';
    }
  }

  if(report){
    if(typeof musteriMasterIliskileriniDerinGuncelle==='function') musteriMasterIliskileriniDerinGuncelle(report);
    raporuNormalizeEt(report); // eksik alanları güvenli varsayılanlarla doldur (eski/bozuk raporlara dayanıklılık)
    state.report = report;
    canliGunlerleGuncelle(report);
    renderReport(report);
    document.getElementById('uploadCard').style.display='none';
    document.getElementById('reportSection').style.display='block';
    document.body.classList.add('has-sidebar');
    resetBtn.style.display='inline-block';
    // resetBtn'in "bugün Kalemler yüklendi mi?" kilidi doğru karar verebilsin diye, uygulama
    // açılışında da state.bugunKalemlerHazir tazelenir (aksi halde ilk açılışta bu bayrak
    // henüz hiç hesaplanmamış/false kalabilir ve kilit yanlışlıkla devre dışı görünebilir).
    try{ if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele(); }catch(_){}
    document.getElementById('storageNote').style.display='block';
    if(cloudEnabled()){
      syncBtn.style.display='inline-block';
      // Cihaz depolama kapalı (kullanıcı isteği) — source artık pratikte hep 'cloud' olur (ya da
      // rapor hiç yoktur); 'local' dalı yalnızca eski bir kod yolunda teorik olarak kalmıştır.
      document.getElementById('storageNoteMsg').textContent = source==='cloud'
        ? 'Bu rapor buluttan alındı; tüm cihazlarda ortak görünür ve otomatik olarak güncel tutulur.'
        : 'UYARI: Bu rapor buluttan alınamadı ve cihaz depolama kapalı olduğu için güncel olmayabilir.';
    }
    statusPillMsg.textContent = (source==='cloud' ? 'Buluttan güncel rapor açıldı (' : 'UYARI: Rapor buluttan alınamadı (') + fmtDate(report.asOf) + ')';
    statusPill.classList.add('ok');
  }else if(cloudEnabled()){
    statusPillMsg.textContent = 'Veri bekleniyor';
  }
  // AÇILIŞ EKRANI KALDIRILDI (kullanıcı kararı — büyük mimari değişiklik): Rapor HİÇ yoksa bile
  // (hem cihazda hem buluttan hiç veri gelmediyse) uygulama artık boş bir dropzone değil, doğrudan
  // rapor arayüzünü (sidebar + Genel Bakış'ın "Bugünün raporu henüz oluşturulmadı" boş durumu)
  // gösterir. Daha önce bu durumda hiçbir render tetiklenmiyordu (yalnızca "Veri bekleniyor" yazısı
  // güncelleniyordu) — bu satırlar olmadan kullanıcı, dropzone kalktıktan sonra tamamen BOŞ bir
  // sayfa (sidebar'sız, içeriksiz) görürdü.
  if(!state.report){
    document.body.classList.add('has-sidebar');
    setActiveView('genelBakis');
  }
  // BULUT YÜKLEME EKRANI KAPAT: rapor durumu (var/yok) artık kesinleşti, arkadaki
  // reportSection de (doluysa/boşsa) doğru haliyle render edilmiş durumda — overlay'i
  // kaldırıp kullanıcıya gerçek ekranı gösterebiliriz.
  if(bulutYukleEkran) bulutYukleEkran.style.display = 'none';
  // OTOMATİK GÜNLÜK SNAPSHOT (kullanıcı kararı): Önceden musteriSnapshot SADECE kullanıcı "Raporu
  // Oluştur"/"Veri Güncelle" butonuna bastığında yazılıyordu — kullanıcı Kalemler'i bir kez
  // yükleyip günlerce hiç butona basmazsa (artık zorunlu olmadığı için sıkça olacak bir senaryu),
  // Trend Analizi/Tahsilat Verimliliği/Yönetim Özeti gibi raporlar o günleri "musteriSnapshot yok"
  // sayıp boş/eksik gösteriyordu — halbuki fatura/tahsilat verisi zaten yüklenmiş olabiliyordu.
  // Şimdi: rapor (Kalemler/Master/Ekstre'den en az biri) zaten varsa VE bugün için henüz hiç
  // snapshot alınmadıysa, uygulama açılışta/sekmeye dönüşte SESSİZCE kendi kendine bir snapshot
  // alır — kullanıcı hiçbir şey yapmasa bile. Bu, cari bakiye/borç durumunu DEĞİŞTİRMEZ (buildReport
  // zaten aynı veriyle hesaplanmıştı), sadece o günün "fotoğrafını" arşive kalıcı olarak ekler.
  if(state.report) await gunlukSnapshotGerekiyorsaAl();
  // Açılıştaki bilinen "son değişiklik zamanı" ile otomatik arka plan senkronizasyonuna başla —
  // bkz. otomatikBulutSenkronizasyonuBaslat() tanımı ve açıklaması.
  if(cloudEnabled()) otomatikBulutSenkronizasyonuBaslat();
}

// Bugün için musteriSnapshot arşivde yoksa (hiç "Raporu Oluştur"a basılmamışsa bile) sessizce
// alır. state.faturaArsivCache zaten uygulamayiBaslat akışında önceden yüklenmiş olur (bkz.
// faturaArsivBaslangicYukle) — burada sadece bugünün anahtarını kontrol ediyoruz, tüm arşivi
// yeniden taramıyoruz (ucuz bir işlem).
async function gunlukSnapshotGerekiyorsaAl(){
  try{
    const bugunKey = dateKeyLocal(turkiyeBugun());
    const bugunKaydi = (state.faturaArsivCache||{})[bugunKey];
    if(bugunKaydi && bugunKaydi.musteriSnapshot && bugunKaydi.musteriSnapshot.length) return; // zaten var, tekrar alma
    await faturaKontrolArsivineKaydetVeSenkronizeEt(state.report);
  }catch(err){
    console.error('Otomatik günlük snapshot alınamadı:', err);
  }
}
window.addEventListener('DOMContentLoaded', async ()=>{
  if(!authAktif) await uygulamayiBaslat();
});

// ================= OTOMATİK ARKA PLAN SENKRONİZASYONU (kullanıcı isteği) =================
// "En ufak bir veri değişikliğinde diğer cihazlardan güncelle fonksiyonu otomatik devreye girsin"
// — cihaz depolama tamamen kapalı olduğundan (bkz. idbGet/idbSet no-op), her cihaz artık YALNIZCA
// kendi belleğindeki state.report'a güveniyor; başka bir cihaz/tarayıcı bulutta değişiklik
// yaptığında bu cihaz sayfa manuel yenilenmeden veya "Diğer Cihazdan Güncelle"ye elle basılmadan
// bunu ASLA öğrenmiyordu. Aşağıdaki mekanizma bunu otomatikleştirir:
//   1) Periyodik olarak (POLL_ARALIK_MS) SADECE küçük "_meta/{path}" zaman damgasını okur (ana
//      raporun TAMAMINI değil — bkz. cloudMetaOkuUzaktan, hafif bir istektir).
//   2) Zaman damgası son bilinenden farklıysa, o zaman GERÇEK (büyük) raporu indirir ve ekranı
//      sessizce (şifre sormadan, kullanıcıyı kesmeden) günceller.
//   3) Sekme arka plana alınıp tekrar öne geldiğinde (visibilitychange) de aynı kontrol hemen
//      tetiklenir — kullanıcı sekmeye döndüğü an en güncel veriyi görsün diye.
// Not: Fatura/Arşiv verisi (state.faturaArsivCache) bu döngüye DAHİL EDİLMEMİŞTİR — o veri seti
// çok daha büyük olduğundan her polling turunda indirmek gereksiz ağ trafiği yaratır; çek/senet
// onayı zaten güncellenmiş ANA RAPOR üzerinden karta yansır (cekSenetDetay orada tutuluyor), bu
// yüzden bu mekanizma kullanıcının bildirdiği sorunu (kart diğer cihazda güncellenmiyor) çözmek
// için yeterlidir. Arşiv/Trend Analizi ekranları hâlâ "Diğer Cihazdan Güncelle" ile tazelenir.
const OTOMATIK_SENKRON_POLL_ARALIK_MS = 20000; // 20 saniyede bir hafif kontrol
let otomatikSenkronBilinenZaman = null; // en son görülen _meta/{CLOUD.path}.updatedAt değeri
let otomatikSenkronTimerId = null;
let otomatikSenkronCalisiyorMu = false; // aynı anda iki kontrolün üst üste binmesini önler
async function otomatikBulutSenkronizasyonuKontrolEt(){
  // MOBİL PİL/VERİ TASARRUFU: sekme arka plandayken 20 sn'de bir meta isteği atmanın anlamı yok —
  // kullanıcı zaten ekranı görmüyor ve sekme öne geldiğinde visibilitychange dinleyicisi
  // (otomatikBulutSenkronizasyonuBaslat içinde) kontrolü ANINDA tetikliyor. Bu satır, saha
  // cihazlarında arka planda boşa giden ağ isteklerini keser; güncellik kaybı olmaz.
  if(document.visibilityState === 'hidden') return;
  if(!cloudEnabled() || otomatikSenkronCalisiyorMu) return;
  otomatikSenkronCalisiyorMu = true;
  try{
    const uzakMeta = await cloudMetaOkuUzaktan(CLOUD.path);
    const uzakZaman = uzakMeta ? uzakMeta.updatedAt : null;
    if(uzakZaman == null) return; // buluttan meta okunamadıysa (ağ hatası vb.) sessizce vazgeç, bir sonraki turda tekrar denenir
    if(otomatikSenkronBilinenZaman !== null && uzakZaman === otomatikSenkronBilinenZaman) return; // değişiklik yok
    const yeniRapor = await loadReportFromCloud();
    if(yeniRapor && yeniRapor.musteriler && yeniRapor.musteriler.length){
      if(typeof musteriMasterIliskileriniDerinGuncelle==='function') musteriMasterIliskileriniDerinGuncelle(yeniRapor);
      raporuNormalizeEt(yeniRapor);
      state.report = yeniRapor;
      canliGunlerleGuncelle(yeniRapor);
      renderReport(yeniRapor);
      statusPillMsg.textContent = 'Bulutta değişiklik algılandı, otomatik güncellendi (' + fmtDate(yeniRapor.asOf) + ')';
      statusPill.classList.add('ok');
      otomatikSenkronBilinenZaman = uzakZaman;
    }else if(yeniRapor !== null){
      // Rapor indirildi ama uygulanacak müşteri verisi yok (bulut bilinçli boşaltılmış olabilir) —
      // zaman damgasını yine de işaretle ki her 20 sn'de boş veri tekrar tekrar indirilmesin.
      otomatikSenkronBilinenZaman = uzakZaman;
    }
    // SENKRON HATASI DÜZELTMESİ: yeniRapor === null ise indirme BAŞARISIZ olmuştur
    // (loadReportFromCloud ağ hatasını içeride yutup null döndürür). Önceden zaman damgası yine de
    // "biliniyor" işaretleniyordu — sonraki polling turları "değişiklik yok" sanıyor ve buluttaki
    // güncelleme KALICI olarak kaçıyordu. Artık damga güncellenmez; bir sonraki turda tekrar denenir.
  }catch(err){
    console.error('Otomatik bulut senkronizasyonu kontrolü başarısız:', err);
  }finally{
    otomatikSenkronCalisiyorMu = false;
  }
}
function otomatikBulutSenkronizasyonuBaslat(){
  if(otomatikSenkronTimerId) return; // zaten çalışıyor
  // İlk turda "değişiklik var mı" karşılaştırması yapmadan, o anki zaman damgasını sessizce
  // biliniyor olarak işaretler (açılışta zaten en güncel rapor yüklendi, tekrar indirmeye gerek yok).
  cloudMetaOkuUzaktan(CLOUD.path).then(meta=>{ if(meta) otomatikSenkronBilinenZaman = meta.updatedAt; });
  otomatikSenkronTimerId = setInterval(otomatikBulutSenkronizasyonuKontrolEt, OTOMATIK_SENKRON_POLL_ARALIK_MS);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible'){
      otomatikBulutSenkronizasyonuKontrolEt();
      // OTOMATİK GÜNLÜK SNAPSHOT: kullanıcı sekmeyi/uygulamayı GÜNLER SONRA tekrar açtığında
      // (bulutta değişiklik olmasa bile, sadece takvim günü ilerlediği için) bugünün henüz hiç
      // snapshot'ı yoksa sessizce alınır — bkz. gunlukSnapshotGerekiyorsaAl.
      if(state.report) gunlukSnapshotGerekiyorsaAl();
    }
  });
}

// Cari Ekstre'deki net bakiyeyi açık fatura listesine dağıtır. Pozitif/negatif tüm kalemler
// net toplamda dikkate alınır; böylece yaşlandırma kovalarının toplamı ile görünen cari bakiye
// birbirinden kopmaz. Fazla tutar en eski pozitif faturadan düşülür, fatura detayıyla açıklanamayan
// kalan fark ise bugünün kovasında "Cari Ekstre Farkı" olarak saklanır (negatif bakiye dahil).
function cariEkstreBakiyesiniFaturalaraUyarla(m, hedefBakiye, today){
  const sortedOldestFirst = (m.invoices||[]).slice().sort((a,b)=>{
    const at = a.faturaTarihi ? a.faturaTarihi.getTime() : Infinity;
    const bt = b.faturaTarihi ? b.faturaTarihi.getTime() : Infinity;
    return at - bt;
  });
  sortedOldestFirst.forEach(inv=>{ inv.kalanBorcHam = inv.kalanBorc; });

  const ilkNetToplam = sortedOldestFirst.reduce((s,inv)=>s+(Number(inv.kalanBorc)||0),0);
  let dusulecek = Math.max(0, ilkNetToplam-hedefBakiye);
  sortedOldestFirst.forEach(inv=>{
    if(dusulecek>0 && inv.kalanBorc>0){
      const dus=Math.min(inv.kalanBorc,dusulecek);
      inv.kalanBorc-=dus;
      dusulecek-=dus;
    }
    if(Math.abs(inv.kalanBorc)<1) inv.kalanBorc=0;
  });

  const duzeltilmisNet = sortedOldestFirst.reduce((s,inv)=>s+(Number(inv.kalanBorc)||0),0);
  const farkHam = hedefBakiye-duzeltilmisNet;
  const fark = Math.abs(farkHam)<1 ? 0 : farkHam;
  if(fark!==0){
    const bugunInv={
      musteri:m.musteri,musteriAdi:m.musteriAdi,belgeNo:'',belgeTuru:'Cari Ekstre Farkı',
      tutar:fark,kalanBorc:fark,kalanBorcHam:fark,
      faturaTarihi:today,netVade:today,
      gunFatura:0,gunVade:0,gunFaturaHam:0,gunVadeHam:0,
      cariEkstreFarkSatiri:true,
    };
    m.invoices.push(bugunInv);
    m.faturaSayisi+=1;
  }
}

function buildReport(files, musteriMasterMap){
  musteriMasterMap = musteriMasterMap || new Map();
  const today = turkiyeBugun();

  const invoices = [];
  const musteriMap = new Map();

  // GÖRÜNÜRLÜK FİLTRESİ ÖN-HESAPLAMASI (kullanıcı kararı — büyük mimari değişiklik): Pasif/İptal
  // müşterilerin "tüm-zamanların arşivinde tahsilat/fatura kaydı var mı" kontrolü için, HER
  // müşteride ayrı ayrı tüm arşivi taramak yerine (O(müşteri × gün × satır), çok yavaş), arşiv BİR
  // KEZ taranıp geçmişi olan müşteri kodlarının bir Set'i çıkarılır (O(gün × satır) + O(1) sorgu).
  // İki kaynak taranır: (1) state.faturaArsivCache (her günün faturaArsiv/tahsilatArsiv dizileri —
  // eski/mevcut fatura arşivleme mekanizması), (2) state.tahsilatArsivi (yeni tek-format kalıcı
  // tahsilat arşivi, belge no bazlı). Bu Set yalnızca görünürlük kararı için kullanılır, hiçbir
  // tutar/toplam hesabına karışmaz.
  const gecmisiOlanMusteriler = new Set();
  Object.values(state.faturaArsivCache || {}).forEach(gun=>{
    (gun.faturaArsiv||[]).forEach(r=>{ if(r && r.musteri) gecmisiOlanMusteriler.add(String(r.musteri).trim()); });
    (gun.tahsilatArsiv||[]).forEach(r=>{ if(r && r.musteri) gecmisiOlanMusteriler.add(String(r.musteri).trim()); });
  });
  Object.values(state.tahsilatArsivi || {}).forEach(r=>{ if(r && r.musteriKod) gecmisiOlanMusteriler.add(String(r.musteriKod).trim()); });

  // KALEMLER ARTIK OPSİYONEL (kullanıcı kararı — büyük mimari değişiklik): Önceden bu dosya
  // zorunluydu ve doğrudan files.kalemler.data.forEach ile başlanıyordu (dosya yoksa çökerdi).
  // Artık kart iskeleti Müşteri Master'dan, bakiye Cari Ekstre'den geliyor — Kalemler yalnızca
  // (varsa) mevcut kartlara açık fatura detayı/vade bilgisi ekler. Dosya yoksa bu blok sessizce
  // atlanır, aşağıdaki Müşteri Master/Cari Ekstre blokları kartları zaten oluşturmuş olur.
  (files.kalemler ? files.kalemler.data : []).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    const kalanBorc = Number(r['Kalan Borç'])||0;
    if(Math.abs(kalanBorc) < 30) return;
    const musteriAdi = r['Müşteri Adı'] || musteri;
    const faturaTarihi = excelDateToJS(r['Fatura Tarihi']);
    const netVade = excelDateToJS(r['Net vade tarihi']);
    const gunFatura = r['Faturadan Sonr.Gün']!=null ? Number(r['Faturadan Sonr.Gün']) : (faturaTarihi ? Math.round((today-faturaTarihi)/86400000) : null);
    const gunVade = r["Vade'den sonraki gün"]!=null ? Number(r["Vade'den sonraki gün"]) : (netVade ? Math.round((today-netVade)/86400000) : gunFatura);
    const inv = {
      musteri, musteriAdi, belgeNo:r['Belge numarası'], belgeTuru:r['Belge Türü Tanımı'],
      tutar:Number(r['Tutar'])||0, kalanBorc, faturaTarihi, netVade,
      gunFatura, gunVade, gunFaturaHam:gunFatura, gunVadeHam:gunVade,
    };
    invoices.push(inv);
    if(!musteriMap.has(musteri)){
      musteriMap.set(musteri, {musteri, musteriAdi, kalanBorc:0, faturaSayisi:0, vadeAgirlikliToplam:0, agirlikBorc:0, avgVadeGun:0, invoices:[], temsilci:null,
        siparisTutari:0, emanetSiparis:0, cekSenet:0, alinanTahsilat:0, cekSenetDetay:[]});
    }
    const m = musteriMap.get(musteri);
    m.faturaSayisi += 1;
    m.invoices.push(inv);
  });

  const siparisNormalMap = new Map();
  const emanetSiparisMap = new Map();
  const siparisMusterileri = new Map();
  const siparisArsiv = [];

  if(files.siparis){
    // Fatura No dolu olan satırlarda, AYNI GÜNE (İstenilen Tsl. Trh.) ait tekrar eden Fatura No'lar
    // mükerrer kayıt sayılır — sadece ilk görülen satır alınır, diğerleri (aynı fatura no + aynı gün)
    // yok sayılır. Fatura No boşsa bu kural hiç uygulanmaz. Aynı Fatura No farklı bir güne ait ise
    // (İstenilen Tsl. Trh. farklıysa) mükerrer sayılmaz, ikisi de ayrı ayrı işlenir.
    const gorulenFaturaNoGun = new Set();
    const siparisSatirlari = files.siparis.data.filter(r=>{
      const faturaNo = String(r['Fatura No']||'').trim();
      if(!faturaNo) return true;
      const t = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);
      const gunKey = t ? dateKeyLocal(t) : '';
      const anahtar = faturaNo + '|' + gunKey;
      if(gorulenFaturaNoGun.has(anahtar)) return false;
      gorulenFaturaNoGun.add(anahtar);
      return true;
    });

    // Sevk Raporu/Genel Rapor ekranındaki "Açık Sipariş"/"Sevki Ertelenen" KPI'ları artık dosyadaki
    // "en güncel gün" e göre DEĞİL, tarayıcının Türkiye yerel (bugünkü) tarihine GÜN OLARAK EN
    // YAKIN olan güne göre gösterilir (Tahsilat'taki aynı kuralla birebir aynı mantık — bkz.
    // enYakinGunKey). Yükleme Raporu yüklenmişse, o dosyadaki tüm Yükleme Tarihi günleri arasından
    // bugüne en yakın olan seçilir (artık bugünün BİREBİR aynı gün olması ŞART DEĞİL). Yükleme
    // Raporu hiç yüklenmemişse, dosyadaki İstenilen Tsl. Trh. günleri arasından bugüne en yakın
    // olan seçilir. Hiçbir tarihli veri yoksa hiçbir sipariş KPI'sı gösterilmez.
    const bugunGunKey = dateKeyLocal(today);
    // Sipariş dosyasının kendi teslim günleri — hem "yükleme yok" dalında kullanılır hem de
    // aşağıdaki güvenlik ağında (yükleme günü siparişlerle çakışmıyorsa geri dönülecek küme).
    const siparisGunleri = new Set();
    siparisSatirlari.forEach(r=>{
      const t = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);
      const gk = t ? dateKeyLocal(t) : null;
      if(gk) siparisGunleri.add(gk);
    });
    let siparisGosterimGunKey = null;
    if(files.yukleme){
      const yuklemeGunleri = new Set();
      files.yukleme.data.forEach(r=>{
        const yt = excelDateToJSArti1Gun(r['Yükleme Tarihi']);
        const gk = yt ? dateKeyLocal(yt) : null;
        if(gk) yuklemeGunleri.add(gk);
      });
      siparisGosterimGunKey = enYakinGunKey(Array.from(yuklemeGunleri), bugunGunKey);
      // GÜVENLİK AĞI (eski Yükleme Raporu düzeltmesi): Yükleme Raporu, Sipariş dökümünden DAHA ESKİ
      // kalabiliyor (ör. bugünün siparişleri girildi ama Yükleme Raporu henüz dünkü halinde). Böyle
      // bir durumda yükleme gününe göre seçilen gösterim günü, sipariş dosyasında HİÇ bulunmayan bir
      // güne işaret ediyor ve TÜM siparişler "—" görünüyordu. Seçilen gün sipariş dosyasında yoksa,
      // sipariş dosyasının KENDİ günlerinden bugüne en yakınına geri düşülür — böylece güncel
      // siparişler, eski bir Yükleme Raporu yüzünden gizlenmez. (Yükleme günü siparişlerle
      // çakışıyorsa davranış eskisiyle birebir aynı kalır.)
      if(!siparisGosterimGunKey || !siparisGunleri.has(siparisGosterimGunKey)){
        siparisGosterimGunKey = enYakinGunKey(Array.from(siparisGunleri), bugunGunKey);
      }
    }else{
      siparisGosterimGunKey = enYakinGunKey(Array.from(siparisGunleri), bugunGunKey);
    }

    siparisSatirlari.forEach(r=>{
      const musteri = String(r['Müşteri No']||'').trim();
      if(!musteri) return;
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Adı'] || musteri;
      const temsilci = r['Satış Temslicisi Adı'] || r['Satış Temsilcisi Adı'] || null;
      const belgeTuru = r['Satış Belge Türü Tnm.'];
      // "Reklam Malzeme Sip." (Satış Belge Türü Tnm.) olan satırlar hiçbir hesaplamaya dahil
      // edilmez ve arşive (siparisArsiv) hiç yazılmaz — bunlar gerçek bir müşteri siparişi değil,
      // reklam malzemesi sevkiyatı olduğu için Sipariş KPI'larını ve Fatura Kontrol arşivini
      // etkilememesi gerekir.
      if(belgeTuru === 'Reklam Malzeme Sip.') return;
      const redStatu = r['Red Statüsü Tnm.'];
      const teslimat = r['Teslimat Durumu'];
      const satisBelgeNo = String(r['Satış Belge No'] ?? r['Satış Belge No '] ?? '').trim() || null;
      const tutar = Number(r['Sipariş Toplam Tutar'])||0;
      const istenilenTeslimTarihi = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);

      const isEmanet = belgeTuru === 'Sevki Ertelenecek Sp' && redStatu === 'Aktif';
      const isNormalAcik = belgeTuru !== 'Sevki Ertelenecek Sp' && redStatu === 'Aktif' && teslimat !== 'Reddedildi';

      // Arşive (siparisArsiv) artık aktiflik durumundan BAĞIMSIZ olarak, teslim tarihi ve Satış
      // Belge No bilgisi olan HER satır aktarılır — Red/İptal/Teslim Edilemedi durumundaki satırlar
      // da dahil. Bu satırlar arşiv katmanında (bkz. siparisArsivGunlereDagitVeTemizle) o Satış
      // Belge No'ya ait TÜM kayıtları arşivden temizlemek için tetikleyici olarak kullanılır.
      if(istenilenTeslimTarihi && satisBelgeNo){
        siparisArsiv.push({musteri, musteriAdi, temsilci, tutar, istenilenTeslimTarihi, belgeTuru, teslimatDurumu: teslimat, satisBelgeNo});
      }

      if(!siparisMusterileri.has(musteri)) siparisMusterileri.set(musteri, {musteriAdi, temsilci});
      else if(temsilci && !siparisMusterileri.get(musteri).temsilci) siparisMusterileri.get(musteri).temsilci = temsilci;

      // Sevk Raporu/Genel Rapor KPI'ları (siparisNormalMap/emanetSiparisMap) sadece yukarıda
      // belirlenen tek "gösterim günü"ne ait siparişleri toplar.
      const gosterilecekGunMu = siparisGosterimGunKey && dateKeyLocal(istenilenTeslimTarihi) === siparisGosterimGunKey;
      if(!gosterilecekGunMu) return;

      if(isEmanet){
        emanetSiparisMap.set(musteri, (emanetSiparisMap.get(musteri)||0) + tutar);
      }else if(isNormalAcik){
        siparisNormalMap.set(musteri, (siparisNormalMap.get(musteri)||0) + tutar);
      }
    });
  }

  // TAHSİLAT DÖKÜMÜ — YENİ TEK FORMAT (kullanıcı isteği, eski Format A/B ayrımı tamamen kaldırıldı):
  // Bu oturumda yeni bir Tahsilat Dökümü dosyası seçildiyse (files.tahsilat doluysa), kalıcı
  // arşivle birleştirilir (bkz. 01-cekirdek-ve-arsiv.js: tahsilatArsiviniBirlestir — Belge
  // Numarası bazlı ekleme/güncelleme + Ters Kayıt ile silme). Birleştirme SENKRON (await'siz)
  // yapılamayacağı için bu iş raporuOlusturVeyaGuncelleAkisiniCalistir'de buildReport'tan HEMEN
  // ÖNCE yapılır (çek/senet ile birebir aynı desen) — state.tahsilatArsivi burada zaten güncel
  // kabul edilir. tahsilatArsivindenGunlukDiziyeCevir, kalıcı arşivi eski kodun beklediği
  // {musteri,belgeTarihi,tutar,formatKaynagi,gecerli,tahsilatTuru} satır dizisine çevirir —
  // böylece aşağıdaki efektifGunMap/KPI mantığına dokunmadan aynı arayüzle beslenir.
  const tahsilatMap = new Map();
  const bugunGunKeyTahsilatTumYil = dateKeyLocal(today);
  const dunTarihiTumYil = new Date(bugunGunKeyTahsilatTumYil+'T00:00:00'); dunTarihiTumYil.setDate(dunTarihiTumYil.getDate()-1);
  const dunGunKeyTahsilatTumYil = dateKeyLocal(dunTarihiTumYil);
  // KULLANICI İSTEĞİ (bugüne en yakın dolu güne kayan tahsilat KPI'sı): eskiden HER ZAMAN sabit
  // olarak dünün gününe bakılırdı, o gün boşsa KPI 0/boş kalırdı. Artık dünden geriye doğru en
  // fazla 30 gün taranır ve ARŞİVDE (bozukIadeTahsilat henüz efektifGunMap'e eklenmeden ÖNCEKİ ham
  // Tahsilat Dökümü verisine göre) veri bulunan İLK (bugüne en yakın) gün
  // hedef alınır. Bugünün kendisi bu aramaya DAHİL DEĞİLDİR (kullanıcı isteği: "bugün ve sonrası
  // için geçerli değil") — arama en erken dünden başlar, en geç 30 gün öncesine kadar gider.
  const TAHSILAT_GERIYE_ARAMA_GUN_LIMITI = 30;
  const aramaBaslangicTarihi = new Date(dunGunKeyTahsilatTumYil+'T00:00:00');
  aramaBaslangicTarihi.setDate(aramaBaslangicTarihi.getDate() - (TAHSILAT_GERIYE_ARAMA_GUN_LIMITI - 1));
  const aramaBaslangicGunKey = dateKeyLocal(aramaBaslangicTarihi);
  const tahsilatAralikHavuzu = tahsilatArsivindenAralikDiziyeCevir(state.tahsilatArsivi || {}, aramaBaslangicGunKey, dunGunKeyTahsilatTumYil);
  const tahsilatDoluGunler = new Set(tahsilatAralikHavuzu.map(r=> dateKeyLocal(new Date(r.belgeTarihi))));
  let hedefTahsilatGunKeyTumYil = null;
  {
    const aday = new Date(dunGunKeyTahsilatTumYil+'T00:00:00');
    for(let i=0;i<TAHSILAT_GERIYE_ARAMA_GUN_LIMITI;i++){
      const adayGunKey = dateKeyLocal(aday);
      if(tahsilatDoluGunler.has(adayGunKey)){ hedefTahsilatGunKeyTumYil = adayGunKey; break; }
      aday.setDate(aday.getDate()-1);
    }
    // Arşivde 30 gün içinde hiç veri yoksa eski davranışla tutarlı kalınır: hedef "dün" olarak
    // sabitlenir (KPI o zaman 0/boş görünür) — sessizce çok eski bir tarihe kayıp yanıltmaz.
    if(!hedefTahsilatGunKeyTumYil) hedefTahsilatGunKeyTumYil = dunGunKeyTahsilatTumYil;
  }
  const tahsilatArsiv = hedefTahsilatGunKeyTumYil
    ? tahsilatArsivindenGunlukDiziyeCevir(state.tahsilatArsivi || {}, hedefTahsilatGunKeyTumYil)
    : [];

  const faturaArsiv = [];
  const bozukIadeTahsilat = [];
  if(files.fatura){
    files.fatura.data.forEach(r=>{
      const musteri = String(r['Müşteri Numarası']||'').trim();
      if(!musteri) return;
      // EFES gibi dahili/şirket-içi kayıtlar tamamen göz ardı edilir (bkz. musteriGecerliMi) — ne
      // faturaArsiv'e, ne bozukIadeTahsilat'a eklenir, ne de arşivlenir.
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Adı'] || musteri;
      const temsilci = r['Satış Temsilcisi Adı'] || null;
      const tutar = Number(r['Ödenecek Tutar'])||0;
      const litre = Number(r['Toplam Litre'])||0;
      // Not: excelDateToJSArti1Gun kullanılır (excelDateToJS DEĞİL) — Türkiye (+3) saat dilimi
      // düzeltmesi; bkz. Sell Out/Yükleme Raporu'ndaki aynı notla birebir aynı sebep.
      const faturaTarihi = excelDateToJSArti1Gun(r['Fatura Tarihi']);
      const faturaTuru = String(r['Fatura Türü Adı']||'').trim();
      // Gerçek Fatura Numarası — arşiv tekilleştirmesinin artık tarih+tutar tahminine değil, bu
      // benzersiz belge numarasına dayanabilmesi için taşınır (bkz. tekillestir()).
      const belgeNo = String(r['Fatura Numarası']||'').trim() || null;

      // ============================== İADE GRUBU (KULLANICI KARARI — 3 tür TEK grupta) ==============================
      // "Bozuk İade Faturası", "Sağlam İade Faturası", "Depozito İade Faturası" (SAP'ın tam metni
      // değişebildiği için "depozito" VE "iade" kelimelerinin ikisini birden içeren varyasyonlar da
      // dahil): üçü de bir SATIŞ değil, müşteriye yapılan bir PARA İADESİDİR/TAHSİLATIDIR. Bu üç tür
      // ARTIK TEK bir "İade" grubunda birleşir — hepsi aynı formatKaynagi:'FaturaIade' etiketiyle
      // bozukIadeTahsilat listesine yönlendirilir, faturaArsiv'e (satış) HİÇ eklenmez. Bu grubun
      // tutarı tüm analiz raporlarına (Trend Analiz, DSO, CEI, Yönetim Özeti, Şüpheli Alacak,
      // Temsilci Karnesi, Tahsilat Verimliliği, Nakit Akış Tahmini, Müşteri Analiz Modalı'ndaki
      // "İade/Depozito" kategorisi vb.) MÜŞTERİ TAHSİLATI olarak yansır.
      //
      // ÖNEMLİ (kullanıcı kararı): Ödenecek Tutar'ın işareti (pozitif/negatif) ÖNEMSİZDİR — "Bozuk
      // İade Faturası"/"Sağlam İade Faturası"nda bu değer genelde NEGATİF gelir (müşterinin
      // borcundan düşülen bir mahsup), "Depozito İade Faturası"nda ise genelde POZİTİF gelir — ama
      // her iki durumda da mutlak değer (Math.abs) alınıp AYNI ŞEKİLDE pozitif bir tahsilat tutarı
      // olarak sayılır. Örn. -4.000 ₺ de yazsa +4.000 ₺ de yazsa, müşteri raporlarına 4.000 ₺
      // tahsilat olarak işlenir.
      //
      // "Boş Kap İade" ve "Efes İade Satınalma": KA Sanal İade Sip. ile AYNI şekilde HİÇBİR
      // hesaplamaya dahil edilmez — ne satış/fatura tutarı olarak faturaArsiv'e, ne müşteri
      // tahsilatı olarak bozukIadeTahsilat'a. Bu satırlar tamamen göz ardı edilir (Trend Analiz,
      // DSO, CEI, Yönetim Özeti, Şüpheli Alacak, Temsilci Karnesi vb. hiçbirine yansımaz).
      //
      // Diğer fatura türleri (Satış Fatura vb.) eskisi gibi faturaArsiv'e (satış tutarı)
      // eklenmeye devam eder.
      const faturaTuruKucuk = faturaTuru.toLocaleLowerCase('tr');
      const iadeGrubuMu = (
        faturaTuru === 'Bozuk İade Faturası' ||
        faturaTuru === 'Sağlam İade Faturası' ||
        (faturaTuruKucuk.includes('depozito') && faturaTuruKucuk.includes('iade'))
      );

      // "KA Sanal İade Sip.", "Boş Kap İade", "Efes İade Satınalma": HİÇBİR hesaplamaya dahil
      // edilmez (görmezden gelinenler seti).
      const gormezdenGelinenMi = (
        (faturaTuruKucuk.includes('ka sanal') && faturaTuruKucuk.includes('iade')) ||
        faturaTuru === 'Boş Kap İade' ||
        faturaTuru === 'Efes İade Satınalma'
      );
      if(gormezdenGelinenMi) return;

      if(iadeGrubuMu){
        bozukIadeTahsilat.push({musteri, musteriAdi, belgeTarihi: faturaTarihi, tutar: Math.abs(tutar), formatKaynagi:'FaturaIade', gecerli:true, faturaNo: r['Fatura Numarası']});
        return;
      }
      faturaArsiv.push({musteri, musteriAdi, temsilci, tutar, litre, faturaTarihi, belgeNo});
    });
  }

  // NOT: Depozito Tahsilat dosyası (ayrı bir dosya/kaynak olarak) SİSTEMDEN TAMAMEN KALDIRILDI
  // (kullanıcı kararı) — Depozito İade artık yalnızca Fatura Dökümü'ndeki "Depozito İade Faturası"
  // türünden, yukarıdaki İade Grubu mantığıyla (bozukIadeTahsilat listesi, 'FaturaIade' etiketi)
  // geliyor. Bu, aynı zamanda önceden var olan bir MÜKERRER SAYIM sorununu da ortadan kaldırır:
  // eskiden aynı fatura/belge numarası hem Fatura Dökümü'nde (depozitoIadeMi kontrolüyle) hem de
  // ayrı Depozito Tahsilat dosyasında (Fatura Belge No kontrolüyle) bağımsız olarak işlenip iki
  // kez tahsilat kredisi olarak sayılabiliyordu.

  // Genel Rapor/Sevk Raporu'ndaki tahsilat KPI'sı (KULLANICI İSTEĞİYLE GÜNCELLENDİ): artık sabit
  // "dün" gününe değil, dünden geriye doğru en fazla 30 gün içinde veri bulunan İLK (bugüne en
  // yakın) güne göre gösterilir — bkz. yukarıdaki hedefTahsilatGunKeyTumYil hesaplaması. Bugünün
  // kendisi bu aramaya dahil değildir (kural yalnızca bugünden ÖNCEKİ günler için geçerli); 30 gün
  // içinde hiç veri bulunamazsa eski davranışla tutarlı olarak "dün" hedef alınır ve KPI 0/boş
  // görünür. Fatura Dökümü'ndeki İade Grubu'ndan (bkz. bozukIadeTahsilat) türeyen tahsilat
  // kredileri de bu hesaba dahildir — bunlar Tahsilat Dökümü'nden gelmese bile, hedef günle
  // eşleştiklerinde aynı KPI'ya katkı sağlar.
  const bugunGunKeyTahsilat = bugunGunKeyTahsilatTumYil;
  const hedefTahsilatGunKey = hedefTahsilatGunKeyTumYil;
  const efektifGunMap = new Map();
  if(hedefTahsilatGunKey) efektifGunMap.set(hedefTahsilatGunKey, tahsilatArsiv); // zaten "dün" gününe göre hesaplanmış
  // KRİTİK DÜZELTME (denetim bulgusu #1): Aynı güne (gk) birden fazla İade Grubu kaydı denk
  // gelirse, ESKİ kod her kaydı TEK TEK işleyip her seferinde "bu güne ait FaturaIade kayıtlarını
  // temizle, yeni kaydı ekle" yapıyordu — bu da o günün SONUNCU İade kaydı hariç, AYNI DÖNGÜ
  // içinde daha önce eklenmiş İade kayıtlarını da silip Toplam Tahsilat'ı (ve dolayısıyla Genel
  // KPI/Sevk Özeti'ni) sessizce düşük gösteriyordu. ÇÖZÜM: önce aynı güne denk gelen TÜM İade
  // kayıtlarını grupla, sonra o günün eski FaturaIade kayıtlarını BİR KEZ temizleyip hepsini
  // birlikte ekle.
  const iadeGunGruplari = new Map(); // gk -> [r, r, ...]
  bozukIadeTahsilat.forEach(r=>{
    const gk = r.belgeTarihi ? dateKeyLocal(new Date(r.belgeTarihi)) : null;
    if(!gk) return;
    if(!iadeGunGruplari.has(gk)) iadeGunGruplari.set(gk, []);
    iadeGunGruplari.get(gk).push(r);
  });
  iadeGunGruplari.forEach((kayitlar, gk)=>{
    const mevcut = (efektifGunMap.get(gk) || []).filter(x=>x.formatKaynagi!=='FaturaIade');
    efektifGunMap.set(gk, mevcut.concat(kayitlar));
  });

  const tahsilatKaynakMap = new Map(); // musteri -> {normal, bozukIade, depozito, hakedis}
  if(hedefTahsilatGunKey){
    (efektifGunMap.get(hedefTahsilatGunKey)||[]).forEach(r=>{
      if(r.gecerli === false) return;
      tahsilatMap.set(r.musteri, (tahsilatMap.get(r.musteri)||0) + r.tutar);
      if(!tahsilatKaynakMap.has(r.musteri)) tahsilatKaynakMap.set(r.musteri, {normal:0, bozukIade:0, depozito:0, hakedis:0});
      const kay = tahsilatKaynakMap.get(r.musteri);
      // NOT: 'DepozitoTahsilat' etiketi artık üretilmiyor (Depozito Tahsilat dosyası kaldırıldı) —
      // Depozito İade Faturası da dahil TÜM İade Grubu artık 'FaturaIade' etiketiyle geliyor, bu
      // yüzden kay.depozito alanı kalıcı olarak 0 kalır (geriye dönük uyumluluk için alan korunur —
      // bkz. 06-senet-ve-detay.js'deki kay.depozito render noktası).
      if(r.formatKaynagi==='FaturaIade') kay.bozukIade += r.tutar;
      else if(r.formatKaynagi==='TahsilatHakedis') kay.hakedis += r.tutar;
      else kay.normal += r.tutar;
    });
  }

  // ÇEK/SENET — KALICI ARŞİVDEN (kullanıcı isteği): Artık Tahsilat Dökümü'nden değil, kendi Grup B
  // alanından yüklenen ve state.cekSenetArsivi'nde (bkz. 01-cekirdek-ve-arsiv.js) kalıcı olarak
  // saklanan Çek/Senet Riski dosyasından besleniyor. Arşivdeki HER kayıt (durum='risk' veya
  // 'tahsilEdildi' fark etmeksizin) cekSenetDetayMap'e (detay tablosu için) girer; yalnızca
  // durum='risk' olanlar cekSenetMap'e (Toplam Risk'e eklenen tutar) girer.
  // tahsilEdilenCekSenetMap (tahsilEdildi olanların toplamı) HÂLÂ hesaplanır ama artık
  // m.alinanTahsilat'a (Alınan Tahsilat KPI'sı) EKLENMEZ — kullanıcı kararı: "Tahsil Edildi"
  // işaretlemesinin bir tarih damgası olmadığı için "bugünü asla baz alma" kuralına tabi
  // tutulamıyor, bu yüzden KPI'dan tamamen çıkarıldı (bkz. aşağıdaki m.alinanTahsilat ataması).
  // Harita yine de ileride (örn. bir tarih damgası eklenirse) tekrar kullanılabilsin diye korunuyor.
  const cekSenetMap = new Map();
  const cekSenetDetayMap = new Map();
  const tahsilEdilenCekSenetMap = new Map();
  Object.entries(state.cekSenetArsivi||{}).forEach(([anahtar, r])=>{
    const musteri = r.musteriKod;
    if(!musteri) return;
    if(r.durum === 'tahsilEdildi'){
      tahsilEdilenCekSenetMap.set(musteri, (tahsilEdilenCekSenetMap.get(musteri)||0) + r.tutar);
    }else{
      cekSenetMap.set(musteri, (cekSenetMap.get(musteri)||0) + r.tutar);
    }
    if(!cekSenetDetayMap.has(musteri)) cekSenetDetayMap.set(musteri, []);
    cekSenetDetayMap.get(musteri).push({
      no: r.no, tip: r.odemeTipiHam, tutar: r.tutar, tahsilatTuru: r.tahsilatTuru,
      tahsilEdildiMi: r.durum === 'tahsilEdildi', senetAnahtari: anahtar,
      vade: r.vadeTarihi ? new Date(r.vadeTarihi) : null, belgeTarihi: r.belgeTarihi ? new Date(r.belgeTarihi) : null,
    });
  });

  // ===== CARİ HESAP EKSTRE PİVOT =====
  // Müşteri kodu bazında GERÇEK cari bakiyeyi (Borç/Alacak sonrası Bakiye) toplar. Aynı müşterinin
  // birden fazla satırı (ör. Bira + Distile) olabilir; hepsi tek bakiyede birleşir. Ayrıca müşteri
  // adı + ünvanı da buradan alınır (karta bunlar yazılacak). İlk satırdaki (müşterisiz) genel toplam
  // atlanır. Bu dosya yüklüyse: müşterinin açık fatura toplamı ile bu bakiye arasındaki FARK,
  // en eski faturadan başlayarak düşülür (aşağıda) — böylece açık faturalar/vade/yaşlandırma bu
  // gerçek cari bakiyeye göre yeniden şekillenir. Çek/senet mahsubu bu durumda ATLANIR (çift düşme
  // olmasın; cari bakiye zaten tüm tahsilatları içerir).
  const cariEkstreMap = new Map(); // musteriKodu -> {bakiye, ad, unvan}
  const cariEkstreVar = !!(files.cariEkstre && files.cariEkstre.data && files.cariEkstre.data.length);
  if(cariEkstreVar){
    files.cariEkstre.data.forEach(r=>{
      const kod = String(r['Müşteri']||'').trim();
      if(!kod) return; // müşterisiz (genel toplam) satırı atla
      const bakiye = Number(r['Bakiye'])||0;
      let kayit = cariEkstreMap.get(kod);
      if(!kayit){ kayit = {bakiye:0, ad:null, unvan:null}; cariEkstreMap.set(kod, kayit); }
      kayit.bakiye += bakiye;
      const ad = r['Müşteri Ad'] ? String(r['Müşteri Ad']).trim() : '';
      const unvan = r['Müşteri Ünvan'] ? String(r['Müşteri Ünvan']).trim() : '';
      if(kayit.ad==null && ad) kayit.ad = ad;
      if(kayit.unvan==null && unvan) kayit.unvan = unvan;
    });
    // Cari Ekstre'de olup Kalemler'de OLMAYAN müşteriler için yeni kart oluştur (açık faturası yok
    // ama gerçek cari bakiyesi var). invoices boş → açık fatura 0; kalanBorc aşağıdaki döngüde
    // cari bakiyeye eşitlenir (fark tüm açık faturalardan düşülür, açık fatura 0 olduğundan kalanBorc
    // doğrudan cari bakiye olur — ama fatura olmadığı için vade/yaşlandırma hesaplanmaz, sadece bakiye görünür).
    cariEkstreMap.forEach((kayit, kod)=>{
      if(musteriMap.has(kod)) return;
      musteriMap.set(kod, {
        musteri: kod, musteriAdi: kayit.ad || kod, kalanBorc:0, faturaSayisi:0,
        vadeAgirlikliToplam:0, agirlikBorc:0, avgVadeGun:0, invoices:[], temsilci:null,
        cekSenet:0, cekSenetDetay:[], siparisTutari:0, emanetSiparis:0, alinanTahsilat:0,
      });
    });
  }

  // MÜŞTERİ MASTER — KART OLUŞTURUCU (kullanıcı kararı — büyük mimari değişiklik): Artık kart
  // iskeletini oluşturan ANA kaynak Müşteri Master'dır, Kalemler değil. Kural (kullanıcının tarif
  // ettiği gibi):
  //   • Müşteri Master'da "Aktif" olan HER müşteri için kart İSTİSNASIZ oluşturulur (Kalemler/Cari
  //     Ekstre'de kaydı olsun olmasın). Böyle bir müşterinin ne bakiyesi ne geçmiş tahsilat/fatura
  //     arşivi yoksa, kart yine de OLUŞUR ama görünürlük filtresinde (aşağıda, tüm musteriMap
  //     doldurulduktan SONRA) gizlenir — bu yüzden burada m.__masterAktifMi=true olarak işaretlenir.
  //   • Müşteri Master'da "Pasif" veya "İptal" olan müşteriler için kart SADECE bakiyesi (Cari
  //     Ekstre'den) sıfır değilse VEYA tüm-zamanların arşivinde (state.faturaArsivCache) tahsilat/
  //     fatura kaydı varsa oluşturulur — bu ikisi de yoksa kart HİÇ AÇILMAZ. Bu kontrol de
  //     musteriMap tamamlandıktan SONRA (görünürlük filtresi aşamasında) yapılır; burada Pasif/
  //     İptal müşteriler geçici olarak "aday" şeklinde eklenir, sonra elenir/kalır.
  (state.musteriMasterDurum || new Map()).forEach((durumHam, kod)=>{
    if(musteriMap.has(kod)) return; // Kalemler veya Cari Ekstre zaten kart açmış, tekrar oluşturma
    const pasifVeyaIptal = noktaPasifVeyaIptalMi(durumHam);
    // İSİM ÖNCELİĞİ (kullanıcı kararı): önce Cari Ekstre'deki Müşteri Ad/Ünvan, o yoksa Müşteri
    // Master'daki musteriAdi (state.musteriMasterDetay), o da yoksa müşteri kodunun kendisi.
    const cariAdayKayit = cariEkstreMap.get(kod);
    const masterDetay = (state.musteriMasterDetay && state.musteriMasterDetay.get(kod)) || null;
    const musteriAdi = (cariAdayKayit && cariAdayKayit.ad) || (masterDetay && masterDetay.musteriAdi) || kod;
    const musteriUnvan = (cariAdayKayit && cariAdayKayit.unvan) || '';
    musteriMap.set(kod, {
      musteri: kod, musteriAdi, musteriUnvan, kalanBorc:0, faturaSayisi:0,
      vadeAgirlikliToplam:0, agirlikBorc:0, avgVadeGun:0, invoices:[], temsilci:null,
      cekSenet:0, cekSenetDetay:[], siparisTutari:0, emanetSiparis:0, alinanTahsilat:0,
      // Görünürlük filtresi bu iki bayrağı kullanır (aşağıda, musteriMap tam dolduktan sonra):
      __masterKaynakli: true, __masterAktifMi: !pasifVeyaIptal,
    });
  });

  musteriMap.forEach((m, musteri)=>{
    m.siparisTutari = siparisNormalMap.get(musteri)||0;
    m.emanetSiparis = emanetSiparisMap.get(musteri)||0;
    m.cekSenet = cekSenetMap.get(musteri)||0;
    // TAHSİL EDİLDİ ÇEK/SENET — KULLANICI KARARIYLA GÜNCELLENDİ (önceki davranış: bu tutar
    // m.alinanTahsilat'a — yani Genel Bakış/Sevk Raporu KPI toplamına — da dahil ediliyordu).
    // Sorun: "Tahsil Edildi" işaretlemesinin bir TARİH damgası yok (sadece durum='tahsilEdildi'
    // olarak state.cekSenetArsivi'nde tutuluyor), bu yüzden "Alınan Tahsilat" KPI'sının "bugünü asla
    // baz alma, bugünden önceki en yakın veri gününü göster" kuralına (bkz. yukarıdaki
    // hedefTahsilatGunKeyTumYil/TAHSILAT_GERIYE_ARAMA_GUN_LIMITI) hiç tabi tutulamıyordu — kullanıcı
    // bugün bir çek/senedi tahsil edildi işaretlediğinde bu tutar hangi gün olursa olsun ANINDA
    // KPI'ya giriyor, kuralı sessizce bypass ediyordu. Kullanıcı kararı: çek/senet tahsilatları
    // Alınan Tahsilat KPI'sine (m.alinanTahsilat) ARTIK HİÇ DAHİL EDİLMEZ — yalnızca Tahsilat
    // Dökümü + Bozuk İade Faturası + Depozito Tahsilatı kaynaklı tahsilatlar (tahsilatMap, hepsi
    // aynı gün kuralına tabi) sayılır. tahsilEdilenCekSenetMap hâlâ hesaplanıyor ve cekSenetDetayMap
    // üzerinden Nokta Detay popup'ındaki "Tahsil Edildi" rozetinde/listesinde gösterilmeye devam
    // ediyor — sadece genel KPI toplamına eklenmiyor.
    m.alinanTahsilat = tahsilatMap.get(musteri)||0;
    m.alinanTahsilatKartGosterge = tahsilatMap.get(musteri)||0;
    m.alinanTahsilatKaynak = tahsilatKaynakMap.get(musteri)||null;
    m.cekSenetDetay = cekSenetDetayMap.get(musteri)||[];

    // Cari Ekstre'den müşteri adı + ünvan (varsa karta bunlar yazılır).
    const cariKayit = cariEkstreVar ? cariEkstreMap.get(musteri) : null;
    if(cariKayit){
      if(cariKayit.ad) m.musteriAdi = cariKayit.ad;
      m.musteriUnvan = cariKayit.unvan || '';
      m.cariEkstreBakiye = cariKayit.bakiye;
    }

    if(cariEkstreVar){
      // CARİ EKSTRE MODU: pozitif/negatif fatura neti gerçek cari bakiyeye eşitlenir.
      // Çek/senet mahsubu YAPILMAZ (cari bakiye zaten tahsilatları içerir; çift düşme önlenir).
      // Bu müşterinin Cari Ekstre'de HİÇ kaydı yoksa hedef 0'dır (kullanıcı kararı: Cari Ekstre'de
      // yoksa bakiye 0 sayılır) — bu, üstte gösterilen m.kalanBorc=0 ile TUTARLI olsun diye
      // buradaki açık fatura listesi de tamamen "kapatılmış" sayılır (aksi halde toplam 0 derken
      // fatura listesi hâlâ açık görünüp çelişki yaratırdı).
      const hedefBakiye = cariKayit ? cariKayit.bakiye : 0;
      cariEkstreBakiyesiniFaturalaraUyarla(m,hedefBakiye,today);
    }else{
      // NORMAL MOD (Cari Ekstre yok): Çek/Senet ARTIK açık faturalardan MAHSUP EDİLMEZ (kullanıcı
      // isteği) — Çek/Senet bilgisi artık Tahsilat Dökümü'ndeki "Alınan Çek"/"Alınan Senet"
      // satırlarından (tahsilatTuru==='CekSenet') geliyor ve bu tutarlar zaten normal tahsilat
      // hesabına (m.alinanTahsilat, tahsilatMap) vade tarihiyle dahil ediliyor. Burada AYRICA kalan
      // borçtan düşülürse aynı tutar iki kez sayılmış olur (hem tahsilat hem mahsup). m.cekSenet
      // artık sadece bilgi amaçlı — kart üzerinde "Çek/Senet" olarak gösterilir, borç hesabına girmez.
      m.invoices.forEach(inv=>{ inv.kalanBorcHam = inv.kalanBorc; });
    }

    let kalanBorcToplam = 0, vAgirlikliToplam = 0, agirlikBorc = 0, vadesiGelmisBakiye = 0;
    m.invoices.forEach(inv=>{
      kalanBorcToplam += inv.kalanBorc;
      // Ağırlıklı vade ortalaması YALNIZCA pozitif kalan borçlu faturalarla hesaplanır. Negatif
      // kalan borç (iade / fazla ödeme) hem paya hem paydaya negatif katkı verip ortalamayı
      // beklenmedik yöne kaydırabildiği için ağırlıklandırmaya alınmaz. (Kalan borç TOPLAMI,
      // vadesi gelmiş/gelmemiş bakiye gibi gerçek tutarlar ise negatifler dahil hesaplanmaya
      // devam eder — orada iade/fazla ödeme bakiyeyi doğru şekilde azaltmalıdır.)
      if(inv.gunFatura!=null && inv.kalanBorc>0){
        vAgirlikliToplam += inv.kalanBorc * inv.gunFatura;
        agirlikBorc += inv.kalanBorc;
      }
      // Vadesi gelen fatura mantığı: fatura vadesi (Net Vade Tarihi) kriteri değil, açık faturanın
      // kalan borcu + Faturadan Sonr. Gün verisi baz alınır — Faturadan Sonr. Gün eşik ve üstü ise
      // o faturanın kalan borcu "vadesi gelmiş" sayılır (negatifler dahil, gerçek bakiye).
      if(inv.gunFatura!=null && inv.kalanBorc!==0 && inv.gunFatura>=VADE_ESIGI_GUN){
        vadesiGelmisBakiye += inv.kalanBorc;
      }
    });
    // Kartta görünen BAKİYE: Cari Ekstre yüklüyse GERÇEK cari bakiye (kullanıcı isteği) — bu
    // müşterinin Cari Ekstre'de HİÇ kaydı yoksa bakiye 0 sayılır (Kalemler'deki açık fatura
    // toplamına ARTIK DÜŞÜLMEZ — kullanıcı kararı: "Cari Ekstre'de yoksa bakiye 0 görünsün").
    // Cari Ekstre HİÇ yüklenmemişse mevcut davranış (açık faturaların toplamı) DEĞİŞMEDEN kalır.
    m.kalanBorc = cariEkstreVar
      ? (cariKayit ? cariKayit.bakiye : 0)
      : kalanBorcToplam;
    m.vadeAgirlikliToplam = vAgirlikliToplam;
    m.agirlikBorc = agirlikBorc;
    m.avgVadeGun = agirlikBorc!==0 ? Math.round(vAgirlikliToplam / agirlikBorc) : 0;
    m.vadesiGelmisBakiye = vadesiGelmisBakiye;
    m.vadesizBakiye = m.kalanBorc - vadesiGelmisBakiye;

    // Sipariş tutarı Toplam Risk hesabına DAHİL EDİLMEZ (kullanıcı isteği) — açık sipariş henüz
    // faturalanmamış, tahakkuk etmemiş bir borç olmadığından risk toplamını şişirmemesi istendi.
    // Toplam Risk artık sadece gerçek borç (Kalan Borç) ve çek/senet riskinden oluşur.
    m.toplamRisk = m.kalanBorc + m.cekSenet;
    // TEMSİLCİ ATAMASI — SADECE MÜŞTERİ MASTER (kullanıcı kararı): Önceden Kalemler/Sipariş
    // dosyalarındaki isim yedek olarak kullanılıyordu; bu, aynı müşterinin zaman içinde farklı
    // dosyalarda farklı temsilciyle görünmesine (rota/personel değişikliği geçmişte "yanlış"
    // görünmesine) yol açabiliyordu. Artık TEK kaynak Müşteri Master'daki GÜNCEL eşleşme —
    // Master'da o müşteri yoksa "—" (Tanımsız) yazılır, başka hiçbir yedeğe bakılmaz. Bu, Genel
    // Bakış/Sevk/Fatura Kontrol/Trend Analizi/Temsilci Karnesi dahil TÜM raporlarda tutarlı,
    // güncel tek bir müşteri↔temsilci eşleşmesi sağlar.
    m.temsilci = musteriMasterMap.get(musteri) || '—';
    m.invoices.sort((a,b)=> (b.faturaTarihi||0) - (a.faturaTarihi||0));
  });

  const bakiyesiz = [];
  const allSiparisMusteri = new Set([...siparisNormalMap.keys(), ...emanetSiparisMap.keys(), ...cekSenetMap.keys()]);
  allSiparisMusteri.forEach(musteri=>{
    if(musteriMap.has(musteri)) return;
    const sp = siparisMusterileri.get(musteri) || {};
    bakiyesiz.push({
      // TEMSİLCİ ATAMASI — SADECE MÜŞTERİ MASTER (bkz. yukarıdaki musteriler döngüsündeki aynı not).
      musteri, musteriAdi: sp.musteriAdi || musteri, temsilci: musteriMasterMap.get(musteri) || '—',
      siparisTutari: siparisNormalMap.get(musteri)||0, emanetSiparis: emanetSiparisMap.get(musteri)||0,
      cekSenet: cekSenetMap.get(musteri)||0, cekSenetDetay: cekSenetDetayMap.get(musteri)||[],
    });
  });
  bakiyesiz.sort((a,b)=> (b.siparisTutari+b.emanetSiparis+b.cekSenet)-(a.siparisTutari+a.emanetSiparis+a.cekSenet));

  const musteriler = Array.from(musteriMap.values());

  // GÖRÜNÜRLÜK FİLTRESİ (kullanıcı kararı — büyük mimari değişiklik, NETLEŞTİRİLMİŞ HALİ): Bu,
  // kartı SİLMEZ (kpi toplamlarını etkilememesi ve ileride bir hata olursa "veri kayboldu" değil
  // "görünmüyor" gibi daha az riskli bir durum yaratması için) — yalnızca m.__gizli bayrağını set
  // eder. Render fonksiyonları (renderMusteriTable vb.) bu bayrağı görüp kartı listeden çıkarır.
  // Kart, gizli olsa bile musteriMap'te durmaya devam eder — bu yüzden geçmiş
  // ödeme/tahsilat/fatura verileri Trend Analizi/Temsilci Karnesi/Tahsilat Verimliliği gibi TÜM
  // rapor hesaplamalarında kullanılmaya devam eder, yalnızca kart LİSTEDE görünmez. Kural:
  //   • Müşteri Master kaynaklı DEĞİLSE (yani Kalemler/Cari Ekstre'den geldiyse — normal, eski
  //     davranış): hiç filtrelenmez, her zaman görünür (bu ikisi zaten "veri var" demek).
  //   • Müşteri Master'da "Aktif" (m.__masterAktifMi===true): kart HER ZAMAN oluşur ama bakiyesi
  //     0 VE tüm-zamanların arşivinde (gecmisiOlanMusteriler) hiç kaydı yoksa GİZLENİR.
  //   • Müşteri Master'da "Pasif/İptal" (m.__masterAktifMi===false): kart SADECE BAKİYESİ≠0 İSE
  //     GÖRÜNÜR — geçmiş arşiv kaydı (gecmisiOlanMusteriler) burada görünürlüğe HİÇ ETKİ ETMEZ
  //     (kullanıcı kararı: "bakiyesi 0 olan pasif/iptal müşteri geçmiş kaydı olsa da gözükmesin,
  //     sadece rapor hesaplamalarında geçmiş verisi kullanılsın").
  musteriler.forEach(m=>{
    if(!m.__masterKaynakli){ m.__gizli = false; return; }
    const bakiyeVar = Math.abs(m.kalanBorc||0) > 0;
    if(m.__masterAktifMi){
      const gecmisiVar = gecmisiOlanMusteriler.has(String(m.musteri).trim());
      m.__gizli = !bakiyeVar && !gecmisiVar;
    }else{
      m.__gizli = !bakiyeVar;
    }
  });

  const tahsilatToplamHam = Array.from(tahsilatMap.values()).reduce((a,b)=>a+b,0);
  const tahsilatEslesenToplam = sum(musteriler,'alinanTahsilat');
  const kpi = {
    toplamBakiye: sum(musteriler,'kalanBorc'),
    toplamSiparis: sum(musteriler,'siparisTutari') + sumArr(bakiyesiz,'siparisTutari'),
    toplamEmanet: sum(musteriler,'emanetSiparis') + sumArr(bakiyesiz,'emanetSiparis'),
    toplamCekSenet: sum(musteriler,'cekSenet') + sumArr(bakiyesiz,'cekSenet'),
    toplamTahsilat: tahsilatToplamHam,
    tahsilatEslesenToplam,
    tahsilatEslesmeyenToplam: tahsilatToplamHam - tahsilatEslesenToplam,
    musteriSayisi: musteriler.length,
  };

  const repMap = new Map();
  musteriler.forEach(m=>{
    const key = m.temsilci || '—';
    if(!repMap.has(key)) repMap.set(key, {temsilci:key, musteriSayisi:0, kalanBorc:0, toplamRisk:0});
    const r = repMap.get(key);
    r.musteriSayisi += 1; r.kalanBorc += m.kalanBorc; r.toplamRisk += m.toplamRisk;
  });
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski (varsa) temsilci risk toplamına eklenir.
  bakiyesiz.forEach(b=>{
    const key = b.temsilci || '—';
    if(!repMap.has(key)) repMap.set(key, {temsilci:key, musteriSayisi:0, kalanBorc:0, toplamRisk:0});
    repMap.get(key).toplamRisk += (b.cekSenet||0);
  });

  const ticariStokRows = [];
  if(files.ticariStok){
    files.ticariStok.data.forEach(r=>{
      const depodaKalanLt = Number(r['Depoda Kalan Lt.'])||0;
      if(depodaKalanLt === 0) return;
      ticariStokRows.push({
        temsilci: r['Satış Temsilcisi Adı'] || '—',
        musteriNo: r['Müşteri No']!=null ? String(r['Müşteri No']) : '—',
        musteriAdi: r['Müşteri Ad'] || '—',
        urunKodu: r['Malzeme Kodu']!=null ? String(r['Malzeme Kodu']) : '—',
        urunAdi: r['Malzeme Açıklaması'] || '—',
        urunHiyerarsi: r['Ürün Hiyerarşi Tanımı'] || '—',
        ambalaj: r['Tanım'] || '—',
        depodaKalanMk: Number(r['Depoda Kalan Mk.'])||0,
        depodaKalanLt,
      });
    });
  }
  const ticariStokOzetMap = new Map();
  ticariStokRows.forEach(r=>{
    const key = r.temsilci || '—';
    if(!ticariStokOzetMap.has(key)) ticariStokOzetMap.set(key, {temsilci:key, kalemSayisi:0, depodaKalanMk:0, depodaKalanLt:0, noktaSet:new Set()});
    const o = ticariStokOzetMap.get(key);
    o.kalemSayisi += 1;
    o.depodaKalanMk += r.depodaKalanMk;
    o.depodaKalanLt += r.depodaKalanLt;
    o.noktaSet.add(r.musteriNo);
  });
  const ticariStok = {
    rows: ticariStokRows,
    ozet: Array.from(ticariStokOzetMap.values())
      .map(o=>({temsilci:o.temsilci, kalemSayisi:o.kalemSayisi, depodaKalanMk:o.depodaKalanMk, depodaKalanLt:o.depodaKalanLt, noktaSayisi:o.noktaSet.size}))
      .sort((a,b)=>b.depodaKalanLt-a.depodaKalanLt),
  };

  const bayiHakedis = [];
  if(files.bayiHakedis){
    files.bayiHakedis.data.forEach(r=>{
      const musteri = String(r['Müşteri']||'').trim();
      if(!musteri) return;
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Unvanı'] || musteri;
      const tutarHam = Number(r['Tutar'])||0;
      const tutar = tutarHam * 1.20;
      // Not: excelDateToJSArti1Gun kullanılır — bkz. yukarıdaki faturaTarihi notu (Türkiye saat
      // dilimi kaynaklı 1 gün geriye kayma düzeltmesi).
      const tahsilatTarihi = excelDateToJSArti1Gun(r['Fatura Tarihi']);
      const efpaSipNoHam = r['Efpa Sip No'];
      const efpaSipNo = (efpaSipNoHam!==null && efpaSipNoHam!==undefined && String(efpaSipNoHam).trim()!=='') ? String(efpaSipNoHam).trim() : null;
      bayiHakedis.push({musteri, musteriAdi, tutar, tahsilatTarihi, efpaSipNo});
    });
  }

  // Cari Ekstre ünvan lookup'ı (kod -> ünvan) — arama fonksiyonu (musteriCariUnvan) bunu kullanır.
  // Düz obje olarak saklanır ki buluta/cihaza sorunsuz serileştirilebilsin (Map değil).
  const cariEkstreUnvanMap = {};
  if(cariEkstreVar){
    cariEkstreMap.forEach((kayit, kod)=>{ if(kayit && kayit.unvan) cariEkstreUnvanMap[kod] = kayit.unvan; });
  }

  return {
    asOf: today, musteriler, invoices, bakiyesiz, kpi, ticariStok,
    temsilciler: Array.from(repMap.values()).sort((a,b)=>b.kalanBorc-a.kalanBorc),
    siparisArsiv, tahsilatArsiv, faturaArsiv, bayiHakedis, bozukIadeTahsilat,
    cariEkstreUnvanMap,
  };
}
// DAYANIKLILIK: arr undefined/null ise (ör. buluttan/cihazdan gelen ESKİ bir raporda 'bakiyesiz'
// gibi sonradan eklenmiş bir alan hiç yoksa) 'undefined.reduce' ile çökmesin — boş toplam döndür.
function sum(arr,key){ return Array.isArray(arr) ? arr.reduce((a,b)=>a+(b[key]||0),0) : 0; }
const sumArr = sum; // sumArr, sum ile birebir aynı gövdeye sahipti — tekilleştirildi, çağrı yerleri değişmedi.

// ---- Saf (pure) hesaplama fonksiyonları için basit önbellekleme yardımcısı ----
// Bazı compute* fonksiyonları (computeNoktaYaslandirma, computeSupheliAlacak vb.) aynı `report`
// referansıyla tek bir render sırasında birden fazla kez çağrılıyor (örn. hem tablo hem özet
// paneli için), üstelik "Daha Fazla Göster" gibi yalnızca gösterilen satır sayısını artıran bir
// tıklamada bile view'in tamamı yeniden render edildiği için bu ağır hesaplamalar sıfırdan tekrar
// çalıştırılıyordu. Bu yardımcı, girdiler (nesne referansları + ilkel değerler) bir önceki
// çağrıyla birebir aynıysa sonucu yeniden hesaplamak yerine önbellekten döndürür.
// NOT: Yalnızca TÜM girdilerini parametre olarak alan, global/mutable state (örn.
// state.faturaArsivCache) okumayan saf fonksiyonlar için güvenlidir — bu yüzden yalnızca bu
// koşulu sağlayan fonksiyonlara uygulandı (aşağıdaki ilgili tanımların hemen altında).
let __dvSayac = 0;
const __dvMap = new WeakMap();
function __dataVersion(deger){
  if(deger === null || typeof deger !== 'object') return typeof deger+':'+deger;
  if(!__dvMap.has(deger)) __dvMap.set(deger, ++__dvSayac);
  return 'o'+__dvMap.get(deger);
}
function memoizePure(fn){
  let sonAnahtar = null, sonSonuc;
  return function(...args){
    const anahtar = args.map(__dataVersion).join('|');
    if(sonAnahtar !== null && anahtar === sonAnahtar) return sonSonuc;
    sonSonuc = fn.apply(this, args);
    sonAnahtar = anahtar;
    return sonSonuc;
  };
}

function canliGunlerleGuncelle(report){
  if(!report || !report.asOf || !report.musteriler) return report;
  const farkGun = Math.round((turkiyeBugun().getTime() - new Date(report.asOf).getTime()) / 86400000);
  report.musteriler.forEach(m=>{
    let vAgirlik = 0, aBorc = 0, vadesiGelmis = 0;
    (m.invoices||[]).forEach(inv=>{
      if(inv.gunFaturaHam == null) inv.gunFaturaHam = inv.gunFatura;
      if(inv.gunVadeHam == null) inv.gunVadeHam = inv.gunVade;
      inv.gunFatura = farkGun > 0 && inv.gunFaturaHam != null ? inv.gunFaturaHam + farkGun : inv.gunFaturaHam;
      inv.gunVade = farkGun > 0 && inv.gunVadeHam != null ? inv.gunVadeHam + farkGun : inv.gunVadeHam;
      // Ağırlıklı vade YALNIZCA pozitif kalan borçlu faturalarla (negatif iade/fazla ödeme
      // ortalamayı çarpıtmasın diye); vadesi gelmiş bakiye ise gerçek tutar olarak negatifler
      // dahil hesaplanır. (buildReport'taki hesapla birebir aynı mantık.)
      if(inv.gunFatura != null && inv.kalanBorc > 0){
        vAgirlik += inv.kalanBorc * inv.gunFatura;
        aBorc += inv.kalanBorc;
      }
      if(inv.gunFatura != null && inv.kalanBorc !== 0 && inv.gunFatura>=VADE_ESIGI_GUN){
        vadesiGelmis += inv.kalanBorc;
      }
    });
    m.avgVadeGun = aBorc !== 0 ? Math.round(vAgirlik / aBorc) : 0;
    m.vadeAgirlikliToplam = vAgirlik;
    m.agirlikBorc = aBorc;
    m.vadesiGelmisBakiye = vadesiGelmis;
    m.vadesizBakiye = (m.kalanBorc||0) - vadesiGelmis;
  });
  report.canliGunFarki = farkGun;
  return report;
}

// TEK KAYNAK: Yaşlandırma kovaları hem Yaşlandırma sayfasında hem Genel Bakış donut'unda
// bu ortak tanımdan okunur. Böylece iki ekran arasında kova sınırı tutarsızlığı oluşamaz.
// (Önceden Genel Bakış "0-30 gün"ü tek parça alıp vadesi gelmemiş bakiyeyi de içine katıyordu;
//  artık "Vadesinde" ayrı kova olarak her iki ekranda da aynı gösterilir.)
const AGING_BUCKETS = [
  {label:'Vadesinde', test:g=>g<=0, color:'var(--success)'},
  {label:'1–30 gün', test:g=>g>0&&g<=30, color:'#1B5FAE'},
  {label:'31–60 gün', test:g=>g>30&&g<=60, color:'var(--warn)'},
  {label:'61–90 gün', test:g=>g>60&&g<=90, color:'#C2571B'},
  {label:'90+ gün', test:g=>g>90, color:'var(--danger)'},
];
function computeAging(musteriler){
  const agingAmount = AGING_BUCKETS.map(b=>({label:b.label, value:0}));
  const agingCount = AGING_BUCKETS.map(b=>({label:b.label, value:0}));
  musteriler.forEach(m=>{
    // Kullanıcı isteği: bakiyesi (kalan borcu) olmayan müşteriler Yaşlandırma raporuna dahil
    // edilmesin — ne tutar toplamına ne de müşteri sayısına katkı versinler.
    if(Math.abs(m.kalanBorc||0) < 1) return;
    const g = m.avgVadeGun||0;
    const idx = AGING_BUCKETS.findIndex(b=>b.test(g));
    if(idx>=0){ agingAmount[idx].value += m.kalanBorc; agingCount[idx].value += 1; }
  });
  return {agingAmount, agingCount};
}

function computeSevkOzet(report, temsilciFilter){
  let musteriler = report.musteriler.filter(m=>m.siparisTutari>0 || m.emanetSiparis>0);
  let bakiyesiz = report.bakiyesiz;
  if(temsilciFilter){
    musteriler = musteriler.filter(m=>m.temsilci===temsilciFilter);
    bakiyesiz = bakiyesiz.filter(b=>b.temsilci===temsilciFilter);
  }
  const toplamSiparis = sum(musteriler,'siparisTutari') + sumArr(bakiyesiz,'siparisTutari');
  const toplamEmanet = sum(musteriler,'emanetSiparis') + sumArr(bakiyesiz,'emanetSiparis');
  const toplamTahsilat = sum(musteriler,'alinanTahsilat');
  const toplamKalanBorc = sum(musteriler,'kalanBorc');
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski eklenir (musteriler'deki toplamRisk zaten sipariş içermiyor, bkz. buildReport).
  const toplamRisk = sum(musteriler,'toplamRisk') + sumArr(bakiyesiz,'cekSenet');
  const vAgirlikli = sum(musteriler,'vadeAgirlikliToplam');
  const vBorc = sum(musteriler,'agirlikBorc');
  const ortalamaVade = vBorc!==0 ? Math.round(vAgirlikli/vBorc) : null;
  const siparisliMusteriSayisi = musteriler.length + bakiyesiz.length;
  return {
    musteriSayisi: siparisliMusteriSayisi,
    toplamSiparis, toplamEmanet, toplamTahsilat, toplamKalanBorc, toplamRisk,
    siparisliMusteriSayisi, ortalamaVade,
  };
}
computeSevkOzet = memoizePure(computeSevkOzet);

function computeGenelKPI(report, temsilciFilter){
  const musteriler = temsilciFilter ? report.musteriler.filter(m=>m.temsilci===temsilciFilter) : report.musteriler;
  const bakiyesiz = temsilciFilter ? report.bakiyesiz.filter(b=>b.temsilci===temsilciFilter) : report.bakiyesiz;
  const toplamBakiye = sum(musteriler,'kalanBorc');
  const toplamCekSenet = sum(musteriler,'cekSenet');
  const toplamTahsilat = temsilciFilter ? sum(musteriler,'alinanTahsilat') : report.kpi.toplamTahsilat;
  const tahsilatEslesmeyenToplam = temsilciFilter ? 0 : report.kpi.tahsilatEslesmeyenToplam;
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski eklenir (musteriler'deki toplamRisk zaten sipariş içermiyor, bkz. buildReport).
  const toplamRisk = sum(musteriler,'toplamRisk') + sumArr(bakiyesiz,'cekSenet');
  const vAgirlikli = sum(musteriler,'vadeAgirlikliToplam');
  const vBorc = sum(musteriler,'agirlikBorc');
  const ortalamaVade = vBorc!==0 ? Math.round(vAgirlikli/vBorc) : null;
  return {
    musteriSayisi: musteriler.length,
    toplamBakiye, toplamCekSenet, toplamTahsilat, tahsilatEslesmeyenToplam, toplamRisk, ortalamaVade,
  };
}
computeGenelKPI = memoizePure(computeGenelKPI);
