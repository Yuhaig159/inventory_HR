/* ============================================================
   INVENTORY XNT SYSTEM - FRONTEND JAVASCRIPT
   Author: KhoHC Team | Version: 1.0
   ============================================================ */

'use strict';

// ── CONFIGURATION (loaded from localStorage) ──────────────────
let CONFIG = {
  apiUrl: localStorage.getItem('khohc_apiUrl') || '',
  apiKey: localStorage.getItem('khohc_apiKey') || '',
};

// ── STATE ─────────────────────────────────────────────────────
const state = {
  inventory:    [],   // Array of { sku, itemName, unit, currentStock, minStock }
  filteredInv:  [],
  currentPage:  'inventory',
  rowCountOut:  0,
  rowCountIn:   0,
};

// ── DOM REFERENCES ────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const DOM = {
  statusPill:     $('statusPill'),
  statusText:     $('statusText'),
  inventoryCount: $('inventoryCount'),
  statTotal:      $('statTotal'),
  statLow:        $('statLow'),
  statOut:        $('statOut'),
  inventoryBody:  $('inventoryBody'),
  inventorySearch:$('inventorySearch'),
  historyBody:    $('historyBody'),
  loadingOverlay: $('loadingOverlay'),
  settingsModal:  $('settingsModal'),
  itemRows:       $('itemRows'),
  itemRowsIn:     $('itemRowsIn'),
  pdfResultCard:  $('pdfResultCard'),
  pdfTransId:     $('pdfTransId'),
  pdfOpenLink:    $('pdfOpenLink'),
};

// ── UTILITIES ─────────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} msg - Main message
 * @param {'success'|'error'|'warn'} type
 * @param {string} [sub] - Optional subtitle
 */
function showToast(msg, type = 'success', sub = '') {
  const container = $('toastContainer');
  const icons = { success: '✅', error: '❌', warn: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '✅'}</span>
    <div>
      <div class="toast-msg">${escapeHtml(msg)}</div>
      ${sub ? `<div class="toast-sub">${escapeHtml(sub)}</div>` : ''}
    </div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('closing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 4000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setLoading(show) {
  DOM.loadingOverlay.classList.toggle('hidden', !show);
}

function setStatus(state) {
  const pill = DOM.statusPill;
  pill.className = 'status-pill ' + state;
  const texts = { connected: '🟢 Đã kết nối', disconnected: '🔴 Mất kết nối', 'loading-pill': '🟡 Đang kết nối…' };
  DOM.statusText.textContent = texts[state] || state;
}

function setBtnLoading(btn, spinner, loading) {
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
    spinner.style.display = 'inline-block';
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

// ── API LAYER ─────────────────────────────────────────────────

/**
 * Wrapper fetch cho GET requests.
 */
async function apiGet(params = {}) {
  if (!CONFIG.apiUrl) throw new Error('Chưa cấu hình URL API. Vui lòng vào Cài đặt.');
  const url = new URL(CONFIG.apiUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message);
  return data;
}

/**
 * Wrapper fetch cho POST requests.
 */
async function apiPost(body = {}) {
  if (!CONFIG.apiUrl) throw new Error('Chưa cấu hình URL API. Vui lòng vào Cài đặt.');
  const res = await fetch(CONFIG.apiUrl, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key':    CONFIG.apiKey,
    },
    body: JSON.stringify(body),
  });
  // GAS trả về 200 kể cả khi có lỗi logic, nên đọc JSON và kiểm tra status field
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message);
  return data;
}

// ── DATA LOADING ──────────────────────────────────────────────

async function loadInventory() {
  setStatus('loading-pill');
  try {
    const data = await apiGet({ action: 'getInventory' });
    state.inventory   = data.data || [];
    state.filteredInv = [...state.inventory];
    renderInventoryTable(state.filteredInv);
    updateSidebarStats();
    setStatus('connected');
    DOM.inventoryCount.textContent = state.inventory.length;
  } catch (err) {
    setStatus('disconnected');
    DOM.inventoryBody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Không thể tải dữ liệu</div>
          <div class="empty-sub">${escapeHtml(err.message)}</div>
        </div>
      </td></tr>`;
    showToast(err.message, 'error', 'Kiểm tra URL & API Key trong Cài đặt');
  }
}

async function loadHistory() {
  DOM.historyBody.innerHTML = `
    <tr><td colspan="6">
      <div class="empty-state"><div class="empty-icon" style="animation:spin 1s linear infinite">⏳</div><div class="empty-title">Đang tải…</div></div>
    </td></tr>`;
  try {
    const data = await apiGet({ action: 'getTransactions' });
    renderHistoryTable(data.data || []);
  } catch (err) {
    DOM.historyBody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Lỗi khi tải lịch sử</div>
          <div class="empty-sub">${escapeHtml(err.message)}</div>
        </div>
      </td></tr>`;
  }
}

// ── RENDER FUNCTIONS ──────────────────────────────────────────

function renderInventoryTable(items) {
  if (!items || items.length === 0) {
    DOM.inventoryBody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">Kho trống hoặc không có kết quả</div>
          <div class="empty-sub">Kiểm tra lại URL API hoặc dữ liệu trong Google Sheets.</div>
        </div>
      </td></tr>`;
    return;
  }

  DOM.inventoryBody.innerHTML = items.map(item => {
    let stockClass = 'ok';
    let statusLabel = 'Còn hàng';
    if (item.currentStock <= 0) {
      stockClass = 'out'; statusLabel = 'Hết hàng';
    } else if (item.currentStock <= item.minStock) {
      stockClass = 'low'; statusLabel = 'Sắp hết';
    }
    return `
      <tr>
        <td><span class="td-sku">${escapeHtml(item.sku)}</span></td>
        <td style="font-weight:600">${escapeHtml(item.itemName)}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td style="font-weight:700">${item.currentStock}</td>
        <td style="color:var(--text-secondary)">${item.minStock}</td>
        <td><span class="stock-badge ${stockClass}">${statusLabel}</span></td>
      </tr>`;
  }).join('');
}

function updateSidebarStats() {
  const total = state.inventory.length;
  const low   = state.inventory.filter(i => i.currentStock > 0 && i.currentStock <= i.minStock).length;
  const out   = state.inventory.filter(i => i.currentStock <= 0).length;
  DOM.statTotal.textContent = total;
  DOM.statLow.textContent   = low;
  DOM.statOut.textContent   = out;
}

function renderHistoryTable(items) {
  if (!items || items.length === 0) {
    DOM.historyBody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Chưa có giao dịch nào</div>
        </div>
      </td></tr>`;
    return;
  }

  DOM.historyBody.innerHTML = items.map(t => `
    <tr>
      <td><span class="td-sku">${escapeHtml(t.transId)}</span></td>
      <td style="white-space:nowrap;color:var(--text-secondary)">${escapeHtml(t.timestamp)}</td>
      <td><span class="type-badge ${t.type === 'IN' ? 'in' : 'out'}">${t.type === 'IN' ? '📥 Nhập' : '📤 Xuất'}</span></td>
      <td>${escapeHtml(t.recipient || '—')}</td>
      <td style="font-weight:700;text-align:center">${t.totalItems}</td>
      <td>${t.pdfLink && !t.pdfLink.startsWith('PDF_ERROR')
        ? `<a class="pdf-link-btn" href="${escapeHtml(t.pdfLink)}" target="_blank" rel="noopener"><span class="material-icons-round" style="font-size:14px">open_in_new</span>Xem PDF</a>`
        : '<span style="color:var(--text-tertiary);font-size:12px">—</span>'
      }</td>
    </tr>`).join('');
}

// ── ITEM ROW MANAGEMENT ───────────────────────────────────────

let rowIdCounter = 0;

/**
 * Create a new item row for Stock Out or Stock In forms.
 * @param {'out'|'in'} mode
 */
function createItemRow(mode = 'out') {
  const id       = ++rowIdCounter;
  const containerId = mode === 'out' ? 'itemRows' : 'itemRowsIn';
  const container   = $(containerId);
  
  if (!container) {
    console.error(`Container ${containerId} not found!`);
    return;
  }

  const row = document.createElement('div');
  row.className = 'item-row';
  row.id        = `itemRow-${id}`;
  row.innerHTML = `
    <div class="autocomplete-wrap">
      <input
        type="text"
        class="form-input item-name-input"
        id="itemName-${id}"
        placeholder="Nhập tên hoặc SKU vật tư…"
        autocomplete="off"
        aria-label="Tên vật tư"
        data-sku=""
        data-mode="${mode}"
        data-rowid="${id}"
      />
      <div class="autocomplete-list" id="acList-${id}"></div>
    </div>

    <select class="form-select item-unit-select" id="itemUnit-${id}" aria-label="Đơn vị" disabled>
      <option value="">— Đơn vị —</option>
    </select>

    <input
      type="number"
      class="form-input item-qty-input"
      id="itemQty-${id}"
      placeholder="SL"
      min="1"
      aria-label="Số lượng"
      style="text-align:center"
    />

    <button class="remove-btn" title="Xóa dòng này" aria-label="Xóa dòng" onclick="removeItemRow(${id})">
      <span class="material-icons-round" style="font-size:18px">close</span>
    </button>`;
  container.appendChild(row);

  // Attach autocomplete
  attachAutocomplete(id, mode);

  // Animate in
  row.style.opacity = '0';
  row.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    row.style.transition = '0.3s cubic-bezier(0.34,1.56,0.64,1)';
    row.style.opacity = '1';
    row.style.transform = 'translateY(0)';
  });
}

function removeItemRow(id) {
  const row = $(`itemRow-${id}`);
  if (!row) return;
  row.style.transition = '0.2s ease';
  row.style.opacity = '0';
  row.style.transform = 'scale(0.96)';
  setTimeout(() => row.remove(), 200);
}

/**
 * Attach autocomplete behavior to an item row's name input.
 */
function attachAutocomplete(id, mode) {
  const input  = $(`itemName-${id}`);
  const acList = $(`acList-${id}`);
  const unitSel= $(`itemUnit-${id}`);
  let focusedIdx = -1;

  function showList(results) {
    if (!results.length) {
      acList.innerHTML = `<div class="autocomplete-no-result">Không tìm thấy vật tư phù hợp</div>`;
      acList.classList.add('open');
      return;
    }
    acList.innerHTML = results.map((item, idx) => {
      const stockClass = item.currentStock <= item.minStock ? 'low' : '';
      return `
        <div class="autocomplete-item" data-idx="${idx}" data-sku="${escapeHtml(item.sku)}" tabindex="-1">
          <div>
            <div class="autocomplete-item-name">${escapeHtml(item.itemName)}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(item.sku)}</div>
          </div>
          <div class="autocomplete-item-stock ${stockClass}">Tồn: ${item.currentStock} ${escapeHtml(item.unit)}</div>
        </div>`;
    }).join('');
    acList.classList.add('open');
    focusedIdx = -1;

    // Click to select
    acList.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const sku = el.dataset.sku;
        selectItem(sku);
      });
    });
  }

  function hideList() {
    acList.classList.remove('open');
    focusedIdx = -1;
  }

  function selectItem(sku) {
    const item = state.inventory.find(i => i.sku === sku);
    if (!item) return;
    input.value        = item.itemName;
    input.dataset.sku  = item.sku;
    unitSel.innerHTML  = `<option value="${escapeHtml(item.unit)}">${escapeHtml(item.unit)}</option>`;
    unitSel.disabled   = true;
    hideList();
    $(`itemQty-${id}`)?.focus();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    input.dataset.sku = ''; // Reset selection
    if (!q) { hideList(); return; }
    const results = state.inventory.filter(i =>
      i.itemName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
    ).slice(0, 10);
    showList(results);
  });

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    const items = acList.querySelectorAll('.autocomplete-item');
    if (!acList.classList.contains('open')) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusedIdx = Math.max(focusedIdx - 1, 0);
        items.forEach((el, i) => el.classList.toggle('focused', i === focusedIdx));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIdx >= 0 && items[focusedIdx]) {
          selectItem(items[focusedIdx].dataset.sku);
        }
        break;
      case 'Escape':
        hideList();
        break;
    }
  });

  input.addEventListener('blur', () => setTimeout(hideList, 150));
}

/**
 * Collect item rows data from a form.
 * @param {'out'|'in'} mode
 * @returns {{ valid: boolean, items: Array, errors: string[] }}
 */
function collectItems(mode) {
  const containerId = mode === 'out' ? 'itemRows' : 'itemRowsIn';
  const container   = $(containerId);
  const rows        = container.querySelectorAll('.item-row');
  const items       = [];
  const errors      = [];

  if (rows.length === 0) {
    errors.push('Vui lòng thêm ít nhất một vật tư vào phiếu.');
    return { valid: false, items, errors };
  }

  rows.forEach((row, idx) => {
    const nameInput = row.querySelector('.item-name-input');
    const qtyInput  = row.querySelector('.item-qty-input');
    const sku       = nameInput?.dataset.sku?.trim();
    const qty       = parseInt(qtyInput?.value, 10);

    if (!sku) {
      errors.push(`Dòng ${idx + 1}: Chưa chọn vật tư từ danh sách gợi ý.`);
    } else if (!qty || qty <= 0) {
      errors.push(`Dòng ${idx + 1}: Số lượng phải lớn hơn 0.`);
    } else {
      items.push({ sku, qty });
    }
  });

  return { valid: errors.length === 0, items, errors };
}

// ── PAGE NAVIGATION ───────────────────────────────────────────

const pages = ['inventory', 'stockout', 'stockin', 'history'];

function navigateTo(page) {
  state.currentPage = page;
  
  // Map page names to exact DOM IDs (matching index.html)
  const pageMap = {
    'inventory': 'pageInventory',
    'stockout':  'pageStockOut',
    'stockin':   'pageStockIn',
    'history':   'pageHistory'
  };

  // Hide all sections, show the active one
  Object.values(pageMap).forEach(id => {
    const section = $(id);
    if (section) section.classList.toggle('hidden', id !== pageMap[page]);
  });

  // Update Sidebar (Desktop)
  const sidebarMap = {
    'inventory': 'navInventory',
    'stockout':  'navStockOut',
    'stockin':   'navStockIn',
    'history':   'navHistory'
  };
  
  Object.values(sidebarMap).forEach(id => {
    const nav = $(id);
    if (nav) nav.classList.remove('active');
  });
  
  const activeSidebarNav = $(sidebarMap[page]);
  if (activeSidebarNav) activeSidebarNav.classList.add('active');

  // Update Mobile Nav (Bottom Bar)
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  mobileNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  if (page === 'history') loadHistory();
}

// ── SUBMIT: STOCK OUT ─────────────────────────────────────────

async function handleStockOut() {
  const recipient = $('outRecipient').value.trim();
  const note      = $('outNote').value.trim();

  // Validate
  if (!recipient) {
    $('outRecipient').classList.add('error');
    $('outRecipient').focus();
    showToast('Vui lòng nhập tên người nhận.', 'error');
    return;
  }
  $('outRecipient').classList.remove('error');

  const { valid, items, errors } = collectItems('out');
  if (!valid) {
    showToast(errors[0], 'error', errors.slice(1).join(' | ') || '');
    return;
  }

  const btn     = $('btnSubmitOut');
  const spinner = $('spinnerOut');
  setBtnLoading(btn, spinner, true);
  setLoading(true);

  try {
    const result = await apiPost({ action: 'stockOut', recipient, items, note });
    setLoading(false);
    setBtnLoading(btn, spinner, false);

    // Refresh inventory state
    await loadInventory();

    // Show PDF result
    DOM.pdfTransId.textContent = result.transId || 'Xuất kho thành công';
    if (result.link && !result.link.startsWith('PDF_ERROR')) {
      DOM.pdfOpenLink.href = result.link;
      DOM.pdfOpenLink.style.display = '';
    } else {
      DOM.pdfOpenLink.style.display = 'none';
    }
    DOM.pdfResultCard.classList.add('show');

    showToast(result.message || 'Xuất kho thành công!', 'success');

    // Auto-open PDF in new tab
    if (result.link && !result.link.startsWith('PDF_ERROR')) {
      setTimeout(() => window.open(result.link, '_blank', 'noopener'), 600);
    }

  } catch (err) {
    setLoading(false);
    setBtnLoading(btn, spinner, false);
    showToast(err.message, 'error');
  }
}

// ── SUBMIT: STOCK IN ──────────────────────────────────────────

async function handleStockIn() {
  const supplier = $('inSupplier').value.trim();
  const note     = $('inNote').value.trim();

  const { valid, items, errors } = collectItems('in');
  if (!valid) {
    showToast(errors[0], 'error', errors.slice(1).join(' | ') || '');
    return;
  }

  const btn     = $('btnSubmitIn');
  const spinner = $('spinnerIn');
  setBtnLoading(btn, spinner, true);

  try {
    const result = await apiPost({ action: 'stockIn', supplier, note, items });
    setBtnLoading(btn, spinner, false);
    await loadInventory();
    resetFormIn();
    showToast(result.message || 'Nhập kho thành công!', 'success');
    navigateTo('inventory');
  } catch (err) {
    setBtnLoading(btn, spinner, false);
    showToast(err.message, 'error');
  }
}

// ── FORM RESET ────────────────────────────────────────────────

function resetFormOut() {
  $('outRecipient').value = '';
  $('outNote').value      = '';
  $('outRecipient').classList.remove('error');
  $('itemRows').innerHTML = '';
  DOM.pdfResultCard.classList.remove('show');
  createItemRow('out'); // Start with one empty row
}

function resetFormIn() {
  $('inSupplier').value   = '';
  $('inNote').value       = '';
  $('itemRowsIn').innerHTML = '';
  createItemRow('in');
}

// ── INVENTORY SEARCH ──────────────────────────────────────────

function handleInventorySearch(query) {
  const q = query.toLowerCase().trim();
  state.filteredInv = q
    ? state.inventory.filter(i =>
        i.itemName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
      )
    : [...state.inventory];
  renderInventoryTable(state.filteredInv);
}

// ── SETTINGS ──────────────────────────────────────────────────

function openSettings() {
  $('cfgApiUrl').value = CONFIG.apiUrl;
  $('cfgApiKey').value = CONFIG.apiKey;
  DOM.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  DOM.settingsModal.classList.add('hidden');
}

function saveSettings() {
  const url = $('cfgApiUrl').value.trim();
  const key = $('cfgApiKey').value.trim();

  if (!url) {
    showToast('Vui lòng nhập GAS Web App URL.', 'error');
    return;
  }

  CONFIG.apiUrl = url;
  CONFIG.apiKey = key;
  localStorage.setItem('khohc_apiUrl', url);
  localStorage.setItem('khohc_apiKey', key);

  closeSettings();
  showToast('Đã lưu cấu hình!', 'success', 'Đang kết nối lại…');
  setTimeout(loadInventory, 400);
}

// ── EVENT LISTENERS ───────────────────────────────────────────

function initEventListeners() {
  // Sidebar Nav (Desktop)
  $('navInventory')?.addEventListener('click', () => navigateTo('inventory'));
  $('navStockOut')?.addEventListener('click',  () => { navigateTo('stockout'); resetFormOut(); });
  $('navStockIn')?.addEventListener('click',   () => { navigateTo('stockin');  resetFormIn();  });
  $('navHistory')?.addEventListener('click',   () => navigateTo('history'));

  // Mobile Bottom Nav
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      navigateTo(page);
      if (page === 'stockout') resetFormOut();
      if (page === 'stockin') resetFormIn();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Shortcut buttons
  $('btnGoStockOut')?.addEventListener('click',    () => { navigateTo('stockout'); resetFormOut(); });
  $('btnBackFromOut')?.addEventListener('click',   () => navigateTo('inventory'));
  $('btnBackFromIn')?.addEventListener('click',    () => navigateTo('inventory'));
  $('btnRefreshHistory')?.addEventListener('click',() => loadHistory());

  // Add rows
  $('btnAddRow')?.addEventListener('click',   () => createItemRow('out'));
  $('btnAddRowIn')?.addEventListener('click',  () => createItemRow('in'));

  // Submit
  $('btnSubmitOut')?.addEventListener('click', handleStockOut);
  $('btnSubmitIn')?.addEventListener('click',  handleStockIn);

  // Reset
  $('btnResetOut')?.addEventListener('click', resetFormOut);
  $('btnResetIn')?.addEventListener('click',  resetFormIn);

  // New transaction
  $('btnNewTransaction')?.addEventListener('click', resetFormOut);

  // Refresh
  $('btnRefresh')?.addEventListener('click', loadInventory);

  // Inventory search
  DOM.inventorySearch?.addEventListener('input', e => handleInventorySearch(e.target.value));

  // Settings
  $('btnSettings')?.addEventListener('click',       openSettings);
  $('btnCloseSettings')?.addEventListener('click',  closeSettings);
  $('btnSaveSettings')?.addEventListener('click',   saveSettings);
  DOM.settingsModal?.addEventListener('click', e => {
    if (e.target === DOM.settingsModal) closeSettings();
  });

  // Close settings on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !DOM.settingsModal.classList.contains('hidden')) closeSettings();
  });
}

// ── INITIALIZATION ────────────────────────────────────────────

async function init() {
  initEventListeners();
  navigateTo('inventory'); // Sync initial UI state

  // Show settings modal if not configured
  if (!CONFIG.apiUrl) {
    setTimeout(() => {
      showToast('Chưa có cấu hình API', 'warn', 'Nhấn biểu tượng ⚙️ ở góc trên để cài đặt.');
      setStatus('disconnected');
    }, 800);
    return;
  }

  await loadInventory();
}

// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
