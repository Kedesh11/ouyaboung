# ML Pipeline Contract

## Objective
Define a stable interface between behavioral data (web tracking) and Python ML services.

## Input Source
Primary export source: `GET /api/analytics/export`.
- Contains user-level feature vectors from `user_segments` / `user_scoring`.
- Optional CSV/JSON output for batch pipelines.

## Feature Families
- Intent: `intent_score`, `total_add_to_carts`, `total_checkout_intents`
- Engagement: `engagement_score`, `total_sessions`, `total_page_views`, `total_time_on_page_ms`
- Price sensitivity: `price_sensitivity_score`, `total_price_hesitations`
- Product dwell: `total_product_views`, `total_product_dwell_ms`
- Conversion: `total_purchases`
- Recency: `last_active_at`

## Expected Model Outputs
For each `user_id`:
- `intent_score` (0-100)
- `engagement_score` (0-100)
- `price_sensitivity_score` (0-100)
- `churn_risk_score` (0-100)
- `dynamic_segment` (string)
- optional `explanations` (top feature contributors)

## Writeback Contract
Write predictions to `POST /api/analytics/intelligence`:
- payload fields: `user_id`, one or more score fields, optional `dynamic_segment`, `source` (`ml` recommended)
- access: admin or `x-intelligence-key`

## Data Quality Rules
- Score bounds must be `[0, 100]`
- Unknown users are rejected
- Partial updates are allowed
- `updated_at` always managed server-side

## Retraining Cadence (recommended)
- Daily incremental training
- Weekly full retraining
- Monthly segment threshold review
