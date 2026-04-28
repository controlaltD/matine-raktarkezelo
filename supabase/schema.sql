-- ─────────────────────────────────────────────────────────────────────────────
-- Matiné 2026 – Raktárkezelő · Supabase séma
-- Futtasd: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Kulcs-érték tároló tábla
CREATE TABLE IF NOT EXISTS public.store (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Realtime engedélyezése (szükséges a push értesítésekhez)
ALTER TABLE public.store REPLICA IDENTITY FULL;

-- 3. Row Level Security (RLS) – bekapcsolva, de mindenki olvashat/írhat
--    Éles eseményen fontold meg IP vagy token alapú szűkítést.
ALTER TABLE public.store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read"
  ON public.store
  FOR SELECT
  USING (true);

CREATE POLICY "public insert"
  ON public.store
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public update"
  ON public.store
  FOR UPDATE
  USING (true);

CREATE POLICY "public delete"
  ON public.store
  FOR DELETE
  USING (true);

-- 4. Realtime publikáció (ha még nem létezik)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.store;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Opcionális: töröld az összes adatot az esemény után
-- DELETE FROM public.store;
-- ─────────────────────────────────────────────────────────────────────────────
