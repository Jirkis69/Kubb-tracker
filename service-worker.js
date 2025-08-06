// --- Základní proměnné ---
let trainingType = '8m'; // nebo '8+2'
let maxKubbs = 10; // max počet kubbů k shození (0-10)
let stakesCount = 6; // počet kolíků pro hod
let kingShotted = false;

const kubbsInput = document.getElementById('kubbsShooted');
const stakesInput = document.getElementById('stakesCount');
const kingCheckbox = document.getElementById('kingShooted');
const trainingSelect = document.getElementById('trainingType');
const saveBtn = document.getElementById('saveResult');
const historyList = document.getElementById('historyList');

// --- Funkce pro aktualizaci UI podle typu tréninku ---
function updateUI() {
  if (trainingType === '8+2') {
    maxKubbs = 10;
    stakesCount = 6;
    stakesInput.value = stakesCount;
    stakesInput.disabled = true; // ve 8+2 nelze měnit kolíky
  } else {
    maxKubbs = 6;
    stakesCount = parseInt(stakesInput.value) || 6;
    stakesInput.disabled = false;
  }
  kubbsInput.max = maxKubbs;
  // Kral se může střílet jen když je shozeno 10 kubbů
  kingCheckbox.disabled = !(parseInt(kubbsInput.value) === maxKubbs);
  if (kingCheckbox.disabled) kingCheckbox.checked = false;
}

// --- Eventy ---
trainingSelect.addEventListener('change', e => {
  trainingType = e.target.value;
  updateUI();
});

kubbsInput.addEventListener('input', e => {
  // Povolit krále jen pokud shozeno max kubbů
  kingCheckbox.disabled = !(parseInt(e.target.value) === maxKubbs);
  if (kingCheckbox.disabled) kingCheckbox.checked = false;
});

stakesInput.addEventListener('input', e => {
  let val = parseInt(e.target.value);
  if (val < 1) stakesInput.value = 1;
  if (val > 6) stakesInput.value = 6;
  stakesCount = parseInt(stakesInput.value);
});

saveBtn.addEventListener('click', () => {
  const kubbs = parseInt(kubbsInput.value);
  const stakes = stakesCount;
  const king = kingCheckbox.checked;

  if (isNaN(kubbs) || kubbs < 0 || kubbs > maxKubbs) {
    alert(`Zadej počet shozených kubbů mezi 0 a ${maxKubbs}`);
    return;
  }

  // Kral lze střílet pouze pokud shozeno max kubbů (10 nebo 6)
  if (king && kubbs !== maxKubbs) {
    alert('Král může být shozen pouze pokud bylo shozeno všech 10 (nebo 6) kubbů.');
    return;
  }

  // Uložení výsledku do historie (localStorage)
  let history = JSON.parse(localStorage.getItem('kubbHistory')) || [];
  const result = {
    date: new Date().toISOString(),
    trainingType,
    kubbs,
    stakes,
    king,
  };
  history.push(result);
  localStorage.setItem('kubbHistory', JSON.stringify(history));

  // Přidání do seznamu historie na stránce
  addHistoryItem(result);

  // Vyčistit formulář (volitelně)
  kubbsInput.value = 0;
  kingCheckbox.checked = false;
  updateUI();
});

// --- Přidání výsledku do historie v UI ---
function addHistoryItem(item) {
  const li = document.createElement('li');
  li.textContent = `${new Date(item.date).toLocaleString()} — Typ: ${item.trainingType}, Kubbs: ${item.kubbs}, Kolíky: ${item.stakes}, Král: ${item.king ? 'ano' : 'ne'}`;
  historyList.appendChild(li);
}

// --- Načtení historie při startu ---
function loadHistory() {
  const history = JSON.parse(localStorage.getItem('kubbHistory')) || [];
  historyList.innerHTML = '';
  history.forEach(addHistoryItem);
}

// --- Inicializace ---
updateUI();
loadHistory();
