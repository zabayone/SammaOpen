import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { abbreviaNome } from "./script.js";
import { nameToPlayerId, getConfig } from "./server.js";

/* Firebase init */
const firebaseConfig = {
  apiKey: "AIzaSyCqINXR7uKQw5edv6lic-8Xcdlx9PyJAKU",
  authDomain: "samma-open.firebaseapp.com",
  projectId: "samma-open",
  storageBucket: "samma-open.appspot.com",
  messagingSenderId: "203807765703",
  appId: "1:203807765703:web:9923f6766f510de4993ae2"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

/* Boot */
document.addEventListener('DOMContentLoaded', () => {
  const isStats = document.getElementById('player-name') || document.getElementById('eloChart');
  if (isStats) loadPlayerData().catch(console.error);
});

const urlParams = new URLSearchParams(window.location.search);
const playerName = decodeURIComponent(urlParams.get("name") || "");
const titleEl = document.getElementById("player-name");
if (titleEl) titleEl.textContent = `Statistiche: ${abbreviaNome(playerName)}`;

const containerSingles = document.getElementById("matchlist-singles");
const containerDoubles = document.getElementById("matchlist-doubles");

/* ===== Chart.js ===== */
let eloChartInstance = null;
function drawEloChart(labels, singlesValues, doublesValues = []) {
    const canvas = document.getElementById('eloChart');
    if (!canvas) return;
    
    // Forza dimensioni canvas
    canvas.style.width = '100%';
    canvas.style.height = '280px';
    
    const ctx = canvas.getContext('2d');
    
    // Distruggi grafico precedente
    if (eloChartInstance) {
        eloChartInstance.destroy();
        eloChartInstance = null;
    }
    
    const datasets = [];
    
    if (Array.isArray(singlesValues) && singlesValues.length) {
        datasets.push({
            label: 'ELO Singolo',
            data: singlesValues,
            borderColor: '#ff6b35',
            backgroundColor: 'rgba(255,107,53,0.15)',
            tension: 0.25,
            pointRadius: 3, // Aumentato per visibilità
            fill: false
        });
    }
    
    if (Array.isArray(doublesValues) && doublesValues.length) {
        datasets.push({
            label: 'ELO Doppio',
            data: doublesValues,
            borderColor: '#2b7a78',
            backgroundColor: 'rgba(43,122,120,0.15)',
            tension: 0.25,
            pointRadius: 3, // Aumentato per visibilità
            fill: false
        });
    }
    
    if (!labels?.length || datasets.length === 0) return;
    
    eloChartInstance = new Chart(ctx, {
        type: 'line',
        data:{
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    min: Math.min(...singlesValues, ...doublesValues) - 50,
                    max: Math.max(...singlesValues, ...doublesValues) + 50,
                    beginAtZero: false,
                    grid: {
                        display: true,
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}


/* ===== Helper set ===== */
function parseSets(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(s => String(s ?? '').trim())
    .filter(Boolean)
    .map(s => {
      const [a, b] = s.split('-').map(n => parseInt(n, 10));
      return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
    })
    .filter(Boolean); // [[a,b], ...]
}

/* Grid score: colonne=set, righe=team(A=top, B=bottom) */
function buildScoreGrid(setsParsed) {
  // wrapper griglia: tante colonne quanti set, 2 righe (A sopra, B sotto)
  const grid = document.createElement('div');
  grid.className = 'scores-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateRows = 'auto auto';            // righe: A, B
  grid.style.gridTemplateColumns = `repeat(${setsParsed.length}, auto)`; // colonne: set 1..N
  grid.style.gap = '6px 10px'; // row-gap col-gap

  setsParsed.forEach(([a, b], idx) => {
    // cella Team A (riga 1, col idx+1)
    const cellA = document.createElement('div');
    cellA.className = 'score-set';
    cellA.textContent = String(a);
    if (a > b) cellA.classList.add('winner-set');
    cellA.style.gridRow = '1';
    cellA.style.gridColumn = String(idx + 1);

    // cella Team B (riga 2, col idx+1)
    const cellB = document.createElement('div');
    cellB.className = 'score-set';
    cellB.textContent = String(b);
    if (b > a) cellB.classList.add('winner-set');
    cellB.style.gridRow = '2';
    cellB.style.gridColumn = String(idx + 1);

    grid.appendChild(cellA);
    grid.appendChild(cellB);
  });

  return grid;
}

/* ===== Render match ===== */
function renderMatchBox(m, pid, namesById) {
  const getName = (id) => namesById[id] || id;
  const teamA = m.participants.filter(p => p.team === 0).map(p => getName(p.pid));
  const teamB = m.participants.filter(p => p.team === 1).map(p => getName(p.pid));

  const teamAAbbr = teamA.map(abbreviaNome).join(' & ');
  const teamBAbbr = teamB.map(abbreviaNome).join(' & ');

  const youInA = teamA.some(n => n === getName(pid));
  const winOverall = (m.winnerTeam === 0 && youInA) || (m.winnerTeam === 1 && !youInA);

  const box = document.createElement('div');
  box.className = 'match-box ' + (winOverall ? 'match-win' : 'match-lose');

  const content = document.createElement('div');
  content.className = 'match-content';

  // Nomi a sinistra
  const playersSection = document.createElement('div');
  playersSection.className = 'players-section';

  const rowA = document.createElement('div');
  rowA.className = 'player-row';
  rowA.innerHTML = `
    <div class="player-initial">${teamAAbbr.charAt(0)}</div>
    <div class="player-name ${m.winnerTeam === 0 ? 'winner' : ''}">${teamAAbbr}</div>
  `;
  const rowB = document.createElement('div');
  rowB.className = 'player-row';
  rowB.innerHTML = `
    <div class="player-initial">${teamBAbbr.charAt(0)}</div>
    <div class="player-name ${m.winnerTeam === 1 ? 'winner' : ''}">${teamBAbbr}</div>
  `;
  playersSection.appendChild(rowA);
  playersSection.appendChild(rowB);

  // Punteggi a destra: griglia colonne=set
  const scoresSection = document.createElement('div');
  scoresSection.className = 'scores-section'; // container esterno
  const setsParsed = parseSets(m.sets);
  const grid = buildScoreGrid(setsParsed);
  scoresSection.appendChild(grid);

  content.appendChild(playersSection);
  content.appendChild(scoresSection);

  const matchInfo = document.createElement('div');
matchInfo.className = 'match-info';

const matchDate = document.createElement('span');
matchDate.className = 'match-date';
matchDate.textContent = new Date(m.date).toLocaleDateString('it-IT');
matchInfo.appendChild(matchDate);

// Mostra superficie colorata se presente
if (m.surface) {
    const matchSurface = document.createElement('span');
    matchSurface.className = 'match-surface';
    matchSurface.textContent = m.surface;
    matchSurface.style.backgroundColor = getSurfaceColor(m.surface);
    matchSurface.style.color = getSurfaceTextColor(m.surface);
    matchSurface.style.border = 'none';
    matchInfo.appendChild(matchSurface);
}

  box.appendChild(content);
  box.appendChild(matchInfo);
  return box;
}

/* ===== Load data ===== */
async function loadPlayerData() {
  // Header cards
  const host = document.getElementById('player-cards') || document.querySelector('.stats-container') || document.body;
  if (!document.getElementById('elo-singles')) {
    const wrap = document.createElement('div');
    wrap.className = 'stats-section';
    wrap.id = 'player-cards';
    wrap.innerHTML = `
      <div class="stats-card"><div class="stats-label">ELO Singolo</div><div class="stats-value" id="elo-singles">—</div></div>
      <div class="stats-card"><div class="stats-label">ELO Doppio</div><div class="stats-value" id="elo-doubles">—</div></div>
      <div class="stats-card"><div class="stats-label">Streak</div><div class="stats-value" id="streak-singles">0</div></div>
    `;
    host.prepend(wrap);
  }

  // Config e id
  const config = await getConfig();
  const pid = await nameToPlayerId(playerName);
  const start = config?.startingElo ?? 1200;

  // Rankings correnti
  const rS = await getDoc(doc(db, "rankings", `singles-${pid}`));
  const rD = await getDoc(doc(db, "rankings", `doubles-${pid}`));
  const singles = rS.exists() ? rS.data() : null;
  const doubles = rD.exists() ? rD.data() : null;

  let singlesElo = singles?.elo ?? start;
  let singlesStreak = singles?.streak ?? 0;
  let doublesElo = doubles?.elo ?? start;

  // Fallback vecchio schema
  if (!singles && playerName) {
    const sOld = await getDoc(doc(db, "singles", playerName));
    if (sOld.exists()) {
      const d = sOld.data();
      singlesElo = d.elo ?? start;
      singlesStreak = d.streak ?? 0;
    }
  }
  if (!doubles && playerName) {
    const dOld = await getDoc(doc(db, "doubles", playerName));
    if (dOld.exists()) {
      const d = dOld.data();
      doublesElo = d.elo ?? start;
    }
  }

  // Cards
  const elSingles = document.querySelector('#elo-singles');
  const elDoubles = document.querySelector('#elo-doubles');
  const elStreak = document.querySelector('#streak-singles');
  if (elSingles) elSingles.textContent = Math.round(singlesElo);
  if (elDoubles) elDoubles.textContent = Math.round(doublesElo);
  if (elStreak) elStreak.textContent = singlesStreak;

  // Mappa id->nome
  const playersSnap = await getDocs(collection(db, "players"));
  const namesById = {};
  playersSnap.forEach(docu => { const p = docu.data(); namesById[docu.id] = p?.name || docu.id; });

  // Matches del giocatore
  const qy = query(collection(db, "matches"), orderBy("date", "desc"));
  const snap = await getDocs(qy);
  const allMatches = [];
  snap.forEach(d => {
    const m = d.data();
    if (Array.isArray(m.participants) && m.participants.some(p => p.pid === pid)) allMatches.push(m);
  });

  // COSTRUZIONE GRAFICO ELO - AGGIUNTO
  const dates = [];
  const singlesEloHistory = [];
  const doublesEloHistory = [];

  // Ordina i match per data per il grafico
  const matchesForChart = [...allMatches].sort((a, b) => new Date(a.date) - new Date(b.date));

  let currentSinglesElo = 1200;
  let currentDoublesElo = 1200;

  dates.push('Inizio');
  singlesEloHistory.push(currentSinglesElo);
  doublesEloHistory.push(currentDoublesElo);

  matchesForChart.forEach(match => {
    const delta = match.eloDelta?.[pid] || 0;
    const matchDate = new Date(match.date).toLocaleDateString('it-IT');
    
    if (match.type === 'singles') {
      currentSinglesElo += delta;
      dates.push(matchDate);
      singlesEloHistory.push(Math.round(currentSinglesElo));
      doublesEloHistory.push(Math.round(currentDoublesElo)); // Mantieni valore precedente
    } else {
      currentDoublesElo += delta;
      dates.push(matchDate);
      doublesEloHistory.push(Math.round(currentDoublesElo));
      singlesEloHistory.push(Math.round(currentSinglesElo)); // Mantieni valore precedente
    }
  });

  // Disegna il grafico solo se ci sono dati
  if (dates.length > 1) {
    drawEloChart(dates, singlesEloHistory, doublesEloHistory);
  }

  // Render liste
  const singlesMatches = allMatches.filter(m => m.type === 'singles');
  const doublesMatches = allMatches.filter(m => m.type === 'doubles');

  if (containerSingles) {
    containerSingles.innerHTML = '';
    if (singlesMatches.length)
      singlesMatches
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // Ordina dal più recente al più vecchio
        .forEach(m => containerSingles.appendChild(renderMatchBox(m, pid, namesById)));
    else
      containerSingles.innerHTML = '<p>Nessuna partita di singolo giocata.</p>';
  }
  if (containerDoubles) {
    containerDoubles.innerHTML = '';
    if (doublesMatches.length)
      doublesMatches
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // Ordina dal più recente al più vecchio
        .forEach(m => containerDoubles.appendChild(renderMatchBox(m, pid, namesById)));
    else
      containerDoubles.innerHTML = '<p>Nessuna partita di doppio giocata.</p>';
  }
}

function getSurfaceColor(surface) {
    if (!surface) return '#f0f0f0'; // Grigio di default
    
    switch (surface.toLowerCase()) {
        case 'terra':
            return '#d2691e'; // Marrone/rosso per terra
        case 'erba':
            return '#32cd32'; // Verde per erba
        case 'cemento':
            return '#4682b4'; // Azzurro per cemento
        default:
            return '#f0f0f0'; // Grigio di default
    }
}

// Funzione per ottenere il colore del testo (contrasto)
function getSurfaceTextColor(surface) {
    if (!surface) return '#666';
    
    switch (surface.toLowerCase()) {
        case 'terra':
        case 'erba':
        case 'cemento':
            return '#fff'; // Testo bianco per tutti i colori
        default:
            return '#666'; // Grigio scuro di default
    }
}
