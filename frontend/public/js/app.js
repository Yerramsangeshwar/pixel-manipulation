// PixelVault Full-Stack — Frontend Application
// Auth + Encryption Engine + Backend API Integration

(function () {
  'use strict';

  const API = '/api';
  let token = localStorage.getItem('pv_token') || null;
  let currentUser = localStorage.getItem('pv_user') || null;
  let isGuest = false;

  // ── State ──
  let currentMethod = 'xor';
  let originalImageData = null;
  let sourceImage = null;
  let currentFilename = '';
  let lastResultDataUrl = null;
  let lastOperation = null;
  const channels = { r: true, g: true, b: true };
  let bitRotDir = 'left';
  let historyOffset = 0;
  const HISTORY_LIMIT = 12;

  // ── DOM ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ─────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────

  function showToast(msg, type = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => { t.className = 'toast'; }, 3500);
  }

  async function apiCall(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + endpoint, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function initAuth() {
    // Auth tabs
    $$('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        $$('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        $(`#${tab.dataset.tab}Form`).classList.add('active');
      });
    });

    // Login
    $('#loginBtn').addEventListener('click', async () => {
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const errEl = $('#loginError');
      errEl.textContent = '';
      if (!email || !password) { errEl.textContent = 'Please fill all fields'; return; }
      $('#loginBtn').textContent = 'Signing in...';
      try {
        const data = await apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        token = data.token;
        currentUser = data.username;
        localStorage.setItem('pv_token', token);
        localStorage.setItem('pv_user', currentUser);
        launchApp();
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        $('#loginBtn').textContent = 'Sign In';
      }
    });

    // Register
    $('#registerBtn').addEventListener('click', async () => {
      const username = $('#regUsername').value.trim();
      const email = $('#regEmail').value.trim();
      const password = $('#regPassword').value;
      const errEl = $('#registerError');
      errEl.textContent = '';
      if (!username || !email || !password) { errEl.textContent = 'Please fill all fields'; return; }
      $('#registerBtn').textContent = 'Creating account...';
      try {
        const data = await apiCall('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
        token = data.token;
        currentUser = data.username;
        localStorage.setItem('pv_token', token);
        localStorage.setItem('pv_user', currentUser);
        launchApp();
      } catch (err) {
        errEl.textContent = err.message;
      } finally {
        $('#registerBtn').textContent = 'Create Account';
      }
    });

    // Guest
    $('#guestBtn').addEventListener('click', () => {
      isGuest = true;
      token = null;
      currentUser = 'Guest';
      launchApp();
    });

    // Enter key support
    ['loginEmail', 'loginPassword'].forEach(id => {
      $(('#' + id)).addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
    });
    ['regUsername', 'regEmail', 'regPassword'].forEach(id => {
      $(('#' + id)).addEventListener('keydown', e => { if (e.key === 'Enter') $('#registerBtn').click(); });
    });
  }

  function launchApp() {
    $('#authOverlay').style.display = 'none';
    $('#mainApp').style.display = 'block';
    $('#usernameDisplay').textContent = currentUser || 'Guest';
    if (isGuest) {
      $('#headerBadgeText').textContent = 'Guest Mode';
      $('#btnSave').style.display = 'none';
    }
    initEncryptionApp();
    initNavigation();
    if (token) {
      $('#logoutBtn').addEventListener('click', logout);
    } else {
      $('#logoutBtn').textContent = 'Sign In';
      $('#logoutBtn').addEventListener('click', () => location.reload());
    }
  }

  function logout() {
    token = null; currentUser = null;
    localStorage.removeItem('pv_token');
    localStorage.removeItem('pv_user');
    location.reload();
  }

  // Check existing session
  if (token) {
    apiCall('/auth/profile').then(user => {
      currentUser = user.username;
      localStorage.setItem('pv_user', user.username);
      launchApp();
    }).catch(() => {
      // Token expired
      localStorage.removeItem('pv_token');
      localStorage.removeItem('pv_user');
      token = null; currentUser = null;
      initAuth();
    });
  } else {
    initAuth();
  }

  // ─────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────
  function initNavigation() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        $$('.view').forEach(v => v.style.display = 'none');
        btn.classList.add('active');
        const viewId = 'view' + btn.dataset.view.charAt(0).toUpperCase() + btn.dataset.view.slice(1);
        const viewEl = $('#' + viewId);
        viewEl.style.display = 'block';
        viewEl.classList.add('active');
        if (btn.dataset.view === 'history') loadHistory(0);
        if (btn.dataset.view === 'stats') loadStats();
      });
    });
  }

  // ─────────────────────────────────────────────
  // ENCRYPTION APP
  // ─────────────────────────────────────────────
  function initEncryptionApp() {
    const uploadZone = $('#uploadZone');
    const fileInput = $('#fileInput');
    const originalCanvas = $('#originalCanvas');
    const resultCanvas = $('#resultCanvas');
    const origCtx = originalCanvas.getContext('2d');
    const resCtx = resultCanvas.getContext('2d');
    const btnEncrypt = $('#btnEncrypt');
    const btnDecrypt = $('#btnDecrypt');
    const btnDownload = $('#btnDownload');
    const btnSave = $('#btnSave');
    const btnReset = $('#btnReset');
    const progressContainer = $('#progressContainer');
    const progressFill = $('#progressFill');
    const progressText = $('#progressText');

    // Upload
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadImage(e.target.files[0]); });
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault(); uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]);
    });

    function loadImage(file) {
      currentFilename = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          sourceImage = img;
          originalCanvas.width = img.width; originalCanvas.height = img.height;
          origCtx.drawImage(img, 0, 0);
          originalImageData = origCtx.getImageData(0, 0, img.width, img.height);

          originalCanvas.style.display = 'block';
          $('#emptyOriginal').style.display = 'none';
          resultCanvas.style.display = 'none';
          $('#emptyResult').style.display = 'flex';

          btnEncrypt.disabled = false; btnDecrypt.disabled = false;
          btnReset.disabled = false; btnDownload.disabled = true;
          if (btnSave) btnSave.disabled = true;

          $('#infoBar').style.display = 'flex';
          $('#infoDims').textContent = `${img.width} × ${img.height}`;
          $('#infoPixels').textContent = (img.width * img.height).toLocaleString();
          $('#infoStatus').textContent = 'Ready';

          uploadZone.innerHTML = `<span class="upload-icon">✅</span><h3>${file.name}</h3><p>${(file.size/1024).toFixed(1)} KB · Click to change</p>`;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    // Method selection
    $$('.method-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMethod = btn.dataset.method;
        $$('.params-section').forEach(s => s.classList.remove('active'));
        $(`#params-${currentMethod}`).classList.add('active');
      });
    });

    // Param controls
    const xorKey = $('#xorKey');
    xorKey.addEventListener('input', () => { $('#xorKeyVal').textContent = xorKey.value; });
    const chShift = $('#chShift');
    chShift.addEventListener('input', () => { $('#chShiftVal').textContent = chShift.value; });
    const modOffset = $('#modOffset');
    modOffset.addEventListener('input', () => { $('#modOffsetVal').textContent = modOffset.value; });
    const bitRotN = $('#bitRotN');
    bitRotN.addEventListener('input', () => { $('#bitRotVal').textContent = bitRotN.value; });

    $$('.ch-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const ch = btn.dataset.ch;
        channels[ch] = !channels[ch];
        btn.classList.toggle(`active-${ch}`);
      });
    });

    $$('.dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.dir-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bitRotDir = btn.dataset.dir;
      });
    });

    // Actions
    btnEncrypt.addEventListener('click', () => processImage('encrypt', origCtx, originalCanvas, resCtx, resultCanvas, progressContainer, progressFill, progressText, btnEncrypt, btnDecrypt, btnDownload, btnSave));
    btnDecrypt.addEventListener('click', () => processImage('decrypt', origCtx, originalCanvas, resCtx, resultCanvas, progressContainer, progressFill, progressText, btnEncrypt, btnDecrypt, btnDownload, btnSave));

    btnDownload.addEventListener('click', () => {
      if (!lastResultDataUrl) return;
      const link = document.createElement('a');
      link.download = `pixelvault_${currentMethod}_${lastOperation}_${Date.now()}.png`;
      link.href = lastResultDataUrl;
      link.click();
    });

    if (btnSave) {
      btnSave.addEventListener('click', saveToAccount);
    }

    btnReset.addEventListener('click', () => {
      resultCanvas.style.display = 'none';
      $('#emptyResult').style.display = 'flex';
      btnDownload.disabled = true;
      if (btnSave) btnSave.disabled = true;
      lastResultDataUrl = null; lastOperation = null;
      $('#infoTime').textContent = '—';
      $('#infoMethod').textContent = '—';
      $('#infoStatus').textContent = 'Ready';
    });
  }

  function getParams() {
    const xorKey = parseInt($('#xorKey').value);
    const chShift = parseInt($('#chShift').value);
    const modOffset = parseInt($('#modOffset').value);
    const scrambleSeed = parseInt($('#scrambleSeed').value);
    const bitRotN = parseInt($('#bitRotN').value);
    return { xorKey, chShift, modOffset, scrambleSeed, bitRotN, channels: { ...channels }, bitRotDir };
  }

  function processImage(mode, origCtx, originalCanvas, resCtx, resultCanvas, progressContainer, progressFill, progressText, btnEncrypt, btnDecrypt, btnDownload, btnSave) {
    if (!originalImageData) return;
    const methodNames = { xor: 'XOR Cipher', channel: 'Channel Shift', invert: 'Bit Invert', modadd: 'Modular Add', scramble: 'Pixel Scramble', bitrot: 'Bit Rotation' };

    showProgress(progressContainer, progressFill, progressText, btnEncrypt, btnDecrypt);
    const t0 = performance.now();

    const src = origCtx.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    const data = new Uint8ClampedArray(src.data);
    const w = originalCanvas.width, h = originalCanvas.height;
    const params = getParams();

    setTimeout(() => {
      switch (currentMethod) {
        case 'xor': applyXOR(data, params.xorKey); break;
        case 'channel': applyChannelShift(data, params.chShift, mode); break;
        case 'invert': applyBitInvert(data); break;
        case 'modadd': applyModAdd(data, params.modOffset, mode); break;
        case 'scramble': applyPixelScramble(data, w, h, params.scrambleSeed, mode); break;
        case 'bitrot': applyBitRotation(data, params.bitRotN, params.bitRotDir, mode); break;
      }

      resultCanvas.width = w; resultCanvas.height = h;
      const outData = new ImageData(data, w, h);
      resCtx.putImageData(outData, 0, 0);
      resultCanvas.style.display = 'block';
      $('#emptyResult').style.display = 'none';

      lastResultDataUrl = resultCanvas.toDataURL('image/png');
      lastOperation = mode;

      const elapsed = (performance.now() - t0).toFixed(1);
      hideProgress(progressContainer, progressFill, progressText, btnEncrypt, btnDecrypt);

      btnDownload.disabled = false;
      if (btnSave && !isGuest) btnSave.disabled = false;
      $('#infoMethod').textContent = methodNames[currentMethod];
      $('#infoTime').textContent = `${elapsed} ms`;
      $('#infoStatus').textContent = mode === 'encrypt' ? '🔒 Encrypted' : '🔓 Decrypted';
    }, 50);
  }

  async function saveToAccount() {
    if (!token || !lastResultDataUrl) return;
    const btnSave = $('#btnSave');
    btnSave.textContent = '⏳ Saving...';
    btnSave.disabled = true;
    try {
      const dims = `${$('#infoDims').textContent}`;
      await apiCall('/images/save', {
        method: 'POST',
        body: JSON.stringify({
          dataUrl: lastResultDataUrl,
          originalFilename: currentFilename,
          method: currentMethod,
          params: getParams(),
          operation: lastOperation,
          dimensions: dims
        })
      });
      showToast('✅ Saved to your account!', 'success');
    } catch (err) {
      showToast('❌ Save failed: ' + err.message, 'error');
    } finally {
      btnSave.textContent = '☁️ Save to Account';
      btnSave.disabled = false;
    }
  }

  // ─────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────
  async function loadHistory(offset) {
    if (!token) {
      $('#historyGrid').innerHTML = '<div class="empty-history"><span class="empty-icon">🔐</span><p>Sign in to view your history</p></div>';
      return;
    }
    historyOffset = offset;
    $('#historyGrid').innerHTML = '<div class="loading-state">Loading history...</div>';
    try {
      const data = await apiCall(`/images/history?limit=${HISTORY_LIMIT}&offset=${offset}`);
      renderHistory(data);
    } catch (err) {
      $('#historyGrid').innerHTML = '<div class="loading-state">Failed to load history</div>';
    }
  }

  function renderHistory(data) {
    const grid = $('#historyGrid');
    if (!data.images.length) {
      grid.innerHTML = '<div class="empty-history"><span class="empty-icon">📂</span><p>No history yet. Encrypt an image and save it!</p></div>';
      $('#pagination').innerHTML = '';
      return;
    }

    grid.innerHTML = data.images.map(img => {
      const date = new Date(img.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const size = img.file_size ? `${(img.file_size / 1024).toFixed(1)} KB` : '—';
      return `
        <div class="history-card fade-in">
          <div class="history-card-img">
            <img src="/api/images/file/${img.encrypted_filename}" alt="processed image" loading="lazy" onerror="this.parentElement.innerHTML='<span style=\\'font-size:40px;opacity:0.3\\'>🖼️</span>'">
          </div>
          <div class="history-card-body">
            <span class="history-method">${img.method}</span>
            <span class="history-op ${img.operation}">${img.operation}</span>
            <h3>${img.original_filename}</h3>
            <div class="history-card-meta">${date} · ${size} ${img.dimensions ? '· ' + img.dimensions : ''}</div>
            <div class="history-card-actions">
              <button class="btn-sm btn-sm-download" onclick="downloadHistoryImage('${img.encrypted_filename}', '${img.method}_${img.operation}')">💾 Download</button>
              <button class="btn-sm btn-sm-delete" onclick="deleteHistoryItem('${img.id}')">🗑 Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Pagination
    const totalPages = Math.ceil(data.total / HISTORY_LIMIT);
    const currentPage = Math.floor(historyOffset / HISTORY_LIMIT);
    let pages = '';
    for (let i = 0; i < totalPages; i++) {
      pages += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="loadHistoryPage(${i})">${i + 1}</button>`;
    }
    $('#pagination').innerHTML = pages;
  }

  // Make global for inline handlers
  window.downloadHistoryImage = function(filename, label) {
    const link = document.createElement('a');
    link.href = `/api/images/file/${filename}`;
    link.download = `pixelvault_${label}_${Date.now()}.png`;
    // Need auth header — fetch and blob
    fetch(link.href, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
  };

  window.deleteHistoryItem = async function(id) {
    if (!confirm('Delete this image from your history?')) return;
    try {
      await apiCall(`/images/history/${id}`, { method: 'DELETE' });
      showToast('Deleted successfully', 'success');
      loadHistory(historyOffset);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  window.loadHistoryPage = function(page) {
    loadHistory(page * HISTORY_LIMIT);
  };

  // ─────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────
  async function loadStats() {
    if (!token) {
      $('#statsGrid').innerHTML = '<div class="loading-state">Sign in to view stats</div>';
      return;
    }
    $('#statsGrid').innerHTML = '<div class="loading-state">Loading stats...</div>';
    try {
      const data = await apiCall('/images/stats');
      renderStats(data);
    } catch (err) {
      $('#statsGrid').innerHTML = '<div class="loading-state">Failed to load stats</div>';
    }
  }

  function renderStats(data) {
    const maxCount = Math.max(...(data.byMethod.map(m => m.count) || [1]), 1);
    const methodLabels = { xor: 'XOR Cipher', channel: 'Channel Shift', invert: 'Bit Invert', modadd: 'Modular Add', scramble: 'Pixel Scramble', bitrot: 'Bit Rotation' };

    $('#statsGrid').innerHTML = `
      <div class="stat-card fade-in">
        <span class="stat-icon">🖼️</span>
        <div class="stat-value" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${data.total}</div>
        <div class="stat-label">Total Images</div>
      </div>
      <div class="stat-card fade-in">
        <span class="stat-icon">🔒</span>
        <div class="stat-value" style="color: var(--accent-pink);">${data.encrypted}</div>
        <div class="stat-label">Encrypted</div>
      </div>
      <div class="stat-card fade-in">
        <span class="stat-icon">🔓</span>
        <div class="stat-value" style="color: var(--accent-cyan);">${data.decrypted}</div>
        <div class="stat-label">Decrypted</div>
      </div>
      <div class="stat-card fade-in">
        <span class="stat-icon">🔬</span>
        <div class="stat-value" style="color: var(--accent-green);">${data.byMethod.length}</div>
        <div class="stat-label">Methods Used</div>
      </div>
      <div style="grid-column: 1/-1;" class="card fade-in">
        <div class="card-header"><span class="icon">📊</span> Method Breakdown</div>
        <div class="card-body method-breakdown">
          ${data.byMethod.length === 0 ? '<p style="color:var(--text-muted)">No data yet</p>' :
            data.byMethod.map(m => `
              <div class="method-bar">
                <div class="method-bar-label">${methodLabels[m.method] || m.method}</div>
                <div class="method-bar-track">
                  <div class="method-bar-fill" style="width:${(m.count / maxCount * 100).toFixed(0)}%"></div>
                </div>
                <div class="method-bar-count">${m.count}</div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────
  // ENCRYPTION ALGORITHMS
  // ─────────────────────────────────────────────

  function applyXOR(data, key) {
    for (let i = 0; i < data.length; i += 4) {
      if (channels.r) data[i] ^= key;
      if (channels.g) data[i + 1] ^= key;
      if (channels.b) data[i + 2] ^= key;
    }
  }

  function applyChannelShift(data, shift, mode) {
    const s = mode === 'encrypt' ? shift : (3 - shift) % 3;
    for (let i = 0; i < data.length; i += 4) {
      const rgb = [data[i], data[i + 1], data[i + 2]];
      data[i] = rgb[(0 + s) % 3];
      data[i + 1] = rgb[(1 + s) % 3];
      data[i + 2] = rgb[(2 + s) % 3];
    }
  }

  function applyBitInvert(data) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  function applyModAdd(data, offset, mode) {
    const op = mode === 'encrypt' ? offset : (256 - offset);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (data[i] + op) % 256;
      data[i + 1] = (data[i + 1] + op) % 256;
      data[i + 2] = (data[i + 2] + op) % 256;
    }
  }

  function applyPixelScramble(data, w, h, seed, mode) {
    const totalPixels = w * h;
    const perm = generatePermutation(totalPixels, seed);
    const copy = new Uint8ClampedArray(data);
    if (mode === 'encrypt') {
      for (let i = 0; i < totalPixels; i++) {
        const si = i * 4, di = perm[i] * 4;
        data[di] = copy[si]; data[di+1] = copy[si+1];
        data[di+2] = copy[si+2]; data[di+3] = copy[si+3];
      }
    } else {
      for (let i = 0; i < totalPixels; i++) {
        const si = perm[i] * 4, di = i * 4;
        data[di] = copy[si]; data[di+1] = copy[si+1];
        data[di+2] = copy[si+2]; data[di+3] = copy[si+3];
      }
    }
  }

  function generatePermutation(n, seed) {
    const arr = new Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    let s = seed | 0;
    function rand() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function applyBitRotation(data, positions, direction, mode) {
    let dir = direction;
    if (mode === 'decrypt') dir = direction === 'left' ? 'right' : 'left';
    const n = positions % 8;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = rotateByte(data[i], n, dir);
      data[i + 1] = rotateByte(data[i + 1], n, dir);
      data[i + 2] = rotateByte(data[i + 2], n, dir);
    }
  }

  function rotateByte(byte, n, dir) {
    if (dir === 'left') return ((byte << n) | (byte >> (8 - n))) & 0xFF;
    return ((byte >> n) | (byte << (8 - n))) & 0xFF;
  }

  // ─────────────────────────────────────────────
  // PROGRESS
  // ─────────────────────────────────────────────
  function showProgress(container, fill, text, enc, dec) {
    container.classList.add('show');
    fill.style.width = '0%';
    text.textContent = 'Processing...';
    enc.disabled = true; dec.disabled = true;
  }

  function hideProgress(container, fill, text, enc, dec) {
    fill.style.width = '100%';
    text.textContent = 'Done ✓';
    setTimeout(() => {
      container.classList.remove('show');
      enc.disabled = false; dec.disabled = false;
    }, 800);
  }

})();
