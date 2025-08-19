// --- Service Worker badge (jen info) ---
const CACHE_VERSION = 'v1.04';
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

// Historie modal/paginace
let historyVisibleCount = 30;
let historyFilter = 'all';

// Statistiky – rozsah (7d|30d|all)
let statsRange = '7d';

// ====== PROGRESS BAR ======
const topProgressEl = document.getElementById('top-progress');
function progressStart(){ if(!topProgressEl) return; topProgressEl.classList.add('active'); topProgressEl.style.width='6%'; }
function progressSet(p){ if(!topProgressEl) return; topProgressEl.style.width=Math.max(0,Math.min(98,p|0))+'%'; }
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
function showToast(message, timeout = 2000) {
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
  const base={type:e?.type??null,mode:e?.mode??null,date:e?.date??null,in10:e?.in10??null,king:e?.king??null,total11:e?.total11??null,throwsUsed:e?.throwsUsed??null,pinsToClose:e?.pinsToClose??null,dnf:e?.dnf??null,training:Array.isArray(e?.training)?e.training.map(s=>({hit:s.hit,throws:s.throws})):null,totalHit:e?.totalHit??null,totalThrows:e?.totalThrows??null,successRate:e?.successRate??null};
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

// ====== HISTORIE – náhled + modal (beze změn logiky) ======
function renderHistoryPreview(userName){
  const users=loadUsers(); const user=users.find(u=>u.name===userName);
  const preview=document.getElementById('history-preview'); if (!preview) return;
  if (!user||!user.history||user.history.length===0){ preview.textContent='Žádná historie.'; return; }
  const e=user.history[user.history.length-1]; const dateStr=new Date(e.date).toLocaleString();
  if (e.type==='8m'){
    const hits=e.totalHit ?? e.training?.reduce((a,c)=>a+c.hit,0) ?? 0;
    const thr =e.totalThrows ?? e.training?.reduce((a,c)=>a+c.throws,0) ?? 0;
    const suc =thr?Math.round(hits/thr*100):0; const cnt=e.training?e.training.length:0;
    preview.textContent = `${dateStr} – 8m | Série: ${cnt}, Shozeno: ${hits}, Hodů: ${thr}, Úspěšnost: ${suc}%`;
  } else if (e.type==='8+2'){
    if (e.mode==='classic'){
      const v11=e.total11 ?? ((e.in10||0)+(e.king?1:0));
      const tTxt=(e.throwsUsed!=null)?` | kolíky: ${e.throwsUsed}`:'';
      preview.textContent = (e.in10===10)
        ? `${dateStr} – 8+2 Classic | v10: 10 ${e.king?'+ král':'+ král NE'} → ${v11}/11${tTxt}`
        : `${dateStr} – 8+2 Classic | v10: ${e.in10}/10 → ${v11}/11${tTxt}`;
    } else if (e.mode==='unlimited'){
      preview.textContent = e.dnf ? `${dateStr} – 8+2 Unlimited | DNF` : `${dateStr} – 8+2 Unlimited | Zavřeno na ${e.pinsToClose} kolících`;
    } else preview.textContent = `${dateStr} – 8+2`;
  } else preview.textContent = `${dateStr} – záznam`;
}
function clearHistoryPreview(){ const p=document.getElementById('history-preview'); if (p) p.textContent='Vyber uživatele, abys viděl poslední záznam.'; }

const openHistoryBtn=document.getElementById('open-history-btn');
const historyFilterSelect=document.getElementById('history-filter');
const historyPageSizeSelect=document.getElementById('history-page-size');
const historyLoadMoreBtn=document.getElementById('history-load-more');
const historyInfoSpan=document.getElementById('history-info');

openHistoryBtn?.addEventListener('click', ()=>{
  if (!currentUser){ alert('Vyber nejdříve uživatele.'); return; }
  document.getElementById('history-modal-user').textContent=currentUser;
  historyVisibleCount=parsePageSize(historyPageSizeSelect?.value);
  historyFilter=historyFilterSelect?.value||'all';
  openModal('history-modal'); renderHistoryModal(currentUser);
});
historyFilterSelect?.addEventListener('change',()=>{ historyFilter=historyFilterSelect.value; historyVisibleCount=parsePageSize(historyPageSizeSelect.value); renderHistoryModal(currentUser); });
historyPageSizeSelect?.addEventListener('change',()=>{ historyVisibleCount=parsePageSize(historyPageSizeSelect.value); renderHistoryModal(currentUser); });
historyLoadMoreBtn?.addEventListener('click',()=>{ if(historyPageSizeSelect.value==='all') return; historyVisibleCount += parseInt(historyPageSizeSelect.value,10)||30; renderHistoryModal(currentUser); });

function parsePageSize(val){ return (val==='all')?Infinity:parseInt(val||'30',10); }
function renderHistoryModal(userName){
  const users=loadUsers(); const user=users.find(u=>u.name===userName);
  const list=document.getElementById('history-list'); list.innerHTML='';
  if (!user||!user.history||user.history.length===0){ list.textContent='Žádná historie.'; historyInfoSpan.textContent=''; historyLoadMoreBtn?.setAttribute('disabled','disabled'); return; }
  let all=user.history.slice().reverse();
  if (historyFilter==='8m') all=all.filter(e=>e.type==='8m');
  else if (historyFilter==='8p2Classic') all=all.filter(e=>e.type==='8+2'&&e.mode==='classic');
  else if (historyFilter==='8p2Unlimited') all=all.filter(e=>e.type==='8+2'&&e.mode==='unlimited');
  const slice=all.slice(0, Math.min(historyVisibleCount, all.length));
  slice.forEach(e=>{
    const div=document.createElement('div'); const dateStr=new Date(e.date).toLocaleString();
    if (e.type==='8m'){
      const hits=e.totalHit ?? e.training?.reduce((a,c)=>a+c.hit,0) ?? 0;
      const thr =e.totalThrows ?? e.training?.reduce((a,c)=>a+c.throws,0) ?? 0;
      const suc =thr?Math.round(hits/thr*100):0; const cnt=e.training?e.training.length:0;
      div.textContent = `${dateStr} – 8m | Série: ${cnt}, Shozeno: ${hits}, Hodů: ${thr}, Úspěšnost: ${suc}%`;
    } else if (e.type==='8+2') {
      if (e.mode==='classic'){
        const v11=e.total11 ?? ((e.in10||0)+(e.king?1:0));
        const tTxt=(e.throwsUsed!=null)?` | kolíky: ${e.throwsUsed}`:'';
        div.textContent = (e.in10===10)
          ? `${dateStr} – 8+2 Classic | v10: 10 ${e.king?'+ král':'+ král NE'} → ${v11}/11${tTxt}`
          : `${dateStr} – 8+2 Classic | v10: ${e.in10}/10 → ${v11}/11${tTxt}`;
      } else if (e.mode==='unlimited'){
        div.textContent = e.dnf ? `${dateStr} – 8+2 Unlimited | DNF` : `${dateStr} – 8+2 Unlimited | Zavřeno na ${e.pinsToClose} kolících`;
      } else div.textContent = `${dateStr} – 8+2`;
    } else div.textContent = `${dateStr} – záznam`;
    list.appendChild(div);
  });
  const showing=Math.min(slice.length, all.length); historyInfoSpan.textContent=`Zobrazuji ${showing} z ${all.length}`;
  if (historyLoadMoreBtn){ if (slice.length>=all.length || historyPageSizeSelect.value==='all') historyLoadMoreBtn.setAttribute('disabled','disabled'); else historyLoadMoreBtn.removeAttribute('disabled'); }
}

// ====== MODAL infra ======
function openModal(id){ const m=document.getElementById(id); if (!m) return; m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
function closeModal(id){ const m=document.getElementById(id); if (!m) return; m.classList.remove('show'); m.setAttribute('aria-hidden','true'); }
document.addEventListener('click',(e)=>{ if (e.target?.getAttribute?.('data-dismiss')==='history-modal') closeModal('history-modal'); });
document.addEventListener('keydown',(e)=>{ if (e.key==='Escape') closeModal('history-modal'); });

// ====== STATISTIKY v1.04 ======
// Filtr dle rozsahu
function filterHistoryByRange(history, range){
  if (!Array.isArray(history)) return [];
  if (range==='all') return history.slice();
  const now=Date.now(); const ms=(range==='7d')?7*24*3600*1000:30*24*3600*1000; const from=now-ms;
  return history.filter(e=>{ const t=new Date(e.date).getTime(); return !isNaN(t)&&t>=from&&t<=now; });
}

// Výpočet metrik
function computeStats(history){
  const out={
    m8m: { sessions:0, avgAcc:0, bestAcc:0, seriesAcc:[] },
    c82: { sessions:0, avgV10:0, avgV11:0, bestV11:0, bestV11MinPins:null, kingAsk:0, kingHit:0, avgThrowsUsed:null, distV11: new Array(12).fill(0), trendV11:[] },
    u82: { sessions:0, avgPins:null, bestPins:null, dnf:0, distPins: new Array(17).fill(0), trendPins:[] } // pins 4..20 => 17 bucketů
  };
  if (!history?.length) return out;

  const v10Vals=[]; const v11Vals=[]; const v11Trend=[];
  const pinsVals=[]; const pinsTrend=[];

  const hSorted = history.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));

  let totalHits=0,totalThrows=0;
  let throwsSum=0, throwsCount=0;

  hSorted.forEach(e=>{
    if (e.type==='8m'){
      const hits=e.totalHit ?? (e.training?.reduce((a,c)=>a+(c.hit||0),0)||0);
      const thr =e.totalThrows ?? (e.training?.reduce((a,c)=>a+(c.throws||0),0)||0);
      const acc = thr ? Math.round(hits/thr*100) : 0;
      out.m8m.sessions++; totalHits+=hits; totalThrows+=thr; out.m8m.bestAcc=Math.max(out.m8m.bestAcc, acc); out.m8m.seriesAcc.push(acc);
    }
    if (e.type==='8+2' && e.mode==='classic'){
      const in10 = e.in10 ?? 0;
      const v11  = e.total11 != null ? e.total11 : (in10 + (e.king?1:0));
      out.c82.sessions++;

      v10Vals.push(in10); v11Vals.push(v11); v11Trend.push(v11);
      out.c82.bestV11 = Math.max(out.c82.bestV11, v11);
      if (v11===out.c82.bestV11 && e.throwsUsed!=null){
        if (out.c82.bestV11MinPins==null || e.throwsUsed<out.c82.bestV11MinPins) out.c82.bestV11MinPins = e.throwsUsed;
      }
      if (e.throwsUsed!=null){ throwsSum+=e.throwsUsed; throwsCount++; }

      // distribuce v11 (0..11)
      if (v11>=0 && v11<=11) out.c82.distV11[v11]++;

      // king rate, jen když padlo 10/10
      if (in10===10){ out.c82.kingAsk++; if (e.king) out.c82.kingHit++; }
    }
    if (e.type==='8+2' && e.mode==='unlimited'){
      out.u82.sessions++;
      if (e.dnf){ out.u82.dnf++; pinsTrend.push(null); }
      else if (e.pinsToClose!=null){
        const p=e.pinsToClose; pinsVals.push(p); pinsTrend.push(p);
        out.u82.bestPins = (out.u82.bestPins==null)?p:Math.min(out.u82.bestPins, p);
        // distribuce 4..20
        if (p>=4 && p<=20) out.u82.distPins[p-4]++;
      }
    }
  });

  out.m8m.avgAcc = totalThrows ? Math.round((totalHits/totalThrows)*100) : 0;

  if (v10Vals.length) out.c82.avgV10 = (v10Vals.reduce((a,b)=>a+b,0)/v10Vals.length).toFixed(2);
  if (v11Vals.length) out.c82.avgV11 = (v11Vals.reduce((a,b)=>a+b,0)/v11Vals.length).toFixed(2);
  if (throwsCount) out.c82.avgThrowsUsed = (throwsSum/throwsCount).toFixed(2);

  if (pinsVals.length){
    out.u82.avgPins = (pinsVals.reduce((a,b)=>a+b,0)/pinsVals.length).toFixed(2);
  }

  // Trendy – posledních 12 hodnot (ať jsou sloupky čitelné)
  out.c82.trendV11 = v11Trend.slice(-12);
  out.u82.trendPins = pinsTrend.slice(-12);

  // Oříznout 8m série na posledních 20
  out.m8m.seriesAcc = out.m8m.seriesAcc.slice(-20);

  return out;
}

// Mini bar chart komponenty
function miniBars(values, {min=null, max=null, invert=false, highlightLast=true}={}){
  const v = values.slice();
  const filtered = v.filter(x => x!=null);
  if (!filtered.length) return `<div class="mbars"></div>`;

  const lo = (min!=null) ? min : Math.min(...filtered);
  const hi = (max!=null) ? max : Math.max(...filtered);
  const span = (hi-lo)||1;

  const bars = v.map((val, i)=>{
    if (val==null) return `<div class="mbar" style="height:2px; opacity:.35;"></div>`;
    const norm = (val - lo) / span;
    const h = 8 + Math.round(norm * 34); // 8..42px
    const cls = (highlightLast && i===v.length-1) ? 'mbar mbar--a' : 'mbar mbar--ok';
    // invert = u Unlimited (méně je lépe) → vyšší sloupec pro lepší výkon
    const hh = invert ? 8 + Math.round((1-norm)*34) : h;
    return `<div class="${cls}" style="height:${hh}px"></div>`;
  });

  return `<div class="mbars">${bars.join('')}</div>`;
}

function distributionBars(buckets, {labels=[], maxHeight=42}={}){
  const max = Math.max(1, ...buckets);
  const bars = buckets.map((n, idx)=>{
    const h = Math.round((n/max) * maxHeight);
    return `<div class="mbar" title="${labels[idx]||idx}: ${n}" style="height:${Math.max(4,h)}px"></div>`;
  });
  return `<div>${`<div class="mbars">${bars.join('')}</div>`}${labels.length?`<div class="axis">${axisLabels(labels)}</div>`:''}</div>`;
}
function axisLabels(labels){
  if (labels.length<=1) return '';
  // Zobrazíme několik významných značek (např. 0, 5, 10, 11)
  const picks = [0, Math.floor(labels.length/2), labels.length-1];
  const uniq = Array.from(new Set(picks)).sort((a,b)=>a-b);
  return uniq.map(i=>`<span>${labels[i]}</span>`).join('');
}

// Vykreslení statistik
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

  // 8m trend
  const bars8m = miniBars(s.m8m.seriesAcc, {min:0, max:100, invert:false});
  // 8+2 Classic – trend a distribuce (0..11)
  const cTrend = miniBars(s.c82.trendV11, {min:0, max:11, invert:false});
  const cDist  = distributionBars(s.c82.distV11, {labels:[0,1,2,3,4,5,6,7,8,9,10,11]});
  // 8+2 Unlimited – trend (méně je lépe) a distribuce (4..20)
  const uTrend = miniBars(s.u82.trendPins, {min:4, max:20, invert:true});
  const uDist  = distributionBars(s.u82.distPins, {labels:[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]});

  const kingRate = s.c82.kingAsk ? Math.round((s.c82.kingHit/s.c82.kingAsk)*100) : 0;

  root.innerHTML = `
    <div class="stat-grid">

      <div class="stat-card">
        <h3>8m</h3>
        <div class="stat-row"><span class="stat-key">Tréninků</span><span>${s.m8m.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">Průměrná úspěšnost</span><span>${s.m8m.avgAcc}%</span></div>
        <div class="stat-row"><span class="stat-key">Nejlepší úspěšnost</span><span>${s.m8m.bestAcc}%</span></div>
        <div class="stat-row"><span class="stat-key">Trend (posl.)</span><span class="muted">${s.m8m.seriesAcc.length}</span></div>
        ${bars8m}
      </div>

      <div class="stat-card">
        <h3>8+2 Classic</h3>
        <div class="stat-row"><span class="stat-key">Záznamů</span><span>${s.c82.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">Průměr v10</span><span>${s.c82.avgV10}</span></div>
        <div class="stat-row"><span class="stat-key">Průměr v11</span><span>${s.c82.avgV11}</span></div>
        <div class="stat-row"><span class="stat-key">Nejlepší v11</span><span>${s.c82.bestV11}${s.c82.bestV11MinPins!=null?` (kolíky: ${s.c82.bestV11MinPins})`:''}</span></div>
        <div class="stat-row"><span class="stat-key">King rate (při 10/10)</span><span>${kingRate}%</span></div>
        <div class="stat-row"><span class="stat-key">Ø kolíky / série</span><span>${s.c82.avgThrowsUsed ?? '–'}</span></div>
        <div class="stat-row"><span class="stat-key">Trend v11</span><span class="muted">${s.c82.trendV11.length}</span></div>
        ${cTrend}
        <div class="stat-row" style="margin-top:.4rem;"><span class="stat-key">Distribuce v11 (0–11)</span><span></span></div>
        ${cDist}
      </div>

      <div class="stat-card">
        <h3>8+2 Unlimited</h3>
        <div class="stat-row"><span class="stat-key">Záznamů</span><span>${s.u82.sessions}</span></div>
        <div class="stat-row"><span class="stat-key">DNF</span><span>${s.u82.dnf}</span></div>
        <div class="stat-row"><span class="stat-key">Průměr kolíků</span><span>${s.u82.avgPins ?? '–'}</span></div>
        <div class="stat-row"><span class="stat-key">Nejlépe zavřeno</span><span>${s.u82.bestPins ?? '–'}</span></div>
        <div class="stat-row"><span class="stat-key">Trend kolíků</span><span class="muted">${s.u82.trendPins.length}</span></div>
        ${uTrend}
        <div class="stat-row" style="margin-top:.4rem;"><span class="stat-key">Distribuce kolíků (4–20)</span><span></span></div>
        ${uDist}
      </div>

    </div>
  `;
}

function clearStatsView(){
  const root=document.getElementById('stats'); const note=document.getElementById('stats-note');
  if (root) root.innerHTML='<div style="opacity:.7;">Vyber uživatele, zobrazí se souhrny pro 8m, 8+2 Classic a 8+2 Unlimited.</div>';
  if (note) note.textContent='';
}

// ====== INIT ======
renderUserList();
