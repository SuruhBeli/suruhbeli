
// ====== FIREBASE INIT (Hanya sekali) ======  //
if (!window.firebaseInitialized) {
  const firebaseConfig = {
    apiKey: "AIzaSyByQl0BXZoSMzrULUNA6l7UVFQjXmvsdJE",
    authDomain: "suruhbeli-e8ae8.firebaseapp.com",
    databaseURL: "https://suruhbeli-e8ae8-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "suruhbeli-e8ae8",
    storageBucket: "suruhbeli-e8ae8.firebasestorage.app",
    messagingSenderId: "5783247867",
    appId: "1:5783247867:web:8f57e09a7dc4565378c95e",
    measurementId: "G-W68JP10CG9",
  };
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
  window.rtdb = firebase.database();
  window.firebaseInitialized = true;
  console.log("✅ Firebase initialized");
}

// ====== DOMS ====== //
const navItems = document.querySelectorAll('.nav-item');
const navCircle = document.getElementById('navCircle');
const app = document.getElementById('app');
const navbarBottom = document.querySelector('.navbar-bottom');
const navActiveCircle = document.querySelector('.nav-active-circle');

// ====== FLAG ====== //
let appStarted = false;
let spaInternalNav = false;
let authReadySent = false;
let activeView = null;

// ====== AUTH ====== //
firebase.auth().onAuthStateChanged(user => {
  // Pastikan app sudah init minimal sekali
  if (!appStarted) {
    initApp();
  }
  if (user) {
    window.currentUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "User"
    };
    window.userId = user.uid;
    hideAuthOverlay();
    if (!authReadySent) {
      authReadySent = true;
      window.dispatchEvent(new Event('app-ready'));
    }
  } else {
    window.currentUser = null;
    window.userId = null;
    showAuthOverlay();
  }
});
function showAuthOverlay() {
  if (document.getElementById("authOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
overlay.innerHTML = `
  <div class="auth-box">

    <div class="auth-icon">
      🔐
    </div>

    <div class="auth-title">
      Login Diperlukan
    </div>

    <div class="auth-desc">
      Untuk menggunakan fitur aplikasi SuruhBeli
      silakan masuk atau daftar terlebih dahulu
    </div>

    <button class="auth-btn" id="btnMasuk">
      Masuk / Daftar
    </button>

  </div>
`;
  document.body.appendChild(overlay);
  document.getElementById("btnMasuk").onclick = () => {
    window.location.href = "register.html";
  };
}
function hideAuthOverlay() {
  const el = document.getElementById("authOverlay");
  if (el) el.remove();
}

// ====== INIT APP ====== //
function initApp() {
  if (appStarted) return;
  window.appStarted = true;
  // Nav click
  navItems.forEach((item, idx) => {
    item.addEventListener('click', () => setActive(idx));
  });
  // Tentukan view awal dari hash atau home
  let initialView = 'home';
  const hashView = window.location.hash.replace('#', '');
  if (document.getElementById(`view-${hashView}`)) {
    initialView = hashView;
  }
  const idx = navIndex(initialView);
  if (idx !== null) setActive(idx, true);
  if (app) app.style.visibility = 'visible';
  // Hash routing
  window.addEventListener("hashchange", handleHashRouting);
  // Resize nav circle
  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-item.active');
    if (active) updateNavCircle(Array.from(navItems).indexOf(active));
  });

  // ====== ANDROID / BROWSER BACK BUTTON ====== //
window.addEventListener("popstate", ()=>{

  const activeViewEl = document.querySelector(".view.active");

  const activeView = activeViewEl
      ? activeViewEl.id.replace("view-","")
      : "home";

  if(activeView !== "home"){

      // paksa kembali ke home
      const idx = navIndex("home");

      if(idx !== null){
        setActive(idx,true);
      }

  }else{

      // jika sudah di home → exit
      if(confirm("Tekan OK untuk keluar aplikasi")){
        window.close();
      }

  }

});
  // Tambahkan state awal supaya popstate bekerja
  history.replaceState({view:"home"}, "", "#home");
}

// ====== NAVBAR ====== //
function toggleHomeHeader(show) {
  const logoTop = document.querySelector(".logo-top");
  const scrollHeader = document.getElementById("scrollHeader");
  if (!logoTop || !scrollHeader) return;
  if (show) {
    logoTop.style.opacity = "1";
    scrollHeader.style.opacity = "0"; 
    logoTop.style.pointerEvents = "auto";
    scrollHeader.style.pointerEvents = "auto";
  } else {
    logoTop.style.opacity = "0";
    scrollHeader.style.opacity = "0";
    logoTop.style.pointerEvents = "none";
    scrollHeader.style.pointerEvents = "none";
  }
}
function updateNavCircle(idx) {
  const item = navItems[idx];
  if (!item || !navCircle) return;
  const rect = item.getBoundingClientRect();
  const parentRect = item.parentElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2 - parentRect.left;
  navCircle.style.left = `${centerX - navCircle.offsetWidth / 2}px`;
  navCircle.style.transform = 'scale(1.15)';
  setTimeout(() => navCircle.style.transform = 'scale(1)', 200);
  navCircle.style.willChange = "left, transform";
}
function showView(viewName){

  const target = document.getElementById(`view-${viewName}`);
  if(!target) return;

  const current = activeView;

  if(current && current !== target){

    current.classList.remove("zoom-in");
    current.classList.add("zoom-out");

    target.classList.remove("zoom-out");
    target.classList.add("active","zoom-in");

    requestAnimationFrame(()=>{
      target.style.zIndex = 2;
      current.style.zIndex = 1;
    });

    setTimeout(()=>{
      current.classList.remove("active","zoom-out");
    },350);

  }else{

    target.classList.add("active","zoom-in");
    target.style.zIndex = 2;

  }

  activeView = target;

  // header toggle
  if(viewName === "home" || viewName === "order"){
    toggleHomeHeader(true);
  }else{
    toggleHomeHeader(false);
  }

  // navbar toggle
  toggleNavbarForOrder(viewName === "order");

  // SPA init per view
  const viewFlag = `_${viewName}Inited`;

  if(!window[viewFlag]){

    switch(viewName){
      case "home": window.initHome?.(); break;
      case "aktivitas": window.initAktivitas?.(); break;
      case "profil": window.initProfil?.(); break;
      case "chatlist": window.initChatList?.(); break;
      case "order": window.initOrder?.(); break;
    }

    window[viewFlag] = true;
  }

}

// ======  NAVIGATION ====== //
// ====== GANTI setActive TANDI NAV INTERNAL====== //
function setActive(idx, fromPop=false){

  const viewName = navItems[idx].dataset.view;

  // nav highlight
  navItems.forEach(i => i.classList.remove('active'));
  navItems[idx].classList.add('active');

  updateNavCircle(idx);

  // tampilkan view
  showView(viewName);

  // update URL TANPA menambah history
  if(!fromPop){
    history.replaceState(
      {view:viewName},
      "",
      "#"+viewName
    );
  }

}
// Cari index nav berdasarkan view
function navIndex(viewName) {
  const item = Array.from(navItems).find(i => i.dataset.view === viewName);
  return item ? Array.from(navItems).indexOf(item) : 0;
}
function handleHashRouting() {
  const hashView = window.location.hash.replace('#','');
  if (!hashView) return;
  const idx = navIndex(hashView);
  if (idx !== null) setActive(idx, true);
}

// ====== TOGGLE NAVBAR UNTUK ORDER VIEW ====== //
function toggleNavbarForOrder(isHidden){

  if(isHidden){

    navbarBottom?.classList.add("hidden");
    navActiveCircle?.classList.add("hidden");
    navItems.forEach(i => i.classList.add("hidden"));

  }else{

    navbarBottom?.classList.remove("hidden");
    navActiveCircle?.classList.remove("hidden");
    navItems.forEach(i => i.classList.remove("hidden"));

  }

}

// ====== SPA CUSTOM EVENTS ===== //
window.addEventListener('goto-aktivitas', () => {
  const idx = navIndex('aktivitas');
  if (idx !== null) setActive(idx);
});
window.addEventListener('goto-chatlist', () => {
  const idx = navIndex('chatlist');
  if (idx !== null) setActive(idx);
});

// ===== GLOBAL POPUP CONTROLLER ======= //
function openPopup(id){
  const popup = document.getElementById(id);
  if(!popup) return;

  popup.classList.add("show");
  document.body.classList.add("popup-open");
}
function closePopup(id){
  const popup = document.getElementById(id);

  if(popup){
    popup.classList.remove("show");
  }

  document.body.classList.remove("popup-open");
}
// CLICK OUTSIDE CLOSE
document.addEventListener("click", function(e){
  const overlay = e.target.closest(".popup-overlay");
  if(overlay && e.target === overlay){
      overlay.classList.remove("show");
      document.body.classList.remove("popup-open");
  }

});
// ESC CLOSE
document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".popup-overlay.show")
      .forEach(p => p.classList.remove("show"));
    document.body.classList.remove("popup-open");
  }
});
// ====== GLOBAL POPUP MANAGER ====== //
window.PopupManager = (function(){
  // DOM references
  const popups = {
    detail: document.getElementById("popupDetail"),
    edit: document.getElementById("popupEdit"),
    editProfile: document.getElementById("popupEditProfile"),
    alert: document.getElementById("popupAlert"),
    service: document.getElementById("servicePopup"),
    desa: document.getElementById("desaPopup"),
    custom: document.getElementById("customPopup"),
    photoOption: document.getElementById("popupPhotoOption")
  };
  // ==================== SHOW & CLOSE UTILITY ====================
  function closeAll(){
    Object.values(popups).forEach(p => {
      if(p) p.classList.remove("show");
    });
    document.body.classList.remove("popup-open");
  }
  // Swipe down close (iOS style)
  let startY = 0;
  document.addEventListener("touchstart", e => startY = e.touches[0].clientY);
  document.addEventListener("touchend", e => {
    let endY = e.changedTouches[0].clientY;
    if(endY - startY > 120) closeAll();
  });
  // ==================== DETAIL POPUP ====================
  function showDetail(content){
    if(!popups.detail) return;
    const popupContent = popups.detail.querySelector("#popupContent");
    popupContent.innerHTML = content || '';
    popups.detail.classList.add("show");
  }
  function closeDetail(){ if(popups.detail) popups.detail.classList.remove("show"); }
  // ==================== EDIT POPUP ====================
  function showEdit(pesanan='', catatan=''){
    if(!popups.edit) return;
    document.getElementById("editPesanan").value = pesanan;
    document.getElementById("editCatatan").value = catatan;
    popups.edit.classList.add("show");
  }
  function closeEdit(){ if(popups.edit) popups.edit.classList.remove("show"); }
  // ==================== ALERT / CONFIRM POPUP ====================
  function showAlert(message){
    if(!popups.alert) return;
    document.getElementById("popupAlertMessage").innerText = message;
    popups.alert.classList.add("show");
  }
  function showConfirm(message, onOk){
    if(!popups.alert) return;
    document.getElementById("popupAlertMessage").innerText = message;
    const btnOk = document.getElementById("popupOk");
    const btnCancel = document.getElementById("popupCancel");
    popups.alert.classList.add("show");
    btnOk.onclick = () => { closeAll(); onOk?.(); };
    btnCancel.onclick = closeAll;
  }
  // ==================== SERVICE POPUP ====================
  function showService(){ if(popups.service) popups.service.classList.add("show"); }
  function closeService(){ if(popups.service) popups.service.classList.remove("show"); }
  // ==================== DESA POPUP ====================
  function showDesa(){ if(popups.desa) popups.desa.classList.add("show"); }
  function closeDesa(){ if(popups.desa) popups.desa.classList.remove("show"); }
  // ==================== CUSTOM POPUP ====================
  function showCustom(message, showActions = false, onOk) {
    if (!popups.custom) return;
    const msg = popups.custom.querySelector("#popupMessage");
    const actions = popups.custom.querySelector("#popupActions");
    const btnOk = document.getElementById("btnOkPopup");
    const btnBatal = document.getElementById("btnBatalPopup");
    msg.innerText = message;
    actions.style.display = showActions ? "flex" : "none";
    popups.custom.classList.add("show");
    if (showActions) {
      btnOk.onclick = () => { actions.style.display = "none"; onOk?.(); };
      btnBatal.onclick = () => { popups.custom.classList.remove("show"); };
    } else {
      // otomatis hilang setelah 3 detik
      setTimeout(() => { popups.custom.classList.remove("show"); }, 2000);
    }
  }
  function closeCustom(){ if(popups.custom) popups.custom.classList.remove("show"); }

// =====EDIT PROFIL ===== //
function showEditProfile(userData) {
  const popup = document.getElementById("popupEditProfile");
  if (!popup) return;

  // Isi input
  document.getElementById("editNama").value = userData?.nama || "";
  document.getElementById("editNoHP").value = userData?.noHP || userData?.phone || "";

  // Preview avatar
  const editPreview = document.getElementById("editAvatarPreview");
  if (userData?.photoURL) {
    editPreview.innerHTML = `<img src="${userData.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else if (userData?.nama && userData.nama.length > 0) {
    editPreview.textContent = userData.nama.charAt(0).toUpperCase();
  } else {
    editPreview.textContent = "U";
  }

  // Upload photo
  const inputPhoto = document.getElementById("inputPhoto");
  const btnUpload = document.getElementById("btnUploadPhoto");
  if (btnUpload && inputPhoto) {
    btnUpload.onclick = () => showPhotoOption();
    inputPhoto.onchange = function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64 = e.target.result;
        editPreview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        localStorage.setItem("tempProfilePhoto", base64);
      };
      reader.readAsDataURL(file);
    };
  }

  popup.classList.add("show");
  document.body.classList.add("popup-open");
}
  function closeEditProfile() {
    if (popups.editProfile) popups.editProfile.classList.remove("show");
    document.body.classList.remove("popup-open");
  }
  
  // ====== PHOTO OPTION POPUP ====== //
  // Event upload foto
  const inputPhoto = document.getElementById("inputPhoto");
  const editPreview = document.getElementById("editAvatarPreview");
  function showPhotoOption(){
    if(!popups.photoOption) return;
  
    popups.photoOption.classList.add("show");
    document.body.classList.add("popup-open");
  }
  function closePhotoOption(){
    if(!popups.photoOption) return;
  
    popups.photoOption.classList.remove("show");
  }
  const btnGallery = document.getElementById("btnChooseGallery");
  const btnDelete = document.getElementById("btnDeletePhoto");
  const btnCancel = document.getElementById("btnCancelPhotoOption");
  
  if(btnGallery){
    btnGallery.onclick = () => {
      closePhotoOption();
      document.getElementById("inputPhoto").click();
    };
  }
  
  if(btnDelete){
    btnDelete.onclick = () => {
  
      closePhotoOption();
  
      localStorage.setItem("tempProfilePhoto","delete");
  
      const preview = document.getElementById("editAvatarPreview");
      const nama = document.getElementById("editNama")?.value || "U";
  
      if(preview){
        preview.textContent = nama.charAt(0).toUpperCase();
      }
  
    };
  }
  
  if(btnCancel){
    btnCancel.onclick = closePhotoOption;
  }
  if (inputPhoto) {
    inputPhoto.onchange = function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const base64 = e.target.result;
        if (editPreview) {
          editPreview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
        localStorage.setItem("tempProfilePhoto", base64);
      };
      reader.readAsDataURL(file);
    };
  }
    // ==================== PUBLIC API ====================
  return {
    closeAll,
    showDetail, closeDetail,
    showEdit, closeEdit,
    showAlert, showConfirm,
    showService, closeService,
    showDesa, closeDesa,
    showCustom, closeCustom,
    showEditProfile, closeEditProfile,
    showPhotoOption, closePhotoOption
  };
})();

// REGISTER SERVICE WORKER
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(reg => {
        console.log("✅ Service Worker aktif", reg);
      })
      .catch(err => {
        console.log("❌ Service Worker gagal", err);
      });
  });
}