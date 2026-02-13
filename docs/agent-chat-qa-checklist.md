# Agent Chat QA Checklist

Scope: chat send path via `daveri_send_message_credit_limited`, credit HUD, quota UX, retry/idempotency.

## Pre-setup

1. Sign in as test user with AI feature enabled.
2. Open any page with AI dock visible.
3. Open browser devtools console for quick checks.
4. Ensure chat is expanded.

## Manual Test Cases

### 1) New User: caps visible, send works, usage increases

1. Open Credit HUD tooltip.
2. Confirm `Daily: used/cap` and `Monthly: used/cap` are visible and caps are non-zero.
3. Send one normal message.
4. Verify optimistic `sending...` bubble appears with `Cancel`.
5. Wait for success.
6. Verify optimistic bubble becomes final user bubble (no sending state).
7. Verify assistant response arrives (or fallback assistant text if upstream unavailable).
8. Re-open Credit HUD and verify usage increased after send.

Expected:
- Send succeeds.
- No duplicate user message.
- Credit usage updates after send.

### 2) Quota exceeded: RPC returns 0 rows

How to simulate:
- Set test user usage to cap in DB, or set tiny cap in test environment.

1. Open chat and send message.
2. Verify optimistic bubble is removed.
3. Verify `QuotaExceededModal` opens.
4. Verify modal shows daily/monthly usage and reset copy.
5. Verify CTA buttons are visible (`Upgrade plan`, `Dokup kredyty`), or onboarding mode with `Wybierz plan` when cap is `0`.

Expected:
- No new final user message in thread.
- Quota modal shown.
- No silent failure.

### 3) Offline/network error: toast + retry + no double send

How to simulate:
- DevTools -> Network -> Offline (or block Supabase domain).

1. Send a message while offline.
2. Verify optimistic bubble changes to `failed` with `Retry` action.
3. Verify toast about network/server error appears.
4. Click `Retry` once while still offline.
5. Verify only one sending/failed flow per click (no duplicate sends from one action).
6. Restore network and click `Retry` again.
7. Verify message succeeds and finalizes once.

Expected:
- Retry path works.
- No double-send for same inflight request.
- New retry generates new client request id.

### 4) Refresh status after send

1. Open Credit HUD tooltip and note current usage.
2. Send message successfully.
3. Confirm usage refreshes (automatic post-send refresh and/or updated snapshot values).

Expected:
- Credit status reflects latest usage shortly after send.

## Focused Regression Points

1. `client_request_id` added into `p_meta` for each send.
2. `Cancel` removes optimistic bubble and prevents stale completion from mutating UI.
3. Quota (`0 rows`) never appends final user message.
4. `daily_cap == 0` or `monthly_cap == 0` shows onboarding variant (`Wybierz plan`).
5. Warning badge visible when daily or monthly usage >= 80%.

## E2E Status

No Playwright/Cypress harness is currently configured in this repository (no runner/config/deps detected), so automated E2E tests were not added in this change.

When E2E is added, implement minimum:
1. `success send`: optimistic -> sent, single message persisted, usage refresh.
2. `quota exceeded`: mocked `rpc` returns `[]`, optimistic removed, quota modal visible.

## Auth Migration Checklist (Supabase-only)

1. Sign up with email/password on `/login`.
2. In Supabase dashboard -> Auth -> Users, confirm user exists.
3. Sign in on `/login` with the same user.
4. In browser console, verify auth logs show `session exists: true`.
5. In browser Network, verify RPC calls use `Authorization: Bearer eyJ...`.
6. In DB `public.users`, verify row exists:
   - `id = <auth.uid() as text>`
   - `email = <auth user email>`
7. Open dashboard/chat and confirm no `401`/`42501` in network for credit RPC path.
8. Click logout in sidebar.
9. Confirm redirect to `/login` and protected pages redirect back to login when opened directly.
