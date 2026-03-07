# Analytics & Intelligence API

## 1) Ingest Events
`POST /api/analytics/events`

### Purpose
Batch ingestion endpoint for behavioral events (`user_events`).

### Validation
- Zod schema validation
- max batch size: `100`
- strict event type whitelist

### Protection
- Sliding-window rate limiting by IP
- Structured error responses with `request_id`

### Example payload
```json
{
  "events": [
    {
      "event_type": "page_view",
      "route": "/search",
      "session_id": "d3f...",
      "user_id": null,
      "device_type": "mobile",
      "user_agent": "Mozilla/...",
      "referrer": "",
      "metadata": { "source": "page" },
      "client_ts": 1772850123456
    }
  ]
}
```

## 2) Export Features
`GET /api/analytics/export`

### Purpose
Export ML-ready user feature vectors.

### Access
- Admin authenticated user OR
- `x-analytics-export-key` header

### Query params
- `format=json|csv` (default `json`)
- `limit` (1..5000)
- `from`, `to` (ISO datetime; optional)

## 3) Intelligence Read/Write
`GET /api/analytics/intelligence`
`POST /api/analytics/intelligence`

### GET
- Returns merged intelligence profile (computed + override)
- Normal user: own profile only
- Admin/service key: can query `?user_id=<uuid>`

### POST
- Upsert intelligence scores (`user_intelligence_scores`)
- Admin or `x-intelligence-key` required

### Write payload
```json
{
  "user_id": "uuid",
  "intent_score": 72,
  "engagement_score": 64,
  "price_sensitivity_score": 41,
  "churn_risk_score": 28,
  "dynamic_segment": "Hot Prospect",
  "source": "ml"
}
```

## 4) Admin Traffic Metrics
`GET /api/admin/traffic-metrics`

### Purpose
Expose dashboard-ready traffic KPIs:
- visiteurs/jour,
- pages vues/jour,
- taux de visite (visiteurs du jour / utilisateurs inscrits),
- installations PWA (total + 30 jours),
- visiteurs récurrents (7 jours).

### Access
- Admin authenticated user only.

### Query params
- `days` (optional, 7..90, default `14`)
