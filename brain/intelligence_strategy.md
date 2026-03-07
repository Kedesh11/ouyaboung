# Intelligence Strategy (Tracking + Personalization + ML)

## Goal
Build a production-grade intelligence layer that converts behavioral events into:
- actionable user scores,
- dynamic segments,
- personalized UI decisions,
- ML-ready feature exports.

## Core Business KPIs
- Conversion rate: `purchase / product_view`
- Add-to-cart rate: `add_to_cart / product_view`
- Revenue per active user (RPAU)
- 7-day and 30-day retention
- Churn-risk distribution (high, medium, low)
- Discount dependency ratio (price-sensitive population)

## Intelligence Scores
- `intent_score`: buying readiness (checkout intent + cart actions + product views)
- `engagement_score`: interaction depth (sessions + page views + dwell)
- `price_sensitivity_score`: discount/price interaction propensity
- `churn_risk_score`: recency decay and low-engagement risk

## Segmentation Targets
- `Whales`: repeat buyers, low churn risk
- `Price-Sensitive`: high price interaction ratio
- `At-Risk`: decaying activity with prior engagement
- `Hot Prospect`: high intent, no purchase yet
- `Engaged Browser`: high engagement without conversion
- `New Visitor`: early lifecycle low data user

## Personalization Decisions
- Hero/banner variants by segment
- Product feed ranking boost by intent
- Discount-focused merchandising for price-sensitive users
- Retention prompts for at-risk users

## ML Evolution Path
1. Rule-based scoring (current)
2. Hybrid scoring (rules + calibrated ML probabilities)
3. Full model-driven personalization (online inference)

## Governance
- User events kept append-only
- No client direct write access to intelligence tables
- API-only write path for overrides/ML output
- Strict payload validation + rate limit on ingest API
