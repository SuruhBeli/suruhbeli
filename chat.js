
 // === DOMS === //
  const chatContainer = document.getElementById("chatContainer");
  const input = document.getElementById("messageInput");
  const inputBox = document.querySelector(".input-box");
  const inputContainer = document.querySelector('.input-container');
  const countEl = document.getElementById("selectionCount");
  const headerName = document.getElementById("headerName");
  const partnerPhoto = document.getElementById("partnerPhoto");
  const replyPopup = document.getElementById("replyPopup");
  const replyTextEl = document.getElementById("replyText");
  const cancelReplyBtn = document.getElementById("cancelReplyBtn");
  const scrollBtn = document.getElementById("scrollToBottomBtn");
  const emojiBtn = document.getElementById("emojiBtn");
  const emojiPopup = document.getElementById("emojiPopup");
  const header = document.querySelector('.header');
  const inputBar = document.querySelector('.input-container');
  
  // === FLAG GLOBAL === //
  let preventAutoScroll = false;
  let longPressTimer;
  let selectedMessages = new Set();
  let actionBar = null;
  let currentUser = null;
  let otherUserId = null;
  let lastMessageDate = null;
  let typingRefGlobal = null;
  let typingInputHandler = null;
  // === GLOBAL REGISTRY LISTENER (WAJIB) === //
  window.messageListeners = window.messageListeners || {};
  let replyState = {
    active: false,
    messageId: null,
    text: ""
  };
  
  // ===== ROOM ===== //
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');

  if(!roomId){
    alert("Room ID tidak ditemukan!");
    window.location.href = "chatlist.html";
  }

// ===== LOGIN CEK ===== //
(async () => {
  currentUser = await window.waitForUser();  // <- ini di sini
  if (!currentUser) {
    window.location.href = "register.html";
    return;
  }

  await window.idbReady;  // tunggu IndexedDB siap

  // 🔥 Bersihkan listener lama (kalau SPA/pindah room)
  if (window.cleanupPageListeners) {
    window.cleanupPageListeners();
  }

  // Inisialisasi fitur chat
  setupTypingIndicator();
  loadChatRoomInfo();
  setupOnlineStatus();
  loadCachedMessagesIDB();
  setupRealtimeMessagesSafe();
  markAsDeliveredRealtime();
  markAsReadRealtime();
})();
// ===== ONLINE STATUS ===== //
function setupOnlineStatus() {
  if(!currentUser) return;

  const userStatusRef = rtdb.ref("status/" + currentUser.uid);

  // Function untuk set online
  function goOnline() {
    userStatusRef.set({
      online: true,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // Pas user disconnect / tutup tab → otomatis offline
  userStatusRef.onDisconnect().set({
    online: false,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  });

  // Set online pertama kali load
  goOnline();

  // Update online saat tab kembali aktif
  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState === "visible"){
      goOnline();
    }
  });
}

// ===== TYPING INDICATOR (REALTIME - CLEAN & SAFE) ===== //
function setupTypingIndicator(){
  if(!currentUser || !roomId || !input) return;

  // 🔥 Hindari setup dobel
  if(typingRefGlobal) return;

  const typingRef = rtdb.ref(`typing/${roomId}/${currentUser.uid}`);
  typingRefGlobal = typingRef;

  // Handler disimpan biar bisa di-remove saat cleanup
  typingInputHandler = () => {
    // Set sedang mengetik
    typingRef.set(true);

    // Reset timer biar realtime & tidak spam
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      typingRef.set(false);
    }, 1200);
  };

  input.addEventListener("input", typingInputHandler);

  // 🔥 Auto stop typing jika tab disembunyikan (lebih modern dari beforeunload)
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState !== "visible"){
      typingRef.set(false);
    }
  });

  // 🔥 Backup jika halaman benar-benar ditutup
  window.addEventListener("beforeunload", cleanupTyping);
}
// ===== CLEANUP ROOM (ANTI MEMORY LEAK & FIRESTORE STORM) ===== //
function cleanupTyping(){
  if(typingRefGlobal){
    typingRefGlobal.set(false);
  }
  clearTimeout(window.typingTimeout);
}

function cleanupRoomListeners(){
  // 1. Stop typing
  cleanupTyping();

  // 2. 🔥 STOP REALTIME GLOBAL (ANTI FIRESTORE STORM)
  if (window.unsubscribeMessages) {
    window.unsubscribeMessages();
    window.unsubscribeMessages = null;
  }

  // 3. Reset registry room
  if (roomId && window.messageListeners && window.messageListeners[roomId]) {
    delete window.messageListeners[roomId];
  }

  // 4. Remove input listener (ANTI DUPLIKAT)
  if (input && typingInputHandler) {
    input.removeEventListener("input", typingInputHandler);
    typingInputHandler = null;
  }

  // 5. Reset typing ref
  typingRefGlobal = null;

  console.log("🧹 Room listeners cleaned:", roomId);
}

// 🔥 Saat user keluar halaman / pindah halaman navbar SPA
window.addEventListener("beforeunload", cleanupRoomListeners);

// 🔥 Jika kamu pakai navigasi tanpa reload (app modern)
window.addEventListener("pagehide", cleanupRoomListeners);
// ===== CHAT ROOM INFO =====
function loadChatRoomInfo() {
    db.collection("chatRooms").doc(roomId).get()
      .then(roomDoc => {
        if(!roomDoc.exists) return;
        const roomData = roomDoc.data();
        otherUserId = Object.keys(roomData.participants || {}).find(uid => uid !== currentUser.uid);
        if(!otherUserId) return;

        // ===== 1. Cache partner dulu =====
        let cachedPartner = localStorage.getItem("partner_" + otherUserId);
        let userName = "User", initials = "U";
        if(cachedPartner){
          cachedPartner = JSON.parse(cachedPartner);
          userName = cachedPartner.nama;
          initials = cachedPartner.initials;
        }

        // ===== 2. Render instan =====
        document.getElementById("headerName").innerText = userName;
        document.getElementById("partnerPhoto").innerText = initials;

        // ===== 3. Ambil update Firestore =====
        (async () => {
          let userDoc = await db.collection("users").doc(otherUserId).get();
          if(!userDoc.exists) userDoc = await db.collection("kurir").doc(otherUserId).get();

          const latestName = userDoc.exists ? userDoc.data().nama || "User" : "User";
          const latestInitials = latestName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

          if(latestName !== userName){
            userName = latestName;
            initials = latestInitials;
            document.getElementById("headerName").innerText = userName;
            document.getElementById("partnerPhoto").innerText = initials;
            localStorage.setItem("partner_" + otherUserId, JSON.stringify({ nama:userName, initials }));
          }
        })();

        // ===== 4. Online status realtime =====
        const headerStatus = document.getElementById("headerStatus");  
        const statusCacheKey = "status_" + otherUserId;  
        
        // Tampilkan cache dulu
        const cachedStatus = localStorage.getItem(statusCacheKey);  
        if(cachedStatus){  
          const status = JSON.parse(cachedStatus);  
          headerStatus.innerHTML = status.online  
            ? '<span class="online-dot"></span>Online'  
            : `<span class="offline-dot"></span>Offline (Terakhir: ${new Date(status.lastSeen).toLocaleTimeString()})`;  
        }
        
        // Listener realtime partner
        rtdb.ref("status/" + otherUserId).on("value", snapshot => {  
          const status = snapshot.val();  
          if(status){  
            headerStatus.innerHTML = status.online  
              ? '<span class="online-dot"></span>Online'  
              : `<span class="offline-dot"></span>Offline (Terakhir: ${new Date(status.lastSeen).toLocaleTimeString()})`;  
            localStorage.setItem(statusCacheKey, JSON.stringify(status));  
          }  
        });
      })
      .catch(err=>console.error("Gagal load chat room info:", err));
  }
document.getElementById("backBtn").addEventListener("click", ()=>{
  window.location.href = "chatlist.html";
});

// ===== LOAD PARTNER ===== //
function loadCachedPartner(){
  if(!otherUserId) return;
  const cache = localStorage.getItem("partner_"+otherUserId);
  if(!cache) return;

  const data = JSON.parse(cache);
  headerName.innerText = data.nama;
  partnerPhoto.innerText = data.initials;
}

// ===== LOAD MESSAGES =====
function loadCachedMessages() {
    let cached = localStorage.getItem("chat_" + roomId);
    if(!cached) return;
    cached = JSON.parse(cached);
    renderMessages({
      forEach: (callback) => cached.forEach(msg => callback({ id: msg.id, data: () => msg }))
    });
  }

// ===== REALTIME MESSAGES =====
function setupRealtimeMessagesSafe() {
  if (!roomId || !currentUser) return;

  // 🧠 Cegah listener dobel per room
  if (window.messageListeners && window.messageListeners[roomId]) {
    console.log("⚠️ Listener sudah aktif untuk room:", roomId);
    return;
  }

  const ref = db.collection("chatRooms")
    .doc(roomId)
    .collection("messages")
    .orderBy("localCreatedAt");

  // 🔥 SIMPAN KE GLOBAL (BUKAN LOCAL)
  window.unsubscribeMessages = ref.onSnapshot(snapshot => {

    console.log("📡 Realtime aktif:", roomId); // debug aman

    snapshot.docChanges().forEach(change => {
      const doc = change.doc;
      const data = { id: doc.id, ...doc.data() };

      // Skip jika dihapus untuk user ini
      if (data.deletedFor && data.deletedFor[currentUser.uid]) return;

      if (change.type === "added") {
        appendSingleMessage(data);
      }

      if (change.type === "modified") {
        updateSingleMessage(data);
      }

      if (change.type === "removed") {
        removeSingleMessage(doc.id);
      }
    });

  }, error => {
    console.error("Realtime error:", error);
  });

  // 🧠 Tandai registry global
  window.messageListeners = window.messageListeners || {};
  window.messageListeners[roomId] = true;
}
function appendSingleMessage(data) {
  // 🔥 1. Cek apakah sudah ada message asli
  if (document.querySelector(`[data-id="${data.id}"]`)) return;

  // 🔥 2. HAPUS temp message kalau ada (biar tidak dobel)
  const tempEl = document.querySelector(`[data-id^="temp_"][data-sender-id="${data.senderId}"]`);
  if (tempEl) {
    const row = tempEl.closest(".message-row");
    if (row) row.remove();
  }

  // 🔥 3. Render pakai engine utama (bukan div sederhana)
  renderMessages({
    forEach: (cb) => {
      cb({
        id: data.id,
        data: () => data
      });
    }
  }, { appendOnly: true });

  // 🔥 4. Save cache biar load instant
  saveMessageToCache(data);
  saveMessagesToIDB([{ ...data, roomId }]);
}
function updateSingleMessage(data) {
  const oldMsg = document.querySelector(`[data-id="${data.id}"]`);
  if (!oldMsg) return;

  // Hapus row parent (biar render ulang bersih)
  const row = oldMsg.closest(".message-row");
  if (row) row.remove();

  // Render ulang 1 pesan dengan state terbaru
  renderMessages({
    forEach: (cb) => {
      cb({
        id: data.id,
        data: () => data
      });
    }
  }, { appendOnly: true });

  // Update cache
  saveMessageToCache(data);
}
function removeSingleMessage(id) {
  const msgEl = document.querySelector(`[data-id="${id}"]`);
  if (!msgEl) return;

  const row = msgEl.closest(".message-row");
  if (row) row.remove();
}

// ===== LONG PRESS AND POPUP ACTION ===== //
function showSelectionPopup() {
  // Kalau sudah ada → hanya update counter
  if(actionBar){
    updateSelectionCount();
    return;
  }

  actionBar = document.createElement('div');
  actionBar.classList.add('selection-popup');

  // ===== LEFT SIDE (BACK + COUNT) =====
  const leftDiv = document.createElement('div');
  leftDiv.style.display = 'flex';
  leftDiv.style.alignItems = 'center';
  leftDiv.style.gap = '8px';

  // Tombol batalkan ⬅️
  const cancelBtn = document.createElement('button');
  cancelBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#FB923C">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>`;
  cancelBtn.addEventListener('click', e => {
    e.stopPropagation();
    clearSelection();
  });

  // 🔥 COUNTER ANGKA (WA STYLE)
  const countText = document.createElement('span');
  countText.id = "selectionCount";
  countText.style.fontWeight = '600';
  countText.style.fontSize = '16px';
  countText.style.color = '#333';
  countText.textContent = selectedMessages.size;

  leftDiv.appendChild(cancelBtn);
  leftDiv.appendChild(countText);

  // ===== RIGHT SIDE (COPY + DELETE) =====
  const rightDiv = document.createElement('div');
  rightDiv.style.display = 'flex';
  rightDiv.style.gap = '8px';

  // Tombol salin 📋
  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#FB923C">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  copyBtn.addEventListener('click', e=>{
    e.stopPropagation();
    const texts = Array.from(selectedMessages)
      .filter(msgEl => !msgEl.classList.contains('deleted'))
      .map(msgEl => msgEl.dataset.text || '')
      .join('\n');

    if(texts){
      navigator.clipboard.writeText(texts);
      if(navigator.vibrate) navigator.vibrate(10);
    }

    clearSelection();
  });

  // Tombol hapus 🗑 (FINAL WA SYSTEM)
  const delBtn = document.createElement('button');
  delBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#FB923C">
      <path d="M3 6h18M9 6v12m6-12v12M5 6l1 14h12l1-14"/>
    </svg>`;
  delBtn.addEventListener('click', e=>{
    e.stopPropagation();
    showDeleteOptions(); // 🔥 sekarang pakai popup pilihan WA
  });

  rightDiv.appendChild(copyBtn);
  rightDiv.appendChild(delBtn);

  actionBar.appendChild(leftDiv);
  actionBar.appendChild(rightDiv);
  document.body.appendChild(actionBar);

  // tampilkan animasi
  requestAnimationFrame(()=> actionBar.classList.add('show'));

  // update jumlah pertama
  updateSelectionCount();
}
function updateSelectionCount(){
  if(!actionBar) return;
  if(!countEl) return;
  const count = selectedMessages.size;
  countEl.textContent = count;
  // Auto vibrate kecil biar kerasa UX premium
  if(navigator.vibrate && count > 0){
    navigator.vibrate(5);
  }
}
function clearSelection() {
  selectedMessages.forEach(msgEl => msgEl.classList.remove('selected'));
  selectedMessages.clear();
  if(actionBar){
    actionBar.classList.remove('show');
    setTimeout(()=> { actionBar.remove(); actionBar=null; }, 200);
  }
}
function showDeleteOptions(){
  if(selectedMessages.size === 0) return;
  // Cek apakah ada pesan orang lain (biar tombol everyone hilang)
  let hasOtherUserMsg = false;
  selectedMessages.forEach(msgEl=>{
    if(msgEl.dataset.senderId !== currentUser.uid){
      hasOtherUserMsg = true;
    }
  });

  // Overlay (background gelap)
  const overlay = document.createElement("div");
  overlay.className = "delete-overlay";

  // Popup box (tengah layar)
  const popup = document.createElement("div");
  popup.className = "delete-popup";

  // Hitung jumlah pesan yang dipilih
  const selectedCount = selectedMessages.size;
  
  // Format teks (1 pesan / 2 pesan / 10 pesan)
  const titleText = selectedCount === 1 
    ? `Hapus ${selectedCount} pesan?`
    : `Hapus ${selectedCount} pesan?`;
  
  popup.innerHTML = `
    <div class="delete-header">
      <div class="delete-title">Hapus ${selectedMessages.size} pesan?</div>
  
      <div class="delete-actions">
        <button class="delete-btn delete-me" id="deleteMeBtn">
          Hapus untuk saya
        </button>
  
        ${hasOtherUserMsg ? "" : `
        <button class="delete-btn delete-everyone" id="deleteEveryoneBtn">
          Hapus untuk semua
        </button>
        `}
  
        <button class="delete-btn delete-cancel" id="cancelDeleteBtn">
          Batal
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // ===== CLICK OUTSIDE = CLOSE (UX MODERN) =====
  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay){
      closeDeletePopup(overlay);
    }
  });

  // Prevent klik dalam popup agar tidak close
  popup.addEventListener("click", (e)=>{
    e.stopPropagation();
  });

  // Tombol batal
  document.getElementById("cancelDeleteBtn").onclick = ()=>{
    closeDeletePopup(overlay);
  };

  // Delete for me
  document.getElementById("deleteMeBtn").onclick = ()=>{
    deleteForMe();
    closeDeletePopup(overlay);
  };

  // Delete for everyone (jika ada)
  const delEveryoneBtn = document.getElementById("deleteEveryoneBtn");
  if(delEveryoneBtn){
    delEveryoneBtn.onclick = ()=>{
      deleteForEveryone();
      closeDeletePopup(overlay);
    };
  }
}
function closeDeletePopup(overlay){
  overlay.style.opacity = "0";
  overlay.style.transition = "0.15s ease";
  setTimeout(()=>{
    overlay.remove();
  },150);
}
function deleteForMe(){
  selectedMessages.forEach(msgEl=>{
    const msgId = msgEl.dataset.id;

    // animasi fade
    msgEl.classList.add("deleting");

    setTimeout(()=>{
      msgEl.remove();
    },200);

    // simpan flag di firestore
    db.collection("chatRooms")
      .doc(roomId)
      .collection("messages")
      .doc(msgId)
      .update({
        [`deletedFor.${currentUser.uid}`]: true
      });
  });
  if(navigator.vibrate) navigator.vibrate(10);
  clearSelection();
}
function deleteForEveryone(){
  selectedMessages.forEach(msgEl=>{
    // BLOCK kalau bukan pesan sendiri
    if(msgEl.dataset.senderId !== currentUser.uid){
      if(navigator.vibrate) navigator.vibrate([20,50,20]);
      return;
    }

    const msgId = msgEl.dataset.id;

    // animasi fade WA
    msgEl.classList.add("deleting");

    setTimeout(()=>{
      msgEl.classList.remove("deleting");
      msgEl.classList.add("deleted");
    },180);

    // update database global
    db.collection("chatRooms")
      .doc(roomId)
      .collection("messages")
      .doc(msgId)
      .update({
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deletedBy: currentUser.uid
      });
  });

  if(navigator.vibrate) navigator.vibrate([10,30,10]);
  clearSelection();
}
// ===== CANCEL SELECTION KLIK AREA LUAR CHAT ===== //
document.addEventListener('click', e=>{
  if(selectedMessages.size === 0) return;

  const clickedMessage = e.target.closest('.message');
  const clickedActionBar = e.target.closest('.selection-popup');
  
  // jangan cancel kalau sedang long press mode
  if(e.target.closest('.message-row')) return;
  
  // Jika klik bubble lain → JANGAN batal (biar bisa multi select)
  if(clickedMessage) return;
  
  // Jika klik action bar → JANGAN batal
  if(clickedActionBar) return;

  // Baru batal kalau klik area kosong
  clearSelection();
});
function enableLongPressSelection() {
  document.querySelectorAll('.message-row').forEach(rowEl => {
    if (rowEl.dataset.listener === "true") return;
    rowEl.dataset.listener = "true";

    const msgEl = rowEl.querySelector('.message');
    if(!msgEl) return;

    // Ambil text untuk reply/copy
    const divs = msgEl.querySelectorAll('div');
    let messageText = "";
    if(divs.length >= 3){
      messageText = divs[divs.length - 2].innerText;
    } else if(divs.length === 2){
      messageText = divs[0].innerText;
    }
    msgEl.dataset.text = messageText;

    let startX = 0, startY = 0, currentX = 0;
    let isSwiping = false, moved = false, longPressTriggered = false, touchStarted = false;
    const MAX_SWIPE = 120, REPLY_THRESHOLD = 60, LONG_PRESS_DELAY = 400;

    // Toggle select
    const toggleSelect = () => {
      longPressTriggered = true;
      const isSelected = msgEl.classList.toggle('selected');
      if(isSelected) selectedMessages.add(msgEl);
      else selectedMessages.delete(msgEl);

      if(selectedMessages.size > 0) showSelectionPopup();
      else clearSelection();

      if(navigator.vibrate) navigator.vibrate(8);
    };

    // Tap saat mode select
    msgEl.addEventListener('click', (e) => {
      if(selectedMessages.size > 0 && !isSwiping){
        e.stopPropagation();
        toggleSelect();
      }
    });

    // ===== TOUCH START =====
    rowEl.addEventListener('touchstart', e => {
      touchStarted = true;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;
      moved = false;
      isSwiping = false;
      longPressTriggered = false;

      longPressTimer = setTimeout(() => {
        if(!moved && touchStarted) toggleSelect();
      }, LONG_PRESS_DELAY);

    }, {passive:true});

    // ===== TOUCH MOVE =====
    rowEl.addEventListener('touchmove', e => {
      if(!touchStarted) return;
      const touch = e.touches[0];
      currentX = touch.clientX;
      const currentY = touch.clientY;

      const diffX = currentX - startX;
      const diffY = Math.abs(currentY - startY);

      // Scroll vertikal → batal long press
      if(diffY > 30){
        clearTimeout(longPressTimer);
        return;
      }

      // Swipe kanan = reply
      if(diffX > 10){
        moved = true;
        isSwiping = true;
        clearTimeout(longPressTimer);

        const drag = Math.min(diffX, MAX_SWIPE);
        msgEl.style.transform = `translateX(${drag}px)`;
        msgEl.classList.add("swiping");
      }

    }, {passive:true});

    // ===== TOUCH END =====
    rowEl.addEventListener('touchend', () => {
      touchStarted = false;
      clearTimeout(longPressTimer);

      const diffX = currentX - startX;

      // Reset posisi swipe animasi
      msgEl.style.transition = "transform 0.2s ease";
      msgEl.style.transform = "translateX(0)";
      msgEl.classList.remove("swiping");
      setTimeout(()=>{ msgEl.style.transition = ""; }, 200);

      // Trigger reply
      if(isSwiping && diffX > REPLY_THRESHOLD && !longPressTriggered){
        const text = msgEl.dataset.text || "";
        const msgId = msgEl.dataset.id;
        if(text && !msgEl.classList.contains('deleted')){
          if(navigator.vibrate) navigator.vibrate(10);
          showReplyPopup(text, msgId);
        }
      }

      isSwiping = false;
    });

    // ===== DESKTOP SUPPORT =====
    msgEl.addEventListener('mousedown', () => {
      longPressTimer = setTimeout(toggleSelect, LONG_PRESS_DELAY);
    });
    msgEl.addEventListener('mouseup', () => clearTimeout(longPressTimer));
    msgEl.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
  });
}

// ===== FORMAT TIMESTAMP ===== //
function formatTime(createdAt){
  if(!createdAt) return "";

  // 1️⃣ Timestamp Firestore (realtime)
  if(typeof createdAt.toDate === "function"){
    return createdAt.toDate().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // 2️⃣ Timestamp dari cache (millis number) ← INI BIAR CEPAT
  if(typeof createdAt === "number"){
    const date = new Date(createdAt);
    if(isNaN(date)) return "";
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // 3️⃣ Format seconds (fallback firestore lama)
  if(createdAt.seconds){
    const date = new Date(createdAt.seconds * 1000);
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return "";
}
function getMessageDate(timestamp){
  if (!timestamp) return null;

  // Support Firebase Timestamp & local number
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return new Date(timestamp);
}
function isDifferentDay(date1, date2){
  if (!date1 || !date2) return true;

  return (
    date1.getDate() !== date2.getDate() ||
    date1.getMonth() !== date2.getMonth() ||
    date1.getFullYear() !== date2.getFullYear()
  );
}
function formatDateCard(date){
  const now = new Date();
  const diffTime = now - date;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  // ≤ 7 hari = nama hari (Senin)
  if (diffDays <= 7){
    return date.toLocaleDateString('id-ID', {
      weekday: 'long'
    });
  }

  // > 7 hari = 1 Januari 2026
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// CENTANG WA //
function getCheckIcon(data) {
  // Hanya tampil di pesan milik sendiri
  if (data.senderId !== currentUser.uid) return "";

  const deliveredTo = data.deliveredTo || {};
  const readBy = data.readBy || {};

  const deliveredCount = Object.keys(deliveredTo).length;
  const readCount = Object.keys(readBy).length;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" 
         viewBox="0 0 16 16" 
         fill="currentColor" 
         class="check-icon">
      <path fill-rule="evenodd" 
        d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" 
        clip-rule="evenodd"/>
    </svg>
  `;

  // SENT (baru dikirim)
  if (deliveredCount <= 1) {
    return `<span class="check sent">${svg}</span>`;
  }

  // DELIVERED (sudah sampai device lawan)
  if (deliveredCount > 1 && readCount <= 1) {
    return `<span class="check delivered">${svg}</span>`;
  }

  // READ (sudah dibaca)
  if (readCount > 1) {
    return `<span class="check read">${svg}</span>`;
  }

  return `<span class="check sent">${svg}</span>`;
}
// ===== RENDER MESSAGES DENGAN ANIMASI ===== //
function renderMessages(snapshot, options = { appendOnly: false }) {
  const e2ePlaceholder = document.getElementById("e2ePlaceholder");

  // Hapus semua chat HANYA kalau bukan append
  if (!options.appendOnly) {
    chatContainer.innerHTML = "";
    if (e2ePlaceholder) chatContainer.appendChild(e2ePlaceholder);
  }

  let lastMessageDate = null;

  snapshot.forEach(doc => {
    const data = doc.data();

    if (data.deletedFor && data.deletedFor[currentUser.uid]) return;

    const createdAtRaw = data.createdAt || data.localCreatedAt;
    const msgDate = getMessageDate(createdAtRaw);

    if (!options.appendOnly && msgDate && isDifferentDay(msgDate, lastMessageDate)) {
      const dateCard = document.createElement("div");
      dateCard.className = "date-card";
      dateCard.innerText = formatDateCard(msgDate);
      chatContainer.appendChild(dateCard);
      lastMessageDate = msgDate;
    }

    const time = formatTime(createdAtRaw);
    const checkIcon = getCheckIcon(data);

    const rowEl = document.createElement("div");
    rowEl.classList.add("message-row");
    rowEl.classList.add(data.senderId === currentUser.uid ? "user" : "partner");

    // 🔥 Tambahkan animasi hanya kalau appendOnly
    if (options.appendOnly) {
      rowEl.classList.add("new");
    }

    const msgEl = document.createElement("div");
    msgEl.classList.add("message");
    msgEl.classList.add(data.senderId === currentUser.uid ? "user" : "partner");
    msgEl.dataset.id = doc.id;
    msgEl.dataset.senderId = data.senderId;

    if (data.deleted === true) {
      msgEl.classList.add('deleted');
      msgEl.innerHTML = `
        <div class="swipe-reply-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm4.28 10.28a.75.75 0 0 0 0-1.06l-3-3a.75.75 0 1 0-1.06 1.06l1.72 1.72H8.25a.75.75 0 0 0 0 1.5h5.69l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3Z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="deleted-msg"><span>Pesan dihapus</span></div>
        <div class="timestamp">${time}</div>
      `;
    } else {
      let replyHtml = "";
      if (data.replyTo && data.replyTo.text) {
        replyHtml = `
          <div class="reply-bubble">
            <div class="reply-author">Membalas pesan</div>
            <div class="reply-text-inline">${data.replyTo.text.replace(/\n/g, '<br>')}</div>
          </div>
        `;
      }

      msgEl.innerHTML = `
        <div class="swipe-reply-icon">
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm4.28 10.28a.75.75 0 0 0 0-1.06l-3-3a.75.75 0 1 0-1.06 1.06l1.72 1.72H8.25a.75.75 0 0 0 0 1.5h5.69l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3Z" clip-rule="evenodd" />
          </svg>
        </div>
        ${replyHtml}
        <div class="message-text">
          ${data.text ? data.text.replace(/\n/g, '<br>') : ""}
        <div class="timestamp">
          ${time} ${getCheckIcon(data)}
        </div>
      `;
    }

    rowEl.appendChild(msgEl);
    chatContainer.appendChild(rowEl);

    // ❗ Hapus class 'new' setelah animasi selesai supaya tidak tetap
    if (options.appendOnly) {
      rowEl.addEventListener('animationend', () => {
        rowEl.classList.remove('new');
      });
    }
  });

  // 🔥 Scroll otomatis ke bawah kalau flag tidak mencegah
  if (!preventAutoScroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  enableLongPressSelection();
}
// ===== E2E ===== //
function updateE2EPlaceholder(){
  const e2eCard = document.getElementById("e2ePlaceholder");
  if(!e2eCard) return;

  e2eCard.style.display = "flex"; // selalu tampil
}

// ===== CACHE MESSAGE IDB ===== //
function saveMessagesToIDB(messages){
  if(!window.dbIDB) return;
  const tx = window.dbIDB.transaction("chats", "readwrite");
  const store = tx.objectStore("chats");

  messages.forEach(msg=>{
    store.put({
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      text: msg.text || "",
      deleted: msg.deleted || false,
      deletedFor: msg.deletedFor || null,
      replyTo: msg.replyTo || null,
      createdAt: msg.createdAt?.toMillis 
        ? msg.createdAt.toMillis() 
        : msg.createdAt || Date.now()
    });
  });
}
function loadCachedMessagesIDB(){
  if(!window.dbIDB) return;

  const tx = window.dbIDB.transaction("chats","readonly");
  const store = tx.objectStore("chats");
  const req = store.getAll();

  req.onsuccess = ()=>{
    const all = req.result || [];

    // Filter hanya pesan room ini
    const cached = all
      .filter(m => m.roomId === roomId)
      .sort((a,b)=> (a.createdAt||0)-(b.createdAt||0));

    if(cached.length === 0) return;

    renderMessages({
      forEach: (cb)=> cached.forEach(msg=>{
        cb({ id: msg.id, data: ()=> msg });
      })
    });
  };
}
// ===== SAVE CHACE ===== //
function saveMessageToCache(message) {
  let cached = localStorage.getItem("chat_" + roomId);
  cached = cached ? JSON.parse(cached) : [];

  const cachedMessage = {
    id: message.id,
    senderId: message.senderId,
    text: message.text || "",
    deleted: message.deleted || false,
    deletedFor: message.deletedFor || null,
    replyTo: message.replyTo || null,

    // 🔥 SIMPAN MILLIS (BIAR BISA INSTANT RENDER)
    createdAt: message.createdAt?.toMillis
      ? message.createdAt.toMillis()
      : (typeof message.createdAt === "number"
          ? message.createdAt
          : message.localCreatedAt || Date.now())
  };

  const index = cached.findIndex(m => m.id === cachedMessage.id);
  if (index >= 0) {
    cached[index] = cachedMessage;
  } else {
    cached.push(cachedMessage);
  }

  localStorage.setItem("chat_" + roomId, JSON.stringify(cached));
}

// ===== FLOATING BUTTON SCROLL ===== //
function isUserNearBottom() {
  const threshold = 120; // jarak toleransi (px)
  const position = chatContainer.scrollTop + chatContainer.clientHeight;
  const height = chatContainer.scrollHeight;
  return height - position < threshold;
}
chatContainer.addEventListener("scroll", () => {
  if (!chatContainer) return;

  if (isUserNearBottom()) {
    // Sembunyikan kalau sudah dekat bawah
    scrollBtn.classList.remove("show");
  } else {
    // Muncul kalau scroll ke atas dikit saja
    scrollBtn.classList.add("show");
  }
});
// ===== KLIK BUTTON SCROLL KE BAWAH ===== //
scrollBtn.addEventListener("click", () => {
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: "smooth"
  });

  // Vibrate kecil (premium UX)
  if (navigator.vibrate) navigator.vibrate(8);
});

// ===== SEND MESSAGE ===== //
  document.getElementById("sendBtn").addEventListener("click", sendMessage);
  input.addEventListener("keydown", e => {
    if(e.key==="Enter" && e.ctrlKey){
      e.preventDefault();
      sendMessage();
    }
  });
function sendMessage() {
  const typingRef = rtdb.ref(`typing/${roomId}/${currentUser.uid}`);
  typingRef.set(false);
  const text = input.value.trim();
  if (!text) return;

  const localTime = Date.now();

  const messageData = {
    senderId: currentUser.uid,
    text,
    type: "text",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    localCreatedAt: localTime,
    deleted: false,
    deletedFor: {},
  
    // 🔥 WAJIB TAMBAH INI
    deliveredTo: {
      [currentUser.uid]: true
    },
    readBy: {
      [currentUser.uid]: true
    }
  };

  // ===== Reply Support =====
  if (replyState.active) {
    messageData.replyTo = {
      messageId: replyState.messageId,
      text: replyState.text
    };
  }

  // ===== Optimistic UI (biar langsung muncul tanpa delay) =====
  const tempMessage = {
    id: "temp_" + localTime,
    ...messageData,
    createdAt: localTime,
    isTemp: true // 🔥 PENANDA OPTIMISTIC
  };

  renderMessages({
    forEach: (cb) => cb({
      id: tempMessage.id,
      data: () => tempMessage
    })
  }, { appendOnly: true });

  // ===== Kirim ke Firestore =====
  // 🔹 Reset deletedFor supaya room muncul lagi untuk semua peserta
  db.collection("chatRooms")
    .doc(roomId)
    .set({ deletedFor: {} }, { merge: true })
    .catch(err => console.error("Reset deletedFor error:", err));
    
  db.collection("chatRooms")
    .doc(roomId)
    .collection("messages")
    .add(messageData)
    .then(docRef => {

      // 🚀 UPDATE LAST MESSAGE DI ROOM (WA STYLE)
      return db.collection("chatRooms")
        .doc(roomId)
        .update({
          lastMessage: text,
          lastSenderId: currentUser.uid,
          lastTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
          lastType: "text"
        })
        .then(() => {
          saveMessageToCache({
            ...messageData,
            id: docRef.id,
            createdAt: localTime
          });
        });

    })
    .catch(err => console.error("Send message error:", err));

  // ===== Reset Input =====
  input.value = "";
  input.style.height = "auto";
  cancelReply();

  // 🔥 Tetap fokus supaya keyboard tidak hilang
  input.focus();
}
// CENTANG DUA ABU DAN BIRU //
function markAsDeliveredRealtime() {
  db.collection("chatRooms")
    .doc(roomId)
    .collection("messages")
    .where("senderId", "!=", currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.deliveredTo?.[currentUser.uid]) {
          doc.ref.update({
            [`deliveredTo.${currentUser.uid}`]: true
          });
        }
      });
    });
}
function markAsReadRealtime() {
  db.collection("chatRooms")
    .doc(roomId)
    .collection("messages")
    .where("senderId", "!=", currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.readBy?.[currentUser.uid]) {
          doc.ref.update({
            [`readBy.${currentUser.uid}`]: true
          });
        }
      });
    });
}
// ===== TINGGI TEXTAREA ===== //
function adjustInputHeight() {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

// ===== PADDING CHAT ===== //
function adjustChatPadding(forceScroll = false) {
  const inputHeight = inputContainer.offsetHeight;

  // Extra space untuk keyboard & safe area
  const extraSpace = 70;

  chatContainer.style.paddingBottom = (inputHeight + extraSpace) + "px";

  // Hanya scroll otomatis kalau preventAutoScroll = false
  if (!preventAutoScroll && (forceScroll || isUserNearBottom())) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}
// ===== Jaga chat & input naik saat keyboard muncul ===== //
window.visualViewport?.addEventListener('resize', () => {
  const offsetTop = window.visualViewport.offsetTop;
  const viewportHeight = window.visualViewport.height;

  // Header tetap di atas
  if (header) {
    header.style.top = offsetTop + 'px';
  }

  // Input bar di atas keyboard
  if (inputBar) {
    const inputHeight = inputContainer.offsetHeight;
    const extraSpace = 16; // jarak minimal antara chat & input
    inputBar.style.bottom = (window.innerHeight - viewportHeight - offsetTop) + 'px';

    // Chat container ikut naik supaya tidak tertutup keyboard
    if (chatContainer) {
      chatContainer.style.paddingBottom = (inputHeight + extraSpace + (window.innerHeight - viewportHeight - offsetTop)) + 'px';
    }

    // Reply popup juga ikut naik jika aktif
    if (replyPopup && replyState.active) {
      replyPopup.style.bottom = (inputHeight + extraSpace + (window.innerHeight - viewportHeight - offsetTop)) + 'px';
    }

    // Scroll otomatis ke bawah biar input & reply terlihat
    if (!preventAutoScroll) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
});
// ===== INPUTBOX AUTO RADIUS ===== //
function adjustInputRadius() {
  const baseRadius = 24;
  const minTopRadius = 14;
  const lineHeight = 20; // samakan dengan textarea CSS

  if (!replyState.active) {
    inputBox.style.borderRadius = "24px";
    return;
  }

  const currentHeight = input.scrollHeight;
  const lines = Math.ceil(currentHeight / lineHeight);

  if (lines <= 1) {
    inputBox.style.borderRadius = "18px 18px 24px 24px";
    return;
  }

  let topRadius = baseRadius - (lines * 8);
  if (topRadius < minTopRadius) topRadius = minTopRadius;

  inputBox.style.borderRadius = `${topRadius}px ${topRadius}px 24px 24px`;
}

// ===== REPLY MESSAGE ===== //
function showReplyPopup(text, msgId){
  replyState.active = true;
  replyState.messageId = msgId;
  replyState.text = text;
  replyTextEl.innerText = text;
  replyPopup.classList.add("show");

  // ❌ NONAKTIFKAN scroll otomatis saat reply popup
  preventAutoScroll = true;

  // Fokus ke textarea supaya keyboard muncul
  input.focus();

  // Taruh cursor di akhir
  const val = input.value;
  input.value = "";
  input.value = val;

  // Tunggu layout stabil baru adjust
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      adjustInputRadius();
      adjustInputHeight();
      adjustChatPadding(false); // forceScroll = false, tetap tidak scroll ke bawah
    });
  });
}
function cancelReply(){
  // Simpan posisi cursor dulu
  const cursorPos = input.selectionStart;

  replyState.active = false;
  replyState.messageId = null;
  replyState.text = "";
  replyPopup.classList.remove("show");

  // Jangan aktifkan scroll dulu
  preventAutoScroll = true;

  // Paksa tetap fokus (ANTI KEYBOARD CLOSE)
  requestAnimationFrame(() => {
    input.focus();

    // Kembalikan posisi cursor
    input.setSelectionRange(cursorPos, cursorPos);

    adjustInputRadius();
    adjustInputHeight();
    adjustChatPadding(false);

    // Aktifkan lagi auto scroll setelah stabil
    setTimeout(() => {
      preventAutoScroll = false;
    }, 150);
  });
}

// ===== EVENT LISTENERS DAN TOMBOL ===== //
// 1️⃣ Cegah textarea kehilangan fokus
cancelReplyBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();   // cegah blur
});
// 2️⃣ Logic cancel tetap normal
cancelReplyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  cancelReply();
  // pastikan tetap fokus
  requestAnimationFrame(() => {
    input.focus();
  });
});
input.addEventListener('input', () => {
  adjustInputHeight();
  adjustChatPadding();
  adjustInputRadius();
});
input.addEventListener("focus", () => {
  setTimeout(() => {
    adjustChatPadding(true);
  }, 300); // tunggu keyboard naik
});

// ===== EMOJI PICKER ===== //
const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭'];
emojis.forEach(e=>{
  const span = document.createElement('span');
  span.style.cursor='pointer';
  span.style.fontSize='20px';
  span.textContent = e;
  span.addEventListener('click', ()=>{
    input.value += e;
    input.focus();
    input.dispatchEvent(new Event('input'));
  });
  emojiPopup.appendChild(span);
});
emojiBtn.addEventListener('click', e=>{
  e.stopPropagation();
  emojiPopup.classList.toggle('show');
});
document.addEventListener('click', e=>{
  if(!emojiPopup.contains(e.target) && !emojiBtn.contains(e.target)){
    emojiPopup.classList.remove('show');
  }
});
