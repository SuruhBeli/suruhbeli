// ===== GLOBAL CACHE ===== //
window.globalCache = {};
// ===== INDEXEDDB ===== //
let dbIDB;
const request = indexedDB.open("appCacheDB", 1);
request.onupgradeneeded = e => {
  dbIDB = e.target.result;
  if (!dbIDB.objectStoreNames.contains("cache")) {
    dbIDB.createObjectStore("cache", { keyPath: "key" });
  }
};
request.onsuccess = e => { dbIDB = e.target.result; };
request.onerror = e => console.error("IndexedDB error:", e);
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
// ===== AMBIL DOKUMEN FIRESTORE DENGAN CACHE ===== //
async function getCachedDoc(key, docRef) {
  const cached = await getFromCache(key);
  if (cached) return cached;

  const doc = await docRef.get();
  if (!doc.exists) return null;
  const data = { id: doc.id, ...doc.data() };
  saveToCache(key, data);
  return data;
}
// ===== AMBIL COLLECTION FIRESTORE DENGAN CACHE ===== //
async function getCachedCollection(key, collectionRef, queryFn = null) {
  const cached = await getFromCache(key);
  if (cached) return cached;

  let query = collectionRef;
  if (queryFn) query = queryFn(collectionRef);

  const snapshot = await query.get();
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  saveToCache(key, data);
  return data;
}
// ~~~~~ SELESAI ~~~~~ //

// ===== DOM ELEMENTS (SAFE) ===== //
const loginPopup = document.getElementById("loginPopup");
const authLock = document.getElementById("authLock");
const welcomeText = document.getElementById("welcomeText");
const bannerCarousel = document.getElementById("bannerCarousel");
const bannerDots = document.getElementById("bannerDots");
const heroImage = document.getElementById("heroImage");
const scrollHeader = document.getElementById("scrollHeader");
const lottieContainer = document.getElementById("lottieAnimation");
const logoTop = document.querySelector(".logo-top");

// ===== APP READY (FINAL - ANTI db undefined) ===== //
window.addEventListener("app-ready", async () => {
  console.log("🏠 Home ready, bootstrap & firebase aman");

  // 🔥 Pastikan firebase benar-benar siap
  if (window.FIREBASE_READY) {
    await window.FIREBASE_READY;
  }

  const user = window.currentUser;

  // ===== AUTH UI SAFE ===== //
  if (!user) {
    saveToCache("auth", null);

    if (authLock) authLock.style.display = "block";
    if (loginPopup) loginPopup.classList.add("active");
    if (welcomeText) {
      welcomeText.innerText = "Silakan masuk untuk menggunakan layanan";
    }

    // Tetap load cache visual walau belum login
    await loadInitialCache();
    return;
  }

  // User login
  if (authLock) authLock.style.display = "none";
  if (loginPopup) loginPopup.classList.remove("active");

  try {
    const doc = await window.db
      .collection("users")
      .doc(user.uid)
      .get();

    const name = doc.exists
      ? doc.data().nama || user.displayName
      : user.displayName;

    if (welcomeText) {
      welcomeText.innerText = `Halo, ${name} 👋`;
    }

    saveToCache("auth", { uid: user.uid, name });

  } catch (err) {
    console.error("Auth fetch error:", err);

    if (welcomeText) {
      welcomeText.innerText = `Halo, ${user.displayName} 👋`;
    }

    saveToCache("auth", {
      uid: user.uid,
      name: user.displayName
    });
  }

  // 🔥 PENTING: FIRESTORE CALL SETELAH DB READY
  await cacheHeroImage();
  await cacheBannerCarousel();
  await loadInitialCache();
});

// ===== HERO IMAGE ===== //
async function cacheHeroImage() {
  try {
    const doc = await window.db.collection("stockfoto").doc("foto").get();
    const url = doc.exists ? doc.data().headerhome || "default.png" : "default.png";
    const imgTest = new Image();
    imgTest.src = url;
    imgTest.onload = () => { heroImage.src = url; };
    imgTest.onerror = () => { heroImage.src = "default.png"; };
    saveToCache("heroImage", url);
  } catch (err) {
    console.error("Error ambil hero image:", err);
    heroImage.src = "default.png";
  }
}

// ===== BANNER CAROUSEL ===== //
function renderBannerCarousel(banners) {
  bannerCarousel.innerHTML = "";
  bannerDots.innerHTML = "";
  let currentIndex = 0;
  let autoScrollInterval = null;

  banners.forEach((url, i) => {
    const img = document.createElement("img");
    img.src = url || "default.png";
    img.onerror = () => { img.src = "default.png"; };
    if (i === 0) img.classList.add("active");
    bannerCarousel.appendChild(img);

    const dot = document.createElement("span");
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.dataset.index = i;
    dot.onclick = () => showBanner(i);
    bannerDots.appendChild(dot);
  });

  function updateActiveState(index) {
    const images = bannerCarousel.querySelectorAll("img");
    images.forEach((img, i) => img.classList.toggle("active", i === index));
    Array.from(bannerDots.children).forEach((d, i) => d.classList.toggle("active", i === index));
  }

  function getItemWidth() {
    const style = getComputedStyle(bannerCarousel);
    const gap = parseInt(style.gap) || 20;
    return bannerCarousel.children[0].offsetWidth + gap;
  }

  function showBanner(index) {
    if (!bannerCarousel.children.length) return;
    const itemWidth = getItemWidth();
    bannerCarousel.scrollTo({ left: itemWidth * index, behavior: "smooth" });
    currentIndex = index;
    updateActiveState(index);
  }

  function startAutoScroll() {
    stopAutoScroll();
    if (banners.length > 1) {
      autoScrollInterval = setInterval(() => {
        let nextIndex = (currentIndex + 1) % banners.length;
        showBanner(nextIndex);
      }, 3500);
    }
  }

  function stopAutoScroll() { clearInterval(autoScrollInterval); }

  startAutoScroll();

  bannerCarousel.addEventListener("scroll", () => {
    const itemWidth = getItemWidth();
    const index = Math.round(bannerCarousel.scrollLeft / itemWidth);
    if (index !== currentIndex) {
      currentIndex = index;
      updateActiveState(index);
    }
  });

  bannerCarousel.addEventListener("touchstart", stopAutoScroll);
  bannerCarousel.addEventListener("touchend", startAutoScroll);
  bannerCarousel.addEventListener("mouseenter", stopAutoScroll);
  bannerCarousel.addEventListener("mouseleave", startAutoScroll);
}
async function cacheBannerCarousel() {
  try {
    const doc = await db.collection("stockfoto").doc("foto").get();
    const banners = doc.exists && Array.isArray(doc.data().bannerhome) ? doc.data().bannerhome : ["default.png"];
    banners.forEach(url => { const img = new Image(); img.src = url; }); // preload
    saveToCache("banners", banners);
    renderBannerCarousel(banners);
  } catch (err) {
    console.error("Error ambil banner:", err);
  }
}


// ===== LOTTIES ===== //
async function cacheLotties() {
  const lottiesList = ["makanan","belanja","barang","lainnya","ikon-1"];
  lottiesList.forEach(name => {
    const path = `${name}.json`;
    const container = document.getElementById(`lottie-${name}`) || lottieContainer;
    lottie.loadAnimation({ container, renderer:'svg', loop:true, autoplay:true, path });
    saveToCache(`lottie-${name}`, path);
  });
}
cacheLotties();

// ===== NAV ORDER ===== //
function goOrder(jenis) {
  if (!window.currentUser) {
    loginPopup.classList.add("active");
    authLock.style.display = "block";
    return;
  }

  window.location.href = "order.html?layanan=" + jenis;
}

// ===== SCROLL EFFECT ===== //
window.addEventListener("scroll", () => logoTop.classList.toggle("scrolled", window.scrollY > 10));
window.addEventListener("scroll", () => scrollHeader.style.opacity = Math.min(window.scrollY / 50, 1));

// ===== THEME ===== //
function loadTheme() {
  const savedTheme = localStorage.getItem("themeMode");
  document.body.classList.toggle("dark-mode", savedTheme === "dark");
}
window.addEventListener("load", loadTheme);

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

// ===== SERVICE WORKER (SAFE DEV MODE) ===== //
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("SW registered"))
      .catch(err => console.warn("SW disabled / error:", err));
  });
} else {
  console.log("Service Worker dilewati (localhost / non-https)");
}

// ===== GLOBAL CACHE UNTUK HALAMAN LAIN ===== //
window.globalCache;
async function loadInitialCache() {
  const hero = await getFromCache("heroImage");
  if (hero) heroImage.src = hero;
  const banners = await getFromCache("banners");
  if (banners) renderBannerCarousel(banners);
  const lottieNames = ["makanan","belanja","barang","lainnya","ikon-1"];
  lottieNames.forEach(async name => {
    const path = await getFromCache(`lottie-${name}`);
    if (path) {
      const container = document.getElementById(`lottie-${name}`) || lottieContainer;
      lottie.loadAnimation({ container, renderer:'svg', loop:true, autoplay:true, path });
    }
  });
  const authData = await getFromCache("auth");
  if (authData) welcomeText.innerText = `Halo, ${authData.name} 👋`;
}