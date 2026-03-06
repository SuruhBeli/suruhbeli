const CACHE_NAME = "suruhbeli-cache-v1";

const STATIC_ASSETS = [

  "/",
  "index.html",
  "index.css",
  "index.js",

  "logo.png",
  "ikon-192.png",
  "ikon-512.png",

  "home.css",
  "profil.css",
  "aktivitas.css",
  "chatlist.css",
  "order.css",

  "home.js",
  "profil.js",
  "aktivitas.js",
  "chatlist.js",
  "order.js",

  "alert.png",
  "default.png",

  "barang.json",
  "belanja.json",
  "chat-empty.json",
  "loading.json",
  "makanan.json"
];


// INSTALL
self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
    .then(cache => {
      console.log("⚡ caching assets");
      return cache.addAll(STATIC_ASSETS);
    })

  );

  self.skipWaiting();

});


// ACTIVATE
self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys.map(key => {

          if(key !== CACHE_NAME){
            return caches.delete(key);
          }

        })

      );

    })

  );

  self.clients.claim();

});


// FETCH
self.addEventListener("fetch", event => {

  if(event.request.method !== "GET") return;

  event.respondWith(

    caches.match(event.request)
    .then(cacheRes => {

      if(cacheRes){
        return cacheRes;
      }

      return fetch(event.request)
        .then(networkRes => {

          return caches.open(CACHE_NAME)
          .then(cache => {

            cache.put(event.request, networkRes.clone());

            return networkRes;

          });

        });

    })

  );

});