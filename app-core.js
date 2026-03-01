// ===== GLOBAL CORE (LOAD SEKALI) ===== //
if (!window.APP_CORE) {
  window.APP_CORE = true;

  // 🔥 GLOBAL DB (SATU UNTUK SEMUA HALAMAN)
  window.dbIDB = null;
  window.idbReady = new Promise((resolve) => {
    const request = indexedDB.open("chatDB", 2);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("chats")) {
        db.createObjectStore("chats", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("partners")) {
        db.createObjectStore("partners", { keyPath: "uid" });
      }
      if (!db.objectStoreNames.contains("lottieCache")) {
        db.createObjectStore("lottieCache", { keyPath: "name" });
      }
    };

    request.onsuccess = (e) => {
      window.dbIDB = e.target.result;
      console.log("IDB Ready (Global)");
      resolve(true);
    };

    request.onerror = (e) => {
      console.error("IndexedDB Global Error:", e);
      resolve(false);
    };
  });

  // 🔥 GLOBAL CACHE MEMORY
  window.roomCache = {};
  window.messageListeners = {};
  window.statusListeners = {};
  window.typingListeners = {};
}

// ===== GLOBAL LISTENER CLEANUP (ANTI DOBEL REALTIME) ===== //
window.unsubscribeMessages = null;
window.unsubscribeTyping = null;
window.unsubscribeStatus = null;

// Fungsi cleanup universal (dipanggil saat pindah halaman)
window.cleanupPageListeners = function () {
  console.log("🧹 Cleanup listeners...");

  if (window.unsubscribeMessages) {
    window.unsubscribeMessages();
    window.unsubscribeMessages = null;
  }

  if (window.unsubscribeTyping) {
    window.unsubscribeTyping();
    window.unsubscribeTyping = null;
  }

  if (window.unsubscribeStatus) {
    window.unsubscribeStatus();
    window.unsubscribeStatus = null;
  }

  // Reset registry biar tidak dianggap dobel
  window.messageListeners = {};
  window.typingListeners = {};
  window.statusListeners = {};
};