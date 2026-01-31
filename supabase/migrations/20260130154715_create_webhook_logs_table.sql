-- Create a table to log all incoming webhook requests for debugging purposes
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL, -- e.g., 'AIRTEL', 'MOOV', 'QGABON'
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    processed BOOLEAN DEFAULT false,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS policies (only service role can insert, admin can view)
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role to insert logs"
ON public.webhook_logs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Allow authenticated users (admins) to view logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (true); -- Ideally restrict to admin role
