# Rubric — open-source CX / support quality scorecards

A self-hostable **quality-assurance platform for customer-support teams**. QA evaluators score
support tickets, calls and chats against a fully customizable scorecard; the results power
analytics, coaching, disputes, weekly evaluator rotations, targets and automated digests.

Built with **Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres + Auth)**,
deployable to **Vercel** in minutes. Every company-specific value (brand name, login domain,
ticket links, timezone, email) is configured through environment variables and in-app admin
screens — **no code changes required**.

> **Who it's for:** support / CX quality teams, BPOs, and team leads who currently run QA in
> spreadsheets and want a real tool — without paying per-seat SaaS prices or handing their data
> to a third party.

## 🔎 Live demo

**Try it instantly — no install, no login:** **https://aelsayedcs.github.io/rubric/demo/**

An interactive preview with synthetic data: browse evaluations, open a scorecard breakdown, explore
the analytics, and score a ticket live. (The demo is a static mock — the real app is what you self-host.)

---

## Table of contents
- [Features](#features)
- [See it in action](#see-it-in-action)
- [Tech stack](#tech-stack)
- [Quick start (local)](#quick-start-local)
- [Deploy to production (Vercel + Supabase)](#deploy-to-production-vercel--supabase)
- [Configuration reference](#configuration-reference)
- [First-run setup](#first-run-setup)
- [Roles & permissions](#roles--permissions)
- [Scheduled jobs (cron)](#scheduled-jobs-cron)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Dynamic scorecard builder** — create versioned scorecards with attributes/sections and
  sub-criteria, weights, critical items, and per-channel tags (Chat / Call / Tickets). Edit on a
  **draft** and **publish**; historical evaluations stay pinned to the version they were scored
  under. Items that don't apply to the evaluated channel auto-mark as N/A.
- **Evaluations** — score a ticket against the live scorecard with a live-updating score, critical
  handling (any critical fail → 0), duplicate-detection, CSV export, and a self-directing
  "your group this week" panel for evaluators.
- **Analytics** — KPI dashboard, score trends vs. target, channel breakdown, team-lead and agent
  leaderboards, most-failed criteria, and **coaching impact** (before/after score deltas).
- **Insights** — ranked, period-over-period recommendation cards.
- **Disputes** — agent → team-lead → QA workflow with a full decision thread.
- **Coaching** — structured coaching logs (strengths / areas / action plan) emailed to agents,
  with agent acknowledgement.
- **Weekly QA rotation** — split agents into groups, rotate evaluators automatically each week
  (Sun→Sat), with manual per-week overrides and live progress tracking.
- **Targets** — company-wide, per-team-lead, and per-agent goals (most-specific wins).
- **Notifications** — in-app bell + optional email and Slack DMs.
- **Daily digest** — automated end-of-day summary to team leads (their team) and agents (their own),
  via email + optional Slack.
- **Role-based access** — granular roles plus an editable page→role permission matrix.

## See it in action

The fastest way to see the UI is the **[live demo](https://aelsayedcs.github.io/rubric/demo/)** —
it shows the evaluation list with KPI cards, a scorecard breakdown drawer, the analytics dashboard,
the scorecard builder, and the live-scoring form, all on sample data.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, route handlers) + React 19 + TypeScript |
| Styling | Tailwind CSS (glassmorphism theme) |
| Charts | Recharts |
| Database / Auth | Supabase (Postgres with `public` + `qa` schemas, Supabase Auth) |
| Email | Nodemailer over SMTP (optional) |
| Hosting | Vercel (with cron jobs) |

---

## Quick start (local)

**Prerequisites:** Node.js 20+, a package manager (this repo ships a `pnpm-lock.yaml`; `npm`
works too), and a free [Supabase](https://supabase.com) project.

```bash
# 1. Clone
git clone https://github.com/aelsayedcs/rubric && cd rubric

# 2. Install dependencies
pnpm install        # or: npm install

# 3. Configure environment
cp .env.example .env.local
#    → fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#      SUPABASE_SERVICE_ROLE_KEY, and your branding values (see reference below)

# 4. Set up the database
#    In the Supabase dashboard → SQL Editor → paste the contents of
#    supabase/setup.sql and Run. This creates all tables and seeds a
#    generic sample scorecard + sample team.

# 5. Run
pnpm dev            # or: npm run dev
#    → open http://localhost:3000
```

That's it — the app runs on generic sample data out of the box.

---

## Deploy to production (Vercel + Supabase)

1. **Create a Supabase project.** Copy its URL, anon key, and service-role key
   (Project Settings → API).
2. **Run the schema.** SQL Editor → paste `supabase/setup.sql` → Run.
3. **Import to Vercel.** New Project → import your Git repo. Framework auto-detects as Next.js.
4. **Add environment variables** in Vercel → Project → Settings → Environment Variables
   (same keys as your `.env.local` — see the [reference](#configuration-reference) below).
5. **Deploy.** Vercel builds and hosts it. Point your custom domain at the project if you have one,
   and set `NEXT_PUBLIC_APP_URL` to that URL.
6. **Cron jobs** ship in `vercel.json` and activate automatically on Vercel. See
   [Scheduled jobs](#scheduled-jobs-cron) to adjust the times for your timezone.

> A one-click **Deploy to Vercel** button can be added once your repo is public — see
> [Vercel's deploy-button docs](https://vercel.com/docs/deployments/deploy-button).

---

## Configuration reference

Copy `.env.example` → `.env.local` (local) and add the same variables in Vercel (production).
Anything prefixed `NEXT_PUBLIC_` is exposed to the browser; everything else is server-only.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_COMPANY_NAME` | recommended | Brand name in the header, page titles and emails. |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | optional | Restrict sign-in/registration to this domain. **Blank = allow any email.** |
| `NEXT_PUBLIC_APP_URL` | yes | App base URL (used in email links). `http://localhost:3000` for dev. |
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Supabase anon (public) key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase service-role key (server-only secret). |
| `AUTH_COOKIE_DOMAIN` | optional | Leave blank for a standalone deploy. |
| `EMAIL_SMTP_HOST` / `PORT` / `USER` / `PASS` | optional | SMTP for outgoing mail. If unset, email is skipped. |
| `EMAIL_FROM` | optional | From name/address for outgoing mail. |
| `EMAIL_CC_SUPPORT_LEADS` | optional | Comma-separated CC list on team-lead digests. |
| `NEXT_PUBLIC_TICKET_URL_TEMPLATE` | optional | Base URL a ticket number is appended to for deep-links. Blank = plain text. |
| `DIGEST_TZ` | optional | IANA timezone for digest send time **and** weekly rotation boundaries. Default `UTC`. |
| `SLACK_BOT_TOKEN` | optional | Slack bot token (`chat:write`, `users:read.email`) for DMs. If unset, Slack is skipped. |
| `CRON_SECRET` | recommended | Bearer secret protecting the `/api/cron/*` endpoints. |
| `SUPABASE_DB_URL` / `QA_XLSX_PATH` | optional | Only for the legacy data-import scripts in `supabase/etl/`. |

The app runs with only the three **Supabase** keys set — everything else has safe defaults.

---

## First-run setup

Once your Supabase env vars are set, just open **`/setup`** — a guided wizard walks you through it:

1. **Connect** — confirms your Supabase connection (with a live check).
2. **Database** — links you to the SQL editor to run `supabase/setup.sql`, then verifies the tables.
3. **Branding** — company name, login domain, ticket links, timezone (saved to the database).
4. **Admin** — creates your administrator account.

The wizard locks itself once an admin exists. A step-by-step **[`/setup/guide`](src/app/setup/guide)** page
explains where to find each Supabase value. (Prefer SQL? The bottom of `supabase/setup.sql` has a
manual admin-bootstrap block.)

Then **build your structure in-app** (no SQL needed):
   - **Team** (`/team`) — add your agents and team leads (replace the sample team).
   - **Scorecards** (`/admin/scorecards`) — edit or replace the sample scorecard; add attributes,
     criteria, weights, critical items and per-channel tags, then **Publish**.
   - **Assignments** (`/assignments`) — set up groups and the weekly evaluator rotation pool.
   - **Targets** (`/admin/targets`) — set company / team / agent goals.
   - **Access** (`/admin/access`) and **Permissions** (`/permissions`) — invite users, assign roles,
     and tune which roles see which pages.

The sample scorecard and sample team are only starting examples — everything is editable at runtime.

---

## Roles & permissions

Roles are stored per user in `public.app_access` (for the `quality` app). From most to least
privileged:

| Role | Can do |
|---|---|
| `system_owner` / `system_admin` | Everything; always see all pages; edit the permission matrix. |
| `super_admin` / `admin` | QA-staff surface + team/settings/access management. |
| `qa_evaluator` | Create/edit/delete evaluations, coach, manage targets & assignments. |
| `team_lead` | View their team, coach, raise disputes for their team. |
| `agent` | View own evaluations, raise disputes on their own, acknowledge coaching. |
| `viewer` | Read-only. |

Access is enforced in two layers: the editable **`page_access` matrix** (nav visibility + page
guards) and **per-route role checks** in the API handlers. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Scheduled jobs (cron)

Configured in `vercel.json` and protected by `CRON_SECRET`:

- **`/api/cron/daily-digest`** — end-of-day summary to team leads and agents (email + optional Slack).
- **`/api/cron/target-misses`** — weekly notice to team leads about agents below target.

Vercel cron schedules are in **UTC**. Adjust the cron times in `vercel.json` to whatever local hour
you want the jobs to run, and set `DIGEST_TZ` (default `UTC`) so the digest contents and the weekly
rotation boundaries use your local calendar.

---

## Project structure

```
src/
  app/            Next.js routes — pages + API route handlers (api/**/route.ts)
  components/     React components (drawers, modals, nav, charts…)
  lib/            auth, supabase clients, scoring, email, slack, config
supabase/
  migrations/     numbered SQL (001–020) — the source of truth for the schema
  setup.sql       all migrations bundled — paste into the Supabase SQL Editor
  etl/            optional one-time data-import / migration-runner scripts
docs/             DATA-MODEL.md — full database schema reference
demo/             self-contained static demo (GitHub Pages)
.env.example      every configurable variable, documented
```

## Documentation

- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — the full database schema: tables, enums, the
  `qa.analysis()` RPC, RLS, FK behaviors, and migration history. Everything else is documented
  inline in the code and in [`.env.example`](.env.example).

## Contributing

Contributions are welcome. Please open an issue to discuss substantial changes first.
Run `pnpm build` (or `npm run build`) before submitting — the build must pass.

## License

See [`LICENSE`](LICENSE). _(AGPL-3.0 is recommended for an open-core project like this — add a
`LICENSE` file with your chosen license before publishing.)_
