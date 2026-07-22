# Handoff — PRs #3–#6 (Phases 4–6 + profile history)

Context for continuing development. Read `CLAUDE.md` and `SPEC.md` first — this
doc covers what shipped after Phase 3 and the conventions/gotchas that aren't
obvious from the diff. All six SPEC phases are now complete.

## Stack recap
Next.js (App Router) + Tailwind v4 + Supabase (Postgres, Google OAuth, Storage,
RLS) + Anthropic API. Server Components + Server Actions throughout; no client
data-fetching. Secrets in `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`).

## Conventions (follow these)
- **Two Supabase clients.** `lib/supabase/server.ts` `createClient()` = the
  RLS-bound **user** client (use for reads and member self-writes).
  `lib/supabase/admin.ts` `createAdminClient()` = **service-role**, bypasses RLS
  (use for staff writes and anything RLS blocks) — always guard it in the action
  (`requireStaff`, or pin `profile_id` to `auth.getUser()`).
- **Server actions** live in co-located `actions.ts` (or a named file) with
  `"use server"`; forms post to them; call `revalidatePath()` after mutations.
  Interactive ones return state via `useActionState`.
- **`schema.sql` is the source of truth.** Each phase also ships an idempotent
  `supabase/phaseN.sql` to apply the same change to the already-deployed DB via
  the Supabase SQL editor. **All of these have already been run** on the shared
  project (rls, phase2, phase4, phase5, phase6).
- **Theme:** dark charcoal + red/gold, mobile-first (test at 380px). Tokens in
  `app/globals.css` (`heading`, `text-sunset`, `bg-red`, `charcoal-800`, `gold`).
- **Club time is Europe/Helsinki.** All "today"/week/reveal math goes through
  `lib/schedule.ts` — never reason about dates in server UTC.

## Dev-loop gotcha (important)
**Do not run `next build` while `next dev` is running** — both write `.next` and
corrupt each other (you'll see `SegmentViewNode` / `__webpack_modules__` errors).
Stop the dev server, build, then restart it.

---

## PR #3 — Phase 4: PBs + leaderboards
- **Sessions can be tagged** with a movement or benchmark (`sessions.movement_id`
  / `benchmark_id`, `supabase/phase4.sql`). Coaches set it in `SessionForm`.
- **"New PB?" on logging:** when a member logs a result on a tagged session that
  beats their stored PB, `logResult` (`app/session/actions.ts`) returns a prompt;
  `ResultForm` shows a gold "Save PB" button. Never auto-committed.
- **PB comparison** in `lib/pb.ts` (`isBetter`, `parsePbValue`): time = lower
  wins; load / rounds+reps = higher.
- **Profile PBs:** Lifts + Benchmarks with per-item **private ↔ club** visibility
  (`app/profile/[id]/page.tsx`, actions `setPb`/`togglePbVisibility`/`deletePb`,
  owner via RLS `pb_owner_all`).
- **`/leaderboard`** (`app/leaderboard/page.tsx`): pick a movement/benchmark →
  ranked **club-visible** PBs only (RLS `pb_read_club`). Header link added.

## PR #4 — Phase 5: whiteboard parsing
- **`lib/whiteboard.ts`**: Claude vision, model **`claude-opus-4-8`**, base64
  image + **strict structured JSON** via `output_config.format`. Contract:
  `{is_whiteboard, workout_description, results[{name_on_board, matched_member,
  confidence, score, rx}]}`.
- **Flow** (`app/session/[id]/whiteboard.ts`, staff-only): upload photo →
  Storage + vision parse → `whiteboard_uploads` row (`review_status='pending'`) →
  coach review table (`WhiteboardReview`, low-confidence flagged) → **commit**
  upserts `results` (`source='whiteboard'`), skipping members who self-logged
  (self beats whiteboard). Never auto-committed.
- Added `@anthropic-ai/sdk`; `next.config.mjs` server-action `bodySizeLimit` = 10 MB.
- Storage bucket **`whiteboards`** (`supabase/phase5.sql`) — the *live* upload path.

## PR #5 — Phase 6: historical import + schedule UX
- **Unclaimed results:** `results.profile_id` is now **nullable** and there's a
  **`board_name`** column (`supabase/phase6.sql`). A result is either a member's
  (`profile_id` set) or an unclaimed historical row (`board_name` set); a `check`
  enforces one. `claim_results(uid)` (SECURITY DEFINER) attaches unclaimed rows
  to a member by name / first name on signup — wired into `ensureProfile`.
- **`import/backfill.mjs`** (ops tooling; run from repo root, reads `.env.local`):
  - `node import/backfill.mjs scrape` — reads the whiteboard photos already in
    Storage bucket **`whiteboard`** (the historical import's bucket, *singular*),
    parses with **`claude-sonnet-5`**, writes `raw_parse`. Resumable (skips done).
    **Spends API budget** — ask before running.
  - `node import/backfill.mjs load` — rebuilds `source='import'` results as
    unclaimed, then claims to existing members. Idempotent, free.
  - Already run once: 448 photos → 169 whiteboards → **1017 import results**,
    175 auto-claimed.
- **Session feed** renders unclaimed rows (board name, italic, `import` badge).
- **Schedule UX:** a **"Workouts only"** list view (`?view=list`, paginated) next
  to the week grid — collapses empty days/weeks. Session cards carry a `back`
  link so ← Schedule returns to the same week/list page (`weekOffsetFor` in
  `lib/schedule.ts`).

## PR #6 — Profile: training history + claim
- **Training history** on the profile: all results (self/whiteboard/import),
  newest first, linked to sessions.
- **Claim past results** (own profile): unclaimed board names as chips, likely
  matches first; one tap claims every result under that alias (`claimBoardName`).
- **"not me" release** on imported rows back to unclaimed (`releaseResult`), for
  wrong first-name auto-matches. Both actions service-role but pinned to the user.

---

## Known limitations / deferred
- **Progress charts (recharts)** on the profile are **not built** — this is the
  main deferred item; the history data now exists to drive it.
- **Import & whiteboard scores are free-text** (`score_type='text'`) — they show
  in feeds but don't feed PBs/leaderboards. Members self-log for ranking.
- **Two Storage buckets exist:** `whiteboard` (historical import, `sessions/<id>/…`
  paths) and `whiteboards` (live Phase 5). Harmless but worth consolidating.
- **`claim_results` matches on first name** — safe today (few members), but a
  first-name collision could mis-claim as the club grows; the "not me" release is
  the correction valve.

## Never commit
The WhatsApp export, parsed JSONL, and roster (real member PII) — they're
gitignored. `import/backfill.mjs` reads from the DB/Storage, not those files.
