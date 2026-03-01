// 🔥 FIREBASE INIT GLOBAL (ANTI RACE CONDITION + ANTI CACHE ISSUE)

window.FIREBASE_READY = new Promise((resolve) => {

  function waitForFirebase() {
    if (typeof firebase === "undefined") {
      console.warn("⏳ Menunggu Firebase SDK...");
      setTimeout(waitForFirebase, 50);
      return;
    }

    try {
      // Anti double init
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: "AIzaSyByQl0BXZoSMzrULUNA6l7UVFQjXmvsdJE",
          authDomain: "suruhbeli-e8ae8.firebaseapp.com",
          databaseURL: "https://suruhbeli-e8ae8-default-rtdb.asia-southeast1.firebasedatabase.app",
          projectId: "suruhbeli-e8ae8",
          storageBucket: "suruhbeli-e8ae8.firebasestorage.app",
          messagingSenderId: "5783247867",
          appId: "1:5783247867:web:8f57e09a7dc4565378c95e",
          measurementId: "G-W68JP10CG9"
        });
      }

      // Global instances
      window.auth = firebase.auth();
      window.db = firebase.firestore();
      window.rtdb = firebase.database();

      console.log("🔥 Firebase Initialized (Stable)");

      resolve(true);

    } catch (err) {
      console.error("❌ Firebase init error:", err);
      resolve(false);
    }
  }

  waitForFirebase();
});