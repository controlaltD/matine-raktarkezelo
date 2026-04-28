# Matiné 2026 – Raktárkezelő

Multi-eszköz raktárkezelő · React + Vite · Supabase · Vercel · GitHub Actions

---

## Lokális fejlesztés

```bash
git clone https://github.com/<user>/matine-raktarkezelo.git
cd matine-raktarkezelo
npm install
cp .env.example .env   # töltsd ki
npm run dev            # http://localhost:5173
```

---

## Telepítési útmutató

### 1 · GitHub repo

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/<user>/matine-raktarkezelo.git
git push -u origin main
```

### 2 · Supabase

1. [supabase.com](https://supabase.com) → New project (régió: Frankfurt)
2. SQL Editor → New Query → illeszd be a `supabase/schema.sql` tartalmát → Run
3. Project Settings → API → másold ki a **Project URL** és **anon key** értékeket
4. Töltsd ki a `.env` fájlt ezekkel az értékekkel

### 3 · Vercel

1. [vercel.com](https://vercel.com) → Add New Project → importáld a GitHub repót
2. Framework: Vite (automatikusan felismeri)
3. Environment Variables fülön add hozzá: `VITE_SUPABASE_URL` és `VITE_SUPABASE_ANON_KEY`
4. Deploy → megkapod az élő URL-t

### 4 · GitHub Actions secrets

GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Hol találod |
|--------|-------------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `VERCEL_TOKEN` | Vercel → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Vercel → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → Project ID |

### 5 · Test deploy

```bash
git commit -m "test deploy" --allow-empty && git push
```
→ GitHub Actions (Actions fül) lefut, ~1-2 perc múlva él az app.

---

## Deploy flow

```
git push → GitHub Actions
              ├── npm ci
              ├── npm run build  (VITE_ env vars)
              └── vercel --prod → élő URL frissül
```

PR esetén Vercel automatikus preview URL-t generál.

---

## Realtime szinkron

Supabase Realtime websocket csatornán keresztül – ha bármelyik eszköz ment,
az összes többi azonnal push értesítéssel frissül (nincs polling).

```
Eszköz A ment → Supabase DB → websocket push → B, C, D eszköz frissül
```

---

## Struktúra

```
├── .github/workflows/deploy.yml   CI/CD pipeline
├── supabase/schema.sql            tábla + RLS + realtime
├── src/
│   ├── App.jsx                    alkalmazás
│   ├── main.jsx
│   └── storage/
│       ├── index.js               aktív adapter (itt váltasz)
│       ├── supabase.js            Supabase realtime adapter
│       └── localStorage.js        helyi fallback
├── vercel.json
├── .env.example
└── package.json
```
