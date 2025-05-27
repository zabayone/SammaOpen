// server.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqINXR7uKQw5edv6lic-8Xcdlx9PyJAKU",
  authDomain: "samma-open.firebaseapp.com",
  projectId: "samma-open",
  storageBucket: "samma-open.firebasestorage.app",
  messagingSenderId: "203807765703",
  appId: "1:203807765703:web:9923f6766f510de4993ae2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Carica dati da Firestore e inizializza dati mancanti
export async function loadLeaderboardData(players) {
  const singlesSnapshot = await getDocs(collection(db, 'singles'));
  const doublesSnapshot = await getDocs(collection(db, 'doubles'));

  const data = { singles: {}, doubles: {} };

  singlesSnapshot.forEach(docSnap => {
    data.singles[docSnap.id] = docSnap.data();
  });
  doublesSnapshot.forEach(docSnap => {
    data.doubles[docSnap.id] = docSnap.data();
  });

  for (const name of players) {
    for (const tab of ['singles', 'doubles']) {
      if (!data[tab][name]) {
        data[tab][name] = { elo: 1200, matches: [] };
        await setDoc(doc(db, tab, name), data[tab][name]);
      } else {
        if (data[tab][name].elo === undefined) data[tab][name].elo = 1200;
        if (!Array.isArray(data[tab][name].matches)) data[tab][name].matches = [];
        if (data[tab][name].wins === undefined) data[tab][name].wins = 0;
        if (data[tab][name].losses === undefined) data[tab][name].losses = 0; 
      }
    }
  }

  return data;
}


export async function checkPasskey(userInput) {
  const passkeyRef = doc(db, "Passkey", "Passkey");  // documento specifico
  const passkeySnap = await getDoc(passkeyRef);       // getDoc, non getDocs

  if (passkeySnap.exists()) {
    const storedPasskey = passkeySnap.data().int;
    return userInput === String(storedPasskey);
  } else {
    alert("Errore: passkey non trovata nel database.");
    return false;
  }
}

// Funzione che aggiorna elo e match in Firestore per singoli o doppi
export async function saveMatchResult(currentTab, updatedPlayersData) {
  // updatedPlayersData è un oggetto { playerName: { elo, matches }, ... }
  try {
    const updates = [];
    for (const [playerName, playerData] of Object.entries(updatedPlayersData)) {
      const docRef = doc(db, currentTab, playerName);
      updates.push(updateDoc(docRef, {
        elo: playerData.elo,
        matches: playerData.matches,
        wins: playerData.wins || 0,
        losses: playerData.losses || 0
      }));
    }
    await Promise.all(updates);
  } catch (e) {
    throw new Error("Errore aggiornando Firestore: " + e.message);
  }
}
