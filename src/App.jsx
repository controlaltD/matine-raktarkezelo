import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { storage } from "./storage";

// Ha az adapter nem támogatja a subscribe-ot, fallback pollra
const POLL_FALLBACK_MS = 15000;

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "matine2026-shared-v2";


const INIT_PRODUCTS = [
  { id: "p1", name: "Sör 0.5L", unit: "db" },
  { id: "p2", name: "Sör 0.3L", unit: "db" },
  { id: "p3", name: "Fehérbor", unit: "dl" },
  { id: "p4", name: "Vörösbor", unit: "dl" },
  { id: "p5", name: "Rosé", unit: "dl" },
  { id: "p6", name: "Pálinka", unit: "cl" },
  { id: "p7", name: "Üdítő 0.33L", unit: "db" },
  { id: "p8", name: "Víz 0.5L", unit: "db" },
];

const INIT_LOCATIONS = [
  { id: "r1", name: "Raktár 1", type: "r" },
  { id: "r2", name: "Raktár 2", type: "r" },
  { id: "r3", name: "Raktár 3", type: "r" },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i + 1}`, name: `Pult ${i + 1}`, type: "b" })),
];

const INIT_DATA = { products: INIT_PRODUCTS, locations: INIT_LOCATIONS, opening: {}, movements: [], closing: {} };

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const sk = (l, p) => `${l}__${p}`;
const deep = (x) => JSON.parse(JSON.stringify(x));

function calcStock(locId, prodId, opening, movements) {
  let v = opening[sk(locId, prodId)] ?? 0;
  for (const m of movements) {
    if (m.to === locId && m.prod === prodId) v += m.qty;
    if (m.from === locId && m.prod === prodId) v -= m.qty;
  }
  return v;
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 800);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── TOKENS ────────────────────────────────────────────────────────────────────
const T = {
  bg: "#080808", surface: "#0f0f0f", card: "#111",
  border: "#1e1e1e", borderHi: "#2a2a2a",
  amber: "#f59e0b", blue: "#60a5fa",
  text: "#e2e2e2", muted: "#666", dim: "#333",
  green: "#4ade80", red: "#ef4444",
  font: "'DM Mono','Courier New',monospace",
};

const css = {
  input: {
    background: "#141414", border: `1px solid ${T.borderHi}`, borderRadius: 8,
    padding: "11px 13px", color: T.text, fontSize: 14, fontFamily: T.font,
    width: "100%", boxSizing: "border-box", outline: "none",
  },
  label: { fontSize: 10, color: T.muted, letterSpacing: "0.12em", marginBottom: 5, display: "block" },
  sectionTitle: { fontSize: 11, letterSpacing: "0.15em", color: T.amber, fontWeight: 700, marginBottom: 18 },
  card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid #141414` },
};

function btn(active, color = T.amber) {
  return {
    background: active ? color : "#141414", color: active ? "#000" : T.muted,
    border: active ? "none" : `1px solid ${T.border}`, borderRadius: 8,
    padding: "10px 14px", fontSize: 11, fontWeight: active ? 700 : 400,
    cursor: "pointer", fontFamily: T.font, letterSpacing: "0.08em", transition: "all 0.15s",
  };
}

function pill(active, color) {
  return {
    background: active ? color + "22" : "transparent", color: active ? color : T.dim,
    border: `1px solid ${active ? color + "44" : T.border}`, borderRadius: 20,
    padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: T.font,
    fontWeight: active ? 700 : 400, flexShrink: 0, transition: "all 0.12s",
  };
}

// ─── SYNC INDICATOR ────────────────────────────────────────────────────────────
function SyncDot({ status, lastSync, onRefresh, full }) {
  const colors = { idle: T.dim, syncing: T.amber, ok: T.green, error: T.red };
  const glow = { ok: `0 0 8px ${T.green}66`, syncing: `0 0 8px ${T.amber}66`, error: `0 0 8px ${T.red}66`, idle: "none" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: colors[status], boxShadow: glow[status], flexShrink: 0 }} />
      {full && lastSync && (
        <span style={{ fontSize: 10, color: T.dim }}>
          {lastSync.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
      {full && !lastSync && <span style={{ fontSize: 10, color: T.dim }}>nincs szinkron</span>}
      <button onClick={onRefresh} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }} title="Frissítés">↻</button>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "keszlet", label: "Készlet", icon: "▦" },
  { id: "mozgas", label: "Mozgás", icon: "⇄" },
  { id: "leltar", label: "Leltár", icon: "≡" },
  { id: "elszam", label: "Elszámolás", icon: "∑" },
  { id: "beall", label: "Beállítások", icon: "◈" },
];

export default function App() {
  const [data, setData] = useState(INIT_DATA);
  const [tab, setTab] = useState("mozgas");
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSync, setLastSync] = useState(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const width = useWindowWidth();
  const isMobile = width < 768;

  // ── Storage helpers ──
  async function readShared() {
    const r = await storage.get(STORAGE_KEY);
    return r?.value ? JSON.parse(r.value) : null;
  }

  async function writeShared(d) {
    await storage.set(STORAGE_KEY, JSON.stringify(d));
  }

  // ── Load ──
  const load = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const d = await readShared();
      if (d) setData(d);
      setLastSync(new Date());
      setSyncStatus("ok");
      setLoaded(true);
    } catch {
      setSyncStatus("error");
      setLoaded(true);
    }
  }, []);

  // ── Supabase realtime subscription (+ poll fallback) ──
  useEffect(() => {
    load();
    let unsub = null;
    if (typeof storage.subscribe === "function") {
      unsub = storage.subscribe(STORAGE_KEY, (newValue) => {
        if (newValue) {
          try {
            setData(JSON.parse(newValue));
            setLastSync(new Date());
            setSyncStatus("ok");
          } catch {}
        }
      });
    } else {
      const id = setInterval(() => load(), POLL_FALLBACK_MS);
      unsub = () => clearInterval(id);
    }
    return () => { if (unsub) unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mutations ──

  // Generic update (config, stock) – read-modify-write
  const updateData = useCallback(async (fn) => {
    setSyncStatus("syncing");
    try {
      const latest = (await readShared()) || deep(dataRef.current);
      const updated = fn(deep(latest));
      await writeShared(updated);
      setData(updated);
      setLastSync(new Date());
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    }
  }, []);

  // Add movement – read-modify-write, idempotent
  const addMovement = useCallback(async (mov) => {
    setData(d => { const c = deep(d); c.movements.unshift(mov); return c; }); // optimistic
    setSyncStatus("syncing");
    try {
      const latest = (await readShared()) || deep(dataRef.current);
      if (!latest.movements.find(m => m.id === mov.id)) latest.movements.unshift(mov);
      await writeShared(latest);
      setData(latest);
      setLastSync(new Date());
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    }
  }, []);

  // Delete movement – read-modify-write
  const deleteMovement = useCallback(async (id) => {
    setData(d => { const c = deep(d); c.movements = c.movements.filter(m => m.id !== id); return c; });
    setSyncStatus("syncing");
    try {
      const latest = (await readShared()) || deep(dataRef.current);
      latest.movements = latest.movements.filter(m => m.id !== id);
      await writeShared(latest);
      setData(latest);
      setLastSync(new Date());
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
    }
  }, []);

  const resetData = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      await writeShared(INIT_DATA);
      setData(INIT_DATA);
      setLastSync(new Date());
      setSyncStatus("ok");
    } catch { setSyncStatus("error"); }
  }, []);

  if (!loaded) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font }}>
        <div style={{ color: T.amber, fontSize: 12, letterSpacing: "0.15em" }}>BETÖLTÉS...</div>
      </div>
    );
  }

  const viewProps = { data, updateData, addMovement, deleteMovement, resetData, isMobile };
  const currentTab = TABS.find(t => t.id === tab);

  return (
    <div style={{ fontFamily: T.font, background: T.bg, minHeight: "100vh", color: T.text, display: "flex" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && (
        <aside style={{
          width: 230, background: T.surface, borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column",
          position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 50,
        }}>
          <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.amber, letterSpacing: "-0.02em" }}>MATINÉ 2026</div>
            <div style={{ fontSize: 9, color: T.dim, letterSpacing: "0.2em", marginTop: 3 }}>RAKTÁRKEZELŐ · MULTI-ESZKÖZ</div>
          </div>
          <nav style={{ flex: 1, padding: "10px 0" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "12px 20px", background: tab === t.id ? T.amber + "12" : "none",
                border: "none", borderLeft: `2px solid ${tab === t.id ? T.amber : "transparent"}`,
                color: tab === t.id ? T.amber : "#3a3a3a", fontSize: 12, cursor: "pointer",
                fontFamily: T.font, letterSpacing: "0.08em", textAlign: "left", transition: "all 0.12s",
              }}>
                <span style={{ fontSize: 17, width: 22, textAlign: "center" }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}` }}>
            <SyncDot status={syncStatus} lastSync={lastSync} onRefresh={load} full />
            <div style={{ fontSize: 9, color: "#2a2a2a", marginTop: 6 }}>
              {data.movements.length} mozgás rögzítve
            </div>
          </div>
        </aside>
      )}

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, marginLeft: isMobile ? 0 : 230, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Mobile header */}
        {isMobile && (
          <header style={{
            background: T.surface, borderBottom: `1px solid ${T.border}`,
            padding: "12px 16px", display: "flex", alignItems: "center",
            position: "sticky", top: 0, zIndex: 50, flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>MATINÉ 2026</div>
              <div style={{ fontSize: 8, color: T.dim, letterSpacing: "0.18em" }}>RAKTÁRKEZELŐ</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <SyncDot status={syncStatus} lastSync={lastSync} onRefresh={load} />
            </div>
          </header>
        )}

        {/* Desktop page title bar */}
        {!isMobile && (
          <div style={{
            background: T.surface, borderBottom: `1px solid ${T.border}`,
            padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "sticky", top: 0, zIndex: 40,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16, color: T.amber }}>{currentTab?.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em" }}>
                {currentTab?.label?.toUpperCase()}
              </span>
            </div>
            <SyncDot status={syncStatus} lastSync={lastSync} onRefresh={load} full />
          </div>
        )}

        <main style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? 70 : 32 }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            {tab === "keszlet" && <KeszletView {...viewProps} />}
            {tab === "mozgas" && <MozgasView {...viewProps} />}
            {tab === "leltar" && <LeltarView {...viewProps} />}
            {tab === "elszam" && <ElszamolasView {...viewProps} />}
            {tab === "beall" && <BeallitasView {...viewProps} />}
          </div>
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: T.surface, borderTop: `1px solid ${T.border}`,
          display: "flex", zIndex: 100,
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 4px 8px", background: "none", border: "none",
              borderTop: `2px solid ${tab === t.id ? T.amber : "transparent"}`,
              color: tab === t.id ? T.amber : "#2e2e2e", fontSize: 8,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 3, fontFamily: T.font, letterSpacing: "0.05em",
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{t.icon}</span>
              <span>{t.label === "Elszámolás" ? "Elszám." : t.label === "Beállítások" ? "Beáll." : t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── KÉSZLET ───────────────────────────────────────────────────────────────────
function KeszletView({ data, isMobile }) {
  const { products, locations, opening, movements } = data;
  const [selLoc, setSelLoc] = useState(locations[0]?.id || "");
  const loc = locations.find(l => l.id === selLoc);
  const locColor = loc?.type === "r" ? T.amber : T.blue;

  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <div style={css.sectionTitle}>AKTUÁLIS KÉSZLET</div>

      {/* Location grid */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "─ RAKTÁRAK ─", type: "r", color: T.amber },
          { label: "─ PULTOK ─", type: "b", color: T.blue },
        ].map(grp => (
          <div key={grp.type} style={{ display: "contents" }}>
            {locations.filter(l => l.type === grp.type).map(l => (
              <button key={l.id} onClick={() => setSelLoc(l.id)} style={pill(selLoc === l.id, grp.color)}>
                {l.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {loc && (
        <div style={{ ...css.card, padding: 0 }}>
          <div style={{
            padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              background: locColor + "20", border: `1px solid ${locColor}33`,
              borderRadius: 5, padding: "3px 9px", fontSize: 9, color: locColor, letterSpacing: "0.15em",
            }}>
              {loc.type === "r" ? "RAKTÁR" : "PULT"}
            </div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{loc.name}</span>
          </div>
          {products.map(p => {
            const stock = calcStock(loc.id, p.id, opening, movements);
            const col = stock <= 0 ? T.red : stock < 5 ? T.amber : T.text;
            return (
              <div key={p.id} style={{ ...css.row, padding: "12px 16px" }}>
                <span style={{ fontSize: 13, color: "#aaa" }}>{p.name}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{stock}</span>
                  <span style={{ fontSize: 10, color: T.dim }}>{p.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MOZGÁS ────────────────────────────────────────────────────────────────────
function MozgasView({ data, addMovement, deleteMovement, isMobile }) {
  const { products, locations, opening, movements } = data;
  const [form, setForm] = useState({ from: "", to: "", prod: "", qty: "", note: "" });
  const [flash, setFlash] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const prodName = id => products.find(p => p.id === id)?.name || id;
  const prodUnit = id => products.find(p => p.id === id)?.unit || "";
  const locName = id => locations.find(l => l.id === id)?.name || id;

  const currentStock = form.from && form.prod
    ? calcStock(form.from, form.prod, opening, movements) : null;

  const submit = async () => {
    if (!form.from || !form.to || !form.prod || !form.qty) {
      setFlash({ type: "err", msg: "Tölts ki minden mezőt!" });
      return setTimeout(() => setFlash(null), 2500);
    }
    const qty = parseFloat(form.qty);
    if (isNaN(qty) || qty <= 0) {
      setFlash({ type: "err", msg: "Érvénytelen mennyiség!" });
      return setTimeout(() => setFlash(null), 2500);
    }
    if (qty > currentStock) {
      setFlash({ type: "err", msg: `Nincs elég! Max: ${currentStock} ${prodUnit(form.prod)}` });
      return setTimeout(() => setFlash(null), 2500);
    }
    setSaving(true);
    await addMovement({ id: Date.now().toString(), ts: new Date().toISOString(), from: form.from, to: form.to, prod: form.prod, qty, note: form.note });
    setSaving(false);
    setForm(f => ({ from: f.from, to: "", prod: f.prod, qty: "", note: "" }));
    setFlash({ type: "ok", msg: "Sikeresen rögzítve" });
    setTimeout(() => setFlash(null), 2000);
  };

  const visible = showAll ? movements : movements.slice(0, 8);

  const FormArea = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* FROM / TO */}
      <div style={{ display: isMobile ? "flex" : "grid", gridTemplateColumns: "1fr 1fr", flexDirection: "column", gap: 10 }}>
        {[
          { key: "from", label: "HONNAN" },
          { key: "to", label: "HOVA" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label style={css.label}>{label}</label>
            <select
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value, ...(key === "from" ? { to: "" } : {}) }))}
              style={{ ...css.input, color: form[key] ? T.text : "#444" }}
            >
              <option value="">Válassz helyszínt...</option>
              <optgroup label="─ RAKTÁRAK ─">
                {locations.filter(l => l.type === "r" && l.id !== (key === "to" ? form.from : null)).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
              <optgroup label="─ PULTOK ─">
                {locations.filter(l => l.type === "b" && l.id !== (key === "to" ? form.from : null)).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
        ))}
      </div>

      {/* PRODUCT */}
      <div>
        <label style={css.label}>TERMÉK</label>
        <select
          value={form.prod}
          onChange={e => setForm(f => ({ ...f, prod: e.target.value }))}
          style={{ ...css.input, color: form.prod ? T.text : "#444" }}
        >
          <option value="">Válassz terméket...</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* STOCK HINT */}
      {currentStock !== null && (
        <div style={{
          background: "#141414", border: `1px solid ${currentStock <= 0 ? T.red + "44" : T.border}`,
          borderRadius: 8, padding: "8px 13px", fontSize: 12,
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ color: T.muted }}>Elérhető készlet</span>
          <span style={{ fontWeight: 700, color: currentStock <= 0 ? T.red : T.amber }}>
            {currentStock} {prodUnit(form.prod)}
          </span>
        </div>
      )}

      {/* QTY + NOTE */}
      <div style={{ display: isMobile ? "flex" : "grid", gridTemplateColumns: "1fr 1fr", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={css.label}>MENNYISÉG{form.prod ? ` (${prodUnit(form.prod)})` : ""}</label>
          <input
            type="number" value={form.qty} min="0"
            onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
            placeholder="0"
            style={{ ...css.input, fontSize: 28, textAlign: "center", fontWeight: 700, padding: "12px" }}
          />
        </div>
        <div>
          <label style={css.label}>MEGJEGYZÉS (opcionális)</label>
          <input
            type="text" value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="pl. utánpótlás #2"
            style={{ ...css.input, height: isMobile ? "auto" : 50 }}
          />
        </div>
      </div>

      {/* FLASH */}
      {flash && (
        <div style={{
          background: flash.type === "ok" ? "#16a34a22" : "#ef444422",
          border: `1px solid ${flash.type === "ok" ? "#16a34a44" : "#ef444444"}`,
          borderRadius: 8, padding: "10px 14px", fontSize: 12,
          color: flash.type === "ok" ? T.green : "#f87171", textAlign: "center",
        }}>
          {flash.type === "ok" ? "✓ " : "✕ "}{flash.msg}
        </div>
      )}

      <button onClick={submit} disabled={saving} style={{
        background: saving ? "#333" : T.amber, color: saving ? T.muted : "#000",
        border: "none", borderRadius: 10, padding: "15px", fontSize: 13, fontWeight: 700,
        cursor: saving ? "not-allowed" : "pointer", fontFamily: T.font, letterSpacing: "0.1em",
      }}>
        {saving ? "MENTÉS..." : "MOZGÁS RÖGZÍTÉSE →"}
      </button>
    </div>
  );

  const LogArea = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ ...css.sectionTitle, marginBottom: 0 }}>NAPLÓ</span>
        {movements.length > 8 && (
          <button onClick={() => setShowAll(s => !s)} style={{
            background: "none", border: "none", color: T.amber, fontSize: 10,
            cursor: "pointer", fontFamily: T.font, letterSpacing: "0.1em",
          }}>
            {showAll ? "KEVESEBB" : `MIND (${movements.length})`}
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <div style={{ color: "#2a2a2a", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
          Még nincs rögzített mozgás
        </div>
      ) : visible.map(m => (
        <div key={m.id} style={{ ...css.card }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: T.amber, fontSize: 12 }}>{locName(m.from)}</span>
            <span style={{ color: T.dim }}>→</span>
            <span style={{ color: T.blue, fontSize: 12 }}>{locName(m.to)}</span>
            <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {m.qty} <span style={{ fontSize: 10, color: T.dim, fontWeight: 400 }}>{prodUnit(m.prod)}</span>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.muted }}>{prodName(m.prod)}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {m.note && <span style={{ fontSize: 10, color: "#444", fontStyle: "italic" }}>{m.note}</span>}
              <span style={{ fontSize: 10, color: "#2a2a2a" }}>
                {new Date(m.ts).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button onClick={() => deleteMovement(m.id)} style={{
                background: "none", border: "none", color: "#2e2e2e",
                fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1,
              }} title="Törlés">×</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <div style={css.sectionTitle}>MOZGÁS RÖGZÍTÉSE</div>
      {!isMobile ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>{FormArea}</div>
          <div>{LogArea}</div>
        </div>
      ) : (
        <>
          {FormArea}
          <div style={{ marginTop: 28 }}>{LogArea}</div>
        </>
      )}
    </div>
  );
}

// ─── LELTÁR ────────────────────────────────────────────────────────────────────
function LeltarView({ data, updateData, isMobile }) {
  const { products, locations, opening, closing } = data;
  const [mode, setMode] = useState("opening");
  const [selLoc, setSelLoc] = useState(locations[0]?.id || "");
  const stockMap = mode === "opening" ? opening : closing;
  const loc = locations.find(l => l.id === selLoc);
  const locColor = loc?.type === "r" ? T.amber : T.blue;

  const setVal = (locId, prodId, val) => {
    const num = parseFloat(val);
    updateData(d => {
      const key = sk(locId, prodId);
      if (mode === "opening") d.opening[key] = isNaN(num) || val === "" ? 0 : num;
      else d.closing[key] = isNaN(num) || val === "" ? 0 : num;
      return d;
    });
  };

  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <div style={css.sectionTitle}>LELTÁR RÖGZÍTÉSE</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[{ id: "opening", label: "NYITÓKÉSZLET" }, { id: "closing", label: "ZÁRÓKÉSZLET" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ ...btn(mode === m.id), flex: 1, padding: "12px 8px" }}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {[{ label: "─ R ─", type: "r", color: T.amber }, { label: "─ P ─", type: "b", color: T.blue }].map(grp =>
          locations.filter(l => l.type === grp.type).map(l => (
            <button key={l.id} onClick={() => setSelLoc(l.id)} style={pill(selLoc === l.id, grp.color)}>
              {l.name}
            </button>
          ))
        )}
      </div>

      {loc && (
        <div style={{ ...css.card, padding: 0 }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              background: locColor + "20", border: `1px solid ${locColor}33`,
              borderRadius: 5, padding: "3px 9px", fontSize: 9, color: locColor, letterSpacing: "0.15em",
            }}>
              {loc.type === "r" ? "RAKTÁR" : "PULT"}
            </div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{loc.name}</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: mode === "opening" ? T.amber + "55" : T.blue + "55", letterSpacing: "0.1em" }}>
              {mode === "opening" ? "NYITÓ" : "ZÁRÓ"}
            </span>
          </div>
          {products.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: `1px solid #141414` }}>
              <span style={{ flex: 1, fontSize: 13, color: "#aaa" }}>{p.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number" min="0"
                  value={stockMap[sk(loc.id, p.id)] !== undefined ? stockMap[sk(loc.id, p.id)] : ""}
                  onChange={e => setVal(loc.id, p.id, e.target.value)}
                  placeholder="0"
                  style={{ ...css.input, width: 90, textAlign: "right", fontSize: 18, fontWeight: 700, padding: "8px 10px" }}
                />
                <span style={{ fontSize: 10, color: T.dim, width: 24 }}>{p.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ELSZÁMOLÁS ────────────────────────────────────────────────────────────────
function ElszamolasView({ data, isMobile }) {
  const { products, locations, opening, movements, closing } = data;
  const [view, setView] = useState("pultok");
  const bars = locations.filter(l => l.type === "b");
  const warehouses = locations.filter(l => l.type === "r");

  function stats(loc, p) {
    const o = opening[sk(loc.id, p.id)] ?? 0;
    const rcv = movements.filter(m => m.to === loc.id && m.prod === p.id).reduce((s, m) => s + m.qty, 0);
    const snt = movements.filter(m => m.from === loc.id && m.prod === p.id).reduce((s, m) => s + m.qty, 0);
    const c = closing[sk(loc.id, p.id)];
    return { o, rcv, snt, theo: o + rcv - snt, c, consumed: c != null ? o + rcv - c : null };
  }

  const totals = products.map(p => {
    let total = 0;
    let partial = false;
    for (const bar of bars) {
      const { consumed } = stats(bar, p);
      if (consumed == null) { partial = true; continue; }
      total += consumed;
    }
    return { p, total, partial };
  });

  const gridHeader = (cols) => (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: "4px 10px", fontSize: 10, color: "#3a3a3a", marginBottom: 6, padding: "0 2px" }}>
      <span>Termék</span><span style={{ textAlign: "right" }}>Nyitó</span>
      <span style={{ textAlign: "right" }}>+Bejött</span>
      <span style={{ textAlign: "right" }}>Záró</span>
      <span style={{ textAlign: "right", color: T.amber }}>Fogyott</span>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <div style={css.sectionTitle}>ELSZÁMOLÁS</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {[{ id: "pultok", label: "PULTOK" }, { id: "raktarak", label: "RAKTÁRAK" }, { id: "osszeg", label: "ÖSSZESÍTŐ" }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{ ...btn(view === v.id), flex: 1, padding: "10px 6px" }}>{v.label}</button>
        ))}
      </div>

      {view === "pultok" && (
        <div style={!isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } : {}}>
          {bars.map(bar => {
            const rows = products.map(p => ({ p, s: stats(bar, p) })).filter(({ s }) => s.o > 0 || s.rcv > 0 || s.c != null);
            return (
              <div key={bar.id} style={css.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                  {bar.name}
                </div>
                {rows.length === 0 ? (
                  <div style={{ fontSize: 11, color: T.dim, textAlign: "center", padding: 8 }}>Nincs adat</div>
                ) : (
                  <>
                    {gridHeader("1fr auto auto auto auto")}
                    {rows.map(({ p, s }) => (
                      <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "4px 10px", fontSize: 11, padding: "5px 0", borderBottom: `1px solid #141414`, alignItems: "center" }}>
                        <span style={{ color: "#888" }}>{p.name}</span>
                        <span style={{ textAlign: "right", color: T.muted, fontVariantNumeric: "tabular-nums" }}>{s.o}</span>
                        <span style={{ textAlign: "right", color: s.rcv > 0 ? "#4ade8088" : T.muted, fontVariantNumeric: "tabular-nums" }}>+{s.rcv}</span>
                        <span style={{ textAlign: "right", color: T.muted, fontVariantNumeric: "tabular-nums" }}>{s.c ?? "—"}</span>
                        <span style={{ textAlign: "right", fontWeight: 700, color: s.consumed == null ? T.dim : s.consumed >= 0 ? T.text : T.red, fontVariantNumeric: "tabular-nums" }}>
                          {s.consumed != null ? s.consumed : "—"}
                          {s.consumed != null && <span style={{ fontSize: 9, fontWeight: 400, color: T.dim, marginLeft: 2 }}>{p.unit}</span>}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "raktarak" && (
        <div style={!isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 } : {}}>
          {warehouses.map(wh => {
            const rows = products.map(p => ({ p, s: stats(wh, p) })).filter(({ s }) => s.o > 0 || s.snt > 0 || s.c != null);
            return (
              <div key={wh.id} style={css.card}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.amber, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                  {wh.name}
                </div>
                {rows.length === 0 ? (
                  <div style={{ fontSize: 11, color: T.dim, textAlign: "center", padding: 8 }}>Nincs adat</div>
                ) : rows.map(({ p, s }) => {
                  const diff = s.c != null ? s.c - s.theo : null;
                  return (
                    <div key={p.id} style={{ padding: "7px 0", borderBottom: `1px solid #141414` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: "#aaa" }}>{p.name}</span>
                        <div>
                          <span style={{ fontWeight: 700, color: diff == null ? T.dim : diff === 0 ? T.green : diff > 0 ? T.amber : T.red, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                            {s.c != null ? s.c : "—"}
                          </span>
                          {diff != null && diff !== 0 && (
                            <span style={{ fontSize: 9, color: diff > 0 ? T.amber + "88" : T.red + "88", marginLeft: 4 }}>
                              ({diff > 0 ? "+" : ""}{diff})
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a3a3a" }}>
                        Nyitó {s.o} · Kiment -{s.snt} · Elmélet {s.theo} {p.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "osszeg" && (
        <>
          <div style={css.card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", fontSize: 10, color: "#3a3a3a", marginBottom: 10, padding: "0 2px" }}>
              <span>TERMÉK</span><span>ÖSSZ. FOGYASZTÁS</span>
            </div>
            {totals.map(({ p, total, partial }) => (
              <div key={p.id} style={css.row}>
                <div>
                  <div style={{ fontSize: 14 }}>{p.name}</div>
                  {partial && <div style={{ fontSize: 9, color: T.dim, marginTop: 2 }}>részleges (hiányzó záró)</div>}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: T.amber, fontVariantNumeric: "tabular-nums" }}>{total}</span>
                  <span style={{ fontSize: 11, color: T.dim }}>{p.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#2a2a2a", textAlign: "center", marginTop: 12 }}>
            Csak a zárókészlettel rögzített pultok szerepelnek az összesítőben
          </div>
        </>
      )}
    </div>
  );
}

// ─── IMPORT PANEL ──────────────────────────────────────────────────────────────
function ImportPanel({ onImport, onClose }) {
  const [stage, setStage] = useState("drop");   // drop | mapping | preview
  const [rows, setRows] = useState([]);           // raw 2D array from file
  const [fileName, setFileName] = useState("");
  const [nameCol, setNameCol] = useState(0);
  const [unitCol, setUnitCol] = useState(-1);     // -1 = nincs
  const [hasHeader, setHasHeader] = useState(true);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  // Column headers for selects
  const colOptions = rows[0]
    ? rows[0].map((_, i) => ({ value: i, label: `${String.fromCharCode(65 + i)} oszlop ${rows[0][i] ? `(${String(rows[0][i]).slice(0,18)})` : ""}` }))
    : [];

  // Data rows (skip header if needed)
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Preview products
  const preview = dataRows
    .map(r => ({
      name: String(r[nameCol] ?? "").trim(),
      unit: unitCol >= 0 ? String(r[unitCol] ?? "").trim() : "db",
    }))
    .filter(p => p.name);

  async function handleFile(file) {
    if (!file) return;
    setParseError("");
    setLoading(true);
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();

    try {
      if (ext === "csv") {
        const text = await file.text();
        // Detect delimiter: comma or semicolon
        const delim = text.includes(";") ? ";" : ",";
        const parsed = text.split(/\r?\n/).map(line => {
          // Handle quoted fields
          const result = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; }
            else if (ch === delim && !inQ) { result.push(cur.trim()); cur = ""; }
            else { cur += ch; }
          }
          result.push(cur.trim());
          return result;
        }).filter(r => r.some(c => c));
        setRows(parsed);
        // Auto-detect: if first row looks like header, pre-select unit col if it exists
        autoDetect(parsed);
        setStage("mapping");
      } else {
        // Excel via SheetJS (npm package)
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })
          .filter(r => r.some(c => c !== "" && c !== null && c !== undefined));
        setRows(parsed);
        autoDetect(parsed);
        setStage("mapping");
      }
    } catch (e) {
      setParseError("Nem sikerült beolvasni a fájlt. Ellenőrizd a formátumot.");
    }
    setLoading(false);
  }

  function autoDetect(parsed) {
    if (!parsed.length) return;
    const header = parsed[0].map(c => String(c).toLowerCase());
    // Try to find name column
    const nameIdx = header.findIndex(h => h.includes("név") || h.includes("termék") || h.includes("name") || h.includes("megnevez"));
    if (nameIdx >= 0) setNameCol(nameIdx);
    // Try to find unit column
    const unitIdx = header.findIndex(h => h.includes("egység") || h.includes("unit") || h.includes("me") || h.includes("mértékegység"));
    if (unitIdx >= 0) setUnitCol(unitIdx);
  }

  function doImport(mode) {
    onImport(preview, mode); // mode: "add" | "replace"
  }

  const dropStyle = {
    border: `2px dashed ${T.borderHi}`, borderRadius: 12,
    padding: "32px 20px", textAlign: "center", cursor: "pointer",
    background: "#0d0d0d", transition: "border-color 0.2s",
  };

  return (
    <div style={{ ...css.card, border: `1px solid ${T.amber}33`, marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: T.amber, letterSpacing: "0.12em", fontWeight: 700 }}>
          EXCEL / CSV IMPORT
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {/* Stage: DROP */}
      {stage === "drop" && (
        <>
          <div
            style={dropStyle}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          >
            {loading ? (
              <div style={{ color: T.amber, fontSize: 12 }}>Beolvasás...</div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>Kattints vagy húzd ide a fájlt</div>
                <div style={{ fontSize: 10, color: T.muted }}>Excel (.xlsx, .xls) vagy CSV (.csv)</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
          {parseError && <div style={{ color: T.red, fontSize: 11, marginTop: 10, textAlign: "center" }}>{parseError}</div>}
          <div style={{ marginTop: 14, fontSize: 10, color: "#2e2e2e", lineHeight: 1.7 }}>
            A fájlnak legalább egy oszlopot kell tartalmaznia a terméknevekkel.<br />
            Ha van mértékegység oszlop is, azt a következő lépésben megadhatod.
          </div>
        </>
      )}

      {/* Stage: MAPPING */}
      {stage === "mapping" && (
        <>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 14 }}>
            Fájl: <span style={{ color: T.text }}>{fileName}</span>
            <span style={{ color: T.dim }}> · {rows.length} sor</span>
          </div>

          {/* Raw preview */}
          <div style={{ marginBottom: 16, overflowX: "auto" }}>
            <div style={{ fontSize: 9, color: T.dim, letterSpacing: "0.1em", marginBottom: 6 }}>ELŐNÉZET (első 4 sor)</div>
            <table style={{ borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
              <tbody>
                {rows.slice(0, 4).map((row, ri) => (
                  <tr key={ri} style={{ background: ri === 0 && hasHeader ? "#1a1600" : "transparent" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{
                        border: `1px solid ${T.border}`, padding: "5px 10px",
                        color: ri === 0 && hasHeader ? T.amber : T.text,
                        maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
                        background: ci === nameCol ? "#0d1a0d" : ci === unitCol ? "#0d0d1a" : "transparent",
                      }}>
                        {String(cell).slice(0, 20)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)}
                style={{ accentColor: T.amber }} />
              <span style={{ color: T.muted }}>Az első sor fejléc (kihagyás)</span>
            </label>

            <div>
              <label style={{ ...css.label, color: T.green }}>TERMÉKNÉV OSZLOP *</label>
              <select value={nameCol} onChange={e => setNameCol(+e.target.value)} style={{ ...css.input }}>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label style={{ ...css.label, color: T.blue }}>MÉRTÉKEGYSÉG OSZLOP (opcionális)</label>
              <select value={unitCol} onChange={e => setUnitCol(+e.target.value)} style={{ ...css.input }}>
                <option value={-1}>— nincs (alapértelmezett: "db") —</option>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setStage("drop"); setRows([]); }} style={{ ...btn(false), flex: 1 }}>← VISSZA</button>
            <button onClick={() => setStage("preview")} disabled={!preview.length} style={{
              flex: 2, background: preview.length ? T.amber : "#333", color: preview.length ? "#000" : T.muted,
              border: "none", borderRadius: 8, padding: "11px", fontSize: 12, fontWeight: 700,
              cursor: preview.length ? "pointer" : "not-allowed", fontFamily: T.font, letterSpacing: "0.08em",
            }}>
              ELŐNÉZET ({preview.length} termék) →
            </button>
          </div>
        </>
      )}

      {/* Stage: PREVIEW */}
      {stage === "preview" && (
        <>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
            {preview.length} termék importálásra kész:
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 16, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            {preview.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: i < preview.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span style={{ fontSize: 13, color: T.text }}>{p.name}</span>
                <span style={{ fontSize: 11, color: T.muted, background: "#1a1a1a", borderRadius: 4, padding: "2px 7px" }}>{p.unit}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: T.muted, marginBottom: 14 }}>
            Hogyan importáljuk?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStage("mapping")} style={{ ...btn(false) }}>← VISSZA</button>
            <button onClick={() => doImport("add")} style={{
              flex: 1, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
              padding: "11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, letterSpacing: "0.06em",
            }}>
              + HOZZÁAD<br /><span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>meglévők megmaradnak</span>
            </button>
            <button onClick={() => doImport("replace")} style={{
              flex: 1, background: T.amber, color: "#000", border: "none", borderRadius: 8,
              padding: "11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, letterSpacing: "0.06em",
            }}>
              CSERE<br /><span style={{ fontSize: 9, fontWeight: 400, opacity: 0.6 }}>régi lista törlődik</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── BEÁLLÍTÁSOK ───────────────────────────────────────────────────────────────
function BeallitasView({ data, updateData, resetData, isMobile }) {
  const [sub, setSub] = useState("loc");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("db");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFlash, setImportFlash] = useState("");

  const addProduct = () => {
    if (!newName.trim()) return;
    updateData(d => {
      d.products.push({ id: "p" + Date.now(), name: newName.trim(), unit: newUnit || "db" });
      return d;
    });
    setNewName("");
  };

  const handleImport = (products, mode) => {
    updateData(d => {
      const newProds = products.map(p => ({ id: "p" + Date.now() + Math.random().toString(36).slice(2), name: p.name, unit: p.unit || "db" }));
      if (mode === "replace") {
        d.products = newProds;
        setImportFlash(`✓ ${newProds.length} termék importálva (lista cserélve)`);
      } else {
        d.products = [...d.products, ...newProds];
        setImportFlash(`✓ ${newProds.length} termék hozzáadva`);
      }
      return d;
    });
    setShowImport(false);
    setTimeout(() => setImportFlash(""), 3000);
  };

  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <div style={css.sectionTitle}>BEÁLLÍTÁSOK</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {[{ id: "loc", label: "HELYSZÍNEK" }, { id: "prod", label: "TERMÉKEK" }, { id: "adatok", label: "ADATOK" }].map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{ ...btn(sub === t.id), flex: 1, padding: "10px 6px" }}>{t.label}</button>
        ))}
      </div>

      {sub === "loc" && (
        <div style={!isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 } : {}}>
          {[{ label: "RAKTÁRAK", type: "r", color: T.amber }, { label: "PULTOK", type: "b", color: T.blue }].map(grp => (
            <div key={grp.type}>
              <div style={{ fontSize: 9, color: grp.color, letterSpacing: "0.15em", marginBottom: 10 }}>{grp.label}</div>
              {data.locations.filter(l => l.type === grp.type).map(loc => (
                <div key={loc.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: grp.color, flexShrink: 0 }} />
                  <input
                    value={loc.name}
                    onChange={e => updateData(d => {
                      d.locations = d.locations.map(l => l.id === loc.id ? { ...l, name: e.target.value } : l);
                      return d;
                    })}
                    style={css.input}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {sub === "prod" && (
        <>
          {/* Import flash */}
          {importFlash && (
            <div style={{ background: "#16a34a22", border: "1px solid #16a34a44", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.green, marginBottom: 12 }}>
              {importFlash}
            </div>
          )}

          {/* Import button or panel */}
          {!showImport ? (
            <button onClick={() => setShowImport(true)} style={{
              width: "100%", background: "#0d1200", border: `1px dashed ${T.amber}44`,
              borderRadius: 8, padding: "11px", fontSize: 11, color: T.amber,
              cursor: "pointer", fontFamily: T.font, letterSpacing: "0.1em", marginBottom: 16,
            }}>
              ↑ EXCEL / CSV IMPORT
            </button>
          ) : (
            <ImportPanel onImport={handleImport} onClose={() => setShowImport(false)} />
          )}

          {/* Divider */}
          {!showImport && (
            <>
              <div style={{ fontSize: 9, color: T.dim, letterSpacing: "0.12em", marginBottom: 10 }}>TERMÉKEK MANUÁLISAN</div>
              {data.products.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <input
                    value={p.name}
                    onChange={e => updateData(d => { d.products = d.products.map(x => x.id === p.id ? { ...x, name: e.target.value } : x); return d; })}
                    style={{ ...css.input, flex: 2 }}
                  />
                  <input
                    value={p.unit}
                    onChange={e => updateData(d => { d.products = d.products.map(x => x.id === p.id ? { ...x, unit: e.target.value } : x); return d; })}
                    style={{ ...css.input, width: 56, textAlign: "center", padding: "11px 6px" }}
                  />
                  <button onClick={() => updateData(d => { d.products = d.products.filter(x => x.id !== p.id); return d; })}
                    style={{ background: "none", border: "none", color: "#333", fontSize: 20, cursor: "pointer", padding: "4px", lineHeight: 1 }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Új termék neve..."
                  onKeyDown={e => e.key === "Enter" && addProduct()} style={{ ...css.input, flex: 2 }} />
                <input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="db"
                  style={{ ...css.input, width: 56, textAlign: "center", padding: "11px 6px" }} />
                <button onClick={addProduct} style={{ background: T.amber, color: "#000", border: "none", borderRadius: 8, padding: "11px 16px", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
            </>
          )}
        </>
      )}

      {sub === "adatok" && (
        <>
          <div style={{ display: isMobile ? "flex" : "grid", flexDirection: "column", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
            {[
              { label: "Mozgások", value: data.movements.length },
              { label: "Nyitó bejegyzések", value: Object.values(data.opening).filter(v => v > 0).length },
              { label: "Záró bejegyzések", value: Object.keys(data.closing).length },
            ].map(s => (
              <div key={s.label} style={css.card}>
                <div style={{ fontSize: 9, color: T.dim, marginBottom: 4, letterSpacing: "0.1em" }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.text }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
            {!confirmReset ? (
              <button onClick={() => setConfirmReset(true)} style={{
                background: "none", border: `1px solid #2a2a2a`, borderRadius: 8,
                color: "#444", padding: "12px", width: "100%", fontSize: 11,
                cursor: "pointer", fontFamily: T.font, letterSpacing: "0.1em",
              }}>
                ÖSSZES ADAT TÖRLÉSE
              </button>
            ) : (
              <div style={{ ...css.card, border: `1px solid ${T.red}33` }}>
                <div style={{ fontSize: 12, color: "#f87171", marginBottom: 12, textAlign: "center" }}>
                  Biztosan törlöd az összes adatot? Ez visszafordíthatatlan.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfirmReset(false)} style={{ ...btn(false), flex: 1 }}>MÉGSE</button>
                  <button onClick={() => { resetData(); setConfirmReset(false); }} style={{
                    flex: 1, background: T.red, color: "#fff", border: "none", borderRadius: 8,
                    padding: "10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font, letterSpacing: "0.08em",
                  }}>TÖRLÉS</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
