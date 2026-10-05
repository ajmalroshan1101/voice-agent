## Why the Calls page feels slow

In `src/pages/Calls.tsx → load()`, the table waits for **three** requests before showing anything:

1. `vapi-list-calls` (Vapi API, up to 100 calls — the slowest, often 2–5s)
2. `loadAnalyses()` (Supabase `call_analyses` full table scan)
3. `loadDirectories()` → `vapi-list-numbers` + `vapi-list-assistants` (2 more Vapi API calls)

`Promise.all` waits for the slowest, so the table stays on "Loading calls…" until everything resolves. Also, every time you navigate to `/calls` the whole chain runs again from scratch — no cache.

## Plan

### 1. Render calls the moment they arrive (don't block on directories/analyses)
- Kick off `vapi-list-calls`, `loadAnalyses()`, and `loadDirectories()` in parallel but set `setCalls(...)` + `setLoading(false)` as soon as `vapi-list-calls` resolves.
- Analyses and directories fill in progressively — the "From / Agent / Intent / Summary" columns just render `—` for a fraction of a second then update. No UI blocking.

### 2. Stale-while-revalidate cache (instant repeat loads)
- Cache the last `calls` array + `analyses` map + `numbersMap` + `assistantsMap` in `sessionStorage` (key + timestamp).
- On mount: if cache exists and is < 60s old, hydrate state immediately (`loading = false`) and silently re-fetch in the background. Result: navigating back to `/calls` shows the table instantly.

### 3. Lighter `vapi-list-calls` payload
- The Vapi `/call?limit=100` response is large (full transcripts, messages, analysis JSON for each call). For the table we only need id, status, endedReason, startedAt/endedAt, createdAt, customer, phoneNumberId, assistantId.
- In `supabase/functions/vapi-list-calls/index.ts`, after fetching, strip heavy fields (`messages`, `transcript`, `artifact`, `analysis.structuredData`, `monitor`, etc.) before returning. The full payload is already fetched on row-click via `vapi-get-call`.
- Add an optional `?limit=` query param (default 50 instead of 100) to cut Vapi response time roughly in half.

### 4. Cache directory lookups longer
- Numbers and assistants change rarely. Cache `numbersMap`/`assistantsMap` in `localStorage` with a 10-minute TTL so they're effectively free on every visit.

### 5. Smaller realtime churn
- The current `email_tokens` realtime subscription calls `loadAnalyses()` (full table re-fetch) on every change. Debounce it (e.g. 1.5s) so a burst of inserts doesn't trigger multiple full scans.

## Files touched

- `src/pages/Calls.tsx` — split `load()`, add sessionStorage cache hydration, debounce realtime refresh.
- `supabase/functions/vapi-list-calls/index.ts` — strip heavy fields, accept `limit` param (default 50).

## Expected result

- First visit: table appears as soon as Vapi returns the (now smaller) call list — roughly 30–60% faster.
- Repeat visits within 60s: table appears **instantly** from cache, refreshes silently in the background.
- "From" / "Agent" columns populate without blocking the table render.

No backend schema or business-logic changes.
