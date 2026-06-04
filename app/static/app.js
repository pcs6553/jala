'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const form          = document.getElementById('bill-form');
const meterInput    = document.getElementById('meter_number');
const lastInput     = document.getElementById('last_reading');
const presentInput  = document.getElementById('present_reading');
const rateInput     = document.getElementById('rate_per_unit');
const previewBox    = document.getElementById('preview-box');
const previewUnits  = document.getElementById('preview-units');
const previewAmount = document.getElementById('preview-amount');
const prefillBadge  = document.getElementById('prefill-badge');
const formError     = document.getElementById('form-error');
const submitBtn     = document.getElementById('submit-btn');
const clearBtn      = document.getElementById('clear-btn');
const refreshBtn    = document.getElementById('refresh-btn');
const billsTbody    = document.getElementById('bills-tbody');
const historyLoading = document.getElementById('history-loading');
const historyEmpty  = document.getElementById('history-empty');
const tableWrap     = document.getElementById('history-table-wrap');
const mobileInput   = document.getElementById('mobile');
const remarksInput  = document.getElementById('remarks');
const usageBar      = document.getElementById('usage-bar');
const usageLabel    = document.getElementById('usage-label');

const USAGE_MAX = 5000;   // litres — full-scale for the visual usage meter

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}
function clearError() {
  formError.hidden = true;
  formError.textContent = '';
}

function fmtNum(n, dec = 2) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMonth(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  const d = new Date(+y, +m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Live calculation preview ──────────────────────────────────────────────────
function updatePreview() {
  const last    = parseFloat(lastInput.value);
  const present = parseFloat(presentInput.value);
  const rate    = parseFloat(rateInput.value);

  const previewEmpty = document.getElementById('preview-empty');
  const setDetail = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  if (!isNaN(last) && !isNaN(present) && !isNaN(rate) && present >= last && rate > 0) {
    const units  = present - last;
    const amount = units * rate;
    previewUnits.textContent  = fmtNum(units, 2) + ' L';
    previewAmount.textContent = '₹ ' + fmtNum(amount, 2);

    // Visual usage meter (relative to USAGE_MAX)
    if (usageBar) {
      const pct = Math.max(2, Math.min(100, (units / USAGE_MAX) * 100));
      usageBar.style.width = pct + '%';
      // colour tiers: low = green, medium = amber, high = red
      const tier = units >= USAGE_MAX * 0.8 ? '#c0392b'
                 : units >= USAGE_MAX * 0.5 ? '#e08e0b'
                 : '#1b7a4e';
      usageBar.style.background = tier;
    }
    if (usageLabel) usageLabel.textContent = fmtNum(units, 0) + ' L';

    setDetail('pv-rate',    '₹ ' + fmtNum(rate, 4));
    setDetail('pv-last',    fmtNum(last, 2) + ' L');
    setDetail('pv-present', fmtNum(present, 2) + ' L');

    previewBox.hidden = false;
    if (previewEmpty) previewEmpty.hidden = true;
  } else {
    previewBox.hidden = true;
    if (previewEmpty) previewEmpty.hidden = false;
    if (usageBar) usageBar.style.width = '0%';
  }
}

// ── Toast notifications ─────────────────────────────────────────────────────────
let _toastTimer;
function showToast(message, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

[lastInput, presentInput, rateInput].forEach(el => el.addEventListener('input', updatePreview));

// ── Rate preset chips ──────────────────────────────────────────────────────────
document.querySelectorAll('.rate-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    rateInput.value = chip.dataset.rate;
    document.querySelectorAll('.rate-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    updatePreview();
  });
});
// typing a custom rate clears the preset highlight
rateInput.addEventListener('input', () => {
  document.querySelectorAll('.rate-chip').forEach(c => c.classList.remove('active'));
});

// ── Meter prefill: fetch previous reading for this meter from the DB ───────────
async function prefillFromMeter() {
  const meter = meterInput.value.trim();
  if (!meter) { prefillBadge.hidden = true; return; }

  try {
    const res  = await fetch(`/api/last-reading?meter_number=${encodeURIComponent(meter)}`);
    const data = await res.json();

    if (data.found) {
      // Carry the previous bill's present reading into "Last Reading"
      lastInput.value = data.present_reading;
      prefillBadge.textContent = `prev: ${fmtNum(data.present_reading, 2)} L`;
      prefillBadge.hidden = false;

      // Pre-fill tenant / flat / floor if those fields are still empty
      if (!document.getElementById('tenant_name').value.trim()) {
        document.getElementById('tenant_name').value = data.tenant_name || '';
      }
      const flatSel  = document.getElementById('flat_number');
      const floorSel = document.getElementById('floor');
      if (!flatSel.value  && data.flat_number) flatSel.value  = data.flat_number;
      if (!floorSel.value && data.floor)        floorSel.value = data.floor;
      if (mobileInput && !mobileInput.value.trim() && data.mobile) {
        mobileInput.value = data.mobile;
      }

      updatePreview();
    } else {
      // No prior bill for this meter — leave Last Reading for manual entry
      prefillBadge.hidden = true;
    }
  } catch (_) {
    prefillBadge.hidden = true;
  }
}

meterInput.addEventListener('blur', prefillFromMeter);
meterInput.addEventListener('change', prefillFromMeter);

// ── Form submission ───────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  // Client-side guard
  const present = parseFloat(presentInput.value);
  const last    = parseFloat(lastInput.value);
  const rate    = parseFloat(rateInput.value);

  if (!isNaN(last) && !isNaN(present) && present < last) {
    showError('Present reading must be greater than or equal to last reading.');
    presentInput.focus();
    return;
  }

  if (!isNaN(rate) && rate <= 0) {
    showError('Rate per litre must be greater than zero.');
    rateInput.focus();
    return;
  }

  const payload = {
    society_name:    document.getElementById('society_name').value,
    tenant_name:     document.getElementById('tenant_name').value.trim(),
    flat_number:     document.getElementById('flat_number').value,
    floor:           document.getElementById('floor').value,
    mobile:          mobileInput ? mobileInput.value.trim() : '',
    meter_number:    meterInput.value.trim(),
    billing_month:   document.getElementById('billing_month').value,
    last_reading:    lastInput.value,
    present_reading: presentInput.value,
    rate_per_unit:   rateInput.value,
    remarks:         remarksInput ? remarksInput.value.trim() : '',
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const res  = await fetch('/api/bills', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to save bill.');
      showToast(data.error || 'Failed to save bill.', 'error');
      return;
    }

    // Offer immediate PDF download
    generatePDF(data);

    // Reset form
    form.reset();
    previewBox.hidden = true;
    prefillBadge.hidden = true;
    resetExtras();
    clearError();
    updatePreview();
    showToast('Bill saved — PDF downloaded.', 'success');

    // Reload history
    loadHistory();
  } catch (err) {
    showError('Network error — please try again.');
    showToast('Network error — please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Bill';
  }
});

// ── Clear button ──────────────────────────────────────────────────────────────
function resetExtras() {
  document.querySelectorAll('.rate-chip').forEach(c => c.classList.remove('active'));
  if (usageBar) usageBar.style.width = '0%';
}

clearBtn.addEventListener('click', () => {
  form.reset();
  previewBox.hidden = true;
  prefillBadge.hidden = true;
  resetExtras();
  clearError();
});

// ── Bill History ──────────────────────────────────────────────────────────────
async function loadHistory() {
  historyLoading.hidden = false;
  historyEmpty.hidden   = true;
  tableWrap.hidden      = true;

  try {
    const res   = await fetch('/api/bills');
    const bills = await res.json();

    historyLoading.hidden = true;
    updateStats(bills);

    if (!bills.length) {
      historyEmpty.hidden = false;
      return;
    }

    billsTbody.innerHTML = '';
    bills.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.id}</td>
        <td>${fmtMonth(b.billing_month)}</td>
        <td>${escHtml(b.tenant_name)}</td>
        <td>${escHtml(b.flat_number)}</td>
        <td>${escHtml(b.meter_number)}</td>
        <td class="num-col">${fmtNum(b.last_reading, 2)}</td>
        <td class="num-col">${fmtNum(b.present_reading, 2)}</td>
        <td class="num-col">${fmtNum(b.units_consumed, 2)}</td>
        <td class="num-col">${fmtNum(b.rate_per_unit, 4)}</td>
        <td class="num-col amount-cell">₹ ${fmtNum(b.total_amount, 2)}</td>
        <td><button class="btn-pdf" data-id="${b.id}">⬇ PDF</button></td>
      `;
      billsTbody.appendChild(tr);
    });

    tableWrap.hidden = false;
  } catch (_) {
    historyLoading.hidden = true;
    historyEmpty.hidden   = false;
    historyEmpty.textContent = 'Failed to load history.';
  }
}

// PDF download from history row
billsTbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-pdf');
  if (!btn) return;

  const id   = btn.dataset.id;
  btn.textContent = '…';

  try {
    const res  = await fetch(`/api/bills/${id}`);
    const bill = await res.json();
    if (res.ok) generatePDF(bill);
  } finally {
    btn.textContent = '⬇ PDF';
  }
});

refreshBtn.addEventListener('click', loadHistory);

// ── Dashboard summary stats (desktop) ──────────────────────────────────────────
function updateStats(bills) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  const count   = bills.length;
  const units   = bills.reduce((s, b) => s + Number(b.units_consumed || 0), 0);
  const amount  = bills.reduce((s, b) => s + Number(b.total_amount  || 0), 0);
  const meters  = new Set(bills.map(b => b.meter_number)).size;

  set('stat-bills',  fmtNum(count, 0));
  set('stat-units',  fmtNum(units, 0) + ' L');
  set('stat-amount', '₹ ' + fmtNum(amount, 0));
  set('stat-meters', fmtNum(meters, 0));
}

// ── View switching (Dashboard / Bill History / Admin) ──────────────────────────
const VIEW_META = {
  dashboard: { title: 'Dashboard',        sub: 'Create a new water bill entry' },
  history:   { title: 'Bill History',     sub: 'All saved bills' },
  admin:     { title: 'Admin — Database',  sub: 'View, edit or delete entries' },
};
let currentView = 'dashboard';

function switchView(name) {
  if (!VIEW_META[name]) name = 'dashboard';
  currentView = name;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('view-active');

  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });

  const t = document.getElementById('topbar-title');
  const s = document.getElementById('topbar-sub');
  if (t) t.textContent = VIEW_META[name].title;
  if (s) s.textContent = VIEW_META[name].sub;

  if (name === 'history') loadHistory();
  if (name === 'admin')   refreshAdminAuth();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); switchView(el.dataset.view); });
});

// Topbar refresh acts on whichever view is active
const topbarRefresh = document.getElementById('topbar-refresh');
if (topbarRefresh) topbarRefresh.addEventListener('click', () => {
  if (currentView === 'admin') refreshAdminAuth(); else loadHistory();
});

// ── Admin authentication ────────────────────────────────────────────────────────
const adminLoginCard = document.getElementById('admin-login');
const adminSection   = document.getElementById('admin-section');
const adminLoginForm = document.getElementById('admin-login-form');
const adminLoginErr  = document.getElementById('admin-login-error');
const adminLogoutBtn = document.getElementById('admin-logout');

function showAdminLogin() {
  if (adminLoginCard) adminLoginCard.hidden = false;
  if (adminSection)   adminSection.hidden = true;
}
function showAdminAuthed() {
  if (adminLoginCard) adminLoginCard.hidden = true;
  if (adminSection)   adminSection.hidden = false;
  loadAdmin();
}

async function refreshAdminAuth() {
  try {
    const res  = await fetch('/api/admin/status');
    const data = await res.json();
    if (data.authenticated) showAdminAuthed(); else showAdminLogin();
  } catch (_) {
    showAdminLogin();
  }
}

if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminLoginErr.hidden = true;
    const username = document.getElementById('admin-user').value.trim();
    const password = document.getElementById('admin-pass').value;
    try {
      const res  = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        adminLoginForm.reset();
        showAdminAuthed();
        showToast('Signed in as admin.', 'success');
      } else {
        adminLoginErr.textContent = data.error || 'Login failed.';
        adminLoginErr.hidden = false;
        showToast(data.error || 'Login failed.', 'error');
      }
    } catch (_) {
      adminLoginErr.textContent = 'Network error — please try again.';
      adminLoginErr.hidden = false;
    }
  });
}

if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch (_) {}
    showAdminLogin();
  });
}

// ── Admin: editable database table ─────────────────────────────────────────────
const adminTbody   = document.getElementById('admin-tbody');
const adminLoading = document.getElementById('admin-loading');
const adminEmpty   = document.getElementById('admin-empty');
const adminWrap    = document.getElementById('admin-table-wrap');
const adminRefresh = document.getElementById('admin-refresh');

async function loadAdmin() {
  adminLoading.hidden = false; adminEmpty.hidden = true; adminWrap.hidden = true;
  try {
    const res   = await fetch('/api/bills');
    const bills = await res.json();
    adminLoading.hidden = true;
    updateStats(bills);

    if (!bills.length) { adminEmpty.hidden = false; adminEmpty.textContent = 'No entries in the database.'; return; }

    adminTbody.innerHTML = '';
    bills.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.id}</td>
        <td>${fmtMonth(b.billing_month)}</td>
        <td>${escHtml(b.tenant_name)}</td>
        <td>${escHtml(b.flat_number)}</td>
        <td>${escHtml(b.floor)}</td>
        <td>${escHtml(b.mobile || '—')}</td>
        <td>${escHtml(b.meter_number)}</td>
        <td class="num-col">${fmtNum(b.last_reading, 2)}</td>
        <td class="num-col">${fmtNum(b.present_reading, 2)}</td>
        <td class="num-col">${fmtNum(b.units_consumed, 2)}</td>
        <td class="num-col">${fmtNum(b.rate_per_unit, 4)}</td>
        <td class="num-col amount-cell">₹ ${fmtNum(b.total_amount, 2)}</td>
        <td class="admin-actions"><button class="btn-edit" type="button">✎ Edit</button></td>`;
      tr.querySelector('.btn-edit').__bill = b;
      adminTbody.appendChild(tr);
    });
    adminWrap.hidden = false;
  } catch (_) {
    adminLoading.hidden = true; adminEmpty.hidden = false; adminEmpty.textContent = 'Failed to load.';
  }
}

if (adminRefresh) adminRefresh.addEventListener('click', loadAdmin);
adminTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-edit');
  if (btn && btn.__bill) openEditModal(btn.__bill);
});

// ── Edit modal ──────────────────────────────────────────────────────────────────
const editModal = document.getElementById('edit-modal');
const editError = document.getElementById('edit-error');
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v ?? ''); };

function openEditModal(b) {
  editError.hidden = true;
  setVal('e_id', b.id);
  document.getElementById('edit-id-label').textContent = '#' + b.id;
  setVal('e_tenant_name',    b.tenant_name);
  setVal('e_mobile',         b.mobile);
  setVal('e_flat_number',    b.flat_number || 'GND');
  setVal('e_floor',          b.floor || 'Gnd Flr');
  setVal('e_meter_number',   b.meter_number);
  setVal('e_billing_month',  b.billing_month);
  setVal('e_last_reading',   b.last_reading);
  setVal('e_present_reading', b.present_reading);
  setVal('e_rate_per_unit',  b.rate_per_unit);
  setVal('e_remarks',        b.remarks);
  editModal.hidden = false;
}
function closeEditModal() { editModal.hidden = true; }

document.getElementById('edit-close').addEventListener('click', closeEditModal);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

document.getElementById('edit-save').addEventListener('click', async () => {
  editError.hidden = true;
  const id = document.getElementById('e_id').value;
  const payload = {
    society_name:    'Mathru Nilaya',
    tenant_name:     document.getElementById('e_tenant_name').value.trim(),
    mobile:          document.getElementById('e_mobile').value.trim(),
    flat_number:     document.getElementById('e_flat_number').value,
    floor:           document.getElementById('e_floor').value,
    meter_number:    document.getElementById('e_meter_number').value.trim(),
    billing_month:   document.getElementById('e_billing_month').value,
    last_reading:    document.getElementById('e_last_reading').value,
    present_reading: document.getElementById('e_present_reading').value,
    rate_per_unit:   document.getElementById('e_rate_per_unit').value,
    remarks:         document.getElementById('e_remarks').value.trim(),
  };
  try {
    const res  = await fetch(`/api/bills/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.status === 401) { closeEditModal(); showAdminLogin(); return; }
    if (!res.ok) { editError.textContent = data.error || 'Update failed.'; editError.hidden = false; return; }
    closeEditModal();
    loadAdmin();
    loadHistory();   // also refreshes the summary stats
    showToast(`Bill #${id} updated.`, 'success');
  } catch (_) {
    editError.textContent = 'Network error — please try again.'; editError.hidden = false;
  }
});

document.getElementById('edit-delete').addEventListener('click', async () => {
  const id = document.getElementById('e_id').value;
  if (!confirm(`Delete bill #${id}? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/bills/${id}`, { method: 'DELETE' });
    if (res.status === 401) { closeEditModal(); showAdminLogin(); return; }
    if (res.ok) { closeEditModal(); loadAdmin(); loadHistory(); showToast(`Bill #${id} deleted.`, 'success'); }
    else { editError.textContent = 'Failed to delete.'; editError.hidden = false; }
  } catch (_) {
    editError.textContent = 'Failed to delete.'; editError.hidden = false;
  }
});

// ── PDF Generation (jsPDF, A4) — polished invoice layout ──────────────────────
function generatePDF(bill) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF engine did not load. Please hard-refresh the page (Ctrl+Shift+R) and try again.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Palette
  const BLUE      = [26, 111, 196];
  const BLUE_DARK = [20, 91, 160];
  const INK       = [33, 43, 54];
  const MUTED     = [120, 130, 142];
  const LINE      = [223, 228, 234];
  const SOFT      = [244, 247, 250];
  const TINT      = [232, 241, 251];

  const pageW  = 210;
  const pageH  = 297;
  const M      = 16;            // page margin
  const R      = pageW - M;     // right edge
  const W      = pageW - M * 2; // content width
  const rupee  = 'Rs. ';        // reliable across PDF viewers (₹ glyph is missing in core fonts)

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  // Save-water logo: white teardrop with a green leaf accent
  const drawDrop = (cx, cy, r) => {
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, r, 'F');
    doc.triangle(cx, cy - r * 2, cx - r * 0.8, cy - r * 0.5, cx + r * 0.8, cy - r * 0.5, 'F');
    doc.setFillColor(56, 179, 107);
    doc.triangle(cx, cy + r * 0.4, cx - r * 0.52, cy - r * 0.05, cx + r * 0.04, cy - r * 0.45, 'F');
  };

  // ── Header band ──────────────────────────────────────────────────────────
  setFill(BLUE);
  doc.rect(0, 0, pageW, 32, 'F');
  // thin accent strip
  setFill(BLUE_DARK);
  doc.rect(0, 32, pageW, 1.5, 'F');

  drawDrop(M + 4.5, 15, 4.6);

  setText([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('MATHRU NILAYA', M + 13, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Residential Water Billing System', M + 13, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('WATER BILL', R, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Bill #${bill.id}`, R, 22, { align: 'right' });

  // ── Meta strip: Billed To  |  Bill details ───────────────────────────────
  let y = 46;
  const issued = bill.created_at
    ? new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const colMid = M + W * 0.58;

  // labels
  setText(MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BILLED TO', M, y);
  doc.text('BILL DETAILS', colMid, y);

  // Billed-to block
  setText(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(bill.tenant_name || '—'), M, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setText([90, 100, 112]);
  doc.text(`Flat ${bill.flat_number}  -  ${bill.floor}`, M, y + 13);
  let btY = y + 18.5;
  doc.text(`Meter No: ${bill.meter_number}`, M, btY);
  if (bill.mobile) { btY += 5.5; doc.text(`Mobile: ${bill.mobile}`, M, btY); }

  // Bill-details block (label : value rows, right column)
  const detail = [
    ['Billing Month', fmtMonth(bill.billing_month)],
    ['Issue Date',    issued],
    ['Bill Number',   `#${bill.id}`],
  ];
  doc.setFontSize(9.5);
  let dy = y + 7;
  detail.forEach(([k, v]) => {
    setText(MUTED);     doc.setFont('helvetica', 'normal'); doc.text(k, colMid, dy);
    setText(INK);       doc.setFont('helvetica', 'bold');   doc.text(String(v), R, dy, { align: 'right' });
    dy += 6;
  });

  // divider
  y += 26;
  setDraw(LINE); doc.setLineWidth(0.4);
  doc.line(M, y, R, y);
  y += 10;

  // ── Readings & charges table ─────────────────────────────────────────────
  // table header
  setFill(BLUE);
  doc.rect(M, y, W, 9, 'F');
  setText([255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DESCRIPTION', M + 4, y + 6);
  doc.text('AMOUNT', R - 4, y + 6, { align: 'right' });
  y += 9;

  const lineRows = [
    ['Previous meter reading',  fmtNum(bill.last_reading, 2) + ' L'],
    ['Present meter reading',   fmtNum(bill.present_reading, 2) + ' L'],
    ['Units consumed',          fmtNum(bill.units_consumed, 2) + ' L'],
    ['Rate per litre',          rupee + fmtNum(bill.rate_per_unit, 4)],
  ];

  doc.setFontSize(10);
  lineRows.forEach(([k, v], i) => {
    const rowH = 9;
    if (i % 2 === 0) { setFill(SOFT); doc.rect(M, y, W, rowH, 'F'); }
    setText([60, 70, 82]); doc.setFont('helvetica', 'normal');
    doc.text(k, M + 4, y + 6);
    setText(INK); doc.setFont('helvetica', 'bold');
    doc.text(v, R - 4, y + 6, { align: 'right' });
    y += rowH;
  });
  // table border
  setDraw(LINE); doc.setLineWidth(0.4);
  doc.rect(M, y - lineRows.length * 9, W, lineRows.length * 9, 'S');

  y += 8;

  // ── Total due box ────────────────────────────────────────────────────────
  const boxH = 20;
  setFill(TINT);
  doc.roundedRect(M, y, W, boxH, 2.5, 2.5, 'F');
  setDraw([180, 210, 240]);
  doc.setLineWidth(0.5);
  doc.roundedRect(M, y, W, boxH, 2.5, 2.5, 'S');

  setText(BLUE_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL AMOUNT DUE', M + 5, y + 9);

  doc.setFontSize(16);
  doc.text(rupee + fmtNum(bill.total_amount, 2), R - 5, y + 10, { align: 'right' });

  setText([90, 110, 135]);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text(amountInWords(bill.total_amount), M + 5, y + 16);

  y += boxH + 12;

  // ── Remarks / Notes ──────────────────────────────────────────────────────
  setText(MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(bill.remarks ? 'REMARKS' : 'NOTES', M, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText([110, 120, 132]);

  let ny = y + 5;
  if (bill.remarks) {
    const lines = doc.splitTextToSize(String(bill.remarks), W);
    doc.text(lines, M, ny);
    ny += lines.length * 4.5 + 3;
  }
  doc.text('This is a computer-generated bill and does not require a signature.', M, ny);
  doc.text('Please retain this receipt for your records.', M, ny + 5);

  // ── Footer band ──────────────────────────────────────────────────────────
  setFill(BLUE);
  doc.rect(0, pageH - 14, pageW, 14, 'F');
  setText([255, 255, 255]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Mathru Nilaya  -  Water Billing System', M, pageH - 5.5);
  doc.text(`Generated ${issued}`, R, pageH - 5.5, { align: 'right' });

  const filename = `WaterBill_${bill.meter_number}_${bill.billing_month || bill.id}.pdf`
    .replace(/[^a-zA-Z0-9_\-.]/g, '_');
  doc.save(filename);
}

// ── Indian number to words ─────────────────────────────────────────────────────
function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function wordify(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + wordify(n % 100);
  }

  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);

  let words = '';
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  if (rupees > 0) {
    const cr    = Math.floor(rupees / 10000000);
    const lakh  = Math.floor((rupees % 10000000) / 100000);
    const thou  = Math.floor((rupees % 100000) / 1000);
    const rem   = rupees % 1000;

    if (cr)   words += wordify(cr)   + 'Crore ';
    if (lakh) words += wordify(lakh) + 'Lakh ';
    if (thou) words += wordify(thou) + 'Thousand ';
    if (rem)  words += wordify(rem);
    words = words.trim() + ' Rupees';
  }

  if (paise > 0) words += (rupees > 0 ? ' and ' : '') + wordify(paise).trim() + ' Paise';

  return (words.trim() + ' Only').replace(/\s+/g, ' ');
}

// ── Sanitise for innerHTML ────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadHistory();

// Pre-select current month
const monthInput = document.getElementById('billing_month');
const now = new Date();
monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
