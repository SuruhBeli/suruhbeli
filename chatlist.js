// ===== GLOBAL DOM ===== //
const chatListContainer = document.getElementById("chatListContainer");
const selectionBar = document.getElementById("selectionBar");
const selectedCount = document.getElementById("selectedCount");
const cancelSelect = document.getElementById("cancelSelect");
const deleteBtn = document.getElementById("deleteBtn");
const pinBtn = document.getElementById("pinBtn");
const emptyStateEl = document.getElementById("emptyState");

// ===== FLAGS ===== //
let isInitialLoading = true;
let lastMessageIdMap = {};
let unreadMap = {};
let hasAnyChat = false;
let selectionMode = false;
let selectedChats = new Set();
let pinnedRoomId = localStorage.getItem("pinnedRoomId") || null;
let lastReadMap = JSON.parse(localStorage.getItem("lastReadMap") || "{}");
window.roomCache = window.roomCache || {};
window.messageListeners = window.messageListeners || {};

// ===== INIT ===== //
// ===== INIT ===== //
window.addEventListener("app-ready", async () => {
  const currentUser = window.currentUser;
  if (!currentUser) return;

  if (window.unsubscribeRooms) {
    window.unsubscribeRooms();
    window.unsubscribeRooms = null;
  }

  // Status online
  const myStatusRef = rtdb.ref("status/" + currentUser.uid);
  myStatusRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
  myStatusRef.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });

  // ===== LOAD CACHED CHAT DULU ===== //
  await loadCachedChats(); // ini bikin hasAnyChat=true kalau ada chat di cache

  // ===== LISTEN CHAT ROOMS ===== //
  window.unsubscribeRooms = db.collection("chatRooms")
    .where(`participants.${currentUser.uid}`, "==", true)
    .onSnapshot(async snapshot => {
      const rooms = snapshot.docs || [];
      const visibleRooms = rooms.filter(doc => {
        const data = doc.data();
        // pastikan peserta currentUser ada dan belum dihapus
        return data.participants?.[currentUser.uid] && (!data.deletedFor || !data.deletedFor[currentUser.uid]);
      });

      // Hanya render empty state kalau cache kosong + Firebase kosong
      if (!visibleRooms.length && !hasAnyChat) {
        hasAnyChat = false;
        renderEmptyState();
        return;
      }

      hasAnyChat = true;
      removeEmptyState();

      for (const doc of visibleRooms) {
        const roomId = doc.id;
        const data = doc.data();
        const participants = data.participants || {};
        const partnerUid = Object.keys(participants).find(uid => uid !== currentUser.uid);
        if (!partnerUid) continue;

        // render placeholder kalau chat belum ada
        if (!window.roomCache[roomId]) {
          renderChat({
            id: roomId,
            partnerName: "Memuat...",
            initials: "U",
            lastMessage: "Memuat pesan...",
            timestamp: Date.now()
          });
          window.roomCache[roomId] = true;
        }

        // fetch partner info async
        fetchPartner(partnerUid, roomId);

        // listen pesan terbaru
        if (!window.messageListeners[roomId]) {
          const unsubscribeMsg = db.collection("chatRooms")
            .doc(roomId)
            .collection("messages")
            .orderBy("createdAt", "desc")
            .limit(15)
            .onSnapshot(msgSnap => {
              const docs = msgSnap.docs.filter(d => !(d.data().deletedFor?.[currentUser.uid]));
              if (!docs.length) return;
        
              const msg = docs[0].data();
              lastMessageIdMap[roomId] = msg.id;
              const lastMsgText = msg.senderId === currentUser.uid ? `Anda: ${msg.text||"Pesan"}` : msg.text||"Pesan";
              const ts = msg.createdAt?.toDate()?.getTime() || Date.now();
        
              renderChat({ id: roomId, lastMessage: lastMsgText, timestamp: ts });
              saveChat({
                id: roomId,
                partnerName: document.querySelector(`#chat_${roomId} .chat-name`)?.innerText || "User",
                initials: document.querySelector(`#chat_${roomId} .chat-photo`)?.innerText || "U",
                lastMessage: lastMsgText,
                timestamp: ts
              });
        
              // 🔹 update unread dengan logika baru
              if (!selectedChats.has(roomId)) {
                if (!lastReadMap[roomId]) {
                  lastReadMap[roomId] = msg.id; // sinkronisasi pertama kali
                  localStorage.setItem("lastReadMap", JSON.stringify(lastReadMap));
                  unreadMap[roomId] = 0;
                } else {
                  unreadMap[roomId] = lastReadMap[roomId] === msg.id ? 0 : (unreadMap[roomId] || 1);
                }
                updateUnread(roomId);
              }
            });
          window.messageListeners[roomId] = unsubscribeMsg;
        }
      }
      isInitialLoading = false;
    });
});

// ===== LOAD CACHED CHATS ===== //
async function loadCachedChats() {
  if (!window.dbIDB || !window.currentUser) return;

  const tx = window.dbIDB.transaction("chats", "readonly");
  tx.objectStore("chats").getAll().onsuccess = e => {
    const chats = (e.target.result || [])
      .filter(chat => chat.participants?.[window.currentUser.uid])
      .sort((a,b) => (b.timestamp||0) - (a.timestamp||0));

    if (chats.length > 0) hasAnyChat = true;

    chats.forEach(chat => {
      window.roomCache[chat.id] = true;

      // 🔹 Sinkronisasi unread dengan lastReadMap
      if (chat.lastMessage && chat.id) {
        if (!lastReadMap[chat.id]) {
          lastReadMap[chat.id] = chat.id; // asumsi terakhir dibaca sama dengan terakhir di cache
          localStorage.setItem("lastReadMap", JSON.stringify(lastReadMap));
          unreadMap[chat.id] = 0;
        } else {
          unreadMap[chat.id] = lastReadMap[chat.id] === chat.id ? 0 : (unreadMap[chat.id] || 1);
        }
      }

      renderChat(chat);
    });
  };
}

// ===== CACHE CHAT ===== //
window.idbReady?.then(() => loadCachedChats());

function loadCachedChats() {
  if (!window.dbIDB) return;
  const tx = window.dbIDB.transaction("chats", "readonly");
  tx.objectStore("chats").getAll().onsuccess = e => {
    const chats = (e.target.result || []).sort((a,b)=> (b.timestamp||0)-(a.timestamp||0));
    if (chats.length > 0) hasAnyChat = true; // <-- penting
    chats.forEach(chat => {
      window.roomCache[chat.id] = true;
      renderChat(chat);
    });
  };
}

function saveChat(chat) {
  if (!window.dbIDB) return;
  const tx = window.dbIDB.transaction("chats","readwrite");
  tx.objectStore("chats").put(chat);
}

// ===== FETCH PARTNER ===== //
async function fetchPartner(uid, roomId) {
  if (!window.currentUser) return;

  try {
    loadPartnerCache(uid, roomId);

    if (uid === window.currentUser.uid) return;

    let doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) doc = await db.collection("kurir").doc(uid).get();
    const name = doc.exists ? doc.data().name || doc.data().nama || "User" : "User";
    const initials = name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();

    if(window.roomCache[roomId]) {
      renderChat({ id: roomId, partnerName: name, initials });

      // 🔹 pastikan badge unread update
      if (!lastReadMap[roomId] || lastReadMap[roomId] !== lastMessageIdMap[roomId]) {
        unreadMap[roomId] = (unreadMap[roomId] || 0);
        updateUnread(roomId);
      }
    }

    savePartnerCache({ uid, name, initials, online:false, lastSeen:Date.now() });

  } catch(e) { console.error("Partner fetch:", e); }
}
function savePartnerCache(partner) {
  if(!window.dbIDB) return;
  const tx = window.dbIDB.transaction("partners","readwrite");
  tx.objectStore("partners").put(partner);
}
function loadPartnerCache(uid, roomId) {
  if(!window.dbIDB) return;
  const tx = window.dbIDB.transaction("partners","readonly");
  tx.objectStore("partners").get(uid).onsuccess = e => {
    const data = e.target.result;
    if(!data) return;
    renderChat({ id: roomId, partnerName: data.name, initials: data.initials });
    updateOnline(roomId, data.online);
  };
}

// ===== UPDATE UNREAD ===== //
function updateUnread(roomId){
  const badge = document.getElementById("unread_" + roomId);
  if(!badge) return;

  // 🔹 Hitung jumlah unread berdasarkan lastReadMap vs lastMessageIdMap
  if(lastReadMap[roomId] && lastMessageIdMap[roomId]){
    badge.style.display = lastReadMap[roomId] === lastMessageIdMap[roomId] ? "none" : "flex";
    badge.innerText = lastReadMap[roomId] === lastMessageIdMap[roomId] ? "0" : "1";
    // Update unreadMap supaya konsisten
    unreadMap[roomId] = lastReadMap[roomId] === lastMessageIdMap[roomId] ? 0 : 1;
  } else {
    const count = unreadMap[roomId] || 0;
    badge.style.display = count > 0 ? "flex" : "none";
    badge.innerText = count;
  }
}
// ===== INISIALISASI UNREAD SETELAH RELOAD ===== //
function initUnreadBadge(chatId) {
  if(!lastMessageIdMap[chatId]) return 0;
  // jika pesan terakhir sama dengan yang sudah dibaca, badge = 0
  if(lastReadMap[chatId] === lastMessageIdMap[chatId]){
    unreadMap[chatId] = 0;
  } else {
    unreadMap[chatId] = 1; // bisa pakai 1 atau hitung selisih pesan baru
  }
  updateUnread(chatId);
}
function updateOnline(roomId,isOnline){
  const badge=document.getElementById(`online_${roomId}`); if(!badge) return; isOnline?badge.classList.add("active"):badge.classList.remove("active");
}
// ===== RENDER CHAT ===== //
function renderChat(chat) {
  if(chat.participants && !chat.participants[window.currentUser.uid]) return;

  let el = document.getElementById("chat_" + chat.id);

  if(!el){
    el = document.createElement("div");
    el.className = "chat-item";
    el.id = "chat_" + chat.id;
    el.innerHTML = `
      <div class="chat-photo-wrapper" style="position:relative;">
        <div class="chat-photo">${chat.initials||"U"}</div>
        <span class="online-badge" id="online_${chat.id}"></span>
      </div>
      <div class="chat-details">
        <div class="chat-top">
          <div class="chat-name">${chat.partnerName||"Memuat..."}</div>
          <div class="chat-time">${formatTime(chat.timestamp)}</div>
        </div>
        <div class="chat-bottom">
          <div class="chat-last-message" id="msg_${chat.id}">${chat.lastMessage||"Memuat pesan..."}</div>
          <div class="unread-badge" id="unread_${chat.id}">0</div>
        </div>
      </div>
    `;

    let pressTimer;
    el.addEventListener("touchstart", ()=> pressTimer=setTimeout(()=>enterSelectionMode(chat.id),400));
    el.addEventListener("touchend", ()=>clearTimeout(pressTimer));
    el.addEventListener("touchmove", ()=>clearTimeout(pressTimer));

    el.addEventListener("click", ()=>{
      if(selectionMode){ 
        toggleSelect(chat.id, el); 
        return; 
      }
      // 🔹 Simpan last message yang dibaca
      lastReadMap[chat.id] = lastMessageIdMap[chat.id] || "";
      localStorage.setItem("lastReadMap", JSON.stringify(lastReadMap));

      // 🔹 Reset badge
      unreadMap[chat.id] = 0;
      updateUnread(chat.id);

      window.location.href = `chat.html?roomId=${chat.id}`;
    });

    chatListContainer.appendChild(el);
  } else {
    if(chat.partnerName) el.querySelector(".chat-name").innerText = chat.partnerName;
    if(chat.lastMessage) el.querySelector(`#msg_${chat.id}`).innerText = chat.lastMessage;
    if(chat.timestamp) el.querySelector(".chat-time").innerText = formatTime(chat.timestamp);

    if(pinnedRoomId===chat.id) applyPinUI(chat.id);
  }

  // 🔹 INIT UNREAD HANYA SETELAH RENDER CHAT
  initUnreadBadge(chat.id);
}

// ===== EMPTY STATE ===== //
function renderEmptyState(){
  if(!emptyStateEl) return; emptyStateEl.style.display="flex"; chatListContainer.style.display="none";}
function removeEmptyState(){
  if(!emptyStateEl) return; emptyStateEl.style.display="none"; chatListContainer.style.display="block";}
async function loadLottie(name, container){
  // 1. coba ambil dari cache IDB
  const cached = await getLottie(name);
  if(cached){
    lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: cached
    });
  }

  // 2. fetch realtime dari Firestore (jika ada update)
  try {
    const doc = await db.collection("lottie").doc(name).get();
    if(!doc.exists) return;
    const data = doc.data();
    if(!data || !data.json) return;
    saveLottie(name, data.json);
    if(JSON.stringify(data.json) !== JSON.stringify(cached)){
      lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: data.json
      });
    }
  } catch(err){
    console.error("Load lottie error:", err);
  }
}
// panggil saat render empty state
window.addEventListener('load', () => {
  const lottieEl = document.getElementById('emptyLottie');
  loadLottie('chat-empty', lottieEl);
});

// ===== SELECTION MODE ===== //
function enterSelectionMode(roomId){ selectionMode=true; selectionBar?.classList.add("show"); toggleSelect(roomId, document.getElementById("chat_" + roomId)); }
function exitSelectionMode(){ selectionMode=false; selectedChats.clear(); selectionBar?.classList.remove("show"); document.querySelectorAll(".chat-item.selected").forEach(el=>el.classList.remove("selected")); updateSelectionUI();}
function toggleSelect(roomId, el){ if(!selectionMode) return; selectedChats.has(roomId)?(selectedChats.delete(roomId),el.classList.remove("selected")):(selectedChats.add(roomId),el.classList.add("selected")); if(selectedChats.size===0) exitSelectionMode(); updateSelectionUI();}
function updateSelectionUI(){ selectedCount.innerText=`${selectedChats.size} dipilih`; pinBtn.style.display=selectedChats.size===1?"flex":"none"; }
cancelSelect?.addEventListener("click", exitSelectionMode);

// ===== DELETE ===== //
deleteBtn?.addEventListener("click", async ()=>{
  if(selectedChats.size===0) return;
  const confirmDelete = await showPopup(`Hapus pesan dari ${selectedChats.size} chat?`);
  if(!confirmDelete) return;
  const currentUser = window.currentUser;
  if(!currentUser){ await showPopup("User tidak login",{confirm:false}); return; }
  try{
    const batch = db.batch();
    for(const roomId of selectedChats){
      const messagesRef = db.collection("chatRooms").doc(roomId).collection("messages");
      const snapshot = await messagesRef.get();
      snapshot.forEach(msgDoc=>{
        const msgData = msgDoc.data();
        const deletedFor = msgData.deletedFor||{};
        deletedFor[currentUser.uid]=true;
        batch.update(msgDoc.ref,{deletedFor});
      });
      batch.set(db.collection("chatRooms").doc(roomId), {deletedFor:{[currentUser.uid]:true}}, {merge:true});
      if(dbIDB){ const tx=dbIDB.transaction("chats","readwrite"); tx.objectStore("chats").delete(roomId); }
    }
    await batch.commit();
    selectedChats.forEach(roomId=>{ document.getElementById("chat_"+roomId)?.remove(); delete window.roomCache[roomId]; });
    exitSelectionMode();
  } catch(err){ console.error(err); await showPopup("Gagal menghapus pesan",{confirm:false}); }
});

// ===== PIN ===== //
function applyPinUI(roomId){
  const el=document.getElementById("chat_"+roomId); if(!el) return;
  const oldPin = el.querySelector(".pin-badge"); if(oldPin) oldPin.remove();
  const badge=document.createElement("div");
  badge.className="pin-badge"; badge.innerHTML="📌"; badge.style.position="absolute"; badge.style.top="6px"; badge.style.right="10px"; badge.style.fontSize="14px";
  el.style.position="relative"; el.appendChild(badge); chatListContainer.prepend(el);
}
pinBtn?.addEventListener("click", ()=>{
  if(selectedChats.size!==1) return;
  const roomId=[...selectedChats][0]; const el=document.getElementById("chat_"+roomId);
  if(pinnedRoomId===roomId){ pinnedRoomId=null; localStorage.removeItem("pinnedRoomId"); if(el){el.querySelector(".pin-badge")?.remove(); chatListContainer.appendChild(el);} }
  else { pinnedRoomId=roomId; localStorage.setItem("pinnedRoomId",roomId); applyPinUI(roomId); }
  exitSelectionMode();
});

// ===== FORMAT ===== //
function formatTime(ts){ if(!ts) return "--:--"; return new Date(ts).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});}
function formatLastSeen(ts){ if(!ts) return "Offline"; const diff=Date.now()-ts; const min=Math.floor(diff/60000); if(min<1)return"Online"; if(min<60) return `${min} menit lalu`; return `${Math.floor(min/60)} jam lalu`;}

// ===== POPUP ===== //
function showPopup(message, options={confirm:true}){ return new Promise(resolve=>{ const modal=document.getElementById("popupModal"); const msgEl=document.getElementById("popupMessage"); const btnConfirm=document.getElementById("popupConfirm"); const btnCancel=document.getElementById("popupCancel"); msgEl.innerText=message; modal.style.display="flex"; btnConfirm.style.display=options.confirm?"inline-block":"none"; btnConfirm.onclick=()=>{modal.style.display="none"; resolve(true);}; btnCancel.onclick=()=>{modal.style.display="none"; resolve(false);}; if(!options.confirm){ modal.onclick=(e)=>{ if(e.target===modal){ modal.style.display="none"; resolve(true); }}}});}

// ===== THEME ===== //
function loadTheme(){ const savedTheme=localStorage.getItem("themeMode"); savedTheme==="dark"?document.body.classList.add("dark-mode"):document.body.classList.remove("dark-mode"); }
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
/* =====================================================
   🔥 BACK CONTROL CHATLIST → LANGSUNG KE INDEX
   - No history stack
   - No loop
   - Nyambung dengan index root lock
===================================================== */
(function () {
  const page = window.location.pathname.split("/").pop();

  if (page === "profil.html") {

    // Bersihkan history lama
    history.replaceState(null, "", location.href);

    // Tambah state dummy supaya back bisa ditangkap
    history.pushState({ profil: true }, "", location.href);

    window.addEventListener("popstate", function () {

      // Paksa langsung ke index TANPA history
      window.location.replace("index.html");

    });

    console.log("🔁 Profil locked: Back → Index");
  }
})();