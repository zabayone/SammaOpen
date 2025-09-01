import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
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

/* Achievement Definitions */
const ACHIEVEMENTS = {
    gigante: {
        id: "gigante",
        name: "Gigante",
        description: "Ha sconfitto un giocatore con 100+ punti ELO in più",
        icon: "🗿"
    },
    rampage: {
        id: "rampage", 
        name: "Rampage",
        description: "Streak da 5 vittorie consecutive",
        icon: "🔥"
    },
    bagel: {
        id: "bagel",
        name: "Bagel", 
        description: "Ha vinto un set 6-0",
        icon: "🥯"
    },
    breadstick: {
        id: "breadstick",
        name: "Breadstick",
        description: "Ha vinto un set 6-1", 
        icon: "🥖"
    }
};

/* Initialization */
document.addEventListener('DOMContentLoaded', () => {
    const isStats = document.getElementById('player-name') || document.getElementById('eloChart');
    if (isStats) {
        const titleEl = document.getElementById("player-name");
        if (titleEl) titleEl.textContent = `Statistiche: ${abbreviaNome(playerName)}`;
        loadPlayerData().catch(console.error);
    }
});

/* Database Functions */
async function getPlayerStats(playerName) {
    try {
        const pid = await nameToPlayerId(playerName);
        const docRef = doc(db, "player_stats", pid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            // Inizializza stats di default
            const defaultStats = {
                dritto: 5, rovescio: 5, servizio: 5, volee: 5, stamina: 5, gameplay: 5,
                gold: 0, silver: 0, bronze: 0,
                achievements: []
            };
            await setDoc(docRef, defaultStats);
            return defaultStats;
        }
    } catch (error) {
        console.error("Errore nel recuperare le stats:", error);
        return { dritto: 5, rovescio: 5, servizio: 5, volee: 5, stamina: 5, gameplay: 5, gold: 0, silver: 0, bronze: 0, achievements: [] };
    }
}

async function updatePlayerStats(playerName, newStats) {
    try {
        const pid = await nameToPlayerId(playerName);
        const docRef = doc(db, "player_stats", pid);
        await setDoc(docRef, newStats, { merge: true });
    } catch (error) {
        console.error("Errore nell'aggiornare le stats:", error);
    }
}

/* Achievement Calculation Functions */
function checkGiganteAchievement(matches, pid, namesById) {
    return matches.some(match => {
        const participants = match.participants || [];
        const player = participants.find(p => p.pid === pid);
        const opponent = participants.find(p => p.pid !== pid);
        
        if (!player || !opponent) return false;
        
        const playerElo = player.eloStart || 1200;
        const opponentElo = opponent.eloStart || 1200;
        const eloDiff = opponentElo - playerElo;
        
        // Vittoria contro avversario con 100+ ELO in più
        return eloDiff >= 100 && ((match.winnerTeam === 0 && player.team === 0) || (match.winnerTeam === 1 && player.team === 1));
    });
}

function checkRampageAchievement(matches, pid) {
    // Ordina le partite per data
    const sortedMatches = matches
        .filter(m => m.participants.some(p => p.pid === pid))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let currentStreak = 0;
    let maxStreak = 0;
    
    sortedMatches.forEach(match => {
        const player = match.participants.find(p => p.pid === pid);
        const won = (match.winnerTeam === 0 && player.team === 0) || (match.winnerTeam === 1 && player.team === 1);
        
        if (won) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    });
    
    return maxStreak >= 5;
}

function checkBagelAchievement(matches, pid) {
    return matches.some(match => {
        if (!match.sets || !Array.isArray(match.sets)) return false;
        
        const player = match.participants.find(p => p.pid === pid);
        const won = (match.winnerTeam === 0 && player.team === 0) || (match.winnerTeam === 1 && player.team === 1);
        
        if (!won) return false;
        
        return match.sets.some(set => {
            const [a, b] = set.split('-').map(n => parseInt(n, 10));
            return (player.team === 0 && a === 6 && b === 0) || (player.team === 1 && b === 6 && a === 0);
        });
    });
}

function checkBreadstickAchievement(matches, pid) {
    return matches.some(match => {
        if (!match.sets || !Array.isArray(match.sets)) return false;
        
        const player = match.participants.find(p => p.pid === pid);
        const won = (match.winnerTeam === 0 && player.team === 0) || (match.winnerTeam === 1 && player.team === 1);
        
        if (!won) return false;
        
        return match.sets.some(set => {
            const [a, b] = set.split('-').map(n => parseInt(n, 10));
            return (player.team === 0 && a === 6 && b === 1) || (player.team === 1 && b === 6 && a === 1);
        });
    });
}

async function calculateAchievements(playerName, matches, namesById) {
    const pid = await nameToPlayerId(playerName);
    const currentStats = await getPlayerStats(playerName);
    const currentAchievements = currentStats.achievements || [];
    
    const achievementChecks = [
        { id: 'gigante', check: () => checkGiganteAchievement(matches, pid, namesById) },
        { id: 'rampage', check: () => checkRampageAchievement(matches, pid) },
        { id: 'bagel', check: () => checkBagelAchievement(matches, pid) },
        { id: 'breadstick', check: () => checkBreadstickAchievement(matches, pid) }
    ];
    
    let newAchievements = [...currentAchievements];
    let hasNewAchievements = false;
    
    achievementChecks.forEach(({ id, check }) => {
        const alreadyHas = currentAchievements.some(a => a.id === id);
        
        if (!alreadyHas && check()) {
            newAchievements.push({
                id: id,
                unlocked: true,
                date: new Date().toISOString()
            });
            hasNewAchievements = true;
        }
    });
    
    if (hasNewAchievements) {
        const updatedStats = { ...currentStats, achievements: newAchievements };
        await updatePlayerStats(playerName, updatedStats);
        return newAchievements;
    }
    
    return currentAchievements;
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
                
                fillEl.style.width = '0%';
                valueEl.textContent = value;
                fillEl.appendChild(valueEl);
                
                setTimeout(() => {
                    fillEl.style.width = `${percentage}%`;
                    fillEl.setAttribute('data-value', value);
                }, 100);
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

function updatePlayerPalmares(stats) {
    const goldCount = document.getElementById('gold-count');
    const silverCount = document.getElementById('silver-count');
    const bronzeCount = document.getElementById('bronze-count');
    
    if (goldCount) goldCount.textContent = stats.gold || 0;
    if (silverCount) silverCount.textContent = stats.silver || 0;
    if (bronzeCount) bronzeCount.textContent = stats.bronze || 0;
    
    // Anima i contatori
    animateCounters({ gold: stats.gold || 0, silver: stats.silver || 0, bronze: stats.bronze || 0 });
}

function updatePlayerAchievements(achievements) {
    const container = document.getElementById('achievements-container');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!achievements || achievements.length === 0) {
        container.innerHTML = '<div class="achievement-item"><span class="achievement-text">Nessun achievement</span></div>';
        return;
    }
    
    achievements.forEach(achievement => {
        const achievementDef = ACHIEVEMENTS[achievement.id];
        if (!achievementDef) return;
        
        const achievementEl = document.createElement('div');
        achievementEl.className = 'achievement-item';
        achievementEl.innerHTML = `
            <span class="achievement-icon">${achievementDef.icon}</span>
            <div class="achievement-details">
                <div class="achievement-text">${achievementDef.name}</div>
            </div>
        `;
        container.appendChild(achievementEl);
    });
}

function animateCounters(palmares) {
    const counters = [
        { element: document.getElementById('gold-count'), target: palmares.gold },
        { element: document.getElementById('silver-count'), target: palmares.silver },
        { element: document.getElementById('bronze-count'), target: palmares.bronze }
    ];
    
    counters.forEach((counter, index) => {
        if (!counter.element) return;
        
        setTimeout(() => {
            let current = 0;
            const increment = counter.target / 20;
            const timer = setInterval(() => {
                current += increment;
                if (current >= counter.target) {
                    current = counter.target;
                    clearInterval(timer);
                }
                counter.element.textContent = Math.round(current);
            }, 50);
        }, index * 200);
    });
}

async function createPlayerProfile(playerName, matches, namesById) {
    const stats = await getPlayerStats(playerName);
    const achievements = await calculateAchievements(playerName, matches, namesById);
    
    const overall = stats.dritto + stats.rovescio + stats.servizio + 
                   stats.volee + stats.stamina + stats.gameplay;
    
    updatePlayerPhoto(playerName);
    updatePlayerPalmares(stats);
    updatePlayerAchievements(achievements);
    setTimeout(() => animateSkillBars(stats, overall), 300);
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
             singlesValues, // CORRETTO: aggiunto ''
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
             doublesValues, // CORRETTO: aggiunto ''
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

    // Create player profile - PASSA matches e namesById
    await createPlayerProfile(playerName, allMatches, namesById);

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
            containerSingles.innerHTML = '<p>Nessuna partita giocata.</p>';
        }
    }

    if (containerDoubles) {
        containerDoubles.innerHTML = '';
        if (doublesMatches.length) {
            doublesMatches
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .forEach(m => containerDoubles.appendChild(renderMatchBox(m, pid, namesById)));
        } else {
            containerDoubles.innerHTML = '<p>Nessuna partita giocata.</p>';
        }
    }
}
