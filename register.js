const firebaseConfig = {
  apiKey: "AIzaSyByQl0BXZoSMzrULUNA6l7UVFQjXmvsdJE",
  authDomain: "suruhbeli-e8ae8.firebaseapp.com",
  projectId: "suruhbeli-e8ae8",
  storageBucket: "suruhbeli-e8ae8.firebasestorage.app",
  messagingSenderId: "5783247867",
  appId: "1:5783247867:web:8f57e09a7dc4565378c95e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

let latUser = 0;
let lngUser = 0;

const popup = document.getElementById("popup");
const popupText = document.getElementById("popupText");

// ======================
// LOTTIE LOADER
// ======================
let lottieAnim = lottie.loadAnimation({
  container: document.getElementById('lottieLoader'),
  renderer: 'svg',
  loop: true,
  autoplay: false,
  path: 'loading.json'
});

// ======================
// POPUP SIMPLE MODE
// ======================
function showLoading(){
  popup.style.display = "flex";
  popupText.innerText = "Tunggu sebentar";
  lottieAnim.goToAndPlay(0, true);
}

function showSuccess(){
  popup.style.display = "flex";
  popupText.innerText = "Berhasil";
  lottieAnim.stop();
}

function showError(){
  popup.style.display = "flex";
  popupText.innerText = "Gagal";
  lottieAnim.stop();
}

function hidePopup(delay = 1000){
  setTimeout(()=>{
    popup.style.display = "none";
    lottieAnim.stop();
  }, delay);
}

// ======================
// POPUP KONFIRMASI PASSWORD
// ======================
function openConfirmPopup(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if(!email || !password){
    showError();
    hidePopup(1500);
    return;
  }

  document.getElementById("confirmPopup").style.display = "flex";
}

function closeConfirmPopup(){
  document.getElementById("confirmPopup").style.display = "none";
}

// ======================
// AMBIL LOKASI
// ======================
function getLokasiPromise(){
  return new Promise((resolve)=>{

    if(!navigator.geolocation){
      latUser = 0;
      lngUser = 0;
      resolve();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        latUser = pos.coords.latitude;
        lngUser = pos.coords.longitude;
        resolve();
      },
      ()=>{
        latUser = 0;
        lngUser = 0;
        resolve();
      },
      {
        enableHighAccuracy:true,
        timeout:10000,
        maximumAge:0
      }
    );
  });
}

// ======================
// EMAIL LOGIN / AUTO REGISTER
// ======================
async function confirmEmailAuth(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPass = document.getElementById("confirmPassword").value.trim();

  if(!email || !password){
    showError();
    hidePopup(1500);
    return;
  }

  if(password !== confirmPass){
    showError();
    hidePopup(1500);
    return;
  }

  closeConfirmPopup();

  try{
    showLoading();

    let userCredential;

    try{
      userCredential = await auth.signInWithEmailAndPassword(email, password);
    }catch(error){

      if(
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential"
      ){
        userCredential = await auth.createUserWithEmailAndPassword(email, password);
      }else{
        throw error;
      }
    }

    await getLokasiPromise();
    await simpanUserJikaBaru(userCredential.user);

  }catch(error){
    console.error(error);
    showError();
    hidePopup(1500);
  }
}

// ======================
// LOGIN GOOGLE
// ======================
async function loginGoogle(){
  try{
    showLoading();

    await getLokasiPromise();

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const result = await auth.signInWithPopup(provider);
    await simpanUserJikaBaru(result.user);

  }catch(error){
    console.error("Google Error:", error);
    showError();
    hidePopup(1500);
  }
}

// ======================
// SIMPAN USER BARU SAJA
// ======================
async function simpanUserJikaBaru(user){
  try{
    const userRef = db.collection("users").doc(user.uid);
    const doc = await userRef.get();

    if(!doc.exists){
      await userRef.set({
        nama: user.displayName || user.email || "User",
        email: user.email || "",
        lat: latUser,
        lng: lngUser,
        role: "user",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    showSuccess();

    setTimeout(()=>{
      window.location.href = "index.html";
    }, 900);

  }catch(err){
    console.error("Firestore Error:", err);
    showError();
    hidePopup(1500);
  }
}

// ======================
// HANDLE REDIRECT GOOGLE
// ======================
auth.getRedirectResult().then(async (result)=>{
  if(result.user){
    showLoading();
    await getLokasiPromise();
    await simpanUserJikaBaru(result.user);
  }
}).catch(()=>{
  showError();
  hidePopup(1500);
});

// ======================
// SINKRON TEMA
// ======================
function loadTheme(){
  const savedTheme = localStorage.getItem("themeMode");
  if(savedTheme === "dark"){
    document.body.classList.add("dark-mode");
  }else{
    document.body.classList.remove("dark-mode");
  }
}

window.addEventListener("load", loadTheme);