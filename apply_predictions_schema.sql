-- Add prediction dismissals table if it doesn't exist
CREATE TABLE IF NOT EXISTS prediction_dismissals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id),
    recipient VARCHAR(255),
    category VARCHAR(100),
    prediction_key VARCHAR(255) UNIQUE NOT NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at DATE
);

CREATE INDEX IF NOT EXISTS idx_prediction_dismissals_tenant ON prediction_dismissals(tenant_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_prediction_dismissals_key ON prediction_dismissals(prediction_key);
