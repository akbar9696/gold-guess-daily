# 🥇 Gold Guess — Guess Today's Gold Close

**Gold Guess** is a daily prediction game for Reddit, built with **Devvit Web (React + Hono + Redis)** for Reddit's **Game of the Day Hackathon** (Devpost, deadline 9 Dec 2026 09:00 WIB).

Every day, players guess what gold (XAU/USD, per troy ounce) will **close** at. One guess per player per day. At midnight UTC the real close is revealed, the closest guesser wins the day, and points feed an all-time leaderboard. Come back tomorrow and guess again — streaks reward the regulars.

> App name: **`gold-guess-daily`**
> Home subreddit: **r/dailygoldguess** (public test subreddit, moderated by u/Reddittt)
> Live price on 26 Nov 2026, verified from the VM: **$3,592.75** (gold-api.com, updated seconds before the check)

## How to play

1. Open the daily post in r/dailygoldguess and tap **Play today's round**.
2. Look at the **live gold spot** (a hint — not the answer) and lock in your guess for today's close. Slider, quick chips (±$10 / ±$50), or type an exact number ($100–$20,000).
3. Your guess is **locked** — one guess per player per day. Share it to the comments and argue your case.
4. Come back after **midnight UTC**: the real close is revealed, yesterday's winner is crowned, and you see exactly how far off you were, your rank, and your streak.
5. **Points:** a perfect hit is 1,000 points, minus 1 point per $1 you're off (floor 0). Points accumulate on the all-time leaderboard; each daily win adds a 👑.

## Why it's fun every day

- **Real stakes, real data** — the answer is the actual gold market, not a random number. Gold moves every day, so no two rounds feel the same.
- **Streaks** — guess consecutive days to build your 🔥 streak. Miss a day and it resets.
- **Leaderboards** — daily (closest guesses yesterday) and all-time (total points + wins).
- **Reddit-y by design** — share your guess to the comments, debate in the thread, and join r/dailygoldguess. The game lives in the post, not in a separate app.

## Tech

- **Client:** React 19 + Tailwind CSS 4 + Vite. Two entrypoints: an inline splash (feed view, shows the live spot) and the expanded game view.
- **Server:** Hono on Devvit Web (`@devvit/web`). All Reddit/Redis access is server-side; the client only calls `/api/*`.
- **Storage (Redis):**
  - `guesses:<YYYY-MM-DD>` — hash of username → guess for that day
  - `gold:close:<YYYY-MM-DD>` — locked-in close for that day
  - `gold:spot` — cached live spot (60 s)
  - `user:<id>` — streak, best diff, total guesses, days played, points, wins
  - `userbyname:<username>` — username → user id (for scoring)
  - `leaderboard:alltime` — sorted set of total points
  - `scored:<YYYY-MM-DD>` — idempotency flag for the reveal job
- **Scheduler** (`devvit.json`): `daily-reveal` at 00:05 UTC locks in the close and scores the day; `daily-post` at 00:10 UTC posts a fresh game for the new day. If a reveal is ever missed, `GET /api/state` finalizes yesterday lazily, so results always appear.
- **Price source:** [gold-api.com](https://api.gold-api.com/price/XAU) — free, no API key, declared in `devvit.json` under `permissions.http.domains`. Verified live on 26 Nov 2026 (`{"price": 3592.75, ...}`, timestamp seconds old). `metals.live` timed out and `goldprice.org` returned 403 the same day, so they are not used.
  - **Fallback:** if the live endpoint is unreachable when a close is locked in, the app uses a deterministic per-date estimate (`fallbackClose` in `src/shared/game.ts`, $3,450–$3,750 band) and labels it **"fallback estimate"** in the UI. It is never presented as a real close.

## Fetch Domains

The following domains are requested for this app:

- `api.gold-api.com` — Used to fetch the live XAU/USD gold spot price (one `GET /price/XAU` call, no API key, no user data sent) that players guess against each day. It is a publicly documented, publicly accessible free API. No other external domain is fetched. If the endpoint is unreachable, the app falls back to a deterministic per-date estimate that is clearly labeled "fallback estimate" in the UI.

## API

| Endpoint | Method | What it does |
|---|---|---|
| `/api/state` | GET | Today/yesterday, live spot, your guess + lock status, yesterday's result, both leaderboards, your stats |
| `/api/guess` | POST | `{ "guess": 3595.50 }` — one guess per player per day (`hSetNX` enforces it, 409 if already locked) |
| `/internal/scheduler/daily-reveal` | POST | Cron 00:05 UTC — finalize close + score the day (idempotent) |
| `/internal/scheduler/daily-post` | POST | Cron 00:10 UTC — create today's post |
| `/internal/menu/post-create` | POST | Moderator menu: "Create a new Gold Guess post" |
| `/internal/triggers/on-app-install` | POST | Creates the first post when the app is installed |

## Develop

Prerequisites: Node.js ≥ 24, Git, npm.

```bash
npm install
npm run build        # vite build (client + server)
npm run test:types   # tsc --build
npm run lint         # eslint
npm run test:unit    # node --test on src/**/*.test.ts
npm run dev          # devvit playtest — needs a logged-in Reddit account
```

Playtest subreddit: **r/dailygoldguess**. Run `npm run dev --subreddit=dailygoldguess`, then open the playtest post it creates.

## Submit (hackathon checklist)

- [ ] App uploaded **private** with `npx devvit upload` (do **not** publish — publish only after the hackathon)
- [ ] App listing at `developers.reddit.com/apps/gold-guess-daily`
- [ ] This README in the app root
- [ ] Demo post in r/dailygoldguess (< 200 members)
- [ ] Devpost submission before **9 Dec 2026 09:00 WIB**

## License

BSD-3-Clause (see `LICENSE`). Template: Reddit's official `devvit-template-react`.
