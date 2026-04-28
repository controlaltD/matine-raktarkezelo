/**
 * storage/supabase.js
 * ──────────────────────────────────────────────────────────────
 * Supabase adapter – PostgreSQL + valós idejű feliratkozás.
 *
 * Szükséges Supabase tábla (futtasd a supabase/schema.sql fájlt):
 *
 *   CREATE TABLE store (
 *     key   TEXT PRIMARY KEY,
 *     value TEXT NOT NULL,
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   ALTER TABLE store ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "public read"  ON store FOR SELECT USING (true);
 *   CREATE POLICY "public write" ON store FOR ALL    USING (true);
 *
 * BEÁLLÍTÁS:
 *   1. Hozz létre egy Supabase projektet: https://supabase.com
 *   2. SQL Editor → futtasd a supabase/schema.sql-t
 *   3. Project Settings → API → másold a Project URL-t és anon key-t
 *   4. Töltsd ki a .env fájlt (lásd .env.example)
 *   5. src/storage/index.js-ben cseréld le az importot:
 *        import { supabaseAdapter as storage } from './supabase';
 *
 * npm install @supabase/supabase-js
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const supabaseAdapter = {
  async get(key) {
    const { data, error } = await supabase
      .from("store")
      .select("value")
      .eq("key", key)
      .single();
    if (error || !data) return null;
    return { key, value: data.value };
  },

  async set(key, value) {
    const { error } = await supabase
      .from("store")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { key, value };
  },

  async delete(key) {
    const { error } = await supabase.from("store").delete().eq("key", key);
    if (error) throw error;
    return { key, deleted: true };
  },

  /**
   * Valós idejű feliratkozás – meghívja az onChange callbacket,
   * ha bármelyik eszköz módosítja az adott key-t.
   *
   * Visszatér egy cleanup funkcióval: hívd meg az unsubscribehoz.
   */
  subscribe(key, onChange) {
    const channel = supabase
      .channel(`store:${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store",
          filter: `key=eq.${key}`,
        },
        (payload) => {
          const newValue = payload.new?.value ?? null;
          onChange(newValue);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
