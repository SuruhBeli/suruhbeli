// ===== ORDER.JS FULL MODIFIED & SAFE (BOOTSTRAP READY) ===== //
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
let logoTop;

// ===== DOM INIT & EVENT LISTENER ===== //
window.addEventListener("DOMContentLoaded", () => {
  // ----- GET ELEMENTS SAFELY ----- //
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
  logoTop = document.querySelector(".logo-top");

  // ----- SCROLL EFFECT LOGO ----- //
  if(logoTop){
    window.addEventListener("scroll", () => {
      if(window.scrollY > 10) logoTop.classList.add("scrolled");
      else logoTop.classList.remove("scrolled");
    });
  }

  // ----- DROPDOWN DESA INTERACTION ----- //
  if(desaTrigger && desaPopup && btnTutupDesa){
    desaTrigger.addEventListener("click", ()=> desaPopup.classList.add("show"));
    btnTutupDesa.addEventListener("click", ()=> desaPopup.classList.remove("show"));
    desaPopup.addEventListener("click", e => {
      if(e.target === desaPopup) desaPopup.classList.remove("show");
    });
  }

  // ----- SERVICE POPUP ----- //
  if(servicePopup){
    servicePopup.addEventListener("click", e => {
      if(e.target === servicePopup) servicePopup.classList.remove("show");
    });
  }

  // ----- CUSTOM ALERT POPUP ----- //
  if(popup){
    popup.addEventListener("click", ()=> popup.classList.remove("show"));
  }

  // ----- INPUT & TEXTAREA ----- //
  ['mainOrder','locationSelect','note'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', updateSummary);
      el.addEventListener('change', updateSummary);
      autoResizeTextarea(el);
      el.addEventListener('input', function(){ autoResizeTextarea(this); });
    }
  });

  // ----- GPS BUTTON ----- //
  if(btnLokasi) btnLokasi.addEventListener('click', handleGpsButton);

  // ----- SINKRON TEMA ----- //
  loadTheme();
});

// ===== APP READY (USER LOGIN & DATA FIRESTORE) ===== //
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
    if(doc.exists){
      const url = doc.data().headerorder;
      if(url && url.trim() !== ""){
        const imgTest = new Image();
        imgTest.src = url;
        imgTest.onload = () => hero.style.backgroundImage = `url('${url}')`;
        imgTest.onerror = () => hero.style.backgroundImage = `url('${defaultImg}')`;
      } else hero.style.backgroundImage = `url('${defaultImg}')`;
    } else hero.style.backgroundImage = `url('${defaultImg}')`;
  }catch(e){
    console.log("Gagal load hero header:", e);
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

  let ranking = 0;
  for(let i=0;i<desaDenganJarak.length;i++){
    if(desaDenganJarak[i].nama === desaTujuan.nama){ ranking = i+1; break; }
  }

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

  if(service==='Beli Makanan'){
    mainOrder.placeholder=`Mau beli apa?\n- Nasi goreng 2\n- Bakso 1\n- Teh manis`;
    note.placeholder=`Keterangan tambahan (opsional)\n- Pedas sedang\n- Warung Bu Ijah\n- Tanpa sambal`;
  } else if(service==='Beli Belanjaan'){
    mainOrder.placeholder=`Tulis barang yang mau dibeli\n- Beras 5kg\n- Minyak 1 liter\n- Indomie 3`;
    note.placeholder=`Keterangan tambahan (opsional)\n- Merk bebas\n- Kalau kosong ganti yang mirip\n- Ukuran kecil saja`;
  } else if(service==='Antar Barang'){
    mainOrder.placeholder=`Barang apa yang mau diantar?\n- Paket kecil\n- Dokumen\n- Tas`;
    note.placeholder=`Detail tujuan (biar tidak nyasar)\n- Rumah pagar biru\n- Sebelah mushola\n- Untuk Pak Rudi`;
  } else if(service==='Suruh Lainnya'){
    mainOrder.placeholder=`Tulis permintaan kamu\n- Ambil paket\n- Bayar listrik\n- Belikan pulsa`;
    note.placeholder=`Jelaskan lebih detail ya\n- Ambil di warung depan\n- Tunggu sampai selesai\n- Jam 7 malam`;
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
function openServicePopup(){ if(servicePopup) servicePopup.classList.add("show"); }
function closeServicePopup(){ if(servicePopup) servicePopup.classList.remove("show"); }

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

  if(pakaiGPS){ // Kembali ke rumah
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
function showPopup(message){ if(popup && popupMessage && popupActions){ popupMessage.innerText=message; popupActions.style.display="none"; popup.classList.add("show"); } }
function closePopup(){ if(popup) popup.classList.remove("show"); }
function showConfirmPopup(message,onConfirm){
  if(!popup || !popupMessage || !popupActions || !btnOkPopup || !btnBatalPopup) return;
  popupMessage.innerText=message; popupActions.style.display="flex"; popup.classList.add("show");
  btnOkPopup.onclick=()=>{ popupActions.style.display="none"; onConfirm(); };
  btnBatalPopup.onclick=closePopup;
}

// ===== TOMBOL KIRIM ===== //
async function submitOrder(){
  const mainOrder=document.getElementById('mainOrder')?.value.trim();
  const location=document.getElementById('locationSelect')?.value;
  const note=document.getElementById('note')?.value.trim();

  if(!selectedService){ showPopup("Pilih layanan dulu ya 😊"); return; }
  if(!mainOrder){ showPopup("Isi pesanan dulu ya 😊"); return; }
  if(!location){ showPopup("Pilih beli dimana dulu ya 😊"); return; }
  if(!userLat || !userLng){ showPopup("Lokasi belum siap, tekan tombol lokasi dulu 📍"); return; }

  showConfirmPopup("Pastikan pesanan dan lokasi sudah benar ya 😊", async ()=>{
    try{
      showPopup("Tunggu sebentar ya...");
      const orderData={
        userId: window.currentUser?.uid || null,
        layanan:selectedService,
        pesanan:mainOrder,
        beliDi:location,
        catatan:note,
        ongkir,
        lat:userLat,
        lng:userLng,
        status:"Dibuat",
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection("orders").add(orderData);
      showPopup("Pesanan berhasil dikirim 🤩");
      setTimeout(()=> window.location.href="aktivitas.html",1200);
    }catch(e){ console.error(e); showPopup("Gagal kirim pesanan, coba lagi ya"); }
  });
}

// ===== THEME SYNC ===== //
function loadTheme(){
  const savedTheme = localStorage.getItem("themeMode");
  if(savedTheme==="dark") document.body.classList.add("dark-mode");
  else document.body.classList.remove("dark-mode");
}

// ===== SCROLL HEADER OPACITY ===== //
window.addEventListener("scroll",()=>{
  const scrollY = window.scrollY;
  const sh = document.getElementById("scrollHeader");
  if(sh) sh.style.opacity=Math.min(scrollY/50,1);
});

// ===== BACK FUNCTION ===== //
function goBack(){ window.location.href='index.html'; }