// server.js (schema consolidato con ID player-N)

import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc,
  serverTimestamp, writeBatch, runTransaction
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

// ===================== Config e mapping =====================

export async function getConfig() {
  const snap = await getDoc(doc(db, "meta", "config"));
  return snap.exists() ? snap.data() : { eloK: 32, inactivityDays: 30, startingElo: 1200, totalMatches: 0 };
} // [attached_file:4]

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
} // [attached_file:4]

// ===================== Leaderboard =====================

export async function loadLeaderboardData() {
  const playersSnap = await getDocs(collection(db, "players"));
  const players = {};
  playersSnap.forEach(d => { players[d.id] = d.data(); });

  const rSnap = await getDocs(collection(db, "rankings"));
  const data = { singles: {}, doubles: {} };

  rSnap.forEach(d => {
    const r = d.data();
    const pid = r.playerId;
    const name = players[pid]?.name || pid;
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
      matches: []
    };
  });

  // aggiorna cache name -> pid per rapidità (opzionale)
  const map = {};
  Object.entries(players).forEach(([pid, p]) => { if (p?.name) map[p.name] = pid; });
  localStorage.setItem("playersMap", JSON.stringify(map));

  return data;
} // [attached_file:4]

// ===================== Utili ELO =====================

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
} // [attached_file:4]

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
} // [attached_file:4]

// ===================== Passkey =====================

export async function checkPasskey(userInput) {
  const passkeySnap = await getDoc(doc(db, "Passkey", "Passkey"));
  if (!passkeySnap.exists()) return false;
  return String(passkeySnap.data().int) === String(userInput);
} // [attached_file:4]

// ===================== Salvataggio partite =====================

export async function saveMatchResult(payload) {
  const { type, playersByTeam, sets, surface } = payload;
  const config = await getConfig();

  const team0 = [];
  const team1 = [];

  if (playersByTeam[0]) {
    for (const n of playersByTeam[0]) {
      team0.push(await nameToPlayerId(n));
    }
  }
  if (playersByTeam[1]) {
    for (const n of playersByTeam[1]) {
      team1.push(await nameToPlayerId(n));
    }
  }

  const ids = [...team0, ...team1];

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

  const parsed = sets.map(s => s.trim()).filter(Boolean).map(s => s.split("-").map(x => parseInt(x, 10)));
  let winsA = 0, winsB = 0;
  parsed.forEach(([a, b]) => { if (a > b) winsA++; else winsB++; });
  const winnerTeam = winsA > winsB ? 0 : 1;

  const K = config.eloK || 40;
  const EA = expectedScore(eloA, eloB);
  const SA = winnerTeam === 0 ? 1 : 0;
  const deltaTeamA = K * (SA - EA);
  const deltaTeamB = -deltaTeamA;

  const splitEven = (delta, ids) => {
    const base = Math.trunc(delta / ids.length);
    let residue = Math.round(delta - base * ids.length);
    return ids.map((pid, i) => base + (i < Math.abs(residue) ? Math.sign(residue) : 0));
  };

  const gainsA = splitEven(deltaTeamA, team0);
  const gainsB = splitEven(deltaTeamB, team1);

  const today = isoDate();
  const batch = writeBatch(db);

  const matchRef = doc(collection(db, "matches"));
  batch.set(matchRef, {
    type,
    participants: [
      ...team0.map(pid => ({ pid, team: 0 })),
      ...team1.map(pid => ({ pid, team: 1 }))
    ],
    sets,
    winnerTeam,
    surface: surface || null,
    createdAt: serverTimestamp(),
    date: today,
    eloDelta: Object.fromEntries([
      ...team0.map((pid, i) => [pid, gainsA[i]]),
      ...team1.map((pid, i) => [pid, gainsB[i]])
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
} // [attached_file:4]

// ===================== Gestione giocatori =====================

// Contatore atomico per generare ID player-N
async function nextPlayerId() {
  const ref = doc(db, "meta", "counters");
  const num = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { lastPlayerNum: 0 };
    const next = (data.lastPlayerNum || 0) + 1;
    tx.set(ref, { lastPlayerNum: next }, { merge: true });
    return next;
  });
  return `player-${num}`;
} // [attached_file:4]

// Crea un nuovo giocatore con ID "player-N"
export async function createPlayer({ name, shortName, photoUrl }) {
  const pid = await nextPlayerId();
  await setDoc(doc(db, "players", pid), {
    name: String(name).trim(),
    shortName: String(shortName || name).trim(),
    photoUrl: photoUrl || null,
    createdAt: serverTimestamp()
  });
  // invalida cache name->id per riflettere subito il nuovo mapping
  localStorage.removeItem("playersMap");
  return pid;
} // [attached_file:4]

// Inizializza ranking per uno o più tipi (singles/doubles)
export async function ensureRanking(pid, types = ["singles"]) {
  const config = await getConfig();
  const starting = config.startingElo ?? 1200;
  const batch = writeBatch(db);
  for (const t of types) {
    const rref = doc(db, "rankings", `${t}-${pid}`);
    batch.set(rref, {
      playerId: pid,
      type: t,
      elo: starting,
      wins: 0,
      losses: 0,
      streak: 0,
      peak: starting,
      peakDate: null,
      lastMatchDate: null,
      inactive: false,
      form: []
    }, { merge: true });
  }
  await batch.commit();
} // [attached_file:4]

// Crea/aggiorna le statistiche del profilo (ID = pid)
export async function upsertPlayerStats(pid, stats) {
  const def = { dritto:5, rovescio:5, servizio:5, volee:5, stamina:5, gameplay:5, gold:0, silver:0, bronze:0, achievements:[] };
  const payload = { ...def, ...stats };
  await setDoc(doc(db, "player_stats", pid), payload, { merge: true });
} // [attached_file:3]

// ===================== (facoltativo) helper tutto-in-uno =====================

export async function createPlayerWithDefaults({ name, shortName, photoUrl, types = ["singles"], stats = {} }) {
  const pid = await createPlayer({ name, shortName, photoUrl });
  await ensureRanking(pid, types);
  await upsertPlayerStats(pid, stats);
  return pid;
} // [attached_file:3][attached_file:4]
