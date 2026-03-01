// sw.js - No Cache + Version Control

const VERSION = "v2.12.1"; // GANTI SETIAP UPDATE

self.addEventListener("install", (event) => {
  console.log("SW Installed:", VERSION);
  self.skipWaiting(); // langsung aktif
});

self.addEventListener("activate", (event) => {
  console.log("SW Activated:", VERSION);
  event.waitUntil(self.clients.claim());
});

// Network only (tanpa cache halaman)
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});