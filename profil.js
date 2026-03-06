// ===============================
// PROFIL.JS FINAL
// ===============================

// ===== DOMS =====
const editPopup = document.getElementById("editPopup");
const confirmPopup = document.getElementById("confirmPopup");
const successPopup = document.getElementById("successPopup");

function safeOnClick(id, handler){
  const el = document.getElementById(id);
  if (!el) return;
  el.onclick = handler;
}

// ===== FLAG =====
let pendingSave = false;
let pendingLogout = false;

// ===== LOAD HEADER DARI FIRESTORE (Realtime) =====
async function loadHeaderProfil() {
  const heroImg = document.getElementById("heroImg");
  if (!heroImg) return;

  // helper default path
  const defaultPath = "default.png";

  try {
    const docRef = window.db.collection("stockfoto").doc("foto");
    docRef.onSnapshot(doc => {
      if (!doc.exists) {
        heroImg.src = defaultPath;
        return;
      }
      const url = doc.data().headerprofil || defaultPath;
      heroImg.src = url;
      heroImg.onerror = () => { heroImg.src = defaultPath; };
    });
  } catch (e) {
    console.log("Gagal load header profil:", e);
    heroImg.src = defaultPath;
  }
}

// ===== SET DATA DEFAULT =====
function setDefaultProfile(){
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  if(nameEl) nameEl.textContent = "Pengguna";
  if(emailEl) emailEl.textContent = "-";
  if(phoneEl) phoneEl.textContent = "-";
  if(avatarEl) avatarEl.textContent = "U";
}

// ===== LOAD DATA PROFIL USER (Realtime) =====
window.initProfil = async function() {
  console.log("👤 Profil page init");

  await loadHeaderProfil();

  const userId = window.userId; // Auth ikut index.js
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  if (!userId) {
    if (nameEl) nameEl.textContent = "Belum Login";
    if (emailEl) emailEl.textContent = "-";
    if (phoneEl) phoneEl.textContent = "-";
    if (avatarEl) avatarEl.textContent = "?";
    return;
  }

  try {
    const docRef = window.db.collection("users").doc(userId);
    docRef.onSnapshot(doc => {
      if (!doc.exists) return;
      const data = { id: doc.id, ...doc.data() };
      setProfileUI(data);
    });
  } catch (err) {
    console.error("Error load profil:", err);
    setDefaultProfile();
  }
};

// ===== HELPER SET UI PROFILE =====
function setProfileUI(data) {
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("profileEmail");
  const phoneEl = document.getElementById("profilePhone");
  const avatarEl = document.getElementById("profileAvatar");

  const nama = data.nama || data.name || "Pengguna";
  const nohp = data.noHP || data.nohp || data.phone || "-";
  const email = data.email || "-";

  if (nameEl) nameEl.textContent = nama;
  if (phoneEl) phoneEl.textContent = nohp;
  if (emailEl) emailEl.textContent = email;

if(avatarEl){
  if(data.fotoProfil){
    avatarEl.innerHTML = `<img src="${data.fotoProfil}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else if(nama && nama.length>0){
    avatarEl.textContent = nama.charAt(0).toUpperCase();
  } else {
    avatarEl.textContent = "U";
  }
}
}

// ===== LOCAL PHOTO =====
function loadLocalAvatar(){
  const savedPhoto = localStorage.getItem("profilePhoto");
  const avatarEl = document.getElementById("profileAvatar");

  if(savedPhoto && avatarEl){
    avatarEl.innerHTML = `<img src="${savedPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  }
}
if (editPopup) {
  editPopup.onclick = (e) => {
    if (e.target === editPopup) editPopup.classList.remove("show");
  };
}
if (inputPhoto) {
  inputPhoto.onchange = function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result;
      if (editPreview) {
        editPreview.innerHTML = `<img src="${base64}">`;
      }
      localStorage.setItem("tempProfilePhoto", base64);
    };
    reader.readAsDataURL(file);
  };
}

safeOnClick("btnCancelConfirm", () => {
  if (confirmPopup) confirmPopup.classList.remove("show");
  pendingSave = false;
});

safeOnClick("btnCloseSuccess", () => {
  if (successPopup) successPopup.classList.remove("show");
});
safeOnClick("btnLogout", () => {
  // Set pendingLogout true
  pendingLogout = true;

  // Tampilkan popup konfirmasi
  if (confirmPopup) {
    confirmPopup.classList.add("show");
  }
});
safeOnClick("btnOkConfirm", async () => {
  if (!confirmPopup) return;
  confirmPopup.classList.remove("show");

  if (pendingLogout) {
    pendingLogout = false;
    try {
      await firebase.auth().signOut();
      window.location.href = "register.html";
    } catch (err) {
      console.log("Error logout:", err);
    }
    return;
  }

  if (!pendingSave) return;
  pendingSave = false;

  const userId = window.userId;
  if (!userId) return;

  const editNama = document.getElementById("editNama");
  const editNoHP = document.getElementById("editNoHP");
  const nama = editNama?.value.trim() || "";
  const noHP = editNoHP?.value.trim() || "";
  const tempPhoto = localStorage.getItem("tempProfilePhoto");

  try {
    await window.db.collection("users").doc(userId).update({ nama, noHP });

    if (tempPhoto) {
      localStorage.setItem("profilePhoto", tempPhoto);
      localStorage.removeItem("tempProfilePhoto");

      const avatarEl = document.getElementById("profileAvatar");
      if (avatarEl) {
        avatarEl.innerHTML = `<img src="${tempPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      }
    }

    const nameEl = document.getElementById("profileName");
    const phoneEl = document.getElementById("profilePhone");

    if (nameEl) nameEl.textContent = nama || "Pengguna";
    if (phoneEl) phoneEl.textContent = noHP || "-";

    if (editPopup) editPopup.classList.remove("show");
    if (successPopup) successPopup.classList.add("show");

  } catch (err) {
    console.log("Error update profil:", err);
  }
});

window.addEventListener("load", () => {
  loadLocalAvatar();
});

// ===== NAVIGASI ===== //
safeOnClick("btnEditProfile", () => {
  const userData = {
    nama: document.getElementById("profileName")?.textContent,
    noHP: document.getElementById("profilePhone")?.textContent,
    photoURL: localStorage.getItem("profilePhoto") || null
  };
  PopupManager.showEditProfile(userData);
});
safeOnClick("btnSaveProfile", async () => {
  const userId = window.userId;
  if (!userId) return;

  const nama = document.getElementById("editNama").value.trim();
  const noHP = document.getElementById("editNoHP").value.trim();
  const tempPhoto = localStorage.getItem("tempProfilePhoto");

  try {

    const updateData = { nama, noHP };

    // ===== HANDLE FOTO =====
    if(tempPhoto === "delete"){
      updateData.fotoProfil = "";
      localStorage.removeItem("profilePhoto");
    }
    else if(tempPhoto){
      updateData.fotoProfil = tempPhoto;
      localStorage.setItem("profilePhoto", tempPhoto);
    }

    await window.db.collection("users").doc(userId).update(updateData);

    localStorage.removeItem("tempProfilePhoto");

    const avatarEl = document.getElementById("profileAvatar");

    if(avatarEl){
      if(updateData.fotoProfil){
        avatarEl.innerHTML = `<img src="${updateData.fotoProfil}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      }else{
        avatarEl.textContent = nama.charAt(0).toUpperCase();
      }
    }

    const nameEl = document.getElementById("profileName");
    const phoneEl = document.getElementById("profilePhone");

    if(nameEl) nameEl.textContent = nama || "Pengguna";
    if(phoneEl) phoneEl.textContent = noHP || "-";

    PopupManager.closeEditProfile();
    PopupManager.showCustom("Profil berhasil diperbarui");

  } catch(err){
    console.error("Error update profil:", err);
    PopupManager.showCustom("Gagal memperbarui profil");
  }
});
safeOnClick("btnTerms", () => { window.location.href = "ketentuan.html"; });
safeOnClick("btnPrivacy", () => { window.location.href = "kebijakan.html"; });
safeOnClick("btnMitraToko", () => { window.location.href = "mitratoko.html"; });
safeOnClick("btnFeedback", () => { window.location.href = "feedback.html"; });
safeOnClick("btnTentang", () => { window.location.href = "tentang.html"; });
safeOnClick("btnInvite", () => {
  const text = encodeURIComponent("Yuk pakai aplikasi SuruhBeli! Bantu belanja desa jadi lebih mudah 🚀");
  window.open(`https://wa.me/?text=${text}`, "_blank");
});