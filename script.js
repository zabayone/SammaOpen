import { loadLeaderboardData, saveMatchResult, checkPasskey } from './server.js';

// 1) Fix abbreviaNome (ritornava un array e usava 'parts' intero)
export function abbreviaNome(input) {
  const nome = (input ?? "").toString().trim();
  if (!nome) return "";
  const parts = nome.replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) return parts[0];              // <-- stringa, non array [web:91]
  const first = String(parts[0] || "");                 // <-- prima parola [web:91]
  const last  = String(parts[parts.length - 1] || "");
  return `${first.charAt(0)}. ${last}`;
}

let data = { singles: {}, doubles: {} };
let currentTab = 'singles';

document.addEventListener('DOMContentLoaded', () => {
  const hasLeaderboard = document.getElementById('leaderboard') || document.getElementById('tableWrapper');
  if (hasLeaderboard) init().catch(console.error); // avvia solo nelle pagine corrette
});

// 2) Init DOM-ready
document.addEventListener('DOMContentLoaded', init);
async function init() {
  data = await loadLeaderboardData();
  ensureLastMatchDate();
  applyInactivityDecay();
  populateSelects(Object.keys(data.singles));
  renderLeaderboard();
  setupEventListeners();
}

function ensureLastMatchDate() {
  const today = new Date().toISOString().slice(0, 10);
  ['singles', 'doubles'].forEach(tab => {
    Object.values(data[tab]).forEach(p => { if (!p.lastMatchDate) p.lastMatchDate = today; });
  });
}

function populateSelects(names) {
  ['player1','player2','player3','player4'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      sel.appendChild(opt);
    });
  });
}

let listenersBound = false;
const listenersCtrl = new AbortController();

function setupEventListeners() {
  if (listenersBound) return;            // evita registrazioni multiple
  listenersBound = true;
  const signal = listenersCtrl.signal;

  document.getElementById('singles')?.addEventListener('change', () => switchTab('singles'), { signal });
  document.getElementById('doubles')?.addEventListener('change', () => switchTab('doubles'), { signal });
  document.getElementById('addResultButton')?.addEventListener('click', (e) => {
    e.preventDefault();
    addResult();
  }, { signal });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelector('#tab-singles')?.classList.toggle('active', tab === 'singles');
  document.querySelector('#tab-doubles')?.classList.toggle('active', tab === 'doubles');
  document.getElementById('team2').style.display = tab === 'doubles' ? 'block' : 'none';
  renderLeaderboard();
}

function applyInactivityDecay() {
  const inactivityDays = 30;
  const now = new Date();
  ['singles','doubles'].forEach(t => {
    Object.values(data[t]).forEach(p => {
      if (!p.lastMatchDate) return;
      const diff = (now - new Date(p.lastMatchDate)) / (1000*60*60*24);
      p.inactive = diff > inactivityDays;
    });
  });
}

function renderLeaderboard() {
  const leaderboard = document.getElementById('leaderboard');
  if (!leaderboard) { console.warn('leaderboard non trovata, skip render'); return; }
  const arr = Object.entries(data[currentTab])
    .filter(([name]) => name !== "Ospite")
    .map(([name, player]) => {
      const num = (player.wins||0) + (player.losses||0);
      const reliability = Math.min(1, num / 10);
      const eloShown = Math.round(player.elo * reliability + 1200 * (1 - reliability));
      return { name, player, eloShown };
    })
    .sort((a,b) => b.eloShown - a.eloShown || b.player.elo - a.player.elo || (a.player.inactive ? 1 : -1) || a.name.localeCompare(b.name));

  const rows = arr.map((e,i) => {
    const medalClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const safeName = encodeURIComponent(e.name);
    const wins = e.player.wins || 0, losses = e.player.losses || 0;
    const display = abbreviaNome(e.name);
    const flame = e.player.streak >= 3 ? ' 🔥' : '';
    const inactive = e.player.inactive ? '<span class="inactive-tag">INATTIVO</span>' : '';
    return `
      <tr class="${medalClass}" style="cursor:pointer;" onclick="window.location='stats.html?name=${safeName}'">
        <td><span class="rank-number">${i+1}</span></td>
        <td>${display}${flame} ${inactive}</td>
        <td>${e.eloShown}</td>
        <td>${wins}</td>
        <td>${losses}</td>
      </tr>`;
  }).join('');

  leaderboard.innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th>Nome</th><th>ELO</th><th>W</th><th>L</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// 4) Aggiungi risultato con Passkey gating e payload nuovo schema
async function addResult() {
  // chiedi passkey prima di salvare [web:120][web:121]
  const pass = prompt('Inserisci passkey per salvare');
  const ok = await checkPasskey(pass);
  if (!ok) { alert('Passkey errata'); return; }

  const type = document.querySelector('#doubles')?.checked ? 'doubles' : 'singles';
  const p1 = document.getElementById('player1')?.value || '';
  const p2 = document.getElementById('player2')?.value || '';
  const p3 = document.getElementById('player3')?.value || '';
  const p4 = document.getElementById('player4')?.value || '';
  const sets = (document.getElementById('sets')?.value || '')
    .split(' ')
    .map(s => s.trim())
    .filter(s => s && s.includes('-'));
  const surface = document.getElementById('surface')?.value;
  if (type === 'singles' && (!p1 || !p2)) return alert('Seleziona i due giocatori');
  if (type === 'doubles' && (!p1 || !p2 || !p3 || !p4)) return alert('Seleziona tutti i giocatori');

  const playersByTeam = type === 'singles' ? [[p1],[p2]] : [[p1,p3],[p2,p4]];

  try{
    await saveMatchResult({ type, playersByTeam, sets, surface});
    data = await loadLeaderboardData();
    renderLeaderboard();
    alert('Match salvato!');
  }catch(err){
    console.error(err);
    alert('Errore salvataggio: ' + (err?.message || err));
  }
}
