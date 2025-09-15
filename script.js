import { loadLeaderboardData, saveMatchResult, checkPasskey, createPlayer, ensureRanking, upsertPlayerStats } from './server.js';


// Cliccando sul logo si torna alla home
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.getElementById('logo');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
});

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

    // reset
    sel.innerHTML = '';

    // placeholder non selezionabile
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Seleziona Giocatore';
    placeholder.disabled = true;  // impedisce la selezione
    placeholder.selected = true;  // mostrato come default
    // placeholder.hidden = true; // opzionale: nasconde la voce dal menu a tendina
    sel.appendChild(placeholder);

    // opzioni reali
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
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
  const team1 = document.getElementById('team1');
  const team2 = document.getElementById('team2');
  if (tab === 'doubles') {
    // Inject player3 in team1
    if (!document.getElementById('player3')) {
      const sel3 = document.createElement('select');
      sel3.id = 'player3';
      sel3.innerHTML = '<option value="" selected disabled hidden>Seleziona un giocatore</option>';
      team1.appendChild(sel3);
    }
    // Inject player4 in team2
    if (!document.getElementById('player4')) {
      const sel4 = document.createElement('select');
      sel4.id = 'player4';
      sel4.innerHTML = '<option value="" selected disabled hidden>Seleziona un giocatore</option>';
      team2.appendChild(sel4);
    }
  } else {
    // Rimuovi player3 e player4 se presenti
    const sel3 = document.getElementById('player3');
    const sel4 = document.getElementById('player4');
    if (sel3) sel3.remove();
    if (sel4) sel4.remove();
  }
  renderLeaderboard();
  populateSelects(Object.keys(data.singles));
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
    .filter(([name, player]) => (player.wins || 0) + (player.losses || 0) > 0) // filtra chi non ha partite
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

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openAddPlayer');

  // Modale passkey
  const passkeyModal = document.getElementById('passkeyModal');
  const passkeyInput = document.getElementById('passkeyInput');
  const confirmPass = document.getElementById('confirmPasskey');
  const cancelPass = document.getElementById('cancelPasskey');

  // Modale aggiungi giocatore
  const addPlayerModal = document.getElementById('addPlayerModal');
  const addPlayerForm = document.getElementById('addPlayerForm');
  const closeAddPlayerBtn = document.getElementById('closeAddPlayer'); // se presente

  const closeModal = (el) => el?.classList.remove('active');
  const openModal = (el) => el?.classList.add('active');

  // Apertura: chiedi passkey se non già validata in sessione
  openBtn?.addEventListener('click', () => {
    if (sessionStorage.getItem('passkey_ok') === '1') {
      openModal(addPlayerModal);
    } else {
      passkeyInput.value = '';
      openModal(passkeyModal);
    }
  });

  // Conferma passkey
  confirmPass?.addEventListener('click', async () => {
    const pass = passkeyInput.value.trim();
    if (!pass) return alert('Inserire la passkey');
    try {
      const ok = await checkPasskey(pass);
      if (ok) {
        sessionStorage.setItem('passkey_ok', '1');
        closeModal(passkeyModal);
        openModal(addPlayerModal);
      } else {
        alert('Passkey non valida');
      }
    } catch (e) {
      console.error(e);
      alert('Errore di verifica passkey');
    }
  });

  // Chiudi modale passkey
  cancelPass?.addEventListener('click', () => closeModal(passkeyModal));
  passkeyModal?.addEventListener('click', (e) => { if (e.target === passkeyModal) closeModal(passkeyModal); });

  // Chiudi modale add-player (se c'è un pulsante dedicato)
  closeAddPlayerBtn?.addEventListener('click', () => closeModal(addPlayerModal));
  addPlayerModal?.addEventListener('click', (e) => { if (e.target === addPlayerModal) closeModal(addPlayerModal); });

  // Submit protetto: rifiuta se non validato
  addPlayerForm?.addEventListener('submit', async (e) => {
    if (sessionStorage.getItem('passkey_ok') !== '1') {
      e.preventDefault();
      alert('Autorizzazione richiesta. Inserire la passkey.');
      closeModal(addPlayerModal);
      openModal(passkeyModal);
      return;
    }

    e.preventDefault();
    const name = document.getElementById('ap_name').value.trim();
    const shortName = (document.getElementById('ap_short').value.trim() || name);
    const photoUrl = document.getElementById('ap_photo').value.trim() || null;
    const singles = document.getElementById('ap_singles').checked;
    const doubles = document.getElementById('ap_doubles').checked;

    const stats = {
      dritto: +document.getElementById('ap_dritto').value,
      rovescio: +document.getElementById('ap_rovescio').value,
      servizio: +document.getElementById('ap_servizio').value,
      volee: +document.getElementById('ap_volee').value,
      stamina: +document.getElementById('ap_stamina').value,
      gameplay: +document.getElementById('ap_gameplay').value,
      gold: 0, silver: 0, bronze: 0, achievements: []
    };

    if (!name) return alert('Inserire nome e cognome');

    try {
      // crea player
      const pid = await createPlayer({ name, shortName, photoUrl });

      // opzionale: invalidare cache map locale per nuove ricerche nome->id
      localStorage.removeItem('playersMap');

      // inizializza ranking
      const types = [
        ...(singles ? ['singles'] : []),
        ...(doubles ? ['doubles'] : [])
      ];
      if (types.length) await ensureRanking(pid, types);

      // crea/merge stats
      await upsertPlayerStats(pid, stats);

      // ricarica dati e UI
      data = await loadLeaderboardData();
      populateSelects(Object.keys(data.singles));
      renderLeaderboard();

      // chiudi modale
      closeModal(addPlayerModal);
    } catch (err) {
      console.error(err);
      alert('Errore nel salvataggio del giocatore');
    }
  });
});


