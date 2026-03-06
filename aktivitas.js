/* ====== GLOBAL STATE ====== */
let activeTab = "aktif";
let unsubscribeOrders = null;
let currentOrders = [];
window.currentEditId = null;

/* ====== INIT (Dipanggil dari index.js) ======= */
function initAktivitas() {
  if (!window.userId || !window.db) return; // pastikan login & db ready
  setupTabs();
  loadOrders();
}
window.initAktivitas = initAktivitas;

/* ====== TAB SETUP ====== */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      activeTab = tab.dataset.tab;
      renderOrders();
    });
  });
}

/* ======= LOAD ORDERS (REALTIME) ======= */
function loadOrders() {
  const container = document.getElementById("ordersContainer");
  const empty = document.getElementById("ordersEmpty");
  if (!container || !window.userId || !window.db) return;

  container.innerHTML = "Memuat pesanan...";
  empty.style.display = "none";

  // Stop listener lama
  if (unsubscribeOrders) {
    unsubscribeOrders();
    unsubscribeOrders = null;
  }

  unsubscribeOrders = window.db.collection("orders")
    .where("userId", "==", window.userId)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      currentOrders = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0)
        };
      });
      renderOrders();
    }, err => {
      console.error("Firestore listener error:", err);
      container.innerHTML = "Gagal memuat pesanan.";
    });
}

/* ====== FILTER + RENDER ======= */
function renderOrders() {
  const container = document.getElementById("ordersContainer");
  const empty = document.getElementById("ordersEmpty");
  if (!container || !empty) return;

  const filtered = currentOrders.filter(o => {
    if (activeTab === "aktif") return o.status === "Dibuat";
    if (activeTab === "diproses") return o.status === "Diproses";
    return o.status === "Selesai" || o.status === "Dibatalkan";
  });

  if (!filtered.length) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  container.innerHTML = "";
  empty.style.display = "none";

  filtered.forEach(order => renderOrderCard(container, order));
}

/* ====== RENDER CARD ====== */
function renderOrderCard(container, order) {
  let statusClass = '';
  switch (order.status) {
    case 'Dibuat': statusClass = 'proses'; break;
    case 'Diproses': statusClass = 'diproses'; break;
    case 'Selesai': statusClass = 'selesai'; break;
    case 'Dibatalkan': statusClass = 'gagal'; break;
    default: statusClass = 'proses';
  }

  const createdTime = order.createdAt.getTime();
  const now = new Date().getTime();
  const canCancel = order.status === 'Dibuat' && (now - createdTime < 10 * 60 * 1000);
  const canEdit = order.status === 'Dibuat' && (now - createdTime < 10 * 60 * 1000);

  const card = document.createElement('div');
  card.className = 'order-card';

  /* ===== BUTTON DETAIL (DENGAN LABEL) ===== */
  const detailBtn = `
    <div class="action-wrapper">
      <span class="action-label">Detail</span>
      <button class="action-btn btn-detail" onclick="showDetail('${order.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path fill-rule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  `;
  
  /* ===== BUTTON EDIT (DENGAN LABEL) ===== */
  const editBtn = canEdit ? `
    <div class="action-wrapper">
      <span class="action-label">Edit</span>
      <button class="action-btn btn-edit" onclick="openEditPopup('${order.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
          <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
        </svg>
      </button>
    </div>
  ` : '';
  
  /* ===== BUTTON CANCEL (DENGAN LABEL) ===== */
  const cancelBtn = canCancel ? `
    <div class="action-wrapper">
      <span class="action-label">Batalkan</span>
      <button class="action-btn btn-cancel" onclick="confirmCancel('${order.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375Z" />
          <path fill-rule="evenodd" d="m3.087 9 .54 9.176A3 3 0 0 0 6.62 21h10.757a3 3 0 0 0 2.995-2.824L20.913 9H3.087Zm6.133 2.845a.75.75 0 0 1 1.06 0l1.72 1.72 1.72-1.72a.75.75 0 1 1 1.06 1.06l-1.72 1.72 1.72 1.72a.75.75 0 1 1-1.06 1.06L12 15.685l-1.72 1.72a.75.75 0 1 1-1.06-1.06l1.72-1.72-1.72-1.72a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  ` : '';

  /* ===== BUTTON CHAT (DENGAN LABEL) ===== */
  const chatBtn = (order.status === 'Diproses' && order.kurir) ? `
    <div class="action-wrapper">
      <span class="action-label">Chat Driver</span>
      <button class="action-btn btn-chat" onclick="chatDriver('${order.kurir}', '${order.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
          <path fill-rule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97ZM6.75 8.25a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5H12a.75.75 0 0 0 0-1.5H7.5Z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  ` : '';

  card.innerHTML = `
    <div class="order-content">
      <div><b>${order.layanan || '-'}</b></div>
      <div>Pesanan: ${order.pesanan || '-'}</div>
      <div>Ongkir: Rp ${order.ongkir?.toLocaleString('id-ID') || '-'}</div>
      <div class="status ${statusClass}">${order.status}</div>
      <div style="font-size:12px; opacity:0.7;">
        ${order.createdAt.toLocaleString("id-ID")}
      </div>
    </div>

    <div class="order-actions">
      ${detailBtn}
      ${editBtn}
      ${cancelBtn}
      ${chatBtn}
    </div>
  `;
  container.appendChild(card);
}

/* ========================================
   STATUS BADGE
======================================== */

function getStatusBadge(status) {

  switch(status) {

    case "proses":
      return `<span class="status-badge badge-proses">Dibuat</span>`;

    case "diproses":
      return `<span class="status-badge badge-proses">Aktif</span>`;

    case "selesai":
      return `<span class="status-badge badge-selesai">Selesai</span>`;

    case "gagal":
    case "Dibatalkan":
      return `<span class="status-badge badge-gagal">Dibatalkan</span>`;

    default:
      return `<span class="status-badge">${status || "-"}</span>`;
  }

}
let detailListener = null;
function showDetail(orderId) {

  const content = document.getElementById("popupContent");
  if (!content) return;

  content.innerHTML = "Memuat struk...";

  /* buka popup global */
  openPopup("popupDetail");

  /* stop listener lama */
  if (detailListener) detailListener();

  detailListener = window.db
  .collection("orders")
  .doc(orderId)
  .onSnapshot(doc => {

      if (!doc.exists) {
        content.innerHTML = "Data tidak ditemukan.";
        return;
      }

      const d = { id: doc.id, ...doc.data() };

      const createdAt =
        d.createdAt?.toDate ?
        d.createdAt.toDate() :
        new Date(0);

      content.innerHTML = `
        <div class="receipt-header">
          <img src="alert.png" class="receipt-logo">
          <div class="receipt-title">SuruhBeli</div>
          <div class="receipt-sub">Struk Pesanan Digital</div>
        </div>

        <div class="row">
          <span class="label">ID Pesanan</span>
          <span class="value">#${d.id.slice(0,6)}</span>
        </div>

        <div class="row">
          <span class="label">Waktu</span>
          <span class="value">
            ${createdAt.toLocaleString("id-ID")}
          </span>
        </div>

        <div class="dash"></div>

        <div class="row">
          <span class="label">Layanan</span>
          <span class="value">${d.layanan || "-"}</span>
        </div>

        <div class="row">
          <span class="label">Pesanan</span>
          <span class="value">${d.pesanan || "-"}</span>
        </div>

        <div class="row">
          <span class="label">Beli di</span>
          <span class="value">${d.beliDi || "-"}</span>
        </div>

        <div class="row">
          <span class="label">Catatan</span>
          <span class="value">${d.catatan || "-"}</span>
        </div>

        <div class="dash"></div>

        <div class="row">
          <span class="label">Ongkir</span>
          <span class="value">
            Rp ${d.ongkir?.toLocaleString("id-ID") || "0"}
          </span>
        </div>

        <div class="row">
          <span class="label">Status</span>
          <span class="value">${getStatusBadge(d.status)}</span>
        </div>

        <div class="dash"></div>

        <div class="receipt-footer">
          Terima kasih telah menggunakan SuruhBeli
        </div>
      `;

  });

}
function closeDetailPopup(){

  closePopup("popupDetail");

  if(detailListener){
    detailListener();
    detailListener = null;
  }

}
/* ====== EDIT POPUP ====== */
function openEditPopup(orderId){

  const pesananInput = document.getElementById("editPesanan");
  const catatanInput = document.getElementById("editCatatan");

  if(!pesananInput || !catatanInput) return;

  openPopup("popupEdit");

  pesananInput.value = "Memuat...";
  catatanInput.value = "";

  window.currentEditId = orderId;

  window.db
  .collection("orders")
  .doc(orderId)
  .get()
  .then(doc => {

    if(!doc.exists) return;

    const d = doc.data();

    pesananInput.value = d.pesanan || "";
    catatanInput.value = d.catatan || "";

  });

}
function closeEditPopup(){

  closePopup("popupEdit");

  window.currentEditId = null;

}
async function saveEditOrder(){

  if(!window.currentEditId) return;

  const pesanan =
    document.getElementById("editPesanan").value.trim();

  const catatan =
    document.getElementById("editCatatan").value.trim();

  try{

    await window.db
    .collection("orders")
    .doc(window.currentEditId)
    .update({ pesanan, catatan });

    closeEditPopup();

    await showCustomPopup(
      "Pesanan berhasil diperbarui!"
    );

    renderOrders();

  }
  catch(err){

    console.error(err);

    await showCustomPopup(
      "Gagal memperbarui pesanan!"
    );

  }

}

/* ====== CUSTOM POPUP ALERT / CONFIRM ====== */
function showCustomPopup(message, isConfirm=false){

  return new Promise(resolve => {

    const msg = document.getElementById("popupAlertMessage");
    const sub = document.getElementById("popupAlertSub");

    const btnOk = document.getElementById("popupOk");
    const btnCancel = document.getElementById("popupCancel");

    msg.textContent = message;

    sub.textContent =
      isConfirm ?
      "Tindakan ini tidak bisa dibatalkan"
      : "";

    btnCancel.style.display =
      isConfirm ? "inline-block" : "none";

    openPopup("popupAlert");

    const cleanup = (result)=>{

      closePopup("popupAlert");

      btnOk.onclick = null;
      btnCancel.onclick = null;

      resolve(result);

    };

    btnOk.onclick = ()=> cleanup(true);
    btnCancel.onclick = ()=> cleanup(false);

  });

}
/* ====== CONFIRM CANCEL ORDER ====== */
async function confirmCancel(orderId){

  const yakin =
  await showCustomPopup(
    "Yakin ingin membatalkan pesanan?",
    true
  );

  if(!yakin) return;

  try{

    await window.db
    .collection("orders")
    .doc(orderId)
    .update({ status:"Dibatalkan" });

    await showCustomPopup(
      "Pesanan berhasil dibatalkan!"
    );

    renderOrders();

  }
  catch(err){

    console.error(err);

    await showCustomPopup(
      "Gagal membatalkan pesanan!"
    );

  }

}

/* ======= CHAT DRIVER (SPA VERSION) ======= */
async function chatDriver(kurirUid, orderId) {
  if (!window.currentUser) return;

  const roomsRef = db.collection('chatRooms');
  let roomId = null;

  // Cari room existing
  const snapshot = await roomsRef
    .where(`participants.${window.currentUser.uid}`, '==', true)
    .where(`participants.${kurirUid}`, '==', true)
    .get();

  if (!snapshot.empty) {
    roomId = snapshot.docs[0].id;
  } else {
    // Buat room baru
    const newRoom = await roomsRef.add({
      participants: {
        [window.currentUser.uid]: true,
        [kurirUid]: true
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    roomId = newRoom.id;
  }

  window.location.href = `chat.html?roomId=${roomId}`;
}