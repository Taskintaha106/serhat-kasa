/* ==========================================================
   FIREBASE AUTHENTICATION & MULTI-TENANT FIRESTORE SYNC
   ========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD1iRDBHrsqKWJM6Fo9O3XnlwiR59KO_K0",
  authDomain: "serhat-kasa.firebaseapp.com",
  projectId: "serhat-kasa",
  storageBucket: "serhat-kasa.firebasestorage.app",
  messagingSenderId: "544529716804",
  appId: "1:544529716804:web:362e18eb059077d29c0e11",
  measurementId: "G-0HJND5DP9R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentShop = null;

// ────── Buluta Kaydet (Giriş Yapmış Dükkana Özel) ──────
async function saveToCloud(data) {
  if (!currentUser) return false;
  try {
    const docRef = doc(db, "kasa", currentUser.uid);
    await setDoc(docRef, {
      payload: JSON.stringify(data),
      updatedAt: new Date().toISOString(),
      shopName: currentShop?.shopName || 'Dükkan'
    });
    updateSyncBadge(true);
    console.log("✅ Firestore: Veri buluta kaydedildi.");
    return true;
  } catch (err) {
    console.error("❌ Firestore kayıt hatası:", err.code, err.message);
    const msg = err.code === 'permission-denied'
      ? 'Firebase Güvenlik Kuralı Engeli (permission-denied)'
      : err.message;
    updateSyncBadge(false, msg);
    return false;
  }
}

// ────── Buluttan Yükle (Giriş Yapmış Dükkana Özel) ──────
async function loadFromCloud() {
  if (!currentUser) return;
  console.log(`☁️ Firestore: Dükkan verisi kontrol ediliyor (${currentUser.uid})...`);
  try {
    const docRef = doc(db, "kasa", currentUser.uid);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const cloudData = JSON.parse(snap.data().payload);
      if (typeof window.syncFromCloud === 'function') {
        window.syncFromCloud(cloudData);
      }
      updateSyncBadge(true);
      console.log("☁️ Firestore: Dükkan verisi yüklendi.");
    } else {
      console.log("☁️ Firestore: Bu dükkan için ilk kez veri oluşturuluyor...");
      let initialData = null;
      if (typeof window.getAppState === 'function') {
        initialData = window.getAppState();
      }
      if (currentShop?.shopName && initialData?.settings) {
        initialData.settings.shopName = currentShop.shopName;
      }
      if (initialData) {
        await saveToCloud(initialData);
        if (typeof window.syncFromCloud === 'function') {
          window.syncFromCloud(initialData);
        }
      }
    }
  } catch (err) {
    console.error("❌ Firestore okuma hatası:", err.code, err.message);
    updateSyncBadge(false, err.message);
  }
}

// ────── KULLANICI İŞLEMLERİ ──────

// 1. Yeni Dükkan Kaydı
async function registerShop(shopName, username, email, password) {
  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (cleanUsername.length < 3) {
    throw new Error("Kullanıcı adı en az 3 karakter olmalıdır (sadece harf, rakam, tire veya alt çizgi).");
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error("Şifre sıfırlama için geçerli bir e-posta adresi zorunludur.");
  }
  if (password.length < 6) {
    throw new Error("Şifre en az 6 karakter olmalıdır.");
  }

  // Kullanıcı adı daha önce alınmış mı kontrol et
  const userMapRef = doc(db, "usernames", cleanUsername);
  const snap = await getDoc(userMapRef);
  if (snap.exists()) {
    throw new Error("Bu kullanıcı adı başka bir dükkan tarafından kullanılıyor. Lütfen başka bir kullanıcı adı seçin.");
  }

  // Firebase Auth ile hesap oluştur
  const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const uid = userCred.user.uid;

  // Kullanıcı adı eşleştirmesini kaydet
  await setDoc(userMapRef, {
    email: cleanEmail,
    uid: uid,
    shopName: shopName.trim(),
    createdAt: new Date().toISOString()
  });

  // Dükkan profilini kaydet
  await setDoc(doc(db, "shops", uid), {
    shopName: shopName.trim(),
    username: cleanUsername,
    email: cleanEmail,
    createdAt: new Date().toISOString()
  });

  currentShop = {
    shopName: shopName.trim(),
    username: cleanUsername,
    email: cleanEmail
  };

  return userCred.user;
}

// 2. Dükkan Girişi (Kullanıcı Adı VEYA E-posta ile)
async function loginShop(identifier, password) {
  const cleanId = identifier.trim().toLowerCase();
  let emailToUse = cleanId;

  if (!cleanId.includes('@')) {
    // Kullanıcı adından e-posta bul
    const userMapRef = doc(db, "usernames", cleanId);
    const snap = await getDoc(userMapRef);
    if (!snap.exists()) {
      throw new Error("Bu kullanıcı adına ait dükkan bulunamadı. Lütfen kullanıcı adınızı kontrol edin veya yeni dükkan kaydı açın.");
    }
    emailToUse = snap.data().email;
  }

  const userCred = await signInWithEmailAndPassword(auth, emailToUse, password);
  return userCred.user;
}

// 3. Şifremi Unuttum (Kullanıcı Adı veya E-posta ile sıfırlama maili gönderme)
async function resetShopPassword(identifier) {
  const cleanId = identifier.trim().toLowerCase();
  let emailToUse = cleanId;

  if (!cleanId.includes('@')) {
    const userMapRef = doc(db, "usernames", cleanId);
    const snap = await getDoc(userMapRef);
    if (!snap.exists()) {
      throw new Error("Bu kullanıcı adına ait kayıtlı e-posta adresi bulunamadı.");
    }
    emailToUse = snap.data().email;
  }

  await sendPasswordResetEmail(auth, emailToUse);
  return emailToUse;
}

// 4. Çıkış Yap
async function logoutShop() {
  await signOut(auth);
  if (typeof window.clearAppState === 'function') {
    window.clearAppState();
  }
}

// ────── SENKRONIZASYON ROZETİ ──────
function updateSyncBadge(online, errMsg = '') {
  const badge = document.querySelector('.badge-status');
  if (!badge) return;
  if (online) {
    badge.innerHTML = `<span class="status-dot" style="background:#22c55e;"></span> ☁️ Bulut Senkronize`;
    badge.title = "Firebase Firestore ile bağlı ve senkronize";
  } else {
    badge.innerHTML = `<span class="status-dot" style="background:#ef4444;"></span> ⚠️ Bulut Bağlantı Sorunu`;
    badge.title = errMsg || "Firebase kuralları veya ağ hatası";
  }
}

// ────── AUTH DURUM DEĞİŞİMİ DİNLEYİCİSİ ──────
onAuthStateChanged(auth, async (user) => {
  const authModal = document.getElementById('authModalOverlay');
  const userBadge = document.getElementById('userProfileBadge');
  const btnLogout = document.getElementById('btnLogout');
  const shopTitle = document.getElementById('headerShopTitle');
  const userText = document.getElementById('headerUsernameText');

  if (user) {
    currentUser = user;
    try {
      const shopSnap = await getDoc(doc(db, "shops", user.uid));
      if (shopSnap.exists()) {
        currentShop = shopSnap.data();
        if (shopTitle && currentShop.shopName) shopTitle.textContent = currentShop.shopName;
        if (userText) userText.textContent = currentShop.username || currentShop.shopName;
      }
    } catch (e) {
      console.warn("Profil yükleme uyarısı:", e);
    }

    if (authModal) authModal.style.display = 'none';
    if (userBadge) userBadge.style.display = 'inline-flex';
    if (btnLogout) btnLogout.style.display = 'inline-flex';

    if (window.lucide) window.lucide.createIcons();
    await loadFromCloud();
  } else {
    currentUser = null;
    currentShop = null;

    if (authModal) authModal.style.display = 'flex';
    if (userBadge) userBadge.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none';
    if (shopTitle) shopTitle.textContent = "Serhat İnşaat";

    updateSyncBadge(false, "Oturum açılmadı");
    if (window.clearAppState) window.clearAppState();
  }
});

// ────── GLOBAL API ──────
window.firebaseDB = {
  save: saveToCloud,
  load: loadFromCloud,
  login: loginShop,
  register: registerShop,
  resetPassword: resetShopPassword,
  logout: logoutShop,
  getCurrentUser: () => currentUser,
  getCurrentShop: () => currentShop
};

window.manuelBulutaYukle = async function() {
  if (!currentUser) {
    alert("Buluta yüklemek için lütfen önce dükkan girişi yapın!");
    return;
  }
  const appData = typeof window.getAppState === 'function' ? window.getAppState() : null;
  if (!appData) { alert("Veri bulunamadı!"); return; }
  const ok = await saveToCloud(appData);
  if (ok) {
    alert("✅ Veriler dükkanınızın özel bulut alanına başarıyla kaydedildi!");
  } else {
    alert("❌ Kayıt başarısız oldu. Lütfen internet bağlantınızı kontrol edin.");
  }
};
