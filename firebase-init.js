/* ==========================================================
   FIREBASE BAŞLATMA & FIRESTORE BULUT SENKRONIZASYONU
   ========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ────── Firebase Config ──────
const firebaseConfig = {
  apiKey: "AIzaSyD1iRDBHrsqKWJM6Fo9O3XnlwiR59KO_K0",
  authDomain: "serhat-kasa.firebaseapp.com",
  projectId: "serhat-kasa",
  storageBucket: "serhat-kasa.firebasestorage.app",
  messagingSenderId: "544529716804",
  appId: "1:544529716804:web:362e18eb059077d29c0e11",
  measurementId: "G-0HJND5DP9R"
};

console.log("🔥 Firebase modülü yükleniyor...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
console.log("✅ Firebase başlatıldı, Firestore bağlantısı hazır.");

// Firestore'daki belge adresi: koleksiyon="kasa", belge="serhat"
const FIRESTORE_DOC = doc(db, "kasa", "serhat");

// ────── Buluta Kaydet ──────
async function saveToCloud(data) {
  try {
    await setDoc(FIRESTORE_DOC, {
      payload: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    });
    updateSyncBadge(true);
    console.log("✅ Firestore: Veri başarıyla buluta kaydedildi.");
  } catch (err) {
    updateSyncBadge(false);
    console.error("❌ Firestore kayıt hatası:", err.code, err.message);
  }
}

// ────── Buluttan Yükle ──────
async function loadFromCloud() {
  console.log("☁️ Firestore: Bulut verisi kontrol ediliyor...");
  try {
    const snap = await getDoc(FIRESTORE_DOC);

    if (snap.exists()) {
      console.log("☁️ Firestore: Belge bulundu → veriler karşılaştırılıyor...");
      const cloudData = JSON.parse(snap.data().payload);
      const cloudTime = snap.data().updatedAt || '0';
      const localTime = localStorage.getItem('serhat_insaat_kasa_v1_time') || '0';

      if (cloudTime > localTime) {
        localStorage.setItem('serhat_insaat_kasa_v1', JSON.stringify(cloudData));
        localStorage.setItem('serhat_insaat_kasa_v1_time', cloudTime);
        if (typeof window.syncFromCloud === 'function') {
          window.syncFromCloud(cloudData);
        }
        console.log("☁️ Firestore: Bulut verisi daha güncel → uygulamaya yüklendi.");
      } else {
        console.log("✅ Firestore: Yerel veri zaten güncel, buluta gerek yok.");
      }
      updateSyncBadge(true);

    } else {
      console.log("☁️ Firestore: Henüz belge yok → yerel veri buluta aktarılıyor...");
      const localRaw = localStorage.getItem('serhat_insaat_kasa_v1');
      if (localRaw) {
        await saveToCloud(JSON.parse(localRaw));
        console.log("✅ Firestore: Yerel veriler ilk kez buluta gönderildi!");
      } else {
        console.log("⚠️ Firestore: Yerel veri de yok, uygulama boş başlıyor.");
      }
    }
  } catch (err) {
    updateSyncBadge(false);
    console.error("❌ Firestore okuma hatası:", err.code, err.message);
  }
}

// ────── Manuel Buluta Yükle (buton için) ──────
window.manuelBulutaYukle = async function() {
  const localRaw = localStorage.getItem('serhat_insaat_kasa_v1');
  if (!localRaw) { alert('Yerel veri bulunamadı!'); return; }
  await saveToCloud(JSON.parse(localRaw));
  alert('✅ Veriler Firestore\'a başarıyla yüklendi!\n\nFirebase Console → Firestore → "kasa" koleksiyonu → "serhat" belgesini kontrol edin.');
};

// ────── Senkronizasyon Rozeti ──────
function updateSyncBadge(online) {
  const badge = document.querySelector('.badge-status');
  if (!badge) return;
  if (online) {
    badge.innerHTML = `<span class="status-dot" style="background:#22c55e;"></span> ☁️ Bulut Senkronize`;
  } else {
    badge.innerHTML = `<span class="status-dot" style="background:#f59e0b;"></span> ⚠️ Çevrimdışı / Yerel Kayıt`;
  }
}

// ────── Global API ──────
window.firebaseDB = {
  save: saveToCloud,
  load: loadFromCloud
};

// Sayfa yüklenince 1 saniye bekle, sonra bulutla senkronize et
// (app.js'in localStorage'ı yüklemesi için bekliyoruz)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadFromCloud, 1000);
});
