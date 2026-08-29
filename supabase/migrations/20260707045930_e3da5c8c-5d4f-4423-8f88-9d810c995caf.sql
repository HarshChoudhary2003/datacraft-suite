CREATE TABLE public.audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_session_idx ON public.audit_events (session_id, created_at DESC);
CREATE INDEX audit_events_created_idx ON public.audit_events (created_at DESC);

GRANT SELECT, INSERT ON public.audit_events TO anon;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read audit events" ON public.audit_events FOR SELECT USING (true);
CREATE POLICY "Anyone can insert audit events" ON public.audit_events FOR INSERT WITH CHECK (true);

CREATE TABLE public.telemetry_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  dataset_name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  col_count INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  rows_per_sec INTEGER NOT NULL DEFAULT 0,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_runs_session_idx ON public.telemetry_runs (session_id, created_at DESC);
CREATE INDEX telemetry_runs_dataset_idx ON public.telemetry_runs (dataset_name);
CREATE INDEX telemetry_runs_created_idx ON public.telemetry_runs (created_at DESC);

GRANT SELECT, INSERT ON public.telemetry_runs TO anon;
GRANT SELECT, INSERT ON public.telemetry_runs TO authenticated;
GRANT ALL ON public.telemetry_runs TO service_role;

ALTER TABLE public.telemetry_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read telemetry runs" ON public.telemetry_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert telemetry runs" ON public.telemetry_runs FOR INSERT WITH CHECK (true);