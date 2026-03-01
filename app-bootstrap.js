// ===== APP BOOTSTRAP (GLOBAL AUTH + GLOBAL STATE CONTROLLER) ===== //
console.log("🚀 App Bootstrap Loaded");

// Hindari bootstrap dobel kalau script ke-load 2x
if (!window.__APP_BOOTSTRAPPED__) {
  window.__APP_BOOTSTRAPPED__ = true;

  // ===== GLOBAL STATE (SINGLE SOURCE OF TRUTH) ===== //
  window.APP_READY = false;        // App siap dipakai
  window.AUTH_READY = false;       // Auth sudah resolve (PENTING)
  window.currentUser = null;
  window.activeTab = window.activeTab || 'aktif';
  window.currentEditId = null;
  window.isInitialLoading = true;

  console.log("FIREBASE_READY exists:", !!window.FIREBASE_READY);
  console.log("Auth exists:", typeof auth);

  (async () => {
    try {
      // 🔥 Tunggu Firebase init dulu (ANTI undefined & race condition)
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

      // ===== SINGLE GLOBAL AUTH LISTENER (JANGAN DUPLIKAT) =====
      auth.onAuthStateChanged(async (user) => {

        // 🔥 TANDAI AUTH SUDAH RESOLVE (INI KUNCI ANTI FLICKER)
        window.AUTH_READY = true;

        // ===== USER BELUM LOGIN =====
        if (!user) {
          console.log("🚪 User belum login (auth resolved)");

          window.currentUser = null;
          window.APP_READY = true; // ⬅️ PENTING! Bukan false lagi
          window.isInitialLoading = false;

          const path = location.pathname.toLowerCase();
          const isAuthPage =
            path.includes("login") ||
            path.includes("register");

          // Redirect hanya setelah auth benar-benar resolve
          if (!isAuthPage) {
            console.log("➡️ Redirect ke register.html (safe)");
            setTimeout(() => {
              if (!window.currentUser) {
                location.replace("register.html");
              }
            }, 300); // delay kecil anti flicker PWA
          }

          window.dispatchEvent(new Event("app-ready"));
          return;
        }

        // ===== USER SUDAH LOGIN =====
        console.log("✅ User login:", user.uid);

        // Set global user (dipakai semua halaman)
        window.currentUser = user;

        // 🔥 Tunggu IndexedDB siap (anti undefined cache)
        if (window.idbReady) {
          try {
            await window.idbReady;
            console.log("💾 IndexedDB Ready");
          } catch (e) {
            console.warn("⚠️ IndexedDB gagal siap:", e);
          }
        }

        // App benar-benar siap dipakai
        window.APP_READY = true;
        window.isInitialLoading = false;

        console.log("🚀 APP READY (GLOBAL):", user.uid);

        // Broadcast ke semua script halaman
        window.dispatchEvent(new Event("app-ready"));
      });

    } catch (err) {
      console.error("❌ Bootstrap Fatal Error:", err);
    }
  })();
}

// ===== GLOBAL HELPER (ANTI RACE CONDITION) =====
window.waitForUser = async () => {
  // Tunggu auth resolve dulu (bukan langsung APP_READY)
  if (!window.AUTH_READY) {
    await new Promise(res =>
      window.addEventListener("app-ready", res, { once: true })
    );
  }
  return window.currentUser;
};