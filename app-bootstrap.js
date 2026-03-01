// ===== APP BOOTSTRAP (GLOBAL AUTH + GLOBAL STATE CONTROLLER) ===== //
console.log("🚀 App Bootstrap Loaded");

// Hindari bootstrap dobel kalau script ke-load 2x
if (!window.__APP_BOOTSTRAPPED__) {
  window.__APP_BOOTSTRAPPED__ = true;

  // ===== GLOBAL STATE (SATU SUMBER KEBENARAN) ===== //
  window.APP_READY = false;
  window.currentUser = null;
  window.activeTab = window.activeTab || 'aktif';
  window.currentEditId = null;

  // Optional global flags (biar konsisten di semua halaman)
  window.isInitialLoading = true;

  console.log("FIREBASE_READY exists:", !!window.FIREBASE_READY);
  console.log("Auth exists:", typeof auth);

  (async () => {
    try {
      // 🔥 WAJIB: tunggu Firebase init dulu (ANTI auth undefined & race condition)
      if (window.FIREBASE_READY) {
        await window.FIREBASE_READY;
        console.log("🔥 Firebase Ready");
      } else {
        console.error("FIREBASE_READY tidak ditemukan! Cek firebase-init.js");
        return;
      }

      if (typeof auth === "undefined") {
        console.error("❌ Auth belum tersedia! Urutan script salah.");
        return;
      }

      console.log("🔐 Menunggu status login (GLOBAL LISTENER)...");

      // ===== SINGLE GLOBAL AUTH LISTENER (JANGAN DUPLIKAT DI FILE LAIN) =====
      auth.onAuthStateChanged(async (user) => {

        // ===== USER BELUM LOGIN =====
        if (!user) {
          console.log("🚪 User belum login");

          window.currentUser = null;
          window.APP_READY = false;

          // Deteksi halaman auth (anti redirect loop)
          const path = location.pathname.toLowerCase();
          const isAuthPage =
            path.includes("login") ||
            path.includes("register");

          // Redirect hanya jika bukan di halaman auth
          if (!isAuthPage) {
            console.log("➡️ Redirect ke register.html");
            location.replace("register.html");
          }

          return;
        }

        // ===== USER SUDAH LOGIN =====
        console.log("✅ User login:", user.uid);

        // Set global user (dipakai semua file: home.js, chatlist.js, order.js)
        window.currentUser = user;

        // 🔥 Tunggu IndexedDB siap (anti cache undefined)
        if (window.idbReady) {
          try {
            await window.idbReady;
            console.log("💾 IndexedDB Ready");
          } catch (e) {
            console.warn("⚠️ IndexedDB gagal siap:", e);
          }
        }

        // Tandai aplikasi siap
        window.APP_READY = true;
        window.isInitialLoading = false;

        console.log("🚀 APP READY (GLOBAL):", user.uid);

        // 🔥 Broadcast ke semua script halaman
        // (order.js, home.js, chatlist.js, dll)
        window.dispatchEvent(new Event("app-ready"));
      });

    } catch (err) {
      console.error("❌ Bootstrap Fatal Error:", err);
    }
  })();
}
window.waitForUser = async () => {
  if (window.APP_READY) return window.currentUser;
  await new Promise(res => window.addEventListener("app-ready", ()=>res(), {once:true}));
  return window.currentUser;
};