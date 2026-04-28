/**
 * storage/index.js
 * ──────────────────────────────────────────────────────────────
 * Aktív adapter: Supabase (multi-eszköz, valós idejű)
 *
 * Visszaváltás localStorage-ra (csak helyi fejlesztéshez):
 *   import { localStorageAdapter as storage } from "./localStorage";
 */

export { supabaseAdapter as storage } from "./supabase";
