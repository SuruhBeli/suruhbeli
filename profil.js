// ===== GLOBAL CACHE (jika belum ada) =====
window.globalCache = window.globalCache || {};
// ===== INDEXEDDB ===== //
let dbIDB;
const request = indexedDB.open("appCacheDB", 1);
request.onupgradeneeded = (e) => {
  dbIDB = e.target.result;
  if (!dbIDB.objectStoreNames.contains("cache")) {
    dbIDB.createObjectStore("cache", { keyPath: "key" });
  }
};
request.onsuccess = (e) => {
  dbIDB = e.target.result;
};
request.onerror = (e) => {
  console.error("IndexedDB error:", e);
};
// ===== HELPER SAVE / GET CACHE ===== //
function saveToCache(key, value) {
  window.globalCache[key] = value;
  if (!dbIDB) return;
  const tx = dbIDB.transaction("cache", "readwrite");
  tx.objectStore("cache").put({ key, value });
}
function getFromCache(key) {
  if (window.globalCache[key]) return Promise.resolve(window.globalCache[key]);
  if (!dbIDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const tx = dbIDB.transaction("cache", "readonly");
    const store = tx.objectStore("cache");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value || null);
    req.onerror = e => reject(e);
  });
}
// Optional: helper untuk doc Firestore + cache
async function getCachedDoc(key, docRef) {
  let data = await getFromCache(key);
  if (data) return data; // ambil dari cache dulu
  try {
    const doc = await docRef.get();
    if (!doc.exists) return null;
    data = { id: doc.id, ...doc.data() };
    saveToCache(key, data);
    return data;
  } catch(e) {
    console.log(e);
    return null;
  }
}
// ~~~~~ SELESAI ~~~~~ //

// ===== DOMS ===== //
const editPopup = document.getElementById("editPopup");
const confirmPopup = document.getElementById("confirmPopup");
const successPopup = document.getElementById("successPopup");
  const darkModeText = document.getElementById("darkModeText");
  const btnDarkMode = document.getElementById("btnDarkMode");
const inputPhoto = document.getElementById("inputPhoto");
const editPreview = document.getElementById("editAvatarPreview");

function safeOnClick(id, handler){
  const el = document.getElementById(id);
  if (!el) return; // silent skip (clean console)
  el.onclick = handler;
}

// ===== FLAG ===== //
let pendingSave = false;
let pendingDarkToggle = false; // 🔥 TAMBAHAN
let pendingLogout = false;

// ===== LOAD HEADER DARI FIRESTORE ===== //
async function loadHeaderProfil() {
  const heroImg = document.getElementById("heroImg");
  if (!heroImg) return;

  const cacheKey = "heroImage";

  try {
    // 1️⃣ Ambil dari cache dulu
    const cached = await getFromCache(cacheKey);
    if (cached) {
      heroImg.src = cached;
    }

    // 2️⃣ Ambil dari Firestore
    const docRef = db.collection("stockfoto").doc("foto");
    const doc = await docRef.get();

    if (doc.exists) {
      const url = doc.data().headerprofil || "default.png";

      heroImg.src = url;
      heroImg.onerror = () => { heroImg.src = "default.png"; };

      // 3️⃣ Update cache
      saveToCache(cacheKey, url);
    }

  } catch (e) {
    console.log("Gagal load header profil:", e);
    heroImg.src = "default.png";
  }
}

/* ===== SET DATA DEFAULT (ANTI KOSONG) ===== */
function setDefaultProfile(){
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  if(nameEl) nameEl.textContent = "Pengguna";
  if(emailEl) emailEl.textContent = "-";
  if(phoneEl) phoneEl.textContent = "-";
  if(avatarEl) avatarEl.textContent = "U";
}

// ===== LOAD DATA PROFIL USER ===== //
// ===== LOAD PROFIL SETELAH APP READY (ANTI RACE CONDITION) ===== //
window.addEventListener("app-ready", async () => {
  console.log("👤 Profil page ready");

  await loadHeaderProfil(); // header tetap load

  const user = window.currentUser;

  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  if (!user) {
    if (nameEl) nameEl.textContent = "Belum Login";
    if (emailEl) emailEl.textContent = "-";
    if (phoneEl) phoneEl.textContent = "-";
    if (avatarEl) avatarEl.textContent = "?";
    return;
  }

  const cacheKey = `userProfile_${user.uid}`;

  // 1️⃣ Cache dulu (instant UI)
  const cachedData = await getFromCache(cacheKey);
  if (cachedData) {
    setProfileUI(cachedData);
  }

  try {
    const docRef = window.db.collection("users").doc(user.uid);

    // Realtime listener aman (tanpa auth listener dobel)
    docRef.onSnapshot(doc => {
      if (!doc.exists) return;
      const data = { id: doc.id, ...doc.data() };
      saveToCache(cacheKey, data);
      setProfileUI(data);
    });

  } catch (err) {
    console.error("Error load profil:", err);
    setDefaultProfile();
  }
});
// ===== HELPER SET UI PROFILE ===== //
function setProfileUI(data) {
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  const nama = data.nama || data.name || "Pengguna";
  const nohp = data.noHP || data.nohp || data.phone || "-";
  const email = data.email || "-";

  if (nameEl) nameEl.textContent = nama;
  if (phoneEl) phoneEl.textContent = nohp;
  if (emailEl) emailEl.textContent = email;

  if (avatarEl){
    if(data.photoURL){
      avatarEl.innerHTML = `<img src="${data.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else if(nama && nama.length>0){
      avatarEl.textContent = nama.charAt(0).toUpperCase();
    } else {
      avatarEl.textContent = "U";
    }
  }
}

// ===== LOCAL STORAGE PHOTO ===== //
function loadLocalAvatar(){
  const savedPhoto = localStorage.getItem("profilePhoto");
  const avatarEl = document.getElementById("profileAvatar");

  if(savedPhoto && avatarEl){
    avatarEl.innerHTML = `<img src="${savedPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
}

// ===== SAFE EVENT BINDING (ANTI NULL CRASH) ===== //

// DARK MODE BUTTON
if (btnDarkMode && confirmPopup) {
  btnDarkMode.onclick = () => {
    confirmPopup.classList.add("show");
    pendingDarkToggle = true;
  };
}

// CLICK OUTSIDE EDIT POPUP
if (editPopup) {
  editPopup.onclick = (e) => {
    if (e.target === editPopup) {
      editPopup.classList.remove("show");
    }
  };
}

// INPUT PHOTO CHANGE
if (inputPhoto) {
  inputPhoto.onchange = function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result;

      if (editPreview) {
        editPreview.innerHTML = `<img src="${base64}">`;
      }

      localStorage.setItem("tempProfilePhoto", base64);
    };
    reader.readAsDataURL(file);
  };
}

safeOnClick("btnCancelConfirm", () => {
  if (confirmPopup) confirmPopup.classList.remove("show");
  pendingSave = false;
});
safeOnClick("btnCloseSuccess", () => {
  if (successPopup) successPopup.classList.remove("show");
});
safeOnClick("btnOkConfirm", async () => {
  if (!confirmPopup) return;
  confirmPopup.classList.remove("show");

  // ===== PRIORITAS 1: LOGOUT =====
  if (pendingLogout) {
    pendingLogout = false;
    try {
      await auth.signOut();
      window.location.href = "register.html";
    } catch (err) {
      console.log("Error logout:", err);
    }
    return;
  }

  // ===== PRIORITAS 2: DARK MODE =====
  if (pendingDarkToggle) {
    pendingDarkToggle = false;

    const isDark = document.body.classList.contains("dark-mode");

    if (isDark) {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("themeMode", "light");
      if (darkModeText) darkModeText.textContent = "Mode Gelap";
    } else {
      document.body.classList.add("dark-mode");
      localStorage.setItem("themeMode", "dark");
      if (darkModeText) darkModeText.textContent = "Mode Cerah";
    }
    return;
  }

  // ===== PRIORITAS 3: SAVE PROFILE =====
  if (!pendingSave) return;
  pendingSave = false;

  const user = window.currentUser;
  if (!user) return;

  const editNama = document.getElementById("editNama");
  const editNoHP = document.getElementById("editNoHP");

  const nama = editNama?.value.trim() || "";
  const noHP = editNoHP?.value.trim() || "";
  const tempPhoto = localStorage.getItem("tempProfilePhoto");

  try {
    await db.collection("users").doc(user.uid).update({
      nama: nama,
      noHP: noHP
    });

    if (tempPhoto) {
      localStorage.setItem("profilePhoto", tempPhoto);
      localStorage.removeItem("tempProfilePhoto");

      const avatarEl = document.getElementById("profileAvatar");
      if (avatarEl) {
        avatarEl.innerHTML = `<img src="${tempPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      }
    }

    const nameEl = document.getElementById("profileName");
    const phoneEl = document.getElementById("profilePhone");

    if (nameEl) nameEl.textContent = nama || "Pengguna";
    if (phoneEl) phoneEl.textContent = noHP || "-";

    if (editPopup) editPopup.classList.remove("show");
    if (successPopup) successPopup.classList.add("show");

  } catch (err) {
    console.log("Error update profil:", err);
  }
});

/* ===== LOAD THEME SAAT HALAMAN DIBUKA ===== */
function loadTheme(){
  const savedTheme = localStorage.getItem("themeMode");
  const darkModeText = document.getElementById("darkModeText");

  if(savedTheme === "dark"){
    document.body.classList.add("dark-mode");
    if(darkModeText) darkModeText.textContent = "Mode Cerah";
  }else{
    document.body.classList.remove("dark-mode");
    if(darkModeText) darkModeText.textContent = "Mode Gelap";
  }
}

window.addEventListener("load", () => {
  loadLocalAvatar();
  loadTheme(); // 🔥 TAMBAHAN
});

// ===== NAVIGASI CARD LAINNYA ===== //
safeOnClick("btnEditProfile", () => {
  const name = document.getElementById("profileName")?.textContent || "";
  const phone = document.getElementById("profilePhone")?.textContent || "";

  const editNama = document.getElementById("editNama");
  const editNoHP = document.getElementById("editNoHP");

  if(editNama) editNama.value = name !== "Memuat profil..." ? name : "";
  if(editNoHP) editNoHP.value = phone !== "-" ? phone : "";

  editPopup?.classList.add("show");
});
safeOnClick("btnTerms", () => {
  window.location.href = "ketentuan.html";
});
safeOnClick("btnPrivacy", () => {
  window.location.href = "kebijakan.html";
});
safeOnClick("btnFeedback", () => {
  window.location.href = "feedback.html";
});
safeOnClick("btnTentang", () => {
  window.location.href = "tentang.html";
});
safeOnClick("btnInvite", () => {
  const text = encodeURIComponent(
    "Yuk pakai aplikasi SuruhBeli! Bantu belanja desa jadi lebih mudah 🚀"
  );
  const waUrl = `https://wa.me/?text=${text}`;
  window.open(waUrl, "_blank");
});

/* === NAVBAR BAWAH (APP STYLE - NO HISTORY STACK) === */
const navItems = document.querySelectorAll('.nav-item');
const navCircle = document.getElementById('navCircle');
const navbarBottom = document.querySelector('.navbar-bottom');
if (navbarBottom) {
  navbarBottom.classList.toggle('gempa-mode');
}

function updateNavCircle(activeIndex) {
  const activeItem = navItems[activeIndex];
  if (!activeItem || !navCircle) return;

  const navbarRect = activeItem.parentElement.getBoundingClientRect();
  const icon = activeItem.querySelector('svg');
  const iconRect = icon.getBoundingClientRect();

  const centerX = iconRect.left + iconRect.width / 2 - navbarRect.left;

  navCircle.style.left = `${centerX - navCircle.offsetWidth / 2}px`;
  navCircle.style.transform = 'scale(1.15)';

  setTimeout(() => {
    navCircle.style.transform = 'scale(1)';
  }, 200);
}

// 🔥 NAVIGASI MODERN (TIDAK NIMBUN HISTORY)
function navigateNoStack(url){
  const current = window.location.pathname.split("/").pop() || "index.html";

  // Kalau halaman sama, jangan reload
  if(current === url) return;

  // Pakai replace = tidak masuk history (seperti aplikasi native)
  window.location.replace(url);
}

// Inisialisasi tab aktif sesuai URL
let currentPage = window.location.pathname.split("/").pop() || 'index.html';

navItems.forEach((item, idx) => {
  if (item.dataset.href === currentPage) {
    item.classList.add('active');
    updateNavCircle(idx);
  }

  // Event klik navbar
  item.addEventListener('click', () => {
    const targetPage = item.dataset.href;

    // Update UI dulu (animasi tetap jalan)
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    updateNavCircle(idx);

    // Delay biar animasi circle halus
    setTimeout(() => {
      navigateNoStack(targetPage); // 🔥 INI YANG PENTING
    }, 220);
  });
});

// Update posisi saat resize / load
function updateActiveCircle() {
  const active = document.querySelector('.nav-item.active');
  if (active) {
    const idx = Array.from(navItems).indexOf(active);
    updateNavCircle(idx);
  }
}

window.addEventListener('resize', updateActiveCircle);
window.addEventListener('load', updateActiveCircle);
