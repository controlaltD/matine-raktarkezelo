/**
 * storage/firebase.js
 * ──────────────────────────────────────────────────────────────
 * Firebase Realtime Database adapter – valós idejű szinkronizáció
 * több eszköz között.
 *
 * BEÁLLÍTÁS:
 *   1. Hozz létre egy Firebase projektet: https://console.firebase.google.com
 *   2. Realtime Database → Create Database (tesztelési módban)
 *   3. Projekt beállítások → Saját alkalmazások → Web app hozzáadása
 *   4. Másold a config-ot .env fájlba (lásd .env.example)
 *   5. Az src/storage/index.js-ben cseréld le az adaptert:
 *        import { firebaseAdapter as storage } from './firebase';
 *
 * npm install firebase
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, remove } from "firebase/database";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PATH = "matine2026";

export const firebaseAdapter = {
  async get(key) {
    const snap = await get(ref(db, `${PATH}/${key}`));
    if (!snap.exists()) return null;
    return { key, value: snap.val() };
  },
  async set(key, value) {
    await set(ref(db, `${PATH}/${key}`), value);
    return { key, value };
  },
  async delete(key) {
    await remove(ref(db, `${PATH}/${key}`));
    return { key, deleted: true };
  },
};
