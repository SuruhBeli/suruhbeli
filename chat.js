// ===== Firebase Config ===== //
  firebase.initializeApp({
    apiKey: "AIzaSyByQl0BXZoSMzrULUNA6l7UVFQjXmvsdJE",
    authDomain: "suruhbeli-e8ae8.firebaseapp.com",
    projectId: "suruhbeli-e8ae8",
    databaseURL: "https://suruhbeli-e8ae8-default-rtdb.firebaseio.com"
  });

  const db = firebase.firestore();
  const auth = firebase.auth();
  const rtdb = firebase.database();
  
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
  
  // === GLOBAL === //
  let longPressTimer;
  let selectedMessages = new Set();
  let actionBar = null;
  let currentUser = null;
  let otherUserId = null;
  let unsubscribeMessages = null;
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
  auth.onAuthStateChanged(user=>{
    if(user){
      currentUser = user;
      loadCachedPartner();
      loadChatRoomInfo();
      loadCachedMessages(); // render cache dulu
      setupRealtimeMessages(); // lalu realtime update
      updateOnlineStatus(true);
      window.addEventListener("beforeunload", ()=> updateOnlineStatus(false));
    } else {
      window.location.href = "login.html";
    }
  });

// ===== ONLINE STATUS ===== //
function updateOnlineStatus(isOnline){
  if(!currentUser) return;
  rtdb.ref("status/" + currentUser.uid).set({
    online: isOnline,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
   });
  }

// ===== CHAT ROOM INFO =====
function loadChatRoomInfo() {
    db.collection("chatRooms").doc(roomId).get()
      .then(roomDoc => {
        if(!roomDoc.exists) return;
        const roomData = roomDoc.data();
        const otherUserId = Object.keys(roomData.participants || {}).find(uid => uid !== currentUser.uid);
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
function setupRealtimeMessages() {
  db.collection("chatRooms").doc(roomId)
    .collection("messages")
    .orderBy("createdAt")
    .onSnapshot(snapshot => {
      renderMessages(snapshot);

      // update cache
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      localStorage.setItem("chat_" + roomId, JSON.stringify(messages));
    });
  }
  
// ===== KULT MULTI SECLECT ===== //
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

// ===== POPUP PRESS ===== //
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

// ===== update clearSelection ===== //
function clearSelection() {
  selectedMessages.forEach(msgEl => msgEl.classList.remove('selected'));
  selectedMessages.clear();
  if(actionBar){
    actionBar.classList.remove('show');
    setTimeout(()=> { actionBar.remove(); actionBar=null; }, 200);
  }
}

// ===== DELETE OPTIONS MODAL ===== //
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

// ===== SMOOTH CLOSE POPUP ===== //
function closeDeletePopup(overlay){
  overlay.style.opacity = "0";
  overlay.style.transition = "0.15s ease";
  setTimeout(()=>{
    overlay.remove();
  },150);
}

// ===== DELETE FOR ME ===== //
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

// ===== DELETE FOR EVERYONE ===== //
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

// ===== CANCEL SELECTION HANYA JIKA KLIK AREA LUAR CHAT ===== //
document.addEventListener('click', e=>{
  if(selectedMessages.size === 0) return;

  const clickedMessage = e.target.closest('.message');
  const clickedActionBar = e.target.closest('.selection-popup');

  // Jika klik bubble lain → JANGAN batal (biar bisa multi select)
  if(clickedMessage) return;

  // Jika klik action bar → JANGAN batal
  if(clickedActionBar) return;

  // Baru batal kalau klik area kosong
  clearSelection();
});

// ===== BUBBLE CLICK AND SWIPE ===== //
function enableLongPressSelection() {
  document.querySelectorAll('.message-row').forEach(rowEl => {
    if (rowEl.dataset.listener === "true") return;
    rowEl.dataset.listener = "true";

    const msgEl = rowEl.querySelector('.message');
    if(!msgEl) return;

    // ===== AMBIL TEXT UNTUK COPY & REPLY =====
    const divs = msgEl.querySelectorAll('div');
    let messageText = "";

    if(divs.length >= 3){
      messageText = divs[divs.length - 2].innerText;
    } else if(divs.length === 2){
      messageText = divs[0].innerText;
    }
    msgEl.dataset.text = messageText;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    let moved = false;
    let longPressTriggered = false;
    let touchStarted = false;

    const MAX_SWIPE = 120;
    const REPLY_THRESHOLD = 60;
    const LONG_PRESS_DELAY = 400;

    // ===== TOGGLE SELECT (CORE) =====
    const toggleSelect = () => {
      longPressTriggered = true;

      const isSelected = msgEl.classList.toggle('selected');
      if(isSelected){
        selectedMessages.add(msgEl);
      }else{
        selectedMessages.delete(msgEl);
      }

      if(selectedMessages.size > 0){
        showSelectionPopup();
        updateSelectionCount();
      }else{
        clearSelection();
      }

      if(navigator.vibrate) navigator.vibrate(8);
    };

    // ===== TAP SAAT SUDAH MODE SELECT (INI YANG FIX BUBBLE KEDUA) =====
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

      // Long press SELALU aktif (meski sudah select)
      longPressTimer = setTimeout(() => {
        if(!moved && touchStarted){
          toggleSelect();
        }
      }, LONG_PRESS_DELAY);

    }, {passive:true});

    // ===== TOUCH MOVE (SWIPE REPLY TETAP AKTIF WALAU SELECT MODE) =====
    rowEl.addEventListener('touchmove', e => {
      if(!touchStarted) return;

      const touch = e.touches[0];
      currentX = touch.clientX;
      const currentY = touch.clientY;

      const diffX = currentX - startX;
      const diffY = Math.abs(currentY - startY);

      // Jika scroll vertikal → batal long press
      if(diffY > 30){
        clearTimeout(longPressTimer);
        return;
      }

      // Swipe kanan = reply (TIDAK diblok walau ada selection)
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

      setTimeout(()=>{
        msgEl.style.transition = "";
      },200);

      // ===== TRIGGER REPLY (WALAUPUN SEDANG SELECT MODE) =====
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

    // ===== DESKTOP SUPPORT (MOUSE) =====
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

// ===== RENDER MESSAGES ===== //
function renderMessages(snapshot){
  chatContainer.innerHTML = "";

  snapshot.forEach(doc=>{
    const data = doc.data();

    // ===== SKIP JIKA DIHAPUS HANYA UNTUK SAYA =====
    if(data.deletedFor && data.deletedFor[currentUser.uid]){
      return;
    }

    // ===== FORMAT WAKTU (ANTI ERROR) =====
    const time = formatTime(data.createdAt || data.localCreatedAt);

    // ===== ROW WRAPPER =====
    const rowEl = document.createElement("div");
    rowEl.classList.add("message-row");
    rowEl.classList.add(data.senderId===currentUser.uid ? "user" : "partner");

    // ===== BUBBLE =====
    const msgEl = document.createElement("div");
    msgEl.classList.add("message");
    msgEl.classList.add(data.senderId===currentUser.uid ? "user" : "partner");
    msgEl.dataset.id = doc.id;
    msgEl.dataset.senderId = data.senderId;

    // ===== JIKA DELETE FOR EVERYONE =====
    if (data.deleted === true) {
      msgEl.classList.add('deleted');

      msgEl.innerHTML = `
        <div class="swipe-reply-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path d="M3 10h10a4 4 0 0 1 0 8H7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 10l4-4M3 10l4 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <div class="deleted-msg">
          <svg class="deleted-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span>Pesan dihapus</span>
        </div>

        <div class="timestamp">${time}</div>
      `;
    } 
    // ===== PESAN NORMAL =====
    else {

      // ===== REPLY PREVIEW (WA STYLE - LEBIH STABIL) =====
      let replyHtml = "";
      if(data.replyTo && data.replyTo.text){
        replyHtml = `
          <div class="reply-bubble">
            <div class="reply-author">Membalas pesan</div>
            <div class="reply-text-inline">
              ${data.replyTo.text.replace(/\n/g,'<br>')}
            </div>
          </div>
        `;
      }

      // ===== ISI PESAN + REPLY + TIMESTAMP =====
      msgEl.innerHTML = `
        <div class="swipe-reply-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <path d="M3 10h10a4 4 0 0 1 0 8H7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 10l4-4M3 10l4 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        ${replyHtml}

        <div class="message-text">
          ${data.text ? data.text.replace(/\n/g,'<br>') : ""}
        </div>

        <div class="timestamp">${time}</div>
      `;
    }

    rowEl.appendChild(msgEl);
    chatContainer.appendChild(rowEl);
  });

  // ===== AUTO SCROLL HANYA JIKA USER DI BAWAH =====
  if (isUserNearBottom()) {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  // ===== AKTIFKAN LONG PRESS LAGI =====
  enableLongPressSelection();
  autoScrollBottom();
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
function sendMessage(){
    const text = input.value.trim();
    if(!text) return;
    const localTime = Date.now();
    const messageData = {
      senderId: currentUser.uid,
      text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), // waktu server asli
      localCreatedAt: localTime, // backup untuk cache & UI instan
      deleted: false,
      deletedFor: {}
    };

    if(replyState.active){
      messageData.replyTo = { messageId: replyState.messageId, text: replyState.text };
    }
    // 🔥 RENDER INSTAN KE UI (TANPA NUNGGU REALTIME)
    const tempMessage = {
      id: "temp_" + localTime,
      ...messageData,
      createdAt: localTime // pakai waktu lokal dulu
    };
  
    renderMessages({
      forEach: (cb) => cb({
        id: tempMessage.id,
        data: () => tempMessage
      })
    });
    db.collection("chatRooms").doc(roomId)
      .collection("messages").add(messageData)
      .then(docRef=>{
        // Update cache dengan ID asli
        saveMessageToCache({
          ...messageData,
          id: docRef.id,
          createdAt: localTime
        });
      })
      .catch(err=>console.error(err));

    input.value = "";
    input.style.height = "auto";
    cancelReply();
    scrollChatToBottom(true);
  }
function autoScrollBottom(){
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ===== TINGGI TEXTAREA===== //
function adjustInputHeight() {
  const lineHeight = 15; // tinggi 1 baris (sesuai min-height di CSS)
  input.style.height = 'auto'; // reset
  const scrollHeight = input.scrollHeight;

  // Kalau scrollHeight <= lineHeight → tetap satu baris
  input.style.height = Math.max(scrollHeight, lineHeight) + 'px';
}

// ===== PADDING CHAT ===== //
function adjustChatPadding() {
  const inputHeight = inputContainer.offsetHeight;
  chatContainer.style.paddingBottom = inputHeight + 5 + 'px'; // +12px jarak ekstra
}

// ===== scroll otomatis ===== //
function scrollChatToBottom(smooth = true) {
  if (smooth) {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  } else {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// ===== INPUTBOX AUTO RADIUS ===== //
function adjustInputRadius() {
  const baseRadius = 24;
  const minTopRadius = 14;
  const lineHeight = 20; // samakan dengan textarea CSS

  // 🔥 KUNCI: kalau tidak ada reply, radius full terus
  if (!replyState.active) {
    inputBox.style.borderRadius = "24px";
    return;
  }

  const currentHeight = input.scrollHeight;
  const lines = Math.ceil(currentHeight / lineHeight);

  // Saat ada reply + masih 1 baris
  // tetap sedikit lebih kecil biar nyatu dengan reply card
  if (lines <= 1) {
    inputBox.style.borderRadius = "18px 18px 24px 24px";
    return;
  }

  // Semakin tinggi textarea, radius atas makin mengecil
  let topRadius = baseRadius - (lines * 10);

  if (topRadius < minTopRadius) {
    topRadius = minTopRadius;
  }

  inputBox.style.borderRadius = `${topRadius}px ${topRadius}px 24px 24px`;
}

// ===== REPLY MESSAGE ===== //
function showReplyPopup(text, msgId){
  replyState.active = true;
  replyState.messageId = msgId;
  replyState.text = text;

  replyTextEl.innerText = text;

  // tampilkan inline bubble (bukan fixed)
  replyPopup.classList.add("show");

  // 🔥 penting: update padding & scroll biar chat ga ketutup
  setTimeout(() => {
    adjustInputRadius();
    adjustChatPadding();
    scrollChatToBottom(false);
  }, 50);
}
function cancelReply(){
  replyState.active = false;
  replyState.messageId = null;
  replyState.text = "";

  replyPopup.classList.remove("show");

  // update layout lagi setelah bubble hilang
  setTimeout(() => {
    adjustInputRadius();
    adjustChatPadding();
  }, 200);
}

cancelReplyBtn.addEventListener("click", cancelReply);

// Event listener input textarea
input.addEventListener('input', () => {
  adjustInputHeight();
  adjustChatPadding();
  scrollChatToBottom(); // scroll otomatis
  adjustInputRadius();
});

// ===== EMOJI PICKER =====
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