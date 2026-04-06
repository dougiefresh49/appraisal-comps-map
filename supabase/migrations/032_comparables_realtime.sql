-- Enable Realtime on the comparables table so useProject's
-- postgres_changes subscription actually receives events.
-- This supports multi-user editing: when one user (or the AI chat)
-- adds/removes/updates a comp, all open clients see the change.
alter publication supabase_realtime add table comparables;
