// sw.js - PWA Install Only (No Cache)

// Install event (wajib agar PWA bisa install)
self.addEventListener("install", (event) => {
  console.log("SW: Installed");
  self.skipWaiting(); // langsung aktif tanpa nunggu
});

// Activate event (wajib untuk lifecycle)
self.addEventListener("activate", (event) => {
  console.log("SW: Activated");
  event.waitUntil(self.clients.claim()); // kontrol semua tab
});

// Fetch event TANPA CACHE
self.addEventListener("fetch", (event) => {
  // Biarkan semua request langsung ke network
  // Tidak ada cache sama sekali
  return;
});