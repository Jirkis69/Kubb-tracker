// --- Service Worker registrace s automatickou aktualizací ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(registration => {
      console.log('[ServiceWorker] Registrace OK:', registration);

      // Když je nalezena nová verze SW
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              // Pokud už stránka používá SW a objeví se nová verze
              if (navigator.serviceWorker.controller) {
                console.log('[ServiceWorker] Nová verze dostupná – přepínám...');
                newWorker.postMessage({ action: 'skipWaiting' });
                window.location.reload();
              }
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

    // Při kliknutí vybere uživatele
    nameSpan.onclick = () => {
      if (currentTraining.length > 0) {
        if (!confirm('Probíhá aktuální trénink, opravdu chceš změnit uživatele? Aktuální trénink bude ztracen.')) {
          return;
        }
        currentTraining = [];
        updateCurrentTrainingSummary();
        document.getElementById('current-training-summary').style.display = 'none';
      }
      currentUser = user.name;
      document.getElementById('current-user-name').textContent = currentUser;
      renderHistory(currentUser);
      resetThrowsInput();
    };

    // Tlačítko smazat uživatele
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Smazat';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Opravdu smazat uživatele "${user.name}"?`)) {
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

// Nastavení klikání na tlačítka "shozených kubbů"
const hitButtons = document.querySelectorAll('.hit-btn');
hitButtons.forEach(btn => {
  btn.onclick = () => {
    if (!currentUser) {
      alert('Vyber nejdříve uživatele.');
      return;
    }
    const selectedHits = parseInt(btn.getAttribute('data-value'));
    let throwsInput = document.getElementById('throws-input');
    let throws = parseInt(throwsInput.value);
    if (isNaN(throws) || throws < 1) throws = 6;
    if (throws > 6) throws = 6;

    // Pokud je 5 shozeno, nastav hodů na 5
    if (selectedHits === 5 && throws !== 5) {
      throws = 5;
      throwsInput.value = 5;
    }

    currentTraining.push({
      hit: selectedHits,
      throws: throws,
      timestamp: new Date().toISOString()
    });

    updateCurrentTrainingSummary();
    resetThrowsInput();

    // Označí vybrané tlačítko a zruší označení u ostatních
    hitButtons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

// Reset hodnoty počtu hodů na 6
function resetThrowsInput() {
  const throwsInput = document.getElementById('throws-input');
  throwsInput.value = 6;
}

// Aktualizuje zobrazení aktuálního tréninku
function updateCurrentTrainingSummary() {
  if (currentTraining.length === 0) {
    document.getElementById('current-training-summary').style.display = 'none';
    return;
  }
  document.getElementById('current-training-summary').style.display = 'block';

  const seriesCount = currentTraining.length;
  const totalHit = currentTraining.reduce((acc, cur) => acc + cur.hit, 0);
  const totalThrows = currentTraining.reduce((acc, cur) => acc + cur.throws, 0);
  const successRate = totalThrows > 0 ? Math.round((totalHit / totalThrows) * 100) : 0;

  document.getElementById('series-count').textContent = seriesCount;
  document.getElementById('total-hit').textContent = totalHit;
  document.getElementById('total-throws').textContent = totalThrows;
  document.getElementById('success-rate').textContent = successRate;
}

// Ukončení tréninku - uloží trénink do historie uživatele
document.getElementById('end-training-btn').onclick = () => {
  if (!currentUser) {
    alert('Vyber nejdříve uživatele.');
    return;
  }
  if (currentTraining.length === 0) {
    alert('Trénink je prázdný.');
    return;
  }
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.name === currentUser);
  if (userIndex === -1) {
    alert('Uživatel nebyl nalezen.');
    return;
  }
  users[userIndex].history.push({
    date: new Date().toISOString(),
    training: currentTraining
  });
  saveUsers(users);
  currentTraining = [];
  updateCurrentTrainingSummary();
  alert('Trénink uložen.');
  renderHistory(currentUser);
};

// Vykreslí historii tréninků pro zvoleného uživatele
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
    let sumHits = session.training.reduce((acc, cur) => acc + cur.hit, 0);
    let sumThrows = session.training.reduce((acc, cur) => acc + cur.throws, 0);
    let success = sumThrows > 0 ? Math.round((sumHits / sumThrows) * 100) : 0;

    div.textContent = `${dateStr} - Série: ${session.training.length}, Shozeno: ${sumHits}, Hodů: ${sumThrows}, Úspěšnost: ${success}%`;
    historyDiv.appendChild(div);
  });
}

// Vyčistí historii zobrazení
function clearHistoryView() {
  document.getElementById('history-list').innerHTML = 'Vyber uživatele, abys viděl historii.';
}

// Vrátí poslední zaznamenanou sérii z aktuálního tréninku
document.getElementById('undo-last-series-btn').onclick = () => {
  if (currentTraining.length === 0) {
    alert('Žádná série k vrácení.');
    return;
  }
  currentTraining.pop();
  updateCurrentTrainingSummary();
};

// Načtení a vykreslení uživatelů při startu
renderUserList();
