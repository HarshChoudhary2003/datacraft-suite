DROP POLICY IF EXISTS "Anyone can read audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Anyone can insert audit events" ON public.audit_events;
DROP POLICY IF EXISTS "Anyone can read telemetry runs" ON public.telemetry_runs;
DROP POLICY IF EXISTS "Anyone can insert telemetry runs" ON public.telemetry_runs;

REVOKE ALL ON public.audit_events FROM anon;
REVOKE ALL ON public.audit_events FROM authenticated;
REVOKE ALL ON public.telemetry_runs FROM anon;
REVOKE ALL ON public.telemetry_runs FROM authenticated;

GRANT ALL ON public.audit_events TO service_role;
GRANT ALL ON public.telemetry_runs TO service_role;