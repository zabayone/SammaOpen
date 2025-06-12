import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { abbreviaNome } from "./script.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqINXR7uKQw5edv6lic-8Xcdlx9PyJAKU",
  authDomain: "samma-open.firebaseapp.com",
  projectId: "samma-open",
  storageBucket: "samma-open.appspot.com",
  messagingSenderId: "203807765703",
  appId: "1:203807765703:web:9923f6766f510de4993ae2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const playerName = decodeURIComponent(urlParams.get("name"));
document.getElementById("player-name").innerHTML = `Statistiche:  ${abbreviaNome(playerName)}`;

const containerSingles = document.getElementById("matchlist-singles");
const containerDoubles = document.getElementById("matchlist-doubles");

// Generate colors based on player name for consistency
function getPlayerColor(name) {
  const colors = [
    '#ff6b35', '#4ecdc4', '#45b7d1', '#96ceb4', 
    '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd',
    '#00d2d3', '#ff9f43', '#10ac84', '#ee5a24'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get first initial of a name
function getInitial(name) {
  return name.trim().charAt(0).toUpperCase();
}

async function loadPlayerData() {
  containerSingles.innerHTML = "";
  containerDoubles.innerHTML = "";

  // Singolo
  const singlesDoc = await getDoc(doc(db, "singles", playerName));
  if (singlesDoc.exists()) {
    const data = singlesDoc.data();
    
    // Create stats section for singles
    const singlesStatsSection = document.createElement("div");
    singlesStatsSection.className = "stats-section";
    
    // ELO card
    const eloCard = document.createElement("div");
    eloCard.className = "stats-card";
    eloCard.innerHTML = `
      <div class="stats-label">ELO Rating</div>
      <div class="stats-value">${data.elo || "N/A"}</div>
    `;
    
    // Matches card
    const numMatches = (data.matches?.length || 0);
    const matchesCard = document.createElement("div");
    matchesCard.className = "stats-card";
    matchesCard.innerHTML = `
      <div class="stats-label">Partite</div>
      <div class="stats-value">${numMatches}</div>
    `;
    
    singlesStatsSection.appendChild(eloCard);
    singlesStatsSection.appendChild(matchesCard);
    
    // Insert stats section before the matches container
    containerSingles.parentNode.insertBefore(singlesStatsSection, containerSingles);

    if (numMatches > 0) {
      data.matches?.slice(-5).reverse().forEach(match => {
        const matchElement = createMatchBox(match);
        containerSingles.appendChild(matchElement);
      });
    } else {
      containerSingles.innerHTML = "<p style='text-align: center; color: #666; padding: 20px;'>Nessuna partita trovata.</p>";
    }
  } else {
    containerSingles.innerHTML = "<p style='text-align: center; color: #666; padding: 20px;'>Nessun dato singolare trovato.</p>";
  }

  // Doppio
  const doublesDoc = await getDoc(doc(db, "doubles", playerName));
  if (doublesDoc.exists()) {
    const data = doublesDoc.data();
    
    // Create stats section for doubles
    const doublesStatsSection = document.createElement("div");
    doublesStatsSection.className = "stats-section";
    
    // ELO card
    const eloCard = document.createElement("div");
    eloCard.className = "stats-card";
    eloCard.innerHTML = `
      <div class="stats-label">ELO Rating</div>
      <div class="stats-value">${data.elo || "N/A"}</div>
    `;
    
    // Matches card
    const numMatches = (data.matches?.length || 0);
    const matchesCard = document.createElement("div");
    matchesCard.className = "stats-card";
    matchesCard.innerHTML = `
      <div class="stats-label">Partite</div>
      <div class="stats-value">${numMatches}</div>
    `;
    
    doublesStatsSection.appendChild(eloCard);
    doublesStatsSection.appendChild(matchesCard);
    
    // Insert stats section before the matches container
    containerDoubles.parentNode.insertBefore(doublesStatsSection, containerDoubles);

    if (numMatches > 0) {
      data.matches?.slice(-5).reverse().forEach(match => {
        const matchElement = createMatchBox(match);
        containerDoubles.appendChild(matchElement);
      });
    } else {
      containerDoubles.innerHTML = "<p style='text-align: center; color: #666; padding: 20px;'>Nessuna partita trovata.</p>";
    }
  } else {
    containerDoubles.innerHTML = "<p style='text-align: center; color: #666; padding: 20px;'>Nessun dato doppio trovato.</p>";
  }
}

function createMatchBox(matchString) {
  const [teamsPart, rest] = matchString.split(" vs ");
  if (!rest) return document.createTextNode(matchString);

  const [team2Part, scoreAndWin] = rest.split(": ");
  if (!scoreAndWin) return document.createTextNode(matchString);

  const team1Names = teamsPart.split(" & ").map(name => abbreviaNome(name.trim()));
  const team2Names = team2Part.split(" & ").map(name => abbreviaNome(name.trim()));

  const team1 = team1Names.join(" & ");
  const team2 = team2Names.join(" & ");

  const [setsStrRaw, winStr] = scoreAndWin.split(" → ");
  const winner = winStr?.trim();

  // Rimuovo eventuali virgole dai set (es: "6-3, 4-6" → "6-3 4-6")
  const setsStr = setsStrRaw.replace(/,/g, "").trim();

  const box = document.createElement("div");
  box.className = "match-box";

  // Main match content container
  const matchContent = document.createElement("div");
  matchContent.className = "match-content";

  // Players section (left side)
  const playersSection = document.createElement("div");
  playersSection.className = "players-section";

  // Determine who is the winner and loser of the overall match
  const team1IsWinner = team1 === winner;
  const team2IsWinner = team2 === winner;

  // Create player rows for Team 1
  const playerRow1 = document.createElement("div");
  playerRow1.className = "player-row";
  const playerInitial1 = document.createElement("div");
  playerInitial1.className = "player-initial";
  playerInitial1.style.backgroundColor = getPlayerColor(team1);
  if (team1.includes(" & ")) {
    const players = team1.split(" & ");
    playerInitial1.textContent = players.map(p => getInitial(p)).join("");
    playerInitial1.style.fontSize = "0.7rem";
  } else {
    playerInitial1.textContent = getInitial(team1);
  }
  const playerName1 = document.createElement("div");
  playerName1.className = `player-name ${team1IsWinner ? "winner" : ""}`;
  playerName1.textContent = team1;
  playerRow1.appendChild(playerInitial1);
  playerRow1.appendChild(playerName1);
  playersSection.appendChild(playerRow1);

  // Create player rows for Team 2
  const playerRow2 = document.createElement("div");
  playerRow2.className = "player-row";
  const playerInitial2 = document.createElement("div");
  playerInitial2.className = "player-initial";
  playerInitial2.style.backgroundColor = getPlayerColor(team2);
  if (team2.includes(" & ")) {
    const players = team2.split(" & ");
    playerInitial2.textContent = players.map(p => getInitial(p)).join("");
    playerInitial2.style.fontSize = "0.7rem";
  } else {
    playerInitial2.textContent = getInitial(team2);
  }
  const playerName2 = document.createElement("div");
  playerName2.className = `player-name ${team2IsWinner ? "winner" : ""}`;
  playerName2.textContent = team2;
  playerRow2.appendChild(playerInitial2);
  playerRow2.appendChild(playerName2);
  playersSection.appendChild(playerRow2);

  // Scores section (right side)
  const scoresSection = document.createElement("div");
  scoresSection.className = "scores-section";

  const sets = setsStr.split(" ");
  sets.forEach(setScore => {
    const setScores = document.createElement("div");
    setScores.className = "set-scores";

    const [scoreA, scoreB] = setScore.split("-").map(Number);

    // Score for Team 1
    const scoreDiv1 = document.createElement("div");
    scoreDiv1.className = "score-set";
    if (team1IsWinner) {
      scoreDiv1.classList.add("score-winner-overall"); // Arancione per il vincitore
    } else {
      scoreDiv1.classList.add("score-loser-overall"); // Verde chiaro per il perdente
    }
    scoreDiv1.textContent = scoreA;
    setScores.appendChild(scoreDiv1);

    const setScoreDivider = document.createElement("hr");
    setScoreDivider.className = "set-score-divider"; // Nuova classe per la linea tra i punteggi del set
    setScores.appendChild(setScoreDivider);

    // Score for Team 2
    const scoreDiv2 = document.createElement("div");
    scoreDiv2.className = "score-set";
    if (team2IsWinner) {
      scoreDiv2.classList.add("score-winner-overall"); // Arancione per il vincitore
    } else {
      scoreDiv2.classList.add("score-loser-overall"); // Verde chiaro per il perdente
    }
    scoreDiv2.textContent = scoreB;
    setScores.appendChild(scoreDiv2);

    scoresSection.appendChild(setScores);
  });

  // Assemble the match content
  matchContent.appendChild(playersSection);
  matchContent.appendChild(scoresSection);
  box.appendChild(matchContent);

  return box;
}

loadPlayerData();