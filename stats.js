import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { abbreviaNome } from "./script.js";
import { nameToPlayerId, getConfig } from "./server.js";

/* Firebase Configuration */
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

/* Global Variables */
const urlParams = new URLSearchParams(window.location.search);
const playerName = decodeURIComponent(urlParams.get("name") || "");
const containerSingles = document.getElementById("matchlist-singles");
const containerDoubles = document.getElementById("matchlist-doubles");
let eloChartInstance = null;

/* Initialization */
document.addEventListener('DOMContentLoaded', () => {
    const isStats = document.getElementById('player-name') || document.getElementById('eloChart');
    if (isStats) {
        const titleEl = document.getElementById("player-name");
        if (titleEl) titleEl.textContent = `Statistiche: ${abbreviaNome(playerName)}`;
        loadPlayerData().catch(console.error);
    }
});

/* Player Skills Data */
function getPlayerSkills(playerName) {
    const playerSkillsData = {
        "Giacomo Belli": { dritto: 8, rovescio: 8, servizio: 8, volee: 7, stamina: 7, gameplay: 9 },
        "Giacomo Meazzi": { dritto: 8, rovescio: 7, servizio: 8, volee: 9, stamina: 8, gameplay: 7 },
        "Andrea Redaelli": { dritto: 7, rovescio: 7, servizio: 7, volee: 8, stamina: 8, gameplay: 9 },
        "Riccardo Savarè": { dritto: 8, rovescio: 7, servizio: 9, volee: 7, stamina: 6, gameplay: 8 },
        "Nicola Nespoli": { dritto: 7, rovescio: 7, servizio: 7, volee: 4, stamina: 8, gameplay: 7 },
        "Christian Joli": { dritto: 6, rovescio: 4, servizio: 5, volee: 6, stamina: 7, gameplay: 5 },
        "Davide Saccani": { dritto: 7, rovescio: 6, servizio: 8, volee: 5, stamina: 6, gameplay: 6 },
        "Mattia Casulli": { dritto: 7, rovescio: 5, servizio: 6, volee: 4, stamina: 7, gameplay: 5 }
    };
    
    return playerSkillsData[playerName] || { dritto: 0, rovescio: 0, servizio: 0, volee: 0, stamina: 0, gameplay: 0 };
}

/* Surface Color Functions */
function getSurfaceColor(surface) {
    if (!surface) return '#f0f0f0';
    
    switch (surface.toLowerCase()) {
        case 'terra':
            return '#d2691e';
        case 'erba':
            return '#32cd32';
        case 'cemento':
            return '#4682b4';
        default:
            return '#f0f0f0';
    }
}

function getSurfaceTextColor(surface) {
    if (!surface) return '#666';
    
    switch (surface.toLowerCase()) {
        case 'terra':
        case 'erba':
        case 'cemento':
            return '#fff';
        default:
            return '#666';
    }
}

/* Player Profile Functions */
function createPlayerProfile(playerName) {
    const skills = getPlayerSkills(playerName);
    const overall = skills.dritto + skills.rovescio + skills.servizio + 
                   skills.volee + skills.stamina + skills.gameplay;
    
    updatePlayerPhoto(playerName);
    setTimeout(() => animateSkillBars(skills, overall), 300);
}

function updatePlayerPhoto(playerName) {
    const photoContainer = document.getElementById('playerPhoto');
    const initialsEl = document.getElementById('playerInitials');
    
    if (!photoContainer || !initialsEl) return;
    
    initialsEl.textContent = abbreviaNome(playerName);
    
    const img = new Image();
    const imageName = playerName.replace(/\s+/g, '_').toLowerCase();
    
    img.onload = function() {
        initialsEl.style.display = 'none';
        photoContainer.style.backgroundImage = `url(${img.src})`;
        photoContainer.style.backgroundSize = 'cover';
        photoContainer.style.backgroundPosition = 'center';
    };
    
    img.onerror = function() {
        if (img.src.includes('.jpg')) {
            img.src = `photos/${imageName}.png`;
        }
    };
    
    img.src = `photos/${imageName}.jpg`;
}

function animateSkillBars(skills, overall) {
    const skillMappings = [
        { key: 'dritto', class: 'skill-dritto' },
        { key: 'rovescio', class: 'skill-rovescio' },
        { key: 'servizio', class: 'skill-servizio' },
        { key: 'volee', class: 'skill-volee' },
        { key: 'stamina', class: 'skill-stamina' },
        { key: 'gameplay', class: 'skill-gameplay' }
    ];
    
    skillMappings.forEach((mapping, index) => {
        setTimeout(() => {
            const fillEl = document.querySelector(`.${mapping.class}`);
            const skillItem = fillEl?.closest('.skill-item');
            const valueEl = skillItem?.querySelector('.skill-value');
            
            if (fillEl && valueEl) {
                const value = skills[mapping.key];
                const percentage = (value / 10) * 100;
                
                // Reset iniziale
                fillEl.style.width = '0%';
                valueEl.textContent = value;
                
                // Posiziona il valore all'interno della barra riempita
                fillEl.appendChild(valueEl);
                
                // Anima la barra
                setTimeout(() => {
                    fillEl.style.width = `${percentage}%`;
                    fillEl.setAttribute('data-value', value);
                }, 100);
            } else {
                console.error(`Elements not found for ${mapping.key}`);
            }
        }, index * 150);
    });
    
    // Animate overall score
    setTimeout(() => {
        const overallEl = document.getElementById('overallValue');
        if (overallEl) {
            let current = 0;
            const target = overall;
            const increment = target / 40;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                overallEl.textContent = `${Math.round(current)}/60`;
            }, 40);
        }
    }, 1200);
}

/* Chart Functions */
function drawEloChart(labels, singlesValues, doublesValues = []) {
    const canvas = document.getElementById('eloChart');
    if (!canvas) return;
    
    canvas.style.width = '100%';
    canvas.style.height = '280px';
    
    const ctx = canvas.getContext('2d');
    
    if (eloChartInstance) {
        eloChartInstance.destroy();
        eloChartInstance = null;
    }
    
    const datasets = [];
    
    if (Array.isArray(singlesValues) && singlesValues.length) {
        datasets.push({
            label: 'ELO Singolo',
             singlesValues,
            borderColor: '#ff6b35',
            backgroundColor: 'rgba(255,107,53,0.15)',
            borderWidth: 3,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false
        });
    }
    
    if (Array.isArray(doublesValues) && doublesValues.length) {
        datasets.push({
            label: 'ELO Doppio',
             doublesValues,
            borderColor: '#2b7a78',
            backgroundColor: 'rgba(43,122,120,0.15)',
            borderWidth: 3,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
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
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
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

/* Match Rendering Functions */
function parseSets(arr) {
    return (Array.isArray(arr) ? arr : [])
        .map(s => String(s ?? '').trim())
        .filter(Boolean)
        .map(s => {
            const [a, b] = s.split('-').map(n => parseInt(n, 10));
            return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
        })
        .filter(Boolean);
}

function buildScoreGrid(setsParsed) {
    const grid = document.createElement('div');
    grid.className = 'scores-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateRows = 'auto auto';
    grid.style.gridTemplateColumns = `repeat(${setsParsed.length}, auto)`;
    grid.style.gap = '6px 10px';

    setsParsed.forEach(([a, b], idx) => {
        const cellA = document.createElement('div');
        cellA.className = 'score-set';
        cellA.textContent = String(a);
        if (a > b) cellA.classList.add('winner-set');
        cellA.style.gridRow = '1';
        cellA.style.gridColumn = String(idx + 1);

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

    // Players section
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

    // Scores section
    const scoresSection = document.createElement('div');
    scoresSection.className = 'scores-section';
    const setsParsed = parseSets(m.sets);
    const grid = buildScoreGrid(setsParsed);
    scoresSection.appendChild(grid);

    content.appendChild(playersSection);
    content.appendChild(scoresSection);

    // Match info
    const matchInfo = document.createElement('div');
    matchInfo.className = 'match-info';

    const matchDate = document.createElement('span');
    matchDate.className = 'match-date';
    matchDate.textContent = new Date(m.date).toLocaleDateString('it-IT');
    matchInfo.appendChild(matchDate);

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

/* Main Data Loading Function */
async function loadPlayerData() {
    // Get configuration and player ID
    const config = await getConfig();
    const pid = await nameToPlayerId(playerName);
    const start = config?.startingElo ?? 1200;

    // Get current rankings
    const rS = await getDoc(doc(db, "rankings", `singles-${pid}`));
    const rD = await getDoc(doc(db, "rankings", `doubles-${pid}`));
    const singles = rS.exists() ? rS.data() : null;
    const doubles = rD.exists() ? rD.data() : null;

    let singlesElo = singles?.elo ?? start;
    let singlesStreak = singles?.streak ?? 0;
    let doublesElo = doubles?.elo ?? start;

    // Fallback to old schema
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
            doublesElo = dOld.data().elo ?? start;
        }
    }

    // Update cards
    const elSingles = document.querySelector('#elo-singles');
    const elDoubles = document.querySelector('#elo-doubles');
    const elStreak = document.querySelector('#streak-singles');
    if (elSingles) elSingles.textContent = Math.round(singlesElo);
    if (elDoubles) elDoubles.textContent = Math.round(doublesElo);
    if (elStreak) elStreak.textContent = singlesStreak;

    // Get player names mapping
    const playersSnap = await getDocs(collection(db, "players"));
    const namesById = {};
    playersSnap.forEach(docu => { 
        const p = docu.data(); 
        namesById[docu.id] = p?.name || docu.id; 
    });

    // Get player matches
    const qy = query(collection(db, "matches"), orderBy("date", "desc"));
    const snap = await getDocs(qy);
    const allMatches = [];
    snap.forEach(d => {
        const m = d.data();
        if (Array.isArray(m.participants) && m.participants.some(p => p.pid === pid)) {
            allMatches.push(m);
        }
    });

    // Create player profile
    createPlayerProfile(playerName);

    // Build ELO chart
    const dates = [];
    const singlesEloHistory = [];
    const doublesEloHistory = [];

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
            doublesEloHistory.push(Math.round(currentDoublesElo));
        } else {
            currentDoublesElo += delta;
            dates.push(matchDate);
            doublesEloHistory.push(Math.round(currentDoublesElo));
            singlesEloHistory.push(Math.round(currentSinglesElo));
        }
    });

    // Draw chart
    if (dates.length > 1) {
        drawEloChart(dates, singlesEloHistory, doublesEloHistory);
    }

    // Render match lists
    const singlesMatches = allMatches.filter(m => m.type === 'singles');
    const doublesMatches = allMatches.filter(m => m.type === 'doubles');

    if (containerSingles) {
        containerSingles.innerHTML = '';
        if (singlesMatches.length) {
            singlesMatches
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .forEach(m => containerSingles.appendChild(renderMatchBox(m, pid, namesById)));
        } else {
            containerSingles.innerHTML = '<p>Nessuna partita di singolo giocata.</p>';
        }
    }

    if (containerDoubles) {
        containerDoubles.innerHTML = '';
        if (doublesMatches.length) {
            doublesMatches
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .forEach(m => containerDoubles.appendChild(renderMatchBox(m, pid, namesById)));
        } else {
            containerDoubles.innerHTML = '<p>Nessuna partita di doppio giocata.</p>';
        }
    }
}
