// ===== ORDER.JS FULL SPA & REALTIME ===== //
console.log("🚀 order.js loaded");

// ===== GLOBAL FLAGS ===== //
let userLat = null;
let userLng = null;
let defaultLat = null;
let defaultLng = null;
let pakaiGPS = false;
let daftarDesa = [];
let desaTujuan = null;
let ongkir = 0;
let selectedService = '';

// ===== DOM ELEMENTS ===== //
let servicePlaceholder, servicePopup, desaPopup, desaPopupList, desaTrigger, btnTutupDesa;
let summary, btnLokasi, popup, popupMessage, popupActions, btnOkPopup, btnBatalPopup;

// ===== DOM INIT & EVENT LISTENER ===== //
window.addEventListener("DOMContentLoaded", () => {
  servicePlaceholder = document.getElementById('servicePlaceholder');
  servicePopup = document.getElementById('servicePopup');
  desaPopup = document.getElementById("desaPopup");
  desaPopupList = document.getElementById('desaPopupList');
  desaTrigger = document.getElementById('desaTrigger');
  btnTutupDesa = document.getElementById('tutupDesaPopup');
  summary = document.getElementById('summaryText');
  btnLokasi = document.getElementById('btnAmbilLokasi');
  popup = document.getElementById("customPopup");
  popupMessage = document.getElementById("popupMessage");
  popupActions = document.getElementById("popupActions");
  btnOkPopup = document.getElementById("btnOkPopup");
  btnBatalPopup = document.getElementById("btnBatalPopup");

  // Dropdown desa interaction
  if(desaTrigger && desaPopup && btnTutupDesa){
    desaTrigger.addEventListener("click", ()=> PopupManager.showDesa());
    btnTutupDesa.addEventListener("click", ()=> PopupManager.closeDesa());
    desaPopup.addEventListener("click", e => { if(e.target === desaPopup) PopupManager.closeDesa(); });
  }
  // Service popup
  if(servicePopup){
    servicePopup.addEventListener("click", e => { if(e.target === servicePopup) servicePopup.classList.remove("show"); });
  }
  // Custom alert popup
  if(popup){
    popup.addEventListener("click", ()=> popup.classList.remove("show"));
  }
  // Input & textarea
  ['mainOrder','locationSelect','note'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', () => { updateSummary(); autoResizeTextarea(el); });
      el.addEventListener('change', updateSummary);
      autoResizeTextarea(el);
    }
  });
  // GPS button
  if(btnLokasi) btnLokasi.addEventListener('click', handleGpsButton);
});

// ===== SPA APP READY ===== //
// Tidak perlu auth check lagi, cukup tunggu app-ready
window.addEventListener("app-ready", async () => {
  if(!window.currentUser){
    console.warn("User belum login, order.js tidak jalan");
    return;
  }
  try{
    const doc = await db.collection("users").doc(window.currentUser.uid).get();
    if(doc.exists){
      const data = doc.data();
      defaultLat = data.lat || null;
      defaultLng = data.lng || null;
      userLat = defaultLat;
      userLng = defaultLng;
      pakaiGPS = false;
      const lokasiText = document.getElementById('lokasiText');
      if(lokasiText){
        lokasiText.innerText = (userLat && userLng) ? "Lokasi ke rumah saya" : "Lokasi belum diatur";
      }
    }
    await loadDesaDropdown();
    await loadSemuaDesa();
    await loadHeroHeader();
    console.log("✅ Order page ready dengan user:", window.currentUser.uid);
  }catch(e){
    console.error("Gagal inisialisasi user/order page:", e);
  }
});

// ===== HERO HEADER LOAD ===== //
async function loadHeroHeader(){
  const hero = document.getElementById("heroHeader");
  const defaultImg = "default.png";
  if(!hero) return;
  try{
    const doc = await db.collection("stockfoto").doc("foto").get();
    const url = doc.exists ? doc.data().headerorder : "";
    const imgTest = new Image();
    imgTest.src = url; // cuma pasang URL asli
    imgTest.onload = () => {
      hero.style.backgroundImage = `url('${url}')`;
      hero.style.opacity = "0";               // mulai dari transparan
      setTimeout(()=>{ hero.style.opacity = "1"; }, 50); // fade in
    };
    imgTest.onerror = () => {
      hero.style.backgroundImage = `url('${defaultImg}')`;
    };
  }catch(e){
    hero.style.backgroundImage = `url('${defaultImg}')`;
  }
}

// ===== LOAD DESA DROPDOWN ===== //
async function loadDesaDropdown(){
  const hiddenSelect = document.getElementById('locationSelect');
  if(!hiddenSelect || !desaTrigger || !desaPopupList) return;
  try{
    const snapshot = await db.collection("desa").orderBy("urutan","asc").get();
    hiddenSelect.innerHTML = `<option value="" disabled selected>Pilih beli dimana</option>`;
    desaPopupList.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      const nama = data.nama || doc.id;
      // hidden select
      const option = document.createElement("option");
      option.value = nama;
      option.dataset.lat = data.lat;
      option.dataset.lng = data.lng;
      hiddenSelect.appendChild(option);
      // popup item
      const item = document.createElement("div");
      item.className = "custom-option";
      item.textContent = nama;
      item.dataset.value = nama;
      item.dataset.lat = data.lat;
      item.dataset.lng = data.lng;
      item.style.borderRadius = "12px";
      item.addEventListener("click", ()=>{
        desaTrigger.innerHTML = `${nama} <span class="arrow">⌄</span>`;
        hiddenSelect.value = nama;
        desaTujuan = { nama, lat: parseFloat(item.dataset.lat), lng: parseFloat(item.dataset.lng) };
        hitungOngkirRanking();
        updateSummary();
        desaPopup.classList.remove("show");
        document.querySelectorAll('#desaPopupList .custom-option').forEach(opt => opt.classList.remove('selected'));
        item.classList.add('selected');
      });
      desaPopupList.appendChild(item);
    });
    desaTrigger.innerHTML = `Pilih beli dimana <span class="arrow">⌄</span>`;
  }catch(err){
    console.log("Gagal load desa:", err);
    desaTrigger.innerText = "Gagal memuat desa";
  }
}

// ===== LOAD SEMUA DESA ===== //
async function loadSemuaDesa(){
  try{
    const snapshot = await db.collection("desa").get();
    daftarDesa = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if(data.lat && data.lng){
        daftarDesa.push({ nama: data.nama || doc.id, lat: data.lat, lng: data.lng });
      }
    });
  }catch(e){ console.log("Error load semua desa:", e); }
}

// ===== HITUNG JARAK (Haversine) ===== //
function hitungJarak(lat1,lng1,lat2,lng2){
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ===== HITUNG ONGKIR RANKING ===== //
function hitungOngkirRanking(){
  if(!userLat || !userLng || !desaTujuan || !daftarDesa.length){ ongkir = 0; return; }
  const desaDenganJarak = daftarDesa.map(desa => ({ ...desa, jarak: hitungJarak(userLat,userLng,desa.lat,desa.lng) }));
  desaDenganJarak.sort((a,b)=> a.jarak - b.jarak);
  let ranking = desaDenganJarak.findIndex(d=>d.nama===desaTujuan.nama)+1;
  ongkir = ranking ? 3000 + ((ranking-1)*3000) : 0;
  console.log("Ranking Desa:", ranking, "Ongkir:", ongkir);
}

// ===== PILIH SERVICE & UPDATE UX ===== //
function selectService(service){
  selectedService = service;
  if(servicePlaceholder) servicePlaceholder.innerText = service;
  const mainOrder = document.getElementById('mainOrder');
  const note = document.getElementById('note');
  if(!mainOrder || !note) return;
  const placeholders = {
    "Beli Makanan":["Mau beli apa?\n- Nasi goreng 2\n- Bakso 1\n- Teh manis",
                     "Keterangan tambahan (opsional)\n- Pedas sedang\n- Warung Bu Ijah\n- Tanpa sambal"],
    "Beli Belanjaan":["Tulis barang yang mau dibeli\n- Beras 5kg\n- Minyak 1 liter\n- Indomie 3",
                      "Keterangan tambahan (opsional)\n- Merk bebas\n- Kalau kosong ganti yang mirip\n- Ukuran kecil saja"],
    "Antar Barang":["Barang apa yang mau diantar?\n- Paket kecil\n- Dokumen\n- Tas",
                    "Detail tujuan (biar tidak nyasar)\n- Rumah pagar biru\n- Sebelah mushola\n- Untuk Pak Rudi"],
    "Suruh Lainnya":["Tulis permintaan kamu\n- Ambil paket\n- Bayar listrik\n- Belikan pulsa",
                     "Jelaskan lebih detail ya\n- Ambil di warung depan\n- Tunggu sampai selesai\n- Jam 7 malam"]
  };
  if(placeholders[service]){
    mainOrder.placeholder = placeholders[service][0];
    note.placeholder = placeholders[service][1];
  }
  setTimeout(()=>{ autoResizeTextarea(mainOrder); autoResizeTextarea(note); },0);
  closeServicePopup();
  if(servicePlaceholder && servicePlaceholder.parentElement){
    servicePlaceholder.parentElement.classList.remove('flash-highlight');
    void servicePlaceholder.parentElement.offsetWidth;
    servicePlaceholder.parentElement.classList.add('flash-highlight');
  }
  updateSummary();
}

// ===== POPUP SERVICE ===== //
function openServicePopup(){
  PopupManager.showService();
}
function closeServicePopup(){
  PopupManager.closeService();
}

// ===== UPDATE SUMMARY ===== //
function updateSummary(){
  if(!summary) return;
  const mainOrder = document.getElementById('mainOrder')?.value.replace(/\n/g,'<br>') || '-';
  const location = document.getElementById('locationSelect')?.value || '-';
  const note = document.getElementById('note')?.value || '-';
  summary.innerHTML = `<b>Layanan:</b> ${selectedService||'-'}<br>
<b>Pesanan:</b> ${mainOrder}<br>
<b>Beli Dimana:</b> ${location}<br>
<b>Ongkir Otomatis:</b> Rp ${ongkir.toLocaleString('id-ID')}<br>
<b>Catatan:</b> ${note}`;
}

// ===== TEXTAREA RESIZE ===== //
function autoResizeTextarea(el){
  if(!el) return;
  el.style.height='auto';
  const dummy=document.createElement('div');
  const style=window.getComputedStyle(el);
  ['position','visibility','width','fontSize','lineHeight','fontFamily','fontWeight','whiteSpace','padding','border'].forEach(s=> dummy.style[s]=style[s]);
  dummy.style.position='absolute';
  dummy.style.visibility='hidden';
  dummy.innerText=el.value||el.placeholder||' ';
  document.body.appendChild(dummy);
  el.style.height=dummy.scrollHeight+'px';
  document.body.removeChild(dummy);
}

// ===== GPS BUTTON HANDLER ===== //
function handleGpsButton(){
  if(!btnLokasi) return;
  const TEXT_DEFAULT="📍 Pakai Lokasi Saya saat ini";
  const TEXT_LOADING="Mengambil...";
  const TEXT_SUCCESS="Sukses";
  const TEXT_BACK_HOME="🏠 Pakai Lokasi Rumah";
  const lokasiText = document.getElementById('lokasiText');
  if(!lokasiText) return;
  if(btnLokasi.classList.contains('loading')) return;
  if(pakaiGPS){
    if(!defaultLat || !defaultLng){ showPopup("Lokasi rumah belum diatur di akun"); return; }
    btnLokasi.classList.add('loading'); btnLokasi.disabled=true; btnLokasi.innerHTML=`<span class="spinner"></span>${TEXT_LOADING}`;
    lokasiText.innerText="Mengembalikan lokasi...";
    setTimeout(()=>{
      userLat=defaultLat; userLng=defaultLng; pakaiGPS=false;
      lokasiText.innerText="Lokasi ke rumah saya";
      lokasiText.classList.remove('flash-lokasi'); void lokasiText.offsetWidth; lokasiText.classList.add('flash-lokasi');
      hitungOngkirRanking(); updateSummary();
      btnLokasi.innerHTML=TEXT_DEFAULT; btnLokasi.classList.remove('loading'); btnLokasi.disabled=false;
    },800);
    return;
  }
  if(!navigator.geolocation){ showPopup("HP kamu tidak mendukung lokasi GPS"); return; }
  btnLokasi.classList.add('loading'); btnLokasi.disabled=true; btnLokasi.innerHTML=`<span class="spinner"></span>${TEXT_LOADING}`;
  lokasiText.innerText="Mengambil lokasi...";

  navigator.geolocation.getCurrentPosition(pos=>{
    userLat=pos.coords.latitude; userLng=pos.coords.longitude; pakaiGPS=true;
    lokasiText.innerText="Lokasi saya saat ini";
    lokasiText.classList.remove('flash-lokasi'); void lokasiText.offsetWidth; lokasiText.classList.add('flash-lokasi');
    hitungOngkirRanking(); updateSummary();
    btnLokasi.innerHTML=`✅ ${TEXT_SUCCESS}`;
    setTimeout(()=>{ btnLokasi.innerHTML=TEXT_BACK_HOME; btnLokasi.classList.remove('loading'); btnLokasi.disabled=false; },2000);
  }, ()=>{
    lokasiText.innerText="Gagal mengambil lokasi";
    btnLokasi.innerHTML=TEXT_DEFAULT; btnLokasi.classList.remove('loading'); btnLokasi.disabled=false;
    showPopup("Gagal mengambil lokasi, coba lagi ya");
  },{enableHighAccuracy:true,timeout:10000});
}

// ===== POPUP FUNCTIONS ===== //
function showPopup(message){
  PopupManager.showCustom(message, false);
}
function closePopup(){
  PopupManager.closeCustom();
}
function showConfirmPopup(message, onConfirm){
  PopupManager.showCustom(message, true, onConfirm);
}

// ===== TOMBOL KIRIM ===== //
async function submitOrder() {
  // Validasi input
  if (!selectedService) return PopupManager.showCustom("Pilih layanan dulu 😊");
  
  const mainOrder = document.getElementById('mainOrder')?.value.trim();
  if (!mainOrder) return PopupManager.showCustom("Isi pesanan dulu 😊");
  
  const location = document.getElementById('locationSelect')?.value;
  if (!location) return PopupManager.showCustom("Pilih beli dimana dulu 😊");
  
  if (!userLat || !userLng) return PopupManager.showCustom("Lokasi belum siap, tekan tombol lokasi dulu 📍");

  // Konfirmasi sebelum submit
  PopupManager.showConfirm("Pastikan pesanan dan lokasi sudah benar 😊", async () => {
    try {
      // Tampilkan loading sementara
      PopupManager.showCustom("Tunggu sebentar ya...");

      const orderData = {
        userId: window.currentUser?.uid || null,
        layanan: selectedService,
        pesanan: mainOrder,
        beliDi: location,
        catatan: document.getElementById('note')?.value || '',
        ongkir,
        lat: userLat,
        lng: userLng,
        status: "Dibuat",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("orders").add(orderData);

      // Tampilkan pesan sukses
      PopupManager.showCustom("Pesanan berhasil dikirim 🤩");

      // Redirect atau update SPA
      setTimeout(() => {
        if (window.opener && window.opener.dispatchEvent) {
          window.opener.dispatchEvent(new CustomEvent('goto-aktivitas'));
          window.close();
        } else if (window.location.pathname.endsWith('index.html')) {
          window.dispatchEvent(new CustomEvent('goto-aktivitas'));
        } else {
          window.location.href = "index.html#aktivitas";
        }
      }, 800);

    } catch (e) {
      console.error(e);
      PopupManager.showCustom("Gagal kirim pesanan, coba lagi ya");
    }
  });
}

// ===== GLOBAL NAVIGATION ===== //
function goBack() {
  const homeIdx = navIndex('home');
  if(homeIdx !== null) {
    spaInternalNav = true;
    setActive(homeIdx, true); // gunakan SPA nav
  }
}