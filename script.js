import { loadLeaderboardData, saveMatchResult } from './server.js';
import { checkPasskey } from './server.js';

const players = [
  "Nicola Nespoli", "Mattia Casulli", "Andrea Redaelli", "Giacomo Belli",
  "Christian Joli", "Giacomo Meazzi", "Davide Saccani", "Margherita Dassisti",
  "Ospite" // Giocatore fittizio per partite con esterni
];

let data = {
  singles: {},
  doubles: {}
};
let currentTab = 'singles';

async function init() {
  data = await loadLeaderboardData(players);
  
  // Aggiungi il giocatore Ospite se non esiste già
  addGuestPlayer();
  
  populateSelects();
  renderLeaderboard();
  setupEventListeners();
}

function addGuestPlayer() {
  const guestData = {
    elo: 1200,
    wins: 0,
    losses: 0,
    matches: []
  };
  
  // Aggiungi Ospite sia per singles che doubles se non esiste
  if (!data.singles["Ospite"]) {
    data.singles["Ospite"] = { ...guestData };
  }
  if (!data.doubles["Ospite"]) {
    data.doubles["Ospite"] = { ...guestData };
  }
}

function populateSelects() {
  const p1 = document.getElementById('player1');
  const p2 = document.getElementById('player2');
  const p3 = document.getElementById('player3');
  const p4 = document.getElementById('player4');

  if (!p1 || !p2 ) return;

  players.forEach(name => {
    [p1, p2, p3, p4].forEach(select => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      select.appendChild(opt);
    });
  });
}

function setupEventListeners() {
  if (!document.getElementById('singles') || !document.getElementById('doubles')) return;
  document.getElementById('singles').addEventListener('change', () => switchTab('singles'));
  document.getElementById('doubles').addEventListener('change', () => switchTab('doubles'));
  document.getElementById('addResultButton').addEventListener('click', addResult);
  document.getElementById('singles').addEventListener('change', updateVsPosition);
  document.getElementById('doubles').addEventListener('change', updateVsPosition);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelector(`#tab-${tab}`).classList.add('active');

  const isDoubles = tab === 'doubles';
  document.getElementById('player3').style.display = isDoubles ? 'inline-block' : 'none';
  document.getElementById('player4').style.display = isDoubles ? 'inline-block' : 'none';

  renderLeaderboard();
  updateVsPosition();
}

function renderLeaderboard() {
  const leaderboard = document.getElementById('leaderboard');
  const sorted = Object.entries(data[currentTab])
    .filter(([name]) => name !== "Ospite") // Esclude Ospite dalla classifica
    .sort((a, b) => b[1].elo - a[1].elo);
  
  if (!leaderboard) return;
  leaderboard.innerHTML = `
    <table>
      <tr><th>#</th><th>Nome</th><th>ELO</th><th>W</th><th>L</th></tr>
      ${sorted.map(([name, player], i) => {
        const abbreviatedName = abbreviaNome(name);
        const wins = player.wins || 0;
        const losses = player.losses || 0;
        return `
          <tr onclick="window.location='stats.html?name=${encodeURIComponent(name)}'">
            <td><span class="rank-number">${i + 1}</span></td>
            <td>${abbreviatedName}</td>
            <td>${player.elo}</td>
            <td>${wins}</td>
            <td>${losses}</td>
          </tr>`;
      }).join('')}
    </table>
  `;
}

export function abbreviaNome(nomeCompleto) {
  const parts = nomeCompleto.trim().split(" ");
  if (parts.length === 1) return parts[0]; // solo un nome
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function parseResult(str) {
  const sets = str.split(',').map(set => set.trim());
  return sets.map(set => {
    const tbMatch = set.match(/(\d+)-(\d+)(\((\d+)\))?/);
    return tbMatch ? {
      p1: parseInt(tbMatch[1]),
      p2: parseInt(tbMatch[2]),
      tb: tbMatch[4] ? parseInt(tbMatch[4]) : null
    } : null;
  });
}

async function addResult() {
  try {
    // Mostra il modale aggiungendo la classe 'active' all'overlay
    document.getElementById("passkeyModal").classList.add("active");

    return new Promise((resolve, reject) => {
      const confirmBtn = document.getElementById("confirmPasskey");
      const cancelBtn = document.getElementById("cancelPasskey");

      confirmBtn.onclick = async () => {
        const input = document.getElementById("passkeyInput").value.trim();
        const isValid = await checkPasskey(input);
        if (!isValid) {
          alert("Passkey errata.");
          return;
        }

        // Nascondi il modale rimuovendo la classe 'active'
        document.getElementById("passkeyModal").classList.remove("active");
        document.getElementById("passkeyInput").value = "";
        resolve(realAddResult()); // Chiama la vera funzione
      };

      cancelBtn.onclick = () => {
        // Nascondi il modale rimuovendo la classe 'active'
        document.getElementById("passkeyModal").classList.remove("active");
        document.getElementById("passkeyInput").value = "";
        reject("Annullato");
      };
    });

  } catch (e) {
    console.error("Errore in addResult:", e);
    alert("Errore salvando il risultato. Controlla console.");
  }
}

async function realAddResult() {
    if (currentTab === 'singles') {
      const p1 = document.getElementById('player1').value;
      const p2 = document.getElementById('player2').value;
      const resultStr = document.getElementById('setResults').value.trim();

      if (!data.singles[p1] || !data.singles[p2] || p1 === p2 || resultStr === '') {
        alert("Input non valido.");
        return;
      }

      const sets = parseResult(resultStr);
      if (sets.length === 0) {
        alert("Formato risultato non valido. Esempio: 6-3, 3-6, 7-6(5)");
        return;
      }

      let p1Wins = 0, p2Wins = 0;
      let summary = [];

      sets.forEach(s => {
        if (!s) return;
        summary.push(`${s.p1}-${s.p2}${s.tb !== null ? `(${s.tb})` : ''}`);
        if (s.p1 > s.p2) p1Wins++;
        else p2Wins++;
      });

      const winner = p1Wins > p2Wins ? p1 : p2;
      const loser = p1Wins > p2Wins ? p2 : p1;
      const K = 32;
      const winElo = data.singles[winner].elo;
      const loseElo = data.singles[loser].elo;
      const expectedWin = 1 / (1 + Math.pow(10, (loseElo - winElo) / 400));
      const expectedLose = 1 - expectedWin;

      data.singles[winner].elo = Math.round(winElo + K * (1 - expectedWin));
      data.singles[loser].elo = Math.round(loseElo + K * (0 - expectedLose));

      const res = `${p1} vs ${p2}: ${summary.join(', ')} → ${winner} vince`;
      data.singles[p1].matches.push(res);
      data.singles[p2].matches.push(res);
      data.singles[winner].wins++;
      data.singles[loser].losses++;

      // Salva solo i giocatori reali (non Ospite) nel database
      const playersToSave = {};
      if (p1 !== "Ospite") playersToSave[p1] = data.singles[p1];
      if (p2 !== "Ospite") playersToSave[p2] = data.singles[p2];
      
      if (Object.keys(playersToSave).length > 0) {
        await saveMatchResult('singles', playersToSave);
      }

    } else if (currentTab === 'doubles') {
      const p1 = document.getElementById('player1').value;
      const p2 = document.getElementById('player2').value;
      const p3 = document.getElementById('player3').value;
      const p4 = document.getElementById('player4').value;
      const resultStr = document.getElementById('setResults').value.trim();

      const team1 = [p1, p2];
      const team2 = [p3, p4];

      if (
        team1.some(p => !data.doubles[p]) ||
        team2.some(p => !data.doubles[p]) ||
        new Set([...team1, ...team2]).size < 4 ||
        resultStr === ''
      ) {
        alert("Input non valido.");
        return;
      }

      const sets = parseResult(resultStr);
      if (sets.length === 0) {
        alert("Formato risultato non valido. Esempio: 6-3, 3-6, 7-6(5)");
        return;
      }

      let team1Wins = 0, team2Wins = 0;
      let summary = [];

      sets.forEach(s => {
        if (!s) return;
        summary.push(`${s.p1}-${s.p2}${s.tb !== null ? `(${s.tb})` : ''}`);
        if (s.p1 > s.p2) team1Wins++;
        else team2Wins++;
      });

      const winnerTeam = team1Wins > team2Wins ? team1 : team2;
      const loserTeam = team1Wins > team2Wins ? team2 : team1;
      const K = 32;

      const winnerElo = (data.doubles[winnerTeam[0]].elo + data.doubles[winnerTeam[1]].elo) / 2;
      const loserElo = (data.doubles[loserTeam[0]].elo + data.doubles[loserTeam[1]].elo) / 2;
      const expectedWin = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
      const expectedLose = 1 - expectedWin;

      const eloChangeWinner = K * (1 - expectedWin);
      const eloChangeLoser = K * (0 - expectedLose);

      winnerTeam.forEach(p => {
        data.doubles[p].elo = Math.round(data.doubles[p].elo + eloChangeWinner / 2);
      });
      loserTeam.forEach(p => {
        data.doubles[p].elo = Math.round(data.doubles[p].elo + eloChangeLoser / 2);
      });

      const res = `${p1} & ${p2} vs ${p3} & ${p4}: ${summary.join(', ')} → Squadra vincente: ${winnerTeam.join(' & ')}`;
      winnerTeam.forEach(p => data.doubles[p].matches.push(res));
      loserTeam.forEach(p => data.doubles[p].matches.push(res));
      winnerTeam.forEach(p => data.doubles[p].wins++);
      loserTeam.forEach(p => data.doubles[p].losses++);

      // Salva solo i giocatori reali (non Ospite) nel database
      const playersToSave = {};
      [...winnerTeam, ...loserTeam].forEach(p => {
        if (p !== "Ospite") {
          playersToSave[p] = data.doubles[p];
        }
      });
      
      if (Object.keys(playersToSave).length > 0) {
        await saveMatchResult('doubles', playersToSave);
      }
    }

    renderLeaderboard();
}

function showPlayer(name) {
  const player = data[currentTab][name];
  if (!player) return;
  alert(`Player: ${name}\nELO: ${player.elo}\nPartite:\n${player.matches.join('\n')}`);
}

function updateVsPosition() {
  // Check if we're on index.html by looking for key elements
  const team1 = document.getElementById('team1');
  const team2 = document.getElementById('team2');
  const vsElement = document.querySelector('.vs');

  // Exit if we're not on index.html (elements not found)
  if (!team1 || !team2 || !vsElement) return;

  const isSingles = document.getElementById('singles').checked;

  if (isSingles) {
    team1.style.display = 'flex';
    team2.style.display = 'none';

    // VS dentro team1, già nel markup
    // Se per qualche motivo VS non è dentro team1, lo sposti:
    if (!team1.contains(vsElement)) {
      vsElement.remove();
      // Metti VS tra i due select (tra player1 e player2)
      const players = team1.querySelectorAll('select');
      if (players.length >= 2) {
        players[0].after(vsElement);
      }
    }
  } else {
    team1.style.display = 'flex';
    team2.style.display = 'flex';

    // VS tra i due team (fuori dai div team)
    if (vsElement.parentNode !== team1.parentNode) {
      vsElement.remove();
      team1.after(vsElement);
    }
  }
}

// Esegui la funzione all'avvio e ogni volta che cambia la tab
document.querySelectorAll('input[name="matchType"]').forEach(input => {
  input.addEventListener('change', updateVsPosition);
});

// Chiamata iniziale per posizionare bene il vs
updateVsPosition();

init();