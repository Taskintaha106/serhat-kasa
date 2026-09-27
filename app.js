/* ==========================================================
   NALBUR KASA & VERESİYE SİSTEMİ - İŞ MANTIĞI & VERİTABANI
   ========================================================== */

const STORAGE_KEY = 'serhat_insaat_kasa_v1';

// Varsayılan Uygulama Durumu (State)
let appState = {
  transactions: [],
  customers: [],
  suppliers: [],
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

// ==================== BAŞLANGIÇ & YÜKLEME ====================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initClock();
  setupTabs();
  renderAll();
  lucide.createIcons();
});

// Verileri LocalStorage'dan Çek
function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      appState = JSON.parse(saved);
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
      
      lucide.createIcons();
    });
  });
}

// ==================== GENEL HESAPLAMALAR VE KPI'LAR ====================

function renderAll() {
  updateKPIs();
  renderKasaTable();
  renderVeresiyeList();
  renderToptanciTable();
  renderFiyatTable();
  renderRaporlar();
  renderSettings();
  lucide.createIcons();
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

  lucide.createIcons();
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
    lucide.createIcons();
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

  lucide.createIcons();
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

  lucide.createIcons();
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

  lucide.createIcons();
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
  window.print();
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
    lucide.createIcons();
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
  lucide.createIcons();
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
  lucide.createIcons();
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
    lucide.createIcons();
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
