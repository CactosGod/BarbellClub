# CLAUDE.md — BarbellClub repo

Member portal for Käpylä Maanantai Barbell Club. Read in this order: `CLAUDE.md`
(this file) → `SPEC.md` (features, build order, data model intent, theme) →
`HANDOFF.md` (what shipped in Phases 4–6 + conventions/gotchas).

## Ground rules
- Follow SPEC.md build order; keep each phase shippable before starting the next.
- Stack: Next.js App Router + Tailwind + Supabase (`supabase/schema.sql`) + Anthropic API.
- UI: English only, mobile-first (test at 380px), PWA manifest. Theme colors and fonts
  are specified in SPEC.md §Theme; logo at `public/logo.png`.
- Whiteboard parsing results are NEVER auto-committed — always a coach review step.
- One result per (member, session); self-logged beats whiteboard on conflict.
- Historical data: `import/` has a validated pipeline (parse step already run against
  the real export: 450 candidate sessions, 34-name roster). Vision + load steps need
  ANTHROPIC_API_KEY and Supabase credentials — ask Oskari before spending API budget.
- Secrets live in `.env.local` (never commit): NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
- The WhatsApp export contains personal data of real club members — never commit the
  export, parsed JSONL, or roster to the repo. `.gitignore` them.
