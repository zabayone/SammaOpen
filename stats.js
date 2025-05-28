import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import {abbreviaNome} from "./script.js";

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

// Ottieni il nome del giocatore dall'URL
const urlParams = new URLSearchParams(window.location.search);
const playerName = decodeURIComponent(urlParams.get("name"));
document.getElementById("player-name").textContent = `Statistiche: ${abbreviaNome(playerName)}`;
// Or if you really need the line break:
document.getElementById("player-name").innerHTML = `Statistiche:<br>${abbreviaNome(playerName)}`;

// Variabili caroselli e indici
let currentIndexSingles = 0;
let currentIndexDoubles = 0;

const carouselSingles = document.getElementById("carousel-singles");
const carouselDoubles = document.getElementById("carousel-doubles");

const prevSingles = document.getElementById("prev-singles");
const nextSingles = document.getElementById("next-singles");
const prevDoubles = document.getElementById("prev-doubles");
const nextDoubles = document.getElementById("next-doubles");

function updateCarousel(carousel, currentIndex) {
  const items = carousel.querySelectorAll(".carousel-item");
  items.forEach((item, index) => {
    item.style.transform = `translateX(${(index - currentIndex) * 100}%)`;
  });
}

prevSingles.onclick = () => {
  if (currentIndexSingles > 0) currentIndexSingles--;
  updateCarousel(carouselSingles, currentIndexSingles);
};

nextSingles.onclick = () => {
  if (currentIndexSingles < carouselSingles.querySelectorAll(".carousel-item").length - 1) currentIndexSingles++;
  updateCarousel(carouselSingles, currentIndexSingles);
};

prevDoubles.onclick = () => {
  if (currentIndexDoubles > 0) currentIndexDoubles--;
  updateCarousel(carouselDoubles, currentIndexDoubles);
};

nextDoubles.onclick = () => {
  if (currentIndexDoubles < carouselDoubles.querySelectorAll(".carousel-item").length - 1) currentIndexDoubles++;
  updateCarousel(carouselDoubles, currentIndexDoubles);
};

async function loadPlayerData() {
  // Pulisci caroselli e resetta indici
  carouselSingles.innerHTML = "";
  carouselDoubles.innerHTML = "";
  currentIndexSingles = 0;
  currentIndexDoubles = 0;

  // Carica dati singolare
  const singlesDoc = await getDoc(doc(db, "singles", playerName));
  if (singlesDoc.exists()) {
    const data = singlesDoc.data();
    document.getElementById("singles-elo").textContent = `ELO: ${data.elo || "N/A"}`;
    const numMatches = (data.matches?.length || 1) - 1; // sottrai 1 per l'elemento iniziale
    document.getElementById("singles-record").textContent = `Partite giocate: ${numMatches >= 0 ? numMatches : 0}`;

    if (numMatches > 0) {
      data.matches.slice(1).forEach(match => {
        const matchElement = createMatchElement(match);
        matchElement.classList.add("carousel-item");
        carouselSingles.appendChild(matchElement);
      });
      updateCarousel(carouselSingles, currentIndexSingles);
    } else {
      carouselSingles.innerHTML = `<div class="carousel-item">Nessuna partita trovata.</div>`;
    }
  } else {
    carouselSingles.innerHTML = `<div class="carousel-item">Nessun dato singolare trovato.</div>`;
    document.getElementById("singles-elo").textContent = "ELO: N/A";
    document.getElementById("singles-record").textContent = "";
  }

  // Carica dati doppio
  const doublesDoc = await getDoc(doc(db, "doubles", playerName));
  if (doublesDoc.exists()) {
    const data = doublesDoc.data();
    document.getElementById("doubles-elo").textContent = `ELO: ${data.elo || "N/A"}`;
    const numMatches = (data.matches?.length || 1) - 1;
    document.getElementById("doubles-record").textContent = `Partite giocate: ${numMatches >= 0 ? numMatches : 0}`;

    if (numMatches > 0) {
      data.matches.slice(1).forEach(match => {
        const matchElement = createMatchElement(match);
        matchElement.classList.add("carousel-item");
        carouselDoubles.appendChild(matchElement);
      });
      updateCarousel(carouselDoubles, currentIndexDoubles);
    } else {
      carouselDoubles.innerHTML = `<div class="carousel-item">Nessuna partita trovata.</div>`;
    }
  } else {
    carouselDoubles.innerHTML = `<div class="carousel-item">Nessun dato doppio trovato.</div>`;
    document.getElementById("doubles-elo").textContent = "ELO: N/A";
    document.getElementById("doubles-record").textContent = "";
  }
}

function createMatchElement(matchString) {
  const [teamsPart, rest] = matchString.split(" vs ");
  if (!rest) return document.createTextNode(matchString);

  const [team2Part, scoreAndWin] = rest.split(": ");
  if (!scoreAndWin) return document.createTextNode(matchString);

  const team1Names = teamsPart.split(" & ").map(name => abbreviaNome(name.trim()));
  const team2Names = team2Part.split(" & ").map(name => abbreviaNome(name.trim()));
  
  const team1 = team1Names.join(" & ");
  const team2 = team2Names.join(" & ");

  const [setsStr, winStr] = scoreAndWin.split(" → ");
  const winner = winStr?.trim();

  const container = document.createElement("div");
  container.className = "match-container";

  const teamsDiv = document.createElement("div");
  teamsDiv.className = "teams";

  const team1Div = document.createElement("div");
  team1Div.className = `team ${winner === team1 ? 'winner' : ''}`;
  team1Div.textContent = team1;

  const team2Div = document.createElement("div");
  team2Div.className = `team ${winner === team2 ? 'winner' : ''}`;
  team2Div.textContent = team2;

  const setsDiv = document.createElement("div");
  setsDiv.className = "sets";
  setsDiv.textContent = setsStr;

  teamsDiv.appendChild(team1Div);
  teamsDiv.appendChild(team2Div);
  container.appendChild(teamsDiv);
  container.appendChild(setsDiv);

  return container;
}

loadPlayerData();
