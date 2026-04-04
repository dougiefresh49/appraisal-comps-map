CREATE TABLE project_adjustment_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comp_type TEXT NOT NULL CHECK (comp_type IN ('land', 'sales')),
  grid_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, comp_type)
);

ALTER TABLE project_adjustment_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON project_adjustment_drafts
  FOR ALL USING (auth.role() = 'authenticated');
CREATE TRIGGER update_updated_at
  BEFORE UPDATE ON project_adjustment_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
