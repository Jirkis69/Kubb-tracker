// --- Service Worker badge (jen info) ---
const CACHE_VERSION = 'v1.03';
document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('cache-version');
  if (badge) badge.textContent = `Cache verze: ${CACHE_VERSION}`;
});

// --- Service Worker registrace ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(registration => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ action: 'skipWaiting' });
              window.location.reload();
            }
          });
        }
      });
    }).catch(err => console.error('[ServiceWorker] Chyba registrace:', err));
  });
}

// ====== STATE ======
let currentUser = null;
let currentTraining = [];    // pro 8m
let currentMode = '8m';      // '8m' | '8+2'
let m82Submode = 'classic';  // 'classic' | 'unlimited'

// Historie modal/paginace
let historyVisibleCount = 30;
let historyFilter = 'all';

// Statistiky – rozsah
let statsRange = '7d';

// ====== PROGRESS BAR ======
const topProgressEl = document.getElementById('top-progress');
function progressStart() {
  if (!topProgressEl) return;
  topProgressEl.classList.add('active');
  topProgressEl.style.width = '5%';         // rychlý kick
}
function progressSet(pct) {
  if (!topProgressEl) return;
  const p = Math.max(0, Math.min(98, pct|0));  // necháme si 2 % na finish
  topProgressEl.style.width = p + '%';
}
function progressPulse() {
  if (!topProgressEl) return;
  const w = parseFloat(topProgressEl.style.width || '0');
  progressSet(Math.min(90, w + 10));
}
function progressFinish() {
  if (!topProgressEl) return;
  topProgressEl.style.width = '100%';
  setTimeout(() => {
    topProgressEl.classList.remove('active');
    topProgressEl.style.width = '0%';
  }, 250);
}

// ====== RIPPLE (klik animace) ======
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, .hit-btn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = (e.clientX - rect.left) - size/2;
  const y = (e.clientY - rect.top) - size/2;

  const ink = document.createElement('span');
  ink.className = 'ripple-ink';
  ink.style.width = ink.style.height = `${size}px`;
  ink.style.left = `${x}px`;
  ink.style.top = `${y}px`;
  btn.appendChild(ink);
  setTimeout(() => ink.remove(), 650);
});

// ====== TOAST ======
function showToast(message, timeout = 2000) {
  const c = document.getElementById('toast-container');
  if (!c) { console.log('[Toast]', message); return; }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => c.removeChild(el), 200);
  }, timeout);
}

// ====== STORAGE ======
function loadUsers() {
  const usersJSON = localStorage.getItem('kubbUsers');
  return usersJSON ? JSON.parse(usersJSON) : [];
}
function saveUsers(users) {
  localStorage.setItem('kubbUsers', JSON.stringify(users));
}

// ====== EXPORT / IMPORT (MERGE) ======
function exportAll() {
  progressStart();
  setTimeout(progressPulse, 60);
  const data = {
    app: 'Kubb Tracker',
    format: 1,
    exportedAt: new Date().toISOString(),
    users: loadUsers()
  };
  downloadJSON(data, `kubb-export-all-${dateStamp()}.json`);
  setTimeout(progressFinish, 200);
}
function exportCurrent() {
  if (!currentUser) { alert('Vyber aktuálního uživatele.'); return; }
  progressStart();
  setTimeout(progressPulse, 60);
  const users = loadUsers();
  const user = users.find(u => u.name === currentUser);
  if (!user) { alert('Uživatel nenalezen.'); progressFinish(); return; }
  const data = {
    app: 'Kubb Tracker',
    format: 1,
    exportedAt: new Date().toISOString(),
    users: [user]
  };
  downloadJSON(data, `kubb-export-${sanitizeFileName(user.name)}-${dateStamp()}.json`);
  setTimeout(progressFinish, 200);
}
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 0);
}
function dateStamp() {
  const d = new Date(); const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
function sanitizeFileName(s) { return s.replace(/[^\w\-]+/g, '_').slice(0, 40); }

async function importJSONFile(file) {
  progressStart();
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.users)) {
      alert('Soubor neobsahuje platná data.');
      progressFinish();
      return;
    }

    const incomingUsers = parsed.users;
    const users = loadUsers();

    // spočti celkový počet záznamů kvůli progresu
    const totalEntries = incomingUsers.reduce((sum, u) => sum + (Array.isArray(u.history) ? u.history.length : 0), 0) || 1;
    let processed = 0;

    let addedUsers = 0, addedRecords = 0, skippedDupes = 0;

    incomingUsers.forEach(inUser => {
      if (!inUser?.name) return;
      if (!Array.isArray(inUser.history)) inUser.history = [];

      let target = users.find(u => u.name === inUser.name);
      if (!target) {
        target = { name: inUser.name, history: [] };
        users.push(target);
        addedUsers++;
      }
      if (!Array.isArray(target.history)) target.history = [];

      const existingSignatures = new Set(target.history.map(entry => makeEntrySignature(entry)));
      inUser.history.forEach(entry => {
        const sig = makeEntrySignature(entry);
        if (!existingSignatures.has(sig)) {
          normalizeEntry(entry);
          target.history.push(entry);
          existingSignatures.add(sig);
          addedRecords++;
        } else {
          skippedDupes++;
        }
        processed++;
        if (processed % 5 === 0) progressSet(Math.round((processed / totalEntries) * 100));
      });
    });

    saveUsers(users);
    if (currentUser) {
      renderHistoryPreview(currentUser);
      renderStats(currentUser);
    } else {
      renderUserList();
    }

    showToast(`Import hotov: +${addedRecords} záznamů, ${addedUsers} nových uživatelů${skippedDupes?`, duplicit: ${skippedDupes}`:''}.`, 3500);
  } catch (e) {
    console.error('Import error:', e);
    alert('Import selhal. Zkontroluj, prosím, formát souboru.');
  } finally {
    progressFinish();
  }
}
function makeEntrySignature(entry) {
  if (!entry) return 'null';
  const base = {
    type: entry.type || null,
    mode: entry.mode || null,
    date: entry.date || null,
    in10: entry.in10 ?? null,
    king: entry.king ?? null,
    total11: entry.total11 ?? null,
    throwsUsed: entry.throwsUsed ?? null,
    pinsToClose: entry.pinsToClose ?? null,
    dnf: entry.dnf ?? null,
    training: Array.isArray(entry.training) ? entry.training.map(s => ({ hit: s.hit, throws: s.throws })) : null,
    totalHit: entry.totalHit ?? null,
    totalThrows: entry.totalThrows ?? null,
    successRate: entry.successRate ?? null
  };
  return JSON.stringify(base);
}
function normalizeEntry(e) {
  if (!e) return;
  if (e.type === '8m') {
    if (e.totalHit == null && Array.isArray(e.training)) e.totalHit = e.training.reduce((a,c)=>a+(c.hit||0),0);
    if (e.totalThrows == null && Array.isArray(e.training)) e.totalThrows = e.training.reduce((a,c)=>a+(c.throws||0),0);
    if (e.successRate == null && e.totalThrows > 0) e.successRate = Math.round((e.totalHit / e.totalThrows) * 100);
  }
  if (e.type === '8+2' && e.mode === 'classic') {
    if (e.total11 == null) e.total11 = (e.in10 || 0) + (e.king ? 1 : 0);
  }
}

// Hook na export/import + přepínač období
document.addEventListener('DOMContentLoaded', () => {
  const btnExportAll = document.getElementById('export-all-btn');
  const btnExportCurrent = document.getElementById('export-current-btn');
  const btnImport = document.getElementById('import-btn');
  const fileInput = document.getElementById('import-file');

  btnExportAll?.addEventListener('click', exportAll);
  btnExportCurrent?.addEventListener('click', exportCurrent);
  btnImport?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) { importJSONFile(f); fileInput.value = ''; }
  });

  document.querySelectorAll('.seg-btn[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsRange = btn.getAttribute('data-range') || '7d';
      if (currentUser) renderStats(currentUser);
    });
  });
});

// ====== USERS UI ======
function renderUserList() {
  const users = loadUsers();
  const userListDiv = document.getElementById('user-list');
  userListDiv.innerHTML = '';

  users.forEach((user, index) => {
    const userDiv = document.createElement('div');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = user.name;
    nameSpan.style.flexGrow = '1';
    nameSpan.style.userSelect = 'none';
    nameSpan.style.cursor = 'pointer';

    nameSpan.onclick = () => {
      if (currentTraining.length > 0) {
        if (!confirm('Probíhá trénink. Opravdu přepnout uživatele?')) return;
        currentTraining = [];
        updateCurrentTrainingSummary();
        document.getElementById('current-training-summary').style.display = 'none';
      }
      currentUser = user.name;
      document.getElementById('current-user-name').textContent = currentUser;
      renderHistoryPreview(currentUser);
      renderStats(currentUser);
      resetThrowsInput();
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Smazat';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Smazat uživatele "${user.name}"?`)) {
        users.splice(index, 1);
        saveUsers(users);
        renderUserList();
        if (currentUser === user.name) {
          currentUser = null;
          document.getElementById('current-user-name').textContent = 'žádný';
          currentTraining = [];
          updateCurrentTrainingSummary();
          document.getElementById('current-training-summary').style.display = 'none';
          clearHistoryPreview();
          clearStatsView();
        }
      }
    };

    userDiv.appendChild(nameSpan);
    userDiv.appendChild(deleteBtn);
    userListDiv.appendChild(userDiv);
  });
}

document.getElementById('add-user-btn').onclick = () => {
  const input = document.getElementById('user-name-input');
  const name = input.value.trim();
  if (!name) { alert('Zadej jméno uživatele.'); return; }
  const users = loadUsers();
  if (users.find(u => u.name === name)) { alert('Uživatel s tímto jménem již existuje.'); return; }
  users.push({ name: name, history: [] });
  saveUsers(users);
  input.value = '';
  renderUserList();
};

// ====== MODE SWITCH (8m / 8+2) ======
const mode8mRadio = document.getElementById('mode-8m-radio');
const mode82Radio = document.getElementById('mode-82-radio');
const mode8mDiv   = document.getElementById('mode-8m');
const mode82Div   = document.getElementById('mode-82');

function switchMode(mode) {
  currentMode = mode;
  if (mode === '8m') { mode8mDiv.style.display = ''; mode82Div.style.display = 'none'; }
  else { mode8mDiv.style.display = 'none'; mode82Div.style.display = ''; }
}
mode8mRadio.addEventListener('change', () => switchMode('8m'));
mode82Radio.addEventListener('change', () => switchMode('8+2'));

// ====== 8m LOGIKA ======
const hitButtons = document.querySelectorAll('#hit-buttons .hit-btn');
hitButtons.forEach(btn => {
  btn.onclick = () => {
    if (!currentUser) { alert('Nejdříve vyber uživatele.'); return; }
    if (currentMode !== '8m') return;

    const selectedHits = parseInt(btn.getAttribute('data-value'), 10);
    let throwsInput = document.getElementById('throws-input');
    let throws = parseInt(throwsInput.value, 10);
    if (isNaN(throws) || throws < 1) { throws = 6; throwsInput.value = 6; }
    if (throws > 6) { throws = 6; throwsInput.value = 6; }

    currentTraining.push({ hit: selectedHits, throws, timestamp: new Date().toISOString() });

    updateCurrentTrainingSummary();
    resetThrowsInput();
    hitButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

function resetThrowsInput() {
  const throwsInput = document.getElementById('throws-input');
  if (throwsInput) throwsInput.value = 6;
}

function updateCurrentTrainingSummary() {
  const summary = document.getElementById('current-training-summary');
  if (currentTraining.length === 0) { summary.style.display = 'none'; return; }
  summary.style.display = 'block';

  const seriesCount = currentTraining.length;
  const totalHit = currentTraining.reduce((acc, cur) => acc + cur.hit, 0);
  const totalThrows = currentTraining.reduce((acc, cur) => acc + cur.throws, 0);
  const successRate = totalThrows > 0 ? Math.round((totalHit / totalThrows) * 100) : 0;

  document.getElementById('series-count').textContent = seriesCount;
  document.getElementById('total-hit').textContent = totalHit;
  document.getElementById('total-throws').textContent = totalThrows;
  document.getElementById('success-rate').textContent = successRate;
}

document.getElementById('undo-last-series-btn').onclick = () => {
  if (currentMode !== '8m') return;
  if (currentTraining.length === 0) { alert('Žádná série k vrácení.'); return; }
  currentTraining.pop();
  updateCurrentTrainingSummary();
};

document.getElementById('end-training-btn').onclick = () => {
  if (currentMode !== '8m') return;
  if (!currentUser) { alert('Vyber uživatele.'); return; }
  if (currentTraining.length === 0) { alert('Trénink je prázdný.'); return; }

  progressStart();
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.name === currentUser);
  if (userIndex === -1) { alert('Uživatel nenalezen.'); progressFinish(); return; }

  const totalHit = currentTraining.reduce((acc, cur) => acc + cur.hit, 0);
  const totalThrows = currentTraining.reduce((acc, cur) => acc + cur.throws, 0);
  const successRate = totalThrows > 0 ? Math.round((totalHit / totalThrows) * 100) : 0;

  users[userIndex].history.push({
    type: '8m',
    date: new Date().toISOString(),
    training: currentTraining,
    totalHit,
    totalThrows,
    successRate
  });

  saveUsers(users);
  currentTraining = [];
  updateCurrentTrainingSummary();
  renderHistoryPreview(currentUser);
  renderStats(currentUser);
  showToast('Trénink uložen ✅');
  progressFinish();
};

// ====== 8+2 SUBMODE SWITCH ======
const m82ClassicRadio   = document.getElementById('m82-classic-radio');
const m82UnlimitedRadio = document.getElementById('m82-unlimited-radio');
const m82ClassicDiv     = document.getElementById('m82-classic');
const m82UnlimitedDiv   = document.getElementById('m82-unlimited');

function switchM82Submode(sub) {
  m82Submode = sub;
  if (sub === 'classic') { m82ClassicDiv.style.display = ''; m82UnlimitedDiv.style.display = 'none'; }
  else { m82ClassicDiv.style.display = 'none'; m82UnlimitedDiv.style.display = ''; }
}
m82ClassicRadio.addEventListener('change', () => switchM82Submode('classic'));
m82UnlimitedRadio.addEventListener('change', () => switchM82Submode('unlimited'));

// ====== 8+2 CLASSIC ======
document.querySelectorAll('.m82c-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    if (!currentUser) { alert('Vyber nejdříve uživatele.'); return; }
    if (currentMode !== '8+2' || m82Submode !== 'classic') return;

    const throwsInput = document.getElementById('m82-classic-throws');
    let throwsUsed = parseInt(throwsInput?.value, 10);
    if (isNaN(throwsUsed) || throwsUsed < 1) throwsUsed = 1;
    if (throwsUsed > 6) throwsUsed = 6;

    const kubbs = parseInt(chip.getAttribute('data-kubb'), 10);
    let king = false;

    if (kubbs === 10) {
      const res = confirm('Padl král? (OK = Ano, Zrušit = Ne)');
      king = !!res;
    }

    progressStart();
    const entry = {
      type: '8+2',
      mode: 'classic',
      date: new Date().toISOString(),
      in10: kubbs,
      king: king,
      total11: kubbs + (king ? 1 : 0),
      throwsUsed: throwsUsed
    };

    const users = loadUsers();
    const idx = users.findIndex(u => u.name === currentUser);
    if (idx === -1) { alert('Uživatel nenalezen.'); progressFinish(); return; }
    if (!users[idx].history) users[idx].history = [];
    users[idx].history.push(entry);
    saveUsers(users);

    if (throwsInput) throwsInput.value = 6;

    renderHistoryPreview(currentUser);
    renderStats(currentUser);
    showToast('Záznam uložen ✅');
    progressFinish();
  });
});

// ====== 8+2 UNLIMITED ======
const m82UnlPinsSelect = document.getElementById('m82-unl-pins');
const m82UnlSaveBtn    = document.getElementById('m82-unl-save');
const m82UnlDNFBtn     = document.getElementById('m82-unl-dnf');

// naplnit select 4–20
(function fillUnlSelect(){
  if (!m82UnlPinsSelect) return;
  m82UnlPinsSelect.innerHTML = '';
  for (let p = 4; p <= 20; p++) {
    const opt = document.createElement('option');
    opt.value = String(p);
    opt.textContent = String(p);
    m82UnlPinsSelect.appendChild(opt);
  }
})();

m82UnlSaveBtn.addEventListener('click', () => {
  if (!currentUser) { alert('Vyber nejdříve uživatele.'); return; }
  if (currentMode !== '8+2' || m82Submode !== 'unlimited') return;

  progressStart();
  const pinsToClose = parseInt(m82UnlPinsSelect.value, 10);
  const entry = {
    type: '8+2',
    mode: 'unlimited',
    date: new Date().toISOString(),
    pinsToClose,
    dnf: false
  };

  const users = loadUsers();
  const idx = users.findIndex(u => u.name === currentUser);
  if (idx === -1) { alert('Uživatel nenalezen.'); progressFinish(); return; }
  if (!users[idx].history) users[idx].history = [];
  users[idx].history.push(entry);
  saveUsers(users);

  renderHistoryPreview(currentUser);
  renderStats(currentUser);
  showToast('Záznam uložen ✅');
  progressFinish();
});

m82UnlDNFBtn.addEventListener('click', () => {
  if (!currentUser) { alert('Vyber nejdříve uživatele.'); return; }
  if (currentMode !== '8+2' || m82Submode !== 'unlimited') return;

  if (!confirm('Opravdu uložit DNF pro tuto sérii?')) return;

  progressStart();
  const entry = {
    type: '8+2',
    mode: 'unlimited',
    date: new Date().toISOString(),
    pinsToClose: null,
    dnf: true
  };

  const users = loadUsers();
  const idx = users.findIndex(u => u.name === currentUser);
  if (idx === -1) { alert('Uživatel nenalezen.'); progressFinish(); return; }
  if (!users[idx].history) users[idx].history = [];
  users[idx].history.push(entry);
  saveUsers(users);

  renderHistoryPreview(currentUser);
  renderStats(currentUser);
  showToast('DNF uloženo');
  progressFinish();
});

// ====== HISTORIE – NÁHLED ======
function renderHistoryPreview(userName) {
  const users = loadUsers();
  const user = users.find(u => u.name === userName);
  const preview = document.getElementById('history-preview');
  if (!preview) return;

  if (!user || !user.history || user.history.length === 0) {
    preview.textContent = 'Žádná historie.';
    return;
  }

  const entry = user.history[user.history.length - 1];
  const dateStr = new Date(entry.date).toLocaleString();
  if (entry.type === '8m') {
    const sumHits = entry.totalHit ?? entry.training?.reduce((a,c)=>a+c.hit,0) ?? 0;
    const sumThrows = entry.totalThrows ?? entry.training?.reduce((a,c)=>a+c.throws,0) ?? 0;
    const success = entry.successRate ?? (sumThrows ? Math.round(sumHits/sumThrows*100) : 0);
    const seriesCount = entry.training ? entry.training.length : 0;
    preview.textContent = `${dateStr} – 8m | Série: ${seriesCount}, Shozeno: ${sumHits}, Hodů: ${sumThrows}, Úspěšnost: ${success}%`;
  } else if (entry.type === '8+2') {
    if (entry.mode === 'classic') {
      const v11 = entry.total11 ?? (entry.in10 ?? 0) + (entry.king ? 1 : 0);
      const throwsUsedTxt = (entry.throwsUsed != null) ? ` | kolíky: ${entry.throwsUsed}` : '';
      preview.textContent =
        entry.in10 === 10
          ? `${dateStr} – 8+2 Classic | v10: 10 ${entry.king ? '+ král' : '+ král NE'} → ${v11}/11${throwsUsedTxt}`
          : `${dateStr} – 8+2 Classic | v10: ${entry.in10}/10 → ${v11}/11${throwsUsedTxt}`;
    } else if (entry.mode === 'unlimited') {
      preview.textContent = entry.dnf
        ? `${dateStr} – 8+2 Unlimited | DNF`
        : `${dateStr} – 8+2 Unlimited | Zavřeno na ${entry.pinsToClose} kolících`;
    } else {
      preview.textContent = `${dateStr} – 8+2`;
    }
  } else {
    preview.textContent = `${dateStr} – záznam`;
  }
}

function clearHistoryPreview() {
  const preview = document.getElementById('history-preview');
  if (preview) preview.textContent = 'Vyber uživatele, abys viděl poslední záznam.';
}

// ====== HISTORIE – MODAL ======
const openHistoryBtn = document.getElementById('open-history-btn');
const historyFilterSelect = document.getElementById('history-filter');
const historyPageSizeSelect = document.getElementById('history-page-size');
const historyLoadMoreBtn = document.getElementById('history-load-more');
const historyInfoSpan = document.getElementById('history-info');

openHistoryBtn?.addEventListener('click', () => {
  if (!currentUser) { alert('Vyber nejdříve uživatele.'); return; }
  document.getElementById('history-modal-user').textContent = currentUser;
  historyVisibleCount = parsePageSize(historyPageSizeSelect?.value);
  historyFilter = historyFilterSelect?.value || 'all';
  openModal('history-modal');
  renderHistoryModal(currentUser);
});

historyFilterSelect?.addEventListener('change', () => {
  historyFilter = historyFilterSelect.value;
  historyVisibleCount = parsePageSize(historyPageSizeSelect.value);
  renderHistoryModal(currentUser);
});
historyPageSizeSelect?.addEventListener('change', () => {
  historyVisibleCount = parsePageSize(historyPageSizeSelect.value);
  renderHistoryModal(currentUser);
});
historyLoadMoreBtn?.addEventListener('click', () => {
  if (historyPageSizeSelect.value === 'all') return;
  historyVisibleCount += parseInt(historyPageSizeSelect.value, 10) || 30;
  renderHistoryModal(currentUser);
});

function parsePageSize(val) { return (val === 'all') ? Infinity : parseInt(val || '30', 10); }

function renderHistoryModal(userName) {
  const users = loadUsers();
  const user = users.find(u => u.name === userName);
  const historyDiv = document.getElementById('history-list');
  historyDiv.innerHTML = '';

  if (!user || !user.history || user.history.length === 0) {
    historyDiv.textContent = 'Žádná historie.';
    historyInfoSpan.textContent = '';
    historyLoadMoreBtn?.setAttribute('disabled','disabled');
    return;
  }

  let all = user.history.slice().reverse();
  if (historyFilter === '8m') {
    all = all.filter(e => e.type === '8m');
  } else if (historyFilter === '8p2Classic') {
    all = all.filter(e => e.type === '8+2' && e.mode === 'classic');
  } else if (historyFilter === '8p2Unlimited') {
    all = all.filter(e => e.type === '8+2' && e.mode === 'unlimited');
  }

  const slice = all.slice(0, Math.min(historyVisibleCount, all.length));

  slice.forEach(entry => {
    const div = document.createElement('div');
    const dateStr = new Date(entry.date).toLocaleString();

    if (entry.type === '8m') {
      const sumHits = entry.totalHit ?? entry.training?.reduce((a,c)=>a+c.hit,0) ?? 0;
      const sumThrows = entry.totalThrows ?? entry.training?.reduce((a,c)=>a+c.throws,0) ?? 0;
      const success = entry.successRate ?? (sumThrows ? Math.round(sumHits/sumThrows*100) : 0);
      const seriesCount = entry.training ? entry.training.length : 0;
      div.textContent = `${dateStr} – 8m | Série: ${seriesCount}, Shozeno: ${sumHits}, Hodů: ${sumThrows}, Úspěšnost: ${success}%`;
    } else if (entry.type === '8+2') {
      if (entry.mode === 'classic') {
        const v11 = entry.total11 ?? (entry.in10 ?? 0) + (entry.king ? 1 : 0);
        const throwsUsedTxt = (entry.throwsUsed != null) ? ` | kolíky: ${entry.throwsUsed}` : '';
        if (entry.in10 === 10) {
          div.textContent = `${dateStr} – 8+2 Classic | v10: 10 ${entry.king ? '+ král' : '+ král NE'} → ${v11}/11${throwsUsedTxt}`;
        } else {
          div.textContent = `${dateStr} – 8+2 Classic | v10: ${entry.in10}/10 → ${v11}/11${throwsUsedTxt}`;
        }
      } else if (entry.mode === 'unlimited') {
        if (entry.dnf) {
          div.textContent = `${dateStr} – 8+2 Unlimited | DNF`;
        } else {
          div.textContent = `${dateStr} – 8+2 Unlimited | Zavřeno na ${entry.pinsToClose} kolících`;
        }
      } else {
        div.textContent = `${dateStr} – 8+2`;
      }
    } else {
      if (entry.training) {
        const sumHits = entry.training.reduce((a,c)=>a+c.hit,0);
        const sumThrows = entry.training.reduce((a,c)=>a+c.throws,0);
        const success = sumThrows ? Math.round(sumHits/sumThrows*100) : 0;
        div.textContent = `${dateStr} – 8m | Série: ${entry.training.length}, Shozeno: ${sumHits}, Hodů: ${sumThrows}, Úspěšnost: ${success}%`;
      } else {
        div.textContent = `${dateStr} – záznam`;
      }
    }

    historyDiv.appendChild(div);
  });

  const showing = Math.min(slice.length, all.length);
  historyInfoSpan.textContent = `Zobrazuji ${showing} z ${all.length}`;
  if (historyLoadMoreBtn) {
    if (slice.length >= all.length || historyPageSizeSelect.value === 'all') {
      historyLoadMoreBtn.setAttribute('disabled','disabled');
    } else {
      historyLoadMoreBtn.removeAttribute('disabled');
    }
  }
}

// ====== MODAL infra ======
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.getAttribute && target.getAttribute('data-dismiss') === 'history-modal') {
    closeModal('history-modal');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal('history-modal'); });

// ====== STATISTIKY ======
function filterHistoryByRange(history, range) {
  if (!Array.isArray(history)) return [];
  if (range === 'all') return history.slice();
  const now = Date.now();
  const ms = (range === '7d') ? 7*24*3600*1000 : 30*24*3600*1000;
  const from = now - ms;
  return history.filter(e => {
    const t = new Date(e.date).getTime();
    return !isNaN(t) && t >= from && t <= now;
  });
}
function computeStatsFromHistory(history) {
  const res = {
    count: { '8m': 0, '8p2Classic': 0, '8p2Unlimited': 0 },
    m8m: { sessions: 0, avgAccuracy: 0, bestAccuracy: 0, totalThrows: 0, totalHits: 0, last5: [], series: [] },
    c82: { sessions: 0, avgV11: 0, bestV11: 0, bestV11MinPins: null, last5: [], series: [] },
    u82: { sessions: 0, avgPins: 0, bestPins: null, dnf: 0, last5: [], series: [] },
  };
  if (!history?.length) return res;

  const h = history.slice().sort((a,b)=> new Date(a.date)-new Date(b.date));
  const pushLast = (arr, val) => { arr.push(val); if (arr.length > 5) arr.shift(); };

  h.forEach(e => {
    if (e.type === '8m') {
      const hits = e.totalHit ?? (e.training?.reduce((a,c)=>a+c.hit,0) || 0);
      const throws = e.totalThrows ?? (e.training?.reduce((a,c)=>a+c.throws,0) || 0);
      const acc = throws ? (hits/throws)*100 : 0;

      res.count['8m']++; res.m8m.sessions++;
      res.m8m.totalHits += hits; res.m8m.totalThrows += throws;
      res.m8m.bestAccuracy = Math.max(res.m8m.bestAccuracy, Math.round(acc));
      pushLast(res.m8m.last5, Math.round(acc));
      res.m8m.series.push(Math.round(acc));
    }
    else if (e.type === '8+2' && e.mode === 'classic') {
      const v11 = (e.total11 != null) ? e.total11 : ((e.in10 || 0) + (e.king ? 1 : 0));
      const pins = e.throwsUsed ?? null;

      res.count['8p2Classic']++; res.c82.sessions++;
      res.c82.bestV11 = Math.max(res.c82.bestV11, v11);
      if (v11 === res.c82.bestV11 && pins != null) {
        if (res.c82.bestV11MinPins == null || pins < res.c82.bestV11MinPins) res.c82.bestV11MinPins = pins;
      }
      pushLast(res.c82.last5, v11);
      res.c82.series.push(v11);
    }
    else if (e.type === '8+2' && e.mode === 'unlimited') {
      if (e.dnf) {
        res.u82.dnf++; res.count['8p2Unlimited']++; res.u82.sessions++; pushLast(res.u82.last5, null);
      } else {
        const p = e.pinsToClose ?? null;
        if (p != null) {
          res.count['8p2Unlimited']++; res.u82.sessions++;
          res.u82.bestPins = (res.u82.bestPins == null) ? p : Math.min(res.u82.bestPins, p);
          res.u82.avgPins += p; pushLast(res.u82.last5, p); res.u82.series.push(p);
        }
      }
    }
  });

  res.m8m.series = res.m8m.series.slice(-20);
  res.c82.series = res.c82.series.slice(-20);
  res.u82.series = res.u82.series.slice(-20);

  res.m8m.avgAccuracy = res.m8m.totalThrows ? Math.round((res.m8m.totalHits / res.m8m.totalThrows) * 100) : 0;

  const cVals = h.filter(e => e.type==='8+2' && e.mode==='classic')
                 .map(e => (e.total11 != null) ? e.total11 : ((e.in10 || 0) + (e.king ? 1 : 0)));
  res.c82.avgV11 = cVals.length ? (cVals.reduce((a,b)=>a+b,0) / cVals.length).toFixed(2) : '0.00';

  const uVals = h.filter(e => e.type==='8+2' && e.mode==='unlimited' && !e.dnf).map(e => e.pinsToClose);
  res.u82.avgPins = uVals.length ? (uVals.reduce((a,b)=>a+b,0) / uVals.length).toFixed(2) : '–';

  return res;
}
function trendArrow(values, betterIsHigher = true) {
  const v = values.filter(x => x != null);
  if (v.length < 2) return '';
  const mid = Math.floor(v.length/2);
  const a = v.slice(0, mid).reduce((s,x)=>s+x,0) / Math.max(1, v.slice(0, mid).length);
  const b = v.slice(mid).reduce((s,x)=>s+x,0) / Math.max(1, v.slice(mid).length);
  const diff = b - a;
  if (Math.abs(diff) < 0.5) return '→';
  const up = betterIsHigher ? (diff > 0) : (diff < 0);
  return up ? '↑' : '↓';
}
function sparklineSVG(values, { min=null, max=null, invert=false } = {}) {
  const v = values.filter(x => x != null);
  if (!v.length) return '<svg viewBox="0 0 100 40" preserveAspectRatio="none"></svg>';
  const lo = (min != null) ? min : Math.min(...v);
  const hi = (max != null) ? max : Math.max(...v);
  const span = (hi - lo) || 1;
  const n = v.length; const stepX = 100 / Math.max(1, n - 1);
  const points = v.map((val, i) => {
    const norm = (val - lo) / span;
    const y01 = invert ? norm : (1 - norm);
    const x = i * stepX; const y = 5 + y01 * 30;
    return `${x},${y}`;
  });
  const last = v[v.length - 1]; const lastX = (n - 1) * stepX;
  const lastNorm = (last - lo) / span; const lastY = 5 + (invert ? lastNorm : (1 - lastNorm)) * 30;
  return `
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points.join(' ')}"></polyline>
    <circle cx="${lastX}" cy="${lastY}" r="2"></circle>
  </svg>`;
}
function renderStats(userName) {
  const users = loadUsers();
  const user = users.find(u => u.name === userName);
  const root = document.getElementById('stats');
  const note = document.getElementById('stats-note');
  if (!root) return;

  if (!user || !user.history || user.history.length === 0) {
    root.innerHTML = '<div style="opacity:.7;">Žádná data pro statistiky.</div>';
    if (note) note.textContent = '';
    return;
  }

  const filtered = filterHistoryByRange(user.history, statsRange);
  const s = computeStatsFromHistory(filtered);

  if (note) {
    const map = { '7d': 'posledních 7 dní', '30d': 'posledních 30 dní', 'all': 'celkově' };
    note.textContent = `Rozsah: ${map[statsRange]} – zahrnuto záznamů: ${filtered.length}`;
  }

  const t8m = trendArrow(s.m8m.last5, true);
  const tC  = trendArrow(s.c82.last5, true);
  const tU  = trendArrow(s.u82.last5, false);

  const svg8m = sparklineSVG(s.m8m.series, { min: 0, max: 100, invert: false });
  const svgC  = sparklineSVG(s.c82.series,  { min: 0, max: 11,  invert: false });
  const svgU  = sparklineSVG(s.u82.series,  { min: 4, max: 20,  invert: true });

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <h3>8m</h3>
        <div class="stat-row"><span class="stat-key">Tréninků</span><span>${s.m8m.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">Průměrná úspěšnost</span><span>${s.m8m.avgAccuracy}%</span></div>
        <div class="stat-row"><span class="stat-key">Nejlepší úspěšnost</span><span>${s.m8m.bestAccuracy}%</span></div>
        <div class="stat-row"><span class="stat-key">Trend (posl. 5)</span><span class="${t8m==='↑'?'trend-up':t8m==='↓'?'trend-down':''}">${t8m || '–'}</span></div>
        <div class="sparkline" title="Posledních ${s.m8m.series.length} hodnot (úspěšnost %)">${svg8m}</div>
      </div>

      <div class="stat-card">
        <h3>8+2 Classic</h3>
        <div class="stat-row"><span class="stat-key">Záznamů</span><span>${s.c82.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">Průměr v11</span><span>${s.c82.avgV11}</span></div>
        <div class="stat-row"><span class="stat-key">Nejlepší v11</span><span>${s.c82.bestV11}${s.c82.bestV11MinPins?` (kolíky: ${s.c82.bestV11MinPins})`:''}</span></div>
        <div class="stat-row"><span class="stat-key">Trend (posl. 5)</span><span class="${tC==='↑'?'trend-up':tC==='↓'?'trend-down':''}">${tC || '–'}</span></div>
        <div class="sparkline" title="Posledních ${s.c82.series.length} hodnot (z 11)">${svgC}</div>
      </div>

      <div class="stat-card">
        <h3>8+2 Unlimited</h3>
        <div class="stat-row"><span class="stat-key">Záznamů</span><span>${s.u82.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">Průměr kolíků (bez DNF)</span><span>${s.u82.avgPins}</span></div>
        <div class="stat-row"><span class="stat-key">Nejlépe zavřeno</span><span>${s.u82.bestPins ?? '–'}${s.u82.bestPins!=null?' kolíků':''}</span></div>
        <div class="stat-row"><span class="stat-key">DNF</span><span>${s.u82.dnf}</span></div>
        <div class="stat-row"><span class="stat-key">Trend (posl. 5)</span><span class="${tU==='↑'?'trend-up':tU==='↓'?'trend-down':''}">${tU || '–'}</span></div>
        <div class="sparkline" title="Posledních ${s.u82.series.length} hodnot (kolíky – méně je lépe)">${svgU}</div>
      </div>
    </div>
  `;
}

function clearStatsView() {
  const root = document.getElementById('stats');
  const note = document.getElementById('stats-note');
  if (root) root.innerHTML = '<div style="opacity:.7;">Vyber uživatele, zobrazí se souhrny pro 8m, 8+2 Classic a 8+2 Unlimited.</div>';
  if (note) note.textContent = '';
}

// ====== INIT ======
renderUserList();

/* ====== Modal infra (z minula) ====== */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.getAttribute && target.getAttribute('data-dismiss') === 'history-modal') {
    closeModal('history-modal');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal('history-modal'); });

// helpery pro historii (z minula)
function clearHistoryPreview(){ const preview = document.getElementById('history-preview'); if (preview) preview.textContent = 'Vyber uživatele, abys viděl poslední záznam.'; }
