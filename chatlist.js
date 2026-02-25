// ===== Firebase Config =====
firebase.initializeApp({
  apiKey: "AIzaSyByQl0BXZoSMzrULUNA6l7UVFQjXmvsdJE",
  authDomain: "suruhbeli-e8ae8.firebaseapp.com",
  projectId: "suruhbeli-e8ae8",
  databaseURL: "https://suruhbeli-e8ae8-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = firebase.firestore();
const auth = firebase.auth();
const rtdb = firebase.database();
const chatListContainer = document.getElementById("chatListContainer");

let dbIDB;
let statusListeners = {};
let messageListeners = {};
let typingListeners = {};
let lastMessageIdMap = {};
let unreadMap = {};
let roomCache = {}; // cache biar tidak render ulang berat
let lastReadMap = JSON.parse(localStorage.getItem("lastReadMap") || "{}");

// ===== IndexedDB =====
const request = indexedDB.open("chatDB", 2);
request.onupgradeneeded = e => {
  dbIDB = e.target.result;

  if (!dbIDB.objectStoreNames.contains("chats")) {
    dbIDB.createObjectStore("chats", { keyPath: "id" });
  }

  // 🔥 Store khusus partner (nama + inisial + status)
  if (!dbIDB.objectStoreNames.contains("partners")) {
    dbIDB.createObjectStore("partners", { keyPath: "uid" });
  }
};
request.onsuccess = e => {
  dbIDB = e.target.result;
  loadCachedChats();
};

// ===== FORMAT =====
function formatTime(ts) {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLastSeen(ts) {
  if (!ts) return "Offline";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Online";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

// ===== RENDER CHAT (SUPER LIGHT) =====
function renderChat(chat) {
  let el = document.getElementById("chat_" + chat.id);

  if (!el) {
    el = document.createElement("div");
    el.className = "chat-item";
    el.id = "chat_" + chat.id;

    el.innerHTML = `
      <div class="chat-photo-wrapper" style="position:relative;">
        <div class="chat-photo">${chat.initials || "U"}</div>
        <span class="online-badge" id="online_${chat.id}"></span>
      </div>
    
      <div class="chat-details">
        <div class="chat-top">
          <div class="chat-name">${chat.partnerName || "Memuat..."}</div>
          <div class="chat-time">${formatTime(chat.timestamp)}</div>
        </div>
    
        <div class="chat-bottom">
          <div class="chat-last-message" id="msg_${chat.id}">
            ${chat.lastMessage || "Memuat pesan..."}
          </div>
          <div class="unread-badge" id="unread_${chat.id}">0</div>
        </div>
      </div>
    `;

    el.onclick = () => {
      const lastMsgId = lastMessageIdMap[chat.id];
      
      if (lastMsgId) {
        lastReadMap[chat.id] = lastMsgId;
        localStorage.setItem("lastReadMap", JSON.stringify(lastReadMap));
      }
    
      unreadMap[chat.id] = 0;
      updateUnread(chat.id);
      window.location.href = `chat.html?roomId=${chat.id}`;
    };

    // append lebih ringan dari prepend (anti lag di Android)
    chatListContainer.appendChild(el);
  } else {
    if (chat.partnerName) {
      el.querySelector(".chat-name").innerText = chat.partnerName;
    }
    if (chat.lastMessage) {
      const msgEl = el.querySelector(`#msg_${chat.id}`);
      if (msgEl && msgEl.innerText !== "Sedang mengetik...") {
        msgEl.innerText = chat.lastMessage;
        msgEl.style.fontStyle = "normal";
      }
    }
    if (chat.timestamp) {
      el.querySelector(".chat-time").innerText = formatTime(chat.timestamp);
    }
  }
}

function updateOnline(roomId, isOnline) {
  const badge = document.getElementById(`online_${roomId}`);
  if (!badge) return;

  if (isOnline) {
    badge.classList.add("active"); // tampilkan titik hijau
  } else {
    badge.classList.remove("active"); // sembunyikan
  }
}

function updateUnread(roomId) {
  const badge = document.getElementById(`unread_${roomId}`);
  if (!badge) return;

  const count = unreadMap[roomId] || 0;
  if (count > 0) {
    badge.style.display = "flex";
    badge.innerText = count;
  } else {
    badge.style.display = "none";
  }
}

// ===== CACHE =====
function loadCachedChats() {
  if (!dbIDB) return;

  const tx = dbIDB.transaction("chats", "readonly");
  const store = tx.objectStore("chats");
  const req = store.getAll();

  req.onsuccess = () => {
    const chats = (req.result || [])
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    chats.forEach(chat => {
      roomCache[chat.id] = true;
      renderChat(chat);
    });
  };

  req.onerror = (err) => {
    console.error("Load cache error:", err);
  };
}

function saveChat(chat) {
  if (!dbIDB) return;
  const tx = dbIDB.transaction("chats", "readwrite");
  tx.objectStore("chats").put(chat);
}

// ===== CACHE PARTNER ===== //
function savePartnerCache(partner) {
  if (!dbIDB) return;
  const tx = dbIDB.transaction("partners", "readwrite");
  tx.objectStore("partners").put(partner);
}
function loadPartnerCache(uid, roomId) {
  if (!dbIDB) return;

  const tx = dbIDB.transaction("partners", "readonly");
  const store = tx.objectStore("partners");
  const req = store.get(uid);

  req.onsuccess = () => {
    const data = req.result;
    if (!data) return;

    renderChat({
      id: roomId,
      partnerName: data.name,
      initials: data.initials
    });

    updateOnline(roomId, data.online);
  };
}
// ===== FETCH PARTNER NON-BLOCKING =====
async function fetchPartner(partnerUid, roomId) {
  try {
    // ⚡ 1. LOAD CACHE DULU (INSTANT)
    loadPartnerCache(partnerUid, roomId);

    // ⚡ 2. FETCH REALTIME (BACKGROUND)
    let doc = await db.collection("users").doc(partnerUid).get();
    if (!doc.exists) {
      doc = await db.collection("kurir").doc(partnerUid).get();
    }

    const name = doc.exists
      ? doc.data().name || doc.data().nama || "User"
      : "User";

    const initials = name
      .split(" ")
      .map(n => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    // Update UI tanpa flicker
    renderChat({
      id: roomId,
      partnerName: name,
      initials: initials
    });

    // 🔥 SAVE KE CACHE (BIAR NEXT LOAD INSTAN)
    savePartnerCache({
      uid: partnerUid,
      name: name,
      initials: initials,
      online: false,
      lastSeen: Date.now()
    });

  } catch (err) {
    console.error("Partner fetch error:", err);
  }
}

// ===== AUTH =====
auth.onAuthStateChanged(user => {
  if (!user) return location.href = "register.html";

  const currentUser = user;

  // 🔥 STATUS SENDIRI (INSTANT)
  const myStatusRef = rtdb.ref("status/" + currentUser.uid);
  myStatusRef.set({
    online: true,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  });
  myStatusRef.onDisconnect().set({
    online: false,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  });

  // ===== LOAD CHAT ROOMS (ULTRA FAST) =====
  db.collection("chatRooms")
    .where(`participants.${currentUser.uid}`, "==", true)
    .onSnapshot(snapshot => {

      snapshot.docChanges().forEach(change => {
        const docSnap = change.doc;
        const roomId = docSnap.id;
        const data = docSnap.data();
        const participants = data.participants || {};

        const partnerUid = Object.keys(participants)
          .find(uid => uid !== currentUser.uid);
        if (!partnerUid) return;

        // ⚡ RENDER CEPAT (tidak tunggu apapun)
        if (!roomCache[roomId]) {
          renderChat({
            id: roomId,
            partnerName: "Memuat...",
            initials: "U",
            lastMessage: "Memuat pesan...",
            timestamp: Date.now()
          });
          roomCache[roomId] = true;
        }

        // ⚡ LISTENER STATUS (PRIORITAS)
        if (!statusListeners[partnerUid]) {
          const statusRef = rtdb.ref("status/" + partnerUid);
          statusRef.on("value", snap => {
            const val = snap.val() || {};
            const isOnline = val.online === true;
            const lastSeen = val.lastSeen || Date.now();
          
            updateOnline(roomId, isOnline);
          
            // 🔥 SAVE STATUS KE CACHE (BIAR INSTAN SAAT BUKA APP)
            savePartnerCache({
              uid: partnerUid,
              name: document.querySelector(`#chat_${roomId} .chat-name`)?.innerText || "User",
              initials: document.querySelector(`#chat_${roomId} .chat-photo`)?.innerText || "U",
              online: isOnline,
              lastSeen: lastSeen
            });
          });
          statusListeners[partnerUid] = true;
        }

        // ⚡ FETCH NAMA (BACKGROUND, NON BLOCK UI)
        fetchPartner(partnerUid, roomId);

        // ⚡ LAST MESSAGE REALTIME (WA STYLE + DELETE SAFE + ANDA:)
        if (!messageListeners[roomId]) {
          db.collection("chatRooms")
            .doc(roomId)
            .collection("messages")
            .orderBy("createdAt", "desc")
            .limit(15) // aman untuk deleteForMe & deleteEveryone
            .onSnapshot(msgSnap => {
        
              if (msgSnap.empty) {
                renderChat({
                  id: roomId,
                  lastMessage: "Belum ada pesan",
                  timestamp: Date.now()
                });
                return;
              }
        
let lastVisibleMessage = null;

// 🔥 Cari pesan terakhir yang visible untuk user (WA STYLE)
msgSnap.docs.forEach(doc => {
  if (lastVisibleMessage) return;

  const msg = doc.data();

  // ❌ Kalau di delete for me → benar-benar disembunyikan
  const deletedForMe =
    msg.deletedFor && msg.deletedFor[currentUser.uid] === true;

  if (deletedForMe) return;

  // ✅ Deleted for everyone tetap dihitung sebagai last message
  lastVisibleMessage = msg;
});
        
              // Jika semua pesan kehapus
if (!lastVisibleMessage) {
  renderChat({
    id: roomId,
    lastMessage: "Belum ada pesan",
    timestamp: Date.now()
  });
  return;
}

const msg = lastVisibleMessage;
              const isMe = msg.senderId === currentUser.uid;
        
              // ===== FORMAT ISI PESAN (WA STYLE) =====
              let content = "Pesan";
        
              if (msg.deleted === true) {
                content = "Pesan telah dihapus";
              } else if (msg.text) {
                content = msg.text;
              } else if (msg.imageUrl) {
                content = "📷 Foto";
              } else if (msg.sticker) {
                content = "Sticker";
              } else if (msg.audioUrl) {
                content = "🎤 Voice note";
              }
        
              // 🔥 PREFIX "Anda:" JIKA PESAN SENDIRI
              const lastMsg = isMe ? `Anda: ${content}` : content;
        
              const ts = msg.createdAt?.toDate()?.getTime() || Date.now();
        
              // ===== UNREAD COUNT (hanya kalau bukan pesan sendiri) =====
              const currentMessageId = msgSnap.docs[0].id;
              
              const alreadyRead =
                lastReadMap[roomId] &&
                lastReadMap[roomId] === currentMessageId;
              
              if (
                !alreadyRead &&
                lastMessageIdMap[roomId] !== currentMessageId &&
                !isMe &&
                !msg.deleted &&
                !(msg.deletedFor && msg.deletedFor[currentUser.uid])
              ) {
                unreadMap[roomId] = 1;
              } else {
                unreadMap[roomId] = 0;
              }
              
              updateUnread(roomId);
              lastMessageIdMap[roomId] = currentMessageId;
        
              // ===== RENDER UI =====
              renderChat({
                id: roomId,
                lastMessage: lastMsg,
                timestamp: ts
              });
        
              // ===== SAVE CACHE (BIAR BUKA APP CEPAT) =====
              saveChat({
                id: roomId,
                partnerName:
                  document.querySelector(`#chat_${roomId} .chat-name`)?.innerText || "User",
                initials:
                  document.querySelector(`#chat_${roomId} .chat-photo`)?.innerText || "U",
                lastMessage: lastMsg,
                timestamp: ts
              });
            });
        
          messageListeners[roomId] = true;
        }

        // ⚡ TYPING INDICATOR (FIX BUG STUCK)
        if (!typingListeners[roomId]) {
          const typingRef = rtdb.ref(`typing/${roomId}/${partnerUid}`);
          typingRef.on("value", snap => {
            const typing = snap.val() === true;
            const msgEl = document.getElementById(`msg_${roomId}`);
            if (!msgEl) return;

            if (typing) {
              msgEl.innerText = "Sedang mengetik...";
              msgEl.style.fontStyle = "italic";
            } else {
              msgEl.style.fontStyle = "normal";
            }
          });
          typingListeners[roomId] = true;
        }

      });
    });
});

//SINKRON TEMA 
function loadTheme(){
  const savedTheme = localStorage.getItem("themeMode");
  if(savedTheme === "dark"){
    document.body.classList.add("dark-mode");
  }else{
    document.body.classList.remove("dark-mode");
  }
}

// Jalankan saat halaman selesai load
window.addEventListener("load", loadTheme);

/* === NAVBAR BAWAH === */
const navItems = document.querySelectorAll('.nav-item');
const navCircle = document.getElementById('navCircle');
document.querySelector('.navbar-bottom')
  .classList.toggle('gempa-mode');
  
function updateNavCircle(activeIndex) {
  const activeItem = navItems[activeIndex];
  if (!activeItem || !navCircle) return;

  // Hitung posisi center ikon relatif ke navbar
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

// Inisialisasi tab aktif sesuai URL
let currentPage = window.location.pathname.split("/").pop() || 'index.html';
navItems.forEach((item, idx) => {
  if (item.dataset.href === currentPage) {
    item.classList.add('active');
    updateNavCircle(idx);
  }

  // Event klik
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    updateNavCircle(idx);

    setTimeout(() => {
      window.location.href = item.dataset.href;
    }, 250); // animasi bulatan selesai dulu
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
