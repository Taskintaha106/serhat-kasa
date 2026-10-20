/* ==========================================================
   NALBUR KASA & VERESİYE SİSTEMİ - İŞ MANTIĞI & VERİTABANI
   ========================================================== */

const STORAGE_KEY = 'serhat_insaat_kasa_v1';

// Varsayılan Uygulama Durumu (State)
let appState = {
  transactions: [],
  customers: [],
  suppliers: [],
  proposals: [],
  priceList: [
    { id: '301', name: 'Gri Çimento 50kg', unit: 'Torba', barcode: '', buyPrice: 190, sellPrice: 240 },
    { id: '302', name: 'Saten Alçı 30kg', unit: 'Torba', barcode: '', buyPrice: 140, sellPrice: 185 },
    { id: '303', name: 'Kalekim Seramik Yapıştırıcı 25kg', unit: 'Torba', barcode: '', buyPrice: 160, sellPrice: 220 },
    { id: '304', name: 'Akfix Şeffaf Silikon 280ml', unit: 'Adet', barcode: '', buyPrice: 75, sellPrice: 110 }
  ],
  settings: {
    shopName: 'Serhat İnşaat',
    phone: '',
    address: ''
  }
};

let activeCustomerId = null;
let activeViewingProposalId = null;

// Performans İkon Optimizasyonu (requestAnimationFrame ile tek seferde toplu çizim)
let _lucideRaf = null;
function refreshIcons() {
  if (_lucideRaf) cancelAnimationFrame(_lucideRaf);
  _lucideRaf = requestAnimationFrame(() => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  });
}

// ==================== BAŞLANGIÇ & YÜKLEME ====================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initClock();
  setupTabs();
  renderAll();
});

// Verileri LocalStorage'dan Çek
function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      appState = JSON.parse(saved);
      if (!Array.isArray(appState.proposals)) appState.proposals = [];
    } catch (e) {
      console.error("Veri okuma hatası, varsayılan yüklendi.", e);
    }
  } else {
    // İlk defa açılıyorsa örnek başlangıç verisi ekleyelim
    seedInitialData();
  }
}

// Verileri Kaydet (Yerel + Bulut)
function saveData() {
  const now = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  localStorage.setItem(STORAGE_KEY + '_time', now);
  renderAll();
  // Firebase Firestore'a bulut yedeği al
  if (window.firebaseDB && window.firebaseDB.save) {
    window.firebaseDB.save(appState);
  }
}

// Buluttan gelen veriyi uygula (firebase-init.js tarafından çağrılır)
window.syncFromCloud = function(cloudData) {
  appState = cloudData;
  if (!Array.isArray(appState.proposals)) appState.proposals = [];
  if (appState.settings && appState.settings.shopName) {
    const titleEl = document.getElementById('headerShopTitle');
    if (titleEl) titleEl.textContent = appState.settings.shopName;
  }
  renderAll();
};

window.getAppState = function() {
  return appState;
};

window.clearAppState = function() {
  seedInitialData();
  renderAll();
};


// Saat ve Tarih Güncelleyici
function initClock() {
  function updateTime() {
    const now = new Date();
    const timeEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('liveDate');
    
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('tr-TR');
    if (dateEl) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('tr-TR', options);
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// Sekmeler Arası Geçiş
function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
      
      refreshIcons();
    });
  });
}

// ==================== GENEL HESAPLAMALAR VE KPI'LAR ====================

function renderAll() {
  updateKPIs();
  renderKasaTable();
  renderVeresiyeList();
  renderTeklifTable();
  renderToptanciTable();
  renderFiyatTable();
  renderRaporlar();
  renderSettings();
  refreshIcons();
}

function formatTL(num) {
  return '₺' + Number(num || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateKPIs() {
  let nakitKasa = 0;
  let bankaKasa = 0;
  let bugunCiro = 0;
  let bugunNetKar = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  appState.transactions.forEach(t => {
    const amount = Number(t.amount);
    const isToday = t.date.slice(0, 10) === todayStr;

    if (t.type === 'gelir') {
      if (t.kasa === 'nakit') nakitKasa += amount;
      if (t.kasa === 'kart' || t.kasa === 'havale') bankaKasa += amount;

      if (isToday) {
        bugunCiro += amount;
        bugunNetKar += amount;
      }
    } else if (t.type === 'gider') {
      if (t.kasa === 'nakit') nakitKasa -= amount;
      if (t.kasa === 'kart') bankaKasa -= amount;

      if (isToday) {
        bugunNetKar -= amount;
      }
    }
  });

  // Toplam Veresiye Alacağı
  const toplamAlacak = appState.customers.reduce((acc, c) => acc + Number(c.currentBalance || 0), 0);

  // Toplam Toptancı Borcu
  const toplamToptanciBorc = appState.suppliers.reduce((acc, s) => acc + (Number(s.totalPurchased || 0) - Number(s.totalPaid || 0)), 0);

  // DOM Elemanlarını Güncelle
  document.getElementById('kpiNakitKasa').textContent = formatTL(nakitKasa);
  document.getElementById('kpiBankaKasa').textContent = formatTL(bankaKasa);
  document.getElementById('kpiVeresiyeAlacak').textContent = formatTL(toplamAlacak);
  document.getElementById('kpiToptanciBorc').textContent = formatTL(toplamToptanciBorc);
  document.getElementById('kpiBugunCiro').textContent = formatTL(bugunCiro);
  document.getElementById('kpiBugunNetKar').textContent = `Günün Net Kârı: ${formatTL(bugunNetKar)}`;
  document.getElementById('badgeVeresiyeCount').textContent = appState.customers.filter(c => c.currentBalance > 0).length;

  const badgeTeklif = document.getElementById('badgeTeklifCount');
  if (badgeTeklif) {
    const pendingProposals = (appState.proposals || []).filter(p => p.status === 'pending').length;
    const totalProposals = (appState.proposals || []).length;
    if (totalProposals > 0) {
      badgeTeklif.textContent = pendingProposals > 0 ? pendingProposals : totalProposals;
      badgeTeklif.style.display = 'inline-block';
    } else {
      badgeTeklif.style.display = 'none';
    }
  }
}

// ==================== KASA HAREKETLERİ ====================

function handleGelirSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('gelirTutar').value);
  const kasa = document.getElementById('gelirKasaTuru').value;
  const category = document.getElementById('gelirKategori').value;
  const desc = document.getElementById('gelirAciklama').value || 'Satış';

  if (!amount || amount <= 0) return alert('Lütfen geçerli bir tutar girin.');

  const newTx = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    type: 'gelir',
    kasa: kasa,
    category: category,
    description: desc,
    amount: amount
  };

  appState.transactions.unshift(newTx);
  saveData();
  closeModal('gelirModal');
  e.target.reset();
  showToast(`₺${amount} tutarında gelir kasaya işlendi!`);
}

function handleGiderSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('giderTutar').value);
  const kasa = document.getElementById('giderKasaTuru').value;
  const category = document.getElementById('giderKategori').value;
  const desc = document.getElementById('giderAciklama').value || category;

  if (!amount || amount <= 0) return alert('Lütfen geçerli bir tutar girin.');

  const newTx = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    type: 'gider',
    kasa: kasa,
    category: category,
    description: desc,
    amount: amount
  };

  appState.transactions.unshift(newTx);
  saveData();
  closeModal('giderModal');
  e.target.reset();
  showToast(`₺${amount} masraf kaydedildi.`);
}

function renderKasaTable() {
  const tbody = document.getElementById('kasaTableBody');
  const filterZaman = document.getElementById('filterKasaZaman').value;
  const filterTur = document.getElementById('filterKasaTur').value;
  const search = document.getElementById('searchKasaInput').value.toLowerCase().trim();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let filtered = appState.transactions.filter(t => {
    // Zaman filtresi
    const tDate = t.date.slice(0, 10);
    if (filterZaman === 'today' && tDate !== todayStr) return false;
    if (filterZaman === 'week') {
      const diffDays = (now - new Date(t.date)) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return false;
    }
    if (filterZaman === 'month') {
      const diffDays = (now - new Date(t.date)) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) return false;
    }

    // Tür filtresi
    if (filterTur !== 'all' && t.type !== filterTur) return false;

    // Arama
    if (search) {
      const fullText = `${t.category} ${t.description} ${t.kasa}`.toLowerCase();
      if (!fullText.includes(search)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Kayıt bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const isGelir = t.type === 'gelir';
    const dateFormatted = new Date(t.date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const kasaBadge = t.kasa === 'nakit' ? '💵 Nakit' : (t.kasa === 'kart' ? '💳 Kart' : '🏦 Havale');

    return `
      <tr>
        <td><strong>${dateFormatted}</strong></td>
        <td>
          <span style="font-weight: 700; color: ${isGelir ? 'var(--green)' : 'var(--red)'};">
            ${isGelir ? '↑ Giriş (Gelir)' : '↓ Çıkış (Gider)'}
          </span>
        </td>
        <td><span class="badge-status">${kasaBadge}</span></td>
        <td>
          <div><strong>${escapeHtml(t.category)}</strong></div>
          <div class="text-muted text-sm">${escapeHtml(t.description)}</div>
        </td>
        <td class="text-right" style="font-weight: 800; font-size: 1rem; color: ${isGelir ? 'var(--green)' : 'var(--red)'};">
          ${isGelir ? '+' : '-'}${formatTL(t.amount)}
        </td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="deleteTransaction('${t.id}')" title="İşlemi Sil">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
}

function deleteTransaction(id) {
  if (!confirm('Bu kasa kaydını silmek istediğinize emin misiniz?')) return;
  appState.transactions = appState.transactions.filter(t => t.id !== id);
  saveData();
  showToast('Kasa hareketi silindi.');
}

// ==================== VERESİYE DEFTERİ (MÜŞTERİ / USTA) ====================

function handleMusteriSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('musteriAd').value.trim();
  const phone = document.getElementById('musteriTelefon').value.trim();
  const occupation = document.getElementById('musteriMeslek').value.trim();
  const notes = document.getElementById('musteriNot').value.trim();
  const initialDebt = parseFloat(document.getElementById('musteriBaslangicBorc').value) || 0;

  if (!name) return alert('Lütfen müşteri adını girin.');

  const newCustomer = {
    id: Date.now().toString(),
    name: name,
    phone: phone,
    occupation: occupation,
    notes: notes,
    currentBalance: initialDebt,
    history: initialDebt > 0 ? [{
      date: new Date().toISOString(),
      type: 'borc',
      amount: initialDebt,
      description: 'Açılış borç bakiyesi'
    }] : []
  };

  appState.customers.push(newCustomer);
  activeCustomerId = newCustomer.id;
  saveData();
  closeModal('veresiyeModal');
  e.target.reset();
  showToast(`${name} veresiye defterine kaydedildi.`);
}

function renderVeresiyeList() {
  const listEl = document.getElementById('musteriListesi');
  const search = document.getElementById('searchMusteriInput').value.toLowerCase().trim();

  let list = appState.customers;
  if (search) {
    list = list.filter(c => c.name.toLowerCase().includes(search) || (c.phone && c.phone.includes(search)) || (c.occupation && c.occupation.toLowerCase().includes(search)));
  }

  // Borcu yüksek olanları en üste sıralayalım
  list.sort((a, b) => b.currentBalance - a.currentBalance);

  if (list.length === 0) {
    listEl.innerHTML = `<div class="text-center text-muted" style="padding: 20px;">Kayıtlı müşteri bulunamadı.</div>`;
    renderCustomerDetail(null);
    return;
  }

  listEl.innerHTML = list.map(c => `
    <div class="musteri-card ${activeCustomerId === c.id ? 'active' : ''}" onclick="selectCustomer('${c.id}')">
      <div>
        <div class="musteri-card-name">${escapeHtml(c.name)}</div>
        <div class="musteri-card-role">${escapeHtml(c.occupation || 'Müşteri')} ${c.phone ? '• ' + escapeHtml(c.phone) : ''}</div>
      </div>
      <div class="musteri-card-balance">
        ${formatTL(c.currentBalance)}
      </div>
    </div>
  `).join('');

  if (!activeCustomerId && list.length > 0) {
    activeCustomerId = list[0].id;
  }

  const selected = appState.customers.find(c => c.id === activeCustomerId);
  renderCustomerDetail(selected);
}

function selectCustomer(id) {
  activeCustomerId = id;
  renderVeresiyeList();
}

function renderCustomerDetail(customer) {
  const box = document.getElementById('musteriDetailBox');
  if (!customer) {
    box.innerHTML = `
      <div class="empty-state">
        <i data-lucide="user-check"></i>
        <p>Hesap detaylarını ve işlem geçmişini görmek için soldan bir müşteri seçin.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  const historyHtml = (customer.history || []).map(h => {
    const isBorc = h.type === 'borc';
    const dateFormatted = new Date(h.date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td>${dateFormatted}</td>
        <td><strong style="color: ${isBorc ? 'var(--amber)' : 'var(--green)'}">${isBorc ? 'Malzeme Çıkışı (Borç)' : 'Tahsilat (Ödeme)'}</strong></td>
        <td>${escapeHtml(h.description)}</td>
        <td class="text-right" style="font-weight: 700; color: ${isBorc ? 'var(--amber)' : 'var(--green)'}">
          ${isBorc ? '+' : '-'}${formatTL(h.amount)}
        </td>
      </tr>
    `;
  }).reverse().join('');

  box.innerHTML = `
    <div style="background: #fff; border-radius: var(--radius-md); padding: 20px; border: 1px solid var(--border-color);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 1.4rem; font-weight: 800;">${escapeHtml(customer.name)}</h2>
          <div class="text-muted" style="margin-top: 4px;">
            ${escapeHtml(customer.occupation || 'Müşteri')} • 📞 ${escapeHtml(customer.phone || 'Telefon yok')}
          </div>
          ${customer.notes ? `<div style="font-size: 0.85rem; background: #f8fafc; padding: 6px 10px; border-radius: 4px; margin-top: 8px;"><strong>Not:</strong> ${escapeHtml(customer.notes)}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div class="text-muted text-sm">GÜNCEL TOPLAM BORÇ</div>
          <div style="font-size: 1.8rem; font-weight: 900; color: var(--amber);">${formatTL(customer.currentBalance)}</div>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
        <button class="btn btn-amber" onclick="openBorcEkleModal('${customer.id}')">
          <i data-lucide="plus"></i> Malzeme Ver (Borçlandır)
        </button>
        <button class="btn btn-success" onclick="openTahsilatModal('${customer.id}')">
          <i data-lucide="hand-coins"></i> Tahsilat Al (Borçtan Düş)
        </button>
        <button class="btn btn-secondary" onclick="sendWhatsappReminder('${customer.id}')" title="WhatsApp Hatırlatma Mesajı Hazırla">
          <i data-lucide="message-circle"></i> WhatsApp Mesajı
        </button>
        <button class="btn btn-danger-outline" onclick="deleteCustomer('${customer.id}')" style="margin-left: auto;">
          <i data-lucide="trash-2"></i> Müşteriyi Sil
        </button>
      </div>

      <h4 style="margin-bottom: 10px; font-weight: 700;">Hesap Ekstresi & Veresiye Hareketleri</h4>
      <div class="table-responsive" style="max-height: 340px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>İşlem</th>
              <th>Açıklama / Alınan Malzemeler</th>
              <th class="text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml || '<tr><td colspan="4" class="text-center text-muted">Henüz işlem hareketi yok.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  refreshIcons();
}

function openBorcEkleModal(id) {
  const c = appState.customers.find(item => item.id === id);
  if (!c) return;
  document.getElementById('borcMusteriId').value = c.id;
  document.getElementById('borcMusteriInfo').textContent = `${c.name} - Mevcut Borç: ${formatTL(c.currentBalance)}`;
  document.getElementById('borcTutar').value = '';
  document.getElementById('borcDetay').value = '';
  openModal('borcEkleModal');
}

function handleBorcEkleSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('borcMusteriId').value;
  const amount = parseFloat(document.getElementById('borcTutar').value);
  const detail = document.getElementById('borcDetay').value.trim();

  if (!amount || amount <= 0) return alert('Geçerli bir tutar girin.');

  const customer = appState.customers.find(c => c.id === id);
  if (!customer) return;

  customer.currentBalance = (customer.currentBalance || 0) + amount;
  customer.history.push({
    date: new Date().toISOString(),
    type: 'borc',
    amount: amount,
    description: detail
  });

  saveData();
  closeModal('borcEkleModal');
  showToast(`${customer.name} hesabına ${formatTL(amount)} borç eklendi.`);
}

function openTahsilatModal(id) {
  const c = appState.customers.find(item => item.id === id);
  if (!c) return;
  document.getElementById('tahsilatMusteriId').value = c.id;
  document.getElementById('tahsilatMusteriInfo').textContent = `${c.name} - Ödenecek Borç: ${formatTL(c.currentBalance)}`;
  document.getElementById('tahsilatTutar').value = c.currentBalance > 0 ? c.currentBalance : '';
  openModal('tahsilatModal');
}

function handleTahsilatSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('tahsilatMusteriId').value;
  const amount = parseFloat(document.getElementById('tahsilatTutar').value);
  const kasa = document.getElementById('tahsilatKasaTuru').value;
  const desc = document.getElementById('tahsilatAciklama').value.trim() || 'Veresiye Tahsilatı';

  if (!amount || amount <= 0) return alert('Geçerli bir tutar girin.');

  const customer = appState.customers.find(c => c.id === id);
  if (!customer) return;

  customer.currentBalance = Math.max(0, (customer.currentBalance || 0) - amount);
  customer.history.push({
    date: new Date().toISOString(),
    type: 'tahsilat',
    amount: amount,
    description: `${desc} (${kasa === 'nakit' ? 'Nakit' : 'Banka/Kart'})`
  });

  // Tahsil edilen para doğrudan Kasaya Gelir olarak yansır!
  appState.transactions.unshift({
    id: Date.now().toString(),
    date: new Date().toISOString(),
    type: 'gelir',
    kasa: kasa,
    category: 'Veresiye Tahsilatı',
    description: `${customer.name} - ${desc}`,
    amount: amount
  });

  saveData();
  closeModal('tahsilatModal');
  showToast(`${formatTL(amount)} tahsil edildi ve kasaya işlendi.`);
}

function sendWhatsappReminder(id) {
  const customer = appState.customers.find(c => c.id === id);
  if (!customer) return;

  const shop = appState.settings.shopName || 'Nalbur dükkanımız';
  const text = `Sayın ${customer.name}, ${shop} bünyesindeki güncel açık hesap bakiyeniz ${formatTL(customer.currentBalance)}'dir. Bilgilerinize sunar, hayırlı işler dileriz.`;
  
  if (customer.phone) {
    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/90${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  } else {
    navigator.clipboard.writeText(text);
    alert(`Müşterinin kayıtlı telefonu yok. Hazırlanan mesaj panoya kopyalandı:\n\n"${text}"`);
  }
}

function deleteCustomer(id) {
  const c = appState.customers.find(item => item.id === id);
  if (!c) return;
  if (!confirm(`${c.name} isimli müşteriyi ve tüm hesap dökümünü silmek istediğinize emin misiniz?`)) return;

  appState.customers = appState.customers.filter(item => item.id !== id);
  activeCustomerId = null;
  saveData();
  showToast('Müşteri hesabı silindi.');
}

// ==================== TOPTANCI & TEDARİKÇİ ====================

function handleToptanciSubmit(e) {
  e.preventDefault();
  const company = document.getElementById('toptanciFirma').value.trim();
  const contact = document.getElementById('toptanciYetkili').value.trim();
  const phone = document.getElementById('toptanciTelefon').value.trim();
  const faturaTutar = parseFloat(document.getElementById('toptanciFaturaTutar').value) || 0;
  const pesinTutar = parseFloat(document.getElementById('toptanciPesinTutar').value) || 0;
  const notes = document.getElementById('toptanciNot').value.trim();

  if (!company) return alert('Lütfen toptancı firma adını girin.');

  let existing = appState.suppliers.find(s => s.company.toLowerCase() === company.toLowerCase());
  
  if (existing) {
    existing.totalPurchased = (existing.totalPurchased || 0) + faturaTutar;
    existing.totalPaid = (existing.totalPaid || 0) + pesinTutar;
    existing.invoices.push({
      date: new Date().toISOString(),
      faturaTutar: faturaTutar,
      pesinTutar: pesinTutar,
      notes: notes
    });
  } else {
    appState.suppliers.push({
      id: Date.now().toString(),
      company: company,
      contact: contact,
      phone: phone,
      totalPurchased: faturaTutar,
      totalPaid: pesinTutar,
      invoices: [{
        date: new Date().toISOString(),
        faturaTutar: faturaTutar,
        pesinTutar: pesinTutar,
        notes: notes
      }]
    });
  }

  // Eğer peşin ödeme yapıldıysa, kasadan gider düş
  if (pesinTutar > 0) {
    appState.transactions.unshift({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: 'gider',
      kasa: 'nakit',
      category: 'Toptancı Mal Alımı',
      description: `${company} peşin mal ödemesi`,
      amount: pesinTutar
    });
  }

  saveData();
  closeModal('toptanciModal');
  e.target.reset();
  showToast(`${company} faturası kaydedildi.`);
}

function renderToptanciTable() {
  const tbody = document.getElementById('toptanciTableBody');
  const search = document.getElementById('searchToptanciInput').value.toLowerCase().trim();

  let list = appState.suppliers;
  if (search) {
    list = list.filter(s => s.company.toLowerCase().includes(search) || (s.contact && s.contact.toLowerCase().includes(search)));
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Kayıtlı toptancı bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const kalanBorc = (s.totalPurchased || 0) - (s.totalPaid || 0);
    return `
      <tr>
        <td><strong>${escapeHtml(s.company)}</strong></td>
        <td>${escapeHtml(s.contact || '-')} ${s.phone ? `(${escapeHtml(s.phone)})` : ''}</td>
        <td>${formatTL(s.totalPurchased)}</td>
        <td class="text-green">${formatTL(s.totalPaid)}</td>
        <td style="font-weight: 800; font-size: 1rem; color: ${kalanBorc > 0 ? 'var(--red)' : 'var(--green)'};">
          ${formatTL(kalanBorc)}
        </td>
        <td class="text-center">
          <button class="btn btn-danger btn-sm" onclick="openToptanciOdemeModal('${s.id}')">
            <i data-lucide="send"></i> Ödeme Yap
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteSupplier('${s.id}')">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
}

function openToptanciOdemeModal(id) {
  const s = appState.suppliers.find(item => item.id === id);
  if (!s) return;
  const kalan = (s.totalPurchased || 0) - (s.totalPaid || 0);
  document.getElementById('odemeToptanciId').value = s.id;
  document.getElementById('odemeToptanciInfo').textContent = `${s.company} - Kalan Borcumuz: ${formatTL(kalan)}`;
  document.getElementById('odemeTutar').value = kalan > 0 ? kalan : '';
  openModal('toptanciOdemeModal');
}

function handleToptanciOdemeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('odemeToptanciId').value;
  const amount = parseFloat(document.getElementById('odemeTutar').value);
  const kasa = document.getElementById('odemeKasaTuru').value;
  const desc = document.getElementById('odemeAciklama').value.trim() || 'Toptancı Borç Ödemesi';

  if (!amount || amount <= 0) return alert('Geçerli bir tutar girin.');

  const supplier = appState.suppliers.find(s => s.id === id);
  if (!supplier) return;

  supplier.totalPaid = (supplier.totalPaid || 0) + amount;

  // Kasadan Gider Olarak Düş
  appState.transactions.unshift({
    id: Date.now().toString(),
    date: new Date().toISOString(),
    type: 'gider',
    kasa: kasa,
    category: 'Toptancı Ödemesi',
    description: `${supplier.company} - ${desc}`,
    amount: amount
  });

  saveData();
  closeModal('toptanciOdemeModal');
  showToast(`${supplier.company} firmasına ${formatTL(amount)} ödeme yapıldı.`);
}

function deleteSupplier(id) {
  const s = appState.suppliers.find(item => item.id === id);
  if (!s) return;
  if (!confirm(`${s.company} toptancısını ve tüm kayıtlarını silmek istediğinize emin misiniz?`)) return;
  appState.suppliers = appState.suppliers.filter(item => item.id !== id);
  saveData();
  showToast('Toptancı silindi.');
}

// ==================== HIZLI FİYAT REHBERİ ====================

function handleFiyatSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('fiyatUrunAdi').value.trim();
  const unit = document.getElementById('fiyatBirim').value.trim() || 'Adet';
  const barcode = document.getElementById('fiyatBarkod').value.trim();
  const buyPrice = parseFloat(document.getElementById('fiyatAlis').value) || 0;
  const sellPrice = parseFloat(document.getElementById('fiyatSatis').value) || 0;

  if (!name || sellPrice <= 0) return alert('Lütfen ürün adını ve satış fiyatını girin.');

  appState.priceList.push({
    id: Date.now().toString(),
    name: name,
    unit: unit,
    barcode: barcode,
    buyPrice: buyPrice,
    sellPrice: sellPrice
  });

  saveData();
  closeModal('fiyatModal');
  e.target.reset();
  document.getElementById('karOraniGosterge').textContent = '';
  showToast(`${name} fiyat listesine eklendi.`);
}

function hesaplaKarOrani() {
  const buy = parseFloat(document.getElementById('fiyatAlis').value) || 0;
  const sell = parseFloat(document.getElementById('fiyatSatis').value) || 0;
  const el = document.getElementById('karOraniGosterge');

  if (buy > 0 && sell > 0) {
    const kar = sell - buy;
    const oran = ((kar / buy) * 100).toFixed(1);
    el.textContent = `Tahmini Kâr: ${formatTL(kar)} (%${oran})`;
  } else {
    el.textContent = '';
  }
}

function renderFiyatTable() {
  const tbody = document.getElementById('fiyatTableBody');
  const search = document.getElementById('searchFiyatInput').value.toLowerCase().trim();

  let list = appState.priceList;
  if (search) {
    list = list.filter(p => p.name.toLowerCase().includes(search) || (p.barcode && p.barcode.includes(search)) || p.unit.toLowerCase().includes(search));
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">Kayıtlı ürün fiyatı bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const kar = p.sellPrice - (p.buyPrice || 0);
    const oran = p.buyPrice > 0 ? ((kar / p.buyPrice) * 100).toFixed(0) : '-';

    return `
      <tr>
        <td>
          <strong>${escapeHtml(p.name)}</strong>
          ${p.barcode ? `<div class="text-muted text-sm">Barkod: ${escapeHtml(p.barcode)}</div>` : ''}
        </td>
        <td><span class="badge-status">${escapeHtml(p.unit)}</span></td>
        <td>${p.buyPrice > 0 ? formatTL(p.buyPrice) : '-'}</td>
        <td style="font-size: 1.05rem; font-weight: 800; color: var(--primary);">${formatTL(p.sellPrice)}</td>
        <td class="text-green font-semibold">%${oran}</td>
        <td class="text-center">
          <button class="btn btn-secondary btn-sm" onclick="deletePriceItem('${p.id}')">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
}

function deletePriceItem(id) {
  appState.priceList = appState.priceList.filter(p => p.id !== id);
  saveData();
  showToast('Ürün fiyat listesinden kaldırıldı.');
}

// ==================== RAPORLAR & GÜN SONU ====================

function renderRaporlar() {
  let aylikCiro = 0;
  let aylikGider = 0;
  let aylikTahsilat = 0;
  const giderKategorileri = {};

  const now = new Date();

  appState.transactions.forEach(t => {
    const tDate = new Date(t.date);
    const isThisMonth = tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();

    if (isThisMonth) {
      if (t.type === 'gelir') {
        aylikCiro += Number(t.amount);
        if (t.category === 'Veresiye Tahsilatı') aylikTahsilat += Number(t.amount);
      } else if (t.type === 'gider') {
        aylikGider += Number(t.amount);
        const cat = t.category || 'Diğer';
        giderKategorileri[cat] = (giderKategorileri[cat] || 0) + Number(t.amount);
      }
    }
  });

  document.getElementById('raporAylikCiro').textContent = formatTL(aylikCiro);
  document.getElementById('raporAylikGider').textContent = formatTL(aylikGider);
  document.getElementById('raporAylikTahsilat').textContent = formatTL(aylikTahsilat);
  document.getElementById('raporAylikNet').textContent = formatTL(aylikCiro - aylikGider);

  const katListEl = document.getElementById('giderKategoriListesi');
  const katEntries = Object.entries(giderKategorileri);

  if (katEntries.length === 0) {
    katListEl.innerHTML = `<div class="text-muted">Bu ay henüz gider kaydı bulunmuyor.</div>`;
  } else {
    katListEl.innerHTML = katEntries.map(([kat, tutar]) => `
      <div class="kategori-item">
        <span><strong>${escapeHtml(kat)}</strong></span>
        <span class="text-red font-bold">${formatTL(tutar)}</span>
      </div>
    `).join('');
  }
}

function openGunSonuModal() {
  const todayStr = new Date().toISOString().slice(0, 10);
  let nakitSatis = 0;
  let kartSatis = 0;
  let tahsilat = 0;
  let giderler = 0;
  let nakitCekmece = 0;

  // Tüm geçmişten fiziksel nakit çekmeceyi hesapla
  appState.transactions.forEach(t => {
    if (t.kasa === 'nakit') {
      if (t.type === 'gelir') nakitCekmece += Number(t.amount);
      if (t.type === 'gider') nakitCekmece -= Number(t.amount);
    }

    if (t.date.slice(0, 10) === todayStr) {
      if (t.type === 'gelir') {
        if (t.category === 'Veresiye Tahsilatı') {
          tahsilat += Number(t.amount);
        } else if (t.kasa === 'nakit') {
          nakitSatis += Number(t.amount);
        } else {
          kartSatis += Number(t.amount);
        }
      } else if (t.type === 'gider') {
        giderler += Number(t.amount);
      }
    }
  });

  // Bugün verilen yeni veresiye
  let yeniVeresiye = 0;
  appState.customers.forEach(c => {
    (c.history || []).forEach(h => {
      if (h.type === 'borc' && h.date.slice(0, 10) === todayStr) {
        yeniVeresiye += Number(h.amount);
      }
    });
  });

  document.getElementById('gunSonuDukkanAdi').textContent = appState.settings.shopName || 'Nalbur Kasa Defteri';
  document.getElementById('gunSonuTarihSaat').textContent = new Date().toLocaleString('tr-TR');

  document.getElementById('gsNakitSatis').textContent = formatTL(nakitSatis);
  document.getElementById('gsKartSatis').textContent = formatTL(kartSatis);
  document.getElementById('gsTahsilat').textContent = formatTL(tahsilat);
  document.getElementById('gsYeniVeresiye').textContent = formatTL(yeniVeresiye);
  document.getElementById('gsGiderler').textContent = formatTL(giderler);
  document.getElementById('gsToplamCiro').textContent = formatTL(nakitSatis + kartSatis + tahsilat);
  document.getElementById('gsCekmeceNakit').textContent = formatTL(nakitCekmece);

  // Gün sonu modalı açılırken arka planda otomatik güvenlik yedeği al
  createInternalBackup('Gün Sonu Otomatik Yedeği', true);

  openModal('gunSonuModal');
}

function printGunSonu() {
  document.body.classList.add('printing-modal');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-modal'), 500);
}

// ==================== TEKLİFLER & FİYATLANDIRMA MODÜLÜ ====================

function populateProposalDatalists() {
  const custList = document.getElementById('customerDatalist');
  if (custList) {
    custList.innerHTML = (appState.customers || [])
      .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.phone || '')} ${escapeHtml(c.profession || '')}</option>`)
      .join('');
  }

  const priceListEl = document.getElementById('priceListDatalist');
  if (priceListEl) {
    priceListEl.innerHTML = (appState.priceList || [])
      .map(p => `<option value="${escapeHtml(p.name)}">${formatTL(p.sellPrice)} / ${escapeHtml(p.unit || 'Adet')}</option>`)
      .join('');
  }
}

function onProposalCustomerInput(val) {
  const clean = (val || '').trim().toLowerCase();
  if (!clean) return;
  const matched = (appState.customers || []).find(c => (c.name || '').trim().toLowerCase() === clean);
  if (matched) {
    const phoneInput = document.getElementById('propCustomerPhone');
    const siteInput = document.getElementById('propSiteName');
    if (phoneInput && !phoneInput.value && matched.phone) {
      phoneInput.value = matched.phone;
    }
    if (siteInput && !siteInput.value && matched.notes) {
      siteInput.value = matched.notes;
    }
  }
}

function openProposalModal(editId = null) {
  populateProposalDatalists();
  const titleEl = document.getElementById('proposalModalTitle');
  const rowsContainer = document.getElementById('propRowsContainer');
  if (!rowsContainer) return;

  rowsContainer.innerHTML = '';

  if (editId) {
    const prop = (appState.proposals || []).find(p => p.id === editId);
    if (!prop) return;

    if (titleEl) titleEl.innerHTML = `<i data-lucide="file-spreadsheet"></i> Teklifi Düzenle (${escapeHtml(prop.proposalNo)})`;
    document.getElementById('propEditId').value = prop.id;
    document.getElementById('propCustomerName').value = prop.customerName || '';
    document.getElementById('propCustomerPhone').value = prop.customerPhone || '';
    document.getElementById('propCustomerEmail').value = prop.customerEmail || '';
    document.getElementById('propSiteName').value = prop.siteName || '';
    document.getElementById('propDate').value = (prop.date || new Date().toISOString()).slice(0, 10);
    document.getElementById('propValidity').value = prop.validity || '7 Gün Geçerlidir';
    document.getElementById('propPaymentTerms').value = prop.paymentTerms || 'Peşin / Nakit Ödeme';
    document.getElementById('propTaxRate').value = prop.taxMode !== undefined ? String(prop.taxMode) : '20';
    document.getElementById('propNotes').value = prop.notes || '';
    document.getElementById('propExtraDiscount').value = prop.extraDiscount || 0;

    (prop.items || []).forEach(item => addProposalRow(item));
    if (!prop.items || prop.items.length === 0) {
      addProposalRow();
    }
  } else {
    if (titleEl) titleEl.innerHTML = `<i data-lucide="file-spreadsheet"></i> Yeni Fiyat Teklifi Hazırla`;
    document.getElementById('propEditId').value = '';
    document.getElementById('propCustomerName').value = '';
    document.getElementById('propCustomerPhone').value = '';
    document.getElementById('propCustomerEmail').value = '';
    document.getElementById('propSiteName').value = '';
    document.getElementById('propDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('propValidity').value = '7 Gün Geçerlidir';
    document.getElementById('propPaymentTerms').value = 'Peşin / Nakit Ödeme';
    document.getElementById('propTaxRate').value = '20';
    document.getElementById('propNotes').value = 'Fiyatlarımız stoklarla sınırlıdır. Sevkiyat ve teslimat programı için lütfen sipariş onayı veriniz.';
    document.getElementById('propExtraDiscount').value = 0;

    // Varsayılan 3 boş malzeme satırı aç
    addProposalRow();
    addProposalRow();
    addProposalRow();
  }

  calculateProposalTotals();
  openModal('proposalModal');
  refreshIcons();
}

function addProposalRow(itemData = null) {
  const container = document.getElementById('propRowsContainer');
  if (!container) return;

  const units = ['Torba', 'Adet', 'Kg', 'Ton', 'Metre', 'm²', 'm³', 'Kutu', 'Koli', 'Paket', 'Takım', 'Rulo', 'Teneke'];
  const selectedUnit = itemData && itemData.unit ? itemData.unit : 'Adet';
  const unitOptions = units.map(u => `<option value="${u}" ${u.toLowerCase() === selectedUnit.toLowerCase() ? 'selected' : ''}>${u}</option>`).join('');

  const row = document.createElement('div');
  row.className = 'teklif-row-item';
  row.innerHTML = `
    <div>
      <input type="text" class="prop-item-name" list="priceListDatalist" placeholder="Malzeme seçin veya yazın..." value="${escapeHtml(itemData ? itemData.name : '')}" oninput="onProposalItemNameInput(this)">
    </div>
    <div>
      <input type="number" step="any" min="0.01" class="prop-item-qty" value="${itemData && itemData.qty !== undefined ? itemData.qty : 1}" oninput="calculateProposalTotals()">
    </div>
    <div>
      <select class="prop-item-unit" onchange="calculateProposalTotals()">
        ${unitOptions}
      </select>
    </div>
    <div>
      <input type="number" step="0.01" min="0" class="prop-item-price" placeholder="0.00" value="${itemData && itemData.unitPrice !== undefined ? itemData.unitPrice : ''}" oninput="calculateProposalTotals()">
    </div>
    <div>
      <input type="number" step="0.1" min="0" max="100" class="prop-item-disc" placeholder="0" value="${itemData && itemData.discount ? itemData.discount : 0}" oninput="calculateProposalTotals()">
    </div>
    <div style="text-align:right; font-weight:700; color:var(--text-dark);" class="prop-item-total">
      ₺0,00
    </div>
    <div class="text-center">
      <button type="button" class="btn-icon delete" onclick="removeProposalRow(this)" title="Satırı Sil">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;

  container.appendChild(row);
  calculateProposalTotals();
  refreshIcons();
}

function onProposalItemNameInput(inputEl) {
  const val = (inputEl.value || '').trim().toLowerCase();
  if (!val) {
    calculateProposalTotals();
    return;
  }
  const matched = (appState.priceList || []).find(p => (p.name || '').trim().toLowerCase() === val);
  if (matched) {
    const row = inputEl.closest('.teklif-row-item');
    if (row) {
      const priceInput = row.querySelector('.prop-item-price');
      const unitSelect = row.querySelector('.prop-item-unit');
      if (priceInput && (!priceInput.value || Number(priceInput.value) === 0)) {
        priceInput.value = matched.sellPrice;
      }
      if (unitSelect && matched.unit) {
        const opts = Array.from(unitSelect.options);
        const foundOpt = opts.find(o => o.value.toLowerCase() === matched.unit.trim().toLowerCase());
        if (foundOpt) {
          unitSelect.value = foundOpt.value;
        } else {
          const customOpt = document.createElement('option');
          customOpt.value = matched.unit.trim();
          customOpt.textContent = matched.unit.trim();
          customOpt.selected = true;
          unitSelect.appendChild(customOpt);
        }
      }
    }
  }
  calculateProposalTotals();
}

function removeProposalRow(btnEl) {
  const container = document.getElementById('propRowsContainer');
  const row = btnEl.closest('.teklif-row-item');
  if (!container || !row) return;

  if (container.querySelectorAll('.teklif-row-item').length <= 1) {
    row.querySelector('.prop-item-name').value = '';
    row.querySelector('.prop-item-qty').value = 1;
    row.querySelector('.prop-item-price').value = '';
    row.querySelector('.prop-item-disc').value = 0;
  } else {
    row.remove();
  }
  calculateProposalTotals();
}

function calculateProposalTotals() {
  const rows = document.querySelectorAll('#propRowsContainer .teklif-row-item');
  let subTotal = 0;
  let rowDiscountTotal = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.prop-item-qty')?.value) || 0;
    const price = parseFloat(row.querySelector('.prop-item-price')?.value) || 0;
    const discPct = Math.min(100, Math.max(0, parseFloat(row.querySelector('.prop-item-disc')?.value) || 0));

    const gross = qty * price;
    const discAmt = gross * (discPct / 100);
    const netLine = Math.max(0, gross - discAmt);

    subTotal += gross;
    rowDiscountTotal += discAmt;

    const totalEl = row.querySelector('.prop-item-total');
    if (totalEl) totalEl.textContent = formatTL(netLine);
  });

  const extraDiscount = Math.max(0, parseFloat(document.getElementById('propExtraDiscount')?.value) || 0);
  const totalDiscount = rowDiscountTotal + extraDiscount;
  const netBeforeTax = Math.max(0, subTotal - totalDiscount);

  const taxMode = document.getElementById('propTaxRate')?.value || '20';
  let taxAmount = 0;
  let grandTotal = netBeforeTax;

  if (taxMode === '20' || taxMode === '10') {
    const rate = parseFloat(taxMode);
    taxAmount = netBeforeTax * (rate / 100);
    grandTotal = netBeforeTax + taxAmount;
  }

  const subEl = document.getElementById('propSubTotalText');
  const discEl = document.getElementById('propDiscountTotalText');
  const taxEl = document.getElementById('propTaxTotalText');
  const grandEl = document.getElementById('propGrandTotalText');

  if (subEl) subEl.textContent = formatTL(subTotal);
  if (discEl) discEl.textContent = '-' + formatTL(totalDiscount);
  if (taxEl) taxEl.textContent = taxMode === 'included' ? 'Dahil' : formatTL(taxAmount);
  if (grandEl) grandEl.textContent = formatTL(grandTotal);

  return {
    subTotal,
    rowDiscountTotal,
    extraDiscount,
    totalDiscount,
    netBeforeTax,
    taxMode,
    taxAmount,
    grandTotal
  };
}

function generateNextProposalNo() {
  const year = new Date().getFullYear();
  const count = (appState.proposals || []).length + 1;
  return `TKL-${year}-${String(count).padStart(3, '0')}`;
}

function handleProposalSubmit(e) {
  e.preventDefault();
  if (!Array.isArray(appState.proposals)) appState.proposals = [];

  const editId = document.getElementById('propEditId').value;
  const customerName = document.getElementById('propCustomerName').value.trim();
  if (!customerName) return alert('Lütfen müşteri veya firma adını girin.');

  const rows = document.querySelectorAll('#propRowsContainer .teklif-row-item');
  const items = [];

  rows.forEach(row => {
    const name = (row.querySelector('.prop-item-name')?.value || '').trim();
    const qty = parseFloat(row.querySelector('.prop-item-qty')?.value) || 0;
    const unit = row.querySelector('.prop-item-unit')?.value || 'Adet';
    const unitPrice = parseFloat(row.querySelector('.prop-item-price')?.value) || 0;
    const discount = Math.min(100, Math.max(0, parseFloat(row.querySelector('.prop-item-disc')?.value) || 0));

    if (name && qty > 0) {
      const gross = qty * unitPrice;
      const lineTotal = Math.max(0, gross - (gross * (discount / 100)));
      items.push({
        name,
        qty,
        unit,
        unitPrice,
        discount,
        lineTotal
      });
    }
  });

  if (items.length === 0) {
    return alert('Lütfen teklife en az 1 malzeme kalemi ekleyin.');
  }

  const totals = calculateProposalTotals();
  let savedPropId = editId;

  if (editId) {
    const existing = appState.proposals.find(p => p.id === editId);
    if (existing) {
      existing.customerName = customerName;
      existing.customerPhone = document.getElementById('propCustomerPhone').value.trim();
      existing.customerEmail = document.getElementById('propCustomerEmail').value.trim();
      existing.siteName = document.getElementById('propSiteName').value.trim();
      existing.date = document.getElementById('propDate').value || new Date().toISOString().slice(0, 10);
      existing.validity = document.getElementById('propValidity').value;
      existing.paymentTerms = document.getElementById('propPaymentTerms').value;
      existing.notes = document.getElementById('propNotes').value.trim();
      existing.items = items;
      existing.subTotal = totals.subTotal;
      existing.extraDiscount = totals.extraDiscount;
      existing.totalDiscount = totals.totalDiscount;
      existing.taxMode = totals.taxMode;
      existing.taxAmount = totals.taxAmount;
      existing.grandTotal = totals.grandTotal;
      existing.updatedAt = new Date().toISOString();
    }
  } else {
    savedPropId = 'prop_' + Date.now();
    const newProposal = {
      id: savedPropId,
      proposalNo: generateNextProposalNo(),
      createdAt: new Date().toISOString(),
      date: document.getElementById('propDate').value || new Date().toISOString().slice(0, 10),
      customerName,
      customerPhone: document.getElementById('propCustomerPhone').value.trim(),
      customerEmail: document.getElementById('propCustomerEmail').value.trim(),
      siteName: document.getElementById('propSiteName').value.trim(),
      validity: document.getElementById('propValidity').value,
      paymentTerms: document.getElementById('propPaymentTerms').value,
      notes: document.getElementById('propNotes').value.trim(),
      status: 'pending',
      items,
      subTotal: totals.subTotal,
      extraDiscount: totals.extraDiscount,
      totalDiscount: totals.totalDiscount,
      taxMode: totals.taxMode,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal
    };
    appState.proposals.unshift(newProposal);
  }

  saveData();
  closeModal('proposalModal');
  showToast('✅ Fiyat teklifi kaydedildi! Şimdi müşteriye gönderebilir veya indirebilirsiniz.');
  openProposalViewModal(savedPropId);
}

function getProposalStatusBadgeHTML(status) {
  if (status === 'approved') {
    return `<span class="badge-status-approved">✅ Onaylandı</span>`;
  }
  if (status === 'rejected') {
    return `<span class="badge-status-rejected">❌ Reddedildi</span>`;
  }
  return `<span class="badge-status-pending">⏳ Beklemede</span>`;
}

function renderTeklifTable() {
  const tbody = document.getElementById('teklifTableBody');
  if (!tbody) return;

  const proposals = appState.proposals || [];

  // İstatistikleri hesapla
  let toplamTutar = 0;
  let bekleyenTutar = 0;
  let bekleyenCount = 0;
  let onaylananTutar = 0;
  let onaylananCount = 0;

  proposals.forEach(p => {
    const gt = Number(p.grandTotal || 0);
    toplamTutar += gt;
    if (p.status === 'approved') {
      onaylananTutar += gt;
      onaylananCount++;
    } else if (p.status === 'pending' || !p.status) {
      bekleyenTutar += gt;
      bekleyenCount++;
    }
  });

  const elTopTutar = document.getElementById('teklifOzetToplamTutar');
  const elTopCount = document.getElementById('teklifOzetToplamCount');
  const elBekTutar = document.getElementById('teklifOzetBekleyenTutar');
  const elBekCount = document.getElementById('teklifOzetBekleyenCount');
  const elOnayTutar = document.getElementById('teklifOzetOnaylananTutar');
  const elOnayCount = document.getElementById('teklifOzetOnaylananCount');

  if (elTopTutar) elTopTutar.textContent = formatTL(toplamTutar);
  if (elTopCount) elTopCount.textContent = `${proposals.length} adet teklif`;
  if (elBekTutar) elBekTutar.textContent = formatTL(bekleyenTutar);
  if (elBekCount) elBekCount.textContent = `${bekleyenCount} adet beklemede`;
  if (elOnayTutar) elOnayTutar.textContent = formatTL(onaylananTutar);
  if (elOnayCount) elOnayCount.textContent = `${onaylananCount} adet onaylandı`;

  const search = (document.getElementById('searchTeklifInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('filterTeklifDurum')?.value || 'all';

  const filtered = proposals.filter(p => {
    if (statusFilter !== 'all' && (p.status || 'pending') !== statusFilter) return false;
    if (search) {
      const itemsText = (p.items || []).map(i => i.name).join(' ');
      const haystack = `${p.proposalNo} ${p.customerName} ${p.customerPhone} ${p.customerEmail} ${p.siteName} ${itemsText}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding: 28px;">
          Henüz kayıtlı fiyat teklifi bulunmuyor. Sağ üstteki <strong>"+ Yeni Teklif Hazırla"</strong> butonuna tıklayarak ilk teklifinizi oluşturabilirsiniz.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const dateFormatted = p.date ? new Date(p.date).toLocaleDateString('tr-TR') : '-';
    const itemCount = (p.items || []).length;
    const itemPreview = (p.items || []).slice(0, 2).map(i => `${i.qty} ${i.unit} ${i.name}`).join(', ');
    const moreText = itemCount > 2 ? ` +${itemCount - 2} kalem daha` : '';

    const taxLabel = p.taxMode === '20' ? '+%20 KDV Dahil' : (p.taxMode === '10' ? '+%10 KDV Dahil' : (p.taxMode === 'included' ? 'KDV Dahil' : 'KDV Hariç'));

    return `
      <tr>
        <td>
          <div><strong style="color:var(--blue); cursor:pointer;" onclick="openProposalViewModal('${p.id}')">${escapeHtml(p.proposalNo)}</strong></div>
          <div class="text-xs text-muted">${dateFormatted} &bull; ${escapeHtml(p.validity || '')}</div>
        </td>
        <td>
          <div><strong>${escapeHtml(p.customerName)}</strong></div>
          <div class="text-xs text-muted">
            ${p.customerPhone ? `📞 ${escapeHtml(p.customerPhone)}` : ''}
            ${p.customerEmail ? ` ✉️ ${escapeHtml(p.customerEmail)}` : ''}
          </div>
        </td>
        <td>
          <div>${escapeHtml(p.siteName || '-')}</div>
          <div class="text-xs text-muted">${escapeHtml(p.paymentTerms || '')}</div>
        </td>
        <td>
          <div><strong>${itemCount} Kalem Malzeme</strong></div>
          <div class="text-xs text-muted">${escapeHtml(itemPreview)}${escapeHtml(moreText)}</div>
        </td>
        <td>
          <div style="font-weight: 800; font-size: 1.02rem; color: var(--green);">${formatTL(p.grandTotal)}</div>
          <div class="text-xs text-muted">${taxLabel}</div>
        </td>
        <td>
          ${getProposalStatusBadgeHTML(p.status)}
        </td>
        <td class="text-center">
          <div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" onclick="openProposalViewModal('${p.id}')" title="Teklifi Görüntüle, Yazdır, Dosya İndir veya Gönder">
              <i data-lucide="send"></i> Aç & Gönder
            </button>
            ${p.status !== 'approved' ? `
              <button class="btn btn-sm btn-success" onclick="openProposalConvertModal('${p.id}')" title="Teklifi Onayla ve Kasaya / Veresiyeye İşle">
                <i data-lucide="zap"></i> Satışa Dönüştür
              </button>
            ` : ''}
            <button class="btn-icon" onclick="openProposalModal('${p.id}')" title="Teklifi Düzenle">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon delete" onclick="deleteProposal('${p.id}')" title="Teklifi Sil">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  refreshIcons();
}

function deleteProposal(id) {
  if (!confirm('Bu fiyat teklifini silmek istediğinize emin misiniz?')) return;
  appState.proposals = (appState.proposals || []).filter(p => p.id !== id);
  saveData();
  showToast('Teklif kaydı silindi.');
}

function buildProposalPaperHTML(p) {
  const shopName = appState.settings?.shopName || 'Serhat İnşaat & Nalbur';
  const shopPhone = appState.settings?.phone || '';
  const shopAddress = appState.settings?.address || '';
  const dateFormatted = p.date ? new Date(p.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

  const taxLabel = p.taxMode === '20' ? 'KDV (%20):' : (p.taxMode === '10' ? 'KDV (%10):' : (p.taxMode === 'included' ? 'KDV Durumu:' : 'KDV (%0):'));
  const taxVal = p.taxMode === 'included' ? 'Fiyatlara Dahildir' : formatTL(p.taxAmount || 0);

  const rowsHtml = (p.items || []).map((item, idx) => `
    <tr>
      <td style="text-align:center; width: 42px; font-weight:600;">${idx + 1}</td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td style="text-align:center;">${Number(item.qty).toLocaleString('tr-TR')}</td>
      <td style="text-align:center;">${escapeHtml(item.unit)}</td>
      <td style="text-align:right;">${formatTL(item.unitPrice)}</td>
      <td style="text-align:center;">${item.discount > 0 ? `%${item.discount}` : '-'}</td>
      <td style="text-align:right; font-weight:700;">${formatTL(item.lineTotal)}</td>
    </tr>
  `).join('');

  return `
    <div class="proposal-doc-header">
      <div class="proposal-company-info">
        <h2>${escapeHtml(shopName)}</h2>
        <p>İnşaat Malzemeleri, Hırdavat, Boya & Tesisat Toptan ve Perakende Satış</p>
        ${shopPhone ? `<p><strong>Tel:</strong> ${escapeHtml(shopPhone)}</p>` : ''}
        ${shopAddress ? `<p><strong>Adres:</strong> ${escapeHtml(shopAddress)}</p>` : ''}
      </div>
      <div class="proposal-meta-box">
        <h3>FİYAT TEKLİF FORMU</h3>
        <div><strong>Teklif No:</strong> ${escapeHtml(p.proposalNo)}</div>
        <div><strong>Tarih:</strong> ${dateFormatted}</div>
        <div><strong>Geçerlilik:</strong> ${escapeHtml(p.validity || '-')}</div>
      </div>
    </div>

    <div class="proposal-client-grid">
      <div>
        <h4>MÜŞTERİ / FİRMA BİLGİLERİ</h4>
        <div style="font-size:1.05rem; font-weight:700; color:#0f172a;">${escapeHtml(p.customerName)}</div>
        ${p.customerPhone ? `<div style="font-size:0.88rem; color:#334155; margin-top:2px;">Tel: ${escapeHtml(p.customerPhone)}</div>` : ''}
        ${p.customerEmail ? `<div style="font-size:0.88rem; color:#334155;">E-posta: ${escapeHtml(p.customerEmail)}</div>` : ''}
      </div>
      <div>
        <h4>ŞANTİYE & TESLİMAT BİLGİLERİ</h4>
        <div style="font-weight:600; color:#0f172a;">${escapeHtml(p.siteName || 'Merkez / Dükkan Teslim')}</div>
        <div style="font-size:0.88rem; color:#334155; margin-top:4px;"><strong>Ödeme Koşulu:</strong> ${escapeHtml(p.paymentTerms || '-')}</div>
      </div>
    </div>

    <table class="proposal-table-doc">
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>Malzeme / Ürün Açıklaması</th>
          <th style="text-align:center;">Miktar</th>
          <th style="text-align:center;">Birim</th>
          <th style="text-align:right;">Birim Fiyat</th>
          <th style="text-align:center;">İskonto</th>
          <th style="text-align:right;">Toplam Tutar</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="proposal-totals-section">
      <div class="proposal-terms-box">
        <h4>TEKLİF NOTLARI & ŞARTLAR</h4>
        <p style="color:#475569; white-space:pre-line;">${escapeHtml(p.notes || 'Fiyatlarımız stoklarla sınırlıdır.')}</p>
      </div>
      <div class="proposal-totals-box">
        <div class="proposal-total-row">
          <span>Ara Toplam:</span>
          <strong>${formatTL(p.subTotal)}</strong>
        </div>
        ${p.totalDiscount > 0 ? `
        <div class="proposal-total-row">
          <span>Toplam İskonto:</span>
          <strong style="color:#dc2626;">-${formatTL(p.totalDiscount)}</strong>
        </div>
        ` : ''}
        <div class="proposal-total-row">
          <span>${taxLabel}</span>
          <strong>${taxVal}</strong>
        </div>
        <div class="proposal-total-row grand-total">
          <span>GENEL TOPLAM:</span>
          <span>${formatTL(p.grandTotal)}</span>
        </div>
      </div>
    </div>

    <div class="proposal-signatures">
      <div class="proposal-sig-box">
        <div><strong>TEKLİFİ VEREN FİRMA</strong></div>
        <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(shopName)}</div>
        <div class="proposal-sig-line">Kaşe & İmza</div>
      </div>
      <div class="proposal-sig-box">
        <div><strong>MÜŞTERİ ONAYI</strong></div>
        <div style="font-size:0.8rem; color:#64748b;">${escapeHtml(p.customerName)}</div>
        <div class="proposal-sig-line">Sipariş Onayı & İmza</div>
      </div>
    </div>
  `;
}

function openProposalViewModal(id) {
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  activeViewingProposalId = id;

  const paperEl = document.getElementById('proposalPaperArea');
  if (paperEl) {
    paperEl.innerHTML = buildProposalPaperHTML(prop);
  }

  const badgeEl = document.getElementById('viewPropStatusBadge');
  if (badgeEl) {
    badgeEl.outerHTML = `<span id="viewPropStatusBadge" class="${prop.status === 'approved' ? 'badge-status-approved' : (prop.status === 'rejected' ? 'badge-status-rejected' : 'badge-status-pending')}">
      ${prop.status === 'approved' ? '✅ Onaylandı / Satışa Döndü' : (prop.status === 'rejected' ? '❌ Reddedildi' : '⏳ Beklemede')}
    </span>`;
  }

  const btnConvert = document.getElementById('btnConvertViewingProposal');
  if (btnConvert) {
    btnConvert.style.display = prop.status === 'approved' ? 'none' : 'inline-flex';
  }

  openModal('proposalViewModal');
  refreshIcons();
}

function setViewingProposalStatus(newStatus) {
  if (!activeViewingProposalId) return;
  const prop = (appState.proposals || []).find(p => p.id === activeViewingProposalId);
  if (!prop) return;

  prop.status = newStatus;
  saveData();
  openProposalViewModal(activeViewingProposalId);
  showToast('Teklif durumu güncellendi.');
}

function editViewingProposal() {
  if (!activeViewingProposalId) return;
  const idToEdit = activeViewingProposalId;
  closeModal('proposalViewModal');
  openProposalModal(idToEdit);
}

function openConvertFromViewingProposal() {
  if (!activeViewingProposalId) return;
  const idToConvert = activeViewingProposalId;
  closeModal('proposalViewModal');
  openProposalConvertModal(idToConvert);
}

// 1. A4 PDF / Yazdır
function printProposalDoc() {
  document.body.classList.add('printing-modal');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-modal'), 500);
}

// 2. Bağımsız Kurumsal Teklif Dosyası İndir (.html) — Müşteriye e-posta eki veya WhatsApp dosya olarak göndermek için
function downloadProposalFile(customId = null) {
  const id = customId || activeViewingProposalId;
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  const shopName = appState.settings?.shopName || 'Serhat İnşaat';
  const paperHtml = buildProposalPaperHTML(prop);

  const standaloneHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fiyat Teklifi - ${escapeHtml(prop.proposalNo)} - ${escapeHtml(prop.customerName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #f1f5f9; padding: 24px; color: #0f172a; }
    .top-bar { max-width: 860px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 10px; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
    .proposal-paper { max-width: 860px; margin: 0 auto; background: #ffffff; padding: 36px 40px; border: 1px solid #cbd5e1; border-radius: 10px; color: #0f172a; font-size: 0.95rem; line-height: 1.5; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
    .proposal-doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #0f172a; margin-bottom: 20px; }
    .proposal-company-info h2 { font-size: 1.5rem; font-weight: 800; color: #0f172a; }
    .proposal-company-info p { color: #475569; font-size: 0.88rem; margin-top: 3px; }
    .proposal-meta-box { text-align: right; background: #f8fafc; padding: 12px 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .proposal-meta-box h3 { font-size: 1.15rem; font-weight: 800; color: #2563eb; margin-bottom: 6px; }
    .proposal-meta-box div { font-size: 0.85rem; color: #475569; }
    .proposal-client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f1f5f9; padding: 14px 18px; border-radius: 8px; border-left: 4px solid #2563eb; }
    .proposal-client-grid h4 { font-size: 0.78rem; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .proposal-table-doc { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .proposal-table-doc th { background: #0f172a; color: #ffffff; padding: 10px 12px; font-size: 0.85rem; font-weight: 600; text-align: left; }
    .proposal-table-doc td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
    .proposal-table-doc tbody tr:nth-child(even) { background: #f8fafc; }
    .proposal-totals-section { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 28px; }
    .proposal-terms-box { flex: 1; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.85rem; }
    .proposal-terms-box h4 { font-size: 0.88rem; font-weight: 700; margin-bottom: 6px; color: #1e293b; }
    .proposal-totals-box { width: 300px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .proposal-total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #cbd5e1; font-size: 0.92rem; }
    .proposal-total-row.grand-total { border-top: 2px solid #0f172a; border-bottom: none; font-size: 1.15rem; font-weight: 800; color: #16a34a; padding-top: 10px; margin-top: 4px; }
    .proposal-signatures { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 20px; border-top: 1px dashed #cbd5e1; }
    .proposal-sig-box { width: 220px; text-align: center; font-size: 0.85rem; }
    .proposal-sig-line { margin-top: 45px; border-top: 1px solid #94a3b8; padding-top: 4px; color: #64748b; font-weight: 600; }
    @media print {
      body { background: #fff; padding: 0; }
      .top-bar { display: none !important; }
      .proposal-paper { border: none; box-shadow: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div><strong>${escapeHtml(shopName)}</strong> &mdash; ${escapeHtml(prop.proposalNo)} Fiyat Teklif Belgesi</div>
    <button class="btn-print" onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button>
  </div>
  <div class="proposal-paper">
    ${paperHtml}
  </div>
</body>
</html>`;

  const cleanCust = (prop.customerName || 'Musteri').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_-]/g, '_');
  const fileName = `Teklif_${prop.proposalNo}_${cleanCust}.html`;

  const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  showToast(`📄 "${fileName}" dosyası indirildi! E-posta veya WhatsApp'tan dosya olarak gönderebilirsiniz.`);
}

// 3. Excel (.csv) Tablosu Olarak İndir
function downloadProposalCSV(customId = null) {
  const id = customId || activeViewingProposalId;
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  const shopName = appState.settings?.shopName || 'Serhat İnşaat';
  const lines = [];
  lines.push([`"${shopName} - FİYAT TEKLİF TABLOSU"`]);
  lines.push([`"Teklif No:"`, `"${prop.proposalNo}"`, `"Tarih:"`, `"${prop.date}"`]);
  lines.push([`"Müşteri:"`, `"${prop.customerName}"`, `"Telefon:"`, `"${prop.customerPhone || ''}"`]);
  lines.push([`"Şantiye / Teslimat:"`, `"${prop.siteName || ''}"`, `"Geçerlilik:"`, `"${prop.validity || ''}"`]);
  lines.push([]);
  lines.push([`"Sıra"`, `"Malzeme / Ürün Adı"`, `"Miktar"`, `"Birim"`, `"Birim Fiyat (TL)"`, `"İskonto (%)"`, `"Satır Toplamı (TL)"`]);

  (prop.items || []).forEach((item, idx) => {
    lines.push([
      idx + 1,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      String(item.qty).replace('.', ','),
      `"${item.unit}"`,
      Number(item.unitPrice || 0).toFixed(2).replace('.', ','),
      String(item.discount || 0).replace('.', ','),
      Number(item.lineTotal || 0).toFixed(2).replace('.', ',')
    ]);
  });

  lines.push([]);
  lines.push([`""`, `""`, `""`, `""`, `""`, `"Ara Toplam:"`, `"${Number(prop.subTotal || 0).toFixed(2).replace('.', ',')} TL"`]);
  if (prop.totalDiscount > 0) {
    lines.push([`""`, `""`, `""`, `""`, `""`, `"Toplam İskonto:"`, `"-${Number(prop.totalDiscount || 0).toFixed(2).replace('.', ',')} TL"`]);
  }
  lines.push([`""`, `""`, `""`, `""`, `""`, `"KDV Tutarı:"`, `"${Number(prop.taxAmount || 0).toFixed(2).replace('.', ',')} TL"`]);
  lines.push([`""`, `""`, `""`, `""`, `""`, `"GENEL TOPLAM:"`, `"${Number(prop.grandTotal || 0).toFixed(2).replace('.', ',')} TL"`]);

  // UTF-8 BOM ile Türkçe karakterlerin Excel'de düzgün açılmasını sağla
  const csvContent = '\uFEFF' + lines.map(r => r.join(';')).join('\r\n');
  const cleanCust = (prop.customerName || 'Musteri').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_-]/g, '_');
  const fileName = `Teklif_${prop.proposalNo}_${cleanCust}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  showToast(`📊 "${fileName}" Excel tablosu olarak indirildi!`);
}

// 4. Teklif Metni Oluşturucu (E-posta ve WhatsApp için ortak temiz metin)
function buildProposalShareText(prop) {
  const shopName = appState.settings?.shopName || 'Serhat İnşaat';
  const shopPhone = appState.settings?.phone ? ` (${appState.settings.phone})` : '';
  const dateStr = prop.date ? new Date(prop.date).toLocaleDateString('tr-TR') : '';

  let text = `🏗️ *${shopName.toUpperCase()} - FİYAT TEKLİFİ*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📄 *Teklif No:* ${prop.proposalNo}\n`;
  text += `📅 *Tarih:* ${dateStr} (${prop.validity || '7 Gün Geçerlidir'})\n`;
  text += `👤 *Sayın:* ${prop.customerName}\n`;
  if (prop.siteName) text += `📍 *Şantiye / Teslimat:* ${prop.siteName}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📦 *MALZEME LİSTESİ:*\n`;

  (prop.items || []).forEach((item, i) => {
    const discStr = item.discount > 0 ? ` (%${item.discount} İsk.)` : '';
    text += `${i + 1}. *${item.name}*\n`;
    text += `   ${item.qty} ${item.unit} x ${formatTL(item.unitPrice)}${discStr} = *${formatTL(item.lineTotal)}*\n`;
  });

  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (prop.totalDiscount > 0) {
    text += `Ara Toplam: ${formatTL(prop.subTotal)}\n`;
    text += `Toplam İskonto: -${formatTL(prop.totalDiscount)}\n`;
  }
  if (prop.taxMode === '20' || prop.taxMode === '10') {
    text += `KDV (%${prop.taxMode}): ${formatTL(prop.taxAmount)}\n`;
  }
  text += `💰 *GENEL TOPLAM: ${formatTL(prop.grandTotal)}*\n`;
  text += `💳 *Ödeme Koşulu:* ${prop.paymentTerms || 'Peşin'}\n`;
  if (prop.notes) {
    text += `📝 *Not:* ${prop.notes}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `İyi çalışmalar dileriz.\n*${shopName}*${shopPhone}`;

  return text;
}

// 5. E-posta ile Gönder
function sendProposalEmail(customId = null) {
  const id = customId || activeViewingProposalId;
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  let targetEmail = prop.customerEmail || '';
  if (!targetEmail) {
    const entered = prompt('Müşterinin e-posta adresini girin (Boş bırakırsanız e-posta programınız alıcı kısmı boş olarak açılır):', '');
    if (entered === null) return;
    targetEmail = entered.trim();
    if (targetEmail) {
      prop.customerEmail = targetEmail;
      saveData();
    }
  }

  const shopName = appState.settings?.shopName || 'Serhat İnşaat';
  const subject = `${shopName} - Fiyat Teklifi (${prop.proposalNo} - ${prop.customerName})`;
  const bodyText = buildProposalShareText(prop).replace(/\*/g, '');

  // Panoya da kopyala (Gmail web vb. kullananlar için kolaylık)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(bodyText).catch(() => {});
  }

  const mailtoUrl = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  window.location.href = mailtoUrl;
  showToast('📧 E-posta uygulamanız açılıyor... (Teklif metni ayrıca panoya kopyalandı)');
}

// 6. WhatsApp ile Gönder
function sendProposalWhatsApp(customId = null) {
  const id = customId || activeViewingProposalId;
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  let rawPhone = (prop.customerPhone || '').replace(/\D/g, '');
  if (rawPhone.startsWith('0')) rawPhone = '90' + rawPhone.slice(1);
  else if (rawPhone.length === 10 && rawPhone.startsWith('5')) rawPhone = '90' + rawPhone;

  const text = buildProposalShareText(prop);

  // Panoya kopyala
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const waUrl = rawPhone
    ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  window.open(waUrl, '_blank');
  showToast('💬 WhatsApp açılıyor... (Teklif metni panoya da kopyalandı)');
}

// 7. Teklifi Satışa / Veresiyeye Dönüştür
function openProposalConvertModal(id) {
  const prop = (appState.proposals || []).find(p => p.id === id);
  if (!prop) return;

  document.getElementById('convertPropId').value = prop.id;

  const summaryBox = document.getElementById('convertPropSummaryBox');
  if (summaryBox) {
    summaryBox.innerHTML = `
      <div style="font-weight:700; color:#15803d; font-size:0.95rem; margin-bottom:4px;">
        ${escapeHtml(prop.proposalNo)} &mdash; ${escapeHtml(prop.customerName)}
      </div>
      <div style="font-size:0.85rem; color:#166534;">
        Toplam <strong>${(prop.items || []).length} kalem</strong> malzeme &bull; Genel Toplam: <strong style="font-size:1.05rem;">${formatTL(prop.grandTotal)}</strong>
      </div>
    `;
  }

  // Müşteri listesini doldur
  const custSelect = document.getElementById('convertCustomerId');
  if (custSelect) {
    const cleanName = (prop.customerName || '').trim().toLowerCase();
    const existingCust = (appState.customers || []).find(c => (c.name || '').trim().toLowerCase() === cleanName);

    let optionsHtml = `<option value="NEW_CUSTOMER">➕ "${escapeHtml(prop.customerName)}" adına yeni Veresiye Hesabı aç ve borcu işle</option>`;
    (appState.customers || []).forEach(c => {
      const isSelected = existingCust && existingCust.id === c.id;
      optionsHtml += `<option value="${c.id}" ${isSelected ? 'selected' : ''}>👤 ${escapeHtml(c.name)} (Mevcut Bakiye: ${formatTL(c.currentBalance)})</option>`;
    });
    custSelect.innerHTML = optionsHtml;
  }

  document.getElementById('convertMethod').value = 'veresiye';
  onConvertMethodChange();
  openModal('proposalConvertModal');
  refreshIcons();
}

function onConvertMethodChange() {
  const method = document.getElementById('convertMethod')?.value;
  const veresiyeGroup = document.getElementById('convertVeresiyeGroup');
  if (veresiyeGroup) {
    veresiyeGroup.style.display = method === 'veresiye' ? 'block' : 'none';
  }
}

function handleProposalConvertSubmit(e) {
  e.preventDefault();
  const propId = document.getElementById('convertPropId').value;
  const prop = (appState.proposals || []).find(p => p.id === propId);
  if (!prop) return;

  const method = document.getElementById('convertMethod').value;
  const itemSummaryText = (prop.items || []).map(i => `${i.qty} ${i.unit} ${i.name}`).join(', ');
  const fullDesc = `Teklif ${prop.proposalNo} (${prop.customerName}): ${itemSummaryText}`;

  if (method === 'veresiye') {
    const custChoice = document.getElementById('convertCustomerId').value;
    let targetCustomer = null;

    if (custChoice === 'NEW_CUSTOMER') {
      targetCustomer = {
        id: 'cust_' + Date.now(),
        name: prop.customerName,
        phone: prop.customerPhone || '',
        profession: 'Teklif Müşterisi',
        notes: prop.siteName || '',
        currentBalance: 0,
        history: []
      };
      appState.customers.unshift(targetCustomer);
    } else {
      targetCustomer = (appState.customers || []).find(c => c.id === custChoice);
    }

    if (!targetCustomer) return alert('Müşteri seçilemedi.');

    targetCustomer.currentBalance = Number(targetCustomer.currentBalance || 0) + Number(prop.grandTotal);
    if (!Array.isArray(targetCustomer.history)) targetCustomer.history = [];
    targetCustomer.history.unshift({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: 'borc',
      amount: Number(prop.grandTotal),
      description: `Teklif Onayı (${prop.proposalNo}): ${itemSummaryText}`
    });

    activeCustomerId = targetCustomer.id;
  } else {
    // Nakit, Kart veya Havale olarak direkt kasaya gelir işle
    appState.transactions.unshift({
      id: Date.now().toString(),
      date: new Date().toISOString(),
      type: 'gelir',
      kasa: method,
      category: 'Teklifli Malzeme Satışı',
      description: fullDesc,
      amount: Number(prop.grandTotal)
    });
  }

  prop.status = 'approved';
  prop.convertedAt = new Date().toISOString();
  prop.convertedMethod = method;

  saveData();
  closeModal('proposalConvertModal');
  showToast(`✅ ${prop.proposalNo} teklifi onaylandı ve ${method === 'veresiye' ? 'Veresiye Defterine' : 'Kasaya'} işlendi!`);
}

// ==================== AYARLAR & UYGULAMA İÇİ YEDEKLEME ====================

const BACKUPS_STORAGE_KEY = 'serhat_insaat_kasa_backups_v1';

function renderSettings() {
  document.getElementById('headerShopTitle').textContent = appState.settings.shopName || 'Nalbur Kasa & Veresiye';
  document.getElementById('settingDukkanAdi').value = appState.settings.shopName || '';
  document.getElementById('settingTelefon').value = appState.settings.phone || '';
  document.getElementById('settingAdres').value = appState.settings.address || '';
  renderInternalBackupsList();
}

function kaydetAyarlar() {
  appState.settings.shopName = document.getElementById('settingDukkanAdi').value.trim() || 'Nalbur Kasa';
  appState.settings.phone = document.getElementById('settingTelefon').value.trim();
  appState.settings.address = document.getElementById('settingAdres').value.trim();
  saveData();
  showToast('Dükkan ayarları güncellendi.');
}

function getInternalBackups() {
  const raw = localStorage.getItem(BACKUPS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveInternalBackups(backupsList) {
  localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(backupsList));
}

// Uygulama İçinde Anlık Yedek Oluştur (Dosya indirilmez)
function createInternalBackup(customTitle, isSilent = false) {
  const backups = getInternalBackups();
  const now = new Date();
  
  // O anki nakit kasa durumu
  let nakit = 0;
  (appState.transactions || []).forEach(t => {
    if (t.kasa === 'nakit') {
      if (t.type === 'gelir') nakit += Number(t.amount);
      if (t.type === 'gider') nakit -= Number(t.amount);
    }
  });

  const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const backupItem = {
    id: 'backup_' + Date.now(),
    timestamp: now.toISOString(),
    dateFormatted: `${dateStr} ${timeStr}`,
    title: customTitle || `Manuel Yedek (${timeStr})`,
    stats: {
      txCount: appState.transactions ? appState.transactions.length : 0,
      customerCount: appState.customers ? appState.customers.length : 0,
      nakitKasa: formatTL(nakit)
    },
    snapshot: JSON.parse(JSON.stringify(appState))
  };

  // Yeni yedeği listenin en başına ekle
  backups.unshift(backupItem);

  // En fazla son 40 yedeği tut
  if (backups.length > 40) {
    backups.length = 40;
  }

  saveInternalBackups(backups);

  // Masaüstü WebView2 uygulaması içindeyse, arka planda sessizce C# disk yedeği al
  if (window.chrome && window.chrome.webview) {
    try {
      window.chrome.webview.postMessage(JSON.stringify({
        type: 'INTERNAL_BACKUP_CREATED',
        id: backupItem.id,
        date: backupItem.dateFormatted,
        title: backupItem.title,
        data: backupItem.snapshot
      }));
    } catch (e) {}
  }

  renderInternalBackupsList();

  if (!isSilent) {
    showToast(`✅ Yedek başarıyla uygulama içine kaydedildi! (${timeStr})`);
  }
}

// Uygulama İçi Yedekler Listesini Çiz
function renderInternalBackupsList() {
  const container = document.getElementById('internalBackupsList');
  if (!container) return;

  const backups = getInternalBackups();

  if (backups.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 22px 10px; color: var(--text-muted); background:#fff; border: 1px dashed var(--border-color); border-radius: var(--radius-sm);">
        <i data-lucide="shield-alert" style="width: 28px; height: 28px; margin-bottom: 6px; color: #94a3b8;"></i>
        <div style="font-weight:600; font-size: 0.92rem; color: var(--text-dark); margin-bottom: 3px;">Henüz Kayıtlı Yedek Yok</div>
        <div style="font-size: 0.8rem;">Yukarıdaki "Yeni Yedek Al" butonuna basarak ilk güvenli geri dönüş noktanızı oluşturabilirsiniz.</div>
      </div>
    `;
    refreshIcons();
    return;
  }

  let html = '';
  backups.forEach((b) => {
    const isAuto = b.title.includes('Otomatik') || b.title.includes('Gün Sonu');
    const badgeColor = isAuto ? '#0284c7' : '#16a34a';
    const iconName = isAuto ? 'clock' : 'shield-check';

    html += `
      <div class="backup-item">
        <div class="backup-info">
          <div class="backup-title">
            <i data-lucide="${iconName}" style="width: 17px; height: 17px; color: ${badgeColor};"></i>
            <span>${escapeHtml(b.title)}</span>
            <span style="font-size:0.75rem; font-weight:normal; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:12px;">${b.dateFormatted}</span>
          </div>
          <div class="backup-meta">
            <span><strong>${b.stats.customerCount}</strong> Müşteri</span>
            <span>&bull;</span>
            <span><strong>${b.stats.txCount}</strong> Hareket</span>
            <span>&bull;</span>
            <span>Nakit Kasa: <strong style="color:var(--text-dark);">${b.stats.nakitKasa}</strong></span>
          </div>
        </div>
        <div class="backup-actions">
          <button class="btn btn-sm btn-secondary" onclick="restoreInternalBackup('${b.id}')" title="Bu yedek noktasındaki verilere geri dön">
            <i data-lucide="rotate-ccw"></i> Geri Yükle
          </button>
          <button class="btn btn-sm btn-danger-outline" onclick="deleteInternalBackup('${b.id}')" title="Bu yedeği sil">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  refreshIcons();
}

// Seçilen Yedeğe Geri Dön
function restoreInternalBackup(backupId) {
  const backups = getInternalBackups();
  const target = backups.find(b => b.id === backupId);
  if (!target) {
    alert("Seçilen yedek bulunamadı!");
    return;
  }

  const msg = `⚠️ DİKKAT: "${target.title}" (${target.dateFormatted}) yedeğine dönmek istediğinize emin misiniz?\n\nMevcut verileriniz bu yedek noktasındaki haline geri yüklenecektir.`;
  if (!confirm(msg)) return;

  // Geri yüklemeden hemen önce o anki durumun otomatik bir kopyasını al
  createInternalBackup('Geri Yükleme Öncesi Güvenlik Kopyası', true);

  appState = JSON.parse(JSON.stringify(target.snapshot));
  saveData();
  renderAll();
  showToast(`✅ "${target.title}" yedeği başarıyla geri yüklendi!`);
}

// Yedeği Sil
function deleteInternalBackup(backupId) {
  if (!confirm("Bu yedek noktasını silmek istediğinize emin misiniz?")) return;

  let backups = getInternalBackups();
  backups = backups.filter(b => b.id !== backupId);
  saveInternalBackups(backups);
  renderInternalBackupsList();
  showToast("Yedek kaydı silindi.");
}

// İsteğe bağlı USB / harici diske dosya aktarımı
function exportDataToFile() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const downloadAnchor = document.createElement('a');
  const tarih = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Nalbur_Kasa_Yedek_${tarih}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Yedek dosyası indirildi! Güvenli bir yerde saklayınız.');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed.transactions && parsed.customers) {
        // İçe aktarmadan önce de mevcut durumu otomatik yedekle
        createInternalBackup('Harici Dosya Öncesi Güvenlik Yedeği', true);
        appState = parsed;
        saveData();
        alert('Yedek başarıyla geri yüklendi!');
      } else {
        alert('Geçersiz yedek dosyası formatı!');
      }
    } catch (err) {
      alert('Dosya okunurken bir hata oluştu: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ==================== TEST İÇİN ÖRNEK VERİLER ====================

function seedInitialData() {
  appState = {
    settings: {
      shopName: 'Serhat İnşaat',
      phone: '',
      address: ''
    },
    transactions: [],
    customers: [],
    suppliers: [],
    proposals: [],
    priceList: [
      { id: '301', name: 'Gri Çimento 50kg', unit: 'Torba', barcode: '', buyPrice: 190, sellPrice: 240 },
      { id: '302', name: 'Saten Alçı 30kg', unit: 'Torba', barcode: '', buyPrice: 140, sellPrice: 185 },
      { id: '303', name: 'Kalekim Seramik Yapıştırıcı 25kg', unit: 'Torba', barcode: '', buyPrice: 160, sellPrice: 220 },
      { id: '304', name: 'Akfix Şeffaf Silikon 280ml', unit: 'Adet', barcode: '', buyPrice: 75, sellPrice: 110 }
    ]
  };
  saveData();
}

function ornekVeriYukle() {
  if (confirm('Mevcut kayıtlar silinip örnek nalbur verileri yüklensin mi?')) {
    seedInitialData();
    showToast('Örnek veriler başarıyla yüklendi.');
  }
}

// ==================== YARDIMCI FONKSİYONLAR ====================

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    const autoInput = modal.querySelector('input[autofocus]');
    if (autoInput) setTimeout(() => autoInput.focus(), 50);
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

// ESC tuşuna basınca modal kapatma
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.innerHTML = `<i data-lucide="check-circle-2"></i> ${escapeHtml(message)}`;
  toast.style.display = 'flex';
  refreshIcons();
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==================== MOBİL UYGULAMA (PWA) DESTEĞİ ====================

let deferredInstallPrompt = null;

// Service Worker Kaydı (Çevrimdışı / Offline Mobil Desteği)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('PWA ServiceWorker aktif:', reg.scope);
    }).catch((err) => {
      console.log('PWA ServiceWorker hatası:', err);
    });
  });
}

// Telefonda Yükleme Butonunu Göster
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnMobileInstall');
  if (btn) {
    btn.style.display = 'inline-flex';
    refreshIcons();
  }
});

function installMobileApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('✅ Uygulama telefonunuza yükleniyor...');
        const btn = document.getElementById('btnMobileInstall');
        if (btn) btn.style.display = 'none';
      }
      deferredInstallPrompt = null;
    });
  } else {
    alert("iPhone veya Android tarayıcı menünüzden (üç nokta veya Paylaş) 'Ana Ekrana Ekle' seçeneğine dokunarak uygulamayı telefonunuza kurabilirsiniz.");
  }
}
