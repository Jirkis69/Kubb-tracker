// ======================
// Kubb Tracker v1.06 (script.js)
// ======================

// --- Service Worker badge (info) ---
const CACHE_VERSION = 'v1.06';
document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('cache-version');
  if (badge) badge.textContent = `Cache verze: ${CACHE_VERSION}`;
});

// --- Service Worker registrace ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.error('[ServiceWorker] Chyba registrace:', err);
    });
  });
}

// ====== STATE ======
let currentUser = null;
let currentTraining = [];    // pro 8m
let currentMode = '8m';      // '8m' | '8+2'
let m82Submode = 'classic';  // 'classic' | 'unlimited'

// Historie modal/paginace + filtry (chips)
let historyVisibleCount = 30;
let historyFilter = 'all';

// Statistiky – rozsah (7d|30d|all)
let statsRange = '7d';

// ====== PROGRESS BAR ======
const topProgressEl = document.getElementById('top-progress');
function progressStart(){ if(!topProgressEl) return; topProgressEl.classList.add('active'); topProgressEl.style.width='6%'; }
function progressFinish(){ if(!topProgressEl) return; topProgressEl.style.width='100%'; setTimeout(()=>{ topProgressEl.classList.remove('active'); topProgressEl.style.width='0%'; }, 250); }

// ====== RIPPLE ======
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
  ink.style.left = `${x}px`; ink.style.top = `${y}px`;
  btn.appendChild(ink); setTimeout(()=>ink.remove(), 650);
});

// ====== TOAST ======
function showToast(message, timeout = 2400) {
  const c = document.getElementById('toast-container');
  if (!c) { console.log('[Toast]', message); return; }
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message;
  c.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(()=>c.removeChild(el), 200); }, timeout);
}

// ====== STORAGE ======
function loadUsers(){ const j = localStorage.getItem('kubbUsers'); return j ? JSON.parse(j) : []; }
function saveUsers(u){ localStorage.setItem('kubbUsers', JSON.stringify(u)); }

// ====== EXPORT / IMPORT ======
// ... (beze změny, zůstává původní kód export/import) ...

// ====== USERS UI ======
function renderUserList(){
  const users = loadUsers();
  const list = document.getElementById('user-list'); list.innerHTML='';
  users.forEach((user, index)=>{
    const row = document.createElement('div');
    const name = document.createElement('span'); name.textContent=user.name; name.style.flexGrow='1'; name.style.cursor='pointer';
    name.onclick=()=>{
      if (currentTraining.length>0){
        if (!confirm('Probíhá trénink. Opravdu přepnout uživatele?')) return;
        currentTraining=[]; updateCurrentTrainingSummary(); updateCurrentTrainingProgress();
        document.getElementById('current-training-summary').style.display='none';
      }
      currentUser=user.name; document.getElementById('current-user-name').textContent=currentUser;
      renderHistoryPreview(currentUser); renderStats(currentUser); resetThrowsInput();
    };
    const del = document.createElement('button'); del.textContent='Smazat';
    del.onclick=(e)=>{
      e.stopPropagation();
      if (confirm(`Smazat uživatele "${user.name}"?`)){
        users.splice(index,1); saveUsers(users); renderUserList();
        if (currentUser===user.name){ currentUser=null; document.getElementById('current-user-name').textContent='žádný'; currentTraining=[]; updateCurrentTrainingSummary(); updateCurrentTrainingProgress(); document.getElementById('current-training-summary').style.display='none'; clearHistoryPreview(); clearStatsView(); }
      }
    };
    row.appendChild(name); row.appendChild(del); list.appendChild(row);
  });
}
document.getElementById('add-user-btn').onclick=()=>{
  const input=document.getElementById('user-name-input'); const name=input.value.trim();
  if (!name) { alert('Zadej jméno uživatele.'); return; }
  const users=loadUsers(); if (users.find(u=>u.name===name)){ alert('Uživatel s tímto jménem již existuje.'); return; }
  users.push({name, history:[]}); saveUsers(users); input.value=''; renderUserList();
};

// ====== MODE SWITCH ======
// ... (beze změny) ...

// ====== 8m LOGIKA ======
const hitButtons = document.querySelectorAll('#hit-buttons .hit-btn');
hitButtons.forEach(btn=>{
  btn.onclick=()=>{
    if (!currentUser){ alert('Nejdříve vyber uživatele.'); return; }
    if (currentMode!=='8m') return;
    const selectedHits=parseInt(btn.getAttribute('data-value'),10);
    let tInput=document.getElementById('throws-input'); let throws=parseInt(tInput.value,10);
    if (isNaN(throws)||throws<1){ throws=6; tInput.value=6; } if (throws>6){ throws=6; tInput.value=6; }
    currentTraining.push({hit:selectedHits, throws, timestamp:new Date().toISOString()});
    updateCurrentTrainingSummary();
    updateCurrentTrainingProgress(); // <<< nový řádek
    resetThrowsInput();
    hitButtons.forEach(b=>b.classList.remove('selected')); btn.classList.add('selected');
  };
});
function resetThrowsInput(){ const t=document.getElementById('throws-input'); if (t) t.value=6; }
function updateCurrentTrainingSummary(){
  const s=document.getElementById('current-training-summary');
  if (currentTraining.length===0){ s.style.display='none'; return; } s.style.display='block';
  const series=currentTraining.length; const hits=currentTraining.reduce((a,c)=>a+c.hit,0); const throws=currentTraining.reduce((a,c)=>a+c.throws,0);
  const rate=throws>0?Math.round((hits/throws)*100):0;
  document.getElementById('series-count').textContent=series;
  document.getElementById('total-hit').textContent=hits;
  document.getElementById('total-throws').textContent=throws;
  document.getElementById('success-rate').textContent=rate;
}

// >>> NOVÁ FUNKCE <<<
function updateCurrentTrainingProgress(){
  const box = document.getElementById('current-training-progress');
  const list = document.getElementById('progress-list');
  if (!box || !list) return;

  if (currentTraining.length === 0) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  list.innerHTML = currentTraining.map((s, i) => {
    const acc = s.throws > 0 ? Math.round((s.hit / s.throws) * 100) : 0;
    return `${i+1}) ${s.hit}/${s.throws} → ${acc}%`;
  }).join('<br>');
}

document.getElementById('undo-last-series-btn').onclick=()=>{
  if (currentMode!=='8m') return; if (currentTraining.length===0){ alert('Žádná série k vrácení.'); return; }
  currentTraining.pop(); updateCurrentTrainingSummary(); updateCurrentTrainingProgress(); // <<< doplněno
};
document.getElementById('end-training-btn').onclick=()=>{
  if (currentMode!=='8m') return; if (!currentUser){ alert('Vyber uživatele.'); return; }
  if (currentTraining.length===0){ alert('Trénink je prázdný.'); return; }
  progressStart();
  const users=loadUsers(); const idx=users.findIndex(u=>u.name===currentUser);
  if (idx===-1){ alert('Uživatel nenalezen.'); progressFinish(); return; }
  const totalHit=currentTraining.reduce((a,c)=>a+c.hit,0); const totalThrows=currentTraining.reduce((a,c)=>a+c.throws,0);
  const successRate=totalThrows>0?Math.round((totalHit/totalThrows)*100):0;
  users[idx].history.push({type:'8m', date:new Date().toISOString(), training:currentTraining, totalHit, totalThrows, successRate});
  saveUsers(users); currentTraining=[]; updateCurrentTrainingSummary(); updateCurrentTrainingProgress(); // <<< doplněno
  renderHistoryPreview(currentUser); renderStats(currentUser); showToast('Trénink uložen ✅'); progressFinish();
};

// ====== 8+2 LOGIKA, Historie, Statistiky ======
// ... zůstává původní kód beze změny ...

// ====== INIT ======
renderUserList();
