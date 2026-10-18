# Pega Blueprint — Dispute Resolution Hub OpenAPI Contracts

OpenAPI 3.1 contract pack for the **Dispute Resolution Hub** hackathon demo (spec
`raw/logs/2026-10-11-pega-blueprint-spec.md`). These files are design-time inputs for
Pega Blueprint's **Data Objects / integrations** step: import each as a connection to a
**system of record** so the generated app has contract-real integrations, not fake tables.

## Files

| File | System of record | Operations |
|---|---|---|
| `payments.yaml` | Payments | GET /transactions/{transaction_id} · POST /refunds · PATCH /disputes/{dispute_id} |
| `crm.yaml` | CRM | GET /customers/{customer_id} · PATCH /crm-cases/{case_id} |
| `risk.yaml` | Risk | POST /risk-score |
| `notifications.yaml` | Notifications | POST /notifications/email |
| `documents.yaml` | Document AI | POST /documents/extract |

## Contract conventions

- OpenAPI **3.1.0**; all files declare a **bearer** security scheme. The credential itself
  is stored in Pega's secure credential configuration at connect time — the contract only
  declares the scheme.
- API payloads are **snake_case** (real external-system style). Pega case fields stay
  **camelCase** (`TransactionID` etc.). Mapping done at import time in Pega.
- Every operation documents `404`, `409`, `422` and `503` responses as relevant via the
  shared `Error` schema `{error_code, message}`. A `503` is transient — it triggers Pega's
  retry (read: 2x, write: 3x exponential backoff) and, after final failure, the Operations
  exception path.
- Example payloads cover the §10 mocks AND the §11 demo scenarios:
  - Auto-approve: 480.00 EUR, risk 22 (payments, risk)
  - Finance approval: 4800.00 EUR, risk 41 (payments, risk)
  - High-risk fraud: 1250.00 EUR, risk 87, unauthorized (payments, risk)
  - Missing evidence: 180.00 EUR, risk 35 (payments, risk)
  - Idempotent refund with `idempotency_key = dispute_id` (payments)

## Pega case-field mapping (README of record)

| Pega case field (spec §7.1) | API source |
|---|---|
| TransactionID / TransactionAmount / Currency / MerchantName / TransactionDate / TransactionStatus | `transaction_id` / `amount` / `currency` / `merchant_name` / `transaction_date` / `status` (payments) |
| CustomerID / CustomerTier / PriorDisputes12M | `customer_id` / `customer_tier` / `prior_disputes_12m` (crm) |
| RiskScore / RiskBand | `risk_score` / derived `risk_band` (risk) |
| ApprovedRefundAmount / RefundReference / SettlementDate | `refund_amount` / `refund_reference` / `expected_settlement_date` (payments) |

`ResolutionOutcome` (spec §7.5) is a **Pega-side data object** assembled from API
responses — it is not an external contract and has no OpenAPI file of its own.

## Validation

Run: `python3 validate.py .` (requires PyYAML). Or from the repo root: `python3 contracts/validate.py contracts`.

## Import into Blueprint

In Blueprint → Case Types → Data model / Data objects → **add a data object** → connect to
a **system of record** → import the matching OpenAPI YAML. See
[[pega-blueprint-build-path]] for the full demo path.
