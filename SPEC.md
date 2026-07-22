# Käpylä Maanantai Barbell Club — Member Portal

Member portal for a CrossFit club (~40 members). Like WodConnect, but simpler and better-looking.
UI language: **English**. Mobile-first PWA.

## Stack
- Next.js (App Router) + Tailwind, deployed on Vercel
- Supabase: Postgres, Google OAuth, Storage (whiteboard photos), Row Level Security
- Anthropic API (Claude vision) for whiteboard photo → structured results parsing

## Roles
`member` | `coach` | `admin`. New Google sign-ins create a `pending` profile; coach/admin approves.

## Features (build in this order)
1. **Auth + profiles** — Google sign-in only. Profile: name (required), photo (from Google),
   role, status (pending/active/inactive), joined_at.
2. **Schedule + signups** — Coaches create sessions (date, time, title, WOD description with
   optional `reveal_at` to hide the WOD until day-of, capacity). Recurring weekly templates
   (primary cadence: Sundays). Members sign up / cancel, see attendee list.
3. **Result logging** — One result per (member, session). Score types: time, rounds+reps,
   load, other/text. Rx or scaled flag. Source: `self` or `whiteboard`.
   Dedup rule: member's own entry wins over whiteboard parse; whiteboard parse pre-fills
   for members who haven't logged.
4. **PBs + leaderboards** — Seeded movement catalog (snatch, clean & jerk, clean, jerk,
   front squat, back squat, overhead squat, deadlift, strict press, push press, bench press)
   and benchmark catalog (Fran, Murph, Grace, Cindy, Helen, Diane, Isabel, DT, Karen).
   Per-item visibility toggle: private / club. Logging a result that beats a stored PB
   prompts "update PB?". Leaderboard shows club-visible PBs only.
5. **Whiteboard parsing** — Coach uploads photo attached to a session. Server route sends
   image + that session's signup names + full member roster to Claude, requests strict JSON:
   `{ workout_description, results: [{name_on_board, matched_member_guess, score, rx}] }`.
   Never auto-commit: render a review table (fuzzy matches flagged) → coach confirms → upsert.
6. **Historical import** — see `import/README.md`. Five years of WhatsApp data
   (2021-02 → present): chat log gives session dates + context, 447 photos are mostly
   Sunday whiteboards. Import creates past sessions and whiteboard-sourced results.

## Pages
- `/` week view schedule, tap to sign up
- `/session/[id]` WOD, attendees, results feed, log result
- `/profile/[id]` PBs, history, progress charts (recharts)
- `/leaderboard` per movement/benchmark
- `/coach` sessions CRUD, whiteboard upload + review, member approval

## Theme (from club logo, `public/logo.png`)
Dark charcoal base (#1A1A1A), primary red #E31E24, sunset gradient accents
(#F7941D → #FFC20E), gold #FFC20E for PR badges/highlights. Bold condensed display
font for headings (e.g. Anton or Bebas Neue), clean sans for body. Gorilla logo as
mascot in header, empty states, and PR celebration moments.

## Non-goals (v1)
Payments, push notifications, native apps, multi-club support.
