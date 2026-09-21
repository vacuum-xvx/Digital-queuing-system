CREATE TABLE IF NOT EXISTS operator_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    window_id UUID REFERENCES windows(id) ON DELETE SET NULL,
    operator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_operator_incidents_branch ON operator_incidents(branch_id, created_at DESC);
