// migration.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// Usa la stessa config Firebase del tuo server.js
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

// Funzione per abbreviare nomi
function abbreviaNome(nome) {
    if (!nome) return '';
    const parti = nome.trim().split(' ');
    if (parti.length === 1) return parti[0].substring(0, 8);
    return parti[0].charAt(0) + '. ' + parti[parti.length - 1];
}

async function migrateToNewStructure() {
    console.log('🚀 Iniziando migrazione database...');
    
    const batch = writeBatch(db);
    const players = [
        "Nicola Nespoli", "Mattia Casulli", "Andrea Redaelli", 
        "Giacomo Belli", "Christian Joli", "Giacomo Meazzi", 
        "Davide Saccani", "Margherita Dassisti", "Riccardo Savarè"
    ];
    
    const playersMap = new Map();
    
    // 1. Crea struttura players
    players.forEach((name, index) => {
        const playerId = `player-${String(index + 1).padStart(3, '0')}`;
        playersMap.set(name, playerId);
        
        const playerRef = doc(db, 'players', playerId);
        batch.set(playerRef, {
            id: playerId,
            name: name,
            shortName: abbreviaNome(name),
            joinDate: new Date().toISOString().split('T')[0],
            active: true,
            preferences: {
                notifications: true,
                language: "it"
            }
        });
        console.log(`✓ Player creato: ${name} -> ${playerId}`);
    });
    
    // 2. Crea rankings iniziali
    ['singles', 'doubles'].forEach(type => {
        playersMap.forEach((playerId, playerName) => {
            const rankingRef = doc(db, 'rankings', `${type}-${playerId}`);
            batch.set(rankingRef, {
                playerId: playerId,
                type: type,
                elo: 1200,
                wins: 0,
                losses: 0,
                lastMatchDate: null,
                peak: 1200,
                peakDate: new Date().toISOString(),
                streak: 0,
                form: [],
                inactive: false
            });
        });
        console.log(`✓ Rankings ${type} creati`);
    });
    
    // 3. Configura meta
    const metaRef = doc(db, 'meta', 'config');
    batch.set(metaRef, {
        eloK: 32,
        inactivityDays: 30,
        startingElo: 1200,
        version: "2.0",
        migrationDate: new Date().toISOString(),
        totalMatches: 0,
        totalPlayers: players.length
    });
    console.log('✓ Meta config creata');
    
    // 4. Commit migrazione
    try {
        await batch.commit();
        console.log('✅ Migrazione completata con successo!');
        console.log('Players mapping:', Object.fromEntries(playersMap));
        
        // Salva mapping per riferimento
        localStorage.setItem('playersMap', JSON.stringify(Object.fromEntries(playersMap)));
        
        return { success: true, playersMap };
    } catch (error) {
        console.error('❌ Errore durante la migrazione:', error);
        return { success: false, error };
    }
}

// Esponi la funzione globalmente per chiamarla dalla console
window.migrateToNewStructure = migrateToNewStructure;
console.log('Migration script caricato! Usa window.migrateToNewStructure() per avviare.');

