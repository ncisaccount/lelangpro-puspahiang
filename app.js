// ============================================================================
// LELANGPRO PUSPAHIANG — FRONTEND SPA ENGINE (VANILLA JS + SWR + DEDUPLICATION)
// ============================================================================

const STATE = {
  bundle: null,
  dash: null,
  sessionToken: '',
  user: null,
  selectedLotsForReg: new Set(),
  writeEpoch: 0
};

const _inflight = {};

// ============================================================================
// 1. FETCH HELPERS (CORS-SAFE TEXT/PLAIN + IN-FLIGHT DEDUPLICATION)
// ============================================================================

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const key = `${STATE.writeEpoch}|GET|${qs}`;
  if (_inflight[key]) return _inflight[key];

  const p = fetch(`${GAS_URL}?${qs}`)
    .then(r => r.json())
    .finally(() => { delete _inflight[key]; });

  _inflight[key] = p;
  return p;
}

async function apiPost(action, data = {}, isReadOnly = false) {
  if (!isReadOnly) STATE.writeEpoch++;
  const key = `${STATE.writeEpoch}|POST|${action}|${JSON.stringify(data)}`;
  if (isReadOnly && _inflight[key]) return _inflight[key];

  const p = fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      token: STATE.sessionToken || '',
      data
    })
  })
    .then(r => r.json())
    .then(res => {
      if (res && res.nq > 0) {
        setTimeout(() => { apiPost('drainNotif', {}, true).catch(() => {}); }, 250);
      }
      return res;
    })
    .finally(() => { delete _inflight[key]; });

  if (isReadOnly) _inflight[key] = p;
  return p;
}

// ============================================================================
// 2. FORMATTER & GOOGLE DRIVE THUMBNAIL HELPER
// ============================================================================

function formatRupiah(num) {
  return 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');
}

function driveThumbUrl(fileId, width = 700) {
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

function showToast(msg, type = 'info') {
  const box = document.getElementById('toast-box');
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ============================================================================
// 3. MODE TERANG / GELAP & NAVIGASI SPA INSTAN (0 MS DELAY)
// ============================================================================

function initTheme() {
  try {
    const saved = localStorage.getItem('lelangpro_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  } catch (e) {}
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('lelangpro_theme', next); } catch (e) {}
}

function navigateView(viewName, sectionId = null) {
  document.getElementById('view-public').classList.toggle('hidden', viewName !== 'public');
  document.getElementById('view-daftar').classList.toggle('hidden', viewName !== 'daftar');
  document.getElementById('view-dashboard').classList.toggle('hidden', viewName !== 'dashboard');

  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  if (viewName === 'dashboard') {
    document.getElementById('nav-dasbor-link')?.classList.add('active');
    if (!STATE.dash) refreshDashboard(false);
  } else if (viewName === 'daftar') {
    renderDaftarLotSelector();
  } else if (sectionId) {
    document.querySelector(`[data-nav="${sectionId}"]`)?.classList.add('active');
    scrollToSection(sectionId);
  }
  document.getElementById('main-nav')?.classList.remove('open');
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleMobileMenu() {
  document.getElementById('main-nav')?.classList.toggle('open');
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ============================================================================
// 4. BOOTSTRAP DATA PUBLIK (SWR CACHE INSTANT RENDER)
// ============================================================================

async function bootPublicData() {
  try {
    const cachedRaw = localStorage.getItem('lelangpro_pub_cache');
    if (cachedRaw) {
      STATE.bundle = JSON.parse(cachedRaw);
      renderPublicUI();
    }
  } catch (e) {}

  const res = await apiGet('getPublicBundle');
  if (res && res.success && res.data) {
    STATE.bundle = res.data;
    try { localStorage.setItem('lelangpro_pub_cache', JSON.stringify(res.data)); } catch (e) {}
    renderPublicUI();
  }
}

function renderPublicUI() {
  const b = STATE.bundle;
  if (!b) return;

  document.getElementById('tb-lembaga').textContent = `Sekretariat ${b.pengaturan.nama_lembaga}`;
  document.getElementById('nav-app-name').textContent = b.pengaturan.nama_aplikasi;
  document.getElementById('hero-sk').textContent = `${b.pengaturan.musim_panen.toUpperCase()} • ${b.pengaturan.sk_panitia.toUpperCase()}`;
  if (b.hero.judul) document.getElementById('hero-judul').textContent = b.hero.judul;
  if (b.hero.subjudul) document.getElementById('hero-subjudul').textContent = b.hero.subjudul;

  const gelBadge = document.getElementById('tb-gelombang-badge');
  if (b.gelombang && b.gelombang.is_buka) {
    gelBadge.className = 'pill-status-open';
    gelBadge.textContent = '● GELOMBANG LELANG DIBUKA';
  } else {
    gelBadge.className = 'pill-status-closed';
    gelBadge.textContent = '● PENDAFTARAN LELANG DITUTUP';
  }

  if (b.kontak) {
    document.getElementById('tb-telp').textContent = `📞 ${b.kontak.telepon || '+62 821-3456-7890'}`;
    document.getElementById('tb-email').textContent = `✉️ ${b.kontak.email || 'lelang@puspahiang.desa.id'}`;
  }

  document.getElementById('stat-lot').textContent = b.statistik.totalLot;
  document.getElementById('stat-pohon').textContent = b.statistik.totalPohon.toLocaleString('id-ID');
  document.getElementById('stat-panen').textContent = `${(b.statistik.totalPanenKg / 1000).toFixed(1)} Ton`;
  document.getElementById('stat-peserta').textContent = b.statistik.totalPeserta;

  const blokSet = [...new Set(b.katalog.map(k => k.lokasi_blok).filter(Boolean))];
  const selBlok = document.getElementById('filter-blok');
  const curBlok = selBlok.value;
  selBlok.innerHTML = '<option value="">Semua Blok Kebun</option>' + blokSet.map(bl => `<option value="${bl}">${bl}</option>`).join('');
  selBlok.value = curBlok;

  const calcSel = document.getElementById('calc-lot-select');
  calcSel.innerHTML = '<option value="">-- Input Manual --</option>' + b.katalog.map(k => `<option value="${k.id}">${k.kode_lot} — ${k.nama_kebun}</option>`).join('');

  renderBlokWilayahCards(blokSet, b.katalog);
  applyCatalogFilter();
  renderJadwalDanAturan(b.jadwal, b.tataTertib);
  renderBeritaCards(b.berita);
  renderDynamicFormFields(b.formSchema);
  hitungSimulasiMargin();
}

function renderBlokWilayahCards(blokList, katalog) {
  const container = document.getElementById('blok-wilayah-grid');
  container.innerHTML = blokList.slice(0, 6).map(blok => {
    const items = katalog.filter(k => k.lokasi_blok === blok);
    const totalPohon = items.reduce((s, x) => s + Number(x.jumlah_pohon || 0), 0);
    return `
      <div class="blok-card" onclick="pilihBlokFilter('${blok}')">
        <div class="blok-cover"><span class="chip-dark">${items.length} Lot</span></div>
        <div class="blok-body">
          <h4>${blok}</h4>
          <small>🌳 ${totalPohon} Pohon Produktif</small>
        </div>
      </div>
    `;
  }).join('');
}

function pilihBlokFilter(blok) {
  document.getElementById('filter-blok').value = blok;
  applyCatalogFilter();
  scrollToSection('katalog');
}

function applyCatalogFilter() {
  if (!STATE.bundle) return;
  const blok = document.getElementById('filter-blok').value;
  const status = document.getElementById('filter-status').value;
  const maxLimit = Number(document.getElementById('filter-limit').value) || 0;
  const kw = document.getElementById('filter-keyword').value.toLowerCase().trim();
  const sort = document.getElementById('sort-katalog').value;

  let list = STATE.bundle.katalog.filter(item => {
    if (blok && item.lokasi_blok !== blok) return false;
    if (status && item.status_lot !== status) return false;
    if (maxLimit > 0 && Number(item.nilai_limit) > maxLimit) return false;
    if (kw && !`${item.kode_lot} ${item.nama_kebun} ${item.lokasi_blok} ${item.deskripsi}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  if (sort === 'limit-asc') list.sort((a, b) => Number(a.nilai_limit) - Number(b.nilai_limit));
  else if (sort === 'limit-desc') list.sort((a, b) => Number(b.nilai_limit) - Number(a.nilai_limit));
  else if (sort === 'panen-desc') list.sort((a, b) => Number(b.estimasi_panen_kg) - Number(a.estimasi_panen_kg));

  const grid = document.getElementById('katalog-lot-grid');
  if (list.length === 0) {
    grid.innerHTML = '<div class="card-surface p-lg full-col text-center">Tidak ada lot kebun manggis yang sesuai filter pencarian Anda.</div>';
    return;
  }

  grid.innerHTML = list.map(lot => {
    const thumb = driveThumbUrl(lot.gambar_id, 700);
    const badgeClass = lot.status_lot === 'Tersedia' ? 'badge-green-soft' : (lot.status_lot === 'Terlelang' ? 'badge-blue-soft' : 'badge-amber-soft');
    const isTersedia = lot.status_lot === 'Tersedia';
    return `
      <article class="lot-card">
        <div class="lot-media">
          ${thumb ? `<img src="${thumb}" alt="${lot.nama_kebun}" loading="lazy" />` : ''}
          <div class="lot-badges-top">
            <span class="chip-dark">${lot.kode_lot}</span>
            <span class="${badgeClass}">● ${lot.status_lot}</span>
          </div>
        </div>
        <div class="lot-body">
          <div class="lot-meta-top">
            <span>📍 Blok ${lot.lokasi_blok}</span>
            <span>${lot.masa_kelola || '1 Musim Panen'}</span>
          </div>
          <h3 class="lot-title">${lot.nama_kebun}</h3>
          <div class="lot-specs-3">
            <div><small>Luas Area</small><strong>${lot.luas_area}</strong></div>
            <div><small>Pohon Produktif</small><strong class="tabular">${lot.jumlah_pohon} Pohon</strong></div>
            <div><small>Est. Tonase</small><strong class="tabular">${Number(lot.estimasi_panen_kg).toLocaleString('id-ID')} Kg</strong></div>
          </div>
          <div class="lot-footer">
            <div>
              <div class="lot-price-label">NILAI LIMIT TERBUKA</div>
              <div class="lot-price-val tabular">${formatRupiah(lot.nilai_limit)}</div>
            </div>
            <div class="lot-btn-row">
              <button type="button" class="btn-ghost-pill btn-sm" onclick="openDetailLotModal('${lot.id}')">📊 Simulasi ROI</button>
              <button type="button" class="btn-primary-pill btn-sm" ${!isTersedia ? 'disabled' : ''} onclick="pilihLotDanDaftar('${lot.id}')">
                ${isTersedia ? 'Ajukan Minat ↗' : lot.status_lot}
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function openDetailLotModal(lotId) {
  const lot = STATE.bundle?.katalog.find(k => String(k.id) === String(lotId));
  if (!lot) return;
  const hargaAcuan = STATE.bundle?.pengaturan?.harga_acuan_kg || 18000;
  const bruto = Number(lot.estimasi_panen_kg) * hargaAcuan;
  const margin = bruto - Number(lot.nilai_limit);

  document.getElementById('md-lot-title').textContent = `${lot.kode_lot} — ${lot.nama_kebun}`;
  document.getElementById('md-lot-body').innerHTML = `
    <p class="mb-md">${lot.deskripsi || 'Blok kebun manggis produktif terverifikasi Tim Pelaksana Lelang Puspahiang.'}</p>
    <div class="lot-specs-3 mb-md">
      <div><small>Lokasi Blok</small><strong>${lot.lokasi_blok}</strong></div>
      <div><small>Luas & Pohon</small><strong>${lot.luas_area} (${lot.jumlah_pohon} Phn)</strong></div>
      <div><small>Estimasi Panen</small><strong>${Number(lot.estimasi_panen_kg).toLocaleString('id-ID')} Kg</strong></div>
    </div>
    <div class="info-banner-blue mb-md">
      <strong>Simulasi Cepat (Harga Acuan ${formatRupiah(hargaAcuan)}/Kg):</strong><br/>
      Estimasi Pendapatan Bruto: <b>${formatRupiah(bruto)}</b><br/>
      Nilai Limit Dasar: <b>${formatRupiah(lot.nilai_limit)}</b><br/>
      Potensi Selisih Margin: <b style="color:#166534">${formatRupiah(margin)}</b>
    </div>
    <div class="flex-end gap-sm">
      <button type="button" class="btn-ghost-pill" onclick="closeModal('modal-lot-detail')">Tutup</button>
      <button type="button" class="btn-primary-pill" onclick="closeModal('modal-lot-detail'); pilihLotDanDaftar('${lot.id}')">Pilih Lot & Daftar Lelang</button>
    </div>
  `;
  openModal('modal-lot-detail');
}

function pilihLotDanDaftar(lotId) {
  STATE.selectedLotsForReg.add(String(lotId));
  navigateView('daftar');
}

// ============================================================================
// 5. KALKULATOR SIMULASI MARGIN PANEN
// ============================================================================

function syncCalcFromLot() {
  const id = document.getElementById('calc-lot-select').value;
  const lot = STATE.bundle?.katalog.find(k => String(k.id) === String(id));
  if (lot) {
    document.getElementById('calc-kg').value = lot.estimasi_panen_kg;
    document.getElementById('calc-limit').value = lot.nilai_limit;
    hitungSimulasiMargin();
  }
}

function hitungSimulasiMargin() {
  const kg = Number(document.getElementById('calc-kg').value) || 0;
  const harga = Number(document.getElementById('calc-harga').value) || 0;
  const limit = Number(document.getElementById('calc-limit').value) || 0;
  const bruto = kg * harga;
  const profit = bruto - limit;
  const roi = limit > 0 ? ((profit / limit) * 100).toFixed(1) : '0.0';

  document.getElementById('calc-bruto').textContent = formatRupiah(bruto);
  document.getElementById('calc-modal').textContent = `- ${formatRupiah(limit)}`;
  document.getElementById('calc-profit').textContent = formatRupiah(profit);
  document.getElementById('calc-roi').textContent = `${profit >= 0 ? '+' : ''}${roi}% ROI`;
}

function renderJadwalDanAturan(jadwal = [], aturan = []) {
  document.getElementById('jadwal-timeline-grid').innerHTML = jadwal.map((j, idx) => `
    <div class="step-card">
      <div class="step-num">0${idx + 1}</div>
      <small class="eyebrow-sky">${j.tanggal_mulai} s/d ${j.tanggal_selesai}</small>
      <h4>${j.tahapan}</h4>
      <p class="text-muted mt-xs">${j.lokasi_keterangan}</p>
    </div>
  `).join('');

  document.getElementById('tata-tertib-grid').innerHTML = aturan.map(r => `
    <div class="card-surface p-lg">
      <span class="badge-navy-soft">${r.kategori}</span>
      <h4 class="mt-sm">${r.judul_poin}</h4>
      <p class="text-muted mt-xs">${r.isi_aturan}</p>
    </div>
  `).join('');
}

function renderBeritaCards(berita = []) {
  document.getElementById('berita-grid').innerHTML = berita.map(br => `
    <article class="card-surface p-lg">
      <small class="eyebrow-sky">${br.tanggal}</small>
      <h4>${br.judul}</h4>
      <p class="text-muted mt-xs">${br.ringkasan}</p>
    </article>
  `).join('');
}

// ============================================================================
// 6. PENDAFTARAN PESERTA LELANG & LACAK STATUS MANDIRI
// ============================================================================

function renderDaftarLotSelector() {
  const container = document.getElementById('daftar-lot-selector');
  if (!STATE.bundle) return;
  const tersedia = STATE.bundle.katalog.filter(k => k.status_lot === 'Tersedia');
  container.innerHTML = tersedia.map(lot => {
    const checked = STATE.selectedLotsForReg.has(String(lot.id)) ? 'checked' : '';
    return `
      <label class="radio-box-card">
        <input type="checkbox" value="${lot.id}" ${checked} onchange="toggleSelectLotReg('${lot.id}', this.checked)" />
        <div>
          <span class="badge-navy-soft">${lot.kode_lot}</span>
          <strong class="block mt-xs">${lot.nama_kebun}</strong>
          <small>Blok ${lot.lokasi_blok} • ${lot.jumlah_pohon} Pohon • Limit: <b>${formatRupiah(lot.nilai_limit)}</b></small>
        </div>
      </label>
    `;
  }).join('');
}

function toggleSelectLotReg(id, isChecked) {
  if (isChecked) STATE.selectedLotsForReg.add(String(id));
  else STATE.selectedLotsForReg.delete(String(id));
}

function renderDynamicFormFields(schema = []) {
  const box = document.getElementById('dynamic-form-fields');
  box.innerHTML = schema.map(f => {
    const req = String(f.wajib).toUpperCase() === 'TRUE' ? 'required' : '';
    if (f.tipe_field === 'select') {
      const opts = String(f.opsi || '').split(',').map(o => `<option value="${o.trim()}">${o.trim()}</option>`).join('');
      return `<div class="form-group"><label>${f.label}</label><select data-dyn="${f.label}" ${req}>${opts}</select></div>`;
    }
    return `<div class="form-group"><label>${f.label}</label><input type="text" data-dyn="${f.label}" placeholder="${f.bantuan_teks || ''}" ${req} /></div>`;
  }).join('');
}

async function submitPendaftaranLelang(e) {
  e.preventDefault();
  if (STATE.selectedLotsForReg.size === 0) {
    showToast('Silakan centang minimal 1 Lot Kebun Manggis.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-daftar');
  btn.disabled = true;
  btn.textContent = 'Memproses Pendaftaran...';

  const jawaban = {};
  document.querySelectorAll('[data-dyn]').forEach(el => { jawaban[el.dataset.dyn] = el.value; });

  let berkasBase64 = '', berkasNama = '', berkasMime = '';
  const fileInput = document.getElementById('reg-berkas');
  if (fileInput.files && fileInput.files[0]) {
    const f = fileInput.files[0];
    berkasNama = f.name;
    berkasMime = f.type;
    berkasBase64 = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(f);
    });
  }

  const payload = {
    lot_pilihan: Array.from(STATE.selectedLotsForReg),
    nama: document.getElementById('reg-nama').value,
    nik: document.getElementById('reg-nik').value,
    no_wa: document.getElementById('reg-wa').value,
    email: document.getElementById('reg-email').value,
    alamat_peserta: document.getElementById('reg-alamat').value,
    nilai_penawaran: document.getElementById('reg-tawaran').value,
    jawaban: jawaban,
    berkas_base64: berkasBase64,
    berkas_nama: berkasNama,
    berkas_mime: berkasMime
  };

  const res = await apiPost('daftarPeserta', payload, false);
  btn.disabled = false;
  btn.textContent = '🚀 Kirim Pendaftaran Lelang Sekarang';

  if (res && res.success) {
    showToast(res.message, 'success');
    document.getElementById('res-token-code').textContent = res.data.token;
    document.getElementById('box-token-sukses').classList.remove('hidden');
    document.getElementById('form-pendaftaran-lelang').reset();
    STATE.selectedLotsForReg.clear();
    renderDaftarLotSelector();
    bootPublicData();
  } else {
    showToast(res?.message || 'Gagal mengirim pendaftaran.', 'error');
  }
}

function copyTokenResmi() {
  const token = document.getElementById('res-token-code').textContent;
  navigator.clipboard.writeText(token);
  showToast('Token ' + token + ' berhasil disalin!', 'success');
}

async function handleCekStatus() {
  const q = document.getElementById('input-cek-token').value.trim();
  if (!q) return showToast('Masukkan Token atau Email terdaftar.', 'error');

  const box = document.getElementById('hasil-cek-status');
  box.classList.remove('hidden');
  box.innerHTML = 'Memeriksa data pendaftaran...';

  const res = await apiGet('cekStatus', { q });
  if (!res || !res.success) {
    box.innerHTML = `<span class="text-danger">${res?.message || 'Data tidak ditemukan.'}</span>`;
    return;
  }
  const d = res.data;
  const lotTags = (d.lot_pilihan || []).map(l => `<span class="badge-navy-soft">${l.kode_lot}</span>`).join(' ');
  box.innerHTML = `
    <div class="flex-between">
      <strong>Token: ${d.token}</strong>
      <span class="badge-green-soft">${d.status_verifikasi}</span>
    </div>
    <p class="mt-xs">Peserta: <b>${d.nama_samaran}</b> • Penetapan: <span class="badge-blue-soft">${d.status_penetapan}</span></p>
    <div class="mt-xs">Lot Dipilih: ${lotTags || '-'}</div>
    <p class="text-muted mt-xs">Catatan Panitia: ${d.catatan_verifikator}</p>
  `;
}

// ============================================================================
// 7. AUTENTIKASI INTERNAL (GOOGLE OAUTH 2.0 + AKSES DARURAT ?emergency=1)
// ============================================================================

async function initAuthSystem() {
  if (new URLSearchParams(window.location.search).get('emergency') === '1') {
    document.getElementById('emergency-login-box')?.classList.remove('hidden');
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem('lelangpro_session') || 'null');
    if (saved && saved.token && saved.user) {
      STATE.sessionToken = saved.token;
      STATE.user = saved.user;
      applyLoggedInState();
    }
  } catch (e) {}

  const cfg = await apiGet('authConfig');
  if (cfg && cfg.success && cfg.data.googleClientId && window.google) {
    google.accounts.id.initialize({
      client_id: cfg.data.googleClientId,
      callback: handleGoogleCredentialResponse
    });
    google.accounts.id.renderButton(document.getElementById('g_id_signin_container'), {
      theme: 'outline',
      size: 'large',
      width: '100%'
    });
  }
}

function openAuthModal() {
  if (STATE.sessionToken && STATE.user) {
    navigateView('dashboard');
    return;
  }
  openModal('modal-auth');
}

async function handleGoogleCredentialResponse(response) {
  const res = await apiPost('authGoogle', { credential: response.credential }, false);
  if (res && res.success) {
    STATE.sessionToken = res.data.token;
    STATE.user = res.data.user;
    sessionStorage.setItem('lelangpro_session', JSON.stringify(res.data));
    closeModal('modal-auth');
    applyLoggedInState();
    navigateView('dashboard');
    showToast('Selamat datang, ' + STATE.user.nama, 'success');
  } else {
    showToast(res?.message || 'Login Google ditolak.', 'error');
  }
}

async function submitLoginDarurat(e) {
  e.preventDefault();
  const res = await apiPost('authDarurat', {
    username: document.getElementById('em-user').value,
    password: document.getElementById('em-pass').value
  }, false);

  if (res && res.success) {
    STATE.sessionToken = res.data.token;
    STATE.user = res.data.user;
    sessionStorage.setItem('lelangpro_session', JSON.stringify(res.data));
    closeModal('modal-auth');
    applyLoggedInState();
    navigateView('dashboard');
    showToast('Berhasil masuk melalui jalur akses darurat.', 'success');
  } else {
    showToast(res?.message || 'Login darurat gagal.', 'error');
  }
}

function applyLoggedInState() {
  if (!STATE.user) return;
  document.getElementById('nav-dasbor-link')?.classList.remove('hidden');
  document.getElementById('dash-user-name').textContent = STATE.user.nama;
  document.getElementById('dash-user-role').textContent = STATE.user.role === 'superadmin' ? 'Pejabat Lelang / Superadmin' : 'Panitia / Verifikator';

  const isSuper = STATE.user.role === 'superadmin';
  document.querySelectorAll('.superadmin-only').forEach(el => {
    el.classList.toggle('hidden', !isSuper);
  });
}

function logoutDashboard() {
  STATE.sessionToken = '';
  STATE.user = null;
  STATE.dash = null;
  sessionStorage.removeItem('lelangpro_session');
  document.getElementById('nav-dasbor-link')?.classList.add('hidden');
  navigateView('public', 'beranda');
  showToast('Anda telah keluar dari dasbor internal.');
}

// ============================================================================
// 8. DASBOR OPERASIONAL PANITIA & SUPERADMIN
// ============================================================================

async function refreshDashboard(forceToast = false) {
  const res = await apiPost('getDashboardBundle', {}, true);
  if (!res || !res.success) {
    if (res?.code === 'UNAUTHORIZED') logoutDashboard();
    return;
  }
  STATE.dash = res.data;
  renderDashboardUI();
  if (forceToast) showToast('Data dasbor tersinkronisasi (' + res.ms + ' ms).', 'success');
}

function switchDashTab(tabName) {
  document.querySelectorAll('.dash-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.dash-tab-pane').forEach(p => p.classList.add('hidden'));
  document.getElementById(`dash-tab-${tabName}`)?.classList.remove('hidden');
}

function renderDashboardUI() {
  const d = STATE.dash;
  if (!d) return;

  document.getElementById('dkpi-total').textContent = d.stats.totalPeserta;
  document.getElementById('dkpi-baru').textContent = d.stats.menungguVerifikasi;
  document.getElementById('dkpi-valid').textContent = d.stats.terverifikasi;
  document.getElementById('dkpi-pemenang').textContent = d.stats.pemenang;

  if (d.rahasiaStatus) {
    document.getElementById('fonnte-mask-text').textContent = d.rahasiaStatus.fonnte_mask || 'Belum dipasang';
    document.getElementById('set-google-client-id').value = d.rahasiaStatus.google_client_id || '';
  }

  if (d.gelombang && d.gelombang[0]) {
    document.getElementById('set-gel-nama').value = d.gelombang[0].nama_gelombang || '';
    document.getElementById('set-gel-tutup').value = d.gelombang[0].tanggal_tutup || '';
    document.getElementById('set-gel-status').value = d.gelombang[0].status_manual || 'BUKA';
  }

  renderDashPesertaTable();
  renderDashKatalogTable();
  renderDashBALTable();
}

function renderDashPesertaTable() {
  const tbody = document.getElementById('dash-peserta-tbody');
  if (!STATE.dash) return;
  const kw = document.getElementById('dash-search-peserta').value.toLowerCase();
  const verif = document.getElementById('dash-filter-verif').value;
  const isSuper = STATE.user?.role === 'superadmin';

  const list = STATE.dash.peserta.filter(p => {
    if (verif && p.status_verifikasi !== verif) return false;
    if (kw && !`${p.token} ${p.nama} ${p.no_wa} ${p.email}`.toLowerCase().includes(kw)) return false;
    return true;
  });

  tbody.innerHTML = list.map(p => {
    let lots = [];
    try { lots = JSON.parse(p.lot_pilihan_json || '[]'); } catch (e) {}
    const lotTxt = lots.map(l => `${l.kode_lot} (${l.nama_kebun})`).join('<br/>');
    const vBadge = p.status_verifikasi === 'Terverifikasi' ? 'badge-green-soft' : (p.status_verifikasi === 'TMS' ? 'badge-danger-soft' : 'badge-amber-soft');
    const pBadge = p.status_penetapan === 'Pemenang' ? 'badge-blue-soft' : 'badge-opt';

    return `
      <tr>
        <td><strong>${p.token}</strong><br/><small class="text-muted">${p.tanggal_daftar}</small></td>
        <td><strong>${p.nama}</strong><br/><small class="text-muted">📱 ${p.no_wa}</small></td>
        <td>${lotTxt || '-'}</td>
        <td class="text-right tabular"><strong>${formatRupiah(p.nilai_penawaran)}</strong></td>
        <td><span class="${vBadge}">${p.status_verifikasi}</span></td>
        <td><span class="${pBadge}">${p.status_penetapan}</span></td>
        <td>
          <div class="flex-end gap-sm">
            <button type="button" class="btn-ghost-pill btn-sm" onclick="openVerifikasiModal('${p.id}')">✅ Verifikasi</button>
            ${isSuper ? `<button type="button" class="btn-navy-pill btn-sm" onclick="openPenetapanModal('${p.id}')">⚖️ Tetapkan</button>` : ''}
            ${p.status_penetapan === 'Pemenang' ? `<button type="button" class="btn-primary-pill btn-sm" onclick="openBALByPeserta('${p.id}')">📜 BAL</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openVerifikasiModal(pesertaId) {
  const p = STATE.dash.peserta.find(x => String(x.id) === String(pesertaId));
  if (!p) return;
  document.getElementById('verif-peserta-id').value = p.id;
  document.getElementById('verif-peserta-info').innerHTML = `<b>${p.nama}</b> (${p.token}) — WA: ${p.no_wa}`;
  document.getElementById('verif-status').value = p.status_verifikasi || 'Terverifikasi';
  document.getElementById('verif-catatan').value = p.catatan_verifikator || '';
  openModal('modal-verifikasi');
}

async function submitVerifikasiPeserta(e) {
  e.preventDefault();
  const res = await apiPost('verifikasiPeserta', {
    id: document.getElementById('verif-peserta-id').value,
    status_verifikasi: document.getElementById('verif-status').value,
    catatan_verifikator: document.getElementById('verif-catatan').value,
    kirim_notif: true
  }, false);

  if (res && res.success) {
    closeModal('modal-verifikasi');
    showToast(res.message, 'success');
    refreshDashboard();
  } else {
    showToast(res?.message || 'Gagal memperbarui verifikasi.', 'error');
  }
}

function openPenetapanModal(pesertaId) {
  const p = STATE.dash.peserta.find(x => String(x.id) === String(pesertaId));
  if (!p) return;
  document.getElementById('pen-peserta-id').value = p.id;
  document.getElementById('pen-ringkasan-peserta').innerHTML = `
    <strong>${p.nama}</strong> • Token: <code>${p.token}</code><br/>
    Penawaran Diajukan: <b>${formatRupiah(p.nilai_penawaran)}</b> • Status Panitia: <b>${p.status_verifikasi}</b>
  `;
  const now = new Date();
  const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('pen-nomor-bal').value = `BAL-MG/${ym}/${p.token.slice(-5)}`;
  openModal('modal-penetapan');
}

async function submitPenetapanPemenang(e) {
  e.preventDefault();
  const status = document.querySelector('input[name="pen_status"]:checked').value;
  const res = await apiPost('tetapkanPemenang', {
    peserta_id: document.getElementById('pen-peserta-id').value,
    status_penetapan: status,
    nomor_bal: document.getElementById('pen-nomor-bal').value,
    catatan_penetapan: document.getElementById('pen-catatan').value,
    kunci_lot: document.getElementById('pen-kunci-lot').checked
  }, false);

  if (res && res.success) {
    closeModal('modal-penetapan');
    showToast(res.message, 'success');
    refreshDashboard();
    bootPublicData();
    if (res.data?.dokumenBAL) renderBALPrintModal(res.data.dokumenBAL);
  } else {
    showToast(res?.message || 'Gagal mengesahkan penetapan.', 'error');
  }
}

async function openBALByPeserta(pesertaId) {
  const res = await apiPost('getDetailBAL', { pesertaId }, true);
  if (res && res.success) {
    renderBALPrintModal(res.data.dokumen);
  } else {
    showToast(res?.message || 'Dokumen BAL tidak ditemukan.', 'error');
  }
}

function renderBALPrintModal(doc) {
  document.getElementById('bal-sheet-content').innerHTML = `
    <div class="bal-paper">
      <div class="bal-kop">
        <strong>PEMERINTAH KABUPATEN TASIKMALAYA</strong><br/>
        <strong>KECAMATAN PUSPAHIANG</strong><br/>
        <span style="color:#0284C7;font-weight:800;">TIM PELAKSANA LELANG KOMODITAS KEBUN MANGGIS RAKYAT</span><br/>
        <small>Sekretariat: Jl. Raya Puspahiang No. 90, Kec. Puspahiang, Kab. Tasikmalaya 46471</small>
      </div>
      <div class="text-center mb-md">
        <h3>BERITA ACARA PENETAPAN PEMENANG LELANG</h3>
        <span class="badge-navy-soft">Nomor: ${doc.nomor}</span>
      </div>
      <div class="bal-box">
        <strong>BAGIAN I — IDENTITAS PEMENANG & OBJEK LOT LELANG</strong><br/>
        Pemenang Sah: <b>${doc.namaPemenang}</b> (Token: ${doc.tokenPeserta})<br/>
        Kode Inventaris Lot: <b>${doc.kodeLot}</b><br/>
        Nilai Penetapan Sah: <b style="font-size:1.15rem;color:#0F294A;">${formatRupiah(doc.nilaiPenetapan)}</b>
      </div>
      <div class="bal-box">
        <strong>BAGIAN II — KETENTUAN PASCA PENETAPAN</strong><br/>
        1. Pemenang berhak atas pengelolaan panen manggis musim berjalan terhitung sejak pelunasan sah.<br/>
        2. Pemanenan wajib menjaga kelestarian cabang primer pohon induk manggis.
      </div>
      <div class="bal-sign-grid">
        <div>
          <small>Pemenang Lelang</small><br/><br/>
          <span class="badge-green-soft">TERVERIFIKASI SISTEM</span><br/>
          <strong class="mt-sm block">${doc.namaPemenang}</strong>
        </div>
        <div>
          <small>Integritas Kriptografi SHA-256</small>
          <div class="qr-box-official">QR VERIFIKASI SAH<br/><b>${doc.kodeVerifikasi}</b></div>
          <small style="font-size:0.65rem;word-break:break-all;">${String(doc.hashPdf).slice(0, 28)}...</small>
        </div>
        <div>
          <small>Ditetapkan di Puspahiang, ${doc.waktuTerbit}</small><br/>
          <small>Ketua Tim Pelaksana Lelang</small><br/><br/>
          <strong>${doc.pejabatPengesah}</strong>
        </div>
      </div>
    </div>
  `;
  openModal('modal-bal-print');
}

function renderDashKatalogTable() {
  const tbody = document.getElementById('dash-katalog-tbody');
  if (!STATE.dash) return;
  const isSuper = STATE.user?.role === 'superadmin';
  tbody.innerHTML = STATE.dash.katalog.map(k => `
    <tr>
      <td><strong>${k.kode_lot}</strong></td>
      <td><strong>${k.nama_kebun}</strong><br/><small class="text-muted">Blok ${k.lokasi_blok} • ${k.luas_area}</small></td>
      <td class="tabular">${k.jumlah_pohon} Pohon • ${Number(k.estimasi_panen_kg).toLocaleString('id-ID')} Kg</td>
      <td class="text-right tabular"><strong>${formatRupiah(k.nilai_limit)}</strong></td>
      <td><span class="badge-blue-soft">${k.status_lot}</span></td>
      <td>
        ${isSuper ? `<button type="button" class="btn-ghost-pill btn-sm" onclick="openModalLotForm('${k.id}')">✏️ Edit</button>` : '-'}
      </td>
    </tr>
  `).join('');
}

function renderDashBALTable() {
  const tbody = document.getElementById('dash-bal-tbody');
  if (!STATE.dash) return;
  tbody.innerHTML = (STATE.dash.dokumenBAL || []).map(d => `
    <tr>
      <td><strong>${d.nomor}</strong></td>
      <td>${d.namaPemenang}</td>
      <td><span class="badge-navy-soft">${d.kodeLot}</span></td>
      <td class="text-right tabular">${formatRupiah(d.nilaiPenetapan)}</td>
      <td><code>${d.kodeVerifikasi}</code></td>
      <td><button type="button" class="btn-navy-pill btn-sm" onclick="openBALByPeserta('${d.pesertaId}')">🖨️ Cetak BAL</button></td>
    </tr>
  `).join('');
}

function openModalLotForm(lotId = '') {
  const lot = lotId ? STATE.dash.katalog.find(k => String(k.id) === String(lotId)) : null;
  document.getElementById('crud-lot-id').value = lot ? lot.id : '';
  document.getElementById('crud-kode').value = lot ? lot.kode_lot : '';
  document.getElementById('crud-blok').value = lot ? lot.lokasi_blok : '';
  document.getElementById('crud-nama').value = lot ? lot.nama_kebun : '';
  document.getElementById('crud-luas').value = lot ? lot.luas_area : '';
  document.getElementById('crud-pohon').value = lot ? lot.jumlah_pohon : '';
  document.getElementById('crud-panen').value = lot ? lot.estimasi_panen_kg : '';
  document.getElementById('crud-limit').value = lot ? lot.nilai_limit : '';
  document.getElementById('crud-status').value = lot ? lot.status_lot : 'Tersedia';
  document.getElementById('crud-gambar').value = lot ? lot.gambar_id : '';
  document.getElementById('crud-deskripsi').value = lot ? lot.deskripsi : '';
  openModal('modal-lot-crud');
}

async function submitCrudLot(e) {
  e.preventDefault();
  const res = await apiPost('simpanLotKebun', {
    id: document.getElementById('crud-lot-id').value,
    kode_lot: document.getElementById('crud-kode').value,
    lokasi_blok: document.getElementById('crud-blok').value,
    nama_kebun: document.getElementById('crud-nama').value,
    luas_area: document.getElementById('crud-luas').value,
    jumlah_pohon: document.getElementById('crud-pohon').value,
    estimasi_panen_kg: document.getElementById('crud-panen').value,
    nilai_limit: document.getElementById('crud-limit').value,
    status_lot: document.getElementById('crud-status').value,
    gambar_id: document.getElementById('crud-gambar').value,
    deskripsi: document.getElementById('crud-deskripsi').value
  }, false);

  if (res && res.success) {
    closeModal('modal-lot-crud');
    showToast(res.message, 'success');
    refreshDashboard();
    bootPublicData();
  } else {
    showToast(res?.message || 'Gagal menyimpan lot kebun.', 'error');
  }
}

async function submitSimpanRahasia(e) {
  e.preventDefault();
  const res = await apiPost('simpanRahasia', {
    FONNTE_TOKEN: document.getElementById('set-fonnte-token').value,
    GOOGLE_CLIENT_ID: document.getElementById('set-google-client-id').value
  }, false);
  if (res && res.success) {
    document.getElementById('set-fonnte-token').value = '';
    showToast(res.message, 'success');
    refreshDashboard();
  } else {
    showToast(res?.message || 'Gagal menyimpan rahasia.', 'error');
  }
}

async function submitKelolaGelombang(e) {
  e.preventDefault();
  const gelId = STATE.dash?.gelombang?.[0]?.id || 'GEL-2026-01';
  const res = await apiPost('simpanGelombang', {
    id: gelId,
    nama_gelombang: document.getElementById('set-gel-nama').value,
    tanggal_tutup: document.getElementById('set-gel-tutup').value,
    status_manual: document.getElementById('set-gel-status').value
  }, false);
  if (res && res.success) {
    showToast(res.message, 'success');
    bootPublicData();
  }
}

async function promptTesPingFonnte() {
  const noWa = prompt('Masukkan nomor WhatsApp tujuan tes (contoh: 6282134567890):');
  if (!noWa) return;
  const res = await apiPost('tesPingFonnte', { noWa }, false);
  showToast(res?.message || 'Selesai tes ping.', res?.success ? 'success' : 'error');
}

async function handleHapusDummy() {
  if (!confirm('PERINGATAN SUPERADMIN:\nSeluruh data simulasi (is_dummy = TRUE) akan dihapus permanen tanpa menyentuh data asli. Lanjutkan?')) return;
  const res = await apiPost('hapusSemuaDummy', {}, false);
  if (res && res.success) {
    showToast(res.message, 'success');
    bootPublicData();
    refreshDashboard();
  } else {
    showToast(res?.message || 'Gagal menghapus data dummy.', 'error');
  }
}

async function handleEksporExcel() {
  showToast('Menyiapkan file Excel (.xlsx)...');
  const res = await apiPost('eksporExcel', {}, true);
  if (res && res.success && res.data) {
    const link = document.createElement('a');
    link.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + res.data.base64;
    link.download = res.data.fileName;
    link.click();
    showToast('Laporan Excel berhasil diunduh!', 'success');
  } else {
    showToast(res?.message || 'Gagal mengekspor Excel.', 'error');
  }
}

// ============================================================================
// 9. INISIALISASI APLIKASI SAAT HALAMAN DIMUAT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bootPublicData();
  initAuthSystem();
});
