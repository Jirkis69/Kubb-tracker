// ======================
// Kubb Tracker v1.05 (script.js)
// 8m MA5 trend + kliky; 8+2 distribuce = full-width GRID (bez horizontálního scrollu, vyvážená výška)
// ======================

// --- Service Worker badge (info) ---
const CACHE_VERSION = 'v1.05';
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
let historyFilter = 'all'; // all | 8m | 8p2Classic | 8p2Unlimited

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
function exportAll(){ progressStart(); const data={app:'Kubb Tracker',format:1,exportedAt:new Date().toISOString(),users:loadUsers()}; downloadJSON(data,`kubb-export-all-${dateStamp()}.json`); progressFinish(); }
function exportCurrent(){
  if (!currentUser) { alert('Vyber aktuálního uživatele.'); return; }
  progressStart();
  const users = loadUsers(); const user = users.find(u=>u.name===currentUser);
  if (!user) { alert('Uživatel nenalezen.'); progressFinish(); return; }
  const data={app:'Kubb Tracker',format:1,exportedAt:new Date().toISOString(),users:[user]};
  downloadJSON(data,`kubb-export-${sanitizeFileName(user.name)}-${dateStamp()}.json`); progressFinish();
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); document.body.removeChild(a); },0);
}
function dateStamp(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`; }
function sanitizeFileName(s){ return s.replace(/[^\w\-]+/g,'_').slice(0,40); }

async function importJSONFile(file){
  progressStart();
  try{
    const text = await file.text(); const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.users)) { alert('Soubor neobsahuje platná data.'); progressFinish(); return; }
    const incomingUsers = parsed.users; const users = loadUsers();

    let addedUsers=0, addedRecords=0, skippedDupes=0;
    incomingUsers.forEach(inUser=>{
      if (!inUser?.name) return; if (!Array.isArray(inUser.history)) inUser.history=[];
      let target = users.find(u=>u.name===inUser.name);
      if (!target){ target={name:inUser.name, history:[]}; users.push(target); addedUsers++; }
      if (!Array.isArray(target.history)) target.history=[];
      const existing = new Set(target.history.map(e=>makeEntrySignature(e)));
      inUser.history.forEach(e=>{
        const sig = makeEntrySignature(e);
        if (!existing.has(sig)){ normalizeEntry(e); target.history.push(e); existing.add(sig); addedRecords++; } else { skippedDupes++; }
      });
    });

    saveUsers(users);
    if (currentUser){ renderHistoryPreview(currentUser); renderStats(currentUser); } else { renderUserList(); }
    showToast(`Import hotov: +${addedRecords}, noví uživ.: ${addedUsers}${skippedDupes?`, duplicit: ${skippedDupes}`:''}`, 3500);
  }catch(err){ console.error(err); alert('Import selhal. Zkontroluj formát souboru.'); }
  finally{ progressFinish(); }
}
function makeEntrySignature(e){
  const base={
    type:e?.type??null, mode:e?.mode??null, date:e?.date??null,
    in10:e?.in10??null, king:e?.king??null, total11:e?.total11??null, throwsUsed:e?.throwsUsed??null,
    pinsToClose:e?.pinsToClose??null, dnf:e?.dnf??null,
    training:Array.isArray(e?.training)?e.training.map(s=>({hit:s.hit,throws:s.throws})):null,
    totalHit:e?.totalHit??null, totalThrows:e?.totalThrows??null, successRate:e?.successRate??null
  };
  return JSON.stringify(base);
}
function normalizeEntry(e){
  if (!e) return;
  if (e.type==='8m'){
    if (e.totalHit==null && Array.isArray(e.training)) e.totalHit=e.training.reduce((a,c)=>a+(c.hit||0),0);
    if (e.totalThrows==null && Array.isArray(e.training)) e.totalThrows=e.training.reduce((a,c)=>a+(c.throws||0),0);
    if (e.successRate==null && e.totalThrows>0) e.successRate=Math.round((e.totalHit/e.totalThrows)*100);
  }
  if (e.type==='8+2' && e.mode==='classic'){
    if (e.total11==null) e.total11=(e.in10||0)+(e.king?1:0);
  }
}

// ====== UI HOOKS ======
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('export-all-btn')?.addEventListener('click', exportAll);
  document.getElementById('export-current-btn')?.addEventListener('click', exportCurrent);
  const btnImport = document.getElementById('import-btn');
  const fileInput = document.getElementById('import-file');
  btnImport?.addEventListener('click', ()=>fileInput?.click());
  fileInput?.addEventListener('change', ()=>{ const f=fileInput.files?.[0]; if (f){ importJSONFile(f); fileInput.value=''; }});

  document.querySelectorAll('.seg-btn[data-range]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.seg-btn[data-range]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); statsRange = btn.getAttribute('data-range')||'7d';
      if (currentUser) renderStats(currentUser);
    });
  });

  // chips filtry historie (8m / Classic / Unlimited / Vše)
  document.querySelectorAll('.chip[data-f]').forEach(ch => {
    ch.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-f]').forEach(x => x.classList.remove('active'));
      ch.classList.add('active');
      historyFilter = ch.getAttribute('data-f') || 'all';
      historyVisibleCount = parsePageSize(document.getElementById('history-page-size')?.value);
      if (currentUser) renderHistoryModal(currentUser);
    });
  });
});

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
        currentTraining=[]; updateCurrentTrainingSummary(); document.getElementById('current-training-summary').style.display='none';
      }
      currentUser=user.name; document.getElementById('current-user-name').textContent=currentUser;
      renderHistoryPreview(currentUser); renderStats(currentUser); resetThrowsInput();
    };
    const del = document.createElement('button'); del.textContent='Smazat';
    del.onclick=(e)=>{
      e.stopPropagation();
      if (confirm(`Smazat uživatele "${user.name}"?`)){
        users.splice(index,1); saveUsers(users); renderUserList();
        if (currentUser===user.name){ currentUser=null; document.getElementById('current-user-name').textContent='žádný'; currentTraining=[]; updateCurrentTrainingSummary(); document.getElementById('current-training-summary').style.display='none'; clearHistoryPreview(); clearStatsView(); }
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
const mode8mRadio = document.getElementById('mode-8m-radio');
const mode82Radio = document.getElementById('mode-82-radio');
const mode8mDiv   = document.getElementById('mode-8m');
const mode82Div   = document.getElementById('mode-82');
function switchMode(mode){ currentMode=mode; if(mode==='8m'){ mode8mDiv.style.display=''; mode82Div.style.display='none'; } else { mode8mDiv.style.display='none'; mode82Div.style.display=''; } }
mode8mRadio.addEventListener('change',()=>switchMode('8m'));
mode82Radio.addEventListener('change',()=>switchMode('8+2'));

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
    updateCurrentTrainingSummary(); resetThrowsInput(); hitButtons.forEach(b=>b.classList.remove('selected')); btn.classList.add('selected');
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
document.getElementById('undo-last-series-btn').onclick=()=>{
  if (currentMode!=='8m') return; if (currentTraining.length===0){ alert('Žádná série k vrácení.'); return; }
  currentTraining.pop(); updateCurrentTrainingSummary();
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
  saveUsers(users); currentTraining=[]; updateCurrentTrainingSummary(); renderHistoryPreview(currentUser); renderStats(currentUser); showToast('Trénink uložen ✅'); progressFinish();
};

// ====== 8+2 SUBMODE ======
const m82ClassicRadio   = document.getElementById('m82-classic-radio');
const m82UnlimitedRadio = document.getElementById('m82-unlimited-radio');
const m82ClassicDiv     = document.getElementById('m82-classic');
const m82UnlimitedDiv   = document.getElementById('m82-unlimited');
function switchM82Submode(sub){ m82Submode=sub; if(sub==='classic'){ m82ClassicDiv.style.display=''; m82UnlimitedDiv.style.display='none'; } else { m82ClassicDiv.style.display='none'; m82UnlimitedDiv.style.display=''; } }
m82ClassicRadio.addEventListener('change',()=>switchM82Submode('classic'));
m82UnlimitedRadio.addEventListener('change',()=>switchM82Submode('unlimited'));

// ====== 8+2 CLASSIC ======
document.querySelectorAll('.m82c-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    if (!currentUser){ alert('Vyber nejdříve uživatele.'); return; }
    if (currentMode!=='8+2' || m82Submode!=='classic') return;

    const tInput=document.getElementById('m82-classic-throws');
    let throwsUsed=parseInt(tInput?.value,10); if (isNaN(throwsUsed)||throwsUsed<1) throwsUsed=1; if (throwsUsed>6) throwsUsed=6;
    const kubbs=parseInt(chip.getAttribute('data-kubb'),10); let king=false;
    if (kubbs===10){ king=!!confirm('Padl král? (OK = Ano, Zrušit = Ne)'); }

    progressStart();
    const entry={ type:'8+2', mode:'classic', date:new Date().toISOString(), in10:kubbs, king, total11:kubbs+(king?1:0), throwsUsed };
    const users=loadUsers(); const idx=users.findIndex(u=>u.name===currentUser);
    if (idx===-1){ alert('Uživatel nenalezen.'); progressFinish(); return; }
    if (!users[idx].history) users[idx].history=[]; users[idx].history.push(entry); saveUsers(users);
    if (tInput) tInput.value=6;
    renderHistoryPreview(currentUser); renderStats(currentUser); showToast('Záznam uložen ✅'); progressFinish();
  });
});

// ====== 8+2 UNLIMITED ======
const m82UnlPinsSelect = document.getElementById('m82-unl-pins');
const m82UnlSaveBtn    = document.getElementById('m82-unl-save');
const m82UnlDNFBtn     = document.getElementById('m82-unl-dnf');
(function fillUnlSelect(){ if(!m82UnlPinsSelect) return; m82UnlPinsSelect.innerHTML=''; for(let p=4;p<=20;p++){ const opt=document.createElement('option'); opt.value=String(p); opt.textContent=String(p); m82UnlPinsSelect.appendChild(opt);} })();
m82UnlSaveBtn.addEventListener('click', ()=>{
  if (!currentUser){ alert('Vyber nejdříve uživatele.'); return; }
  if (currentMode!=='8+2' || m82Submode!=='unlimited') return;
  progressStart();
  const pinsToClose=parseInt(m82UnlPinsSelect.value,10);
  const entry={ type:'8+2', mode:'unlimited', date:new Date().toISOString(), pinsToClose, dnf:false };
  const users=loadUsers(); const idx=users.findIndex(u=>u.name===currentUser);
  if (idx===-1){ alert('Uživatel nenalezen.'); progressFinish(); return; }
  if (!users[idx].history) users[idx].history=[]; users[idx].history.push(entry); saveUsers(users);
  renderHistoryPreview(currentUser); renderStats(currentUser); showToast('Záznam uložen ✅'); progressFinish();
});
m82UnlDNFBtn.addEventListener('click', ()=>{
  if (!currentUser){ alert('Vyber nejdříve uživatele.'); return; }
  if (currentMode!=='8+2' || m82Submode!=='unlimited') return;
  if (!confirm('Opravdu uložit DNF pro tuto sérii?')) return;
  progressStart();
  const entry={ type:'8+2', mode:'unlimited', date:new Date().toISOString(), pinsToClose:null, dnf:true };
  const users=loadUsers(); const idx=users.findIndex(u=>u.name===currentUser);
  if (idx===-1){ alert('Uživatel nenalezen.'); progressFinish(); return; }
  if (!users[idx].history) users[idx].history=[]; users[idx].history.push(entry); saveUsers(users);
  renderHistoryPreview(currentUser); renderStats(currentUser); showToast('DNF uloženo'); progressFinish();
});

// ====== HISTORIE – náhled + modal (kompaktní karty) ======
function renderHistoryPreview(userName){
  const users=loadUsers(); const user=users.find(u=>u.name===userName);
  const preview=document.getElementById('history-preview'); if (!preview) return;
  if (!user||!user.history||user.history.length===0){ preview.textContent='Žádná historie.'; return; }
  const e=user.history[user.history.length-1]; preview.innerHTML = historyCardLine(e);
}
function clearHistoryPreview(){ const p=document.getElementById('history-preview'); if (p) p.textContent='Vyber uživatele, abys viděl poslední záznam.'; }

const openHistoryBtn=document.getElementById('open-history-btn');
const historyPageSizeSelect=document.getElementById('history-page-size');
const historyLoadMoreBtn=document.getElementById('history-load-more');
const historyInfoSpan=document.getElementById('history-info');

openHistoryBtn?.addEventListener('click', ()=>{
  if (!currentUser){ alert('Vyber nejdříve uživatele.'); return; }
  document.getElementById('history-modal-user').textContent=currentUser;
  historyVisibleCount=parsePageSize(historyPageSizeSelect?.value);
  openModal('history-modal'); renderHistoryModal(currentUser);
});
historyPageSizeSelect?.addEventListener('change',()=>{ historyVisibleCount=parsePageSize(historyPageSizeSelect.value); renderHistoryModal(currentUser); });
historyLoadMoreBtn?.addEventListener('click',()=>{ if(historyPageSizeSelect?.value==='all') return; historyVisibleCount += parseInt(historyPageSizeSelect?.value,10)||30; renderHistoryModal(currentUser); });

function parsePageSize(val){ return (val==='all')?Infinity:parseInt(val||'30',10); }

function renderHistoryModal(userName){
  const users=loadUsers(); const user=users.find(u=>u.name===userName);
  const list=document.getElementById('history-list'); if (!list) return;
  list.innerHTML='';
  if (!user||!user.history||user.history.length===0){ list.textContent='Žádná historie.'; historyInfoSpan && (historyInfoSpan.textContent=''); historyLoadMoreBtn?.setAttribute('disabled','disabled'); return; }

  let all=user.history.slice().reverse();
  if (historyFilter==='8m') all=all.filter(e=>e.type==='8m');
  else if (historyFilter==='8p2Classic') all=all.filter(e=>e.type==='8+2'&&e.mode==='classic');
  else if (historyFilter==='8p2Unlimited') all=all.filter(e=>e.type==='8+2'&&e.mode==='unlimited');

  const slice=all.slice(0, Math.min(historyVisibleCount, all.length));
  slice.forEach((e)=>{
    const row=document.createElement('div');
    row.className='hist-card';
    row.innerHTML = historyCardLine(e);

    // Klik pro rozbalení detailů (zejména 8m: série)
    row.addEventListener('click', () => {
      const expanded = row.querySelector('.hist-details');
      if (expanded) { expanded.remove(); return; }
      const det = document.createElement('div');
      det.className = 'hist-details';
      det.style.marginTop = '.45rem';
      det.style.fontSize = '.95rem';
      det.style.color = '#334155';
      det.style.borderTop = '1px dashed var(--border)';
      det.style.paddingTop = '.45rem';

      if (e.type==='8m' && Array.isArray(e.training) && e.training.length){
        const lines = e.training.map((s,i)=>{
          const acc = s.throws>0 ? Math.round((s.hit/s.throws)*100) : 0;
          return `${i+1}) ${s.hit}/${s.throws} → ${acc}%`;
        }).join('<br>');
        det.innerHTML = `<strong>Série:</strong><br>${lines}`;
      } else if (e.type==='8+2' && e.mode==='classic'){
        const v11=e.total11 ?? ((e.in10||0)+(e.king?1:0));
        det.innerHTML = `v10: ${e.in10}/10 ${e.in10===10? (e.king?'(+ král)':'(+ král NE)') : ''} → v11: <strong>${v11}/11</strong>${e.throwsUsed!=null?` • kolíky: ${e.throwsUsed}`:''}`;
      } else if (e.type==='8+2' && e.mode==='unlimited'){
        det.textContent = e.dnf ? 'DNF (nedokončeno)' : `Zavřeno na ${e.pinsToClose} kolících`;
      } else {
        det.textContent = 'Detail není k dispozici.';
      }
      row.appendChild(det);
    });

    list.appendChild(row);
  });

  const showing=Math.min(slice.length, all.length); historyInfoSpan && (historyInfoSpan.textContent=`Zobrazuji ${showing} z ${all.length}`);
  if (historyLoadMoreBtn){ if (slice.length>=all.length || historyPageSizeSelect?.value==='all') historyLoadMoreBtn.setAttribute('disabled','disabled'); else historyLoadMoreBtn.removeAttribute('disabled'); }
}
function historyCardLine(e){
  const date = relativeDate(e.date);
  if (e.type==='8m'){
    const hits=e.totalHit ?? e.training?.reduce((a,c)=>a+c.hit,0) ?? 0;
    const thr =e.totalThrows ?? e.training?.reduce((a,c)=>a+c.throws,0) ?? 0;
    const suc =thr?Math.round(hits/thr*100):0;
    const seriesCount = e.training ? e.training.length : 0;
    return `
      <div class="row-top">
        <span class="mode-ico">🎯</span>
        <span class="main-val">${suc}%</span>
        <span class="date">${date}</span>
      </div>
      <div class="row-sub muted">Série: ${seriesCount} • Shozeno: ${hits} • Hodů: ${thr}</div>
    `;
  } else if (e.type==='8+2'){
    if (e.mode==='classic'){
      const v11=e.total11 ?? ((e.in10||0)+(e.king?1:0));
      const tTxt=(e.throwsUsed!=null)?` • kolíky: ${e.throwsUsed}`:'';
      const in10txt = (e.in10===10) ? `v10=10 ${e.king?'+ král':'(+ král NE)'}` : `v10=${e.in10}`;
      return `
        <div class="row-top">
          <span class="mode-ico">🔵</span>
          <span class="main-val">${v11}/11</span>
          <span class="date">${date}</span>
        </div>
        <div class="row-sub muted">${in10txt}${tTxt}</div>
      `;
    } else if (e.mode==='unlimited'){
      const main = e.dnf ? 'DNF' : `${e.pinsToClose} kol.`;
      return `
        <div class="row-top">
          <span class="mode-ico">🟠</span>
          <span class="main-val">${main}</span>
          <span class="date">${date}</span>
        </div>
        <div class="row-sub muted">${e.dnf ? 'nedokončeno' : 'zavřeno'}</div>
      `;
    } else {
      return `<div class="row-top"><span class="mode-ico">ℹ️</span><span class="main-val">8+2</span><span class="date">${date}</span></div>`;
    }
  } else {
    return `<div class="row-top"><span class="mode-ico">ℹ️</span><span class="main-val">záznam</span><span class="date">${date}</span></div>`;
  }
}
function relativeDate(iso){
  const d=new Date(iso); const now=new Date();
  const diff=(now-d)/1000; // s
  if (diff<60) return 'před chvílí';
  if (diff<3600) return `${Math.floor(diff/60)} min`;
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const day = new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  if (day===today) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const ymd = d.toLocaleDateString();
  const hm  = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return `${ymd} ${hm}`;
}

// ====== MODAL infra ======
function openModal(id){ const m=document.getElementById(id); if (!m) return; m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
function closeModal(id){ const m=document.getElementById(id); if (!m) return; m.classList.remove('show'); m.setAttribute('aria-hidden','true'); }
document.addEventListener('click',(e)=>{ if (e.target?.getAttribute?.('data-dismiss')==='history-modal') closeModal('history-modal'); });
document.addEventListener('keydown',(e)=>{ if (e.key==='Escape') closeModal('history-modal'); });

// ======================
// Statistiky – filtrování rozsahu a výpočet metrik
// ======================
function filterHistoryByRange(history, range){
  if (!Array.isArray(history)) return [];
  if (range==='all') return history.slice();
  const now=Date.now(); const ms=(range==='7d')?7*24*3600*1000:30*24*3600*1000; const from=now-ms;
  return history.filter(e=>{ const t=new Date(e.date).getTime(); return !isNaN(t)&&t>=from&&t<=now; });
}

function computeStats(history){
  const out={
    m8m: { sessions:0, avgAcc:0, bestAcc:0, seriesAcc:[], sessions8m:[] },
    c82: { sessions:0, avgV10:0, avgV11:0, distV11: new Array(12).fill(0), trendV11:[] },
    u82: { sessions:0, avgPins:null, bestPins:null, dnf:0, distPins: new Array(17).fill(0), trendPins:[] } // 4..20 → 17 bucketů
  };
  if (!history?.length) return out;

  const v10Vals=[]; const v11Vals=[]; const v11Trend=[];
  const pinsVals=[]; const pinsTrend=[];

  const hSorted = history.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));

  let totalHits=0,totalThrows=0;

  hSorted.forEach(e=>{
    if (e.type==='8m'){
      const hits=e.totalHit ?? (e.training?.reduce((a,c)=>a+(c.hit||0),0)||0);
      const thr =e.totalThrows ?? (e.training?.reduce((a,c)=>a+(c.throws||0),0)||0);
      const acc = thr ? Math.round(hits/thr*100) : 0;
      out.m8m.sessions++; totalHits+=hits; totalThrows+=thr; out.m8m.bestAcc=Math.max(out.m8m.bestAcc, acc); out.m8m.seriesAcc.push(acc);
      out.m8m.sessions8m.push({acc, hits, thr, date:e.date, entry:e});
    }
    if (e.type==='8+2' && e.mode==='classic'){
      const in10 = e.in10 ?? 0;
      const v11  = e.total11 != null ? e.total11 : (in10 + (e.king?1:0));
      out.c82.sessions++;
      v11Vals.push(v11); v11Trend.push(v11);
      if (v11>=0 && v11<=11) out.c82.distV11[v11]++;
    }
    if (e.type==='8+2' && e.mode==='unlimited'){
      out.u82.sessions++;
      if (e.dnf){ out.u82.dnf++; pinsTrend.push(null); }
      else if (e.pinsToClose!=null){
        const p=e.pinsToClose; pinsVals.push(p); pinsTrend.push(p);
        out.u82.bestPins = (out.u82.bestPins==null)?p:Math.min(out.u82.bestPins, p);
        if (p>=4 && p<=20) out.u82.distPins[p-4]++;
      }
    }
  });

  out.m8m.avgAcc = totalThrows ? Math.round((totalHits/totalThrows)*100) : 0;
  if (v11Vals.length) out.c82.avgV11 = (v11Vals.reduce((a,b)=>a+b,0)/v11Vals.length).toFixed(2);
  if (pinsVals.length){ out.u82.avgPins = (pinsVals.reduce((a,b)=>a+b,0)/pinsVals.length).toFixed(2); }

  out.c82.trendV11 = v11Trend.slice(-12);
  out.u82.trendPins = pinsTrend.slice(-12);
  out.m8m.seriesAcc = out.m8m.seriesAcc.slice(-20);
  out.m8m.sessions8m = out.m8m.sessions8m.slice(-20);

  return out;
}

// ====== 8m: kombinovaný graf (sloupce + MA5 trend) ======
function drawComboChart(values, { meta=null, height=170, yMax=100, yTicks=[25,50,75,100], lineColor='#0b4ea9'} = {}){
  const vals = values.map(v => Math.max(0, Math.min(yMax, v==null?0:v)));
  const n = vals.length || 1;
  const m = { top:10, right:12, bottom:22, left:30 };
  const bw = 12; const gap = 6;
  const chartW = n*bw + (n-1)*gap;
  const width = m.left + chartW + m.right;
  const chartH = height - m.top - m.bottom;

  const wrap = document.createElement('div');
  wrap.style.overflowX = 'auto';
  wrap.style.padding = '4px 0';

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.display='block';

  // Grid + labels
  yTicks.concat([0]).forEach(tick=>{
    const y = m.top + (1 - (tick/yMax)) * chartH;
    const line = document.createElementNS(svg.namespaceURI,'line');
    line.setAttribute('x1', m.left); line.setAttribute('x2', width - m.right);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(0,0,0,.15)');
    line.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(line);

    if (tick>0){
      const txt = document.createElementNS(svg.namespaceURI,'text');
      txt.setAttribute('x', m.left - 6);
      txt.setAttribute('y', y + 4);
      txt.setAttribute('text-anchor', 'end');
      txt.setAttribute('font-size', '10');
      txt.setAttribute('fill', 'currentColor');
      txt.textContent = `${tick}%`;
      svg.appendChild(txt);
    }
  });

  // Bars (barvy vs. průměr z celé sady)
  const avgVal = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
  const green = '#16a34a'; const red = '#dc2626';
  vals.forEach((v,i)=>{
    const x = m.left + i*(bw+gap);
    const h = (v/yMax)*chartH;
    const y = m.top + (chartH - h);
    const rect = document.createElementNS(svg.namespaceURI,'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', i===n-1 ? bw+2 : bw);
    rect.setAttribute('height', Math.max(2, h));
    rect.setAttribute('rx', '3'); rect.setAttribute('ry', '3');
    rect.setAttribute('fill', (v>=avgVal)?green:red);
    rect.style.cursor='pointer';
    rect.addEventListener('click', ()=>{
      if (!meta || !meta[i]) return;
      const it = meta[i];
      const d = new Date(it.date).toLocaleString();
      showToast(`8m ${d}: ${it.acc}% • Shozeno ${it.hits}/${it.thr}`);
    });
    svg.appendChild(rect);
  });

  // Trend line = 5-bodový klouzavý průměr (MA5)
  const ma = movingAverage(vals, 5);
  let d = '';
  ma.forEach((v,i)=>{
    const cx = m.left + i*(bw+gap) + bw/2;
    const cy = m.top + (chartH - (v/yMax)*chartH);
    d += (i===0?`M ${cx} ${cy}`:` L ${cx} ${cy}`);
  });
  const path = document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', lineColor);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  // poslední bod zvýraznit
  if (ma.length){
    const i = ma.length-1;
    const cx = m.left + i*(bw+gap) + bw/2;
    const cy = m.top + (chartH - (ma[i]/yMax)*chartH);
    const dot = document.createElementNS(svg.namespaceURI,'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('r', '3.2'); dot.setAttribute('fill', lineColor);
    svg.appendChild(dot);
  }

  wrap.appendChild(svg);
  return wrap;
}
function movingAverage(arr, windowSize){
  if (!arr.length) return [];
  const out=[]; let sum=0;
  for (let i=0;i<arr.length;i++){
    sum += arr[i];
    if (i>=windowSize) sum -= arr[i-windowSize];
    const count = Math.min(i+1, windowSize);
    out.push( Math.round( (sum / count) * 10 ) / 10 );
  }
  return out;
}

// ====== Mini bars pro Unlimited – výška = počet kolíků (víc = vyšší), barva vs. průměr ======
function miniBarsPins(pinsArr){
  const arr = pinsArr.slice(); // číslo (4..20) nebo null (DNF)
  const wrap = document.createElement('div');
  wrap.className = 'mbox';
  const box = document.createElement('div');
  box.className = 'mbars'; box.style.position='relative';
  wrap.appendChild(box);

  const vals = arr.filter(v=>v!=null);
  const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;
  const green = '#16a34a'; const red = '#dc2626';

  arr.forEach((v,i)=>{
    const bar = document.createElement('div');
    bar.className='mbar';
    bar.style.flex='0 0 auto';
    bar.style.width = (i===arr.length-1)?'12px':'8px';
    if (i===arr.length-1) bar.classList.add('last');

    let h = 12;
    if (v==null){
      h = 14; // DNF
      bar.style.background = 'repeating-linear-gradient(-45deg, #cbd5e1, #cbd5e1 5px, #e2e8f0 5px, #e2e8f0 10px)';
      bar.title = 'DNF';
    } else {
      const norm = (v - 4) / 16; // 0..1 (víc = hůř)
      h = 14 + Math.round(norm * 50); // 14..64
      bar.style.background = (avg!=null && v <= avg) ? green : red; // méně/equal kolíků = lepší
      bar.title = `${v} kolíků`;
    }
    bar.style.height = `${h}px`;
    box.appendChild(bar);

    if (i===arr.length-1){
      const tip = document.createElement('div');
      tip.textContent = (v==null)?'DNF':`${v}`;
      tip.style.fontSize='.82rem';
      tip.style.opacity='.85';
      tip.style.marginLeft='2px';
      tip.style.transform='translateY(-4px)';
      box.appendChild(tip);
    }
  });

  return wrap;
}

// ====== FULL-WIDTH GRID DISTRIBUTION (bez scrollu) ======
function drawBarDistributionGrid(buckets, labels, {barColor='#3b82f6', height=110, showValues=true} = {}){
  const n = buckets.length;
  const max = Math.max(1, ...buckets);

  const wrap = document.createElement('div');
  // Kontejner grafu – sloupce na plnou šířku, zarovnání ke spodku
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  wrap.style.alignItems = 'end';
  wrap.style.gap = '6px';
  wrap.style.padding = '6px 2px 0';

  for (let i=0;i<n;i++){
    const val = buckets[i];
    const col = document.createElement('div');
    col.style.display='flex';
    col.style.flexDirection='column';
    col.style.alignItems='center';
    col.style.minWidth='0';

    // bar
    const h = Math.max(4, Math.round((val/max) * (height - 20)));
    const bar = document.createElement('div');
    bar.style.height = `${h}px`;
    bar.style.width = '100%';
    bar.style.maxWidth = '28px';
    bar.style.borderRadius = '4px 4px 0 0';
    bar.style.background = barColor;
    bar.style.opacity = '.92';
    bar.style.cursor = 'pointer';
    bar.title = `${labels[i]}: ${val}×`;
    bar.addEventListener('click', ()=> showToast(`${labels[i]}: ${val}×`));
    col.appendChild(bar);

    // číslo (jen když něco je a máme prostor)
    if (showValues && val>0 && h>=16){
      const vtx = document.createElement('div');
      vtx.textContent = String(val);
      vtx.style.fontSize = '.75rem';
      vtx.style.marginTop = '2px';
      vtx.style.opacity = '.85';
      col.appendChild(vtx);
    }

    // label
    const lx = document.createElement('div');
    lx.textContent = String(labels[i]);
    lx.style.fontSize = '.78rem';
    lx.style.marginTop = '4px';
    lx.style.opacity = '.8';
    col.appendChild(lx);

    wrap.appendChild(col);
  }

  return wrap;
}

// ====== Vykreslení statistik ======
function renderStats(userName){
  const users=loadUsers(); const user=users.find(u=>u.name===userName);
  const root=document.getElementById('stats'); const note=document.getElementById('stats-note');
  if (!root) return;

  if (!user||!user.history||!user.history.length){
    root.innerHTML='<div style="opacity:.7;">Žádná data pro statistiky.</div>'; if (note) note.textContent=''; return;
  }

  const filtered = filterHistoryByRange(user.history, statsRange);
  const s = computeStats(filtered);
  const map={ '7d':'posledních 7 dní', '30d':'posledních 30 dní', 'all':'celkově' };
  if (note) note.textContent = `Rozsah: ${map[statsRange]} – zahrnuto záznamů: ${filtered.length}`;

  root.innerHTML = '';
  const grid = document.createElement('div'); grid.className='stat-grid'; root.appendChild(grid);

  // --- 8m: kombinovaný graf (sloupce + MA5 trend) ---
  const card8m = document.createElement('div'); card8m.className='stat-card';
  card8m.innerHTML = `
    <h3>8m <span class="muted">• ${s.m8m.sessions} záznamů • Ø ${s.m8m.avgAcc}% • max ${s.m8m.bestAcc}%</span></h3>
    <div class="stat-row"><span class="stat-key">Trend (posl. ${s.m8m.seriesAcc.length})</span><span></span></div>
  `;
  const combo = drawComboChart(
    s.m8m.seriesAcc,
    { meta: s.m8m.sessions8m, height: 170, yMax: 100, yTicks:[25,50,75,100] }
  );
  card8m.appendChild(combo);
  grid.appendChild(card8m);

  // --- 8+2 Classic: souhrn + distribuce v11 (0..11) – FULL WIDTH GRID ---
  const cardC = document.createElement('div'); cardC.className='stat-card';
  const classicItems = filtered.filter(r => r.type==='8+2' && r.mode==='classic');
  const closedAll = classicItems.filter(r => {
    const v11 = r.total11 != null ? r.total11 : ((r.in10||0) + (r.king?1:0));
    return v11 === 11;
  }).length;

  cardC.innerHTML = `
    <h3>8+2 Classic</h3>
    <div class="stat-row"><span class="stat-key">Záznamů</span><span><strong>${s.c82.sessions}</strong></span></div>
    <div class="stat-row"><span class="stat-key">Průměr v11</span><span><strong>${s.c82.avgV11 || '–'}</strong></span></div>
    <div class="stat-row"><span class="stat-key">Uzavřeno</span><span><strong>${closedAll}×</strong></span></div>
    <div class="stat-row" style="margin-top:.35rem;"><span class="stat-key">Distribuce v11</span><span></span></div>
  `;
  const labelsC = Array.from({length:12},(_,i)=>i); // 0..11
  const chartC = drawBarDistributionGrid(s.c82.distV11, labelsC, { barColor:'#3b82f6', height:110 });
  cardC.appendChild(chartC);
  grid.appendChild(cardC);

  // --- 8+2 Unlimited: trend minisloupky + distribuce (4..20) – FULL WIDTH GRID ---
  const cardU = document.createElement('div'); cardU.className='stat-card';
  cardU.innerHTML = `
    <h3>8+2 Unlimited
      <span class="muted">• ${s.u82.sessions} • DNF ${s.u82.dnf} • Ø ${s.u82.avgPins??'–'} kol. • best ${s.u82.bestPins??'–'}</span>
    </h3>
    <div class="stat-row"><span class="stat-key">Trend (posl. ${s.u82.trendPins.length})</span><span></span></div>
  `;
  const barsU = miniBarsPins(s.u82.trendPins);
  cardU.appendChild(barsU);

  const distUHdr = document.createElement('div');
  distUHdr.className = 'stat-row';
  distUHdr.style.marginTop = '.4rem';
  distUHdr.innerHTML = `<span class="stat-key">Distribuce kolíků</span><span></span>`;
  cardU.appendChild(distUHdr);

  const labelsU = Array.from({length:17},(_,i)=>i+4); // 4..20
  const chartU = drawBarDistributionGrid(s.u82.distPins, labelsU, { barColor:'#f59e0b', height:110 });
  cardU.appendChild(chartU);
  grid.appendChild(cardU);
}

function clearStatsView(){
  const root=document.getElementById('stats'); const note=document.getElementById('stats-note');
  if (root) root.innerHTML='<div style="opacity:.7%;">Vyber uživatele, zobrazí se souhrny pro 8m, 8+2 Classic a 8+2 Unlimited.</div>';
  if (note) note.textContent='';
}

// ====== INIT ======
renderUserList();

// ========= Historie modal – fallback body =========
(function ensureHistoryModal(){
  const modal = document.getElementById('history-modal');
  if (!modal) return;
  if (!modal.querySelector('#history-list')){
    const body=document.createElement('div'); body.id='history-list'; body.className='modal-body';
    modal.querySelector('.modal-dialog').appendChild(body);
  }
})();
