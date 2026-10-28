# Training Log

Personal climbing training log: tap to log a session (board climb, gym, outside, hangboard, lift…), then see days per week, deload weeks, tweaks and what you've been focusing on. Works offline; with the AWS backend in `infra/` it syncs between devices and only you can read or change it.

```bash
npm install
npm run dev      # http://localhost:5173 (also on your LAN, for testing on a phone)
npm test
npm run build    # static PWA in dist/
```

## How it fits together

- **Sessions** have an activity (climb, hangboard, lift, other), an optional place, a style for climbs (boulder or sport; board climbs are always bouldering), an optional focus (limit, 4x4s, volume, max hangs…), effort 1–5 and a note. A day can have several.
- **Places** have a kind (board, indoor gym, outside, other), so stats can show "outside vs gym vs board" as well as each place.
- **Deloads** are date ranges, usually a Monday–Sunday week marked from the home screen or a calendar day. **Tweaks** are flagged on a day with an area and how bad it is.
- **Weeks start on Monday.** "Days per week" counts days, so a board session and a gym session on the same day is one climbing day.

Code:

- `src/types.ts`, `src/db.ts`: data model (Dexie/IndexedDB) and the defaults seeded on first run.
- `src/lib/sync.ts`: local-first sync. Every change is saved on the device straight away and marked dirty; sync pushes dirty records and pulls everything back, and the newer `updatedAt` wins. Deletes are kept as tombstones so they reach other devices.
- `src/lib/stats.ts`: weekly counts, last deload, breakdowns (tested in `stats.test.ts`).
- `src/lib/transfer.ts`: JSON backup and import, sessions CSV, and **Copy for Claude** (your whole log as text to paste into a chat and ask questions about).
- `src/pages/`: week (home), log sheet, calendar, day, tweak, stats, settings, account.

## Live site

Every push to `main` builds and deploys to GitHub Pages (workflow in `.github/workflows/deploy.yml`). Turn Pages on for the repo with **Settings → Pages → Source: GitHub Actions**.

Install on iPhone: open the site in Safari → Share → Add to Home Screen. Without the server, everything stays on that phone, so export a backup now and then (Settings → Backup).

## Server (optional)

Without a server the app is local-only. With the AWS backend in `infra/`, your log syncs between devices and is owner-only: the Cognito pre sign-up hook rejects every email except yours, and the API checks again on every request.

**AWS pieces** (`infra/lib/stack.ts`, one CloudFormation stack in us-east-1): Cognito user pool, API Gateway HTTP API (verifies sign-in tokens, capped at 10 requests/second) → one Lambda (`infra/lambda/core.ts`, tested in `core.test.ts`) → DynamoDB (on-demand, point-in-time recovery). The data is kept if the stack is deleted. At one person's usage this should stay within the free tier or cost cents a month.

### Deploying (from a computer with your personal AWS profile)

Needs Git, Node.js 22+ and the AWS CLI with a profile named `training`:

```bash
aws configure --profile training
```

Then, from the repo root:

```bash
./infra/deploy.sh
git add src/aws-config.json && git commit -m "Point app at AWS" && git push
```

The script shows which AWS account it will use and waits for `yes`, asks for your email the first time, deploys, and writes `src/aws-config.json` (IDs and URLs only). Pushing that file makes the live site use the server. Rerun the script whenever `infra/` changes. Use a different profile with `PROFILE=name ./infra/deploy.sh`.

Then open the site → **Settings → Sign in → First time? Create the account** with that email. To bring over sessions logged before the server existed: on the old copy, Settings → Backup; on the server version, Settings → Import backup.

### Trying the server version locally

```bash
cd infra && npm install && npm run dev     # stand-in backend on :8787 (real API rules, in-memory data)
npm run dev:server                          # app pointed at it, from the repo root
```

Create the account as `owner@example.com` with any password of 8+ characters. Password reset codes print in the backend's terminal (always `123456`).
