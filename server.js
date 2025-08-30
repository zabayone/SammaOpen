// server.js (nuovo schema)
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqINXR7uKQw5edv6lic-8Xcdlx9PyJAKU",
  authDomain: "samma-open.firebaseapp.com",
  projectId: "samma-open",
  storageBucket: "samma-open.appspot.com",
  messagingSenderId: "203807765703",
  appId: "1:203807765703:web:9923f6766f510de4993ae2"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Config e mapping
export async function getConfig() {
  const snap = await getDoc(doc(db, "meta", "config"));
  return snap.exists() ? snap.data() : { eloK: 32, inactivityDays: 30, startingElo: 1200, totalMatches: 0 };
}

export async function nameToPlayerId(name) {
  const cached = localStorage.getItem("playersMap");
  if (cached) {
    const map = JSON.parse(cached);
    if (map[name]) return map[name];
  }
  const playersSnap = await getDocs(collection(db, "players"));
  let found = null;
  playersSnap.forEach(d => { if (d.data().name === name) found = d.id; });
  return found;
}

// Load leaderboard: players + rankings
export async function loadLeaderboardData() {
  // 1) leggi players per mappare id -> name
  const playersSnap = await getDocs(collection(db, "players"));
  const players = {};
  playersSnap.forEach(d => { players[d.id] = d.data(); });

  // 2) leggi rankings (singles + doubles)
  const rSnap = await getDocs(collection(db, "rankings"));
  const data = { singles: {}, doubles: {} };

  rSnap.forEach(d => {
    const r = d.data(); // { playerId, type, elo, wins, losses, ... }
    const pid = r.playerId;
    const name = players[pid]?.name || pid; // fallback pid
    data[r.type][name] = {
      id: pid,
      name,
      shortName: players[pid]?.shortName || name,
      elo: r.elo,
      wins: r.wins || 0,
      losses: r.losses || 0,
      lastMatchDate: r.lastMatchDate || null,
      inactive: r.inactive || false,
      streak: r.streak || 0,
      matches: [] // compat per UI
    };
  });

  return data;
}

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400)); // ELO standard
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function checkPasskey(userInput) {
  const passkeySnap = await getDoc(doc(db, "Passkey", "Passkey"));
  if (!passkeySnap.exists()) return false;
  return String(passkeySnap.data().int) === String(userInput);
}

// payload: { type, playersByTeam: [[name,..],[name,..]], sets: ["6-4","3-6","10-8"], surface?: string }
export async function saveMatchResult(payload) {
  const { type, playersByTeam, sets, surface } = payload;
  const config = await getConfig();

  const team0 = [];
  const team1 = [];

  // CORREZIONE: Gestione corretta dei team
  // team A (primo elemento dell'array playersByTeam)
  if (playersByTeam[0]) {
    for (const n of playersByTeam[0]) {
      team0.push(await nameToPlayerId(n));
    }
  }

  // team B (secondo elemento dell'array playersByTeam)  
  if (playersByTeam[1]) {
    for (const n of playersByTeam[1]) {
      team1.push(await nameToPlayerId(n));
    }
  }

  const ids = [...team0, ...team1];

  // Leggi ranking correnti
  const rankingDocs = await Promise.all(ids.map(pid => getDoc(doc(db, "rankings", `${type}-${pid}`))));
  const rankings = {};
  rankingDocs.forEach((snap, i) => {
    const pid = ids[i];
    rankings[pid] = snap.exists() ? snap.data() : {
      playerId: pid, type, elo: config.startingElo, wins: 0, losses: 0, streak: 0, peak: config.startingElo
    };
  });

  const avg = (arr) => arr.reduce((s, pid) => s + (rankings[pid].elo ?? config.startingElo), 0) / arr.length;
  const eloA = avg(team0);
  const eloB = avg(team1);

  // Determina vincitore dai set
  const parsed = sets.map(s => s.trim()).filter(Boolean).map(s => s.split("-").map(x => parseInt(x, 10)));
  let winsA = 0, winsB = 0;
  parsed.forEach(([a, b]) => { if (a > b) winsA++; else winsB++; });
  const winnerTeam = winsA > winsB ? 0 : 1;

  const K = config.eloK || 32;
  const EA = expectedScore(eloA, eloB);
  const SA = winnerTeam === 0 ? 1 : 0;
  const deltaTeamA = K * (SA - EA);
  const deltaTeamB = -deltaTeamA;

  // ripartizione per giocatore con correzione residuo per garantire somma esatta
  const splitEven = (delta, ids) => {
    const base = Math.trunc(delta / ids.length);
    let residue = Math.round(delta - base * ids.length);
    return ids.map((pid, i) => base + (i < Math.abs(residue) ? Math.sign(residue) : 0));
  };

  const gainsA = splitEven(deltaTeamA, team0);
  const gainsB = splitEven(deltaTeamB, team1);

  const today = isoDate();
  const batch = writeBatch(db);

  // matches log - CORREZIONE: surface viene gestita correttamente
  const matchRef = doc(collection(db, "matches"));
  batch.set(matchRef, {
    type,
    participants: [
      ...team0.map(pid => ({ pid, team: 0 })),
      ...team1.map(pid => ({ pid, team: 1 }))
    ],
    sets,
    winnerTeam,
    surface: surface || null, // Surface viene salvata correttamente
    createdAt: serverTimestamp(),
    date: today,
    eloDelta: Object.fromEntries([
      ...team0.map((pid, i) => [pid, gainsA[i]]), // CORREZIONE: usa guadagni individuali
      ...team1.map((pid, i) => [pid, gainsB[i]])  // CORREZIONE: usa guadagni individuali
    ])
  });

  function apply(pid, gain, didWin) {
    const r = rankings[pid];
    const newElo = (r.elo ?? config.startingElo) + gain;
    const wins = (r.wins || 0) + (didWin ? 1 : 0);
    const losses = (r.losses || 0) + (didWin ? 0 : 1);
    const streak = didWin ? (r.streak || 0) + 1 : 0;
    const peak = Math.max(newElo, r.peak || 0);
    const peakDate = newElo > (r.peak || 0) ? new Date().toISOString() : (r.peakDate || null);

    batch.set(doc(db, "rankings", `${type}-${pid}`), {
      playerId: pid, type,
      elo: newElo, wins, losses, lastMatchDate: today,
      streak, peak, peakDate, inactive: false,
      form: [didWin, ...(r.form || [])].slice(0, 10)
    }, { merge: true });
  }

  team0.forEach((pid, i) => apply(pid, Math.round(gainsA[i]), winnerTeam === 0));
  team1.forEach((pid, i) => apply(pid, Math.round(gainsB[i]), winnerTeam === 1));

  batch.set(doc(db, "meta", "config"), { totalMatches: (config.totalMatches || 0) + 1 }, { merge: true });

  await batch.commit();

  // Achievement "gigante"
  const diff = Math.abs(eloA - eloB);
  const addAchievement = async (pid) => {
    const ref = doc(db, "achievements", pid);
    const snap = await getDoc(ref);
    const base = snap.exists() ? snap.data() : {};
    const cur = base.gigante || { count: 0, lastDate: null, maxDiff: 0 };
    cur.count += 1;
    cur.lastDate = today;
    cur.maxDiff = Math.max(cur.maxDiff || 0, diff);
    await setDoc(ref, { gigante: cur }, { merge: true });
  };
  
  if (winnerTeam === 0 && eloB - eloA >= 150) for (const pid of team0) await addAchievement(pid);
  if (winnerTeam === 1 && eloA - eloB >= 150) for (const pid of team1) await addAchievement(pid);
}
