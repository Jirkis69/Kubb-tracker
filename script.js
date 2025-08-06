// --- Výběr elementů ---
const mode8mBtn = document.getElementById('mode8m');
const mode8plus2Btn = document.getElementById('mode8plus2');
const throwsCountEl = document.getElementById('throwsCount');
const kubbCountEl = document.getElementById('kubbCount');
const kingContainer = document.getElementById('kingContainer');
const kingDownEl = document.getElementById('kingDown');
const saveResultBtn = document.getElementById('saveResult');
const resetThrowsBtn = document.getElementById('resetThrows');
const historyBtn = document.getElementById('historyBtn');
const statsBtn = document.getElementById('statsBtn');
const historySection = document.getElementById('historySection');
const statsSection = document.getElementById('statsSection');
const trainingSection = document.getElementById('training');
const historyList = document.getElementById('historyList');
const searchHistory = document.getElementById('searchHistory');
const filterType = document.getElementById('filterType');
const filterDate = document.getElementById('filterDate');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');

// --- Proměnné ---
let currentMode = "8m";
let throwsLeft = 6;

// --- Přepínání režimů ---
mode8mBtn.addEventListener('click', () => {
  currentMode = "8m";
  throwsLeft = 6;
  throwsCountEl.textContent = throwsLeft;
  kubbCountEl.max = 10;
  kubbCountEl.value = 0;
  kingContainer.style.display = "none";
});

mode8plus2Btn.addEventListener('click', () => {
  currentMode = "8+2";
  throwsLeft = 6;
  throwsCountEl.textContent = throwsLeft;
  kubbCountEl.max = 10;
  kubbCountEl.value = 0;
  kingDownEl.checked = false;
  kingContainer.style.display = "none";
});

// --- Zobrazení možnosti krále jen při 10 kubbech ---
kubbCountEl.addEventListener('input', () => {
  if (parseInt(kubbCountEl.value) === 10 && currentMode === "8+2") {
    kingContainer.style.display = "block";
  } else {
    kingContainer.style.display = "none";
    kingDownEl.checked = false;
  }
});

// --- Uložení výsledku ---
saveResultBtn.addEventListener('click', () => {
  const kubbs = parseInt(kubbCountEl.value) || 0;
  const king = kingDownEl.checked;
  const date = new Date().toISOString();

  const record = {
    date,
    trainingType: currentMode,
    kubbs,
    king,
    throws: throwsLeft
  };

  const history = JSON.parse(localStorage.getItem('kubbHistory')) || [];
  history.push(record);
  localStorage.setItem('kubbHistory', JSON.stringify(history));

  loadHistory();
  alert("Výsledek uložen");
});

// --- Reset kolíků ---
resetThrowsBtn.addEventListener('click', () => {
  throwsLeft = 6;
  throwsCountEl.textContent = throwsLeft;
});

// --- Historie ---
function addHistoryItem(item) {
  const li = document.createElement('li');
  li.textContent = `${new Date(item.date).toLocaleString()} - ${item.trainingType} - ${item.kubbs} kubbů${item.king ? " + král" : ""}`;
  historyList.appendChild(li);
}

function loadHistory() {
  historyList.innerHTML = '';
  const history = JSON.parse(localStorage.getItem('kubbHistory')) || [];
  history.forEach(addHistoryItem);
}

searchHistory.addEventListener('input', () => {
  const query = searchHistory.value.toLowerCase();
  const history = JSON.parse(localStorage.getItem('kubbHistory')) || [];
  historyList.innerHTML = '';
  history
    .filter(item => JSON.stringify(item).toLowerCase().includes(query))
    .forEach(addHistoryItem);
});

// --- Filtr historie ---
function filterHistory() {
  let history = JSON.parse(localStorage.getItem('kubbHistory')) || [];

  if (filterType.value !== 'all') {
    history = history.filter(item => item.trainingType === filterType.value);
  }

  if (filterDate.value) {
    const filterTime = new Date(filterDate.value).getTime();
    history = history.filter(item => new Date(item.date).getTime() >= filterTime);
  }

  historyList.innerHTML = '';
  history.forEach(addHistoryItem);
}

filterType.addEventListener('change', filterHistory);
filterDate.addEventListener('change', filterHistory);

// --- Export ---
exportBtn.addEventListener('click', () => {
  const data = localStorage.getItem('kubbHistory');
  if (!data) {
    alert('Žádná data k exportu');
    return;
  }
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kubb_history.json';
  a.click();
  URL.revokeObjectURL(url);
});

// --- Import ---
importFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const imported = JSON.parse(evt.target.result);
      if (!Array.isArray(imported)) throw new Error();
      localStorage.setItem('kubbHistory', JSON.stringify(imported));
      loadHistory();
      filterHistory();
      alert('Data byla naimportována');
    } catch {
      alert('Neplatný formát souboru');
    }
  };
  reader.readAsText(file);
});

// --- Přepínání sekcí ---
historyBtn.addEventListener('click', () => {
  trainingSection.style.display = "none";
  statsSection.style.display = "none";
  historySection.style.display = "block";
  loadHistory();
});

statsBtn.addEventListener('click', () => {
  trainingSection.style.display = "none";
  historySection.style.display = "none";
  statsSection.style.display = "block";
});

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
});
