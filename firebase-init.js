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
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
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

const REMEMBER_KEY = 'serhat_kasa_remember_auth_v1';
const SESSION_UNLOCK_KEY = 'serhat_kasa_session_unlocked_v1';
let currentUser = null;
let currentShop = null;

function saveRememberedCredentials(identifier, email, _password, remember) {
  try {
    if (remember) {
      const payload = {
        identifier: identifier.trim(),
        email: email.trim().toLowerCase(),
        remember: true,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch (e) {
    console.warn("Kullanıcı adı kaydı yapılamadı:", e);
  }
}

function getRememberedCredentials() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Eski sürümden kalma şifre varsa güvenlik için temizle
    if (parsed && parsed.passB64) {
      delete parsed.passB64;
      delete parsed.autoLogin;
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(parsed));
    }
    if (parsed && parsed.remember && (parsed.identifier || parsed.email)) {
      return parsed;
    }
  } catch (e) {}
  return null;
}

function prefillLoginInputs() {
  const saved = getRememberedCredentials();
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  const remCheck = document.getElementById('loginRememberMe');

  if (passInput) {
    passInput.value = '';
  }

  if (saved) {
    if (idInput) idInput.value = saved.identifier || saved.email;
    if (remCheck) remCheck.checked = true;
    if (passInput) setTimeout(() => passInput.focus(), 80);
  } else {
    if (idInput) setTimeout(() => idInput.focus(), 80);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prefillLoginInputs);
} else {
  prefillLoginInputs();
}

// Sayfa açıldığında mevcut yerel veriyi kontrol et ve sakla (eski sürümden geçişte veriyi korumak için)
let preservedLocalData = null;
try {
  const localRaw = localStorage.getItem('serhat_insaat_kasa_v1');
  if (localRaw) {
    const parsed = JSON.parse(localRaw);
    if (parsed && (parsed.transactions?.length > 0 || parsed.customers?.length > 0)) {
      preservedLocalData = parsed;
      console.log("📦 Mevcut yerel veriler tespit edildi, yeni dükkan kaydı için korundu.");
    }
  }
} catch (e) {
  console.warn("Yerel veri okunamadı:", e);
}

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
      let initialData = preservedLocalData || (typeof window.getAppState === 'function' ? window.getAppState() : null);
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
async function registerShop(shopName, username, email, password, rememberMe = true) {
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

  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

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

  saveRememberedCredentials(cleanUsername, cleanEmail, password, rememberMe);

  return userCred.user;
}

// 2. Dükkan Girişi (Kullanıcı Adı VEYA E-posta ile)
async function loginShop(identifier, password, rememberMe = true) {
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

  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

  const userCred = await signInWithEmailAndPassword(auth, emailToUse, password);
  saveRememberedCredentials(identifier, emailToUse, password, rememberMe);
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
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  await signOut(auth);
  const authModal = document.getElementById('authModalOverlay');
  if (authModal) authModal.style.display = 'flex';
  prefillLoginInputs();
}

// ────── SENKRONIZASYON ROZETİ ──────
function updateSyncBadge(status, customMsg = '') {
  const badge = document.querySelector('.badge-status');
  if (!badge) return;
  badge.style.cursor = 'pointer';

  if (status === 'online' || status === true) {
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    badge.innerHTML = `<span class="status-dot" style="background:#22c55e;"></span><span>Bulut Aktif (${timeStr})</span>`;
    badge.title = "Tüm verileriniz anlık olarak buluta ve cihazınıza otomatik yedekleniyor";
    badge.onclick = null;
  } else if (status === 'unauth') {
    badge.innerHTML = `<span class="status-dot" style="background:#f59e0b;"></span><span>Dükkan Girişi Yapın</span>`;
    badge.title = "Dükkanınıza giriş yapmak için tıklayın";
    badge.onclick = () => window.openAuthModal && window.openAuthModal();
  } else {
    badge.innerHTML = `<span class="status-dot" style="background:#ef4444;"></span> ⚠️ Bulut Bağlantı Sorunu`;
    badge.title = customMsg || "İnternet bağlantınızı veya Firebase kurallarını kontrol edin";
    badge.onclick = () => window.openAuthModal && window.openAuthModal();
  }
}

// ────── AUTH DURUM DEĞİŞİMİ DİNLEYİCİSİ ──────
onAuthStateChanged(auth, async (user) => {
  const authModal = document.getElementById('authModalOverlay');
  const appShell = document.querySelector('.app-shell');
  const userBadge = document.getElementById('userProfileBadge');
  const btnLogout = document.getElementById('btnLogout');
  const shopTitle = document.getElementById('headerShopTitle');
  const userText = document.getElementById('headerUsernameText');

  if (user) {
    currentUser = user;
    if (authModal) authModal.style.display = 'none';
    if (appShell) {
      appShell.style.pointerEvents = 'auto';
      appShell.style.userSelect = 'auto';
      appShell.style.filter = 'none';
    }
    if (userBadge) userBadge.style.display = 'inline-flex';
    if (btnLogout) btnLogout.style.display = 'inline-flex';

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

    if (window.lucide) window.lucide.createIcons();
    updateSyncBadge('online');
    await loadFromCloud();
  } else {
    currentUser = null;
    currentShop = null;

    prefillLoginInputs();
    if (authModal) authModal.style.display = 'flex';
    if (appShell) {
      appShell.style.pointerEvents = 'none';
      appShell.style.userSelect = 'none';
      appShell.style.filter = 'blur(8px)';
    }
    if (userBadge) userBadge.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none';

    updateSyncBadge('unauth');
  }
});

// Modal Açıcı
window.openAuthModal = function() {
  const authModal = document.getElementById('authModalOverlay');
  if (authModal) authModal.style.display = 'flex';
};

// ────── GLOBAL API ──────
window.firebaseDB = {
  save: saveToCloud,
  load: loadFromCloud,
  login: loginShop,
  register: registerShop,
  resetPassword: resetShopPassword,
  logout: logoutShop,
  openModal: window.openAuthModal,
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
