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

  if (!isNaN(last) && !isNaN(present) && !isNaN(rate) && present >= last && rate > 0) {
    const units  = present - last;
    const amount = units * rate;
    previewUnits.textContent  = fmtNum(units, 2) + ' L';
    previewAmount.textContent = '₹ ' + fmtNum(amount, 2);
    previewBox.hidden = false;
  } else {
    previewBox.hidden = true;
  }
}

[lastInput, presentInput, rateInput].forEach(el => el.addEventListener('input', updatePreview));

// ── Meter prefill on blur ─────────────────────────────────────────────────────
meterInput.addEventListener('blur', async () => {
  const meter = meterInput.value.trim();
  if (!meter) return;

  try {
    const res  = await fetch(`/api/last-reading?meter_number=${encodeURIComponent(meter)}`);
    const data = await res.json();

    if (data.found) {
      lastInput.value = data.present_reading;
      prefillBadge.hidden = false;

      // Pre-fill tenant info if fields are empty
      if (!document.getElementById('tenant_name').value.trim()) {
        document.getElementById('tenant_name').value = data.tenant_name || '';
      }
      const flatSel  = document.getElementById('flat_number');
      const floorSel = document.getElementById('floor');
      if (!flatSel.value  && data.flat_number) flatSel.value  = data.flat_number;
      if (!floorSel.value && data.floor)        floorSel.value = data.floor;

      updatePreview();
    } else {
      prefillBadge.hidden = true;
    }
  } catch (_) {
    prefillBadge.hidden = true;
  }
});

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
    meter_number:    meterInput.value.trim(),
    billing_month:   document.getElementById('billing_month').value,
    last_reading:    lastInput.value,
    present_reading: presentInput.value,
    rate_per_unit:   rateInput.value,
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
      return;
    }

    // Offer immediate PDF download
    generatePDF(data);

    // Reset form
    form.reset();
    previewBox.hidden = true;
    prefillBadge.hidden = true;
    clearError();

    // Reload history
    loadHistory();
  } catch (err) {
    showError('Network error — please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Bill';
  }
});

// ── Clear button ──────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  form.reset();
  previewBox.hidden = true;
  prefillBadge.hidden = true;
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

// ── PDF Generation (jsPDF, A4) ────────────────────────────────────────────────
function generatePDF(bill) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW  = 210;
  const margin = 18;
  const colR   = pageW - margin;

  let y = 20;

  // Header band
  doc.setFillColor(26, 111, 196);
  doc.rect(0, 0, pageW, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('WATER BILL', pageW / 2, 16, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Mathru Nilaya', pageW / 2, 24, { align: 'center' });

  doc.setFontSize(9);
  doc.text('Residential Water Billing System', pageW / 2, 30, { align: 'center' });

  y = 50;

  // Bill meta
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Bill No: #${bill.id}`, margin, y);
  doc.text(`Month: ${fmtMonth(bill.billing_month)}`, colR, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const issued = bill.created_at
    ? new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  doc.text(`Issued: ${issued}`, margin, y);

  y += 10;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, colR, y);
  y += 8;

  // Tenant details box
  doc.setFillColor(240, 244, 248);
  doc.roundedRect(margin, y, pageW - margin * 2, 28, 2, 2, 'F');

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TENANT DETAILS', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`${bill.tenant_name}`, margin + 4, y + 14);
  doc.text(`Flat ${bill.flat_number}  •  ${bill.floor}`, margin + 4, y + 21);

  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.text(`Meter No: ${bill.meter_number}`, colR - 4, y + 14, { align: 'right' });

  y += 36;

  // Readings table header
  doc.setFillColor(26, 111, 196);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');

  const col1 = margin + 4;
  const col2 = margin + 70;
  const col3 = margin + 115;
  const col4 = colR - 4;

  doc.text('Description', col1, y + 5.5);
  doc.text('Last (L)', col2, y + 5.5);
  doc.text('Present (L)', col3, y + 5.5);
  doc.text('Consumed (L)', col4, y + 5.5, { align: 'right' });

  y += 8;

  // Reading row
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, pageW - margin * 2, 10, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.rect(margin, y, pageW - margin * 2, 10, 'S');

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Meter Reading', col1, y + 6.5);
  doc.text(fmtNum(bill.last_reading, 2), col2, y + 6.5);
  doc.text(fmtNum(bill.present_reading, 2), col3, y + 6.5);
  doc.text(fmtNum(bill.units_consumed, 2), col4, y + 6.5, { align: 'right' });

  y += 18;

  // Calculation rows
  const rows = [
    ['Units Consumed', '', '', fmtNum(bill.units_consumed, 2) + ' L'],
    ['Rate per Litre', '', '', '₹ ' + fmtNum(bill.rate_per_unit, 4)],
  ];

  rows.forEach((row, i) => {
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(margin, y, pageW - margin * 2, 9, 'F');
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, y + 9, colR, y + 9);
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9.5);
    doc.text(row[0], col1, y + 6);
    doc.text(row[3], col4, y + 6, { align: 'right' });
    y += 9;
  });

  y += 4;

  // Total amount box
  doc.setFillColor(232, 241, 251);
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 2, 2, 'F');
  doc.setDrawColor(180, 210, 240);
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 91, 160);
  doc.text('TOTAL AMOUNT DUE', col1, y + 7);

  doc.setFontSize(14);
  doc.text('₹ ' + fmtNum(bill.total_amount, 2), col4, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 100, 130);
  doc.text(amountInWords(bill.total_amount), col1, y + 14);

  y += 28;

  // Footer note
  doc.setTextColor(160, 160, 160);
  doc.setFontSize(8);
  doc.text('This is a computer-generated bill. Please retain for records.', pageW / 2, y, { align: 'center' });

  // Bottom band
  doc.setFillColor(26, 111, 196);
  doc.rect(0, 285, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('Mathru Nilaya — Water Billing System', pageW / 2, 292, { align: 'center' });

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
