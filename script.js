// --- Service Worker registrace s automatickou aktualizací ---
const CACHE_VERSION = 'v4';
document.body.insertAdjacentHTML('beforeend', `<div id="cache-version">Cache verze: ${CACHE_VERSION}</div>`);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(registration => {
      console.log('[ServiceWorker] Registrace OK:', registration);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[ServiceWorker] Nová verze dostupná – přepínám...');
              newWorker.postMessage({ action: 'skipWaiting' });
              window.location.reload();
            }
          });
        }
      });
    }).catch(err => {
      console.error('[ServiceWorker] Chyba při registraci SW:', err);
    });
  });
}

let currentUser = null;
let currentTraining = [];

// Načte uživatele z localStorage
function loadUsers() {
  const usersJSON = localStorage.getItem('kubbUsers');
  return usersJSON ? JSON.parse(usersJSON) : [];
}

// Uloží uživatele do localStorage
function saveUsers(users) {
  localStorage.setItem('kubbUsers', JSON.stringify(users));
}

// Vykreslí seznam uživatelů
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
      renderHistory(currentUser);
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
          clearHistoryView();
        }
      }
    };

    userDiv.appendChild(nameSpan);
    userDiv.appendChild(deleteBtn);

    userListDiv.appendChild(userDiv);
  });
}

// Přidání nového uživatele
document.getElementById('add-user-btn').onclick = () => {
  const input = document.getElementById('user-name-input');
  const name = input.value.trim();
  if (!name) {
    alert('Zadej jméno uživatele.');
    return;
  }
  const users = loadUsers();
  if (users.find(u => u.name === name)) {
    alert('Uživatel s tímto jménem již existuje.');
    return;
  }
  users.push({ name: name, history: [] });
  saveUsers(users);
  input.value = '';
  renderUserList();
};

// Tlačítka pro počet shozených kubbů
const hitButtons = document.querySelectorAll('.hit-btn');
hitButtons.forEach(btn => {
  btn.onclick = () => {
    if (!currentUser) {
      alert('Nejdříve vyber uživatele.');
      return;
}

const selectedHits = parseInt(btn.getAttribute('data-value'));
let throwsInput = document.getElementById('throws-input');
let throws = parseInt(throwsInput.value);

if (isNaN(throws) || throws < 1) {
  throws = 6;
  throwsInput.value = 6;
}
if (throws > 6) {
  throws = 6;
  throwsInput.value = 6;
}


    currentTraining.push({ hit: selectedHits, throws, timestamp: new Date().toISOString() });

    updateCurrentTrainingSummary();
    resetThrowsInput();

    hitButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

function resetThrowsInput() {
  document.getElementById('throws-input').value = 6;
}

// Zobrazení aktuálního tréninku
function updateCurrentTrainingSummary() {
  const summary = document.getElementById('current-training-summary');
  if (currentTraining.length === 0) {
    summary.style.display = 'none';
    return;
  }
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

// Uložení tréninku
document.getElementById('end-training-btn').onclick = () => {
  if (!currentUser) {
    alert('Vyber uživatele.');
    return;
  }
  if (currentTraining.length === 0) {
    alert('Trénink je prázdný.');
    return;
  }
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.name === currentUser);
  if (userIndex === -1) {
    alert('Uživatel nenalezen.');
    return;
  }

  const totalHit = currentTraining.reduce((acc, cur) => acc + cur.hit, 0);
  const totalThrows = currentTraining.reduce((acc, cur) => acc + cur.throws, 0);
  const successRate = totalThrows > 0 ? Math.round((totalHit / totalThrows) * 100) : 0;

  users[userIndex].history.push({
    date: new Date().toISOString(),
    training: currentTraining,
    totalHit,
    totalThrows,
    successRate
  });

  saveUsers(users);
  currentTraining = [];
  updateCurrentTrainingSummary();
  alert('Trénink uložen.');
  renderHistory(currentUser);
};

// Historie tréninků
function renderHistory(userName) {
  const users = loadUsers();
  const user = users.find(u => u.name === userName);
  const historyDiv = document.getElementById('history-list');
  if (!user || !user.history || user.history.length === 0) {
    historyDiv.innerHTML = 'Žádná historie.';
    return;
  }

  historyDiv.innerHTML = '';
  user.history.slice().reverse().forEach(session => {
    const div = document.createElement('div');
    const dateStr = new Date(session.date).toLocaleString();
    div.textContent = `${dateStr} – Série: ${session.training.length}, Shozeno: ${session.totalHit}, Hodů: ${session.totalThrows}, Úspěšnost: ${session.successRate}%`;

    // Klik pro podrobnosti
    div.style.cursor = 'pointer';
    div.onclick = () => {
      alert(session.training.map((s, i) => `Série ${i + 1}: ${s.hit}/${s.throws}`).join('\n'));
    };

    historyDiv.appendChild(div);
  });
}

function clearHistoryView() {
  document.getElementById('history-list').innerHTML = 'Vyber uživatele pro zobrazení historie.';
}

document.getElementById('undo-last-series-btn').onclick = () => {
  if (currentTraining.length === 0) {
    alert('Žádná série k vrácení.');
    return;
  }
  currentTraining.pop();
  updateCurrentTrainingSummary();
};

renderUserList();
