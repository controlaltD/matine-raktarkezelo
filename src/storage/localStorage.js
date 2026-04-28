/**
 * storage/localStorage.js
 * ──────────────────────────────────────────────────────────────
 * Helyi (localStorage) adapter.  Egyetlen böngészőn/eszközön
 * működik – nincs szinkronizáció más eszközök felé.
 *
 * Használat: importáld ezt az src/storage/index.js-ben.
 */

const PREFIX = "matine2026:";

export const localStorageAdapter = {
  async get(key) {
    const val = localStorage.getItem(PREFIX + key);
    return val ? { key, value: val } : null;
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
};
