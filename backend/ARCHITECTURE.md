# Architecture Overview — Banfico Java AI Hackathon 2026

## Request flow

```
┌──────────────────────────┐
│  React + Vite  (:5173)   │
│  login → dashboard → chat│
└────────────┬─────────────┘
             │  Authorization: Bearer <portal session token>
             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Spring Boot 3.3 BFF  (:8080)                                    │
│                                                                  │
│  SessionInterceptor ── gates /api/** except /api/auth, /api/health│
│                                                                  │
│  controller/   AuthController   BankController   InsightsController│
│                ChatController   SeedController   DebugController  │
│                      │                                           │
│  service/      AggregationService ──► InsightsService (pure Java) │
│                      │                       │                   │
│                      │                       ▼                   │
│                      │                AiCoachService ──► Claude or local RAG   │
│                      ▼                                           │
│  mapping/      ObieMapper + CategoryResolver                     │
│                      │                                           │
│  service/      BankApiClient ──► AuthService (token cache)        │
└──────────────────────┬───────────────────────────────────────────┘
                       │  Bearer <Keycloak access token>
        ┌──────────────┴───────────────┐
        ▼                              ▼
 auth.obiebank-sbx.banfico.io   core-api.obiebank-sbx.banfico.io
 (Keycloak, password grant)     (OBIE AISP v4.0)
```

## Two independent identities — the key design decision

| | Who | Where | Purpose |
|---|---|---|---|
| **Portal login** | your demo users | `SessionService` + `app.portal-*` | gates the dashboard UI |
| **Bank service account** | the app itself | `AuthService` + `bank.username/password` | calls the sandbox |

The sandbox issued the team **one** credential, so a per-user Keycloak password
grant is impossible without handing every user the team's bank password. Treating
the bank credential as a service account and running our own portal login is how
a real TPP (third-party provider) is structured. State it that way if a judge asks
why the login is not the bank's login.

## Layer responsibilities

**`AuthService`** — password grant against Keycloak, one shared self-invalidating
token via `Mono.cacheInvalidateIf`, refreshed 30s before expiry.

**`BankApiClient`** — thin HTTP wrapper over the six OBIE endpoints. Returns raw
`JsonNode`; deliberately does no interpretation.

**`ObieMapper` + `CategoryResolver`** — the translation boundary. OBIE nesting,
date parsing, amount signing and MCC→category resolution happen here exactly
once, so charts, the AI layer and the API all agree on what a transaction is.

**`InsightsService`** — pure, deterministic analytics. No I/O, no randomness, no
model calls: monthly income vs expense, category breakdown with month-on-month
delta, top merchants, subscription detection, z-score anomaly detection, and a
0–100 financial health score with human-readable observations.

**`AggregationService`** — fans out across accounts and composes one `Overview`.
Blocks on the reactive client, which is correct in a servlet app.

**`AiCoachService`** — the only component that talks to hosted AI. Receives finished figures and narrates them. If the API key is missing or the provider is down, it falls back to a local retrieval/rules coach over computed insight facts, so demo coaching still works offline.

## Why AI never does arithmetic

`InsightsService` computes every number in Java. `AiCoachService` sends those
finished figures to the model with an explicit instruction never to calculate or
invent one. A hallucinated total is the single most damaging thing that can happen
in a finance demo — once a judge finds a figure that does not reconcile, nothing
else you show is trusted. This split also means the dashboard and assistant still work with no API key: hosted AI failures degrade to `mode=local-rag:*` answers instead of breaking the app.

## Frontend contract

```
POST /api/auth/login   {username, password} → 200 {success, sessionToken} | 401
GET  /api/auth/me                           → {username, authenticated}
GET  /api/accounts                          → [AccountDto]
GET  /api/accounts/{id}/balances            → [BalanceDto]
GET  /api/accounts/{id}/transactions        → [TransactionDto]
GET  /api/transactions                      → [TransactionDto]  (all accounts)
GET  /api/insights/overview                 → Overview  ← one call for the dashboard
GET  /api/insights/monthly | /categories | /subscriptions | /anomalies
GET  /api/insights/coach                    → AI coaching + health score
POST /api/chat            {message, history} → {answer}
POST /api/seed?accounts=2&months=6          → seeds the sandbox
GET  /api/health                            → public; verifies the token exchange
GET  /api/debug/raw/**                      → raw OBIE JSON
```

`TransactionDto.amount` is always positive; `credit` carries the direction.
`spring.jackson.default-property-inclusion: non_null` means null fields are
**absent** from the JSON rather than `null`.

## Known limits (say these before a judge finds them)

- Sessions are in-memory: a restart logs everyone out.
- One shared bank service account, so all portal users see the same data.
- No refresh-token rotation; the access token is simply re-fetched on expiry.
- `ObieMapper.collection()` probes several envelope shapes because the exact
  sandbox response was not verified at design time. Confirm via
  `/api/debug/raw/accounts` and delete the unused branches.
